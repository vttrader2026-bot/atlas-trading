// FEED-ADMIN-v2: the owner's complete feed (FREE and ELITE, full levels) for /trade-feed. Owner-only (requireOwner; 404 to
// everyone else). It is separate from GET /api/trade-feed on purpose: that route, which the public feed and the bot's
// ecosystem rely on, is not changed and never grants ELITE to the owner account.
import { NextResponse } from "next/server";
import { noStore, requireOwner } from "@/lib/adminAuth";
import { FEED_MAX } from "@/lib/adminSignals";
import { CONFIRM_COUNTS_KEY, TRADE_FEED_KEY, feedForViewer, type PublishedTrade } from "@/lib/tradeFeed";
import { getRedis } from "@/lib/userStore";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  try {
    const stored = await redis.lrange<PublishedTrade>(TRADE_FEED_KEY, 0, FEED_MAX - 1);
    const counts = (await redis.hgetall<Record<string, unknown>>(CONFIRM_COUNTS_KEY).catch(() => null)) ?? {};
    return NextResponse.json({ trades: feedForViewer(stored, true, counts).trades }, { headers: noStore });
  } catch (err) {
    console.error("admin/signals/feed failed", err);
    return NextResponse.json({ error: "Could not load the feed" }, { status: 500 });
  }
}
