import { Ticker24h } from "@/lib/binance";

export type RadarTag =
  | "breakout"
  | "pullback"
  | "highVolume"
  | "nearHigh"
  | "nearLow"
  | "outperformBtc"
  | "underperformBtc";

export type RadarRow = {
  ticker: Ticker24h;
  change: number;
  volume: number;
  distFromHighPct: number; // how far below the 24h high, in %
  distFromLowPct: number; // how far above the 24h low, in %
  vsBtcPct: number; // this pair's 24h change minus BTC's 24h change, in pp
  tags: RadarTag[];
};

// Thresholds are deliberately simple and disclosed in the UI — this is a
// transparent screen, not a black-box "score".
const BREAKOUT_NEAR_HIGH_PCT = 1; // within 1% of the 24h high
const PULLBACK_MIN_CHANGE_PCT = 3; // up at least 3% over 24h...
const PULLBACK_MIN_DIP_FROM_HIGH_PCT = 3; // ...but at least 3% off that high
const NEAR_LOW_PCT = 1; // within 1% of the 24h low
const VS_BTC_THRESHOLD_PP = 2; // at least 2 percentage points apart from BTC
const HIGH_VOLUME_TOP_N = 40; // top 40 pairs by quote volume get the tag

export function buildRadarRows(tickers: Ticker24h[], btcChangePct: number): RadarRow[] {
  const withVolume = tickers
    .map((t) => ({ t, volume: parseFloat(t.quoteVolume) }))
    .sort((a, b) => b.volume - a.volume);

  const highVolumeSymbols = new Set(
    withVolume.slice(0, HIGH_VOLUME_TOP_N).map((x) => x.t.symbol)
  );

  return tickers.map((ticker) => {
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

    return { ticker, change, volume, distFromHighPct, distFromLowPct, vsBtcPct, tags };
  });
}
