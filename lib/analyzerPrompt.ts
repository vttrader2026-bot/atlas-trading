// ATLAS ANALYZER — prompt + verified-facts builder for the data-driven
// (chart panel) Analyzer. Lives in lib/ so it can be unit-tested without
// calling the AI; app/api/analyze-chart/route.ts only wires it to the
// request, auth and quota.

import { calcEMA, calcMACD, calcRSI, latest } from "@/lib/indicators";
import type { Candle, Interval } from "@/lib/marketDataTypes";
import { classifyStructure, findSwings, findZones, volumeReport } from "@/lib/chartStructure";

function languageLine(lang: string): string {
  return lang === "ar"
    ? `LANGUAGE REQUIREMENT — VERY IMPORTANT:
- The user selected Arabic. Write EVERY human-readable value in the JSON in Modern Standard Arabic.
- Do NOT write English words or labels in the analysis text.
- Technical abbreviations and symbols may remain standard: BTC, ETH, USDT, RSI, MACD, EMA, 15M, 1H, 4H, 1D, 1W.
- Price numbers, ticker symbols, and pair names must remain unchanged.
- Do not mix Arabic and English sentences.`
    : lang === "fr"
    ? `LANGUAGE REQUIREMENT — VERY IMPORTANT:
- The user selected French. Write EVERY human-readable value in the JSON in natural, professional French.
- Technical abbreviations and symbols may remain standard: BTC, ETH, USDT, RSI, MACD, EMA, 15M, 1H, 4H, 1D, 1W.
- Price numbers, ticker symbols, and pair names must remain unchanged.
- Do not mix French and English sentences.`
    : "Respond with all human-readable text values written in English.";
}

// Same response contract as the screenshot Analyzer (app/api/analyze/route.ts)
// so the frontend renders either with the same UI. Spot-only: the trade
// plan is either a Long (buy) setup or "Wait"; bearish analysis is framed as
// downside risk / what would invalidate the long, never as a short idea.
export const RESPONSE_SHAPE = `{
  "pair": "the pair given",
  "timeframe": "the timeframe given",
  "marketStructure": { "state": "Bullish" | "Bearish" | "Ranging" | "Unclear", "explanation": "1-2 sentences naming the actual labelled swings (HH/HL/LH/LL) from the facts block" },
  "trend": { "direction": "Bullish" | "Bearish" | "Neutral", "strength": "Weak" | "Moderate" | "Strong", "explanation": "1 sentence: price action first, then EMA 20/50/200 position" },
  "momentum": "RSI, MACD and volume read using the exact calculated values supplied; say plainly when momentum disagrees with structure",
  "keyLevels": [ { "label": "Resistance 1 | Resistance 2 | Current Price | Support 1 | Support 2", "price": "taken from the supplied zones only" } ],
  "currentCondition": { "label": "short label, e.g. 'Bullish Pullback', 'Potential Breakout', 'Downtrend', 'Range', 'Trend Continuation', 'No Clear Setup'", "explanation": "2-4 sentences" },
  "bullishScenario": { "confirmation": "specific condition", "targets": ["target 1", "target 2", "target 3"], "why": "1-2 sentences" } | null,
  "bearishScenario": { "confirmation": "what downside / loss of support would look like (risk framing for a spot holder, NOT a short entry)", "targets": ["downside level 1", "downside level 2", "downside level 3"], "why": "1-2 sentences" } | null,
  "whatToWatch": ["2-4 short items"],
  "noClearSetup": "reason when there is no suitable spot setup, otherwise null",
  "invalidation": { "level": "specific price below which the idea fails", "explanation": "1 sentence" },
  "tradePlan": { "direction": "Long" | "Wait — no clear setup", "entryZone": "zone or N/A", "invalidation": "same as invalidation.level, or N/A", "targets": ["target 1", "target 2", "target 3"], "riskNote": "1 short sentence: structural analysis, not financial advice", "riskReward": "e.g. '1 : 2.4' computed from your own entry/invalidation/first target, or 'N/A'" },
  "observations": { "confirmed": ["facts directly supported by the supplied data"], "uncertain": ["interpretations that depend on future price action or on data not supplied"] },
  "teachMe": {
    "structure": "2-3 sentences, beginner-friendly",
    "trend": "1-2 sentences, beginner-friendly",
    "keyLevels": "2-3 sentences, beginner-friendly",
    "confirmation": "1-2 sentences, beginner-friendly",
    "invalidation": "1-2 sentences, beginner-friendly"
  }
}`;

export const HIGHER_TF: Partial<Record<Interval, Interval>> = { "15m": "1h", "1h": "4h", "4h": "1d", "1d": "1w" };
export const LOWER_TF: Partial<Record<Interval, Interval>> = { "1w": "1d", "1d": "4h", "4h": "1h", "1h": "15m" };

export type Facts = {
  interval: Interval;
  candleCount: number;
  lastClose: number;
  rangeHigh: number;
  rangeLow: number;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  structure: ReturnType<typeof classifyStructure>;
  support: { low: number; high: number; touches: number }[];
  resistance: { low: number; high: number; touches: number }[];
  volume: ReturnType<typeof volumeReport>;
};

export function computeFacts(interval: Interval, candles: Candle[]): Facts {
  const last = candles[candles.length - 1];
  const swings = findSwings(candles, 3);
  const zones = findZones(swings, last.close);
  const m = calcMACD(candles);
  return {
    interval,
    candleCount: candles.length,
    lastClose: last.close,
    rangeHigh: Math.max(...candles.map((c) => c.high)),
    rangeLow: Math.min(...candles.map((c) => c.low)),
    ema20: latest(calcEMA(candles, 20)),
    ema50: latest(calcEMA(candles, 50)),
    ema200: latest(calcEMA(candles, 200)),
    rsi14: latest(calcRSI(candles, 14)),
    macd: latest(m.macd),
    macdSignal: latest(m.signal),
    macdHist: latest(m.histogram),
    structure: classifyStructure(candles, swings),
    support: zones.support,
    resistance: zones.resistance,
    volume: volumeReport(candles),
  };
}

