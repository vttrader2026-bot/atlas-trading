// EXIT-STRATEGY-v1: exit strategy and partial exits for a personal (spot, long) trade. Pure.
//   split : TP1 30% of the position, TP2 40%, TP3 the remaining 30%
//   tp3   : hold everything until TP3
//   SL    : always closes 100% of what is still held
// Exits are only ever what the member recorded (their real fill price). Nothing here estimates or auto-fills a result.

import { exitsOf, feesOf, investedOf, remainingQty, statusOf, type AutoSlRecord, type ExitLevel, type ExitRecord, type ExitStrategy, type Trade } from "@/lib/journal";

export const EXIT_STRATEGIES: readonly ExitStrategy[] = ["split", "tp3"];
export const SPLIT_PCT = [30, 40, 30] as const;
export const isExitStrategy = (v: unknown): v is ExitStrategy => v === "split" || v === "tp3";

const TP_ORDER: Record<ExitStrategy, ExitLevel[]> = { split: ["TP1", "TP2", "TP3"], tp3: ["TP3"] };

/** Levels the member may record next: the next target of the strategy, and always the stop-loss. */
export function allowedLevels(t: Trade): ExitLevel[] {
  if (!t.exitStrategy || remainingQty(t) <= 0 || statusOf(t) === "closed") return [];
  const done = new Set(exitsOf(t).map((e) => e.level));
  const nextTp = TP_ORDER[t.exitStrategy].find((l) => !done.has(l));
  return nextTp ? [nextTp, "SL"] : ["SL"];
}

/** Quantity the strategy sells at `level`: 30% / 40% of the original size, TP3 and SL the whole remainder. */
export function plannedExitQty(t: Trade, level: ExitLevel): number {
  const left = remainingQty(t);
  if (level === "SL" || level === "TP3" || t.exitStrategy === "tp3") return left;
  const pct = level === "TP1" ? SPLIT_PCT[0] : SPLIT_PCT[1];
  return Math.min((t.size * pct) / 100, left);
}

/** The official-or-personal price of a level on this trade (the member's own stop and targets), if set. */
export function levelPrice(t: Trade, level: ExitLevel): number | null {
  const v = level === "SL" ? t.stop : level === "TP1" ? (t.tp1 ?? (t.target || null)) : level === "TP2" ? t.tp2 : t.tp3;
  return v !== null && v !== undefined && v > 0 ? v : null;
}

export type ExitError = "noStrategy" | "level" | "price" | "date" | "closed";
export type ExitResult = { ok: true; trade: Trade } | { ok: false; error: ExitError };

const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/**
 * Records an exit at the member's actual price. The quantity is decided by the strategy, not typed.
 * When nothing is left the trade becomes closed: exit = weighted average exit price, exitDate = last exit date,
 * so the rest of the Journal (history, dashboard, CSV/PDF) sees an ordinary closed trade.
 */
export function applyExit(t: Trade, input: { level: ExitLevel; price: number; date: string }, now = Date.now()): ExitResult {
  if (!t.exitStrategy) return { ok: false, error: "noStrategy" };
  if (statusOf(t) === "closed" || remainingQty(t) <= 0) return { ok: false, error: "closed" };
  if (!allowedLevels(t).includes(input.level)) return { ok: false, error: "level" };
  if (!Number.isFinite(input.price) || !(input.price > 0)) return { ok: false, error: "price" };
  if (!isDay(input.date) || input.date < t.date) return { ok: false, error: "date" };
  const rec: ExitRecord = { level: input.level, price: input.price, qty: plannedExitQty(t, input.level), date: input.date };
  const exits = [...exitsOf(t), rec];
  const next: Trade = { ...t, exits, updatedAt: now };
  if (remainingQty(next) <= 0) {
    const sold = exits.reduce((s, e) => s + e.qty, 0);
    next.status = "closed";
    next.exit = exits.reduce((s, e) => s + e.price * e.qty, 0) / sold;
    next.exitDate = input.date;
  } else {
    next.status = "open";
  }
  return { ok: true, trade: next };
}

export type Position = {
  size: number;
  soldQty: number;
  remainingQty: number;
  /** Money actually received above cost for the part already sold, after the fees entered so far. */
  realizedPnl: number;
  /** Realized PnL / cost of the part already sold. */
  realizedRoiPct: number | null;
  /** Open part valued at `price`. NOT realized: a paper figure until sold. null without a price. */
  unrealizedPnl: number | null;
  unrealizedRoiPct: number | null;
  /** realized + unrealized, over the whole invested amount. null without a price while a part is open. */
  totalPnl: number | null;
  totalRoiPct: number | null;
};

