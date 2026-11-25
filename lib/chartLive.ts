// ATLAS CHARTS — Phase 1: pure helpers for the /charts workspace (kept free of
// React and the chart library so they can be unit-tested directly).

import { isChartInterval, nextOpenTime, type Candle, type ChartInterval } from "@/lib/marketDataTypes";
import type { LiveKline } from "@/lib/klineStream";

/** Timeframe controls shown on /charts, in display order. Values are the API/Binance interval strings. */
export const CHART_TIMEFRAMES: { value: ChartInterval; label: string }[] = [
  { value: "15m", label: "15m" },
  { value: "1h", label: "1h" },
  { value: "4h", label: "4h" },
  { value: "1d", label: "1D" },
  { value: "1w", label: "1W" },
  { value: "1M", label: "1M" },
];

export const DEFAULT_CHART_SYMBOL = "BTCUSDT";
export const DEFAULT_CHART_INTERVAL: ChartInterval = "1h";
/** History requested from /api/chart/klines (the route allows up to 1000). */
export const CHART_HISTORY_LIMIT = 500;
/** Cap on candles kept in memory while live updates append new ones. */
export const CHART_MAX_CANDLES = 1500;

/** "BTCUSDT" → "BTC". Null unless it is a plain USDT symbol. */
export function baseOfUsdtSymbol(symbol: string): string | null {
  if (!/^[A-Z0-9]{1,20}USDT$/.test(symbol)) return null;
  return symbol.slice(0, -4);
}

/** Reads ?symbol= and ?tf= safely. Anything malformed falls back to the defaults. */
export function parseChartParams(search: string): { symbol: string; interval: ChartInterval } {
  const p = new URLSearchParams(search);
  const rawSymbol = (p.get("symbol") ?? "").trim().toUpperCase().replace(/[/\-_ ]/g, "");
  // "1M" (month) and "1m" (minute) differ only by case: try the exact spelling first, then lowercase ("4H" -> "4h").
  const exactTf = (p.get("tf") ?? "").trim();
  const rawTf = isChartInterval(exactTf) ? exactTf : exactTf.toLowerCase();
  return {
    symbol: baseOfUsdtSymbol(rawSymbol) ? rawSymbol : DEFAULT_CHART_SYMBOL,
    interval: isChartInterval(rawTf) ? rawTf : DEFAULT_CHART_INTERVAL,
  };
}

export type LiveApply =
  | { kind: "update"; candles: Candle[]; candle: Candle } // same candle as the last one: replace it
  | { kind: "append"; candles: Candle[]; candle: Candle } // the next candle: add it
  | { kind: "stale" } // older than the last candle: ignore (the chart library rejects out-of-order updates)
  | { kind: "gap" }; // jumped more than one interval ahead: history is missing, caller must reload

/**
 * Applies one validated live kline to the in-memory candle list without
 * mutating it. Handles the three real cases: the forming candle ticking,
 * a new candle opening, and anything out of order or after a gap.
 */
export function applyLiveKline(candles: Candle[], k: LiveKline, interval: ChartInterval): LiveApply {
  const last = candles[candles.length - 1];
  if (!last) return { kind: "gap" };
  if (k.openTime < last.openTime) return { kind: "stale" };

  const candle: Candle = {
    openTime: k.openTime,
    closeTime: k.closeTime,
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
    volume: k.volume,
    quoteVolume: k.quoteVolume,
    status: k.closed ? "closed" : "forming",
  };

  if (k.openTime === last.openTime) {
    return { kind: "update", candles: [...candles.slice(0, -1), candle], candle };
  }
  if (k.openTime > nextOpenTime(last.openTime, interval)) return { kind: "gap" };

  const next = [...candles, candle];
  return { kind: "append", candles: next.length > CHART_MAX_CANDLES ? next.slice(next.length - CHART_MAX_CANDLES) : next, candle };
}

/** User-facing message key (under `charts.err.`) for an error code from /api/chart/klines. */
export function errorKeyForCode(code: string): "unsupportedPair" | "unsupportedInterval" | "network" | "unavailable" {
  switch (code) {
    case "UNSUPPORTED_PAIR":
    case "UNKNOWN_SYMBOL":
    case "MISSING_SYMBOL":
      return "unsupportedPair";
    case "UNSUPPORTED_INTERVAL":
      return "unsupportedInterval";
    case "NETWORK_ERROR":
      return "network";
    default:
      return "unavailable";
  }
}
