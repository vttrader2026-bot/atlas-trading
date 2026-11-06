import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getRedis } from "@/lib/userStore";

/**
 * The only two plans: FREE and ATLAS ELITE. (Accounts that still carry the retired "analyzer" value in their Clerk
 * metadata are simply FREE; the stored value is never touched or deleted.)
 */
export type Plan = "free" | "elite";

// Single source of truth for what each plan includes. Change limits here,
// not in scattered checks elsewhere in the app.
const DAILY_ANALYZE_LIMIT: Record<Plan, number> = {
  free: 3,
  elite: 20,
};

/** User-facing message when today's analysis allowance is used up. */
export function analyzeLimitReachedMessage(plan: Plan, limit: number): string {
  return plan === "free"
    ? `You've used all ${limit} free analyses for today. This resets at midnight UTC. Upgrade to ATLAS ELITE for ${DAILY_ANALYZE_LIMIT.elite} a day.`
    : `You've used all ${limit} analyses for today. This resets at midnight UTC.`;
}

/**
 * ADMIN-v1: the plan a member ACTUALLY has right now, from their Clerk privateMetadata.
 *  - `suspended: true` removes paid access immediately (the stored plan is kept, so unsuspending restores it).
 *  - An ELITE plan with `eliteUntil` (epoch ms) stops at that moment. A malformed `eliteUntil` fails closed to "free".
 *  - ELITE without `eliteUntil` (every member created before expiry existed) has no end date and stays active.
 */
export function effectivePlan(meta: Record<string, unknown> | null | undefined, now: number = Date.now()): Plan {
  const raw = meta?.plan;
  if (raw !== "elite") return "free";
  if (meta?.suspended === true) return "free";
  const until = meta?.eliteUntil;
  if (until !== undefined && until !== null && (typeof until !== "number" || !Number.isFinite(until) || until <= now)) return "free";
  return "elite";
}

/**
 * The only function that should decide what plan a user is on. Reads
 * Clerk's server-only privateMetadata - never a client-supplied value -
 * and defaults to "free" for anyone with no plan set yet, or if anything
 * goes wrong reading it. A missing/anonymous userId is always "free".
 */
export async function getUserPlan(userId: string | null | undefined): Promise<Plan> {
  if (!userId) return "free";
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return effectivePlan(user.privateMetadata as Record<string, unknown> | null);
  } catch (err) {
    console.error("plan: getUserPlan failed, defaulting to free", err);
    return "free";
  }
}

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
export async function consumeAnalyzeUsage(userId: string): Promise<UsageResult> {
  const plan = await getUserPlan(userId);
  const limit = analyzeLimitForPlan(plan);
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
export async function peekAnalyzeUsage(userId: string): Promise<UsageResult> {
  const plan = await getUserPlan(userId);
  const limit = analyzeLimitForPlan(plan);
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
