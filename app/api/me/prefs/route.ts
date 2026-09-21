import { NextResponse } from "next/server";
import { requireUser } from "@/lib/userStore";
import { normalizePrefs } from "@/lib/notificationPrefs";

export const dynamic = "force-dynamic";

const key = (userId: string) => `user:${userId}:prefs`;

export async function GET() {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const stored = await ctx.redis.get(key(ctx.userId));
    return NextResponse.json({ prefs: normalizePrefs(stored) });
  } catch (err) {
    console.error("prefs GET failed:", err);
    return NextResponse.json({ error: "Could not load preferences" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const prefs = normalizePrefs((body as { prefs?: unknown } | null)?.prefs);
  try {
    await ctx.redis.set(key(ctx.userId), prefs);
    return NextResponse.json({ prefs });
  } catch (err) {
    console.error("prefs PUT failed:", err);
    return NextResponse.json({ error: "Could not save preferences" }, { status: 500 });
  }
}