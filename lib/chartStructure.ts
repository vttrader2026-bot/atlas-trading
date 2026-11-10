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

/**
 * Swings within this percentage of each other are "equal" (a double top / bottom),
 * not a higher or lower swing — float noise or a few ticks must not flip the structure.
 */
export const SWING_EQUALITY_PCT = 0.15;

/** 1 = `b` is higher than `a`, -1 = lower, 0 = equal within tolerance. */
function compareSwing(a: number, b: number, tolPct = SWING_EQUALITY_PCT): 1 | -1 | 0 {
  if (Math.abs(b - a) <= (Math.abs(a) * tolPct) / 100) return 0;
  return b > a ? 1 : -1;
}

/** Label each swing against the previous swing of the same kind, then derive the state. Equal swings get no label. */
export function classifyStructure(candles: Candle[], swings: Swing[]): StructureReport {
  const highs = swings.filter((s) => s.kind === "high");
  const lows = swings.filter((s) => s.kind === "low");
  const labelled: StructureReport["labelled"] = [];
  for (let i = 1; i < highs.length; i++) {
    const c = compareSwing(highs[i - 1].price, highs[i].price);
    if (c !== 0) labelled.push({ label: c > 0 ? "HH" : "LH", price: highs[i].price, time: highs[i].time });
  }
  for (let i = 1; i < lows.length; i++) {
    const c = compareSwing(lows[i - 1].price, lows[i].price);
    if (c !== 0) labelled.push({ label: c > 0 ? "HL" : "LL", price: lows[i].price, time: lows[i].time });
  }
  labelled.sort((a, b) => a.time - b.time);
  const recent = labelled.slice(-6);

  const lastTwoHighs = highs.slice(-2);
  const lastTwoLows = lows.slice(-2);
  let state: StructureState = "Unclear";
  if (lastTwoHighs.length === 2 && lastTwoLows.length === 2) {
    const h = compareSwing(lastTwoHighs[0].price, lastTwoHighs[1].price);
    const l = compareSwing(lastTwoLows[0].price, lastTwoLows[1].price);
    if (h > 0 && l > 0) state = "Bullish";
    else if (h < 0 && l < 0) state = "Bearish";
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
  const zones = clusterZones(swings, tolerancePct);
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

/** All swing clusters (zones), ascending by price, regardless of where price is. */
export function clusterZones(swings: Swing[], tolerancePct = 0.6): Zone[] {
  const sorted = [...swings].sort((a, b) => a.price - b.price);
  const clusters: { prices: number[] }[] = [];
  for (const s of sorted) {
    const c = clusters[clusters.length - 1];
    if (c && (s.price - c.prices[0]) / c.prices[0] * 100 <= tolerancePct) c.prices.push(s.price);
    else clusters.push({ prices: [s.price] });
  }
  return clusters.map((c) => {
    const low = Math.min(...c.prices);
    const high = Math.max(...c.prices);
    return { low, high, mid: (low + high) / 2, touches: c.prices.length };
  });
}

/** A breakout bar needs at least this multiple of the prior 20-candle average volume. */
export const BREAKOUT_VOLUME_MULT = 1.5;
/** How many closed candles (the breakout candle plus the ones after it) a volume-confirmed breakout stays remembered. */
export const BREAKOUT_CONFIRM_WINDOW = 3;

export type BreakoutBar = {
  index: number;
  /** Highest close of the 20 candles before the breakout candle: the level it broke. */
  level: number;
  /** Breakout candle volume / its prior 20-candle average. */
  volumeRatio: number;
};

/**
 * THE breakout definition used everywhere (volumeReport and the engine's retest rule). Candle `i` of a
 * closed-candle series is a volume-confirmed breakout bar when it
 *  1. closes above the highest close of the 20 candles before it,
 *  2. has a bullish body, and
 *  3. trades at least BREAKOUT_VOLUME_MULT x the average volume of those 20 candles.
 */
export function breakoutBarAt(closed: Candle[], i: number): BreakoutBar | null {
  if (i < 20 || i >= closed.length) return null;
  const c = closed[i];
  const prior = closed.slice(i - 20, i);
  const avg = prior.reduce((acc, x) => acc + x.volume, 0) / 20;
  if (!(avg > 0)) return null;
  const level = Math.max(...prior.map((x) => x.close));
  const volumeRatio = c.volume / avg;
  if (!(c.close > level) || !(c.close > c.open) || volumeRatio < BREAKOUT_VOLUME_MULT) return null;
  return { index: i, level, volumeRatio };
}

/**
 * The most recent volume-confirmed breakout bar inside the confirmation window that price has held above:
 * no later close fell back to or below the level it broke. `barsAgo` 0 is the last closed candle.
 */
export function recentBreakout(
  closed: Candle[],
  window = BREAKOUT_CONFIRM_WINDOW,
  /** Optional resistance the breakout candle must also close above (e.g. the zone's top). */
  aboveLevel = -Infinity
): (BreakoutBar & { barsAgo: number }) | null {
  const n = closed.length;
  for (let j = n - 1; j >= Math.max(20, n - window); j--) {
    const bar = breakoutBarAt(closed, j);
    if (!bar || !(closed[j].close > aboveLevel)) continue;
    const hold = Math.max(bar.level, aboveLevel);
    if (closed.slice(j + 1).every((c) => c.close > hold)) return { ...bar, barsAgo: n - 1 - j };
  }
  return null;
}

export type VolumeReport = {
  lastVsAvg20: number | null; // last CLOSED candle's volume / 20-candle average
  avg5VsAvg20: number | null; // short-term vs longer-term average (expansion / contraction)
  trend: "expanding" | "contracting" | "flat" | "unknown";
  /**
   * "high-close-on-high-volume" = a volume-confirmed breakout bar (see breakoutBarAt) happened on the last
   * closed candle or within BREAKOUT_CONFIRM_WINDOW and price has held above the level it broke.
   * "low-close-on-high-volume" = the last closed candle closed below the prior 20-candle lowest close on high volume.
   */
  breakoutConfirmation: "high-close-on-high-volume" | "low-close-on-high-volume" | "none" | "unknown";
  /** Candles since the remembered breakout bar (0 = last closed candle); null when there is none. */
  breakoutBarsAgo: number | null;
};

export function volumeReport(candles: Candle[]): VolumeReport {
  const closed = candles.filter((c) => c.status === "closed");
  if (closed.length < 21) {
    return { lastVsAvg20: null, avg5VsAvg20: null, trend: "unknown", breakoutConfirmation: "unknown", breakoutBarsAgo: null };
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
  const lowestClose = Math.min(...prior20.map((c) => c.close));
  const bigVolume = lastVsAvg20 !== null && lastVsAvg20 >= BREAKOUT_VOLUME_MULT;
  const breakout = recentBreakout(closed);
  const breakoutConfirmation: VolumeReport["breakoutConfirmation"] = breakout
    ? "high-close-on-high-volume"
    : bigVolume && last.close < lowestClose
      ? "low-close-on-high-volume"
      : "none";
  return { lastVsAvg20, avg5VsAvg20, trend, breakoutConfirmation, breakoutBarsAgo: breakout ? breakout.barsAgo : null };
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
