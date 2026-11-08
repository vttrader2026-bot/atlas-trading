// ATLAS INVESTOR V1: data model and validation. Completely separate from the Trading Journal (shares no code with it).
// Manual recording only: nothing here talks to an exchange.
import { isSupportedTicker } from "./assets";

/** Quote currency of the Binance pair the user traded. Both are treated as 1 USD. Only used to pick the fee rate. */
export type Quote = "USDT" | "USDC";
export type Purchase = { id: string; asset: string; date: string; qty: number; price: number; fee: number; quote?: Quote; note?: string; planId?: string; slot?: string };
export type Sale = { id: string; asset: string; date: string; qty: number; price: number; fee: number; quote?: Quote; note?: string };
/** Cash ledger holds ONLY deposits and withdrawals. Purchases and sales move cash through their own records, never through here. */
export type CashEntry = { id: string; date: string; type: "deposit" | "withdrawal"; amount: number; note?: string };

export type Frequency = "weekly" | "biweekly" | "monthly";
export type DcaPlan = {
  id: string;
  name: string;
  asset: string;
  budget: number;
  initial: number;
  recurring: { amount: number; frequency: Frequency; startDate: string; count: number };
  dips: { dropPct: number; amount: number }[];
  refPrice: number;
  createdAt: string;
};
export type ManualPrice = { price: number; at: string };

export type InvestorDoc = {
  /** Increases by one on every save. A save based on an older revision is refused instead of overwriting newer data. */
  revision: number;
  purchases: Purchase[];
  sales: Sale[];
  cash: CashEntry[];
  plans: DcaPlan[];
  manualPrices: Record<string, ManualPrice>;
  /** "Pay fees with BNB" switch (25% off Binance spot fees). Applies to new records; saved records keep the fee they were created with. */
  bnbDiscount: boolean;
};

export const emptyDoc = (): InvestorDoc => ({ revision: 0, purchases: [], sales: [], cash: [], plans: [], manualPrices: {}, bnbDiscount: false });

export const LIMITS = { records: 5000, cash: 2000, plans: 50, note: 200, dips: 10, recurringCount: 520, maxValue: 1e12 } as const;

/** Round to 8 decimals: enough for any crypto quantity, and stops 0.1 + 0.2 style drift. */
export const r8 = (n: number) => Math.round((n + Number.EPSILON) * 1e8) / 1e8;

export const purchaseCost = (p: Pick<Purchase, "qty" | "price" | "fee">) => r8(p.qty * p.price + p.fee);
export const saleProceeds = (s: Pick<Sale, "qty" | "price" | "fee">) => r8(s.qty * s.price - s.fee);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function validDate(s: unknown, now = Date.now()): s is string {
  if (typeof s !== "string" || !DATE.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== s) return false;
  return t >= Date.parse("2009-01-01T00:00:00Z") && t <= now + 2 * 86_400_000;
}

const num = (v: unknown, { min = 0, minExclusive = false }: { min?: number; minExclusive?: boolean } = {}): number | null => {
  if (typeof v !== "number" || !Number.isFinite(v) || v > LIMITS.maxValue) return null;
  if (minExclusive ? v <= min : v < min) return null;
  return r8(v);
};
const str = (v: unknown, max: number): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const id = (v: unknown): string | null => (typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null);
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export type ParseResult = { ok: true; doc: InvestorDoc } | { ok: false; error: string };
const fail = (error: string): ParseResult => ({ ok: false, error });

function unique(ids: string[]): boolean {
  return new Set(ids).size === ids.length;
}

