export type PublishedTrade = {
  id: string;
  createdAt: number;
  pair: string;
  direction: "Long" | "Short";
  timeframe: string;
  entryZone: string;
  invalidation: string;
  tp1: string;
  tp2: string;
  tp3: string;
  reasoning: string;
  /** Bot's own id (e.g. "T075") — used to match updates to this trade. Optional: manually published trades won't have one. */
  tradeId?: string;
  /** Defaults to "open" for anything published without a status (older trades, manual publishes). */
  status?: "open" | "closed";
  /** Which TP/SL levels have fired, e.g. ["TP1", "TP2"]. */
  hitLevels?: string[];
  /**
   * Who may see this signal. Server-side only: assigned from the publisher's credential, never from
   * the request body. Anything stored without a tier (every signal published before this field
   * existed) is "free". The API only sends this field to viewers who may see Elite signals (active Elite members and the admin).
   */
  tier?: SignalTier;
};

export type SignalTier = "free" | "elite";

/** Effective tier of a stored trade. Missing = "free" (backward compatible). Any unrecognised value fails closed to "elite". */
export function tradeTier(t: { tier?: unknown }): SignalTier {
  if (t.tier === undefined || t.tier === null || t.tier === "free") return "free";
  return "elite";
}

/** Can a viewer see this trade? Elite-tier signals need `canSeeElite`; everything else is public to signed-in users. */
export function visibleTrades<T extends { tier?: unknown }>(trades: T[], canSeeElite: boolean): T[] {
  return canSeeElite ? trades : trades.filter((t) => tradeTier(t) === "free");
}

/** Redis list that holds the published feed (shared by the feed API and the Confirm Trade API). */
export const TRADE_FEED_KEY = "atlas:trade-feed";
