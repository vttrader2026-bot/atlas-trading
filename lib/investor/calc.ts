// ATLAS INVESTOR V1: holdings, average cost, realized and unrealized PnL, cash and allocation. Pure functions.
//
// Method: AVERAGE COST, processed in date order (purchases before sales on the same day).
//  - A purchase adds qty and (qty x price + fee) to the cost basis: purchase fees are part of the cost.
//  - A sale removes qty at the CURRENT average cost. Realized PnL = (qty x price - fee) - removed cost: selling fees reduce proceeds.
//  - A partial sale reduces remaining quantity and remaining cost basis proportionally. The average price is unchanged,
//    and realized PnL is kept forever, even after the position reaches zero.
//  - Cash = deposits - withdrawals - purchase costs + sale proceeds. Sale proceeds enter cash ONLY here, once; the ledger
//    cannot contain sales, so they cannot be counted twice.
import { assetOf, TICKERS } from "./assets";
import { InvestorDoc, Purchase, Sale, purchaseCost, r8, saleProceeds } from "./model";

export type Position = {
  asset: string;
  qty: number;
  /** Cost of what is still held, purchase fees included. */
  costBasis: number;
  /** Same, without fees (qty x price only). */
  grossCost: number;
  avgPrice: number;
  avgPriceExFees: number;
  realizedPnl: number;
  totalBought: number;
  totalSoldProceeds: number;
  firstDate: string | null;
};

type Tx = { kind: "buy"; at: Purchase; order: number } | { kind: "sell"; at: Sale; order: number };

const EPS = 1e-9;

function ordered(doc: Pick<InvestorDoc, "purchases" | "sales">): Tx[] {
  const all: Tx[] = [
    ...doc.purchases.map((p, i): Tx => ({ kind: "buy", at: p, order: i })),
    ...doc.sales.map((s, i): Tx => ({ kind: "sell", at: s, order: 1e6 + i })),
  ];
  return all.sort((a, b) => a.at.date.localeCompare(b.at.date) || (a.kind === b.kind ? a.order - b.order : a.kind === "buy" ? -1 : 1));
}

const blank = (asset: string): Position => ({ asset, qty: 0, costBasis: 0, grossCost: 0, avgPrice: 0, avgPriceExFees: 0, realizedPnl: 0, totalBought: 0, totalSoldProceeds: 0, firstDate: null });

export type LedgerIssue = { saleId: string; asset: string; date: string; held: number; wanted: number };

/** Walks the ledger once. `issue` is set when a sale is larger than what was held on that date. */
export function computePositions(doc: Pick<InvestorDoc, "purchases" | "sales">, upTo?: string): { positions: Map<string, Position>; issue: LedgerIssue | null } {
  const positions = new Map<string, Position>();
  let issue: LedgerIssue | null = null;
  for (const tx of ordered(doc)) {
    if (upTo && tx.at.date > upTo) continue;
    const p = positions.get(tx.at.asset) ?? blank(tx.at.asset);
    positions.set(tx.at.asset, p);
    p.firstDate ??= tx.at.date;
    if (tx.kind === "buy") {
      p.qty = r8(p.qty + tx.at.qty);
      p.costBasis = r8(p.costBasis + purchaseCost(tx.at));
      p.grossCost = r8(p.grossCost + tx.at.qty * tx.at.price);
      p.totalBought = r8(p.totalBought + purchaseCost(tx.at));
    } else {
      const s = tx.at;
      if (s.qty > p.qty + EPS) {
        issue ??= { saleId: s.id, asset: s.asset, date: s.date, held: p.qty, wanted: s.qty };
        continue; // an impossible sale changes nothing; the API refuses such a document
      }
      const fraction = p.qty > 0 ? Math.min(1, s.qty / p.qty) : 0;
      const removedCost = r8(p.costBasis * fraction);
      const removedGross = r8(p.grossCost * fraction);
      const proceeds = saleProceeds(s);
      p.realizedPnl = r8(p.realizedPnl + proceeds - removedCost);
      p.totalSoldProceeds = r8(p.totalSoldProceeds + proceeds);
      p.qty = r8(p.qty - s.qty);
      p.costBasis = r8(p.costBasis - removedCost);
      p.grossCost = r8(p.grossCost - removedGross);
      if (p.qty <= EPS) { p.qty = 0; p.costBasis = 0; p.grossCost = 0; }
    }
    p.avgPrice = p.qty > 0 ? p.costBasis / p.qty : 0;
    p.avgPriceExFees = p.qty > 0 ? p.grossCost / p.qty : 0;
  }
  return { positions, issue };
}

/** First sale that exceeds the quantity held on its date, or null when the ledger is consistent. */
export const ledgerIssue = (doc: Pick<InvestorDoc, "purchases" | "sales">) => computePositions(doc).issue;

