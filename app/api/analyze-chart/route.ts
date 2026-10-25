import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { consumeAnalyzeUsage, peekAnalyzeUsage } from "@/lib/plan";
import { getCandles, MarketDataError, type Interval } from "@/lib/marketData";
import { calcEMA, calcMACD, calcRSI, latest } from "@/lib/indicators";

// Same models, same retry policy, same per-attempt timeout as the
// screenshot-based Analyzer (app/api/analyze/route.ts) — this route is a
// second INPUT path into the exact same AI analysis feature, not a new one.
const MODEL_PRIMARY = "gemini-flash-latest";
const MODEL_FALLBACK = "gemini-flash-lite-latest";
const GEMINI_TIMEOUT_MS = 25_000;

function serviceUnavailableMessage(lang: string): string {
  return lang === "ar"
    ? "المحلل غير متاح مؤقتًا — نشهد إقبالاً كبيرًا حاليًا. يرجى المحاولة مرة أخرى بعد لحظات."
    : lang === "fr"
    ? "Analyseur temporairement indisponible — nous connaissons une forte demande. Veuillez réessayer dans un instant."
    : "Analyzer temporarily unavailable — we're experiencing high demand. Please try again in a moment.";
}

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

// Identical response contract to the screenshot Analyzer (app/api/analyze/route.ts)
// so the frontend can render either result with the same UI.
const RESPONSE_SHAPE = `{
  "pair": "the pair given",
  "timeframe": "the timeframe given",
  "marketStructure": { "state": "Bullish" | "Bearish" | "Ranging" | "Unclear", "explanation": "1-2 sentences citing the actual supplied data" },
  "trend": { "direction": "Bullish" | "Bearish" | "Neutral", "strength": "Weak" | "Moderate" | "Strong", "explanation": "1 sentence on why" },
  "momentum": "notes on RSI/MACD/EMA values actually supplied below — cite the real numbers, never invent different ones",
  "keyLevels": [ { "label": "Resistance 1 | Resistance 2 | Current Price | Support 1 | Support 2 | etc", "price": "approximate price from the supplied candle data" } ],
  "currentCondition": { "label": "short label, e.g. 'Bullish Pullback', 'Potential Breakout', 'Bearish Breakdown', 'Range', 'Trend Continuation', 'Reversal Attempt', 'No Clear Setup'", "explanation": "2-4 sentences" },
  "bullishScenario": { "confirmation": "specific condition", "targets": ["target 1", "target 2", "target 3"], "why": "1-2 sentences" },
  "bearishScenario": { "confirmation": "specific condition", "targets": ["target 1", "target 2", "target 3"], "why": "1-2 sentences" },
  "whatToWatch": ["2-4 short items"],
  "noClearSetup": "reason, or null",
  "invalidation": { "level": "specific price/condition", "explanation": "1 sentence" },
  "tradePlan": { "direction": "Long" | "Short" | "Wait — no clear setup", "entryZone": "zone or N/A", "invalidation": "same as invalidation.level, or N/A", "targets": ["target 1", "target 2", "target 3"], "riskNote": "1 short sentence reminding the trader this is structural analysis, not financial advice" },
  "teachMe": {
    "structure": "2-3 sentences, beginner-friendly",
    "trend": "1-2 sentences, beginner-friendly",
    "keyLevels": "2-3 sentences, beginner-friendly",
    "confirmation": "1-2 sentences, beginner-friendly",
    "invalidation": "1-2 sentences, beginner-friendly"
  }
}`;

function buildPrompt(args: {
  lang: string;
  pair: string;
  interval: Interval;
  candleCount: number;
  lastClose: number;
  high: number;
  low: number;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
}): string {
  return `You are Atlas, a precision-over-prediction crypto chart analyst. You are given REAL, server-fetched Binance Spot OHLCV data and real, server-computed indicator values for ${args.pair} on the ${args.interval} timeframe — not a screenshot. Use ONLY the numbers below; never invent a price or indicator value that isn't listed here.

REAL MARKET DATA (authoritative):
- Pair: ${args.pair}
- Timeframe: ${args.interval}
- Candles analyzed: ${args.candleCount} most recent ${args.interval} candles
- Current/last close price: ${args.lastClose}
- Recent range high: ${args.high}
- Recent range low: ${args.low}
- EMA 20: ${args.ema20 ?? "not enough history yet"}
- EMA 50: ${args.ema50 ?? "not enough history yet"}
- EMA 200: ${args.ema200 ?? "not enough history yet"}
- RSI (14): ${args.rsi14 ?? "not enough history yet"}
- MACD line: ${args.macd ?? "not enough history yet"}
- MACD signal line: ${args.macdSignal ?? "not enough history yet"}
- MACD histogram: ${args.macdHist ?? "not enough history yet"}

CORE RULES — these matter more than anything else:
1. Never invent probabilities, confidence percentages, or guaranteed outcomes. Use conditional language only.
2. Only cite an indicator value from the REAL MARKET DATA block above. If one is "not enough history yet", say so plainly instead of guessing a number.
3. Only name levels, patterns, or structure concepts that are genuinely supportable from the supplied range/price data.
4. It is expected to conclude there is no clean setup and the trader should wait, when that's what the data shows.
5. Always provide exactly 3 targets per scenario (and in tradePlan.targets) when direction is Long or Short, built from the real high/low/EMA levels above — never fabricated false precision. Only use fewer than 3 (or "N/A") when direction is "Wait — no clear setup".

Respond with ONLY a JSON object, no other text, matching exactly this shape:
${RESPONSE_SHAPE}

${languageLine(args.lang)}

Before returning JSON, silently check every human-readable string and remove any unnecessary English when a different language is selected.`;
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastRes: Response | undefined;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) return res;
      if (res.status !== 503 && res.status !== 429) return res;
      lastRes = res;
    } catch (err) {
      clearTimeout(timeout);
      const isAbort = err instanceof Error && err.name === "AbortError";
      console.error(
        isAbort ? `Gemini request timed out after ${GEMINI_TIMEOUT_MS}ms` : "Gemini request failed",
        !isAbort ? err : ""
      );
      lastRes = undefined;
      if (i === attempts - 1) throw err;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }
  if (!lastRes) throw new Error("All retry attempts failed with no response");
  return lastRes;
}

