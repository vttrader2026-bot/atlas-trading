// ADMIN-v1: publish a draft into the existing Trade Feed. The tier was chosen on the draft and is fixed from now on.
import { NextResponse, after } from "next/server";
import { auditLog, needsConfirm, noStore, readBody, requireOwner } from "@/lib/adminAuth";
import { DRAFTS_KEY, FEED_MAX, draftToTrade, type SignalDraft } from "@/lib/adminSignals";
import { notifyTradeSubscribers } from "@/lib/push";
import { TRADE_FEED_KEY } from "@/lib/tradeFeed";
import { getRedis } from "@/lib/userStore";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { id } = await params;
  const body = (await readBody(req)) ?? {};
  const denied = needsConfirm(body);
  if (denied) return denied;
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  try {
    const draft = await redis.hget<SignalDraft>(DRAFTS_KEY, id);
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    // Whoever removes the draft first publishes it, so a double click cannot publish twice.
    if (!(await redis.hdel(DRAFTS_KEY, id))) return NextResponse.json({ error: "Already published" }, { status: 409 });
    const trade = draftToTrade(draft, Date.now());
    try {
      await redis.lpush(TRADE_FEED_KEY, trade);
      await redis.ltrim(TRADE_FEED_KEY, 0, FEED_MAX - 1);
    } catch (err) {
      await redis.hset(DRAFTS_KEY, { [id]: draft }).catch(() => {});
      throw err;
    }
    after(() => notifyTradeSubscribers(trade));
    await auditLog(redis, owner.userId, "signal.publish", id, { pair: trade.pair, tier: trade.tier });
    return NextResponse.json({ ok: true, trade }, { status: 201, headers: noStore });
  } catch (err) {
    console.error("admin/signals publish failed", err);
    return NextResponse.json({ error: "Could not publish the signal" }, { status: 500 });
  }
}
