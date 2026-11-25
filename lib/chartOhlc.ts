// OHLC legend values for the candle under the crosshair (or the latest one).

import type { Candle } from "@/lib/marketDataTypes";

export type OhlcSummary = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePct: number;
  up: boolean;
};

/** Change is measured candle-open → candle-close, the way exchange charts show it. */
export function summarizeCandle(c: Pick<Candle, "open" | "high" | "low" | "close" | "volume">): OhlcSummary {
  const change = c.close - c.open;
  return {
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    volume: c.volume,
    change,
    changePct: c.open === 0 ? 0 : (change / c.open) * 100,
    up: c.close >= c.open,
  };
}

/** Compact volume: 1.23K, 4.5M, 2.1B. */
export function formatVolume(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  return v.toFixed(a >= 100 ? 0 : 2);
}
