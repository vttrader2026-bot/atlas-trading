import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUser, clean } from "@/lib/userStore";
import type { SavedPlan } from "@/lib/savedPlans";

export const dynamic = "force-dynamic";

const MAX_PLANS = 100;
const key = (userId: string) => `user:${userId}:plans`;

export async function GET() {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const all = await ctx.redis.hgetall<Record<string, SavedPlan>>(key(ctx.userId));
    const plans = Object.values(all ?? {}).sort((a, b) => b.createdAt - a.createdAt);
    return NextResponse.json({ plans });
  } catch (err) {
    console.error("plans GET failed:", err);
    return NextResponse.json({ error: "Could not load plans" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const dir = b.direction;
  const direction = dir === "Long" || dir === "Short" || dir === "Wait" ? dir : null;
  const pair = clean(b.pair, 30).toUpperCase();
  if (!pair || !direction) {
    return NextResponse.json({ error: "Pair and direction are required" }, { status: 400 });
  }
  try {
    const count = await ctx.redis.hlen(key(ctx.userId));
    if (count >= MAX_PLANS) {
      return NextResponse.json({ error: "Plan limit reached" }, { status: 400 });
    }
    const plan: SavedPlan = {
      id: randomUUID(),
      createdAt: Date.now(),
      pair,
      direction,
      timeframe: clean(b.timeframe, 20),
      entryZone: clean(b.entryZone, 200),
      invalidationText: clean(b.invalidationText, 200),
      entry: clean(b.entry, 50),
      invalidation: clean(b.invalidation, 50),
      tp1: clean(b.tp1, 50),
      tp2: clean(b.tp2, 50),
      tp3: clean(b.tp3, 50),
      reasoning: clean(b.reasoning, 2000),
    };
    await ctx.redis.hset(key(ctx.userId), { [plan.id]: plan });
    return NextResponse.json({ plan }, { status: 201 });
  } catch (err) {
    console.error("plans POST failed:", err);
    return NextResponse.json({ error: "Could not save plan" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = (body as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  try {
    await ctx.redis.hdel(key(ctx.userId), id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("plans DELETE failed:", err);
    return NextResponse.json({ error: "Could not delete plan" }, { status: 500 });
  }
}