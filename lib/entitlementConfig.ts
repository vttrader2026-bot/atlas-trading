// ENTITLEMENTS-v1: the ONE place that defines what each membership plan includes. Pure data, no I/O, no Clerk, so server
// and (later) client code can both import it. Change a limit, a feature or the price here and nowhere else.
//
// Subscription state itself (who is ELITE, until when, suspended or not) is NOT stored here: the authoritative source is
// the member's Clerk privateMetadata (see lib/entitlementRules.ts and lib/entitlements.ts).
//
// The Atlas Academy has its own separate plan and is deliberately absent from every list below.

/** The only two membership plans. Anything unknown, retired or malformed is treated as "free". */
export type Plan = "free" | "elite";
export const PLANS: readonly Plan[] = ["free", "elite"] as const;

/** Countable allowances. */
export const LIMIT_KEYS = ["analyzerPerDay", "watchlistItems", "activeTradePlans", "activeDcaPlans"] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

/** The confirmed membership limits. */
export const PLAN_LIMITS: Record<Plan, Record<LimitKey, number>> = {
  free: { analyzerPerDay: 3, watchlistItems: 5, activeTradePlans: 5, activeDcaPlans: 2 },
  elite: { analyzerPerDay: 20, watchlistItems: 50, activeTradePlans: 50, activeDcaPlans: 20 },
};

/**
 * Whether the application enforces a limit today.
 *  - "live": enforced from PLAN_LIMITS now (the daily AI analyses, via lib/plan.ts).
 *  - "planned": defined here, not enforced yet. Existing enforcement (e.g. lib/watchlistConfig.ts) is unchanged until
 *    its own phase switches it over and flips this flag.
 */
export const LIMIT_ENFORCEMENT: Record<LimitKey, "live" | "planned"> = {
  analyzerPerDay: "live",
  watchlistItems: "planned",
  activeTradePlans: "planned",
  activeDcaPlans: "planned",
};

/** Access-controlled features that exist in the application and are decided by the plan. */
export const FEATURE_KEYS = ["eliteSignals", "eliteSignalConfirm"] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const PLAN_FEATURES: Record<Plan, Record<FeatureKey, boolean>> = {
  free: { eliteSignals: false, eliteSignalConfirm: false },
  elite: { eliteSignals: true, eliteSignalConfirm: true },
};

/** ATLAS ELITE price and period. One approved payment gives ELITE_PERIOD_DAYS days (lib/membership.ts ELITE_PAYMENT_DAYS). */
export const ELITE_PRICE = { usd: 14.99, usdLabel: "14.99", mru: 600 } as const;
export const ELITE_PERIOD_DAYS = 30;

/** Products that are sold and managed separately and must never be granted or limited by a Free/ELITE plan. */
export const EXCLUDED_FROM_MEMBERSHIP = ["academy"] as const;

/**
 * Membership verification cache (lib/entitlementCache.ts).
 *  - FRESH: a record verified by Clerk this recently is used without asking Clerk again.
 *  - STALE_GRACE: when Clerk cannot be reached, a verified ELITE record up to this old keeps ELITE access.
 */
export const ENTITLEMENT_FRESH_MS = 60_000;
export const ENTITLEMENT_STALE_GRACE_MS = 24 * 60 * 60 * 1000;
