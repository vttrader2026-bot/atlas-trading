// Watchlist limits per plan. Change the numbers here and nowhere else.
// (Analyzer-only members get the free allowance; only Elite gets the larger one.)
export const WATCHLIST_LIMITS = {
  free: 10,
  analyzer: 10,
  elite: 50,
} as const;

export function watchlistLimit(plan: string | null | undefined): number {
  if (plan === "elite") return WATCHLIST_LIMITS.elite;
  if (plan === "analyzer") return WATCHLIST_LIMITS.analyzer;
  return WATCHLIST_LIMITS.free;
}
