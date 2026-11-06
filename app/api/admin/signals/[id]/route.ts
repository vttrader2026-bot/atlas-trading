// ADMIN-v1: edit a signal (draft, or a published one that is still open and unconfirmed) and delete a draft.
import { NextResponse } from "next/server";
import { auditLog, needsConfirm, noStore, readBody, requireOwner } from "@/lib/adminAuth";
import { DRAFTS_KEY, parseSignalFields, parseTier, type SignalDraft } from "@/lib/adminSignals";
import { CONFIRM_COUNTS_KEY, TRADE_FEED_KEY, tradeTier, type PublishedTrade } from "@/lib/tradeFeed";
import { getRedis } from "@/lib/userStore";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { id } = await params;
  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const fields = parseSignalFields(body);
  if (!fields.ok) return NextResponse.json({ error: fields.error }, { status: 400 });
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  try {
    const draft = await redis.hget<SignalDraft>(DRAFTS_KEY, id);
    if (draft) {
      const tier = body.tier === undefined ? draft.tier : parseTier(body.tier);
      if (!tier) return NextResponse.json({ error: "Choose FREE or ELITE visibility" }, { status: 400 });
      const next: SignalDraft = { ...draft, ...fields.value, tier, updatedAt: Date.now() };
      await redis.hset(DRAFTS_KEY, { [id]: next });
      await auditLog(redis, owner.userId, "signal.draft.edit", id, { tier });
      return NextResponse.json({ ok: true, draft: next }, { headers: noStore });
    }

    // Published signal: content only. Its visibility is fixed once published.
    const trades = await redis.lrange<PublishedTrade>(TRADE_FEED_KEY, 0, 49);
    const index = trades.findIndex((t) => t.id === id);
    if (index === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const current = trades[index];
    if (body.tier !== undefined && body.tier !== tradeTier(current)) {
      return NextResponse.json({ error: "Visibility cannot be changed after publishing. Cancel it and publish a new signal." }, { status: 400 });
    }
    if (current.status === "closed" || current.closing) return NextResponse.json({ error: "A closed signal cannot be edited" }, { status: 409 });
    const confirmed = Number((await redis.hget<unknown>(CONFIRM_COUNTS_KEY, id).catch(() => 0)) ?? 0);
    if (confirmed > 0) return NextResponse.json({ error: "Members already confirmed this signal, so its levels are locked. Cancel it and publish a new one." }, { status: 409 });
    const updated: PublishedTrade = { ...current, ...fields.value };
    await redis.lset(TRADE_FEED_KEY, index, updated);
    await auditLog(redis, owner.userId, "signal.edit", id, { tier: tradeTier(current) });
    return NextResponse.json({ ok: true, trade: updated }, { headers: noStore });
  } catch (err) {
    console.error("admin/signals PATCH failed", err);
    return NextResponse.json({ error: "Could not save the signal" }, { status: 500 });
  }
}

/** Deletes a DRAFT only. A published signal is cancelled, never deleted. */
export async function DELETE(req: Request, { params }: Ctx) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { id } = await params;
  const body = (await readBody(req)) ?? {};
  const denied = needsConfirm(body);
  if (denied) return denied;
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  try {
    const removed = await redis.hdel(DRAFTS_KEY, id);
    if (!removed) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    await auditLog(redis, owner.userId, "signal.draft.delete", id);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (err) {
    console.error("admin/signals DELETE failed", err);
    return NextResponse.json({ error: "Could not delete the draft" }, { status: 500 });
  }
}
