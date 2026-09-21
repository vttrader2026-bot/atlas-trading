import { NextResponse } from "next/server";
import { requireUser } from "@/lib/userStore";

export const dynamic = "force-dynamic";

const MAX_ITEMS = 5000;
const MAX_BYTES = 500_000;
const key = (userId: string) => `user:${userId}:journal`;

export async function GET() {
  const ctx = await requireUser();
  if (ctx instanceof NextResponse) return ctx;
  try {
    const stored = await ctx.redis.get<unknown>(key(ctx.userId));
    return NextResponse.json({ trades: Array.isArray(stored) ? stored : [] });
  } catch (err) {
    console.error("journal GET failed:", err);
    return NextResponse.json({ error: "Could not load journal" }, { status: 500 });
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
  const trades = (body as { trades?: unknown } | null)?.trades;
  const valid =
    Array.isArray(trades) &&
    trades.length <= MAX_ITEMS &&
    trades.every((x) => typeof x === "object" && x !== null && !Array.isArray(x));
  if (!valid) {
    return NextResponse.json({ error: "Invalid journal data" }, { status: 400 });
  }
  if (JSON.stringify(trades).length > MAX_BYTES) {
    return NextResponse.json({ error: "Journal too large" }, { status: 413 });
  }
  try {
    await ctx.redis.set(key(ctx.userId), trades);
    return NextResponse.json({ ok: true, count: trades.length });
  } catch (err) {
    console.error("journal PUT failed:", err);
    return NextResponse.json({ error: "Could not save journal" }, { status: 500 });
  }
}