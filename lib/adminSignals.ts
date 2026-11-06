// ADMIN-v1: signal drafts and validation for the owner dashboard. Published signals use the EXISTING feed
// (TRADE_FEED_KEY / PublishedTrade / feedForViewer), so FREE members still only ever see what feedForViewer allows.
import type { PublishedTrade, SignalTier } from "@/lib/tradeFeed";

export const DRAFTS_KEY = "atlas:signal-drafts";
export const FEED_MAX = 50;

export type SignalDraft = {
  id: string;
  createdAt: number;
  updatedAt: number;
  tier: SignalTier;
  pair: string;
  direction: "Long" | "Short";
  timeframe: string;
  entryZone: string;
  invalidation: string;
  tp1: string;
  tp2: string;
  tp3: string;
  reasoning: string;
};

export type SignalFields = Omit<SignalDraft, "id" | "createdAt" | "updatedAt" | "tier">;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const hasNumber = (s: string) => /\d/.test(s);

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Content fields of a signal. Entries, stop-loss and TP1 are required and must contain a number. */
export function parseSignalFields(body: Record<string, unknown>): ParseResult<SignalFields> {
  const pair = text(body.pair, 30).toUpperCase();
  const direction = body.direction === "Long" || body.direction === "Short" ? body.direction : null;
  if (!pair || !/^[A-Z0-9]+$/.test(pair)) return { ok: false, error: "A valid pair is required (e.g. SOLUSDT)" };
  if (!direction) return { ok: false, error: "Direction must be Long or Short" };
  const entryZone = text(body.entryZone, 200);
  const invalidation = text(body.invalidation, 200);
  const tp1 = text(body.tp1, 50);
  const tp2 = text(body.tp2, 50);
  const tp3 = text(body.tp3, 50);
  if (!hasNumber(entryZone)) return { ok: false, error: "Entry zone is required" };
  if (!hasNumber(invalidation)) return { ok: false, error: "Stop-loss is required" };
  if (!hasNumber(tp1)) return { ok: false, error: "TP1 is required" };
  for (const [name, v] of [["TP2", tp2], ["TP3", tp3]] as const) if (v && !hasNumber(v)) return { ok: false, error: `${name} must be a number` };
  return { ok: true, value: { pair, direction, timeframe: text(body.timeframe, 20), entryZone, invalidation, tp1, tp2, tp3, reasoning: text(body.reasoning, 2000) } };
}

/** FREE or ELITE, chosen explicitly. There is no default, so a signal can never become public by accident. */
export function parseTier(v: unknown): SignalTier | null {
  return v === "free" || v === "elite" ? v : null;
}

/** The feed record for a draft. Same shape the bot and Trade Plan publishes use. */
export function draftToTrade(d: SignalDraft, now: number): PublishedTrade {
  return {
    id: d.id,
    createdAt: now,
    pair: d.pair,
    direction: d.direction,
    timeframe: d.timeframe,
    entryZone: d.entryZone,
    invalidation: d.invalidation,
    tp1: d.tp1,
    tp2: d.tp2,
    tp3: d.tp3,
    reasoning: d.reasoning,
    status: "open",
    tier: d.tier,
  };
}
