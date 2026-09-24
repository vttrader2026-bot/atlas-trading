import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { peekAnalyzeUsage } from "@/lib/plan";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const usage = await peekAnalyzeUsage(userId);
  return NextResponse.json(usage);
}
