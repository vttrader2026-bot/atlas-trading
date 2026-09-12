import { NextRequest, NextResponse } from "next/server";

// Google-maintained alias for the current Gemini Flash release — avoids
// hardcoding a specific dated model name that Google later retires.
const MODEL = "gemini-flash-latest";

function buildPrompt(lang: string): string {
  const languageLine =
    lang === "ar"
      ? "Respond with all text values written in Arabic."
      : "Respond with all text values written in English.";

  return `You are reading a screenshot of a crypto trading chart (TradingView, an exchange app, or similar).

Look at price structure, trend, any visible support/resistance or supply/demand zones, and momentum. Then respond with ONLY a JSON object, no other text, with exactly these fields:

{
  "pair": "the traded pair if visible on the chart, otherwise your best guess or 'Unclear'",
  "bias": "Bullish, Bearish, or Neutral",
  "keyLevel": "the single most important price level on this chart and why it matters, one short sentence",
  "invalidation": "the price or condition that would prove this read wrong, one short sentence",
  "plan": "one or two sentences on how a trader might approach this — not financial advice, just a structural read"
}

${languageLine}

Be direct and specific to what's actually visible in the image. If the chart is unclear or not a trading chart, say so honestly in each field rather than inventing detail.`;
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
              { text: buildPrompt(lang) },
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
