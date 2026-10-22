import { NextResponse } from "next/server";
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
 */
export async function GET() {
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