/** Realized / unrealized split of a trade with recorded exits. `price` is only used for the part still held. */
export function positionOf(t: Trade, price: number | null | undefined): Position {
  const exits = exitsOf(t);
  const left = remainingQty(t);
  const sold = t.size - left;
  const inv = investedOf(t);
  const costPer = t.size > 0 ? inv / t.size : 0;
  const gross = exits.reduce((s, e) => s + (e.price - t.entry) * e.qty, 0);
  const realized = exits.length ? gross - feesOf(t) : 0;
  const costSold = costPer * sold;
  const unreal = left > 0 && price !== null && price !== undefined && price > 0 ? (price - t.entry) * left : left > 0 ? null : 0;
  const total = unreal === null ? null : realized + unreal;
  return {
    size: t.size,
    soldQty: sold,
    remainingQty: left,
    realizedPnl: realized,
    realizedRoiPct: exits.length && costSold > 0 ? (realized / costSold) * 100 : null,
    unrealizedPnl: unreal,
    unrealizedRoiPct: unreal !== null && left > 0 && costPer * left > 0 ? (unreal / (costPer * left)) * 100 : null,
    totalPnl: total,
    totalRoiPct: total !== null && inv > 0 ? (total / inv) * 100 : null,
  };
}

/** Final exit price of a fully sold position: the quantity-weighted average of all its exits. */
function weightedExit(exits: ExitRecord[]): number {
  const sold = exits.reduce((x, e) => x + e.qty, 0);
  return exits.reduce((x, e) => x + e.price * e.qty, 0) / sold;
}

/** Realized PnL (after the fees entered) of the exits recorded on trades that are still OPEN, i.e. partly sold. */
export function partialRealizedTotal(trades: Trade[]): number | null {
  const open = trades.filter((t) => t.exitStrategy && statusOf(t) === "open" && exitsOf(t).length > 0);
  return open.length ? open.reduce((s, t) => s + positionOf(t, null).realizedPnl, 0) : null;
}

export type CorrectionError = "notAuto" | "price";

/**
 * The member replaces the ESTIMATED price of the final automatic stop-loss exit with their real fill price.
 * Only that last exit's price changes (previous partial exits, quantities and dates stay as they are); the final exit
 * price is recomputed from all exits, and the trade stops being labelled as an estimate.
 */
export function correctAutoSlExit(t: Trade, newPrice: number, now = Date.now()): { ok: true; trade: Trade } | { ok: false; error: CorrectionError } {
  const exits = exitsOf(t);
  const last = exits[exits.length - 1];
  if (!t.exitStrategy || t.exitSource !== "auto-sl" || !t.autoSl || !last || last.level !== "SL" || statusOf(t) !== "closed") return { ok: false, error: "notAuto" };
  if (!Number.isFinite(newPrice) || !(newPrice > 0)) return { ok: false, error: "price" };
  const next = [...exits.slice(0, -1), { ...last, price: newPrice }];
  return {
    ok: true,
    trade: { ...t, exits: next, exit: weightedExit(next), exitSource: "manual", autoSl: { ...t.autoSl, correctedAt: now, correctedPrice: newPrice }, updatedAt: now },
  };
}

/** Same exit regardless of key order. */
const sameExit = (a: ExitRecord | undefined, b: ExitRecord | undefined) => !!a && !!b && a.level === b.level && a.price === b.price && a.qty === b.qty && a.date === b.date;
const sameExits = (a: ExitRecord[], b: ExitRecord[]) => a.length === b.length && a.every((e, i) => sameExit(e, b[i]));
const asRecords = (v: unknown): ExitRecord[] => (Array.isArray(v) ? (v as ExitRecord[]).filter((e) => e && typeof e === "object") : []);

function validAutoSl(r: unknown, last: ExitRecord | undefined): r is AutoSlRecord {
  if (!last || last.level !== "SL" || typeof r !== "object" || r === null) return false;
  const a = r as Record<string, unknown>;
  const pos = (x: unknown) => typeof x === "number" && Number.isFinite(x) && x > 0;
  return pos(a.detectedAt) && pos(a.touchedAt) && pos(a.low) && pos(a.estimatedExit) && a.estimatedExit === last.price && (a.low as number) <= (a.estimatedExit as number) && a.qty === last.qty;
}

/**
 * Server-side protection for the Journal save (EXIT-STRATEGY-v1). Applies to every trade that has an exit strategy.
 *  - A stored trade WITHOUT a strategy (legacy) can never gain a strategy or exits through a save.
 *  - Strategy, entry, quantity and invested amount of a stored strategy trade come from the stored copy.
 *  - Stored exits cannot be rewritten or removed. New exits are validated one by one (allowed level, the strategy's own
 *    quantity, never more than what is left, positive price, valid date); the first invalid one and everything after it is dropped.
 *  - status / exit / exitDate are DERIVED from the validated exits, never taken from the request.
 *  - autoSl / exitSource come from the stored copy. The only ways they change: a valid automatic stop-loss exit that
 *    closes the trade (record must match the SL exit), or the one-time correction of that exit's price.
 * Everything else (notes, stop, targets, fees, ...) stays the member's.
 */
