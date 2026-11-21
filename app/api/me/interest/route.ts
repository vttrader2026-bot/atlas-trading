// WELCOME-v1: the signed-in member's chosen interest (or "maybe later"), so it follows them across devices.
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/userStore";
import { isInterest, normalizeInterest } from "@/lib/interest";

export const dynamic = "force-dynamic";
const key = (userId: string) => `user:${userId}:interest`;
const headers = { "Cache-Control": "no-store" } as const;

export async function GET() {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  try {
    return NextResponse.json(normalizeInterest(await ctx.redis.get(key(ctx.userId))), { headers });
  } catch (err) {
    console.error("me/interest GET failed", err);
    return NextResponse.json({ error: "Could not load your preference" }, { status: 500, headers });
  }
}

export async function PUT(req: Request) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  const body = (await req.json().catch(() => null)) as { interest?: unknown; dismissed?: unknown } | null;
  if (!body || (!isInterest(body.interest) && body.dismissed !== true)) return NextResponse.json({ error: "Invalid preference" }, { status: 400, headers });
  const value = normalizeInterest(isInterest(body.interest) ? { interest: body.interest } : { dismissed: true });
  try {
    await ctx.redis.set(key(ctx.userId), value);
    return NextResponse.json(value, { headers });
  } catch (err) {
    console.error("me/interest PUT failed", err);
    return NextResponse.json({ error: "Could not save your preference" }, { status: 500, headers });
  }
}
