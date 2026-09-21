import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { timingSafeEqual, randomUUID } from "crypto";
import type { PublishedTrade } from "@/lib/tradeFeed";

export const dynamic = "force-dynamic";

const FEED_KEY = "atlas:trade-feed";
const MAX_TRADES = 50;

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function clean(value: unknown, max = 500): string {
  if (typeof value === "string") return value.trim().slice(0, max);
  if (typeof value === "number") return String(value);
  return "";
}

export async function GET() {
  const redis = getRedis();
  if (!redis) {
    console.error("trade-feed: UPSTASH_REDIS_REST_URL / TOKEN are not set");
    return NextResponse.json({ trades: [] }, { status: 500 });
  }
  try {
    const trades = await redis.lrange<PublishedTrade>(FEED_KEY, 0, MAX_TRADES - 1);
    return NextResponse.json({ trades }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("trade-feed GET failed:", err);
    return NextResponse.json({ trades: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const adminSecret = process.env.ADMIN_SECRET;
  const redis = getRedis();
  if (!adminSecret || !redis) {
    console.error("trade-feed: ADMIN_SECRET or Upstash env vars are missing");
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const secret = typeof body.secret === "string" ? body.secret : "";
  if (!safeEqual(secret, adminSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dir = body.direction;
  const direction = dir === "Long" || dir === "Short" ? dir : null;
  const pair = clean(body.pair, 30).toUpperCase();
  if (!pair || !direction) {
    return NextResponse.json({ error: "Pair and direction are required" }, { status: 400 });
  }

  const trade: PublishedTrade = {
    id: randomUUID(),
    createdAt: Date.now(),
    pair,
    direction,
    timeframe: clean(body.timeframe, 20),
    entryZone: clean(body.entryZone, 200),
    invalidation: clean(body.invalidation, 200),
    tp1: clean(body.tp1, 50),
    tp2: clean(body.tp2, 50),
    tp3: clean(body.tp3, 50),
    reasoning: clean(body.reasoning, 2000),
  };

  try {
    await redis.lpush(FEED_KEY, trade);
    await redis.ltrim(FEED_KEY, 0, MAX_TRADES - 1);
    return NextResponse.json({ ok: true, trade }, { status: 201 });
  } catch (err) {
    console.error("trade-feed POST failed:", err);
    return NextResponse.json({ error: "Could not save trade" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const adminSecret = process.env.ADMIN_SECRET;
  const redis = getRedis();
  if (!adminSecret || !redis) {
    console.error("trade-feed: ADMIN_SECRET or Upstash env vars are missing");
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const secret = typeof body.secret === "string" ? body.secret : "";
  if (!safeEqual(secret, adminSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    const trades = await redis.lrange<PublishedTrade>(FEED_KEY, 0, MAX_TRADES - 1);
    const target = trades.find((x) => x.id === id);
    if (!target) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const removed = await redis.lrem(FEED_KEY, 1, target);
    if (!removed) {
      return NextResponse.json({ error: "Could not remove trade" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("trade-feed DELETE failed:", err);
    return NextResponse.json({ error: "Could not remove trade" }, { status: 500 });
  }
}
