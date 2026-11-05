// CLOSE-ELITE-v1: admin-only "Close ELITE signal". Separate from the bot's PATCH on purpose: the bot can still
// never touch an ELITE signal, and this route can never touch a FREE one.
import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { timingSafeEqual } from "crypto";
import { CLOSE_OUTCOMES, TRADE_FEED_KEY, closeSignal, tradeTier, type CloseOutcome, type PublishedTrade } from "@/lib/tradeFeed";

export const dynamic = "force-dynamic";

const MAX_TRADES = 50;

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function POST(req: Request) {
  const adminSecret = process.env.ADMIN_SECRET;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!adminSecret || !url || !token) {
    console.error("trade-feed/close: ADMIN_SECRET or Upstash env vars are missing");
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // Admin only: the admin secret in the body (same as publishing and removing). Nothing else grants access.
  const secret = typeof body.secret === "string" ? body.secret : "";
  if (!secret || !safeEqual(secret, adminSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const outcome = typeof body.outcome === "string" ? body.outcome.toUpperCase() : "";
  if (!id || !(CLOSE_OUTCOMES as readonly string[]).includes(outcome)) {
    return NextResponse.json({ error: "id and a valid outcome (TP1, TP2, TP3, SL, CANCELLED) are required" }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";

  try {
    const redis = new Redis({ url, token });
    const trades = await redis.lrange<PublishedTrade>(TRADE_FEED_KEY, 0, MAX_TRADES - 1);
    const index = trades.findIndex((t) => t.id === id && tradeTier(t) === "elite");
    if (index === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (trades[index].status === "closed" || trades[index].closing) {
      return NextResponse.json({ error: "Already closed" }, { status: 409 });
    }
    const closed = closeSignal(trades[index], outcome as CloseOutcome, reason, Date.now());
    await redis.lset(TRADE_FEED_KEY, index, closed);
    return NextResponse.json({ ok: true, trade: closed });
  } catch (err) {
    console.error("trade-feed/close failed:", err);
    return NextResponse.json({ error: "Could not close signal" }, { status: 500 });
  }
}
