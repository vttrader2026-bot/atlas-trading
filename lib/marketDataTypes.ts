// ATLAS COIN EXPLORER — Phase 1: shared types for the validated Binance Spot
// market-data service. See lib/marketData.ts for the public entry point.

/**
 * Candle intervals Atlas supports. Binance's API supports more (1s, 1m, 3m,
 * 5m, 30m, 2h, 6h, 8h, 12h, 3d, 1M — confirmed against Binance's current
 * REST API docs), but Phase 1 only needs this fixed set, so every other
 * interval is rejected up front rather than silently passed through.
 */
export const SUPPORTED_INTERVALS = ["15m", "1h", "4h", "1d", "1w"] as const;
export type Interval = (typeof SUPPORTED_INTERVALS)[number];

export function isSupportedInterval(value: string): value is Interval {
  return (SUPPORTED_INTERVALS as readonly string[]).includes(value);
}

/** Milliseconds in one candle of the given interval. Used to detect gaps. */
export const INTERVAL_MS: Record<Interval, number> = {
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
  "1w": 7 * 24 * 60 * 60_000,
};

export type CandleStatus = "closed" | "forming";

/**
 * A single validated OHLCV candle. `openTime` is Binance's original
 * candle-open timestamp (ms, UTC) — never recomputed or shifted.
 */
export type Candle = {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Base-asset volume. */
  volume: number;
  /** Quote-asset volume. */
  quoteVolume: number;
  /** "forming" if this candle's interval has not closed yet as of fetch time. */
  status: CandleStatus;
};

export type MarketDataErrorCode =
  | "UNSUPPORTED_INTERVAL"
  | "UNSUPPORTED_PAIR"
  | "UNKNOWN_SYMBOL"
  | "EXCHANGE_INFO_UNAVAILABLE"
  | "UPSTREAM_UNAVAILABLE"
  | "UPSTREAM_TIMEOUT"
  | "MALFORMED_RESPONSE"
  | "INVALID_CANDLE_DATA";

/**
 * A structured, machine-readable error. Every failure path in this service
 * throws one of these instead of returning fabricated or substituted data —
 * callers (routes, future UI) branch on `.code` to show an accurate
 * data-quality status rather than a generic failure or, worse, silently
 * blank data.
 */
export class MarketDataError extends Error {
  code: MarketDataErrorCode;
  constructor(code: MarketDataErrorCode, message: string) {
    super(message);
    this.name = "MarketDataError";
    this.code = code;
  }
}

/** A Binance Spot trading pair, verified against live exchange info. */
export type CanonicalPair = {
  /** Base asset ticker, e.g. "BTC". */
  baseAsset: string;
  /** Quote asset ticker, e.g. "USDT". */
  quoteAsset: string;
  /** Binance's trading symbol, e.g. "BTCUSDT". */
  symbol: string;
  isSpotTradingAllowed: boolean;
};

export type ExchangeInfoSnapshot = {
  fetchedAt: number;
  /** True if this snapshot is older than the intended refresh window and is
   * only being served because Binance was unreachable for a fresh fetch. */
  stale: boolean;
  /** Keyed by symbol, e.g. "BTCUSDT". Only TRADING, spot-tradable symbols. */
  bySymbol: Map<string, CanonicalPair>;
};

/** Result of a validated klines fetch, carrying explicit data-freshness. */
export type ValidatedKlines = {
  candles: Candle[];
  /** True if these candles came from a stale fallback cache rather than a
   * fresh upstream fetch (Binance was unreachable at request time). */
  stale: boolean;
};
