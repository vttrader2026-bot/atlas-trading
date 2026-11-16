// INVEST-SIGNAL-v1: owner moves an Investment Signal between Active, Thesis Under Review, Completed and Cancelled.
// Completed and Cancelled are final. Only the status and its timestamp change; the published text is kept.
import { NextResponse } from "next/server";
import { auditLog, needsConfirm, noStore, readBody, requireOwner } from "@/lib/adminAuth";
import { INVESTMENT_KEY, INVESTMENT_MAX, INVESTMENT_STATUSES, canMoveInvestment, type InvestmentSignal } from "@/lib/investmentSignal";
import { getRedis } from "@/lib/userStore";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const { id } = await params;
  const body = (await readBody(req)) ?? {};
  const denied = needsConfirm(body);
  if (denied) return denied;
  const status = INVESTMENT_STATUSES.find((s) => s === body.status);
  if (!status) return NextResponse.json({ error: "Choose Active, Thesis Under Review, Completed or Cancelled" }, { status: 400 });
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  try {
    const stored = (await redis.lrange<InvestmentSignal>(INVESTMENT_KEY, 0, INVESTMENT_MAX - 1)) ?? [];
    const index = stored.findIndex((s) => s.id === id);
    if (index === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const current = stored[index];
    if (!canMoveInvestment(current.status, status)) return NextResponse.json({ error: "This status change is not allowed" }, { status: 409 });
    const updated: InvestmentSignal = { ...current, status, updatedAt: Date.now() };
    await redis.lset(INVESTMENT_KEY, index, updated);
    await auditLog(redis, owner.userId, "investment.status", id, { tier: updated.tier, from: current.status, to: status });
    return NextResponse.json({ ok: true, signal: updated }, { headers: noStore });
  } catch (err) {
    console.error("admin/investment-signals status failed", err);
    return NextResponse.json({ error: "Could not update the Investment Signal" }, { status: 500 });
  }
}
