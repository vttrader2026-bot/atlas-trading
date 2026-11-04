import { NextResponse, after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Redis } from "@upstash/redis";
import { timingSafeEqual, randomUUID } from "crypto";
import { tradeTier, visibleTrades, type PublishedTrade } from "@/lib/tradeFeed";
import { getUserPlan } from "@/lib/plan";
import { notifyTradeSubscribers, notifyTpSlSubscribers, notifyTradeClosedSubscribers } from "@/lib/push";

// ELITE-TIER-v1
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

/**
 * Who may read Elite-tier signals: the admin (valid ADMIN_SECRET in the x-admin-secret header) or a
 * signed-in user whose Clerk plan is "elite". Free, Analyzer-only, expired/unknown plans and any
 * lookup failure (getUserPlan fails closed to "free") get FREE signals only.
 */
async function viewerAccess(req: Request, userId: string | null): Promise<{ admin: boolean; elite: boolean }> {
  const adminSecret = process.env.ADMIN_SECRET;
  const header = req.headers.get("x-admin-secret") ?? "";
  if (adminSecret && header && safeEqual(header, adminSecret)) return { admin: true, elite: true };
  if (!userId) return { admin: false, elite: false };
  return { admin: false, elite: (await getUserPlan(userId)) === "elite" };
}

export async function GET(req: Request) {
  const { userId } = await auth();
  const access = await viewerAccess(req, userId);
  if (!userId && !access.admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const redis = getRedis();
  if (!redis) {
    console.error("trade-feed: UPSTASH_REDIS_REST_URL / TOKEN are not set");
    return NextResponse.json({ trades: [] }, { status: 500 });
  }
  try {
    const stored = await redis.lrange<PublishedTrade>(FEED_KEY, 0, MAX_TRADES - 1);
    // Filter BEFORE anything is serialised: an unauthorised client never receives Elite data.
    // The tier field itself is only sent to the admin, so FREE/Elite viewers see the same card data as before.
    const trades = visibleTrades(stored, access.elite).map((t) => {
      if (access.admin) return { ...t, tier: tradeTier(t) };
      const { tier: _tier, ...publicTrade } = t;
      void _tier;
      return publicTrade;
    });
    return NextResponse.json({ trades }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("trade-feed GET failed:", err);
    return NextResponse.json({ trades: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const adminSecret = process.env.ADMIN_SECRET;
  const botSecret = process.env.TRADE_BOT_SECRET;
  const redis = getRedis();
  if ((!adminSecret && !botSecret) || !redis) {
    console.error("trade-feed: ADMIN_SECRET/TRADE_BOT_SECRET or Upstash env vars are missing");
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const secret = typeof body.secret === "string" ? body.secret : "";
  const isAdmin = !!adminSecret && safeEqual(secret, adminSecret);
  const isBot = !!botSecret && safeEqual(secret, botSecret);
  if (!isAdmin && !isBot) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The website Trade Plan labels its publishes (source: "trade-plan"). Such a publish must be authenticated
  // as the admin so it can only ever become ELITE. If it arrives with the bot's secret (e.g. a wrong secret
  // saved in the browser) it is refused instead of being silently stored as a FREE, publicly visible signal.
  if (body.source === "trade-plan" && !isAdmin) {
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
    status: "open",
    // Tier comes from WHO published, never from the body (there is no selector): the website Trade
    // Plan publishes with the admin secret => elite; the Telegram bot's secret => free. If both
    // secrets were ever identical the website cannot be told apart from the bot, so admin wins
    // (fail closed: nothing Elite can leak).
    tier: isAdmin ? "elite" : "free",
  };
  const tradeId = clean(body.tradeId, 20);
  if (tradeId) trade.tradeId = tradeId;

  try {
    await redis.lpush(FEED_KEY, trade);
    await redis.ltrim(FEED_KEY, 0, MAX_TRADES - 1);
    // Push notifications go to every subscriber, so Elite signals must not trigger them (notification
    // targeting by tier is a later phase).
    if (trade.tier === "free") after(() => notifyTradeSubscribers(trade));
    return NextResponse.json({ ok: true, trade }, { status: 201 });
  } catch (err) {
    console.error("trade-feed POST failed:", err);
    return NextResponse.json({ error: "Could not save trade" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const botSecret = process.env.TRADE_BOT_SECRET;
  const redis = getRedis();
  if (!botSecret || !redis) {
    console.error("trade-feed: TRADE_BOT_SECRET or Upstash env vars are missing");
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const secret = typeof body.secret === "string" ? body.secret : "";
  if (!safeEqual(secret, botSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tradeId = clean(body.tradeId, 20);
  if (!tradeId) {
    return NextResponse.json({ error: "Missing tradeId" }, { status: 400 });
  }

  const status = body.status === "open" || body.status === "closed" ? body.status : undefined;
  const hitLevels = Array.isArray(body.hitLevels)
    ? body.hitLevels.filter((x): x is string => typeof x === "string").slice(0, 10)
    : undefined;

  try {
    const trades = await redis.lrange<PublishedTrade>(FEED_KEY, 0, MAX_TRADES - 1);
    // The bot only ever updates FREE signals. An Elite signal is reported as "Not found" even if it carries
    // the same tradeId, so the bot can neither modify it nor learn that it exists.
    const index = trades.findIndex((t) => t.tradeId === tradeId && tradeTier(t) === "free");
    if (index === -1) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const previousStatus = trades[index].status;
    const previousLevels = trades[index].hitLevels ?? [];
    const updated: PublishedTrade = {
      ...trades[index],
      ...(status ? { status } : {}),
      ...(hitLevels ? { hitLevels } : {}),
    };
    await redis.lset(FEED_KEY, index, updated);

    const isFree = tradeTier(updated) === "free"; // never push Elite updates to the general subscriber list
    let closedViaLevel = false;
    if (hitLevels) {
      const newlyHit = hitLevels.filter((level) => !previousLevels.includes(level));
      closedViaLevel = newlyHit.length > 0;
      for (const level of newlyHit) {
        if (isFree) after(() => notifyTpSlSubscribers(updated, level));
      }
    }

    // A trade can close two ways: hitting a TP/SL level (notified above) or
    // being manually closed/cancelled with no new level hit. Only the latter
    // gets its own notification, so the two never double-fire for one trade.
    const justClosed = status === "closed" && previousStatus !== "closed";
    if (justClosed && !closedViaLevel && isFree) {
      after(() => notifyTradeClosedSubscribers(updated));
    }

    return NextResponse.json({ ok: true, trade: updated });
  } catch (err) {
    console.error("trade-feed PATCH failed:", err);
    return NextResponse.json({ error: "Could not update trade" }, { status: 500 });
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
