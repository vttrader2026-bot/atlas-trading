// ATLAS MARKET INTELLIGENCE — pure scoring/ranking functions.
// No network calls here; everything takes already-fetched data so it stays
// easy to reason about and test. Nothing here invents numbers: a metric that
// cannot be computed from real data is left as `null` and surfaced to the
// page as "insufficient data" rather than guessed at.

import type { Kline, Ticker24h } from "./binance";
import type { AssetCategory } from "./marketIntelAssets";

export type AssetMetrics = {
  symbol: string;
  price: number;
  change24hPct: number;
  perf7dPct: number | null;
  perf30dPct: number | null;
  trendStrengthPct: number | null; // 0-100: share of up-days in the last 30 daily candles
  volumeChangePct: number | null; // last 7d avg quote volume vs prior 7d avg
  liquidityUsdt: number; // current 24h quote volume
  volatilityPct: number | null; // stdev of daily returns over last 30 candles, in %
  dataFreshnessMinutes: number;
  insufficientHistory: boolean;
};

function closeAt(klines: Kline[], indexFromEnd: number): number | null {
  const idx = klines.length - 1 - indexFromEnd;
  if (idx < 0 || idx >= klines.length) return null;
  return klines[idx].close;
}

function pctChange(from: number | null, to: number | null): number | null {
  if (from === null || to === null || from === 0) return null;
  return ((to - from) / from) * 100;
}

export function computeAssetMetrics(symbol: string, klines: Kline[], ticker: Ticker24h, now: number): AssetMetrics {
  const price = parseFloat(ticker.lastPrice);
  const change24hPct = parseFloat(ticker.priceChangePercent);
  const liquidityUsdt = parseFloat(ticker.quoteVolume);

  // Use the latest *closed* daily candle as "today" when available (the most
  // recent candle from Binance is usually still forming), falling back to
  // the live ticker price if klines are unavailable.
  const latestClose = klines.length > 0 ? klines[klines.length - 1].close : price;

  const close7d = closeAt(klines, 7);
  const close30d = closeAt(klines, 30);
  const perf7dPct = pctChange(close7d, latestClose);
  const perf30dPct = pctChange(close30d, latestClose);

  let trendStrengthPct: number | null = null;
  let volatilityPct: number | null = null;
  const recent30 = klines.slice(-30);
  if (recent30.length >= 10) {
    const upDays = recent30.filter((k) => k.close >= k.open).length;
    trendStrengthPct = (upDays / recent30.length) * 100;

    const returns: number[] = [];
    for (let i = 1; i < recent30.length; i++) {
      const prev = recent30[i - 1].close;
      const cur = recent30[i].close;
      if (prev > 0) returns.push((cur - prev) / prev);
    }
    if (returns.length >= 5) {
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length;
      volatilityPct = Math.sqrt(variance) * 100;
    }
  }

  let volumeChangePct: number | null = null;
  if (klines.length >= 15) {
    const last7 = klines.slice(-7);
    const prior7 = klines.slice(-14, -7);
    const avgLast7 = last7.reduce((a, k) => a + k.quoteVolume, 0) / last7.length;
    const avgPrior7 = prior7.reduce((a, k) => a + k.quoteVolume, 0) / prior7.length;
    volumeChangePct = pctChange(avgPrior7, avgLast7);
  }

  const dataFreshnessMinutes = Math.max(0, Math.round((now - new Date(ticker.closeTime ?? now).getTime()) / 60000)) || 0;

  return {
    symbol,
    price,
    change24hPct,
    perf7dPct,
    perf30dPct,
    trendStrengthPct,
    volumeChangePct,
    liquidityUsdt,
    volatilityPct,
    dataFreshnessMinutes,
    insufficientHistory: recent30.length < 10,
  };
}

export type RankedAsset = AssetMetrics & {
  categories: AssetCategory[];
  relBtc7dPct: number | null;
  relBtc30dPct: number | null;
  strengthScore: number;
  rank: number;
};

// Transparent, documented weighting. Each component is converted to a 0-100
// percentile rank across the tracked universe before weighting, so wildly
// different units (percent, USDT, %-of-days) combine fairly. Weights sum to 1.
export const RANKING_WEIGHTS = {
  perf30d: 0.25,
  perf7d: 0.15,
  relBtc: 0.2,
  trend: 0.15,
  volumeChange: 0.1,
  liquidity: 0.1,
  volatility: 0.05, // lower volatility scores slightly higher (stability)
} as const;

function percentileRanks(values: Array<number | null>): number[] {
  const indexed = values.map((v, i) => ({ v, i })).filter((x) => x.v !== null) as { v: number; i: number }[];
  const n = values.length;
  const out = new Array(n).fill(50); // neutral default for missing data
  if (indexed.length <= 1) {
    indexed.forEach((x) => (out[x.i] = 50));
    return out;
  }
  const sorted = [...indexed].sort((a, b) => a.v - b.v);
  sorted.forEach((x, rank) => {
    out[x.i] = (rank / (sorted.length - 1)) * 100;
  });
  return out;
}

export function rankAssets(
  metricsList: AssetMetrics[],
  categoryMap: Map<string, AssetCategory[]>,
  btc: AssetMetrics | null,
): RankedAsset[] {
  const relBtc7d = metricsList.map((m) =>
    btc && m.perf7dPct !== null && btc.perf7dPct !== null ? m.perf7dPct - btc.perf7dPct : null,
  );
  const relBtc30d = metricsList.map((m) =>
    btc && m.perf30dPct !== null && btc.perf30dPct !== null ? m.perf30dPct - btc.perf30dPct : null,
  );
  const relBtcBlend = metricsList.map((_, i) => {
    const a = relBtc7d[i];
    const b = relBtc30d[i];
    if (a === null && b === null) return null;
    if (a === null) return b;
    if (b === null) return a;
    return a * 0.4 + b * 0.6;
  });

  const rankPerf30d = percentileRanks(metricsList.map((m) => m.perf30dPct));
  const rankPerf7d = percentileRanks(metricsList.map((m) => m.perf7dPct));
  const rankRelBtc = percentileRanks(relBtcBlend);
  const rankTrend = percentileRanks(metricsList.map((m) => m.trendStrengthPct));
  const rankVolumeChange = percentileRanks(metricsList.map((m) => m.volumeChangePct));
  const rankLiquidity = percentileRanks(metricsList.map((m) => m.liquidityUsdt));
  // Invert volatility: lower volatility -> higher percentile score.
  const rankVolatilityRaw = percentileRanks(metricsList.map((m) => m.volatilityPct));
  const rankVolatility = rankVolatilityRaw.map((r) => 100 - r);

  const scored = metricsList.map((m, i) => {
    const score =
      rankPerf30d[i] * RANKING_WEIGHTS.perf30d +
      rankPerf7d[i] * RANKING_WEIGHTS.perf7d +
      rankRelBtc[i] * RANKING_WEIGHTS.relBtc +
      rankTrend[i] * RANKING_WEIGHTS.trend +
      rankVolumeChange[i] * RANKING_WEIGHTS.volumeChange +
      rankLiquidity[i] * RANKING_WEIGHTS.liquidity +
      rankVolatility[i] * RANKING_WEIGHTS.volatility;

    return {
      ...m,
      categories: categoryMap.get(m.symbol) ?? [],
      relBtc7dPct: relBtc7d[i],
      relBtc30dPct: relBtc30d[i],
      strengthScore: score,
      rank: 0, // filled in below
    };
  });

  scored.sort((a, b) => b.strengthScore - a.strengthScore);
  scored.forEach((a, i) => (a.rank = i + 1));
  return scored;
}
