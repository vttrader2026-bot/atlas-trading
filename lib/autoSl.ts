// AUTO-SL-v1: browser-side automatic stop-loss exit for open personal spot LONG trades. Pure + injected candle fetcher.
// The Journal is the ONLY trigger: the official signal's status or hit levels are never looked at here.
// The exit is an ESTIMATE: the trade is closed at its own stop price when a candle low touched the stop.

import { remainingQty, statusOf, type AutoSlRecord, type Trade } from "@/lib/journal";
import { applyExit } from "@/lib/exits";

export type Candle = { openTime: number; low: number };
export type CandleFetcher = (symbol: string, interval: "1m" | "1h", startTime: number, limit: number) => Promise<Candle[]>;
export type Touch = { touchedAt: number; low: number };

const MIN = 60_000;
const PAGE = 1000;
const MAX_MINUTE_PAGES = 10; // ~7 days of 1-minute candles; older history is scanned with hourly candles
export const WINDOW_MS = MAX_MINUTE_PAGES * PAGE * MIN;
const SYMBOL = /^[A-Z0-9]{2,15}USDT$/;

/** Open spot LONG trade with a real stop below its entry that has never been auto-processed. */
export function isMonitorable(t: Trade): boolean {
  return (
    statusOf(t) === "open" &&
    t.side === "Long" &&
    !t.autoSl &&
    SYMBOL.test(t.pair) &&
    t.entry > 0 &&
    t.stop > 0 &&
    t.stop < t.entry &&
    t.size > 0 &&
    remainingQty(t) > 0 // with partial exits only the part still held is watched
  );
}

/**
 * First moment the Journal may count a candle. A trade created today (or whose stop was just edited) carries `watchFrom`.
 * Older records only have an entry DATE, so watching starts after the end of that day: a low from earlier in the entry day
 * could pre-date the actual entry.
 */
export function monitorStart(t: Trade): number {
  if (typeof t.watchFrom === "number" && Number.isFinite(t.watchFrom)) return t.watchFrom;
  const day = Date.parse(`${t.date}T00:00:00`); // the member's local entry day
  return Number.isFinite(day) ? day + 86_400_000 : Number.POSITIVE_INFINITY;
}

/** First candle at or after `from` (whole minutes: the entry minute itself is skipped) whose low touched the stop. */
export function firstTouch(candles: Candle[], stop: number, from: number): Touch | null {
  const first = Math.ceil(from / MIN) * MIN;
  for (const c of candles) if (c.openTime >= first && Number.isFinite(c.low) && c.low > 0 && c.low <= stop) return { touchedAt: c.openTime, low: c.low };
  return null;
}

export type MonitorState = { busy: Set<string>; cursor: Map<string, number> };
export const newMonitorState = (): MonitorState => ({ busy: new Set(), cursor: new Map() });

async function scan(t: Trade, fetchCandles: CandleFetcher, now: number, st: MonitorState): Promise<Touch | null> {
  const from = Math.max(monitorStart(t), st.cursor.get(t.id) ?? 0);
  if (!(from < now)) return null;
  const minuteFrom = Math.max(from, now - WINDOW_MS);
  // Older than the 1-minute window: hourly candles cover the earlier part (still a real low, just a coarser time).
  if (from < minuteFrom) {
    const hourly = await fetchCandles(t.pair, "1h", from, PAGE);
    const hit = firstTouch(hourly.filter((c) => c.openTime < minuteFrom), t.stop, from);
    if (hit) return hit;
  }
  let cursor = minuteFrom;
  for (let page = 0; page < MAX_MINUTE_PAGES; page++) {
    const candles = await fetchCandles(t.pair, "1m", cursor, PAGE);
    const hit = firstTouch(candles, t.stop, minuteFrom);
    if (hit) return hit;
    if (candles.length < PAGE) {
      // Reached the present. The last candle may still be forming, so it is looked at again next time.
      st.cursor.set(t.id, candles.length ? candles[candles.length - 1].openTime : cursor);
      return null;
    }
    cursor = candles[candles.length - 1].openTime + MIN;
  }
  st.cursor.set(t.id, cursor);
  return null;
}

/** Checks every monitorable open trade; returns the touches found, keyed by trade id. Never throws; one failing pair does not stop the rest. */
export async function findAutoSlTouches(trades: Trade[], fetchCandles: CandleFetcher, now: number, st: MonitorState): Promise<Map<string, Touch>> {
  const out = new Map<string, Touch>();
  await Promise.all(
    trades.filter(isMonitorable).map(async (t) => {
      if (st.busy.has(t.id)) return; // an earlier check of this trade is still running
      st.busy.add(t.id);
      try {
        const hit = await scan(t, fetchCandles, now, st);
        if (hit) out.set(t.id, hit);
      } catch {
        /* Binance unreachable or unknown symbol: try again next time */
      } finally {
        st.busy.delete(t.id);
      }
    }),
  );
  return out;
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Closes the trade at its own stop price as an ESTIMATED execution. Idempotent: returns null for anything that is no
 * longer a monitorable open trade (already closed by hand or automatically, edited, reopened), so it can never apply twice.
 * Realized PnL then comes from the Journal's normal maths (exit = stop, fees as entered).
 */
export function applyAutoSl(t: Trade, touch: Touch, now: number): Trade | null {
  if (!isMonitorable(t)) return null;
  if (touch.touchedAt < monitorStart(t) - MIN) return null;
  const day = utcDay(touch.touchedAt);
  const exitDate = day < t.date ? t.date : day;
  const rec: AutoSlRecord = { detectedAt: now, touchedAt: touch.touchedAt, low: touch.low, estimatedExit: t.stop, qty: remainingQty(t) };
  if (t.exitStrategy) {
    // Exit-strategy trade: the stop closes 100% of what is still held, recorded like any other exit (SL level);
    // exits already recorded stay as they are and the final exit price is the weighted average of all of them.
    const r = applyExit(t, { level: "SL", price: t.stop, date: exitDate }, now);
    if (!r.ok) return null;
    return { ...r.trade, exitSource: "auto-sl", autoSl: rec };
  }
  return { ...t, status: "closed", exit: t.stop, exitDate, exitSource: "auto-sl", autoSl: rec, updatedAt: now };
}
