// ATLAS ANALYZER — objective, deterministic chart facts computed from real
// candles: swing points, market-structure labels, support/resistance zones
// and volume behaviour. The AI is given these as verified facts to reason
// about; it is never asked to eyeball them (and so never needs to invent
// them). Nothing here pads, interpolates or guesses: if there isn't enough
// history the result says so explicitly.

import type { Candle } from "@/lib/marketDataTypes";

export type Swing = { index: number; time: number; price: number; kind: "high" | "low" };

/**
 * Pivot swings: a candle is a swing high (low) if its high (low) is the
 * strict extreme of the `lookback` candles on each side. The final
 * `lookback` candles can't be confirmed yet and are never reported.
 */
export function findSwings(candles: Candle[], lookback = 3): Swing[] {
  const out: Swing[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= lookback; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isHigh = false;
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isLow = false;
    }
    if (isHigh) out.push({ index: i, time: candles[i].openTime, price: candles[i].high, kind: "high" });
    if (isLow) out.push({ index: i, time: candles[i].openTime, price: candles[i].low, kind: "low" });
  }
  return out.sort((a, b) => a.index - b.index);
}

export type StructureLabel = "HH" | "HL" | "LH" | "LL";
export type StructureState = "Bullish" | "Bearish" | "Ranging" | "Unclear";

export type StructureReport = {
  state: StructureState;
  /** Most recent labelled swings, oldest first, e.g. [{HL @ 62000}, {HH @ 66000}]. */
  labelled: { label: StructureLabel; price: number; time: number }[];
  lastSwingHigh: number | null;
  lastSwingLow: number | null;
  /** True if the latest close is beyond the last confirmed swing in the opposite direction. */
  brokeLastSwingLow: boolean;
  brokeLastSwingHigh: boolean;
};

/** Label each swing against the previous swing of the same kind, then derive the state. */
export function classifyStructure(candles: Candle[], swings: Swing[]): StructureReport {
  const highs = swings.filter((s) => s.kind === "high");
  const lows = swings.filter((s) => s.kind === "low");
  const labelled: StructureReport["labelled"] = [];
  for (let i = 1; i < highs.length; i++) {
    labelled.push({ label: highs[i].price > highs[i - 1].price ? "HH" : "LH", price: highs[i].price, time: highs[i].time });
  }
  for (let i = 1; i < lows.length; i++) {
    labelled.push({ label: lows[i].price > lows[i - 1].price ? "HL" : "LL", price: lows[i].price, time: lows[i].time });
  }
  labelled.sort((a, b) => a.time - b.time);
  const recent = labelled.slice(-6);

  const lastTwoHighs = highs.slice(-2);
  const lastTwoLows = lows.slice(-2);
  let state: StructureState = "Unclear";
  if (lastTwoHighs.length === 2 && lastTwoLows.length === 2) {
    const hh = lastTwoHighs[1].price > lastTwoHighs[0].price;
    const hl = lastTwoLows[1].price > lastTwoLows[0].price;
    if (hh && hl) state = "Bullish";
    else if (!hh && !hl) state = "Bearish";
    else state = "Ranging";
  }

  const lastClose = candles.length ? candles[candles.length - 1].close : null;
  const lastHigh = highs.length ? highs[highs.length - 1].price : null;
  const lastLow = lows.length ? lows[lows.length - 1].price : null;
  return {
    state,
    labelled: recent,
    lastSwingHigh: lastHigh,
    lastSwingLow: lastLow,
    brokeLastSwingHigh: lastClose !== null && lastHigh !== null && lastClose > lastHigh,
    brokeLastSwingLow: lastClose !== null && lastLow !== null && lastClose < lastLow,
  };
}

export type Zone = { low: number; high: number; mid: number; touches: number };

/**
 * Support/resistance zones from clustered swing prices: swings within
 * `tolerancePct` of each other merge into one zone; more touches = stronger.
 * Returns the nearest zones below (support) and above (resistance) the last
 * close — only levels the market has actually reacted at.
 */
