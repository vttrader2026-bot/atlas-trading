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
};
