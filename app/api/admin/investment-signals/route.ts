// INVEST-SIGNAL-v1: the owner publishes an Investment Signal (from the Atlas Investor "Share to Trade Feed" dialog or the Trade Feed).
// Owner only (requireOwner), explicit confirmation, FREE or ELITE chosen explicitly. Nothing here reads or changes any Investor plan:
// the browser sends only the reviewed public text.
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auditLog, needsConfirm, noStore, readBody, requireOwner } from "@/lib/adminAuth";
import { parseTier } from "@/lib/adminSignals";
import { INVESTMENT_KEY, INVESTMENT_MAX, hasOpenInvestment, newInvestmentSignal, parseInvestmentFields, type InvestmentSignal } from "@/lib/investmentSignal";
import { getRedis } from "@/lib/userStore";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const owner = await requireOwner(req);
  if (owner instanceof NextResponse) return owner;
  const body = await readBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const denied = needsConfirm(body);
  if (denied) return denied;
  const tier = parseTier(body.tier); // no default: FREE or ELITE must be chosen explicitly
  if (!tier) return NextResponse.json({ error: "Choose FREE or ELITE visibility" }, { status: 400 });
  const fields = parseInvestmentFields(body);
  if (!fields.ok) return NextResponse.json({ error: fields.error }, { status: 400 });
  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  try {
    const stored = (await redis.lrange<InvestmentSignal>(INVESTMENT_KEY, 0, INVESTMENT_MAX - 1)) ?? [];
    if (hasOpenInvestment(stored, fields.value.asset, tier)) {
      return NextResponse.json({ error: "An open Investment Signal for this coin and audience already exists. Complete or cancel it first." }, { status: 409 });
    }
    const signal = newInvestmentSignal(fields.value, tier, randomUUID(), Date.now());
    await redis.lpush(INVESTMENT_KEY, signal);
    await redis.ltrim(INVESTMENT_KEY, 0, INVESTMENT_MAX - 1);
    await auditLog(redis, owner.userId, "investment.publish", signal.id, { asset: signal.asset, tier });
    return NextResponse.json({ ok: true, signal }, { status: 201, headers: noStore });
  } catch (err) {
    console.error("admin/investment-signals publish failed", err);
    return NextResponse.json({ error: "Could not publish the Investment Signal" }, { status: 500 });
  }
}