/** Strict validation. Anything unsupported (unknown coin, bad number, bad date) rejects the whole document. */
export function parseDoc(raw: unknown, now = Date.now()): ParseResult {
  if (!obj(raw)) return fail("Invalid investor data");
  const revision = typeof raw.revision === "number" && Number.isInteger(raw.revision) && raw.revision >= 0 ? raw.revision : null;
  if (revision === null) return fail("Invalid revision");
  const list = (k: string, max: number) => (Array.isArray(raw[k]) && (raw[k] as unknown[]).length <= max ? (raw[k] as unknown[]) : null);
  const purchasesRaw = list("purchases", LIMITS.records);
  const salesRaw = list("sales", LIMITS.records);
  const cashRaw = list("cash", LIMITS.cash);
  const plansRaw = list("plans", LIMITS.plans);
  if (!purchasesRaw || !salesRaw || !cashRaw || !plansRaw) return fail("Invalid or oversized lists");
  if (purchasesRaw.length + salesRaw.length > LIMITS.records) return fail("Too many records");

  const purchases: Purchase[] = [];
  for (const x of purchasesRaw) {
    if (!obj(x)) return fail("Invalid purchase");
    const pid = id(x.id), qty = num(x.qty, { minExclusive: true }), price = num(x.price, { minExclusive: true }), fee = num(x.fee ?? 0);
    if (!pid || !isSupportedTicker(x.asset) || !validDate(x.date, now) || qty === null || price === null || fee === null) return fail("Invalid purchase");
    const p: Purchase = { id: pid, asset: x.asset, date: x.date, qty, price, fee };
    const note = str(x.note, LIMITS.note); if (note) p.note = note;
    if (x.quote !== undefined) { if (x.quote !== "USDT" && x.quote !== "USDC") return fail("Invalid purchase"); p.quote = x.quote; }
    if (x.planId !== undefined) { const pl = id(x.planId); if (!pl) return fail("Invalid purchase"); p.planId = pl; }
    if (x.slot !== undefined) { const sl = str(x.slot, 20); if (!sl) return fail("Invalid purchase"); p.slot = sl; }
    purchases.push(p);
  }
  const sales: Sale[] = [];
  for (const x of salesRaw) {
    if (!obj(x)) return fail("Invalid sale");
    const sid = id(x.id), qty = num(x.qty, { minExclusive: true }), price = num(x.price, { minExclusive: true }), fee = num(x.fee ?? 0);
    if (!sid || !isSupportedTicker(x.asset) || !validDate(x.date, now) || qty === null || price === null || fee === null) return fail("Invalid sale");
    const s: Sale = { id: sid, asset: x.asset, date: x.date, qty, price, fee };
    const note = str(x.note, LIMITS.note); if (note) s.note = note;
    if (x.quote !== undefined) { if (x.quote !== "USDT" && x.quote !== "USDC") return fail("Invalid sale"); s.quote = x.quote; }
    sales.push(s);
  }
  const cash: CashEntry[] = [];
  for (const x of cashRaw) {
    if (!obj(x)) return fail("Invalid cash entry");
    const cid = id(x.id), amount = num(x.amount, { minExclusive: true });
    if (!cid || (x.type !== "deposit" && x.type !== "withdrawal") || !validDate(x.date, now) || amount === null) return fail("Invalid cash entry");
    const c: CashEntry = { id: cid, date: x.date, type: x.type, amount };
    const note = str(x.note, LIMITS.note); if (note) c.note = note;
    cash.push(c);
  }
  const plans: DcaPlan[] = [];
  for (const x of plansRaw) {
    if (!obj(x) || !obj(x.recurring) || !Array.isArray(x.dips) || x.dips.length > LIMITS.dips) return fail("Invalid plan");
    const pid = id(x.id), name = str(x.name, 60), budget = num(x.budget, { minExclusive: true }), initial = num(x.initial), refPrice = num(x.refPrice, { minExclusive: true });
    const r = x.recurring;
    const amount = num(r.amount), count = typeof r.count === "number" && Number.isInteger(r.count) && r.count >= 0 && r.count <= LIMITS.recurringCount ? r.count : null;
    if (!pid || !name || !isSupportedTicker(x.asset) || budget === null || initial === null || refPrice === null || amount === null || count === null) return fail("Invalid plan");
    if (r.frequency !== "weekly" && r.frequency !== "biweekly" && r.frequency !== "monthly") return fail("Invalid plan");
    if (!validDate(r.startDate, now + 5 * 365 * 86_400_000) || typeof x.createdAt !== "string" || x.createdAt.length > 40) return fail("Invalid plan");
    const dips: DcaPlan["dips"] = [];
    for (const d of x.dips) {
      if (!obj(d)) return fail("Invalid plan");
      const dropPct = num(d.dropPct, { minExclusive: true }), da = num(d.amount, { minExclusive: true });
      if (dropPct === null || dropPct >= 100 || da === null) return fail("Invalid plan");
      dips.push({ dropPct, amount: da });
    }
    plans.push({ id: pid, name, asset: x.asset, budget, initial, recurring: { amount, frequency: r.frequency, startDate: r.startDate, count }, dips, refPrice, createdAt: x.createdAt });
  }
  const manualPrices: Record<string, ManualPrice> = {};
  if (!obj(raw.manualPrices)) return fail("Invalid prices");
  for (const [k, v] of Object.entries(raw.manualPrices)) {
    if (!isSupportedTicker(k) || !obj(v)) return fail("Invalid prices");
    const price = num(v.price, { minExclusive: true });
    if (price === null || typeof v.at !== "string" || v.at.length > 40) return fail("Invalid prices");
    manualPrices[k] = { price, at: v.at };
  }
  if (raw.bnbDiscount !== undefined && typeof raw.bnbDiscount !== "boolean") return fail("Invalid fee setting");
  const bnbDiscount = raw.bnbDiscount === true;
  if (!unique([...purchases, ...sales, ...cash, ...plans].map((x) => x.id))) return fail("Duplicate ids");
  return { ok: true, doc: { revision, purchases, sales, cash, plans, manualPrices, bnbDiscount } };
}
