// ADMIN-v1: cancel a published (open) signal with the existing closeSignal(): original levels are kept, a closing record is added.
import { NextResponse } from "next/server";
import { auditLog, needsConfirm, noStore, readBody, requireOwner } from "@/lib/adminAuth";
import { TRADE_FEED_KEY, closeSignal, tradeTier, type PublishedTrade } from "@/lib/tradeFeed";
import { getRedis } from "@/lib/userStore";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { id } = await params;
  const body = (await readBody(req)) ?? {};
  const denied = needsConfirm(body);
  if (denied) return denied;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  try {
    const trades = await redis.lrange<PublishedTrade>(TRADE_FEED_KEY, 0, 49);
    const index = trades.findIndex((t) => t.id === id);
    if (index === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (trades[index].status === "closed" || trades[index].closing) return NextResponse.json({ error: "Already closed" }, { status: 409 });
    const closed = closeSignal(trades[index], "CANCELLED", reason, Date.now());
    await redis.lset(TRADE_FEED_KEY, index, closed);
    await auditLog(redis, owner.userId, "signal.cancel", id, { tier: tradeTier(closed) });
    return NextResponse.json({ ok: true, trade: closed }, { headers: noStore });
  } catch (err) {
    console.error("admin/signals cancel failed", err);
    return NextResponse.json({ error: "Could not cancel the signal" }, { status: 500 });
  }
}
