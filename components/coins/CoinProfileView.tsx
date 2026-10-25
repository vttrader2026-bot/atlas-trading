"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { formatPrice, formatCompact } from "@/lib/binance";
import { useLiveTickers } from "@/lib/useLiveTickers";
import { SUPPORTED_INTERVALS, type Candle, type CanonicalPair, type Interval } from "@/lib/marketDataTypes";
import CoinChart from "@/components/coins/CoinChart";

type Props =
  | { status: "signedOut"; baseAsset: string }
  | { status: "unsupported"; baseAsset: string }
  | {
      status: "unavailable";
      baseAsset: string;
      pair: CanonicalPair;
      errorCode?: string;
    }
  | {
      status: "ok";
      baseAsset: string;
      pair: CanonicalPair;
      initialInterval: Interval;
      initialCandles: Candle[];
      initialStale: boolean;
    };

type KlinesResponse = { pair: CanonicalPair; interval: Interval; candles: Candle[]; stale: boolean };

export default function CoinProfileView(props: Props) {
  const { t } = useLanguage();
  const tickers = useLiveTickers();

  if (props.status === "signedOut") {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="rounded-2xl border border-line bg-surface p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="font-medium">{t("coins.authGate.title")}</div>
            <p className="text-sm text-text-muted leading-relaxed mt-1 max-w-md">{t("coins.authGate.body")}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/sign-in"
              className="px-3 py-1.5 rounded-md border border-line text-sm text-text-muted hover:text-text hover:border-text-muted transition-colors whitespace-nowrap"
            >
              {t("coins.authGate.signIn")}
            </Link>
            <Link href="/sign-up" className="btn-primary whitespace-nowrap">
              {t("coins.authGate.signUp")}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (props.status === "unsupported") {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h1 className="text-2xl font-bold">{props.baseAsset}</h1>
        <p className="mt-3 text-text-muted">{t("coinProfile.unsupported")}</p>
        <Link href="/coins" className="mt-6 inline-block btn-secondary">
          {t("coinProfile.backToCoins")}
        </Link>
      </main>
    );
  }

  if (props.status === "unavailable") {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h1 className="text-2xl font-bold">
          {props.baseAsset}/{props.pair.quoteAsset}
        </h1>
        <p className="mt-3 text-text-muted">{t("coinProfile.unavailable")}</p>
        <Link href="/coins" className="mt-6 inline-block btn-secondary">
          {t("coinProfile.backToCoins")}
        </Link>
      </main>
    );
  }

  return (
    <CoinProfileLoaded
      baseAsset={props.baseAsset}
      pair={props.pair}
      initialInterval={props.initialInterval}
      initialCandles={props.initialCandles}
      initialStale={props.initialStale}
      ticker={tickers[props.pair.symbol]}
    />
  );
}

function CoinProfileLoaded({
  baseAsset,
  pair,
  initialInterval,
  initialCandles,
  initialStale,
  ticker,
}: {
  baseAsset: string;
  pair: CanonicalPair;
  initialInterval: Interval;
  initialCandles: Candle[];
  initialStale: boolean;
  ticker: ReturnType<typeof useLiveTickers>[string] | undefined;
}) {
  const { t } = useLanguage();
  const [interval, setInterval] = useState<Interval>(initialInterval);
  const [candles, setCandles] = useState<Candle[]>(initialCandles);
  const [stale, setStale] = useState(initialStale);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (interval === initialInterval) return; // already have this one from the server
    let cancelled = false;

    async function load() {
      // Deferring past the synchronous effect body (rather than calling
      // setLoading/setError directly here) avoids a same-tick cascading
      // render, matching the pattern already used by app/ticker/page.tsx's
      // data-loading effect elsewhere in this codebase.
      await Promise.resolve();
      if (cancelled) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/coins/klines?symbol=${baseAsset}&interval=${interval}&limit=300`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "request_failed");
        const data = (await res.json()) as KlinesResponse;
        if (cancelled) return;
        setCandles(data.candles);
        setStale(data.stale);
      } catch {
        if (!cancelled) setError(t("coinProfile.candlesError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval, baseAsset]);

  const change = ticker ? parseFloat(ticker.priceChangePercent) : null;
  const positive = change !== null && change >= 0;

  return (
    <main className="max-w-6xl mx-auto px-6 py-10 sm:py-14">
      <Link href="/coins" className="text-sm text-text-muted hover:text-text transition-colors">
        ← {t("coinProfile.backToCoins")}
      </Link>

      <div className="mt-3 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight font-data">
            {pair.baseAsset}/{pair.quoteAsset}
          </h1>
          <div className="mt-1 flex items-center gap-3 font-data">
            <span className="text-xl">{ticker ? `$${formatPrice(ticker.lastPrice)}` : "—"}</span>
            {change !== null && (
              <span className={`text-sm ${positive ? "text-bull" : "text-bear"}`}>
                {positive ? "+" : ""}
                {change.toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-md border border-line p-1">
          {SUPPORTED_INTERVALS.map((iv) => (
            <button
              key={iv}
              type="button"
              onClick={() => setInterval(iv)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                interval === iv ? "bg-gold/15 text-gold" : "text-text-muted hover:text-text"
              }`}
            >
              {iv}
            </button>
          ))}
        </div>
      </div>

      {ticker && (
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-text-muted font-data">
          <span>
            {t("coinProfile.high24h")}: ${formatPrice(ticker.highPrice)}
          </span>
          <span>
            {t("coinProfile.low24h")}: ${formatPrice(ticker.lowPrice)}
          </span>
          <span>
            {t("coinProfile.volume24h")}: ${formatCompact(ticker.quoteVolume)}
          </span>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-bear">{error}</p>}
      {!error && stale && <p className="mt-4 text-sm text-gold">{t("coinProfile.staleWarning")}</p>}

      <div className="mt-6 card p-2 relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/60 rounded-xl text-sm text-text-muted">
            {t("coinProfile.loadingChart")}
          </div>
        )}
        <CoinChart
          symbol={pair.symbol}
          interval={interval}
          initialCandles={candles}
          statusLabels={{
            connecting: t("coinProfile.streamConnecting"),
            live: t("coinProfile.streamLive"),
            reconnecting: t("coinProfile.streamReconnecting"),
            offline: t("coinProfile.streamOffline"),
          }}
        />
      </div>
      <p className="mt-2 text-xs text-text-muted">{t("coinProfile.disclaimer")}</p>
    </main>
  );
}
