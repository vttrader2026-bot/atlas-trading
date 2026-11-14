// ENTITLEMENTS-v1: the server-side entitlement service. The authoritative subscription source is the member's Clerk
// privateMetadata ({ plan, eliteUntil, suspended }), read here on the server. Nothing the client sends (a plan name, a
// limit, a header) is ever consulted. All decisions come from lib/entitlementRules.ts and lib/entitlementConfig.ts.
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  checkLimit, entitlementsFor, hasFeature, membershipFromRecord, recordFromMembership, resolveMembership,
  type Entitlements, type LimitDecision, type Membership, type VerificationStatus,
} from "@/lib/entitlementRules";
import { invalidateEntitlements, readEntitlementRecord, writeVerifiedEntitlement } from "@/lib/entitlementCache";
import type { FeatureKey, LimitKey } from "@/lib/entitlementConfig";

export { invalidateEntitlements };

export type MemberEntitlements = Entitlements & {
  membership: Membership;
  /** How this answer was obtained. "unverified" means the plan is UNKNOWN (Clerk unreachable, nothing cached), not "Free". */
  status: VerificationStatus;
  /** Deprecated (kept for existing callers): "clerk" = verified/cached, "cache" = stale, "fallback" = anonymous/unverified. */
  source: "clerk" | "cache" | "fallback";
};

const SOURCE: Record<VerificationStatus, MemberEntitlements["source"]> = { verified: "clerk", cached: "clerk", stale: "cache", anonymous: "fallback", unverified: "fallback" };

const build = (membership: Membership, status: VerificationStatus): MemberEntitlements => ({ ...entitlementsFor(membership.plan), membership, status, source: SOURCE[status] });

/**
 * Entitlements of a user id, always resolved on the server:
 *  1. no user id                          -> "anonymous" (confirmed Free)
 *  2. cache verified < 60 s ago           -> "cached"
 *  3. Clerk                               -> "verified" (and refreshes the cache)
 *  4. Clerk down, ELITE verified < 24 h   -> "stale" (ELITE kept while still unexpired and not suspended)
 *  5. Clerk down, nothing usable          -> "unverified" (plan reported as free for display, but UNKNOWN)
 * Never throws. A cached Free record never grants ELITE.
 */
export async function getEntitlements(userId: string | null | undefined, now: number = Date.now()): Promise<MemberEntitlements> {
  if (!userId) return build(resolveMembership(null, now), "anonymous");

  const record = await readEntitlementRecord(userId);
  if (record) {
    const fresh = membershipFromRecord(record, now, "fresh");
    if (fresh) return build(fresh.membership, "cached");
  }

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const membership = resolveMembership(user.privateMetadata, now);
    if (membership.warnings.length) console.error("entitlements: unexpected membership metadata", userId, membership.warnings);
    // `now` is when this lookup STARTED, which is what lets the cache reject a result that predates a later invalidation.
    await writeVerifiedEntitlement(userId, recordFromMembership(membership, now));
    return build(membership, "verified");
  } catch (err) {
    console.error("plan: Clerk lookup failed", err);
    if (record) {
      const stale = membershipFromRecord(record, now, "stale");
      if (stale) {
        console.error("entitlements: Clerk unreachable, keeping verified ELITE membership from the cache", userId);
        return build(stale.membership, "stale");
      }
    }
    return build(resolveMembership(null, now), "unverified");
  }
}

export type EntitlementErrorCode = "unauthorized" | "feature_locked" | "limit_reached";

/** Standard error body for entitlement refusals, so every route answers the same way. */
export function entitlementError(code: EntitlementErrorCode, extra: { plan?: string; limit?: number; feature?: string } = {}): NextResponse {
  const status = code === "unauthorized" ? 401 : code === "feature_locked" ? 403 : 409;
  const message = code === "unauthorized" ? "Unauthorized" : code === "feature_locked" ? "Elite membership required" : "Plan limit reached";
  return NextResponse.json({ error: message, code, ...extra }, { status });
}

/** Route guard: the signed-in user's entitlements, or a ready-made 401. */
export async function requireEntitlements(): Promise<{ userId: string; ent: MemberEntitlements } | NextResponse> {
  const { userId } = await auth();
  if (!userId) return entitlementError("unauthorized");
  return { userId, ent: await getEntitlements(userId) };
}

/** Null when the member has the feature, otherwise a ready-made 403. */
export function denyUnlessFeature(ent: Pick<Entitlements, "plan">, feature: FeatureKey): NextResponse | null {
  return hasFeature(ent.plan, feature) ? null : entitlementError("feature_locked", { plan: ent.plan, feature });
}

/** Null when one more item may be created, otherwise a ready-made 409. Pair with a COUNT taken on the server. */
export function denyIfAtLimit(ent: Pick<Entitlements, "plan">, key: LimitKey, count: number): { response: NextResponse; decision: LimitDecision } | null {
  const decision = checkLimit(ent.plan, key, count);
  return decision.allowed ? null : { response: entitlementError("limit_reached", { plan: ent.plan, limit: decision.limit }), decision };
}

/** 503 for an unverified member: retryable, nothing was consumed, no provider was called. */
export const MEMBERSHIP_UNVERIFIED_MESSAGE = "We could not verify your membership right now. Nothing was used. Please try again in a moment.";
export function membershipUnverifiedResponse(): NextResponse {
  return NextResponse.json(
    { error: MEMBERSHIP_UNVERIFIED_MESSAGE, code: "membership_unverified", retryable: true },
    { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } },
  );
}
