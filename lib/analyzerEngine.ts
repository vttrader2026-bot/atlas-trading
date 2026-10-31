// ATLAS ANALYZER ENGINE — the single deterministic source of truth for every
// trade level the Analyzer shows, for BOTH the chart (real candles) and the
// screenshot input paths.
//
// Rules this module guarantees:
//  * Input is real, validated Binance candles; only CLOSED candles are used
//    (a still-forming candle is dropped before anything is computed).
//  * Trend (what the market is doing) is separate from setup validity (is
//    there a buyable, well-formed spot LONG right now). Bullish != LONG.
//  * Spot LONG only. There is no short logic anywhere.
//  * Entry zone, stop-loss, TP1/TP2/TP3 and risk/reward are calculated here,
//    in code. The AI never invents or calculates them.
//  * Only VALID_SETUP carries a `plan`. WAIT_FOR_CONFIRMATION, NO_CLEAN_SETUP
//    and VISUAL_READ_ONLY never contain an entry, stop or target.
//  * Every plan passes `validatePlan` (entry vs zone, SL below the whole entry
//    zone with an ATR buffer, ordered targets, R:R from the WORST entry) or
//    it is rejected with reason codes.
//  * No Fibonacci: the exact methodology has not been verified yet.

import type { Candle, Interval } from "@/lib/marketDataTypes";
import { SUPPORTED_INTERVALS } from "@/lib/marketDataTypes";
import { calcATR, calcEMA, calcRSI, latest } from "@/lib/indicators";
import {
  classifyStructure,
  clusterZones,
  findSwings,
  volumeReport,
  type StructureReport,
  type VolumeReport,
  type Zone,
} from "@/lib/chartStructure";

// ───────────────────────── configuration ─────────────────────────

export const ENGINE_CONFIG = {
  /** Minimum CLOSED candles needed for any verdict other than "insufficient data". */
  minClosedCandles: 60,
  atrPeriod: 14,
  swingLookback: 3,
  zoneTolerancePct: 0.6,
  /** Stop-loss sits at least this many ATRs below the LOW edge of the entry zone. */
  slAtrBuffer: 0.5,
  /** Price may be at most this many ATRs above the structural zone to count as "at the zone". */
  maxEntryDistanceAtr: 1,
  /** A target must be at least this many ATRs above the worst entry. */
  minTargetGapAtr: 0.5,
  /** Targets closer together than this (in ATRs) are merged. */
  minTargetSpacingAtr: 0.25,
  /** Gap used when a 2nd/3rd structural target does not exist (labelled "atr_extension"). */
  atrExtensionStep: 2,
  /** Minimum reward:risk to TP1, measured from the WORST (highest) entry price. */
  minRrTp1: 1.2,
  /** Risk (worst entry to stop) may not exceed this many ATRs. */
  maxRiskAtr: 6,
  overboughtRsi: 75,
} as const;

// ───────────────────────── types ─────────────────────────

export type Verdict = "VALID_SETUP" | "WAIT_FOR_CONFIRMATION" | "NO_CLEAN_SETUP" | "VISUAL_READ_ONLY";

export type ReasonCode =
  // data
  | "INSUFFICIENT_DATA"
  // market / structure
  | "DOWNTREND"
  | "RANGE_NO_EDGE"
  | "STRUCTURE_UNCLEAR"
  | "STRUCTURE_BROKEN"
  | "SUPPORT_BROKEN"
  | "NO_SUPPORT_ZONE"
  | "HTF_BEARISH"
  // waiting
  | "PRICE_EXTENDED"
  | "AWAIT_BULLISH_CLOSE"
  | "AWAIT_BREAKOUT_CLOSE"
  | "BREAKOUT_NEEDS_VOLUME"
  | "OVERBOUGHT"
  // plan validation (rejections)
  | "NO_TARGET_ROOM"
  | "ENTRY_INVERTED"
  | "ENTRY_NOT_IN_ZONE"
  | "SL_NOT_BELOW_ZONE"
  | "SL_BUFFER_TOO_SMALL"
  | "TARGET_BELOW_ENTRY"
  | "TARGETS_NOT_ORDERED"
  | "RR_TOO_LOW"
  | "RISK_TOO_WIDE"
  // screenshot / input
  | "PAIR_REQUIRED"
  | "PAIR_NOT_USDT"
  | "TIMEFRAME_REQUIRED"
  | "UNSUPPORTED_TIMEFRAME"
  | "CANDLES_UNAVAILABLE";

