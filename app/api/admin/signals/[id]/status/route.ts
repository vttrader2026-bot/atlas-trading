// FEED-ADMIN-v1: owner updates the result of a published signal: TP1 / TP2 / TP3 / SL hit.
// TP1 and TP2 are PARTIAL: the hit is recorded and the signal stays open (recordTargetHit). TP3 and SL close it through the
// existing closeSignal(). A target already recorded is refused (409), so it is never stored or notified twice. Original levels are kept. Cancelling is a separate route
// (./cancel) and deleting is DELETE on the parent route. FREE signals notify exactly like the bot's TP/SL update does;
// ELITE signals never push to the general subscriber list.
import { NextResponse, after } from "next/server";
import { auditLog, needsConfirm, noStore, readBody, requireOwner } from "@/lib/adminAuth";
import { FEED_MAX } from "@/lib/adminSignals";
import { notifyTpSlSubscribers } from "@/lib/push";
import { TRADE_FEED_KEY, closeSignal, recordTargetHit, tradeTier, type CloseOutcome, type PublishedTrade } from "@/lib/tradeFeed";
import { getRedis } from "@/lib/userStore";

export const dynamic = "force-dynamic";

const OUTCOMES: readonly CloseOutcome[] = ["TP1", "TP2", "TP3", "SL"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { id } = await params;
  const body = (await readBody(req)) ?? {};
  const denied = needsConfirm(body);
  if (denied) return denied;
  const outcome = OUTCOMES.find((o) => o === body.outcome);
  if (!outcome) return NextResponse.json({ error: "Choose TP1, TP2, TP3 or SL (use Cancel to cancel a signal)" }, { status: 400 });
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  try {
    const trades = await redis.lrange<PublishedTrade>(TRADE_FEED_KEY, 0, FEED_MAX - 1);
    const index = trades.findIndex((t) => t.id === id);
    if (index === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const current = trades[index];
    if (current.status === "closed" || current.closing) return NextResponse.json({ error: "Already closed" }, { status: 409 });
    const target = outcome === "SL" ? current.invalidation : [current.tp1, current.tp2, current.tp3][Number(outcome.slice(2)) - 1];
    if (!target) return NextResponse.json({ error: `This signal has no ${outcome}` }, { status: 400 });
    if ((current.hitLevels ?? []).includes(outcome)) return NextResponse.json({ error: `${outcome} is already recorded` }, { status: 409 });
    const partial = outcome === "TP1" || outcome === "TP2";
    const updated = partial ? recordTargetHit(current, outcome) : closeSignal(current, outcome, reason, Date.now());
    if (!updated) return NextResponse.json({ error: `${outcome} is already recorded` }, { status: 409 });
    await redis.lset(TRADE_FEED_KEY, index, updated);
    await auditLog(redis, owner.userId, "signal.status", id, { tier: tradeTier(updated), outcome, closed: !partial });
    if (tradeTier(updated) === "free") {
      const before = current.hitLevels ?? [];
      for (const level of (updated.hitLevels ?? []).filter((l) => !before.includes(l))) after(() => notifyTpSlSubscribers(updated, level));
    }
    return NextResponse.json({ ok: true, trade: updated }, { headers: noStore });
  } catch (err) {
    console.error("admin/signals status failed", err);
    return NextResponse.json({ error: "Could not update the signal" }, { status: 500 });
  }
}
