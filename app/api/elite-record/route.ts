import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { TRADE_FEED_KEY, type PublishedTrade } from "@/lib/tradeFeed";
import { eliteRecords, monthlyReport, openEliteCount, summarize } from "@/lib/eliteRecord";

// ELITE-RECORD-v1: PUBLIC read-only historical signal performance (not member results). Only CLOSED Elite signals (already public in the Trade Feed) with
// a verified closing record, reduced to entry zone, exit level, outcome and the % computed from those published levels.
// Reasoning, confirmations and open Elite signals are never returned (open ones are only counted).
export const dynamic = "force-dynamic";

const EMPTY = { records: [], monthly: [], summary: { closed: 0, wins: 0, losses: 0, cancelled: 0, open: 0, winRate: null, netPct: 0 }, window: null };
const CACHE = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" };

export async function GET() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return NextResponse.json(EMPTY);
  try {
    const stored = await new Redis({ url, token }).lrange<PublishedTrade>(TRADE_FEED_KEY, 0, 49);
    const records = eliteRecords(stored);
    const times = stored.map((t) => t.createdAt).filter((n) => Number.isFinite(n));
    return NextResponse.json(
      {
        records,
        monthly: monthlyReport(records),
        summary: summarize(records, openEliteCount(stored)),
        // The feed keeps its latest 50 signals; say which period the numbers cover.
        window: times.length ? { from: Math.min(...times), to: Math.max(...times), signals: stored.length } : null,
      },
      { headers: CACHE },
    );
  } catch (err) {
    console.error("elite-record GET failed:", err);
    return NextResponse.json(EMPTY);
  }
}
