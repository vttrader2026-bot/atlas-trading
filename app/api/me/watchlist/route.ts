import { NextResponse } from "next/server";
import { requireUser } from "@/lib/userStore";
import { getUserPlan } from "@/lib/plan";
import { watchlistLimit } from "@/lib/watchlistConfig";
import { applyOp, normalizeState, type WatchOp } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

// Every key is derived from the signed-in session's user id. The request
// body can never name a user, so one account cannot read or write another's list.
const key = (userId: string) => `user:${userId}:watchlist`;

export async function GET() {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const [stored, plan] = await Promise.all([ctx.redis.get<unknown>(key(ctx.userId)), getUserPlan(ctx.userId)]);
    return NextResponse.json({ ...normalizeState(stored), limit: watchlistLimit(plan), plan });
  } catch (err) {
    console.error("watchlist GET failed:", err);
    return NextResponse.json({ error: "Could not load watchlist" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || typeof (body as { op?: unknown }).op !== "string") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  try {
    const [stored, plan] = await Promise.all([ctx.redis.get<unknown>(key(ctx.userId)), getUserPlan(ctx.userId)]);
    const limit = watchlistLimit(plan);
    const current = normalizeState(stored);
    const result = applyOp(current, body as WatchOp, limit);
    if (!result.ok) {
      const status = result.error === "limit" ? 409 : 400;
      return NextResponse.json({ error: result.error, ...current, limit, plan }, { status });
    }
    await ctx.redis.set(key(ctx.userId), result.state);
    return NextResponse.json({ ...result.state, limit, plan, dropped: result.dropped });
  } catch (err) {
    console.error("watchlist POST failed:", err);
    return NextResponse.json({ error: "Could not save watchlist" }, { status: 500 });
  }
}
