import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { USAGE_UNAVAILABLE_MESSAGE, peekAnalyzeUsage } from "@/lib/plan";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const usage = await peekAnalyzeUsage(userId);
  if (usage.unavailable) return NextResponse.json({ error: USAGE_UNAVAILABLE_MESSAGE, plan: usage.plan, limit: usage.limit }, { status: 503 });
  return NextResponse.json(usage);
}
