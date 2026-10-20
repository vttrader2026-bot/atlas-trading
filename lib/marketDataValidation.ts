// ATLAS COIN EXPLORER — Phase 1: pure validation logic for Binance kline
// (candlestick) responses. Kept free of any network/fetch code so it can be
// unit-tested directly against fixture data (see lib/__tests__).
//
// Nothing here corrects, fabricates, or interpolates data. A response that
// fails any check is rejected with a MarketDataError describing exactly
// what was wrong — never silently patched to "look right."

import { Candle, INTERVAL_MS, Interval, MarketDataError } from "@/lib/marketDataTypes";

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function toFiniteNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Parses one raw Binance kline array into a Candle, or returns null if the
 * shape or any field is invalid. Binance's documented kline array is:
 *   [openTime, open, high, low, close, volume, closeTime, quoteVolume,
 *    numTrades, takerBuyBaseVol, takerBuyQuoteVol, ignore]
 * Only the first 8 fields are used; the rest aren't needed for OHLCV.
 */
export function parseRawKline(raw: unknown, nowMs: number): Candle | null {
  if (!Array.isArray(raw) || raw.length < 8) return null;

  const openTime = raw[0];
  const open = toFiniteNumber(raw[1]);
  const high = toFiniteNumber(raw[2]);
  const low = toFiniteNumber(raw[3]);
  const close = toFiniteNumber(raw[4]);
  const volume = toFiniteNumber(raw[5]);
  const closeTime = raw[6];
  const quoteVolume = toFiniteNumber(raw[7]);

  if (!isFiniteNumber(openTime) || !isFiniteNumber(closeTime)) return null;
  if (open === null || high === null || low === null || close === null) return null;
  if (volume === null || quoteVolume === null) return null;

  return {
    openTime,
    closeTime,
    open,
    high,
    low,
    close,
    volume,
    quoteVolume,
    status: closeTime > nowMs ? "forming" : "closed",
  };
}

export type KlineValidationResult =
  | { ok: true; candles: Candle[] }
  | { ok: false; error: MarketDataError };

/**
 * Validates a full set of parsed candles for internal consistency:
 * chronological order, no duplicate or missing timestamps, valid OHLC
 * relationships, and non-negative volume. Returns the first problem found
 * rather than attempting to fix or drop bad entries.
 */
export function validateCandles(
  candles: Candle[],
  interval: Interval,
  context: { symbol: string }
): KlineValidationResult {
  if (candles.length === 0) {
    return { ok: true, candles };
  }

  const stepMs = INTERVAL_MS[interval];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];

    // OHLC relationships.
    if (c.high < c.open || c.high < c.close || c.high < c.low) {
      return {
        ok: false,
        error: new MarketDataError(
          "INVALID_CANDLE_DATA",
          `${context.symbol} ${interval}: candle at index ${i} (openTime ${c.openTime}) has high below open/close/low`
        ),
      };
    }
    if (c.low > c.open || c.low > c.close || c.low > c.high) {
      return {
        ok: false,
        error: new MarketDataError(
          "INVALID_CANDLE_DATA",
          `${context.symbol} ${interval}: candle at index ${i} (openTime ${c.openTime}) has low above open/close/high`
        ),
      };
    }
    if (c.volume < 0 || c.quoteVolume < 0) {
      return {
        ok: false,
        error: new MarketDataError(
          "INVALID_CANDLE_DATA",
          `${context.symbol} ${interval}: candle at index ${i} (openTime ${c.openTime}) has negative volume`
        ),
      };
    }
    if (c.closeTime <= c.openTime) {
      return {
        ok: false,
        error: new MarketDataError(
          "INVALID_CANDLE_DATA",
          `${context.symbol} ${interval}: candle at index ${i} has closeTime <= openTime`
        ),
      };
    }

    if (i > 0) {
      const prev = candles[i - 1];

      // Chronological ordering.
      if (c.openTime <= prev.openTime) {
        return {
          ok: false,
          error: new MarketDataError(
            "INVALID_CANDLE_DATA",
            `${context.symbol} ${interval}: candles out of chronological order at index ${i} (openTime ${c.openTime} <= previous ${prev.openTime})`
          ),
        };
      }

      // Duplicate timestamps (covered by the ordering check above too, but
      // kept explicit for a clearer error message on the exact-equal case).
      if (c.openTime === prev.openTime) {
        return {
          ok: false,
          error: new MarketDataError(
            "INVALID_CANDLE_DATA",
            `${context.symbol} ${interval}: duplicate openTime ${c.openTime} at index ${i}`
          ),
        };
      }

      // Missing intervals: consecutive candles must be exactly one step
      // apart. A forming final candle can legitimately be "young" (it just
      // hasn't accumulated a full interval yet), so only the gap *between
      // two closed candles*, or between a closed candle and a forming one,
      // is checked — and it must never be LARGER than one step (a smaller
      // gap before the forming candle is fine; Binance can return a
      // same-step partial as the most recent entry).
      const gap = c.openTime - prev.openTime;
      if (gap > stepMs) {
        return {
          ok: false,
          error: new MarketDataError(
            "INVALID_CANDLE_DATA",
            `${context.symbol} ${interval}: missing interval(s) between index ${i - 1} and ${i} (gap ${gap}ms, expected ${stepMs}ms)`
          ),
        };
      }
      if (gap < stepMs && prev.status === "closed") {
        // A closed candle followed by a candle that starts before the prior
        // one even finished is impossible for valid Binance data.
        return {
          ok: false,
          error: new MarketDataError(
            "INVALID_CANDLE_DATA",
            `${context.symbol} ${interval}: overlapping candles at index ${i} (gap ${gap}ms, expected ${stepMs}ms)`
          ),
        };
      }
    }
  }

  return { ok: true, candles };
}
