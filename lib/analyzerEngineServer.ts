// ATLAS ANALYZER ENGINE — server-side data loader for the SCREENSHOT path.
// Loads real, validated Binance USDT candles for the pair/timeframe the user
// stated and runs the shared engine. Any failure degrades to VISUAL_READ_ONLY
// (never to guessed data).

import { getCandles, MarketDataError } from "@/lib/marketData";
import { HIGHER_TF } from "@/lib/analyzerPrompt";
import type { Interval } from "@/lib/marketDataTypes";
import {
  analyzeCandles,
  resolveScreenshotMarket,
  visualReadOnly,
  type EngineResult,
} from "@/lib/analyzerEngine";

export async function engineForScreenshot(
  pair: string | null | undefined,
  timeframe: string | null | undefined,
  opts: { pairDetected?: boolean } = {}
): Promise<{ engine: EngineResult; pair: string | null; timeframe: Interval | null }> {
  const target = resolveScreenshotMarket(pair, timeframe);
  if (!target.ok) return { engine: visualReadOnly(target.reasons), pair: null, timeframe: null };

  const higherName = HIGHER_TF[target.interval] ?? null;
  const [main, hi] = await Promise.allSettled([
    getCandles(target.baseAsset, target.interval, { limit: 250, quoteAsset: "USDT" }),
    higherName ? getCandles(target.baseAsset, higherName, { limit: 250, quoteAsset: "USDT" }) : Promise.reject(new Error("none")),
  ]);
  if (main.status === "rejected") {
    const market = `${target.baseAsset}/USDT ${target.interval}`;
    if (main.reason instanceof MarketDataError) {
      // Each code is logged distinctly for operators; the user only ever sees a plain-language reason.
      console.error(`analyze: candle verification failed [${main.reason.code}] ${market}`);
      if (opts.pairDetected && (main.reason.code === "UNKNOWN_SYMBOL" || main.reason.code === "UNSUPPORTED_PAIR")) {
        // The AI-detected pair is not a real Binance Spot USDT market: ask the user instead of guessing.
        return { engine: visualReadOnly(["PAIR_REQUIRED"]), pair: null, timeframe: null };
      }
    } else {
      console.error(`analyze: candle verification failed [UNEXPECTED] ${market}`, main.reason);
    }
    return { engine: visualReadOnly(["CANDLES_UNAVAILABLE"]), pair: `${target.baseAsset}/USDT`, timeframe: target.interval };
  }
  const engine = analyzeCandles({
    candles: main.value.candles,
    interval: target.interval,
    higherCandles: hi.status === "fulfilled" ? hi.value.candles : null,
    stale: main.value.stale,
    nowMs: Date.now(),
  });
  return { engine, pair: `${target.baseAsset}/USDT`, timeframe: target.interval };
}
