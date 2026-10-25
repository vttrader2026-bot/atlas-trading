// ATLAS ANALYSIS CHART — Phase 5: technical indicator calculations.
//
// Every function here is a pure, deterministic transform of real candle
// closes — nothing here ever invents, interpolates, or substitutes a value.
// When there isn't enough history to compute a point (e.g. EMA200 on fewer
// than 200 candles), that point is simply omitted rather than padded with a
// guess, so a caller can tell "not enough data yet" apart from "zero".

import type { Candle } from "@/lib/marketDataTypes";

export type IndicatorPoint = { time: number; value: number };

/**
 * Exponential moving average over `closes`, seeded with a simple moving
 * average of the first `period` closes (the standard approach). Returns one
 * point per candle from index `period - 1` onward — never a shorter history
 * silently padded with nulls-as-zero.
 */
export function calcEMA(candles: Candle[], period: number): IndicatorPoint[] {
  if (candles.length < period) return [];
  const k = 2 / (period + 1);
  const out: IndicatorPoint[] = [];

  let sma = 0;
  for (let i = 0; i < period; i++) sma += candles[i].close;
  sma /= period;

  let prevEma = sma;
  out.push({ time: candles[period - 1].openTime, value: prevEma });

  for (let i = period; i < candles.length; i++) {
    const ema = candles[i].close * k + prevEma * (1 - k);
    out.push({ time: candles[i].openTime, value: ema });
    prevEma = ema;
  }
  return out;
}

/**
 * Relative Strength Index (Wilder's smoothing), standard 14-period default.
 * Returns one point per candle from index `period` onward.
 */
export function calcRSI(candles: Candle[], period = 14): IndicatorPoint[] {
  if (candles.length < period + 1) return [];
  const out: IndicatorPoint[] = [];

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gainSum += diff;
    else lossSum += -diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  function rsiFromAverages(): number {
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  out.push({ time: candles[period].openTime, value: rsiFromAverages() });

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out.push({ time: candles[i].openTime, value: rsiFromAverages() });
  }
  return out;
}

export type MACDResult = {
  macd: IndicatorPoint[];
  signal: IndicatorPoint[];
  histogram: IndicatorPoint[];
};

/** Standard MACD (12/26/9 by default) computed from real closes only. */
export function calcMACD(
  candles: Candle[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): MACDResult {
  if (candles.length < slow + signalPeriod) {
    return { macd: [], signal: [], histogram: [] };
  }

  const fastEma = calcEMA(candles, fast);
  const slowEma = calcEMA(candles, slow);

  // Align by time: slowEma starts later, so index slowEma[i] against the
  // matching fastEma point at the same openTime.
  const fastByTime = new Map(fastEma.map((p) => [p.time, p.value]));
  const macdLine: IndicatorPoint[] = [];
  for (const sp of slowEma) {
    const fv = fastByTime.get(sp.time);
    if (fv === undefined) continue;
    macdLine.push({ time: sp.time, value: fv - sp.value });
  }

  if (macdLine.length < signalPeriod) {
    return { macd: macdLine, signal: [], histogram: [] };
  }

  // Signal = EMA of the MACD line itself.
  const k = 2 / (signalPeriod + 1);
  let sma = 0;
  for (let i = 0; i < signalPeriod; i++) sma += macdLine[i].value;
  sma /= signalPeriod;

  const signalLine: IndicatorPoint[] = [{ time: macdLine[signalPeriod - 1].time, value: sma }];
  let prev = sma;
  for (let i = signalPeriod; i < macdLine.length; i++) {
    const v = macdLine[i].value * k + prev * (1 - k);
    signalLine.push({ time: macdLine[i].time, value: v });
    prev = v;
  }

  const signalByTime = new Map(signalLine.map((p) => [p.time, p.value]));
  const histogram: IndicatorPoint[] = [];
  for (const mp of macdLine) {
    const sv = signalByTime.get(mp.time);
    if (sv === undefined) continue;
    histogram.push({ time: mp.time, value: mp.value - sv });
  }

  return { macd: macdLine, signal: signalLine, histogram };
}

/** Latest value of an indicator series, or null if there isn't one yet. */
export function latest(points: IndicatorPoint[]): number | null {
  if (points.length === 0) return null;
  return points[points.length - 1].value;
}
// PHASE5-MARKER-2055
