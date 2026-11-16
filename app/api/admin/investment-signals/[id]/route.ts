// INVEST-SIGNAL-v1: the owner permanently deletes ONE Investment Signal (any status, FREE or ELITE).
// Removes only the record in atlas:investment-signals. It never reads or writes any member's Investor plan, the Spot Swing feed
// or the bot's data. The audit entry is written FIRST; if it cannot be written nothing is deleted (same rule as Spot Swing delete).
import { NextResponse } from "next/server";
import { auditLog, auditLogStrict, needsConfirm, noStore, readBody, requireOwner } from "@/lib/adminAuth";
import { INVESTMENT_KEY, INVESTMENT_MAX, type InvestmentSignal } from "@/lib/investmentSignal";
import { getRedis } from "@/lib/userStore";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { id } = await params;
  const body = (await readBody(req)) ?? {};
  const denied = needsConfirm(body);
  if (denied) return denied;
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  try {
    const stored = (await redis.lrange<InvestmentSignal>(INVESTMENT_KEY, 0, INVESTMENT_MAX - 1)) ?? [];
    const target = stored.find((s) => s.id === id);
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const recorded = await auditLogStrict(redis, owner.userId, "investment.delete", id, { asset: target.asset, tier: target.tier, status: target.status });
    if (!recorded) return NextResponse.json({ error: "Could not record the deletion, so nothing was deleted" }, { status: 500 });
    const removed = await redis.lrem(INVESTMENT_KEY, 1, target);
    if (!removed) {
      await auditLog(redis, owner.userId, "investment.delete.failed", id, { asset: target.asset });
      return NextResponse.json({ error: "Could not delete the Investment Signal" }, { status: 500 });
    }
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (err) {
    console.error("admin/investment-signals DELETE failed", err);
    return NextResponse.json({ error: "Could not delete the Investment Signal" }, { status: 500 });
  }
}
