import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { consumeAnalyzeUsage, peekAnalyzeUsage } from "@/lib/plan";

// Google-maintained aliases for the current Gemini releases — avoid
// hardcoding specific dated model names that Google later retires.
// Flash and Flash-Lite draw from separate free-tier quota pools, so
// falling back to Flash-Lite is a real second chance on the same key —
// unlike rotating between multiple keys, which shares one quota per
// Google Cloud project and doesn't actually add capacity.
const MODEL_PRIMARY = "gemini-flash-latest";
const MODEL_FALLBACK = "gemini-flash-lite-latest";

// Per-attempt timeout for the Gemini call. Vercel serverless functions have
// their own hard ceiling, so this just makes sure a hung request fails fast
// and cleanly (as a caught, logged error) rather than running out the clock
// and surfacing a raw platform timeout to the user.
const GEMINI_TIMEOUT_MS = 25_000;

// User-facing message for any transient AI-provider failure (503 overload,
// 429 after both models are exhausted, timeouts, or network errors). Never
// expose provider name, retry counts, or other internal detail here — that
// only goes to console.error for server-side logs.
function serviceUnavailableMessage(lang: string): string {
  return lang === "ar"
    ? "المحلل غير متاح مؤقتًا — نشهد إقبالاً كبيرًا حاليًا. يرجى المحاولة مرة أخرى بعد لحظات."
    : "Analyzer temporarily unavailable — we're experiencing high demand. Please try again in a moment.";
}

type TraderContext = {
  pair?: string;
  timeframe?: string;
  style?: string;
};

