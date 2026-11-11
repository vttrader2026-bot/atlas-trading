// USD→MRU reference rate for Atlas Investor's display-currency option. Signed-in users only.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/userStore";
import { getUsdMruRate } from "@/lib/fxRate";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const r = await getUsdMruRate({ redis: ctx.redis });
    return NextResponse.json(r, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (err) {
    console.error("fx usd-mru failed:", err);
    // Never a made-up rate: the page falls back to USDT.
    return NextResponse.json({ ok: false }, { headers: { "Cache-Control": "no-store" } });
  }
}
