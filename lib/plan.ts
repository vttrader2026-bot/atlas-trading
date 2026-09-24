import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getRedis } from "@/lib/userStore";

export type Plan = "free" | "elite";

// Single source of truth for what each plan includes. Change limits here,
// not in scattered checks elsewhere in the app.
const DAILY_ANALYZE_LIMIT: Record<Plan, number> = {
  free: 2,
  elite: 20,
};

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
    const raw = (user.privateMetadata as Record<string, unknown> | null)?.plan;
    return raw === "elite" ? "elite" : "free";
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

type UsageResult = { allowed: boolean; remaining: number; limit: number; plan: Plan };

/**
 * Server-side, account-based daily counter for the AI analyzer. Signed-in
 * only - clearing localStorage or switching browsers has no effect, since
 * the count lives in Redis keyed by the user's Clerk id and today's date
 * (UTC), not anything the client can touch. Call once per analyze attempt,
 * before doing the expensive work.
 */
export async function consumeAnalyzeUsage(userId: string): Promise<UsageResult> {
  const plan = await getUserPlan(userId);
  const limit = analyzeLimitForPlan(plan);
  const redis = getRedis();
  if (!redis) {
    // Upstash isn't configured: fail open rather than blocking every
    // analysis outright, but log it so a misconfiguration doesn't go
    // unnoticed.
    console.error("plan: Upstash not configured, cannot enforce account-based usage limits");
    return { allowed: true, remaining: limit, limit, plan };
  }
  const day = new Date().toISOString().slice(0, 10);
  const key = `usage:analyze:${userId}:${day}`;
  try {
    const current = (await redis.get<number>(key)) ?? 0;
    if (current >= limit) {
      return { allowed: false, remaining: 0, limit, plan };
    }
    const next = await redis.incr(key);
    if (next === 1) {
      await redis.expire(key, 60 * 60 * 26);
    }
    return { allowed: true, remaining: Math.max(0, limit - next), limit, plan };
  } catch (err) {
    console.error("plan: consumeAnalyzeUsage failed, failing open", err);
    return { allowed: true, remaining: limit, limit, plan };
  }
}

/**
 * Like consumeAnalyzeUsage, but read-only ? does not increment the
 * counter. Used to show an accurate remaining count on page load
 * without spending one of the user's analyses just by visiting.
 */
export async function peekAnalyzeUsage(userId: string): Promise<UsageResult> {
  const plan = await getUserPlan(userId);
  const limit = analyzeLimitForPlan(plan);
  const redis = getRedis();
  if (!redis) {
    return { allowed: true, remaining: limit, limit, plan };
  }
  const day = new Date().toISOString().slice(0, 10);
  const key = `usage:analyze:${userId}:${day}`;
  try {
    const current = (await redis.get<number>(key)) ?? 0;
    const remaining = Math.max(0, limit - current);
    return { allowed: remaining > 0, remaining, limit, plan };
  } catch (err) {
    console.error("plan: peekAnalyzeUsage failed, failing open", err);
    return { allowed: true, remaining: limit, limit, plan };
  }
}