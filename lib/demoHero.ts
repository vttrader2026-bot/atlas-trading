// HERO-PHONE-v1: DEMO data for the homepage hero smartphone. Invented, clearly labeled on screen, never live prices,
// never a real signal and never account data. Only components/home/HeroPhone.tsx imports this file.

export const DEMO_MARKET = {
  btc: { symbol: "BTC", price: 71250, changePct: 1.8, series: [62, 60, 63, 61, 65, 64, 68, 66, 70, 73, 72, 77] },
  eth: { symbol: "ETH", price: 3480, changePct: 2.4, series: [50, 52, 51, 55, 54, 58, 57, 60, 59, 63, 66, 68] },
} as const;

export const DEMO_INTEL = { fearGreed: 62, btcDominancePct: 54.1 } as const;

/** Radar: spot coins beating BTC (percent versus BTC over the period). */
export const DEMO_RADAR = [
  { symbol: "NEAR", name: "NEAR", vsBtcPct: 8.4 },
  { symbol: "AVAX", name: "AVAX", vsBtcPct: 6.1 },
  { symbol: "XRP", name: "XRP", vsBtcPct: 5.2 },
] as const;

/** An active spot LONG signal, as the Trade Feed shows one. Levels are invented. */
export const DEMO_SIGNAL = { pair: "SOL/USDT", timeframe: "4H", entryLow: 148.0, entryHigh: 150.5, stop: 141.2, tp1: 158, tp2: 166, tp3: 175 } as const;

/** AI Analyzer preview. Structure, volume, higher timeframe and target room are the checks that decide a verdict. */
export const DEMO_ANALYZER = { pair: "BTC/USDT", timeframe: "4H", checks: ["structure", "volume", "htf", "room"] as const } as const;

/** Same demo portfolio the Investor phone uses, shown in USDT: 433,840 MRU / 40 = 10,846 USDT, ROI +6.75%. */
export const DEMO_PORTFOLIO = { valueUsdt: 10846, roiPct: 6.75 } as const;

export const fmtUsd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const fmtPct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
