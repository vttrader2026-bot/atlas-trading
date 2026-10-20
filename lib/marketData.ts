// ATLAS COIN EXPLORER — Phase 1: Binance Spot data foundation.
//
// This is the single public entry point future phases (Coin Explorer
// charts, the Elite AI Quick Scan) should import from. It composes pair
// validation and candle validation into one call so a caller never has to
// (and never accidentally forgets to) validate a pair before fetching its
// candles.
//
// Nothing in this module invents, substitutes, or silently repairs data.
// Every failure is a MarketDataError with a machine-readable `code`.

import { validatePair } from "@/lib/marketDataExchange";
import { getValidatedKlines } from "@/lib/marketDataKlines";
import { CanonicalPair, Interval, ValidatedKlines } from "@/lib/marketDataTypes";

export * from "@/lib/marketDataTypes";
export { getExchangeInfo, validatePair } from "@/lib/marketDataExchange";
export { getValidatedKlines } from "@/lib/marketDataKlines";

export type CandleResult = ValidatedKlines & { pair: CanonicalPair };

/**
 * Validates `baseAsset`/`quoteAsset` as a real, currently-tradable Binance
 * Spot pair, then fetches and validates its historical candles for
 * `interval`. This is the one call Phase 2+ chart/analysis code should use.
 *
 * Throws MarketDataError on any failure — unsupported pair, unsupported
 * interval, upstream outage, or invalid candle data.
 */
export async function getCandles(
  baseAsset: string,
  interval: Interval,
  opts?: { limit?: number; quoteAsset?: string }
): Promise<CandleResult> {
  const pair = await validatePair(baseAsset, opts?.quoteAsset ?? "USDT");
  const result = await getValidatedKlines(pair.symbol, interval, opts?.limit);
  return { pair, ...result };
}

/**
 * Convenience check for UI/future components that need to know up front
 * whether an asset has a usable Binance Spot pair, without throwing.
 * Returns null (not a guess) if the pair isn't supported.
 */
export async function tryValidatePair(
  baseAsset: string,
  quoteAsset = "USDT"
): Promise<CanonicalPair | null> {
  try {
    return await validatePair(baseAsset, quoteAsset);
  } catch {
    return null;
  }
}
