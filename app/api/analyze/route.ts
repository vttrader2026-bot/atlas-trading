import { NextRequest, NextResponse } from "next/server";
import { providersConfigured, runAnalysis } from "@/lib/ai";
import { auth } from "@clerk/nextjs/server";
import { USAGE_UNAVAILABLE_MESSAGE, analyzeLimitReachedMessage, consumeAnalyzeUsage, peekAnalyzeUsage } from "@/lib/plan";
import { getEntitlements, membershipUnverifiedResponse } from "@/lib/entitlements";
import { getTicker24h } from "@/lib/binance";
import { applyEngineToAnalysis, engineFactsBlock } from "@/lib/analyzerEngineApply";
import { engineForScreenshot } from "@/lib/analyzerEngineServer";
import { chooseScreenshotMarket, normalizeDetectedMarket } from "@/lib/analyzerEngine";

// Providers, models, free-tier rules and the time budget live in lib/ai (free providers only).

function serviceUnavailableMessage(lang: string): string {
  return lang === "ar"
    ? "المحلل غير متاح مؤقتًا — نشهد إقبالاً كبيرًا حاليًا. يرجى المحاولة مرة أخرى بعد لحظات."
    : lang === "fr"
    ? "Analyseur temporairement indisponible — nous connaissons une forte demande. Veuillez réessayer dans un instant."
    : "Analyzer temporarily unavailable — we're experiencing high demand. Please try again in a moment.";
}

// The engine now loads real candles before the AI call, so allow the same
// headroom as the chart route.
export const maxDuration = 30;

type TraderContext = {
  pair?: string;
  timeframe?: string;
  style?: string;
};

