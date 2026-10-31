import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { analyzeLimitReachedMessage, consumeAnalyzeUsage, peekAnalyzeUsage } from "@/lib/plan";
import { getCandles, MarketDataError, type Interval } from "@/lib/marketData";
import { buildPrompt, computeFacts, HIGHER_TF, LOWER_TF, type Facts } from "@/lib/analyzerPrompt";
import { enforceSpotPlan } from "@/lib/spotPlan";
import { analyzeCandles, closedCandles, type EngineResult } from "@/lib/analyzerEngine";
import { applyEngineToAnalysis } from "@/lib/analyzerEngineApply";

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
        error: analyzeLimitReachedMessage(usage.plan, usage.limit),
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

  const candleCount = 250;
  let pairSymbol: string;
  let primary: Facts;
  let higher: Facts | null = null;
  let lower: Facts | null = null;
  let engine: EngineResult;
  const higherName = HIGHER_TF[interval] ?? null;
  const lowerName = LOWER_TF[interval] ?? null;

  try {
    const [main, hi, lo] = await Promise.allSettled([
      getCandles(baseAsset, interval, { limit: candleCount, quoteAsset }),
      higherName ? getCandles(baseAsset, higherName, { limit: candleCount, quoteAsset }) : Promise.reject(new Error("none")),
      lowerName ? getCandles(baseAsset, lowerName, { limit: candleCount, quoteAsset }) : Promise.reject(new Error("none")),
    ]);
    // The primary timeframe is mandatory; context timeframes degrade
    // gracefully to "unavailable" rather than being guessed.
    if (main.status === "rejected") throw main.reason;
    const result = main.value;
    pairSymbol = result.pair.symbol;
    if (result.candles.length === 0) {
      return NextResponse.json({ error: "No candle data available for this pair/timeframe." }, { status: 502 });
    }
    // Completed candles only: a still-forming candle never feeds the analysis.
    const mainClosed = closedCandles(result.candles);
    if (mainClosed.length === 0) {
      return NextResponse.json({ error: "No completed candles available for this pair/timeframe." }, { status: 502 });
    }
    primary = computeFacts(interval, mainClosed);
    const hiClosed = hi.status === "fulfilled" ? closedCandles(hi.value.candles) : [];
    const loClosed = lo.status === "fulfilled" ? closedCandles(lo.value.candles) : [];
    if (hiClosed.length > 0 && higherName) higher = computeFacts(higherName, hiClosed);
    if (loClosed.length > 0 && lowerName) lower = computeFacts(lowerName, loClosed);
    // The deterministic engine owns structure, trend, levels and the trade plan.
    engine = analyzeCandles({ candles: mainClosed, interval, higherCandles: hiClosed });
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
    primary,
    higher,
    lower,
    higherName: higher ? higherName : null,
    lowerName: lower ? lowerName : null,
    engine,
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
    // Engine output replaces anything the model wrote about levels or the plan.
    applyEngineToAnalysis(parsed, engine, lang);
    enforceSpotPlan(parsed, primary.lastClose);
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