/** What a sale would do, before it is saved: used by the Sell form. `doc` should NOT contain the sale being edited. */
export function previewSale(doc: Pick<InvestorDoc, "purchases" | "sales">, asset: string, date: string, qty: number, price: number, fee: number) {
  const p = computePositions(doc, date).positions.get(asset);
  const held = p?.qty ?? 0;
  const proceeds = r8(qty * price - fee);
  const fraction = held > 0 ? Math.min(1, qty / held) : 0;
  const removedCost = r8((p?.costBasis ?? 0) * fraction);
  return { held, proceeds, removedCost, realized: r8(proceeds - removedCost), exceeds: qty > held + EPS };
}

export function cashBalance(doc: Pick<InvestorDoc, "purchases" | "sales" | "cash">): number {
  const deposits = doc.cash.filter((c) => c.type === "deposit").reduce((a, c) => a + c.amount, 0);
  const withdrawals = doc.cash.filter((c) => c.type === "withdrawal").reduce((a, c) => a + c.amount, 0);
  const spent = doc.purchases.reduce((a, p) => a + purchaseCost(p), 0);
  const received = doc.sales.reduce((a, s) => a + saleProceeds(s), 0);
  return r8(deposits - withdrawals - spent + received);
}

export type PriceSource = "binance" | "manual";
export type PriceInfo = { price: number; source: PriceSource; at?: string };
export type PriceMap = Record<string, PriceInfo | null>;

/** Live Binance price wins; otherwise the user's manual price; otherwise null (unavailable). `live` is keyed by pair, e.g. BTCUSDT. */
export function resolvePrices(live: Record<string, { lastPrice: string } | undefined>, manual: InvestorDoc["manualPrices"]): PriceMap {
  const out: PriceMap = {};
  for (const t of TICKERS) {
    const l = parseFloat(live[`${t}USDT`]?.lastPrice ?? "");
    if (Number.isFinite(l) && l > 0) out[t] = { price: l, source: "binance" };
    else if (manual[t]) out[t] = { price: manual[t].price, source: "manual", at: manual[t].at };
    else out[t] = null;
  }
  return out;
}

export type HoldingRow = Position & { name: string; price: PriceInfo | null; value: number | null; unrealized: number | null; roiPct: number | null; allocationPct: number | null };

export type Summary = {
  holdings: HoldingRow[];
  closed: Position[];
  /** Cost basis of everything currently held. */
  invested: number;
  /** Value of held assets that have a price. */
  value: number;
  /** Unrealized PnL and ROI cover priced assets only (so a missing price never fakes a loss). */
  unrealized: number;
  roiPct: number | null;
  realized: number;
  cash: number;
  missingPrices: string[];
  usesManualPrices: boolean;
  totalBought: number;
  ledgerIssue: LedgerIssue | null;
};

export function summarize(doc: InvestorDoc, prices: PriceMap): Summary {
  const { positions, issue } = computePositions(doc);
  const held = [...positions.values()].filter((p) => p.qty > 0);
  const closed = [...positions.values()].filter((p) => p.qty === 0 && (p.totalBought > 0));
  const rows: HoldingRow[] = held.map((p) => {
    const price = prices[p.asset] ?? null;
    const value = price ? r8(p.qty * price.price) : null;
    const unrealized = value === null ? null : r8(value - p.costBasis);
    return { ...p, name: assetOf(p.asset)?.name ?? p.asset, price, value, unrealized, roiPct: unrealized === null || p.costBasis <= 0 ? null : (unrealized / p.costBasis) * 100, allocationPct: null };
  });
  const priced = rows.filter((r) => r.value !== null);
  const value = r8(priced.reduce((a, r) => a + (r.value ?? 0), 0));
  const pricedCost = r8(priced.reduce((a, r) => a + r.costBasis, 0));
  for (const r of rows) r.allocationPct = r.value !== null && value > 0 ? (r.value / value) * 100 : null;
  rows.sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  const unrealized = r8(value - pricedCost);
  return {
    holdings: rows,
    closed,
    invested: r8(rows.reduce((a, r) => a + r.costBasis, 0)),
    value,
    unrealized,
    roiPct: pricedCost > 0 ? (unrealized / pricedCost) * 100 : null,
    realized: r8([...positions.values()].reduce((a, p) => a + p.realizedPnl, 0)),
    cash: cashBalance(doc),
    missingPrices: rows.filter((r) => r.value === null).map((r) => r.asset),
    usesManualPrices: priced.some((r) => r.price?.source === "manual"),
    totalBought: r8([...positions.values()].reduce((a, p) => a + p.totalBought, 0)),
    ledgerIssue: issue,
  };
}
