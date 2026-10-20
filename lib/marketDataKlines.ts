// ATLAS COIN EXPLORER — Phase 1: validated historical OHLCV retrieval.
// Fetches real Binance Spot klines and runs them through full integrity
// validation before returning them — never patches, fabricates, or
// interpolates candles to make a result look complete.

import { getRedis } from "@/lib/userStore";
import { parseRawKline, validateCandles } from "@/lib/marketDataValidation";
import {
  Candle,
  Interval,
  MarketDataError,
  ValidatedKlines,
  isSupportedInterval,
} from "@/lib/marketDataTypes";

const BASE = "https://data-api.binance.vision/api/v3";
const MAX_LIMIT = 1000; // Binance's documented max for /api/v3/klines
const DEFAULT_LIMIT = 500;

// Klines (especially the most recent, still-forming candle) move quickly,
// so the cache TTL is short — just enough to collapse bursts of identical
// requests (e.g. several components on one page asking for the same
// symbol/interval) without ever serving meaningfully stale "fresh" data.
const CACHE_TTL_SEC = 30;
const CACHE_KEEP_SEC = 60 * 10;

type CacheEntry = { fetchedAt: number; candles: Candle[] };

// Keyed by `${symbol}:${interval}:${limit}` so one asset's cache can never
// be returned for another — no shared/global cache key exists anywhere in
// this module.
const memoryCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<ValidatedKlines>>();

function cacheKey(symbol: string, interval: Interval, limit: number): string {
  return `market-data:klines:v1:${symbol}:${interval}:${limit}`;
}

async function fetchRawKlines(symbol: string, interval: Interval, limit: number): Promise<unknown> {
  const url = `${BASE}/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`;
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new MarketDataError(
      timedOut ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
      `Failed to reach Binance klines for ${symbol} ${interval}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!res.ok) {
    throw new MarketDataError(
      "UPSTREAM_UNAVAILABLE",
      `Binance klines for ${symbol} ${interval} returned HTTP ${res.status}`
    );
  }

  try {
    return await res.json();
  } catch {
    throw new MarketDataError(
      "MALFORMED_RESPONSE",
      `Binance klines response for ${symbol} ${interval} was not valid JSON`
    );
  }
}

function parseAndValidate(raw: unknown, symbol: string, interval: Interval): Candle[] {
  if (!Array.isArray(raw)) {
    throw new MarketDataError(
      "MALFORMED_RESPONSE",
      `Binance klines response for ${symbol} ${interval} was not an array`
    );
  }

  const now = Date.now();
  const candles: Candle[] = [];
  for (let i = 0; i < raw.length; i++) {
    const candle = parseRawKline(raw[i], now);
    if (!candle) {
      throw new MarketDataError(
        "MALFORMED_RESPONSE",
        `Binance klines response for ${symbol} ${interval} has a malformed entry at index ${i}`
      );
    }
    candles.push(candle);
  }

  const result = validateCandles(candles, interval, { symbol });
  if (!result.ok) throw result.error;
  return result.candles;
}

/**
 * Fetches and fully validates historical candles for an already-canonical
 * Binance symbol (use validatePair() first — this function does not check
 * whether the pair exists). Throws MarketDataError on any failure; never
 * returns fabricated, partial, or silently-corrected data.
 */
export async function getValidatedKlines(
  symbol: string,
  interval: Interval,
  limit: number = DEFAULT_LIMIT
): Promise<ValidatedKlines> {
  if (!isSupportedInterval(interval)) {
    throw new MarketDataError("UNSUPPORTED_INTERVAL", `Interval "${interval}" is not supported`);
  }
  const boundedLimit = Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);
  const key = cacheKey(symbol, interval, boundedLimit);
  const redis = getRedis();

  if (redis) {
    const cached = await redis.get<CacheEntry>(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_SEC * 1000) {
      return { candles: cached.candles, stale: false };
    }
  } else {
    const cached = memoryCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_SEC * 1000) {
      return { candles: cached.candles, stale: false };
    }
  }

  const pending = inFlight.get(key);
  if (pending) return pending;

  const task = (async (): Promise<ValidatedKlines> => {
    try {
      const raw = await fetchRawKlines(symbol, interval, boundedLimit);
      const candles = parseAndValidate(raw, symbol, interval);
      const entry: CacheEntry = { fetchedAt: Date.now(), candles };
      if (redis) {
        await redis.set(key, entry, { ex: CACHE_KEEP_SEC });
      } else {
        memoryCache.set(key, entry);
      }
      return { candles, stale: false };
    } catch (err) {
      // Only fall back to a stale cache for upstream/network problems —
      // never for invalid-data errors, which must always surface as-is so
      // bad data is never masked by an older "good" copy. The caller is
      // always told it's stale.
      if (err instanceof MarketDataError && err.code !== "INVALID_CANDLE_DATA") {
        const staleEntry = redis ? await redis.get<CacheEntry>(key) : memoryCache.get(key);
        if (staleEntry) return { candles: staleEntry.candles, stale: true };
      }
      throw err;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, task);
  return task;
}
