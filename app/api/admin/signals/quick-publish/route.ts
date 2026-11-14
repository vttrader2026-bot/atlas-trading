// OWNER-PUBLISH-v1: publish a setup straight from the Analyzer, Live Chart Analyzer or Trade Plan into the EXISTING Trade
// Feed. Same guard, record, tiers, notification and audit trail as the draft publish route; it only skips the draft.
// The owner is the signed-in Clerk user (requireOwner); nothing the browser sends can grant that.
import { NextResponse, after } from "next/server";
import { randomUUID } from "crypto";
import { auditLog, needsConfirm, noStore, readBody, requireOwner } from "@/lib/adminAuth";
import { FEED_MAX, draftToTrade, parseTier } from "@/lib/adminSignals";
import { DUPLICATE_WINDOW_MS, sameSetup, validateSpotSetup, type PublishSource } from "@/lib/ownerPublish";
import { notifyTradeSubscribers } from "@/lib/push";
import { TRADE_FEED_KEY, type PublishedTrade } from "@/lib/tradeFeed";
import { getRedis } from "@/lib/userStore";

export const dynamic = "force-dynamic";

const SOURCES: readonly PublishSource[] = ["analyzer", "trade-plan"];

export async function POST(req: Request) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const denied = needsConfirm(body);
  if (denied) return denied;
  const tier = parseTier(body.tier); // no default: FREE or ELITE must be chosen explicitly
  if (!tier) return NextResponse.json({ error: "Choose FREE or ELITE visibility" }, { status: 400 });
  const source = SOURCES.find((s) => s === body.source);
  if (!source) return NextResponse.json({ error: "Unknown source" }, { status: 400 });
  const setup = validateSpotSetup(body);
  if (!setup.ok) return NextResponse.json({ error: setup.error }, { status: 400 });
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  try {
    const now = Date.now();
    const recent = await redis.lrange<PublishedTrade>(TRADE_FEED_KEY, 0, FEED_MAX - 1);
    if (recent.some((t) => now - t.createdAt < DUPLICATE_WINDOW_MS && sameSetup(t, { ...setup.value, tier }))) {
      return NextResponse.json({ error: "This setup was just published" }, { status: 409 });
    }
    const trade = draftToTrade({ id: randomUUID(), createdAt: now, updatedAt: now, tier, ...setup.value }, now);
    await redis.lpush(TRADE_FEED_KEY, trade);
    await redis.ltrim(TRADE_FEED_KEY, 0, FEED_MAX - 1);
    after(() => notifyTradeSubscribers(trade));
    await auditLog(redis, owner.userId, "signal.publish", trade.id, { pair: trade.pair, tier, source });
    return NextResponse.json({ ok: true, id: trade.id, tier }, { status: 201, headers: noStore });
  } catch (err) {
    console.error("admin/signals quick-publish failed", err);
    return NextResponse.json({ error: "Could not publish the signal" }, { status: 500 });
  }
}
