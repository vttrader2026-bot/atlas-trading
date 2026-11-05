// ELITE-CONFIRM-v1
// Server-side core of "confirm an ELITE trade". ONE implementation, used by every route that can create a
// personal trade from an ELITE signal:
//   - POST /api/me/confirm-trade (Confirm Trade button AND "Send to Journal" from a Trade Plan), and
//   - PUT  /api/me/journal (the catch-all: it refuses to store an ELITE-linked trade that was not confirmed).
// The price is fetched here, never taken from the client.
import { randomUUID } from "crypto";
import type { Redis } from "@upstash/redis";
import { TRADE_FEED_KEY, CONFIRM_COUNTS_KEY, tradeTier, type PublishedTrade } from "@/lib/tradeFeed";
import { checkEntryZone, evaluateFreshPrice, exchangeSymbol, validateAmounts, type Confirmation } from "@/lib/eliteConfirm";
import { isLiveSignal, isLongSignal, signalToTrade } from "@/lib/signalLink";
import { validateTrade, type Trade } from "@/lib/journal";

const MAX_FEED = 50;
const PRICE_TIMEOUT_MS = 8_000;

export const confirmationsKey = (userId: string) => `user:${userId}:confirmations`;
export const journalKey = (userId: string) => `user:${userId}:journal`;

export type Ticker = { lastPrice?: unknown; closeTime?: unknown };
export type PlanExtras = {
  planId?: string;
  stop?: number | null;
  tp1?: number | null;
  tp2?: number | null;
  tp3?: number | null;
  notes?: string;
  entryReason?: string;
  /** YYYY-MM-DD the member entered. */
  date?: string;
};
export type ConfirmInput = { signalId: string; entry: unknown; invested: unknown; plan?: PlanExtras };
export type ConfirmResult = { status: number; body: Record<string, unknown> };

type Stored = Confirmation & { trade: Trade };
const fail = (error: string, status: number, extra: Record<string, unknown> = {}): ConfirmResult => ({ status, body: { error, ...extra } });

async function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("price timeout")), PRICE_TIMEOUT_MS))]);
}

const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const posOrNull = (v: unknown): number | null | undefined => (v === null ? null : typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined);

/** Reads the optional Trade Plan numbers from a request body. Unusable values are dropped, never guessed. */
export function parsePlanExtras(raw: unknown): PlanExtras | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: PlanExtras = {};
  if (typeof r.planId === "string" && r.planId) out.planId = r.planId.slice(0, 80);
  for (const k of ["stop", "tp1", "tp2", "tp3"] as const) {
    const v = posOrNull(r[k]);
    if (v !== undefined) out[k] = v;
  }
  if (typeof r.notes === "string") out.notes = r.notes.slice(0, 2000);
  if (typeof r.entryReason === "string") out.entryReason = r.entryReason.slice(0, 2000);
  if (isDay(r.date)) out.date = r.date;
  return out;
}

