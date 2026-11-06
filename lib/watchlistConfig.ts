// Watchlist limits per plan. Change the numbers here and nowhere else.
export const WATCHLIST_LIMITS = {
  free: 10,
  elite: 50,
} as const;

export function watchlistLimit(plan: string | null | undefined): number {
  return plan === "elite" ? WATCHLIST_LIMITS.elite : WATCHLIST_LIMITS.free;
}
