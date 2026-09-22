import { NextResponse } from "next/server";
import { requireUser } from "@/lib/userStore";
import { sendToUser, testPayload } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST() {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  try {
    // One test every 30 seconds per user.
    const ok = await ctx.redis.set(`user:${ctx.userId}:push-test-lock`, 1, { nx: true, ex: 30 });
    if (!ok) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
    const delivered = await sendToUser(ctx.userId, (lang) => testPayload(lang));
    return NextResponse.json({ delivered });
  } catch (err) {
    console.error("push test failed:", err);
    return NextResponse.json({ error: "Could not send test" }, { status: 500 });
  }
}