export async function confirmEliteTrade(
  d: { redis: Redis; userId: string; /** The caller's plan is ELITE (decided by the route from Clerk). */ canSeeElite: boolean; getTicker: (symbol: string) => Promise<Ticker>; now?: () => number },
  input: ConfirmInput,
): Promise<ConfirmResult> {
  const { redis, userId } = d;
  const { signalId } = input;
  const amounts = validateAmounts({ entry: input.entry, invested: input.invested });
  if (!amounts.ok) return fail("invalid_amount", 400, { field: amounts.field });

  const feed = await redis.lrange<PublishedTrade>(TRADE_FEED_KEY, 0, MAX_FEED - 1);
  const signal = feed.find((s) => s.id === signalId);
  // An unknown id and an ELITE signal the caller may not see look the same: nothing is revealed.
  if (!signal || (tradeTier(signal) === "elite" && !d.canSeeElite)) return fail("signal_not_found", 404);
  if (!isLongSignal(signal)) return fail("long_only", 400);
  if (!isLiveSignal(signal)) return fail("signal_closed", 409);

  // Duplicate guard, cheap check first (the atomic claim below is the real guarantee).
  const existing = await redis.hget<Stored>(confirmationsKey(userId), signalId);
  if (existing) return fail("already_confirmed", 409, { tradeId: existing.tradeId });
  const journal = await redis.get<unknown>(journalKey(userId));
  const journalList = Array.isArray(journal) ? (journal as Trade[]) : [];
  const linked = journalList.find((t) => t.signalId === signalId);
  if (linked) return fail("already_confirmed", 409, { tradeId: linked.id });

  // Fresh market price, fetched now.
  const symbol = exchangeSymbol(signal.pair);
  if (!symbol) return fail("price_unavailable", 503);
  let ticker: Ticker;
  try {
    ticker = await withTimeout(d.getTicker(symbol));
  } catch (err) {
    console.error("confirm-trade: price fetch failed", err);
    return fail("price_unavailable", 503);
  }
  const now = (d.now ?? Date.now)();
  const price = evaluateFreshPrice(ticker, now);
  if (!price.ok) return fail(price.code === "priceStale" ? "price_stale" : "price_unavailable", 503);

  const zone = checkEntryZone(price.price, signal.entryZone);
  if (!zone.ok) {
    if (zone.code === "zoneUnreadable") return fail("zone_unreadable", 422);
    return fail(zone.code === "belowZone" ? "below_zone" : "above_zone", 422, { price: price.price, zone: zone.zone });
  }

  // The member's personal trade. Entry price and investment are the member's own numbers.
  const today = new Date(now).toISOString().slice(0, 10);
  const x = input.plan;
  const trade = signalToTrade(signal, {
    id: randomUUID(),
    date: x?.date && x.date <= new Date(now + 86_400_000).toISOString().slice(0, 10) ? x.date : today,
    entry: amounts.entry,
    invested: amounts.invested,
    ...(x && x.stop !== undefined ? { stop: x.stop } : {}),
    now,
  });
  if (trade.date === today) trade.watchFrom = now; // AUTO-SL-v1: the Journal watches candles from this moment
  if (x) {
    // A Trade Plan carries the member's own stop and targets; they replace the signal's defaults.
    for (const k of ["tp1", "tp2", "tp3"] as const) if (x[k] !== undefined) trade[k] = x[k];
    trade.target = trade.tp1 ?? 0;
    trade.source = "plan";
    if (x.planId) trade.planId = x.planId;
    if (x.notes !== undefined) trade.notes = x.notes;
    if (x.entryReason !== undefined) trade.entryReason = x.entryReason;
  }
  const issues = validateTrade(trade);
  if (issues.length) return fail("invalid_trade", 422, { field: issues[0].field });

  const record: Stored = {
    signalId, tradeId: trade.id, entry: amounts.entry, invested: amounts.invested,
    checkedPrice: price.price, checkedAt: price.at, confirmedAt: now, trade,
  };
  // Atomic claim: of two simultaneous confirmations only one gets 1 back.
  const claimed = await redis.hsetnx(confirmationsKey(userId), signalId, record);
  if (!claimed) {
    const winner = await redis.hget<Stored>(confirmationsKey(userId), signalId);
    return fail("already_confirmed", 409, { tradeId: winner?.tradeId });
  }
  try {
    await redis.set(journalKey(userId), [trade, ...journalList]);
  } catch (err) {
    // Never leave a confirmation without its Journal trade: release the claim so the member can retry.
    console.error("confirm-trade: journal write failed, releasing claim", err);
    await redis.hdel(confirmationsKey(userId), signalId).catch(() => {});
    return fail("save_failed", 500);
  }
  // Unique confirmation counter (one per member and signal: the claim above is what makes it unique). Best effort.
  try {
    await redis.hincrby(CONFIRM_COUNTS_KEY, signalId, 1);
  } catch (err) {
    console.error("confirm-trade: could not update the confirmation count", err);
  }
  return { status: 201, body: { ok: true, trade, checkedPrice: price.price, zone: zone.zone } };
}

/** Ids a Journal trade is linked to (its Signal ID and its embedded official link). */
const linkedIds = (t: Trade): string[] => [t.signalId, t.signal?.id].filter((x): x is string => typeof x === "string" && x !== "");

/**
 * Journal catch-all. A Journal trade linked to an ELITE signal is only accepted when it IS the trade created by a
 * confirmation (same id) for this member. Anything else, however it was made, is refused. Trades linked to FREE or
 * unknown signals, and trades with no signal link, pass untouched.
 */
export async function splitUnconfirmedEliteTrades(redis: Redis, userId: string, trades: Array<Record<string, unknown>>): Promise<{ kept: Array<Record<string, unknown>>; rejected: string[] }> {
  const candidates = trades.filter((t) => linkedIds(t as unknown as Trade).length > 0);
  if (candidates.length === 0) return { kept: trades, rejected: [] };
  const feed = await redis.lrange<PublishedTrade>(TRADE_FEED_KEY, 0, MAX_FEED - 1);
  const eliteIds = new Set(feed.filter((s) => tradeTier(s) === "elite").map((s) => s.id));
  if (eliteIds.size === 0) return { kept: trades, rejected: [] };
  const confirmed = (await redis.hgetall<Record<string, Stored>>(confirmationsKey(userId))) ?? {};
  const kept: Array<Record<string, unknown>> = [];
  const rejected: string[] = [];
  for (const t of trades) {
    const elite = linkedIds(t as unknown as Trade).filter((id) => eliteIds.has(id));
    const ok = elite.every((id) => confirmed[id]?.tradeId === t.id);
    if (ok) kept.push(t);
    else rejected.push(String(t.id));
  }
  return { kept, rejected };
}
