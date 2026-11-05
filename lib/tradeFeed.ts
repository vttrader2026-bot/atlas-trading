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
  /** Response-only: unique members who confirmed this signal (a count, never who). Not stored with the signal. */
  confirmations?: number;
  /** Set once, by the admin Close action (CLOSE-ELITE-v1). The original signal fields are never edited. */
  closing?: SignalClosing;
};

export const CLOSE_OUTCOMES = ["TP1", "TP2", "TP3", "SL", "CANCELLED"] as const;
export type CloseOutcome = (typeof CLOSE_OUTCOMES)[number];
/** Closing record. `result` comes from the signal's own official level, never from the request. */
export type SignalClosing = { outcome: CloseOutcome; reason: string; result: string; closedAt: number; verified: true };

/** Closes a signal: adds status, hit levels and the closing record; every original field is kept as it was. */
export function closeSignal(t: PublishedTrade, outcome: CloseOutcome, reason: string, now: number): PublishedTrade {
  const tps = [t.tp1, t.tp2, t.tp3];
  const hits = [...(t.hitLevels ?? [])];
  let result = "";
  if (outcome === "SL") {
    if (!hits.includes("SL")) hits.push("SL");
    result = t.invalidation;
  } else if (outcome !== "CANCELLED") {
    const n = Number(outcome.slice(2));
    for (let i = 1; i <= n; i++) if (!hits.includes(`TP${i}`)) hits.push(`TP${i}`);
    result = tps[n - 1] ?? "";
  }
  return { ...t, status: "closed", hitLevels: hits, closing: { outcome, reason, result, closedAt: now, verified: true } };
}

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

/** Redis hash: Signal ID -> number of unique members who successfully confirmed it. Counts only, no member data. */
export const CONFIRM_COUNTS_KEY = "atlas:signal-confirmations";

/**
 * What a viewer without ELITE access gets for an OPEN ELITE signal (ELITE-LOCKED-v1): identity of the setup only.
 * Deliberately no direction, entry zone, stop, targets, hit levels, reasoning or bot id.
 */
export type LockedSignal = {
  id: string;
  createdAt: number;
  pair: string;
  timeframe: string;
  status: "open";
  tier: "elite";
  locked: true;
  confirmations: number;
};

const isClosed = (t: { status?: unknown }) => t.status === "closed";

/**
 * Builds the per-viewer feed. This is the ONLY place that decides what a viewer may see of an ELITE signal:
 *  - FREE signals: everyone.
 *  - ELITE signals, ELITE members and the admin: everything.
 *  - OPEN ELITE signals, everyone else: a locked preview (coin, timeframe, date, status, confirmation count).
 *  - CLOSED ELITE signals, everyone else: the full official record (entry, SL, TP1-3, hit levels / result).
 * Locked previews are returned separately so code that expects full signals never receives one.
 */
export function feedForViewer(
  stored: PublishedTrade[],
  canSeeElite: boolean,
  counts: Record<string, unknown> = {},
): { trades: PublishedTrade[]; locked: LockedSignal[] } {
  const countOf = (id: string) => {
    const n = Number(counts[id]);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };
  const trades: PublishedTrade[] = [];
  const locked: LockedSignal[] = [];
  for (const t of stored) {
    const tier = tradeTier(t);
    if (tier === "elite" && !canSeeElite && !isClosed(t)) {
      locked.push({ id: t.id, createdAt: t.createdAt, pair: t.pair, timeframe: t.timeframe, status: "open", tier: "elite", locked: true, confirmations: countOf(t.id) });
    } else {
      trades.push({ ...t, tier, confirmations: countOf(t.id) });
    }
  }
  return { trades, locked };
}
