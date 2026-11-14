import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getRedis } from "@/lib/userStore";
import { PLAN_LIMITS, type Plan } from "@/lib/entitlementConfig";
import { effectivePlan } from "@/lib/entitlementRules";
import { getEntitlements, type MemberEntitlements } from "@/lib/entitlements";

// Kept here so every existing import keeps working; the rules and the configuration live in lib/entitlement*.ts.
export { effectivePlan };
export type { Plan };

// Single source of truth for what each plan includes: lib/entitlementConfig.ts. Change limits there, not here.
const DAILY_ANALYZE_LIMIT: Record<Plan, number> = {
  free: PLAN_LIMITS.free.analyzerPerDay,
  elite: PLAN_LIMITS.elite.analyzerPerDay,
};

/** User-facing message when today's analysis allowance is used up. */
export function analyzeLimitReachedMessage(plan: Plan, limit: number): string {
  return plan === "free"
    ? `You've used all ${limit} free analyses for today. This resets at midnight UTC. Upgrade to ATLAS ELITE for ${DAILY_ANALYZE_LIMIT.elite} a day.`
    : `You've used all ${limit} analyses for today. This resets at midnight UTC.`;
}

/**
 * The only function that should decide what plan a user is on. Reads
 * Clerk's server-only privateMetadata - never a client-supplied value -
 * and defaults to "free" for anyone with no plan set yet, or if anything
 * goes wrong reading it. A missing/anonymous userId is always "free".
 */
export async function getUserPlan(userId: string | null | undefined): Promise<Plan> {
  // NOTE: an "unverified" member (Clerk unreachable, nothing cached) is reported as "free" here. Code that would harm a
  // paying member by treating them as Free must call getEntitlements() and check `status` instead.
  return (await getEntitlements(userId)).plan;
}

/** The membership snapshot a request resolved once (see getEntitlements); passing it avoids a second lookup. */
export type MembershipSnapshot = Pick<MemberEntitlements, "plan" | "status">;

/** Is the currently signed-in user (per this request's session) on Elite? */
export async function isElite(): Promise<boolean> {
  const { userId } = await auth();
  return (await getUserPlan(userId)) === "elite";
}

/**
 * Route/Server Component guard for Elite-only features. Returns the
 * signed-in user's id once confirmed Elite, or a ready-made 401/403
 * NextResponse to return as-is when they aren't signed in or aren't
 * Elite. Nothing should gate on a client-supplied plan value - always
 * call this (or getUserPlan) server-side instead.
 */
export async function requireElite(): Promise<{ userId: string } | NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const plan = await getUserPlan(userId);
  if (plan !== "elite") {
    return NextResponse.json({ error: "Elite membership required" }, { status: 403 });
  }
  return { userId };
}

/** How many AI analyses per day a given plan includes. */
export function analyzeLimitForPlan(plan: Plan): number {
  return DAILY_ANALYZE_LIMIT[plan];
}

export type UsageResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  plan: Plan;
  /** True when the usage counter could not be read or written (Redis missing or down). Never a free pass. */
  unavailable?: boolean;
};

/** Shown when the daily counter cannot be checked. We refuse instead of silently skipping the plan limit. */
export const USAGE_UNAVAILABLE_MESSAGE =
  "Usage tracking is temporarily unavailable, so the analyzer is paused to protect your plan limits. Please try again in a few minutes.";

const usageUnavailable = (plan: Plan, limit: number): UsageResult => ({ allowed: false, remaining: 0, limit, plan, unavailable: true });
const usageKey = (userId: string) => `usage:analyze:${userId}:${new Date().toISOString().slice(0, 10)}`;

/**
 * Server-side, account-based daily counter for the AI analyzer, keyed by the user's Clerk id and
 * today's UTC date in Redis, so nothing the client holds can change it.
 *
 * FAILS CLOSED: if Redis is not configured or errors, the call is refused (`unavailable: true`)
 * rather than letting FREE or ELITE users past their limit. The increment is atomic (INCR first,
 * then compare), so parallel requests cannot all slip under the limit.
 */
export async function consumeAnalyzeUsage(userId: string, membership?: MembershipSnapshot): Promise<UsageResult> {
  const m = membership ?? (await getEntitlements(userId));
  const plan = m.plan;
  const limit = analyzeLimitForPlan(plan);
  if (m.status === "unverified") return usageUnavailable(plan, limit); // membership unknown: never touch the counter
  const redis = getRedis();
  if (!redis) {
    console.error("plan: Upstash not configured - refusing analysis because usage limits cannot be enforced");
    return usageUnavailable(plan, limit);
  }
  const key = usageKey(userId);
  try {
    const next = await redis.incr(key);
    if (next === 1) await redis.expire(key, 60 * 60 * 26);
    if (next > limit) {
      try {
        await redis.decr(key); // do not let refused attempts push the counter ever higher
      } catch {
        /* the counter stays >= limit, which is still a refusal */
      }
      return { allowed: false, remaining: 0, limit, plan };
    }
    return { allowed: true, remaining: Math.max(0, limit - next), limit, plan };
  } catch (err) {
    console.error("plan: consumeAnalyzeUsage failed - refusing (fail closed)", err);
    return usageUnavailable(plan, limit);
  }
}

/**
 * Like consumeAnalyzeUsage, but read-only: does not increment the counter. Used for the up-front
 * check and to show an accurate remaining count without spending an analysis. Fails closed too.
 */
export async function peekAnalyzeUsage(userId: string, membership?: MembershipSnapshot): Promise<UsageResult> {
  const m = membership ?? (await getEntitlements(userId));
  const plan = m.plan;
  const limit = analyzeLimitForPlan(plan);
  if (m.status === "unverified") return usageUnavailable(plan, limit);
  const redis = getRedis();
  if (!redis) {
    console.error("plan: Upstash not configured - cannot read usage");
    return usageUnavailable(plan, limit);
  }
  try {
    const current = Number((await redis.get<number>(usageKey(userId))) ?? 0);
    if (!Number.isFinite(current)) return usageUnavailable(plan, limit);
    const remaining = Math.max(0, limit - current);
    return { allowed: remaining > 0, remaining, limit, plan };
  } catch (err) {
    console.error("plan: peekAnalyzeUsage failed - refusing (fail closed)", err);
    return usageUnavailable(plan, limit);
  }
}
