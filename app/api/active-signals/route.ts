import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { TRADE_FEED_KEY, type PublishedTrade } from "@/lib/tradeFeed";
import { publicActiveSignals } from "@/lib/activeSignals";

// ACTIVE-SIGNAL-v1: PUBLIC (no sign-in). Returns only [{ symbol, id }] for currently active setups so Radar and
// Market Pulse can show an "Active Signal" badge to everyone. Nothing else about a signal is ever returned here;
// the setup itself still needs the existing Trade Feed access rules.
export const dynamic = "force-dynamic";

const EMPTY = { signals: [] as { symbol: string; id: string }[] };
const CACHE = { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" };

export async function GET() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return NextResponse.json(EMPTY);
  try {
    const stored = await new Redis({ url, token }).lrange<PublishedTrade>(TRADE_FEED_KEY, 0, 49);
    return NextResponse.json({ signals: publicActiveSignals(stored) }, { headers: CACHE });
  } catch (err) {
    console.error("active-signals GET failed:", err);
    return NextResponse.json(EMPTY); // badges are optional: fail quietly, no cache
  }
}