export function lockStrategyFields(stored: unknown, incoming: Array<Record<string, unknown>>, now = Date.now()): Array<Record<string, unknown>> {
  const old = new Map<string, Record<string, unknown>>();
  if (Array.isArray(stored)) for (const s of stored) if (s && typeof s === "object" && typeof (s as { id?: unknown }).id === "string") old.set((s as { id: string }).id, s as Record<string, unknown>);
  return incoming.map((t) => {
    const prev = typeof t.id === "string" ? old.get(t.id) : undefined;
    if (prev && !isExitStrategy(prev.exitStrategy)) {
      // Legacy record: the strategy and exits can only be added to NEW trades.
      const { exitStrategy: _s, exits: _e, ...rest } = t; // eslint-disable-line @typescript-eslint/no-unused-vars
      return rest;
    }
    const strategy = prev ? (prev.exitStrategy as ExitStrategy) : t.exitStrategy;
    if (!isExitStrategy(strategy)) {
      if (!("exitStrategy" in t)) return t;
      const { exitStrategy: _s, exits: _e, ...rest } = t; // eslint-disable-line @typescript-eslint/no-unused-vars
      return rest;
    }
    const base: Record<string, unknown> = { ...t, exitStrategy: strategy };
    if (prev) {
      base.entry = prev.entry;
      base.size = prev.size;
      if (prev.invested === undefined) delete base.invested;
      else base.invested = prev.invested;
    }
    const date = typeof base.date === "string" ? base.date : typeof prev?.date === "string" ? prev.date : "";
    const storedExits = asRecords(prev?.exits);
    const incExits = asRecords(t.exits);
    const work = (exits: ExitRecord[]) => ({ ...base, date, exits, status: "open", exit: null }) as unknown as Trade;

    let exits = storedExits;
    let exitSource = prev?.exitSource;
    let autoSl = prev?.autoSl;
    const lastStored = storedExits[storedExits.length - 1];
    const lastInc = incExits[incExits.length - 1];
    const isCorrection =
      !!prev && prev.exitSource === "auto-sl" && !!prev.autoSl && lastStored?.level === "SL" && incExits.length === storedExits.length &&
      sameExits(incExits.slice(0, -1), storedExits.slice(0, -1)) && !!lastInc && lastInc.level === lastStored.level && lastInc.qty === lastStored.qty && lastInc.date === lastStored.date &&
      typeof lastInc.price === "number" && Number.isFinite(lastInc.price) && lastInc.price > 0 && lastInc.price !== lastStored.price;
    if (isCorrection) {
      exits = [...storedExits.slice(0, -1), { ...lastStored, price: lastInc.price }];
      exitSource = "manual";
      autoSl = { ...(prev!.autoSl as AutoSlRecord), correctedAt: now, correctedPrice: lastInc.price };
    } else {
      const extendsStored = storedExits.every((e, i) => sameExit(e, incExits[i]));
      const added: ExitRecord[] = [];
      if (extendsStored) {
        let cur = work(storedExits);
        for (const e of incExits.slice(storedExits.length)) {
          const level = e?.level as ExitLevel;
          const px = e?.price;
          const day = e?.date;
          if (!allowedLevels(cur).includes(level) || typeof px !== "number" || !Number.isFinite(px) || !(px > 0)) break;
          if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day)) || day < date) break;
          const rec: ExitRecord = { level, price: px, qty: plannedExitQty(cur, level), date: day };
          added.push(rec);
          cur = work([...storedExits, ...added]);
        }
      }
      exits = [...storedExits, ...added];
      if (!prev?.autoSl) {
        const lastNew = added[added.length - 1];
        const closes = remainingQty(work(exits)) <= 0;
        if (added.length && closes && t.exitSource === "auto-sl" && validAutoSl(t.autoSl, lastNew)) {
          exitSource = "auto-sl";
          autoSl = { detectedAt: t.autoSl.detectedAt, touchedAt: t.autoSl.touchedAt, low: t.autoSl.low, estimatedExit: t.autoSl.estimatedExit, qty: t.autoSl.qty };
        } else {
          exitSource = undefined;
          autoSl = undefined;
        }
      }
    }
    const out: Record<string, unknown> = { ...base, exits };
    const left = remainingQty(work(exits));
    if (exits.length && left <= 0) {
      out.status = "closed";
      out.exit = weightedExit(exits);
      out.exitDate = exits[exits.length - 1].date;
    } else {
      out.status = "open";
      out.exit = null;
      out.exitDate = null;
    }
    for (const [k, v] of [["exitSource", exitSource], ["autoSl", autoSl]] as const) {
      if (v === undefined) delete out[k];
      else out[k] = v;
    }
    if (!exits.length) delete out.exits;
    return out;
  });
}
