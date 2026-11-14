// ENTITLEMENTS-v1: pure membership rules. No I/O and no framework imports, so everything here is easy to test and safe to
// import anywhere. The server service that reads Clerk lives in lib/entitlements.ts.
import {
  ENTITLEMENT_FRESH_MS, ENTITLEMENT_STALE_GRACE_MS, LIMIT_ENFORCEMENT, PLAN_FEATURES, PLAN_LIMITS, type FeatureKey, type LimitKey, type Plan,
} from "@/lib/entitlementConfig";

export type Meta = Record<string, unknown>;

/**
 * ADMIN-v1: the plan a member ACTUALLY has right now, from their Clerk privateMetadata.
 *  - `suspended: true` removes paid access immediately (the stored plan is kept, so unsuspending restores it).
 *  - An ELITE plan with `eliteUntil` (epoch ms) stops at that moment. A malformed `eliteUntil` fails closed to "free".
 *  - ELITE without `eliteUntil` (every member created before expiry existed) has no end date and stays active.
 * Anything else (no metadata, no plan, the retired "analyzer" value, garbage) is "free".
 */
export function effectivePlan(meta: Meta | null | undefined, now: number = Date.now()): Plan {
  const raw = meta?.plan;
  if (raw !== "elite") return "free";
  if (meta?.suspended === true) return "free";
  const until = meta?.eliteUntil;
  if (until !== undefined && until !== null && (typeof until !== "number" || !Number.isFinite(until) || until <= now)) return "free";
  return "elite";
}

export type MemberState = "free" | "active" | "unlimited" | "expired" | "suspended";

export type Membership = {
  /** What the member can use right now. */
  plan: Plan;
  /** The plan stored in Clerk (ELITE even when currently expired or suspended). */
  storedPlan: Plan;
  state: MemberState;
  /** Epoch ms the ELITE membership ends; null = none stored, or not a valid number. */
  eliteUntil: number | null;
  suspended: boolean;
  /** Stored values that looked wrong. They never grant access; they are reported for diagnostics only. */
  warnings: string[];
};

const FREE: Membership = { plan: "free", storedPlan: "free", state: "free", eliteUntil: null, suspended: false, warnings: [] };

/** Reads Clerk privateMetadata (any shape, including null or garbage) into a safe membership. Never throws. */
export function resolveMembership(meta: unknown, now: number = Date.now()): Membership {
  if (meta === null || meta === undefined) return { ...FREE, warnings: [] };
  if (typeof meta !== "object" || Array.isArray(meta)) return { ...FREE, warnings: ["metadata is not an object"] };
  const m = meta as Meta;
  const warnings: string[] = [];
  const raw = m.plan;
  if (raw !== undefined && raw !== null && raw !== "elite" && raw !== "analyzer") warnings.push("unknown plan value");
  const stored: Plan = raw === "elite" ? "elite" : "free";
  const until = m.eliteUntil;
  const validUntil = typeof until === "number" && Number.isFinite(until);
  if (until !== undefined && until !== null && !validUntil) warnings.push("invalid eliteUntil");
  if (m.suspended !== undefined && m.suspended !== null && typeof m.suspended !== "boolean") warnings.push("invalid suspended flag");
  const suspended = m.suspended === true;
  const plan = effectivePlan(m, now);
  let state: MemberState;
  if (stored !== "elite") state = "free";
  else if (suspended) state = "suspended";
  else if (until === undefined || until === null) state = "unlimited";
  else state = plan === "elite" ? "active" : "expired";
  return { plan, storedPlan: stored, state, eliteUntil: validUntil ? (until as number) : null, suspended, warnings };
}

export type Entitlements = {
  plan: Plan;
  limits: Record<LimitKey, number>;
  features: Record<FeatureKey, boolean>;
};

/** What a plan includes. Returns copies, so callers cannot change the configuration. */
export function entitlementsFor(plan: Plan | string | null | undefined): Entitlements {
  const p: Plan = plan === "elite" ? "elite" : "free";
  return { plan: p, limits: { ...PLAN_LIMITS[p] }, features: { ...PLAN_FEATURES[p] } };
}

export const limitFor = (plan: Plan | string | null | undefined, key: LimitKey): number => entitlementsFor(plan).limits[key];
export const hasFeature = (plan: Plan | string | null | undefined, key: FeatureKey): boolean => entitlementsFor(plan).features[key] === true;
export const isEnforced = (key: LimitKey): boolean => LIMIT_ENFORCEMENT[key] === "live";

