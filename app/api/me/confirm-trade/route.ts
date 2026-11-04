// ELITE-CONFIRM-v1
// "Confirm Trade" for ELITE signals (also used by Send to Journal from a Trade Plan built on an ELITE signal).
// Everything that matters is decided on the server in lib/eliteConfirmServer.ts:
//   active ELITE member (requireElite -> Clerk plan), open ELITE Long signal, a FRESH price fetched now,
//   price inside the official entry zone (both boundaries included), one confirmation per member and signal.
// The official signal is only read. The member's own entry/investment live in the Journal trade.
import { NextResponse } from "next/server";
import { requireElite } from "@/lib/plan";
import { getRedis } from "@/lib/userStore";
import { getTicker24h } from "@/lib/binance";
import { parseInput } from "@/lib/riskCalc";
import { confirmEliteTrade, parsePlanExtras } from "@/lib/eliteConfirmServer";

export const dynamic = "force-dynamic";

/** The member's own number: a JSON number, or a typed string such as "1,250.5". */
function toNumber(v: unknown): unknown {
  return typeof v === "string" ? (parseInput(v) ?? Number.NaN) : v;
}

export async function POST(req: Request) {
  const gate = await requireElite();
  if (gate instanceof NextResponse) return gate;
  const redis = getRedis();
  if (!redis) {
    console.error("confirm-trade: Upstash env vars are missing");
    return NextResponse.json({ error: "server_not_configured" }, { status: 500 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const signalId = typeof body.signalId === "string" ? body.signalId : "";
  if (!signalId) return NextResponse.json({ error: "missing_signal" }, { status: 400 });
  try {
    const r = await confirmEliteTrade(
      { redis, userId: gate.userId, getTicker: getTicker24h },
      { signalId, entry: toNumber(body.entry), invested: toNumber(body.invested), plan: parsePlanExtras(body.plan) },
    );
    return NextResponse.json(r.body, { status: r.status });
  } catch (err) {
    console.error("confirm-trade POST failed:", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