export function findZones(
  swings: Swing[],
  lastClose: number,
  tolerancePct = 0.6,
  perSide = 3
): { support: Zone[]; resistance: Zone[] } {
  const sorted = [...swings].sort((a, b) => a.price - b.price);
  const clusters: { prices: number[] }[] = [];
  for (const s of sorted) {
    const c = clusters[clusters.length - 1];
    if (c && (s.price - c.prices[0]) / c.prices[0] * 100 <= tolerancePct) c.prices.push(s.price);
    else clusters.push({ prices: [s.price] });
  }
  const zones: Zone[] = clusters.map((c) => {
    const low = Math.min(...c.prices);
    const high = Math.max(...c.prices);
    return { low, high, mid: (low + high) / 2, touches: c.prices.length };
  });
  const support = zones
    .filter((z) => z.high < lastClose)
    .sort((a, b) => b.mid - a.mid)
    .slice(0, perSide);
  const resistance = zones
    .filter((z) => z.low > lastClose)
    .sort((a, b) => a.mid - b.mid)
    .slice(0, perSide);
  return { support, resistance };
}

export type VolumeReport = {
  lastVsAvg20: number | null; // last CLOSED candle's volume / 20-candle average
  avg5VsAvg20: number | null; // short-term vs longer-term average (expansion / contraction)
  trend: "expanding" | "contracting" | "flat" | "unknown";
  /** Volume of the last closed candle relative to its 20-candle average, when it also made a new 20-candle high/low close. */
  breakoutConfirmation: "high-close-on-high-volume" | "low-close-on-high-volume" | "none" | "unknown";
};

export function volumeReport(candles: Candle[]): VolumeReport {
  const closed = candles.filter((c) => c.status === "closed");
  if (closed.length < 21) {
    return { lastVsAvg20: null, avg5VsAvg20: null, trend: "unknown", breakoutConfirmation: "unknown" };
  }
  const avg = (arr: Candle[]) => arr.reduce((s, c) => s + c.volume, 0) / arr.length;
  const last = closed[closed.length - 1];
  const prior20 = closed.slice(-21, -1);
  const avg20 = avg(prior20);
  const avg5 = avg(closed.slice(-5));
  const lastVsAvg20 = avg20 > 0 ? last.volume / avg20 : null;
  const avg5VsAvg20 = avg20 > 0 ? avg5 / avg20 : null;
  const trend: VolumeReport["trend"] =
    avg5VsAvg20 === null ? "unknown" : avg5VsAvg20 > 1.2 ? "expanding" : avg5VsAvg20 < 0.8 ? "contracting" : "flat";
  const highestClose = Math.max(...prior20.map((c) => c.close));
  const lowestClose = Math.min(...prior20.map((c) => c.close));
  const bigVolume = lastVsAvg20 !== null && lastVsAvg20 >= 1.5;
  const breakoutConfirmation: VolumeReport["breakoutConfirmation"] =
    bigVolume && last.close > highestClose
      ? "high-close-on-high-volume"
      : bigVolume && last.close < lowestClose
        ? "low-close-on-high-volume"
        : "none";
  return { lastVsAvg20, avg5VsAvg20, trend, breakoutConfirmation };
}

export type SetupConsistency = { ok: true } | { ok: false; reason: string };

/**
 * Spot-only sanity check on a model-produced Long plan, using only numbers
 * we can verify: invalidation must sit below the current price and every
 * target above it. Anything else is a hallucinated or inverted plan.
 */
export function checkLongPlan(lastClose: number, invalidation: number | null, targets: (number | null)[]): SetupConsistency {
  if (invalidation === null) return { ok: false, reason: "no numeric invalidation level" };
  if (invalidation >= lastClose) return { ok: false, reason: "invalidation is not below the current price" };
  const nums = targets.filter((t): t is number => t !== null);
  if (nums.length === 0) return { ok: false, reason: "no numeric targets" };
  if (nums.some((t) => t <= lastClose)) return { ok: false, reason: "a target is not above the current price" };
  return { ok: true };
}