function buildPrompt(lang: string, context: TraderContext, livePrice: number | null, engineBlock: string): string {
  const languageLine =
    lang === "ar"
      ? `LANGUAGE REQUIREMENT — VERY IMPORTANT:
- The user selected Arabic. Write EVERY human-readable value in the JSON in Modern Standard Arabic.
- Do NOT write English words or labels in the analysis text. This includes market structure, trend, strength, conditions, scenario explanations, confirmations, targets descriptions, what-to-watch items, invalidation explanations, trade plan text, risk notes, and Teach Me explanations.
- Translate labels such as Bullish=صاعد، Bearish=هابط، Ranging=متذبذب، Unclear=غير واضح، Neutral=محايد، Weak=ضعيف، Moderate=متوسط، Strong=قوي، Resistance=مقاومة، Support=دعم، Long=شراء، Short=بيع، Wait — no clear setup=انتظار — لا توجد فرصة واضحة، Potential Breakout=اختراق محتمل، Bearish Breakdown=كسر هابط، Bullish Pullback=تصحيح صاعد، Trend Continuation=استمرار الاتجاه، Reversal Attempt=محاولة انعكاس، Range=نطاق، No Clear Setup=لا توجد فرصة واضحة.
- Technical abbreviations and symbols may remain standard when appropriate: BTC, ETH, USDT, RSI, MACD, MA, BOS, CHoCH, FVG, 15M, 1H, 4H, 1D, 1W.
- Price numbers, ticker symbols, and pair names must remain unchanged.
- Do not mix Arabic and English sentences. The final analysis should read naturally in Arabic.`
      : lang === "fr"
      ? `LANGUAGE REQUIREMENT — VERY IMPORTANT:
- The user selected French. Write EVERY human-readable value in the JSON in French (natural, professional French).
- Do NOT write English words or labels in the analysis text. This includes market structure, trend, strength, conditions, scenario explanations, confirmations, targets descriptions, what-to-watch items, invalidation explanations, trade plan text, risk notes, and Teach Me explanations.
- Technical abbreviations and symbols may remain standard when appropriate: BTC, ETH, USDT, RSI, MACD, MA, BOS, CHoCH, FVG, 15M, 1H, 4H, 1D, 1W.
- Price numbers, ticker symbols, and pair names must remain unchanged.
- Do not mix French and English sentences. The final analysis should read naturally in French.`
      : "Respond with all human-readable text values written in English.";

  const contextLines = [
    context.pair && context.pair !== "auto" ? `Trader says the pair is: ${context.pair}` : null,
    context.timeframe && context.timeframe !== "auto"
      ? `Trader says the timeframe is: ${context.timeframe}`
      : null,
    context.style ? `Trader's style: ${context.style}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `You are Atlas, a classic technical analysis and market-structure analyst for SPOT crypto trading. You are reading a screenshot of a crypto trading chart (TradingView, an exchange app, or similar).

METHODOLOGY — apply in this order of priority:
1. Market structure and price action first: higher highs/lows, lower highs/lows, trend changes, significant swing points. Indicators support the read; they never lead it.
2. Support & resistance: horizontal levels and zones that price visibly reacted at.
3. Trend: price action alongside any EMA 20/50/200 that are visibly plotted.
4. Momentum: RSI/MACD only if visibly plotted, read from what is shown. Indicators do not all have to agree; when they conflict with structure, say so and weight structure higher.
5. Volume: expansion, contraction and breakout confirmation only if volume bars are visible.
6. Multi-timeframe: only mention higher/lower-timeframe context if the trader supplied or the image shows it; otherwise say it is not available.
7. Trade planning: give entry zone, invalidation, targets and risk/reward ONLY when the chart justifies a spot buy. If conditions are unclear, say plainly that no suitable setup is identified.
SPOT ONLY: never recommend a short, sell-to-open, leverage, margin or futures. tradePlan.direction must be "Long" or "Wait — no clear setup" — never "Short". In a downtrend with no base, the answer is Wait. bearishScenario describes downside risk / loss of support for a spot holder, not a short entry.
Distinguish confirmed observations (directly visible) from uncertain interpretations (dependent on future candles or on data not visible) in the "observations" field.

${contextLines ? `Trader-provided context (use it, but trust what you actually see in the image over this if they conflict):\n${contextLines}\n` : ""}
${livePrice !== null ? `REAL-TIME MARKET DATA — authoritative for the current price:\n- The current live price for this pair is approximately ${livePrice}.\n- The chart screenshot may be from slightly earlier, so prices shown on it can differ from this real-time value. Use the screenshot for structure, levels, and patterns, but anchor any statement about the CURRENT price, and your judgment of whether a bullish/bearish confirmation condition has ALREADY happened or is still pending, to this real-time price rather than guessing from the image alone.\n` : ""}
${engineBlock}

The engine result above OVERRIDES the trade-planning instructions in this prompt: the screenshot is supporting visual context only. Never produce entry, stop-loss, target, invalidation price or risk/reward values yourself.

CORE RULES — these matter more than anything else:
1. Never invent probabilities, confidence percentages, or guaranteed outcomes ("90% chance", "will pump", "guaranteed target"). Use conditional language only: "if price confirms above X, the bullish case strengthens" — never "price will reach X".
2. Never invent an indicator value you cannot actually see (RSI, MACD, volume, moving averages). If it's not visibly on the chart, say so plainly instead of guessing a number.
3. Only name levels, patterns, or structure concepts (support/resistance, supply/demand, liquidity, fair value gap, break of structure) that are genuinely visible or inferable from price action in the image. Don't force concepts onto a chart that doesn't show them.
4. It is not only acceptable but expected to conclude there is no clean setup and the trader should wait. Do not force a bullish or bearish case where none exists.
5. Be honest if the image is blurry, not a trading chart, or otherwise hard to read.
6. Always provide exactly 3 targets per scenario (and in tradePlan.targets) when direction is Long — label them as a progression (first/nearest, second, third/furthest). If the chart doesn't clearly show three distinct levels, the third can be a reasonable further extension based on visible structure — but never fabricate false precision, and never drop below 3 just because fewer levels are obvious at a glance. Only use fewer than 3 (or "N/A") when direction is "Wait — no clear setup".

Respond with ONLY a JSON object, no other text, matching exactly this shape:

{
  "pair": "the traded pair ONLY if it is printed on the chart or given above (e.g. 'QNT/USDT'); otherwise 'Unclear'. Never guess a pair.",
  "timeframe": "the chart timeframe ONLY if it is printed on the chart or given above (e.g. '1H'); otherwise 'Unclear'",
  "marketStructure": {
    "state": "Bullish" | "Bearish" | "Ranging" | "Unclear",
    "explanation": "1-2 sentences citing actual visible structure (higher highs/lows, lower highs/lows, break of structure, range) — do not claim structure that isn't visible"
  },
  "trend": {
    "direction": "Bullish" | "Bearish" | "Neutral",
    "strength": "Weak" | "Moderate" | "Strong",
    "explanation": "1 sentence on why"
  },
  "momentum": "notes on visible candle momentum, expansion/contraction, and any visible indicators (RSI/MACD/MAs/volume) — if none are visible, say so explicitly rather than inventing values",
  "keyLevels": [
    { "label": "Resistance 1 | Resistance 2 | Current Price | Support 1 | Support 2 | etc — only levels genuinely visible", "price": "approximate price as shown on the chart" }
  ],
  "currentCondition": {
    "label": "short label, e.g. 'Bullish Pullback', 'Potential Breakout', 'Bearish Breakdown', 'Range', 'Trend Continuation', 'Reversal Attempt', 'No Clear Setup'",
    "explanation": "2-4 sentences"
  },
  "bullishScenario": {
    "confirmation": "the specific condition that would confirm this, e.g. 'price reclaims and closes above $X'",
    "targets": ["potential target 1", "potential target 2", "potential target 3 — a further extension level if genuinely visible, otherwise a reasonable continuation based on visible structure (not a guess dressed up as precision)"],
    "why": "1-2 sentences"
  },
  "bearishScenario": {
    "confirmation": "what downside / loss of support would look like (risk framing for a spot holder, NOT a short entry)",
    "targets": ["potential target 1", "potential target 2", "potential target 3 — a further extension level if genuinely visible, otherwise a reasonable continuation based on visible structure (not a guess dressed up as precision)"],
    "why": "1-2 sentences"
  },
  "whatToWatch": ["practical, specific things to wait for before acting — 2-4 short items"],
  "noClearSetup": "if there genuinely is no clean setup right now, explain why in 1-2 sentences here; otherwise null",
  "invalidation": {
    "level": "the specific price/condition",
    "explanation": "1 sentence on what a sustained break of this level would mean"
  },
  "tradePlan": {
    "direction": "Long" | "Wait — no clear setup",
    "entryZone": "approximate zone, or 'N/A' if direction is Wait",
    "invalidation": "same as invalidation.level, or 'N/A'",
    "targets": ["target 1", "target 2", "target 3"],
    "riskNote": "1 short sentence reminding the trader this is structural analysis, not financial advice, and to size position by their own risk tolerance",
    "riskReward": "computed from your own entry, invalidation and first target, e.g. '1 : 2.4', or 'N/A'"
  },
  "observations": { "confirmed": ["facts directly visible on the chart"], "uncertain": ["interpretations that depend on future price action or on data not visible"] },
  "teachMe": {
    "structure": "explain what market structure means and why this chart's structure is what it is, in plain beginner-friendly language, 2-3 sentences",
    "trend": "explain what a trend is and why this one is what it is, 1-2 sentences, beginner-friendly",
    "keyLevels": "explain what support and resistance mean in general, and why the specific levels on this chart matter, 2-3 sentences, beginner-friendly",
    "confirmation": "explain in plain language why waiting for confirmation (rather than entering immediately) usually leads to better outcomes, 1-2 sentences",
    "invalidation": "explain what an invalidation level means and why every trade idea needs one, 1-2 sentences, beginner-friendly"
  }
}

If bullishScenario or bearishScenario genuinely doesn't apply (e.g. deep in a range with no directional bias), you may set that field to null. If there's no clean setup, set tradePlan.direction to "Wait — no clear setup" and fill noClearSetup with the reason. The teachMe fields always apply regardless of setup quality — they're general trading education tied to this specific chart.

${languageLine}

Before returning JSON, silently check every human-readable string and remove any unnecessary English when Arabic is selected.`;
}


// Upload limits. Vercel rejects bodies over ~4.5 MB before this runs; this is the app-level guard.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** Free-text form fields are interpolated into the AI prompt: single line, no control characters, bounded length. */
function cleanField(v: FormDataEntryValue | null, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return t || undefined;
}

export async function POST(req: NextRequest) {
  // Authenticate first: an anonymous caller learns nothing about server configuration.
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Please sign in to use the Analyzer." },
      { status: 401 }
    );
  }

  if (!providersConfigured(true)) {
    console.error("analyze: no free AI provider is configured");
    return NextResponse.json({ error: "The analyzer is temporarily unavailable." }, { status: 503 });
  }

  // Read-only check — do NOT consume a use yet. We only spend one of the
  // user's daily attempts once the analysis genuinely succeeds, below.
  // Membership is resolved ONCE per request; the same snapshot serves the up-front check and the final charge.
  const membership = await getEntitlements(userId);
  if (membership.status === "unverified") return membershipUnverifiedResponse(); // 503, retryable, no usage touched, no AI call
  const usage = await peekAnalyzeUsage(userId, membership);
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

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  const file = formData.get("image");
  const rawLang = formData.get("lang");
  const lang = rawLang === "ar" || rawLang === "fr" ? rawLang : "en";
  const context: TraderContext = {
    pair: cleanField(formData.get("pair"), 24),
    timeframe: cleanField(formData.get("timeframe"), 8),
    style: cleanField(formData.get("style"), 60),
  };

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No image was uploaded." }, { status: 400 });
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Upload a PNG, JPEG, WebP or GIF chart image." }, { status: 400 });
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "The image is too large. Upload a chart image under 4 MB." }, { status: 413 });
  }

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const mimeType = file.type;

  // Best-effort real-time price anchor so the model isn't purely guessing
  // from the (possibly stale) screenshot. Only possible when the trader
  // picked a specific pair (not "auto") - fails open on any error so a
  // Binance hiccup never blocks the analysis itself.
  let livePrice: number | null = null;
  if (context.pair && context.pair !== "auto") {
    try {
      const symbol = context.pair.replace("/", "").toUpperCase();
      const ticker = await getTicker24h(symbol);
      const parsed = parseFloat(ticker.lastPrice);
      if (!Number.isNaN(parsed)) livePrice = parsed;
    } catch (err) {
      console.error("analyze: live price lookup failed, continuing without it", err);
    }
  }

  // Shared deterministic engine: real closed Binance USDT candles. When the trader picked both pair and timeframe the
  // engine runs first and its facts go into the prompt. On Auto the model reads the chart first; what it detected is
  // validated, and only a valid pair + timeframe reach candle verification. Manual picks always override detection.
  const manualBoth = chooseScreenshotMarket(context, { pair: null, timeframe: null });
  const fullyManual = manualBoth.pair !== null && manualBoth.timeframe !== null;
  let pre: Awaited<ReturnType<typeof engineForScreenshot>> | null = null;
  if (fullyManual) pre = await engineForScreenshot(manualBoth.pair, manualBoth.timeframe);
  const engineBlock = pre ? engineFactsBlock(pre.engine, pre.pair ?? context.pair ?? "the chart") : "";

  const result = await runAnalysis({ prompt: buildPrompt(lang, context, livePrice, engineBlock), image: { mime: mimeType, base64 } });
  if (!result.ok) {
    // Nothing is consumed on any failure: the counter is only touched after a usable analysis exists.
    if (result.kind === "empty") {
      return NextResponse.json({ error: "The analyzer returned an empty response. Try a different image." }, { status: 502 });
    }
    if (result.kind === "invalid") {
      return NextResponse.json({ error: "The analyzer's response couldn't be read. Try again in a moment." }, { status: 502 });
    }
    return NextResponse.json({ error: serviceUnavailableMessage(lang) }, { status: 503 });
  }

  const parsed = result.parsed;
  let resolved = pre;
  if (!resolved) {
    const detected = normalizeDetectedMarket(parsed.pair, parsed.timeframe);
    const chosen = chooseScreenshotMarket(context, detected);
    resolved = await engineForScreenshot(chosen.pair, chosen.timeframe, { pairDetected: chosen.pairDetected });
  }
  const { engine, pair: verifiedPair, timeframe: verifiedTimeframe } = resolved;
  // Engine output replaces anything the model wrote about levels or the plan.
  applyEngineToAnalysis(parsed, engine, lang);
  if (verifiedPair) parsed.pair = verifiedPair;
  if (verifiedTimeframe) parsed.timeframe = verifiedTimeframe.toUpperCase();
  const consumed = await consumeAnalyzeUsage(userId, membership);
  // The counter is authoritative: if it cannot confirm this use (outage or a parallel request took the last one), the analysis is withheld.
  if (consumed.unavailable) return NextResponse.json({ error: USAGE_UNAVAILABLE_MESSAGE }, { status: 503 });
  if (!consumed.allowed) return NextResponse.json({ error: analyzeLimitReachedMessage(consumed.plan, consumed.limit) }, { status: 429 });
  return NextResponse.json({ ...parsed, _usage: { plan: consumed.plan, remaining: consumed.remaining, limit: consumed.limit } });
}
