# Atlas Trading

A free-tier crypto trading toolkit inspired by SixTrade: live market ticker,
trade journal, risk calculator, and a chart-analyzer page — for any USDT
pair on Binance.

## What's built and working

- **Home (`/`)** — live BTC/ETH/SOL price panel, links into each tool.
- **Ticker (`/ticker`)** — live table of every Binance USDT pair, search,
  sort by 24h change or volume. Pulls straight from Binance's public REST
  API, no key needed.
- **Risk calculator (`/risk`)** — enter balance, risk %, entry, and stop;
  get position size, notional value, $ at risk, and reward:risk.
- **Journal (`/journal`)** — log trades, see running PnL per trade, export
  to CSV. Stored in the browser (`localStorage`) — no backend yet, so it's
  per-device only.
- **Analyzer (`/analyzer`)** — upload a chart screenshot, click Analyze,
  and it calls Google's Gemini vision model to read bias, the key level,
  the invalidation point, and a plan. Needs a free Gemini API key — see
  below.

## Setting up the analyzer (free)

The analyzer needs one environment variable: `GEMINI_API_KEY`.

1. Go to **https://aistudio.google.com/apikey** and sign in with a Google
   account. No credit card required.
2. Click **Create API key**, copy it.
3. In the project root, copy `.env.local.example` to `.env.local` and
   paste your key in:
   ```
   GEMINI_API_KEY=your_key_here
   ```
4. Restart `npm run dev` if it was already running — Next.js only reads
   `.env.local` on startup.

Google's free tier (via AI Studio) has no expiry and no credit card, with
daily request limits generous enough for personal use — unlike
Anthropic/OpenAI, which only give a small one-time credit. One caveat: on
the free tier, Google may use what you send to improve their models,
which is low-stakes for chart screenshots but worth knowing.

**Deploying to Vercel:** add the same `GEMINI_API_KEY` under your Vercel
project's **Settings → Environment Variables**, then redeploy (or push a
new commit) for it to take effect in production.

## What's NOT built yet

**Accounts / cloud sync.** The journal is local-only right now. Adding
Supabase (same as SixTrade uses) for auth + a `trades` table would let it
sync across devices and be the natural place to add a paid tier later.

## Running it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Deploying for free

1. Push this folder to a GitHub repo.
2. Go to vercel.com, import the repo, deploy — no config needed, it's a
   standard Next.js app.
3. Add `GEMINI_API_KEY` in Vercel's Environment Variables (see above) for
   the analyzer to work in production.
4. Vercel's Hobby tier is free for personal/non-commercial use. If you
   start charging users, move to the Pro plan ($20/mo).

## Stack

Next.js 16 (App Router) + TypeScript + Tailwind CSS v4. Gemini API powers
the analyzer; everything else (Binance data, journal) needs no backend.
