// PERFORMANCE-v1: pure analytics over the Journal's CLOSED trades. Read-only: no storage, no network, no Investor data.
// Every figure is net realized P&L after fees, in USDT, taken from the Journal's own helpers, so the equity curve ends
// exactly at computeDashboard().realizedPnl (when no filter is active). A trade whose position was fully sold in parts is
// closed by the Journal with a weighted-average exit, so its P&L is already counted once; open trades with partial exits
// are NOT part of these metrics (the Journal shows them as "Partial realized").
import { plannedLoss, realizedPnl, roiPct, statusOf, type Trade } from "@/lib/journal";

export type PerfOptions = {
  /** Inclusive close-date range, YYYY-MM-DD. */
  from?: string | null;
  to?: string | null;
  /** Include trades the Journal auto-closed at the stop price (an estimate, not a fill). Default true. */
  includeEstimated?: boolean;
  /** Optional starting equity (USDT). Only used for the drawdown percentage. */
  startingEquity?: number | null;
};

export type ClosedTrade = {
  trade: Trade;
  pnl: number;
  /** Net return on invested capital in %, or null. */
  roi: number | null;
  /** YYYY-MM-DD the trade is placed on in the curve: its exit date, or its entry date for legacy trades. */
  closeDate: string;
  /** True when the exit date was missing and the entry date was used (legacy trade). */
  approxDate: boolean;
  /** True for an automatic stop exit whose price was never replaced by the member's real fill. */
  estimated: boolean;
  coin: string;
  month: string;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const QUOTES = ["FDUSD", "USDT", "USDC", "BUSD"];

/** "BTC/USDT", "btc-usdt", "BTCUSDT" and "BTC" all become "BTC". Only a trailing quote asset is removed. */
export function normalizeCoin(pair: string | null | undefined): string {
  const s = String(pair ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s) return "—";
  for (const q of QUOTES) if (s.length > q.length && s.endsWith(q)) return s.slice(0, -q.length);
  return s;
}

export const isEstimatedExit = (t: Trade): boolean => t.exitSource === "auto-sl" && !t.autoSl?.correctedAt;

/** Closed trades with a net P&L, in curve order: close date, then last update, then entry date, then id (stable). */
export function closedTrades(trades: Trade[], opts: PerfOptions = {}): ClosedTrade[] {
  const out: (ClosedTrade & { i: number })[] = [];
  trades.forEach((trade, i) => {
    if (statusOf(trade) !== "closed") return;
    const pnl = realizedPnl(trade);
    if (pnl === null || !Number.isFinite(pnl)) return;
    const hasExit = typeof trade.exitDate === "string" && DATE.test(trade.exitDate);
    const closeDate = hasExit ? (trade.exitDate as string) : trade.date;
    const estimated = isEstimatedExit(trade);
    if (opts.includeEstimated === false && estimated) return;
    if (opts.from && closeDate < opts.from) return;
    if (opts.to && closeDate > opts.to) return;
    out.push({ trade, pnl, roi: roiPct(trade), closeDate, approxDate: !hasExit, estimated, coin: normalizeCoin(trade.pair), month: closeDate.slice(0, 7), i });
  });
  out.sort((a, b) =>
    a.closeDate.localeCompare(b.closeDate) ||
    (a.trade.updatedAt ?? 0) - (b.trade.updatedAt ?? 0) ||
    (a.trade.date || "").localeCompare(b.trade.date || "") ||
    a.trade.id.localeCompare(b.trade.id) ||
    a.i - b.i);
  return out.map(({ i: _i, ...rest }) => { void _i; return rest; });
}

export type ProfitFactor = { value: number | null; grossProfit: number; grossLoss: number };
/** Gross profit / gross loss. null ("n/a") when there is no losing trade; breakeven trades count in neither sum. */
export function profitFactor(c: ClosedTrade[]): ProfitFactor {
  const grossProfit = c.reduce((s, x) => (x.pnl > 0 ? s + x.pnl : s), 0);
  const grossLoss = c.reduce((s, x) => (x.pnl < 0 ? s - x.pnl : s), 0);
  return { value: grossLoss > 0 ? grossProfit / grossLoss : null, grossProfit, grossLoss };
}

export type Expectancy = { usd: number | null; pct: number | null };
/** Average net result per closed trade (breakeven trades stay in the denominator). pct = mean return on invested capital. */
export function expectancy(c: ClosedTrade[]): Expectancy {
  if (!c.length) return { usd: null, pct: null };
  const usd = c.reduce((s, x) => s + x.pnl, 0) / c.length;
  const rois = c.map((x) => x.roi).filter((r): r is number => r !== null && Number.isFinite(r));
  return { usd, pct: rois.length ? rois.reduce((s, r) => s + r, 0) / rois.length : null };
}

export type RStats = { avg: number | null; included: number; excluded: number; estimatedIncluded: number };
/** R = net P&L / planned loss at the CURRENT stop (the Journal keeps no original stop; the stop can be edited later). */
export function rMultiples(c: ClosedTrade[]): RStats {
  const rs: { r: number; est: boolean }[] = [];
  for (const x of c) {
    const risk = plannedLoss(x.trade);
    if (risk !== null && risk > 0) rs.push({ r: x.pnl / risk, est: x.estimated });
  }
  return {
    avg: rs.length ? rs.reduce((s, x) => s + x.r, 0) / rs.length : null,
    included: rs.length,
    excluded: c.length - rs.length,
    estimatedIncluded: rs.filter((x) => x.est).length,
  };
}

export type CurvePoint = { n: number; date: string; pnl: number; equity: number; peak: number; drawdown: number; approx: boolean; estimated: boolean; pair: string };
/** Cumulative net realized P&L, starting at 0. drawdown is the (positive) distance below the running peak. */
export function equityCurve(c: ClosedTrade[]): CurvePoint[] {
  let eq = 0, peak = 0;
  return c.map((x, i) => {
    eq += x.pnl;
    peak = Math.max(peak, eq);
    return { n: i + 1, date: x.closeDate, pnl: x.pnl, equity: eq, peak, drawdown: peak - eq, approx: x.approxDate, estimated: x.estimated, pair: x.coin };
  });
}

export type Drawdown = { usd: number; pct: number | null; peakN: number; troughN: number; peakDate: string | null; troughDate: string | null };
/** Largest peak-to-trough fall of the curve (the peak starts at 0). pct only with a positive starting equity: dd / (start + peak). */
export function maxDrawdown(curve: CurvePoint[], startingEquity?: number | null): Drawdown {
  let best: CurvePoint | null = null;
  for (const p of curve) if (p.drawdown > 0 && (!best || p.drawdown > best.drawdown)) best = p;
  if (!best) return { usd: 0, pct: null, peakN: 0, troughN: 0, peakDate: null, troughDate: null };
  const b = best;
  let peakN = 0;
  for (const p of curve) { if (p.n > b.n) break; if (p.equity === b.peak) peakN = p.n; }
  if (b.peak === 0) peakN = 0;
  const base = startingEquity && startingEquity > 0 ? startingEquity + b.peak : 0;
  return {
    usd: b.drawdown,
    pct: base > 0 ? (b.drawdown / base) * 100 : null,
    peakN, troughN: b.n,
    peakDate: peakN ? curve[peakN - 1].date : null,
    troughDate: b.date,
  };
}

export type Streaks = { maxWin: number; maxLoss: number; current: { type: "win" | "loss" | "none"; length: number } };
/** Win = net > 0, loss = net < 0. A breakeven trade (exactly 0) ends both streaks. Order = curve order. */
export function streaks(c: ClosedTrade[]): Streaks {
  let maxWin = 0, maxLoss = 0, w = 0, l = 0;
  for (const x of c) {
    if (x.pnl > 0) { w++; l = 0; } else if (x.pnl < 0) { l++; w = 0; } else { w = 0; l = 0; }
    maxWin = Math.max(maxWin, w);
    maxLoss = Math.max(maxLoss, l);
  }
  return { maxWin, maxLoss, current: w ? { type: "win", length: w } : l ? { type: "loss", length: l } : { type: "none", length: 0 } };
}

export type GroupRow = { key: string; trades: number; wins: number; losses: number; winRate: number; pnl: number; avgReturn: number | null };
export type GroupKey = "key" | "trades" | "winRate" | "pnl" | "avgReturn";

function group(c: ClosedTrade[], by: (x: ClosedTrade) => string): GroupRow[] {
  const m = new Map<string, ClosedTrade[]>();
  for (const x of c) { const k = by(x); (m.get(k) ?? m.set(k, []).get(k)!).push(x); }
  return [...m.entries()].map(([key, xs]) => {
    const wins = xs.filter((x) => x.pnl > 0).length;
    const rois = xs.map((x) => x.roi).filter((r): r is number => r !== null && Number.isFinite(r));
    return {
      key, trades: xs.length, wins, losses: xs.filter((x) => x.pnl < 0).length,
      winRate: (wins / xs.length) * 100,
      pnl: xs.reduce((s, x) => s + x.pnl, 0),
      avgReturn: rois.length ? rois.reduce((s, r) => s + r, 0) / rois.length : null,
    };
  });
}
export const byCoin = (c: ClosedTrade[]): GroupRow[] => group(c, (x) => x.coin);
export const byMonth = (c: ClosedTrade[]): GroupRow[] => group(c, (x) => x.month);

/** Sorted copy. Rows without a value (avgReturn null) always go last. Ties fall back to the key for a stable order. */
export function sortRows(rows: GroupRow[], by: GroupKey, desc: boolean): GroupRow[] {
  const dir = desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (by === "key") return dir * a.key.localeCompare(b.key);
    const x = a[by], y = b[by];
    if (x === null && y === null) return a.key.localeCompare(b.key);
    if (x === null) return 1;
    if (y === null) return -1;
    return dir * (x - y) || a.key.localeCompare(b.key);
  });
}

export type Performance = {
  closed: ClosedTrade[];
  count: number;
  netPnl: number;
  profitFactor: ProfitFactor;
  expectancy: Expectancy;
  r: RStats;
  curve: CurvePoint[];
  drawdown: Drawdown;
  streaks: Streaks;
  coins: GroupRow[];
  months: GroupRow[];
  /** Trades placed on their entry date because they have no exit date. */
  legacyCount: number;
  /** Trades closed automatically at the stop price (estimates) inside the current selection. */
  estimatedCount: number;
};

export function computePerformance(trades: Trade[], opts: PerfOptions = {}): Performance {
  const closed = closedTrades(trades, opts);
  const curve = equityCurve(closed);
  return {
    closed,
    count: closed.length,
    netPnl: curve.length ? curve[curve.length - 1].equity : 0,
    profitFactor: profitFactor(closed),
    expectancy: expectancy(closed),
    r: rMultiples(closed),
    curve,
    drawdown: maxDrawdown(curve, opts.startingEquity),
    streaks: streaks(closed),
    coins: byCoin(closed),
    months: byMonth(closed),
    legacyCount: closed.filter((x) => x.approxDate).length,
    estimatedCount: closed.filter((x) => x.estimated).length,
  };
}
