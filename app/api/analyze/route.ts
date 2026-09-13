import { NextRequest, NextResponse } from "next/server";

// Google-maintained alias for the current Gemini Flash release — avoids
// hardcoding a specific dated model name that Google later retires.
const MODEL = "gemini-flash-latest";

type TraderContext = {
  pair?: string;
  timeframe?: string;
  style?: string;
};

function buildPrompt(lang: string, context: TraderContext): string {
  const languageLine =
    lang === "ar"
      ? "Respond with all text values written in Arabic."
      : "Respond with all text values written in English.";

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
    "targets": ["potential target 1", "potential target 2"],
    "why": "1-2 sentences"
  },
  "bearishScenario": {
    "confirmation": "the specific condition that would confirm this",
    "targets": ["potential target 1", "potential target 2"],
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
    "targets": ["target 1", "target 2"],
    "riskNote": "1 short sentence reminding the trader this is structural analysis, not financial advice, and to size position by their own risk tolerance"
  }
}

If bullishScenario or bearishScenario genuinely doesn't apply (e.g. deep in a range with no directional bias), you may set that field to null. If there's no clean setup, set tradePlan.direction to "Wait — no clear setup" and fill noClearSetup with the reason.

${languageLine}`;
}

// Google's free-tier models occasionally return 503 "high demand" errors.
// These are transient, so retry a few times with a short backoff before
// giving up and surfacing an error to the user.
async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastRes: Response | undefined;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, init);
    if (res.ok) return res;
    // Only retry on transient server-side errors, not on bad requests/auth issues.
    if (res.status !== 503 && res.status !== 429) return res;
    lastRes = res;
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  return lastRes!;
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

  const geminiRes = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
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

  if (!geminiRes.ok) {
    if (geminiRes.status === 503) {
      return NextResponse.json(
        {
          error:
            "Google's free tier is under heavy load right now, even after a few automatic retries. Wait a minute and try again.",
        },
        { status: 503 }
      );
    }
    const detail = await geminiRes.text();
    return NextResponse.json(
      { error: `Gemini API error (${geminiRes.status}): ${detail.slice(0, 300)}` },
      { status: 502 }
    );
  }

  const data = await geminiRes.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    return NextResponse.json(
      { error: "Gemini returned an empty response. Try a different image." },
      { status: 502 }
    );
  }

  try {
    const parsed = JSON.parse(text);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json(
      { error: "Couldn't parse the model's response as JSON.", raw: text },
      { status: 502 }
    );
  }
}