export type TrendDirection = "Bullish" | "Bearish" | "Neutral";
export type TrendStrength = "Weak" | "Moderate" | "Strong";
export type SetupType = "pullback" | "breakout";

export type TargetSource = "resistance" | "range_high" | "atr_extension";
export type PlanTarget = { price: number; rr: number; source: TargetSource };

export type TradePlan = {
  setup: SetupType;
  /** Price band to buy in. `high` is the WORST entry used for risk/reward. */
  entry: { low: number; high: number };
  stopLoss: number;
  targets: [PlanTarget, PlanTarget, PlanTarget];
  /** Risk in quote currency per 1 unit, measured from the worst entry to the stop. */
  risk: number;
  atr: number;
};

export type MarketReading = {
  price: number;
  atr: number;
  trend: { direction: TrendDirection; strength: TrendStrength };
  structure: StructureReport;
  support: Zone[];
  resistance: Zone[];
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  volume: VolumeReport;
  rangeHigh: number;
  rangeLow: number;
};

/** A structural level to watch while waiting. It is a REFERENCE, never an entry/stop/target. */
export type WatchLevel = {
  role: "hold_support" | "pullback_to_support" | "breakout_close" | "retest";
  price: number;
};

export type EngineResult = {
  verdict: Verdict;
  reasons: ReasonCode[];
  interval: Interval | null;
  closedCandles: number;
  lastClosedTime: number | null;
  /** Null only when there was not enough data (or for VISUAL_READ_ONLY). */
  market: MarketReading | null;
  higherTimeframe: { direction: TrendDirection } | null;
  /** The setup type the engine evaluated (WAIT/NO_CLEAN keep it only as a label). */
  candidate: SetupType | null;
  watch: WatchLevel | null;
  /** Present ONLY when verdict === "VALID_SETUP". */
  plan: TradePlan | null;
};

// ───────────────────────── helpers ─────────────────────────

/** Round to 8 significant digits so float noise never reaches the UI or comparisons. */
export function roundPrice(v: number): number {
  return Number(v.toPrecision(8));
}

