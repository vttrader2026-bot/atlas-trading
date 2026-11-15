import { NextResponse } from "next/server";
import { requireUser } from "@/lib/userStore";
import { getEntitlements } from "@/lib/entitlements";
import { watchlistLimit } from "@/lib/watchlistConfig";
import { normalizeState, type WatchOp } from "@/lib/watchlist";
import { NO_LIMIT, updateWatchlist, watchlistKey, type WatchRedis } from "@/lib/watchlistAtomic";

export const dynamic = "force-dynamic";

// Every key is derived from the signed-in session's user id. The request
// body can never name a user, so one account cannot read or write another's list.

const noStore = { "Cache-Control": "no-store" };

/** PHASE-3A: membership could not be confirmed. Never treated as Free; nothing was changed. Safe to retry. */
function membershipUnverified() {
  return NextResponse.json(
    { error: "We could not verify your membership right now. Nothing was changed. Please try again in a moment.", code: "membership_unverified", retryable: true },
    { status: 503, headers: { ...noStore, "Retry-After": "30" } },
  );
}

export async function GET() {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const [stored, ent] = await Promise.all([ctx.redis.get<unknown>(watchlistKey(ctx.userId)), getEntitlements(ctx.userId)]);
    // Reading never needs a verified plan. When it is unverified the list is still shown, without a limit.
    if (ent.status === "unverified") return NextResponse.json({ ...normalizeState(stored), unverified: true }, { headers: noStore });
    return NextResponse.json({ ...normalizeState(stored), limit: watchlistLimit(ent.plan), plan: ent.plan }, { headers: noStore });
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
  const op = body as WatchOp;
  try {
    const ent = await getEntitlements(ctx.userId);
    const verified = ent.status !== "unverified";
    const grows = op.op === "add" || op.op === "merge";
    // Adding needs a verified plan. Removing and "seen" never grow the list, so they work even when membership is unknown.
    if (grows && !verified) return membershipUnverified();
    const limit = verified ? watchlistLimit(ent.plan) : NO_LIMIT;
    const result = await updateWatchlist(ctx.redis as unknown as WatchRedis, ctx.userId, op, limit);
    const info = verified ? { limit, plan: ent.plan } : {};
    if (!result.ok) {
      if (result.error === "busy") return NextResponse.json({ error: "Busy, please retry", retryable: true }, { status: 503, headers: { ...noStore, "Retry-After": "1" } });
      return NextResponse.json({ error: result.error, ...result.state, ...info }, { status: result.error === "limit" ? 409 : 400, headers: noStore });
    }
    return NextResponse.json({ ...result.state, ...info, dropped: result.dropped }, { headers: noStore });
  } catch (err) {
    console.error("watchlist POST failed:", err);
    return NextResponse.json({ error: "Could not save watchlist" }, { status: 500 });
  }
}
