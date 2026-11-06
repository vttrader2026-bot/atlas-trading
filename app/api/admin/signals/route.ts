// ADMIN-v1: owner-only signal list and draft creation.
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auditLog, noStore, readBody, requireOwner } from "@/lib/adminAuth";
import { DRAFTS_KEY, parseSignalFields, parseTier, type SignalDraft } from "@/lib/adminSignals";
import { CONFIRM_COUNTS_KEY, TRADE_FEED_KEY, tradeTier, type PublishedTrade } from "@/lib/tradeFeed";
import { getRedis } from "@/lib/userStore";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  try {
    const [stored, draftMap, counts] = await Promise.all([
      redis.lrange<PublishedTrade>(TRADE_FEED_KEY, 0, 49),
      redis.hgetall<Record<string, SignalDraft>>(DRAFTS_KEY),
      redis.hgetall<Record<string, unknown>>(CONFIRM_COUNTS_KEY).catch(() => ({}) as Record<string, unknown>),
    ]);
    const drafts = Object.values(draftMap ?? {}).sort((a, b) => b.updatedAt - a.updatedAt);
    const published = stored.map((t) => ({ ...t, tier: tradeTier(t), confirmations: Math.max(0, Math.floor(Number((counts ?? {})[t.id]) || 0)) }));
    return NextResponse.json({ drafts, published }, { headers: noStore });
  } catch (err) {
    console.error("admin/signals GET failed", err);
    return NextResponse.json({ error: "Could not load signals" }, { status: 500 });
  }
}

/** Creates a DRAFT. A draft is never in the feed; publishing is a separate, confirmed action. */
export async function POST(req: Request) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const tier = parseTier(body.tier);
  if (!tier) return NextResponse.json({ error: "Choose FREE or ELITE visibility" }, { status: 400 });
  const fields = parseSignalFields(body);
  if (!fields.ok) return NextResponse.json({ error: fields.error }, { status: 400 });
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  const now = Date.now();
  const draft: SignalDraft = { id: randomUUID(), createdAt: now, updatedAt: now, tier, ...fields.value };
  try {
    await redis.hset(DRAFTS_KEY, { [draft.id]: draft });
    await auditLog(redis, owner.userId, "signal.draft.create", draft.id, { pair: draft.pair, tier });
    return NextResponse.json({ ok: true, draft }, { status: 201, headers: noStore });
  } catch (err) {
    console.error("admin/signals POST failed", err);
    return NextResponse.json({ error: "Could not save the draft" }, { status: 500 });
  }
}