/** Like roundPrice but never rounds UP — used for stops so rounding can't shrink the buffer. */
export function roundPriceDown(v: number): number {
  if (!(v > 0)) return roundPrice(v);
  const scale = Math.pow(10, 7 - Math.floor(Math.log10(v)));
  return Number((Math.floor(v * scale) / scale).toPrecision(8));
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function closedCandles(candles: Candle[]): Candle[] {
  return candles.filter((c) => c.status === "closed");
}

export function isSupportedTimeframe(v: string): v is Interval {
  return (SUPPORTED_INTERVALS as readonly string[]).includes(v);
}

function emptyResult(verdict: Verdict, reasons: ReasonCode[], interval: Interval | null, closed = 0): EngineResult {
  return {
    verdict,
    reasons,
    interval,
    closedCandles: closed,
    lastClosedTime: null,
    market: null,
    higherTimeframe: null,
    candidate: null,
    watch: null,
    plan: null,
  };
}

/** Screenshot input that cannot be verified against real candles: no plan, ever. */
export function visualReadOnly(reasons: ReasonCode[]): EngineResult {
  return emptyResult("VISUAL_READ_ONLY", reasons.length ? reasons : ["CANDLES_UNAVAILABLE"], null);
}

/**
 * Screenshot requirement check: a Binance USDT pair AND a supported timeframe.
 * Accepts "BTC/USDT", "btcusdt" and "BTC-USDT". Anything else cannot be
 * verified against candles, so the caller must produce VISUAL_READ_ONLY.
 */
export function resolveScreenshotMarket(
  pair: string | null | undefined,
  timeframe: string | null | undefined
): { ok: true; baseAsset: string; interval: Interval } | { ok: false; reasons: ReasonCode[] } {
  const reasons: ReasonCode[] = [];
  let baseAsset = "";
  const p = (pair ?? "").trim().toUpperCase();
  if (!p || p === "AUTO") {
    reasons.push("PAIR_REQUIRED");
  } else {
    const m = p.match(/^([A-Z0-9]{1,20})[/\-_ ]?([A-Z0-9]{2,10})$/);
    const parts = p.includes("/") || p.includes("-") || p.includes("_") || p.includes(" ") ? p.split(/[/\-_ ]/) : null;
    if (parts && parts.length === 2) {
      if (parts[1] !== "USDT") reasons.push("PAIR_NOT_USDT");
      else baseAsset = parts[0];
    } else if (m && p.endsWith("USDT") && p.length > 4) {
      baseAsset = p.slice(0, -4);
    } else {
      reasons.push("PAIR_NOT_USDT");
    }
    if (baseAsset && !/^[A-Z0-9]{1,20}$/.test(baseAsset)) {
      baseAsset = "";
      reasons.push("PAIR_NOT_USDT");
    }
  }
  const tf = (timeframe ?? "").trim().toLowerCase();
  let interval: Interval | null = null;
  if (!tf || tf === "auto") reasons.push("TIMEFRAME_REQUIRED");
  else if (isSupportedTimeframe(tf)) interval = tf;
  else reasons.push("UNSUPPORTED_TIMEFRAME");
  if (reasons.length || !baseAsset || !interval) return { ok: false, reasons: reasons.length ? reasons : ["PAIR_REQUIRED"] };
  return { ok: true, baseAsset, interval };
}

// ───────────────────────── market reading ─────────────────────────

function trendFrom(structure: StructureReport, price: number, ema20: number | null, ema50: number | null, ema200: number | null) {
  const direction: TrendDirection =
    structure.state === "Bullish" ? "Bullish" : structure.state === "Bearish" ? "Bearish" : "Neutral";
  let strength: TrendStrength = "Weak";
  if (direction !== "Neutral") {
    const up = direction === "Bullish";
    const checks: boolean[] = [];
    if (ema20 !== null) checks.push(up ? price > ema20 : price < ema20);
    if (ema20 !== null && ema50 !== null) checks.push(up ? ema20 > ema50 : ema20 < ema50);
    if (ema50 !== null && ema200 !== null) checks.push(up ? ema50 > ema200 : ema50 < ema200);
    const agree = checks.filter(Boolean).length;
    strength = agree >= 3 ? "Strong" : agree === 2 ? "Moderate" : "Weak";
  }
  return { direction, strength };
}

type Reading = { market: MarketReading; zones: Zone[]; closed: Candle[] };

function readMarket(closed: Candle[]): Reading | null {
  const atr = latest(calcATR(closed, ENGINE_CONFIG.atrPeriod));
  if (atr === null || !(atr > 0)) return null;
  const last = closed[closed.length - 1];
  const swings = findSwings(closed, ENGINE_CONFIG.swingLookback);
  const structure = classifyStructure(closed, swings);
  const zones = clusterZones(swings, ENGINE_CONFIG.zoneTolerancePct);
  const price = last.close;
  const ema20 = latest(calcEMA(closed, 20));
  const ema50 = latest(calcEMA(closed, 50));
  const ema200 = latest(calcEMA(closed, 200));
  const support = zones.filter((z) => z.high < price).sort((a, b) => b.mid - a.mid).slice(0, 3);
  const resistance = zones.filter((z) => z.low > price).sort((a, b) => a.mid - b.mid).slice(0, 3);
  return {
    closed,
    zones,
    market: {
      price,
      atr,
      trend: trendFrom(structure, price, ema20, ema50, ema200),
      structure,
      support,
      resistance,
      ema20,
      ema50,
      ema200,
      rsi14: latest(calcRSI(closed, 14)),
      volume: volumeReport(closed),
      rangeHigh: Math.max(...closed.map((c) => c.high)),
      rangeLow: Math.min(...closed.map((c) => c.low)),
    },
  };
}

// ───────────────────────── targets & validation ─────────────────────────

/**
 * Three ascending targets above the worst entry. Structural levels first
 * (resistance-zone lows, then the range high). Missing 2nd/3rd targets are
 * filled with a clearly-labelled ATR extension. If there is no structural
 * TP1 at all there is no honest target room and the result is null.
 */
export function buildTargets(
  worstEntry: number,
  atr: number,
  resistanceZones: Zone[],
  rangeHigh: number
): { price: number; source: TargetSource }[] | null {
  const minPrice = worstEntry + ENGINE_CONFIG.minTargetGapAtr * atr;
  const cands: { price: number; source: TargetSource }[] = [];
  for (const z of resistanceZones) if (z.low >= minPrice) cands.push({ price: z.low, source: "resistance" });
  if (rangeHigh >= minPrice) cands.push({ price: rangeHigh, source: "range_high" });
  cands.sort((a, b) => a.price - b.price || (a.source === "resistance" ? -1 : 1));
  const picked: { price: number; source: TargetSource }[] = [];
  for (const c of cands) {
    const prev = picked[picked.length - 1];
    if (prev && c.price - prev.price < ENGINE_CONFIG.minTargetSpacingAtr * atr) continue;
    picked.push(c);
    if (picked.length === 3) break;
  }
  if (picked.length === 0) return null;
  while (picked.length < 3) {
    const prev = picked[picked.length - 1];
    picked.push({ price: prev.price + ENGINE_CONFIG.atrExtensionStep * atr, source: "atr_extension" });
  }
  return picked;
}

export type PlanDraft = { entry: { low: number; high: number }; stopLoss: number; targets: number[] };

/**
 * The gate every plan must pass. Returns the reason codes of every failed
 * check (empty = valid). Exported so the rules can be tested in isolation.
 */
export function validatePlan(
  draft: PlanDraft,
  ctx: { atr: number; zone: { low: number; high: number } | null }
): ReasonCode[] {
  const out = new Set<ReasonCode>();
  const { entry, stopLoss, targets } = draft;
  const { atr, zone } = ctx;
  const eps = atr * 1e-4; // tolerance for 8-significant-digit price rounding

  if (!(entry.low > 0) || !(entry.high >= entry.low)) out.add("ENTRY_INVERTED");

  // Entry must sit on the structural zone: its low edge inside the zone and
  // its high edge no further than maxEntryDistanceAtr above the zone.
  if (
    !zone ||
    entry.low < zone.low - eps ||
    entry.low > zone.high + eps ||
    entry.high > zone.high + ENGINE_CONFIG.maxEntryDistanceAtr * atr + eps
  ) {
    out.add("ENTRY_NOT_IN_ZONE");
  }

  // Stop: below the ENTIRE entry zone (and the structural zone), with an ATR buffer.
  if (!(stopLoss < entry.low) || (zone && !(stopLoss < zone.low))) out.add("SL_NOT_BELOW_ZONE");
  else if (stopLoss > entry.low - ENGINE_CONFIG.slAtrBuffer * atr + eps) out.add("SL_BUFFER_TOO_SMALL");

  if (targets.length !== 3 || targets.some((t) => !Number.isFinite(t))) {
    out.add("TARGETS_NOT_ORDERED");
  } else {
    if (targets.some((t) => t <= entry.high)) out.add("TARGET_BELOW_ENTRY");
    if (!(targets[0] < targets[1] && targets[1] < targets[2])) out.add("TARGETS_NOT_ORDERED");
  }

  // Risk/reward from the WORST entry (the highest price in the zone).
  const risk = entry.high - stopLoss;
  if (!(risk > 0)) {
    out.add("SL_NOT_BELOW_ZONE");
  } else {
    if (risk > ENGINE_CONFIG.maxRiskAtr * atr + eps) out.add("RISK_TOO_WIDE");
    if (targets.length >= 1 && Number.isFinite(targets[0]) && (targets[0] - entry.high) / risk < ENGINE_CONFIG.minRrTp1 - 1e-9) {
      out.add("RR_TOO_LOW");
    }
  }
  return [...out];
}

function assemble(
  setup: SetupType,
  entryLow: number,
  entryHigh: number,
  structuralLow: number,
  zone: Zone,
  r: Reading
): { plan: TradePlan } | { reasons: ReasonCode[] } {
  const { atr, resistance, rangeHigh } = r.market;
  const entry = { low: roundPrice(entryLow), high: roundPrice(entryHigh) };
  const stopLoss = roundPriceDown(Math.min(entry.low, structuralLow) - ENGINE_CONFIG.slAtrBuffer * atr);
  const above = r.zones.filter((z) => z.low > entry.high);
  const built = buildTargets(entry.high, atr, above.length ? above : resistance, rangeHigh);
  if (!built) return { reasons: ["NO_TARGET_ROOM"] };
  const prices = built.map((t) => roundPrice(t.price));
  const reasons = validatePlan({ entry, stopLoss, targets: prices }, { atr, zone });
  if (reasons.length) return { reasons };
  const risk = entry.high - stopLoss;
  const targets = built.map((t, i) => ({
    price: prices[i],
    rr: round2((prices[i] - entry.high) / risk),
    source: t.source,
  })) as TradePlan["targets"];
  return { plan: { setup, entry, stopLoss, targets, risk: roundPrice(risk), atr: roundPrice(atr) } };
}

// ───────────────────────── setup evaluation ─────────────────────────

type Evaluation = {
  verdict: Verdict;
  reasons: ReasonCode[];
  candidate: SetupType | null;
  watch: WatchLevel | null;
  plan: TradePlan | null;
};

const noClean = (reasons: ReasonCode[], candidate: SetupType | null = null): Evaluation => ({
  verdict: "NO_CLEAN_SETUP",
  reasons,
  candidate,
  watch: null,
  plan: null,
});
const wait = (reasons: ReasonCode[], candidate: SetupType, watch: WatchLevel): Evaluation => ({
  verdict: "WAIT_FOR_CONFIRMATION",
  reasons,
  candidate,
  watch: { role: watch.role, price: roundPrice(watch.price) },
  plan: null,
});

function evaluate(r: Reading, overboughtRsi: number): Evaluation {
  const { market: m, closed, zones } = r;
  const s = m.structure;
  const last = closed[closed.length - 1];

  if (s.state === "Bearish") return noClean(["DOWNTREND"]);
  if (s.brokeLastSwingLow) return noClean(["STRUCTURE_BROKEN"]);
  if (s.state === "Unclear" || s.lastSwingHigh === null || s.lastSwingLow === null) return noClean(["STRUCTURE_UNCLEAR"]);

  const containing = (p: number) => zones.find((z) => p >= z.low && p <= z.high) ?? null;

  // ── Breakout: the last close is beyond the last confirmed swing high.
  if (s.brokeLastSwingHigh) {
    const zone = containing(s.lastSwingHigh) ?? {
      low: s.lastSwingHigh,
      high: s.lastSwingHigh,
      mid: s.lastSwingHigh,
      touches: 1,
    };
    if (m.price <= zone.high) {
      return wait(["AWAIT_BREAKOUT_CLOSE"], "breakout", { role: "breakout_close", price: zone.high });
    }
    if (m.volume.breakoutConfirmation !== "high-close-on-high-volume") {
      return wait(["BREAKOUT_NEEDS_VOLUME"], "breakout", { role: "breakout_close", price: zone.high });
    }
    if ((m.price - zone.high) / m.atr > ENGINE_CONFIG.maxEntryDistanceAtr) {
      return wait(["PRICE_EXTENDED"], "breakout", { role: "retest", price: zone.high });
    }
    return finish(assemble("breakout", zone.high, m.price, zone.low, zone, r), "breakout", m, overboughtRsi);
  }

  // ── Pullback: needs a confirmed bullish structure (HH + HL).
  if (s.state !== "Bullish") return noClean(["RANGE_NO_EDGE"]);
  const zone = containing(s.lastSwingLow);
  if (!zone) return noClean(["NO_SUPPORT_ZONE"], "pullback");
  if (m.price < zone.low) return noClean(["SUPPORT_BROKEN"], "pullback");

  if ((m.price - zone.high) / m.atr > ENGINE_CONFIG.maxEntryDistanceAtr) {
    return wait(["PRICE_EXTENDED"], "pullback", { role: "pullback_to_support", price: zone.high });
  }
  // A swing low is only confirmed `swingLookback` candles later, so the candle
  // that tested the zone sits just outside a 3-candle window.
  const recent = closed.slice(-(ENGINE_CONFIG.swingLookback + 2));
  const tested = Math.min(...recent.map((c) => c.low)) <= zone.high + 0.25 * m.atr;
  if (!tested) return wait(["PRICE_EXTENDED"], "pullback", { role: "pullback_to_support", price: zone.high });
  const confirmed = last.close > last.open && last.close >= zone.mid;
  if (!confirmed) return wait(["AWAIT_BULLISH_CLOSE"], "pullback", { role: "hold_support", price: zone.low });
  return finish(assemble("pullback", zone.mid, m.price, zone.low, zone, r), "pullback", m, overboughtRsi);
}

function finish(
  built: { plan: TradePlan } | { reasons: ReasonCode[] },
  candidate: SetupType,
  m: MarketReading,
  overboughtRsi: number
): Evaluation {
  if ("reasons" in built) return noClean(built.reasons, candidate);
  if (m.rsi14 !== null && m.rsi14 >= overboughtRsi) {
    return wait(["OVERBOUGHT"], candidate, { role: "pullback_to_support", price: m.support[0]?.high ?? m.ema20 ?? m.price });
  }
  return { verdict: "VALID_SETUP", reasons: [], candidate, watch: null, plan: built.plan };
}

// ───────────────────────── public API ─────────────────────────

export function analyzeCandles(input: {
  candles: Candle[];
  interval: Interval;
  /** Candles of the next higher timeframe, if available (context only). */
  higherCandles?: Candle[] | null;
  /** Override the RSI level above which an otherwise valid setup is demoted to WAIT. */
  overboughtRsi?: number;
}): EngineResult {
  const closed = closedCandles(input.candles);
  if (closed.length < ENGINE_CONFIG.minClosedCandles) {
    return emptyResult("NO_CLEAN_SETUP", ["INSUFFICIENT_DATA"], input.interval, closed.length);
  }
  const reading = readMarket(closed);
  if (!reading) return emptyResult("NO_CLEAN_SETUP", ["INSUFFICIENT_DATA"], input.interval, closed.length);

  let higher: EngineResult["higherTimeframe"] = null;
  if (input.higherCandles) {
    const hc = closedCandles(input.higherCandles);
    if (hc.length >= ENGINE_CONFIG.minClosedCandles) {
      const hr = readMarket(hc);
      if (hr) higher = { direction: hr.market.trend.direction };
    }
  }

  let ev = evaluate(reading, input.overboughtRsi ?? ENGINE_CONFIG.overboughtRsi);
  // Higher-timeframe downtrend: the setup may look fine here but the bigger
  // picture says wait. Demote — and drop the plan entirely.
  if (ev.verdict === "VALID_SETUP" && higher?.direction === "Bearish") {
    ev = wait(["HTF_BEARISH"], ev.candidate ?? "pullback", {
      role: "pullback_to_support",
      price: reading.market.support[0]?.high ?? reading.market.price,
    });
  }

  const last = closed[closed.length - 1];
  return {
    verdict: ev.verdict,
    reasons: ev.reasons,
    interval: input.interval,
    closedCandles: closed.length,
    lastClosedTime: last.openTime,
    market: reading.market,
    higherTimeframe: higher,
    candidate: ev.candidate,
    watch: ev.verdict === "WAIT_FOR_CONFIRMATION" ? ev.watch : null,
    plan: ev.verdict === "VALID_SETUP" ? ev.plan : null,
  };
}
// ENGINE-P1-0300
