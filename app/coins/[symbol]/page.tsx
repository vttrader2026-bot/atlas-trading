import type { Metadata } from "next";
import { getCandles, tryValidatePair, MarketDataError } from "@/lib/marketData";
import CoinProfileView from "@/components/coins/CoinProfileView";

const DEFAULT_INTERVAL = "1h" as const;
const DEFAULT_LIMIT = 300;

type Props = { params: Promise<{ symbol: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  const base = symbol.toUpperCase();
  return {
    title: `${base}/USDT — Atlas Coin Explorer`,
    description: `Live Binance Spot price, candlestick chart, and volume for ${base}/USDT on Atlas Trading.`,
  };
}

export default async function CoinProfilePage({ params }: Props) {
  const { symbol } = await params;
  const baseAsset = symbol.toUpperCase();

  // Validate up front, server-side, against live Binance Spot exchange info
  // — never assume the URL's symbol is a real, tradable pair. An unsupported
  // asset gets an honest "not available" view, not a silent substitution.
  const pair = await tryValidatePair(baseAsset, "USDT");
  if (!pair) {
    return <CoinProfileView status="unsupported" baseAsset={baseAsset} />;
  }

  // No JSX is constructed inside the try/catch itself (a try/catch around
  // JSX doesn't actually catch render errors in React) — only the data
  // fetch runs here; the result is rendered once, after it.
  type Loaded =
    | { ok: true; candles: Awaited<ReturnType<typeof getCandles>>["candles"]; stale: boolean }
    | { ok: false; code: string };

  let result: Loaded;
  try {
    const { candles, stale } = await getCandles(baseAsset, DEFAULT_INTERVAL, { limit: DEFAULT_LIMIT });
    result = { ok: true, candles, stale };
  } catch (err) {
    console.error(`/coins/${baseAsset} initial candle fetch failed`, err);
    result = { ok: false, code: err instanceof MarketDataError ? err.code : "UNKNOWN_ERROR" };
  }

  if (!result.ok) {
    return <CoinProfileView status="unavailable" baseAsset={baseAsset} pair={pair} errorCode={result.code} />;
  }
  return (
    <CoinProfileView
      status="ok"
      baseAsset={baseAsset}
      pair={pair}
      initialInterval={DEFAULT_INTERVAL}
      initialCandles={result.candles}
      initialStale={result.stale}
    />
  );
}
