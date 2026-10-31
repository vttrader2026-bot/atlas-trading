// ATLAS ANALYZER ENGINE — server-side data loader for the SCREENSHOT path.
// Loads real, validated Binance USDT candles for the pair/timeframe the user
// stated and runs the shared engine. Any failure degrades to VISUAL_READ_ONLY
// (never to guessed data).

import { getCandles, MarketDataError } from "@/lib/marketData";
import { HIGHER_TF } from "@/lib/analyzerPrompt";
import {
  analyzeCandles,
  resolveScreenshotMarket,
  visualReadOnly,
  type EngineResult,
} from "@/lib/analyzerEngine";

export async function engineForScreenshot(
  pair: string | null | undefined,
  timeframe: string | null | undefined
): Promise<{ engine: EngineResult; pair: string | null }> {
  const target = resolveScreenshotMarket(pair, timeframe);
  if (!target.ok) return { engine: visualReadOnly(target.reasons), pair: null };

  const higherName = HIGHER_TF[target.interval] ?? null;
  const [main, hi] = await Promise.allSettled([
    getCandles(target.baseAsset, target.interval, { limit: 250, quoteAsset: "USDT" }),
    higherName ? getCandles(target.baseAsset, higherName, { limit: 250, quoteAsset: "USDT" }) : Promise.reject(new Error("none")),
  ]);
  if (main.status === "rejected") {
    if (!(main.reason instanceof MarketDataError)) console.error("analyze: engine candle load failed", main.reason);
    return { engine: visualReadOnly(["CANDLES_UNAVAILABLE"]), pair: `${target.baseAsset}/USDT` };
  }
  const engine = analyzeCandles({
    candles: main.value.candles,
    interval: target.interval,
    higherCandles: hi.status === "fulfilled" ? hi.value.candles : null,
    stale: main.value.stale,
    nowMs: Date.now(),
  });
  return { engine, pair: `${target.baseAsset}/USDT` };
}
