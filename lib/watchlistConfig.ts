// Watchlist limits per plan. The numbers live ONLY in lib/entitlementConfig.ts (PLAN_LIMITS.*.watchlistItems);
// this is a thin adapter so Watchlist code keeps one familiar function. Do not add numbers here.
import { limitFor } from "@/lib/entitlementRules";

export function watchlistLimit(plan: string | null | undefined): number {
  return limitFor(plan, "watchlistItems");
}
