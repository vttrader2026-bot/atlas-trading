// ATLAS COIN EXPLORER — Phase 1: Binance Spot exchange info + canonical
// trading-pair validation. Nothing here ever assumes a pair exists — every
// asset is checked against a live (or recently cached) snapshot of
// Binance's actual tradable spot symbols before anything downstream uses it.

import { getRedis } from "@/lib/redis";
import { CanonicalPair, ExchangeInfoSnapshot, MarketDataError } from "@/lib/marketDataTypes";

const BASE = "https://data-api.binance.vision/api/v3";

const REDIS_CACHE_KEY = "market-data:exchange-info:v1";
// Tradable-pair status changes rarely enough that a long TTL is appropriate,
// but short enough that a newly listed/delisted pair shows up same-day.
const CACHE_TTL_SEC = 60 * 60; // serve from cache for up to 1h
const CACHE_KEEP_SEC = 60 * 60 * 6; // allow a stale copy for up to 6h if Binance is down

type RawExchangeInfoSymbol = {
  symbol?: unknown;
  status?: unknown;
  baseAsset?: unknown;
  quoteAsset?: unknown;
  isSpotTradingAllowed?: unknown;
};

type CachedSnapshot = {
  fetchedAt: number;
  pairs: CanonicalPair[];
};

// In-process fallback cache + in-flight de-dup, used whenever Redis isn't
// configured (e.g. local dev) and to avoid firing two upstream requests at
// once if several callers race for a cold cache.
let memoryCache: CachedSnapshot | null = null;
let inFlight: Promise<{ snapshot: CachedSnapshot; stale: boolean }> | null = null;

function toSnapshot(cached: CachedSnapshot, stale: boolean): ExchangeInfoSnapshot {
  return {
    fetchedAt: cached.fetchedAt,
    stale,
    bySymbol: new Map(cached.pairs.map((p) => [p.symbol, p])),
  };
}

async function fetchExchangeInfo(): Promise<CachedSnapshot> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/exchangeInfo`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new MarketDataError(
      timedOut ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
      `Failed to reach Binance exchangeInfo: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!res.ok) {
    throw new MarketDataError(
      "UPSTREAM_UNAVAILABLE",
      `Binance exchangeInfo returned HTTP ${res.status}`
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new MarketDataError("MALFORMED_RESPONSE", "Binance exchangeInfo response was not valid JSON");
  }

  const symbols = (data as { symbols?: unknown })?.symbols;
  if (!Array.isArray(symbols)) {
    throw new MarketDataError(
      "MALFORMED_RESPONSE",
      "Binance exchangeInfo response is missing a `symbols` array"
    );
  }

  const pairs: CanonicalPair[] = [];
  for (const raw of symbols as RawExchangeInfoSymbol[]) {
    if (
      typeof raw.symbol !== "string" ||
      typeof raw.baseAsset !== "string" ||
      typeof raw.quoteAsset !== "string" ||
      typeof raw.status !== "string"
    ) {
      continue; // malformed entry — skip it, don't fabricate fields
    }
    if (raw.status !== "TRADING") continue;
    if (raw.isSpotTradingAllowed === false) continue; // explicit false = not spot-tradable

    pairs.push({
      symbol: raw.symbol,
      baseAsset: raw.baseAsset,
      quoteAsset: raw.quoteAsset,
      isSpotTradingAllowed: raw.isSpotTradingAllowed !== false,
    });
  }

  if (pairs.length === 0) {
    throw new MarketDataError(
      "MALFORMED_RESPONSE",
      "Binance exchangeInfo response contained no usable TRADING spot symbols"
    );
  }

  return { fetchedAt: Date.now(), pairs };
}

/**
 * Returns the current set of tradable Binance Spot pairs, cached to avoid
 * hammering the weight-20 exchangeInfo endpoint on every call. Falls back to
 * a stale cached copy (clearly marked, never presented as fresh) if Binance
 * is unreachable and nothing else is available.
 */
export async function getExchangeInfo(): Promise<ExchangeInfoSnapshot> {
  const redis = getRedis();

  if (redis) {
    const cached = await redis.get<CachedSnapshot>(REDIS_CACHE_KEY);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_SEC * 1000) {
      return toSnapshot(cached, false);
    }
  } else if (memoryCache && Date.now() - memoryCache.fetchedAt < CACHE_TTL_SEC * 1000) {
    return toSnapshot(memoryCache, false);
  }

  if (inFlight) {
    const result = await inFlight;
    return toSnapshot(result.snapshot, result.stale);
  }

  inFlight = (async (): Promise<{ snapshot: CachedSnapshot; stale: boolean }> => {
    try {
      const fresh = await fetchExchangeInfo();
      if (redis) {
        await redis.set(REDIS_CACHE_KEY, fresh, { ex: CACHE_KEEP_SEC });
      } else {
        memoryCache = fresh;
      }
      return { snapshot: fresh, stale: false };
    } catch (err) {
      // Upstream failed — fall back to a stale cached copy if we have one,
      // rather than surfacing an error when slightly-old data would do. The
      // caller is always told it's stale; nothing here presents it as fresh.
      const staleCopy = redis ? await redis.get<CachedSnapshot>(REDIS_CACHE_KEY) : memoryCache;
      if (staleCopy) return { snapshot: staleCopy, stale: true };
      throw err;
    } finally {
      inFlight = null;
    }
  })();

  const result = await inFlight;
  return toSnapshot(result.snapshot, result.stale);
}

/**
 * Validates that `baseAsset`/`quoteAsset` form an active Binance Spot pair.
 * Throws MarketDataError("UNSUPPORTED_PAIR") rather than ever substituting
 * a different pair or guessing. Asset tickers are matched case-insensitively
 * but the returned pair always carries Binance's own casing.
 */
export async function validatePair(baseAsset: string, quoteAsset = "USDT"): Promise<CanonicalPair> {
  const base = baseAsset.trim().toUpperCase();
  const quote = quoteAsset.trim().toUpperCase();
  if (!base || !quote) {
    throw new MarketDataError("UNSUPPORTED_PAIR", "Base and quote asset are required");
  }

  const info = await getExchangeInfo();
  const symbol = `${base}${quote}`;
  const pair = info.bySymbol.get(symbol);

  if (!pair) {
    throw new MarketDataError(
      "UNSUPPORTED_PAIR",
      `${base}/${quote} is not an active Binance Spot trading pair`
    );
  }
  // Defensive: confirm the matched entry's own base/quote actually agree
  // with what was requested (guards against any future symbol-format
  // surprise rather than trusting string concatenation alone).
  if (pair.baseAsset !== base || pair.quoteAsset !== quote) {
    throw new MarketDataError(
      "UNSUPPORTED_PAIR",
      `${base}/${quote} did not resolve to a matching canonical pair`
    );
  }

  return pair;
}
