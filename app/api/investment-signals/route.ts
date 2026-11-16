// INVEST-SIGNAL-v1: the Investment Signals a signed-in member may see. Separate from GET /api/trade-feed (which the Spot Swing
// feed and the Telegram bot's ecosystem rely on, and which is not changed). FREE ideas: every signed-in member. ELITE ideas: active
// ELITE members and the owner; everyone else only gets an identity-only placeholder (see investmentsForViewer).
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isOwnerId } from "@/lib/adminAuth";
import { INVESTMENT_KEY, INVESTMENT_MAX, investmentsForViewer, type InvestmentSignal } from "@/lib/investmentSignal";
import { getUserPlan } from "@/lib/plan";
import { getRedis } from "@/lib/userStore";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" } as const;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  const redis = getRedis();
  if (!redis) return NextResponse.json({ investments: [], locked: [] }, { status: 500, headers: noStore });
  try {
    const canSeeElite = isOwnerId(userId) || (await getUserPlan(userId)) === "elite";
    const stored = (await redis.lrange<InvestmentSignal>(INVESTMENT_KEY, 0, INVESTMENT_MAX - 1)) ?? [];
    return NextResponse.json(investmentsForViewer(stored, canSeeElite), { headers: noStore });
  } catch (err) {
    console.error("investment-signals GET failed", err);
    return NextResponse.json({ investments: [], locked: [] }, { status: 500, headers: noStore });
  }
}
