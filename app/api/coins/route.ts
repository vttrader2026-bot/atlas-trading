import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getExchangeInfo } from "@/lib/marketData";

export const maxDuration = 15;

/**
 * GET /api/coins
 *
 * The Coin Explorer directory list: every currently tradable Binance Spot
 * USDT pair, from the same validated exchange-info snapshot the klines
 * endpoint uses (lib/marketDataExchange.ts) — never a hand-maintained or
 * assumed list. Price/volume/24h-change come from the client's existing
 * live ticker stream (lib/binanceStream.ts); this endpoint only answers
 * "is this symbol actually a real, currently-tradable Binance Spot pair".
 *
 * Sign-in required, same as the Analyzer/Trade Feed/Market Intelligence
 * APIs — never gate only on the client page, since that's trivially
 * bypassed by calling this endpoint directly.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const info = await getExchangeInfo();
    const pairs = Array.from(info.bySymbol.values())
      .filter((p) => p.quoteAsset === "USDT")
      .map((p) => ({ symbol: p.symbol, baseAsset: p.baseAsset, quoteAsset: p.quoteAsset }))
      .sort((a, b) => a.baseAsset.localeCompare(b.baseAsset));

    return NextResponse.json({
      pairs,
      stale: info.stale,
      generatedAt: new Date(info.fetchedAt).toISOString(),
    });
  } catch (err) {
    console.error("GET /api/coins failed", err);
    return NextResponse.json({ error: "coins_unavailable" }, { status: 503 });
  }
}
