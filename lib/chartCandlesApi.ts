// ATLAS CHARTS: browser-side client for GET /api/chart/klines (the validated
// Binance Spot history). Errors carry a machine-readable `code` that
// lib/chartLive.errorKeyForCode turns into a user-facing message.

import type { Candle, ChartInterval } from "@/lib/marketDataTypes";
import { CHART_HISTORY_LIMIT, baseOfUsdtSymbol } from "@/lib/chartLive";

export type CandlesResult = { candles: Candle[]; stale: boolean };

export async function fetchCandles(symbol: string, interval: ChartInterval): Promise<CandlesResult> {
  const base = baseOfUsdtSymbol(symbol);
  if (!base) throw Object.assign(new Error("bad symbol"), { code: "UNSUPPORTED_PAIR" });
  const params = new URLSearchParams({ symbol: base, quote: "USDT", interval, limit: String(CHART_HISTORY_LIMIT) });
  let res: Response;
  try {
    res = await fetch(`/api/chart/klines?${params.toString()}`);
  } catch {
    throw Object.assign(new Error("network"), { code: "NETWORK_ERROR" });
  }
  let data: { candles?: Candle[]; stale?: boolean; error?: string } | null = null;
  try {
    data = await res.json();
  } catch {
    /* handled below */
  }
  if (!res.ok || !data || !Array.isArray(data.candles)) {
    throw Object.assign(new Error("klines failed"), { code: data?.error || "UNKNOWN_ERROR" });
  }
  return { candles: data.candles, stale: !!data.stale };
}