export const maxDuration = 30;

/**
 * POST /api/analyze-chart
 * Body: { baseAsset: string, quoteAsset?: string, interval: Interval, lang?: string }
 *
 * The data-driven twin of app/api/analyze/route.ts (the screenshot
 * Analyzer): instead of a chart image, this fetches real, validated OHLCV
 * candles server-side via lib/marketData, computes real indicator values
 * via lib/indicators, and feeds those numbers — never a bare coin name — to
 * the same Gemini models under the same Elite/quota rules.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "No Gemini API key configured on the server." },
      { status: 500 }
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Please sign in to use the Analyzer." }, { status: 401 });
  }

  const usage = await peekAnalyzeUsage(userId);
  if (!usage.allowed) {
    return NextResponse.json(
      {
        error:
          usage.plan === "elite"
            ? "You've used all 20 Elite analyses for today. This resets at midnight UTC."
            : "You've used all 3 free analyses for today. This resets at midnight UTC, or upgrade to Atlas Elite for 20 a day.",
      },
      { status: 429 }
    );
  }

  let body: { baseAsset?: string; quoteAsset?: string; interval?: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const baseAsset = body.baseAsset?.trim().toUpperCase();
  const quoteAsset = body.quoteAsset?.trim().toUpperCase() || "USDT";
  const interval = body.interval as Interval | undefined;
  const lang = body.lang || "en";

  if (!baseAsset || !interval) {
    return NextResponse.json({ error: "baseAsset and interval are required." }, { status: 400 });
  }

  let candleCount = 250;
  let pairSymbol: string;
  let lastClose: number, high: number, low: number;
  let ema20: number | null, ema50: number | null, ema200: number | null;
  let rsi14: number | null;
  let macd: number | null, macdSignal: number | null, macdHist: number | null;

  try {
    const result = await getCandles(baseAsset, interval, { limit: candleCount, quoteAsset });
    const candles = result.candles;
    candleCount = candles.length;
    pairSymbol = result.pair.symbol;

    if (candles.length === 0) {
      return NextResponse.json({ error: "No candle data available for this pair/timeframe." }, { status: 502 });
    }

    const last = candles[candles.length - 1];
    lastClose = last.close;
    high = Math.max(...candles.map((c) => c.high));
    low = Math.min(...candles.map((c) => c.low));

    ema20 = latest(calcEMA(candles, 20));
    ema50 = latest(calcEMA(candles, 50));
    ema200 = latest(calcEMA(candles, 200));
    rsi14 = latest(calcRSI(candles, 14));
    const m = calcMACD(candles);
    macd = latest(m.macd);
    macdSignal = latest(m.signal);
    macdHist = latest(m.histogram);
  } catch (err) {
    if (err instanceof MarketDataError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 502 });
    }
    console.error("analyze-chart: market data fetch failed", err);
    return NextResponse.json({ error: "Could not load real market data for this pair right now." }, { status: 502 });
  }

  const pairLabel = `${baseAsset}/${quoteAsset}`;
  const prompt = buildPrompt({
    lang,
    pair: pairLabel,
    interval,
    candleCount,
    lastClose,
    high,
    low,
    ema20,
    ema50,
    ema200,
    rsi14,
    macd,
    macdSignal,
    macdHist,
  });

  function callGemini(model: string) {
    return fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );
  }

  let geminiRes: Response;
  try {
    geminiRes = await callGemini(MODEL_PRIMARY);
    if (!geminiRes.ok && geminiRes.status === 429) {
      console.error(`Gemini ${MODEL_PRIMARY} hit 429 — falling back to ${MODEL_FALLBACK}`);
      geminiRes = await callGemini(MODEL_FALLBACK);
    }
  } catch (err) {
    console.error("Gemini call failed after retries (timeout or network error):", err);
    return NextResponse.json({ error: serviceUnavailableMessage(lang) }, { status: 503 });
  }

  if (!geminiRes.ok) {
    const detail = await geminiRes.text();
    console.error(`Gemini API error (${geminiRes.status}):`, detail.slice(0, 500));
    if (geminiRes.status === 503) {
      return NextResponse.json({ error: serviceUnavailableMessage(lang) }, { status: 503 });
    }
    if (geminiRes.status === 429) {
      return NextResponse.json({ error: serviceUnavailableMessage(lang) }, { status: 429 });
    }
    return NextResponse.json(
      { error: "The analyzer couldn't complete this read. Try again in a moment." },
      { status: 502 }
    );
  }

  const data = await geminiRes.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    console.error("Gemini returned an empty response.");
    return NextResponse.json({ error: "The analyzer returned an empty response. Try again." }, { status: 502 });
  }

  try {
    const parsed = JSON.parse(text);
    const consumed = await consumeAnalyzeUsage(userId);
    return NextResponse.json({
      ...parsed,
      pair: pairLabel,
      timeframe: interval,
      _symbol: pairSymbol,
      _usage: { plan: consumed.plan, remaining: consumed.remaining, limit: consumed.limit },
    });
  } catch {
    console.error("Couldn't parse Gemini response as JSON:", text.slice(0, 500));
    return NextResponse.json({ error: "The analyzer's response couldn't be read. Try again in a moment." }, { status: 502 });
  }
}
