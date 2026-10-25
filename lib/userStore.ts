import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Redis } from "@upstash/redis";
import { getRedis } from "@/lib/redis";

// Re-exported for backward compatibility — every existing caller that does
// `import { getRedis } from "@/lib/userStore"` keeps working unchanged.
// The real implementation lives in lib/redis.ts, which has no Clerk
// dependency (see that file for why).
export { getRedis };

export type UserContext = { userId: string; redis: Redis };

/** Returns the signed-in user and a Redis client, or a ready-made error response. */
export async function requireUser(): Promise<UserContext | NextResponse> {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const redis = getRedis();
  if (!redis) {
    console.error("user store: Upstash env vars are missing");
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  return { userId, redis };
}

export function clean(value: unknown, max = 500): string {
  if (typeof value === "string") return value.trim().slice(0, max);
  if (typeof value === "number") return String(value);
  return "";
}