export type LimitDecision = {
  /** May ONE more item be created? */
  allowed: boolean;
  limit: number;
  count: number;
  remaining: number;
  /** The member already holds more than the limit (e.g. after a downgrade). Grandfathered: nothing is removed. */
  overLimit: boolean;
};

/**
 * Create-time check. Only CREATING is ever refused: a member at or over the limit keeps, edits, closes and deletes what
 * they have (grandfathering). `count` must be the current number of items that count towards the limit.
 *
 * This is a plain read-then-decide helper. Enforcement under concurrent requests needs an atomic reservation at the
 * storage layer (a later phase); this function is what that reservation compares against.
 */
export function checkLimit(plan: Plan | string | null | undefined, key: LimitKey, count: number): LimitDecision {
  const limit = limitFor(plan, key);
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return { allowed: n < limit, limit, count: n, remaining: Math.max(0, limit - n), overLimit: n > limit };
}

/**
 * How a membership answer was obtained.
 *  - verified:   read from Clerk just now.
 *  - cached:     a record Clerk verified within the last ENTITLEMENT_FRESH_MS.
 *  - stale:      Clerk is unreachable; a verified ELITE record within ENTITLEMENT_STALE_GRACE_MS still grants ELITE.
 *  - anonymous:  no signed-in user. Confirmed Free.
 *  - unverified: Clerk is unreachable and nothing usable is cached. The member's real plan is UNKNOWN (not "confirmed
 *                Free"): callers that would harm a paying member by treating them as Free must refuse or skip.
 */
export type VerificationStatus = "verified" | "cached" | "stale" | "anonymous" | "unverified";

/** The plan is a confirmed fact (Clerk said so, or there is no user at all). */
export const isConfirmed = (s: VerificationStatus): boolean => s !== "unverified";

/** What the cache stores about a member: the Clerk-verified values only, never a computed access decision. */
export type VerifiedRecord = { v: 1; plan: Plan; eliteUntil: number | null; suspended: boolean; verifiedAt: number };

/** Rebuilds Clerk-style metadata from a record so the ordinary rules (expiry, suspension) run against the CURRENT time. */
export const recordMeta = (r: VerifiedRecord): Meta => ({ plan: r.plan, suspended: r.suspended, ...(r.eliteUntil === null ? {} : { eliteUntil: r.eliteUntil }) });

/**
 * Decides what a cached record may be used for.
 *  - "fresh": the record is at most ENTITLEMENT_FRESH_MS old -> status "cached" (plan recomputed with `now`).
 *  - "stale": Clerk is unreachable. ONLY an ELITE record younger than ENTITLEMENT_STALE_GRACE_MS that is STILL ELITE at
 *    `now` (not expired, not suspended) qualifies -> status "stale". A cached Free record, an expired or suspended
 *    snapshot, an old record or a future-dated one never grants anything: the result is null (-> unverified).
 * Returns null when the record may not be used in that mode.
 */
export function membershipFromRecord(r: VerifiedRecord, now: number, mode: "fresh" | "stale"): { membership: Membership; status: "cached" | "stale" } | null {
  const age = now - r.verifiedAt;
  if (!Number.isFinite(age) || age < -5_000) return null; // future-dated (clock skew beyond 5 s): not trustworthy
  const membership = resolveMembership(recordMeta(r), now);
  if (mode === "fresh") return age <= ENTITLEMENT_FRESH_MS ? { membership, status: "cached" } : null;
  if (r.plan !== "elite" || age > ENTITLEMENT_STALE_GRACE_MS || membership.plan !== "elite") return null;
  return { membership, status: "stale" };
}

/**
 * The record to cache for a membership that Clerk just verified. A malformed `eliteUntil` is cached as FREE (the
 * fail-closed effective plan), never as an ELITE record without an end date.
 */
export function recordFromMembership(m: Membership, verifiedAt: number): VerifiedRecord {
  if (m.warnings.includes("invalid eliteUntil")) return { v: 1, plan: "free", eliteUntil: null, suspended: false, verifiedAt };
  return { v: 1, plan: m.storedPlan, eliteUntil: m.eliteUntil, suspended: m.suspended, verifiedAt };
}
