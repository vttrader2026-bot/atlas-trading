import { Ticker24h } from "@/lib/binance";

export type RadarTag =
  | "breakout"
  | "pullback"
  | "highVolume"
  | "nearHigh"
  | "nearLow"
  | "outperformBtc"
  | "underperformBtc";

export type MarketCondition = "bullish" | "bearish" | "range";
export type Setup =
  | "breakout"
  | "pullback"
  | "breakoutWatch"
  | "atSupport"
  | "relativeStrength"
  | "relativeWeakness"
  | "watching";

export type RadarRow = {
  ticker: Ticker24h;
  change: number;
  volume: number;
  distFromHighPct: number; // how far below the 24h high, in %
  distFromLowPct: number; // how far above the 24h low, in %
  vsBtcPct: number; // this pair's 24h change minus BTC's 24h change, in pp
  tags: RadarTag[];
  condition: MarketCondition;
  setup: Setup;
};

// Thresholds are deliberately simple and disclosed in the UI — this is a
// transparent screen, not a black-box "score".
const BREAKOUT_NEAR_HIGH_PCT = 1; // within 1% of the 24h high
const PULLBACK_MIN_CHANGE_PCT = 3; // up at least 3% over 24h...
const PULLBACK_MIN_DIP_FROM_HIGH_PCT = 3; // ...but at least 3% off that high
const NEAR_LOW_PCT = 1; // within 1% of the 24h low
const VS_BTC_THRESHOLD_PP = 2; // at least 2 percentage points apart from BTC
const HIGH_VOLUME_TOP_N = 40; // top 40 pairs by quote volume get the tag
const RANGE_MAX_CHANGE_PCT = 1; // within ±1% counts as "Range" rather than trending

// USD/EUR-pegged stablecoins never make for a meaningful "worth watching"
// screen — excluded from Radar entirely, not just the shortlist.
const STABLECOIN_BASES = new Set([
  "USDC",
  "BUSD",
  "TUSD",
  "DAI",
  "FDUSD",
  "USDP",
  "PYUSD",
  "GUSD",
  "USTC",
  "EURI",
  "AEUR",
  "FRAX",
  "USD1",
]);

function isStablecoinPair(symbol: string): boolean {
  const base = symbol.replace(/USDT$/, "");
  return STABLECOIN_BASES.has(base);
}

export function buildRadarRows(tickers: Ticker24h[], btcChangePct: number): RadarRow[] {
  const realTickers = tickers.filter((t) => !isStablecoinPair(t.symbol));

  const withVolume = realTickers
    .map((t) => ({ t, volume: parseFloat(t.quoteVolume) }))
    .sort((a, b) => b.volume - a.volume);

  const highVolumeSymbols = new Set(
    withVolume.slice(0, HIGH_VOLUME_TOP_N).map((x) => x.t.symbol)
  );

  return realTickers.map((ticker) => {
    const change = parseFloat(ticker.priceChangePercent);
    const last = parseFloat(ticker.lastPrice);
    const high = parseFloat(ticker.highPrice);
    const low = parseFloat(ticker.lowPrice);
    const volume = parseFloat(ticker.quoteVolume);

    const distFromHighPct = high > 0 ? ((high - last) / high) * 100 : 0;
    const distFromLowPct = low > 0 ? ((last - low) / low) * 100 : 0;
    const vsBtcPct = change - btcChangePct;

    const tags: RadarTag[] = [];
    if (distFromHighPct <= BREAKOUT_NEAR_HIGH_PCT && change > 0) tags.push("breakout");
    if (change >= PULLBACK_MIN_CHANGE_PCT && distFromHighPct >= PULLBACK_MIN_DIP_FROM_HIGH_PCT)
      tags.push("pullback");
    if (highVolumeSymbols.has(ticker.symbol)) tags.push("highVolume");
    if (distFromHighPct <= BREAKOUT_NEAR_HIGH_PCT) tags.push("nearHigh");
    if (distFromLowPct <= NEAR_LOW_PCT) tags.push("nearLow");
    if (vsBtcPct >= VS_BTC_THRESHOLD_PP) tags.push("outperformBtc");
    if (vsBtcPct <= -VS_BTC_THRESHOLD_PP) tags.push("underperformBtc");

    // Single-word market condition, matching the brief's table format.
    const condition: MarketCondition =
      Math.abs(change) <= RANGE_MAX_CHANGE_PCT ? "range" : change > 0 ? "bullish" : "bearish";

    // Single setup label, priority-ordered by how actionable it is.
    let setup: Setup = "watching";
    if (tags.includes("breakout")) setup = "breakout";
    else if (tags.includes("pullback")) setup = "pullback";
    else if (tags.includes("nearHigh")) setup = "breakoutWatch";
    else if (tags.includes("nearLow")) setup = "atSupport";
    else if (tags.includes("outperformBtc")) setup = "relativeStrength";
    else if (tags.includes("underperformBtc")) setup = "relativeWeakness";

    return {
      ticker,
      change,
      volume,
      distFromHighPct,
      distFromLowPct,
      vsBtcPct,
      tags,
      condition,
      setup,
    };
  });
}
