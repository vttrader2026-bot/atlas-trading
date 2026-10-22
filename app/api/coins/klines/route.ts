import { NextRequest, NextResponse } from "next/server";
import { getCandles, isSupportedInterval, MarketDataError, SUPPORTED_INTERVALS } from "@/lib/marketData";

export const maxDuration = 15;

// Maps each MarketDataError code to the HTTP status that best describes it
// to a client — never a blanket 500 that hides whether the problem is a bad
// request, a missing pair, or Binance being unreachable.
function statusForCode(code: MarketDataError["code"]): number {
  switch (code) {
    case "UNSUPPORTED_INTERVAL":
      return 400;
    case "UNSUPPORTED_PAIR":
    case "UNKNOWN_SYMBOL":
      return 404;
    case "UPSTREAM_UNAVAILABLE":
    case "UPSTREAM_TIMEOUT":
    case "EXCHANGE_INFO_UNAVAILABLE":
      return 503;
    case "MALFORMED_RESPONSE":
    case "INVALID_CANDLE_DATA":
      return 502;
    default:
      return 500;
  }
}

/**
 * GET /api/coins/klines?symbol=BTC&interval=1h&limit=300&quote=USDT
 *
 * Thin HTTP wrapper around lib/marketData's validated candle service — this
 * route does no validation of its own beyond reading query params; every
 * actual check (pair exists, interval supported, candle integrity) lives in
 * lib/marketData and is shared with any future server-side caller (e.g. a
 * later AI analysis feature). On failure this returns a structured
 * { error: <code> } with an accurate HTTP status, never fabricated candles.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol")?.trim();
  const quote = searchParams.get("quote")?.trim() || "USDT";
  const interval = searchParams.get("interval")?.trim();
  const limitParam = searchParams.get("limit");

  if (!symbol) {
    return NextResponse.json({ error: "MISSING_SYMBOL" }, { status: 400 });
  }
  if (!interval || !isSupportedInterval(interval)) {
    return NextResponse.json(
      { error: "UNSUPPORTED_INTERVAL", supported: SUPPORTED_INTERVALS },
      { status: 400 }
    );
  }

  let limit: number | undefined;
  if (limitParam !== null) {
    const parsed = Number(limitParam);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return NextResponse.json({ error: "INVALID_LIMIT" }, { status: 400 });
    }
    limit = parsed;
  }

  try {
    const result = await getCandles(symbol, interval, { limit, quoteAsset: quote });
    return NextResponse.json({
      pair: result.pair,
      interval,
      candles: result.candles,
      stale: result.stale,
    });
  } catch (err) {
    if (err instanceof MarketDataError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: statusForCode(err.code) });
    }
    console.error("GET /api/coins/klines failed with an unexpected error", err);
    return NextResponse.json({ error: "UNKNOWN_ERROR" }, { status: 500 });
  }
}
