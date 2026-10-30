"use client";

import { useLanguage } from "@/lib/i18n";
import { formatCompact, formatPrice } from "@/lib/binance";
import type { HomeMarket, MarketOverviewData } from "@/lib/useHomeData";
import { ChangePill, CoinLogo } from "@/components/market/MarketBits";
import { fgLabel } from "@/components/home/HeroBoard";

function Cell({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`px-5 py-5 sm:px-6 sm:py-6 ${className}`}>
      <div className="text-label">{label}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Unavailable({ text }: { text: string }) {
  return <span className="text-sm text-text-muted">{text}</span>;
}

/** Bybit-style market bar: coins on top, metrics below. Every figure is real or absent. */
export default function MarketStrip({
  market, overview, overviewFailed, overviewLoading,
}: {
  market: HomeMarket; overview: MarketOverviewData | null; overviewFailed: boolean; overviewLoading: boolean;
}) {
  const { t, lang } = useLanguage();
  const gm = overview?.globalMetrics?.status === "ok" ? overview.globalMetrics.data : null;
  const fg = overview?.fearGreed?.status === "ok" ? overview.fearGreed.data : null;
  const alt = overview?.altcoinSeason?.status === "ok" ? overview.altcoinSeason.data : null;
  const na = overviewLoading ? t("marketOverview.loading") : t("marketOverview.unavailable");
  const pct = (n: number) => `${Math.max(0, Math.min(100, n)).toFixed(1)}`;

  const coin = (s: "BTCUSDT" | "ETHUSDT") => {
    const tk = market.tickers[s];
    const base = s.replace("USDT", "");
    const ch = tk ? parseFloat(tk.priceChangePercent) : null;
    return (
      <div className="flex flex-col items-start sm:flex-row sm:items-center gap-2 sm:gap-3">
        <CoinLogo base={base} size={34} />
        <div className="min-w-0">
          <div className="font-data text-xl sm:text-2xl font-bold tracking-tight leading-none" dir="ltr">{tk ? `$${formatPrice(tk.lastPrice)}` : "—"}</div>
          <div className="mt-1.5">{ch !== null && Number.isFinite(ch) ? <ChangePill value={ch} /> : <Unavailable text={market.loaded ? t("marketOverview.unavailable") : t("marketOverview.loading")} />}</div>
        </div>
      </div>
    );
  };

  const btcDom = gm ? gm.btcDominance : null;
  const ethDom = gm ? gm.ethDominance : null;
  const otherDom = btcDom !== null && ethDom !== null ? Math.max(0, 100 - btcDom - ethDom) : null;

  return (
    <div>
      <div className="panel overflow-hidden">
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-line [&>*]:border-line">
          <Cell label="Bitcoin" className="border-b lg:border-b-0 border-e">{coin("BTCUSDT")}</Cell>
          <Cell label="Ethereum" className="border-b lg:border-b-0 lg:border-e">{coin("ETHUSDT")}</Cell>
          <Cell label={t("homeV2.market.cap")} className="border-b lg:border-b-0 border-e">
            {gm ? (
              <>
                <div className="font-data text-xl sm:text-2xl font-bold tracking-tight leading-none" dir="ltr">${formatCompact(gm.totalMarketCapUsd)}</div>
                <div className="mt-1.5 flex items-center gap-2">
                  {gm.totalMarketCapChange24hPct !== null && gm.totalMarketCapChange24hPct !== undefined ? <ChangePill value={gm.totalMarketCapChange24hPct} /> : null}
                  <span className="text-sm text-text-muted">{t("homeV2.market.change24h")}</span>
                </div>
              </>
            ) : <Unavailable text={na} />}
          </Cell>
          <Cell label={t("homeV2.market.volume")} className="border-b lg:border-b-0">
            {gm ? <div className="font-data text-xl sm:text-2xl font-bold tracking-tight leading-none" dir="ltr">${formatCompact(gm.totalVolume24hUsd)}</div> : <Unavailable text={na} />}
          </Cell>
        </div>

        <div className="grid lg:grid-cols-3 border-t border-line divide-y lg:divide-y-0 lg:divide-x rtl:lg:divide-x-reverse divide-line">
          <Cell label={t("marketOverview.fgTitle")}>
            {fg ? (
              <>
                <div className="flex items-baseline gap-2.5">
                  <span className="font-data text-3xl font-bold leading-none">{Math.round(fg.value)}</span>
                  <span className="text-base font-medium text-gold">{fgLabel(fg.classification ?? undefined, t)}</span>
                </div>
                <div className="mt-4 relative h-2 rounded-full overflow-hidden" dir="ltr" style={{ background: "linear-gradient(90deg, var(--bear), var(--gold) 50%, var(--bull))" }}>
                  <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-text border-2 border-bg" style={{ left: `${Math.max(2, Math.min(98, fg.value))}%` }} />
                </div>
                <div className="mt-1.5 flex justify-between text-xs text-text-muted" dir="ltr"><span>0</span><span>100</span></div>
              </>
            ) : <Unavailable text={na} />}
          </Cell>
          <Cell label={t("homeV2.market.btcDom")}>
            {btcDom !== null && ethDom !== null && otherDom !== null ? (
              <>
                <div className="flex items-baseline gap-4 flex-wrap">
                  <span className="font-data text-3xl font-bold leading-none" dir="ltr">{btcDom.toFixed(1)}%</span>
                  <span className="text-sm text-text-muted">{t("homeV2.market.ethDom")} <span className="font-data text-text" dir="ltr">{ethDom.toFixed(1)}%</span></span>
                </div>
                <div className="mt-4 flex h-2 rounded-full overflow-hidden bg-line home-grow" dir="ltr" role="img" aria-label={`BTC ${pct(btcDom)}%, ETH ${pct(ethDom)}%`}>
                  <span style={{ width: `${pct(btcDom)}%`, background: "#F7931A" }} />
                  <span style={{ width: `${pct(ethDom)}%`, background: "#627EEA" }} />
                  <span style={{ width: `${pct(otherDom)}%`, background: "var(--text-muted)", opacity: 0.45 }} />
                </div>
                <div className="mt-1.5 flex gap-4 text-xs text-text-muted" dir="ltr"><span>BTC</span><span>ETH</span><span>{t("homeV2.market.others")} {otherDom.toFixed(1)}%</span></div>
              </>
            ) : <Unavailable text={na} />}
          </Cell>
          <Cell label={t("marketOverview.altTitle")}>
            {alt ? (
              <>
                <div className="flex items-baseline gap-2.5">
                  <span className="font-data text-3xl font-bold leading-none">{Math.round(alt.value)}</span>
                  <span className="text-sm text-text-muted">/ 100</span>
                  <span className="text-base font-medium text-gold">{alt.apiClassification || t(`marketOverview.${alt.derivedPhase === "altSeason" ? "altSeason" : alt.derivedPhase === "btcSeason" ? "btcSeason" : "altMixed"}`)}</span>
                </div>
                <div className="mt-4 h-2 rounded-full bg-line overflow-hidden" dir="ltr"><div className="h-full bg-gold rounded-full home-grow" style={{ width: `${Math.max(2, Math.min(100, alt.value))}%` }} /></div>
                <div className="mt-1.5 flex justify-between text-xs text-text-muted" dir="ltr"><span>BTC</span><span>ALT</span></div>
              </>
            ) : <Unavailable text={na} />}
          </Cell>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-text-muted">
        <span>{overviewFailed ? t("marketOverview.unavailable") : t("marketOverview.source")}</span>
        {overview?.generatedAt && (
          <span>
            {overview.stale && `${t("marketOverview.stale")} · `}
            {t("marketOverview.lastUpdated")}: {new Date(overview.generatedAt).toLocaleTimeString(lang === "ar" ? "ar" : lang === "fr" ? "fr-FR" : "en-US")}
          </span>
        )}
      </div>
    </div>
  );
}
