// ACTIVE-SIGNAL-v1: which coins have a currently active, published Trade Feed setup.
// Reuses the feed's own rule (isLiveSignal: open and no stop-loss hit). The PUBLIC shape is only { symbol, id }:
// no direction, entry, stop, targets, tier or reasoning ever leaves the server through this path.
import { isLiveSignal } from "@/lib/signalLink";
import type { PublishedTrade } from "@/lib/tradeFeed";

const QUOTES = ["FDUSD", "USDT", "USDC", "BUSD", "USD"];

/** BTCUSDT, BTC/USDT, btc-usdt and "BTC" all become "BTC". */
export function normalizeSymbol(raw: string | null | undefined): string {
  const s = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (const q of QUOTES) if (s.length - q.length >= 2 && s.endsWith(q)) return s.slice(0, -q.length);
  return s;
}

/** Active = published, open, no stop-loss hit, and not finished at TP3. TP1/TP2 progress keeps it active. */
export function isActiveSignal(s: Pick<PublishedTrade, "status" | "hitLevels">): boolean {
  return isLiveSignal(s) && !(s.hitLevels ?? []).includes("TP3");
}

export type PublicActiveSignal = { symbol: string; id: string };

/** One entry per coin (its newest active setup), in exactly the public shape. Tier is deliberately not consulted or returned. */
export function publicActiveSignals(stored: PublishedTrade[]): PublicActiveSignal[] {
  const best = new Map<string, { at: number; id: string }>();
  for (const t of stored) {
    if (!t || typeof t.id !== "string" || !isActiveSignal(t)) continue;
    const symbol = normalizeSymbol(t.pair);
    if (!symbol) continue;
    const cur = best.get(symbol);
    if (!cur || t.createdAt > cur.at) best.set(symbol, { at: t.createdAt, id: t.id });
  }
  return [...best].map(([symbol, v]) => ({ symbol, id: v.id }));
}

export type ActiveSignalRef = { id: string };
export type ActiveSignalIndex = Map<string, ActiveSignalRef>;

export function indexFromPublic(list: unknown): ActiveSignalIndex {
  const idx: ActiveSignalIndex = new Map();
  if (!Array.isArray(list)) return idx;
  for (const e of list) {
    if (e && typeof e.symbol === "string" && typeof e.id === "string") idx.set(normalizeSymbol(e.symbol), { id: e.id });
  }
  return idx;
}

export const signalHref = (id: string) => `/trade-feed?signal=${encodeURIComponent(id)}`;

/** Sign-in / sign-up link that brings the visitor back to the exact selected signal. */
export const authHref = (kind: "sign-in" | "sign-up", signalId: string | null) =>
  signalId ? `/${kind}?redirect_url=${encodeURIComponent(signalHref(signalId))}` : `/${kind}`;
