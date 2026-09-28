import { NextRequest, NextResponse } from "next/server";
import { notifyFreeUsersAnalyzerReset } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await notifyFreeUsersAnalyzerReset();
  return NextResponse.json({ ok: true, ...result });
}
