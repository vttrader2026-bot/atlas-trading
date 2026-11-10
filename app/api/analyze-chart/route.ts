import { NextRequest, NextResponse } from "next/server";
import { providersConfigured, runAnalysis } from "@/lib/ai";
import { auth } from "@clerk/nextjs/server";
import { USAGE_UNAVAILABLE_MESSAGE, analyzeLimitReachedMessage, consumeAnalyzeUsage, peekAnalyzeUsage } from "@/lib/plan";
import { getCandles, MarketDataError, type Interval } from "@/lib/marketData";
import { SUPPORTED_INTERVALS } from "@/lib/marketDataTypes";
import { buildPrompt, computeFacts, HIGHER_TF, LOWER_TF, type Facts } from "@/lib/analyzerPrompt";
import { analyzeCandles, closedCandles, type EngineResult } from "@/lib/analyzerEngine";
import { applyEngineToAnalysis } from "@/lib/analyzerEngineApply";

// Providers, models, free-tier rules and the time budget live in lib/ai (free providers only).

function serviceUnavailableMessage(lang: string): string {
  return lang === "ar"
    ? "المحلل غير متاح مؤقتًا — نشهد إقبالاً كبيرًا حاليًا. يرجى المحاولة مرة أخرى بعد لحظات."
    : lang === "fr"
    ? "Analyseur temporairement indisponible — nous connaissons une forte demande. Veuillez réessayer dans un instant."
    : "Analyzer temporarily unavailable — we're experiencing high demand. Please try again in a moment.";
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
  // Authenticate first: an anonymous caller learns nothing about server configuration.
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Please sign in to use the Analyzer." }, { status: 401 });
  }

  if (!providersConfigured(false)) {
    console.error("analyze-chart: no free AI provider is configured");
    return NextResponse.json({ error: "The analyzer is temporarily unavailable." }, { status: 503 });
  }

  const usage = await peekAnalyzeUsage(userId);
  if (usage.unavailable) {
    return NextResponse.json({ error: USAGE_UNAVAILABLE_MESSAGE }, { status: 503 });
  }
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

  const baseAsset = typeof body.baseAsset === "string" ? body.baseAsset.trim().toUpperCase() : undefined;
  const quoteAsset = typeof body.quoteAsset === "string" && body.quoteAsset.trim() ? body.quoteAsset.trim().toUpperCase() : "USDT";
  const interval = body.interval as Interval | undefined;
  const lang = body.lang === "ar" || body.lang === "fr" ? body.lang : "en";

  // The Analyzer is spot USDT only: reject anything else before any market-data or AI call.
  if (baseAsset && !/^[A-Z0-9]{1,15}$/.test(baseAsset)) {
    return NextResponse.json({ error: "Invalid baseAsset." }, { status: 400 });
  }
  if (quoteAsset !== "USDT") {
    return NextResponse.json({ error: "Only Binance USDT spot pairs are supported." }, { status: 400 });
  }
  if (interval !== undefined && !(SUPPORTED_INTERVALS as readonly string[]).includes(interval)) {
    return NextResponse.json({ error: "Unsupported interval." }, { status: 400 });
  }

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
    engine = analyzeCandles({ candles: mainClosed, interval, higherCandles: hiClosed, stale: result.stale, nowMs: Date.now() });
  } catch (err) {
    if (err instanceof MarketDataError) {
      // Distinct code for operators in the logs; the user gets a plain-language message only.
      console.error(`analyze-chart: market data failed [${err.code}] ${baseAsset}/${quoteAsset} ${interval}`);
      const notListed = err.code === "UNKNOWN_SYMBOL" || err.code === "UNSUPPORTED_PAIR";
      return NextResponse.json(
        {
          error: notListed
            ? "This pair isn't available as a Binance Spot USDT market. Choose another pair."
            : "Could not verify real market data for this pair right now. Try again in a moment.",
        },
        { status: notListed ? 404 : 502 }
      );
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

  const result = await runAnalysis({ prompt });
  if (!result.ok) {
    // Nothing is consumed on any failure: the counter is only touched after a usable analysis exists.
    if (result.kind === "empty") {
      return NextResponse.json({ error: "The analyzer returned an empty response. Try again." }, { status: 502 });
    }
    if (result.kind === "invalid") {
      return NextResponse.json({ error: "The analyzer's response couldn't be read. Try again in a moment." }, { status: 502 });
    }
    return NextResponse.json({ error: serviceUnavailableMessage(lang) }, { status: 503 });
  }

  const parsed = result.parsed;
  // Engine output replaces anything the model wrote about levels or the plan.
  applyEngineToAnalysis(parsed, engine, lang);
  const consumed = await consumeAnalyzeUsage(userId);
  // The counter is authoritative: if it cannot confirm this use (outage or a parallel request took the last one), the analysis is withheld.
  if (consumed.unavailable) return NextResponse.json({ error: USAGE_UNAVAILABLE_MESSAGE }, { status: 503 });
  if (!consumed.allowed) return NextResponse.json({ error: analyzeLimitReachedMessage(consumed.plan, consumed.limit) }, { status: 429 });
  return NextResponse.json({
    ...parsed,
    pair: pairLabel,
    timeframe: interval,
    _symbol: pairSymbol,
    _usage: { plan: consumed.plan, remaining: consumed.remaining, limit: consumed.limit },
  });
}