const n = (v: number | null, d = 6) => (v === null ? "not enough history" : String(Number(v.toFixed(d))));
const zoneText = (z: { low: number; high: number; touches: number }[]) =>
  z.length === 0 ? "none found in the supplied history" : z.map((x) => `${n(x.low)}-${n(x.high)} (${x.touches} touch${x.touches === 1 ? "" : "es"})`).join("; ");

function factsBlock(f: Facts, full: boolean): string {
  const s = f.structure;
  const lines = [
    `Timeframe ${f.interval} — ${f.candleCount} candles, last close ${n(f.lastClose)}`,
    `Market structure (computed from confirmed swing points): ${s.state}. Recent labelled swings, oldest first: ${
      s.labelled.length ? s.labelled.map((l) => `${l.label}@${n(l.price)}`).join(", ") : "none confirmed"
    }. Last swing high ${n(s.lastSwingHigh)}, last swing low ${n(s.lastSwingLow)}. Latest close beyond last swing high: ${s.brokeLastSwingHigh}; beyond last swing low: ${s.brokeLastSwingLow}.`,
    `EMA 20 / 50 / 200: ${n(f.ema20)} / ${n(f.ema50)} / ${n(f.ema200)}`,
    `RSI(14): ${n(f.rsi14, 2)}; MACD ${n(f.macd)} signal ${n(f.macdSignal)} histogram ${n(f.macdHist)}`,
  ];
  if (full) {
    lines.push(
      `Recent range: low ${n(f.rangeLow)} / high ${n(f.rangeHigh)}`,
      `Support zones below price (nearest first): ${zoneText(f.support)}`,
      `Resistance zones above price (nearest first): ${zoneText(f.resistance)}`,
      `Volume (closed candles): last candle ${f.volume.lastVsAvg20 === null ? "n/a" : f.volume.lastVsAvg20.toFixed(2) + "x"} its 20-candle average; 5-candle avg is ${
        f.volume.avg5VsAvg20 === null ? "n/a" : f.volume.avg5VsAvg20.toFixed(2) + "x"
      } the 20-candle avg (${f.volume.trend}); breakout confirmation: ${f.volume.breakoutConfirmation}`
    );
  }
  return lines.join("\n");
}

export function buildPrompt(args: { lang: string; pair: string; primary: Facts; higher: Facts | null; lower: Facts | null; higherName: string | null; lowerName: string | null }): string {
  return `You are Atlas, a classic technical analysis and market-structure analyst for SPOT crypto trading. You are given REAL, server-fetched Binance Spot data and facts computed from it (swing points, structure labels, support/resistance zones, volume, indicators) for ${args.pair} — not a screenshot. Use ONLY the facts below; never invent a price, level, indicator value or setup that isn't derivable from them.

METHODOLOGY — apply in this order of priority:
1. Market structure and price action come first (HH/HL/LH/LL, trend changes, swing points). Indicators are supporting evidence, never the lead argument.
2. Support/resistance: use only the supplied zones (levels the market actually reacted at).
3. Trend: price action alongside EMA 20/50/200 where the values exist; say so if EMA 200 lacks history.
4. Momentum: interpret RSI and MACD from the exact supplied values. Indicators do NOT all have to agree — when they conflict with structure, say so and weight structure higher.
5. Volume: judge expansion/contraction and breakout confirmation from the supplied volume facts only.
6. Multi-timeframe: use the higher timeframe for direction and the lower timeframe to refine entries, only where that block is supplied.
7. Trade plan: give entry zone, invalidation, 3 targets and risk/reward ONLY when the structure justifies a spot BUY. Otherwise set direction to "Wait — no clear setup" and explain why in noClearSetup. Waiting is a valid, expected answer.

HARD RULES:
- SPOT ONLY. Never recommend a short, a sell-to-open, leverage, margin or futures. tradePlan.direction is only "Long" or "Wait — no clear setup". In a downtrend with no base, the answer is Wait. bearishScenario describes downside risk / loss of support for a spot holder, not a short entry.
- Never invent probabilities or guaranteed outcomes; use conditional language.
- For a Long: invalidation must be BELOW the last close, and all 3 targets ABOVE it, taken from the supplied resistance zones / range high (or a clearly-labelled measured extension). Compute riskReward yourself from your own entry, invalidation and first target; if you cannot, write "N/A".
- Separate what is confirmed (directly in the facts) from what is uncertain (depends on future candles or on missing data) in the "observations" field.
- If an indicator value says "not enough history", do not cite one.

=== PRIMARY TIMEFRAME FACTS ===
${factsBlock(args.primary, true)}

=== HIGHER TIMEFRAME CONTEXT (${args.higherName ?? "unavailable"}) ===
${args.higher ? factsBlock(args.higher, false) : "Not available — do not make multi-timeframe claims about direction."}

=== LOWER TIMEFRAME CONTEXT (${args.lowerName ?? "unavailable"}) ===
${args.lower ? factsBlock(args.lower, false) : "Not available — do not make claims about entry refinement."}

Respond with ONLY a JSON object, no other text, matching exactly this shape:
${RESPONSE_SHAPE}

${languageLine(args.lang)}

Before returning JSON, silently check every human-readable string and remove any unnecessary English when a different language is selected.`;
}