function buildPrompt(lang: string, context: TraderContext): string {
  const languageLine =
    lang === "ar"
      ? `LANGUAGE REQUIREMENT — VERY IMPORTANT:
- The user selected Arabic. Write EVERY human-readable value in the JSON in Modern Standard Arabic.
- Do NOT write English words or labels in the analysis text. This includes market structure, trend, strength, conditions, scenario explanations, confirmations, targets descriptions, what-to-watch items, invalidation explanations, trade plan text, risk notes, and Teach Me explanations.
- Translate labels such as Bullish=صاعد، Bearish=هابط، Ranging=متذبذب، Unclear=غير واضح، Neutral=محايد، Weak=ضعيف، Moderate=متوسط، Strong=قوي، Resistance=مقاومة، Support=دعم، Long=شراء، Short=بيع، Wait — no clear setup=انتظار — لا توجد فرصة واضحة، Potential Breakout=اختراق محتمل، Bearish Breakdown=كسر هابط، Bullish Pullback=تصحيح صاعد، Trend Continuation=استمرار الاتجاه، Reversal Attempt=محاولة انعكاس، Range=نطاق، No Clear Setup=لا توجد فرصة واضحة.
- Technical abbreviations and symbols may remain standard when appropriate: BTC, ETH, USDT, RSI, MACD, MA, BOS, CHoCH, FVG, 15M, 1H, 4H, 1D, 1W.
- Price numbers, ticker symbols, and pair names must remain unchanged.
- Do not mix Arabic and English sentences. The final analysis should read naturally in Arabic.`
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

  return `You are Atlas, a precision-over-prediction crypto chart analyst. You are reading a screenshot of a crypto trading chart (TradingView, an exchange app, or similar).

${contextLines ? `Trader-provided context (use it, but trust what you actually see in the image over this if they conflict):\n${contextLines}\n` : ""}
CORE RULES — these matter more than anything else:
1. Never invent probabilities, confidence percentages, or guaranteed outcomes ("90% chance", "will pump", "guaranteed target"). Use conditional language only: "if price confirms above X, the bullish case strengthens" — never "price will reach X".
2. Never invent an indicator value you cannot actually see (RSI, MACD, volume, moving averages). If it's not visibly on the chart, say so plainly instead of guessing a number.
3. Only name levels, patterns, or structure concepts (support/resistance, supply/demand, liquidity, fair value gap, break of structure) that are genuinely visible or inferable from price action in the image. Don't force concepts onto a chart that doesn't show them.
4. It is not only acceptable but expected to conclude there is no clean setup and the trader should wait. Do not force a bullish or bearish case where none exists.
5. Be honest if the image is blurry, not a trading chart, or otherwise hard to read.
6. Always provide exactly 3 targets per scenario (and in tradePlan.targets) when direction is Long or Short — label them as a progression (first/nearest, second, third/furthest). If the chart doesn't clearly show three distinct levels, the third can be a reasonable further extension based on visible structure — but never fabricate false precision, and never drop below 3 just because fewer levels are obvious at a glance. Only use fewer than 3 (or "N/A") when direction is "Wait — no clear setup".

Respond with ONLY a JSON object, no other text, matching exactly this shape:

{
  "pair": "the traded pair if visible/given, otherwise your best guess or 'Unclear'",
  "timeframe": "the chart timeframe if visible/given, otherwise 'Unclear'",
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
    "confirmation": "the specific condition that would confirm this",
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
    "direction": "Long" | "Short" | "Wait — no clear setup",
    "entryZone": "approximate zone, or 'N/A' if direction is Wait",
    "invalidation": "same as invalidation.level, or 'N/A'",
    "targets": ["target 1", "target 2", "target 3"],
    "riskNote": "1 short sentence reminding the trader this is structural analysis, not financial advice, and to size position by their own risk tolerance"
  },
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

// Google's free-tier models occasionally return 503 "high demand" errors.
// These are transient, so retry a few times with a short backoff before
// giving up and surfacing an error to the user.
async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastRes: Response | undefined;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) return res;
      // Only retry on transient server-side errors, not on bad requests/auth issues.
      if (res.status !== 503 && res.status !== 429) return res;
      lastRes = res;
    } catch (err) {
      clearTimeout(timeout);
      // Timeout (AbortError) or a network-level failure. Treat exactly like
      // a transient 503 for retry purposes, and log the real cause.
      const isAbort = err instanceof Error && err.name === "AbortError";
      console.error(
        isAbort ? `Gemini request timed out after ${GEMINI_TIMEOUT_MS}ms` : "Gemini request failed",
        !isAbort ? err : ""
      );
      lastRes = undefined;
      if (i === attempts - 1) throw err;
    }
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  if (!lastRes) {
    // Every attempt threw (timeout/network) rather than returning a Response.
    throw new Error("All retry attempts failed with no response");
  }
  return lastRes;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "No Gemini API key configured. Add GEMINI_API_KEY to .env.local (locally) or your Vercel project's Environment Variables (in production), then restart/redeploy.",
      },
      { status: 500 }
    );
  }

  const { userId } = await auth();
  let usageInfo: { plan: string; remaining: number; limit: number } | null = null;
  if (userId) {
    // Read-only check — do NOT consume a use yet. We only spend one of the
    // user's daily attempts once the analysis genuinely succeeds, below.
    const usage = await peekAnalyzeUsage(userId);
    if (!usage.allowed) {
      return NextResponse.json(
        {
          error:
            usage.plan === "elite"
              ? "You've used all 20 Elite analyses for today. This resets at midnight UTC."
              : "You've used both free analyses for today. This resets at midnight UTC, or upgrade to Atlas Elite for 20 a day.",
        },
        { status: 429 }
      );
    }
  }

  const formData = await req.formData();
  const file = formData.get("image");
  const lang = (formData.get("lang") as string) || "en";
  const context: TraderContext = {
    pair: (formData.get("pair") as string) || undefined,
    timeframe: (formData.get("timeframe") as string) || undefined,
    style: (formData.get("style") as string) || undefined,
  };

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No image was uploaded." }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const mimeType = file.type || "image/png";

  function callGemini(model: string) {
    return fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: buildPrompt(lang, context) },
                { inline_data: { mime_type: mimeType, data: base64 } },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
      }
    );
  }

  let geminiRes: Response;
  try {
    geminiRes = await callGemini(MODEL_PRIMARY);

    // Flash and Flash-Lite have separate daily quotas on the same key, so a
    // 429 on one is worth one real retry on the other before giving up.
    if (!geminiRes.ok && geminiRes.status === 429) {
      console.error(`Gemini ${MODEL_PRIMARY} hit 429 — falling back to ${MODEL_FALLBACK}`);
      geminiRes = await callGemini(MODEL_FALLBACK);
    }
  } catch (err) {
    // Every retry attempt timed out or failed at the network level. This is
    // exactly the same class of "temporarily unavailable" failure as a 503
    // from the provider — never surface the raw cause to the user.
    console.error("Gemini call failed after retries (timeout or network error):", err);
    return NextResponse.json({ error: serviceUnavailableMessage(lang) }, { status: 503 });
  }

  if (!geminiRes.ok) {
    const detail = await geminiRes.text();
    // Log the real detail server-side (visible in Vercel's function logs),
    // but never send raw API error text to whoever's using the site.
    console.error(`Gemini API error (${geminiRes.status}):`, detail.slice(0, 500));

    if (geminiRes.status === 503) {
      return NextResponse.json({ error: serviceUnavailableMessage(lang) }, { status: 503 });
    }
    if (geminiRes.status === 429) {
      // Both primary and fallback models are exhausted for the day — still
      // a provider-capacity issue from the user's point of view, not
      // something they can act on, so same generic message.
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
    return NextResponse.json(
      { error: "The analyzer returned an empty response. Try a different image." },
      { status: 502 }
    );
  }

  try {
    const parsed = JSON.parse(text);
    if (userId) {
      const usage = await consumeAnalyzeUsage(userId);
      usageInfo = { plan: usage.plan, remaining: usage.remaining, limit: usage.limit };
    }
    return NextResponse.json(usageInfo ? { ...parsed, _usage: usageInfo } : parsed);
  } catch {
    console.error("Couldn't parse Gemini response as JSON:", text.slice(0, 500));
    return NextResponse.json(
      { error: "The analyzer's response couldn't be read. Try again in a moment." },
      { status: 502 }
    );
  }
}
