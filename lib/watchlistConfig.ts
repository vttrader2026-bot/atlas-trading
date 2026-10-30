// Watchlist limits per plan. Change the numbers here and nowhere else.
// Analyzer Pro and Elite both get the larger allowance.
export const WATCHLIST_LIMITS = {
  free: 10,
  analyzer: 50,
  elite: 50,
} as const;

export function watchlistLimit(plan: string | null | undefined): number {
  if (plan === "elite") return WATCHLIST_LIMITS.elite;
  if (plan === "analyzer") return WATCHLIST_LIMITS.analyzer;
  return WATCHLIST_LIMITS.free;
}

// ATLAS-ALL-1800
