import { NextResponse } from "next/server";
import { requireUser } from "@/lib/userStore";
import { applyWatchOp, normalizeWatch, MAX_WATCHED, type WatchOp } from "@/lib/signalLink";

export const dynamic = "force-dynamic";

// The signals a user follows (Watch Signal). Private: the key comes from the signed-in session,
// the request body can never name a user. Official signal data stays in the Trade Feed; this
// only remembers WHICH signals the user follows and what they had already seen.
const key = (userId: string) => `user:${userId}:signals`;

export async function GET() {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const stored = await ctx.redis.get<unknown>(key(ctx.userId));
    return NextResponse.json({ ...normalizeWatch(stored), limit: MAX_WATCHED });
  } catch (err) {
    console.error("signals GET failed:", err);
    return NextResponse.json({ error: "Could not load watched signals" }, { status: 500 });
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
  const op = (body as { op?: unknown } | null)?.op;
  if (op !== "watch" && op !== "unwatch" && op !== "seen") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  try {
    const current = normalizeWatch(await ctx.redis.get<unknown>(key(ctx.userId)));
    const result = applyWatchOp(current, body as WatchOp);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, ...current, limit: MAX_WATCHED }, { status: result.error === "limit" ? 409 : 400 });
    }
    await ctx.redis.set(key(ctx.userId), result.state);
    return NextResponse.json({ ...result.state, limit: MAX_WATCHED });
  } catch (err) {
    console.error("signals POST failed:", err);
    return NextResponse.json({ error: "Could not save watched signals" }, { status: 500 });
  }
}
