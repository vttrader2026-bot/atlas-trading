"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { formatPrice } from "@/lib/binance";
import type { HomeMarket, MarketOverviewData } from "@/lib/useHomeData";
import { ChangePill, CoinLogo } from "@/components/market/MarketBits";
import Sparkline from "@/components/home/Sparkline";

const EXCLUDED = new Set(["CREAMUSDT", "PNTUSDT", "KDAUSDT"]);

export function topOutperformers(rows: HomeMarket["rows"], n: number) {
  if (!rows) return null;
  return [...rows]
    .filter((r) => r.tags.includes("outperformBtc") && !EXCLUDED.has(r.ticker.symbol))
    .sort((a, b) => b.vsBtcPct - a.vsBtcPct)
    .slice(0, n);
}

/** The hero visual: a live BTC chart, ETH/SOL and the top Radar rows - all real. */
export default function HeroBoard({ market, overview }: { market: HomeMarket; overview: MarketOverviewData | null }) {
  const { t } = useLanguage();
  const btc = market.tickers["BTCUSDT"];
  const btcChange = btc ? parseFloat(btc.priceChangePercent) : null;
  const radar = topOutperformers(market.rows, 3);
  const fg = overview?.fearGreed?.status === "ok" ? overview.fearGreed.data : null;

  return (
    <div className="relative home-rise" style={{ animationDelay: "0.15s" }}>
      <div className="panel overflow-hidden shadow-[0_30px_80px_-30px_color-mix(in_srgb,var(--gold)_38%,transparent)]">
        <div className="flex items-center justify-between gap-3 px-5 h-12 border-b border-line">
          <span className="flex items-center gap-2.5 min-w-0">
            <CoinLogo base="BTC" size={26} />
            <span className="font-data font-semibold" dir="ltr">{t("homeV2.hero.chartTitle")}</span>
            <span className="text-sm text-text-muted truncate hidden sm:inline">{t("homeV2.hero.chartSub")}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-bull shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
            {t("homeV2.hero.live")}
          </span>
        </div>

        <div className="px-5 pt-5">
          <div className="flex items-end justify-between gap-3">
            <span className="font-data text-3xl sm:text-4xl font-bold tracking-tight" dir="ltr">
              {btc ? `$${formatPrice(btc.lastPrice)}` : "—"}
            </span>
            {btcChange !== null && Number.isFinite(btcChange) ? <ChangePill value={btcChange} /> : null}
          </div>
        </div>

        <div className="px-2 pb-1 pt-2 min-h-[120px]">
          {market.btcSeries ? (
            <Sparkline values={market.btcSeries} height={128} />
          ) : (
            <div className="h-[128px] flex items-center justify-center text-sm text-text-muted px-5 text-center">
              {market.loaded && market.failed ? t("homeV2.hero.noData") : ""}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 divide-x divide-line rtl:divide-x-reverse border-t border-line">
          {(["ETHUSDT", "SOLUSDT"] as const).map((s) => {
            const tk = market.tickers[s];
            const base = s.replace("USDT", "");
            const ch = tk ? parseFloat(tk.priceChangePercent) : null;
            return (
              <div key={s} className="px-4 sm:px-5 py-3.5 flex flex-col items-start sm:flex-row sm:items-center sm:justify-between gap-2">
                <span className="flex items-center gap-2.5 min-w-0">
                  <CoinLogo base={base} size={26} />
                  <span className="min-w-0">
                    <span className="block font-data font-semibold text-base leading-tight">{base}</span>
                    <span className="block font-data text-sm text-text-muted leading-tight" dir="ltr">{tk ? `$${formatPrice(tk.lastPrice)}` : "—"}</span>
                  </span>
                </span>
                {ch !== null && Number.isFinite(ch) ? <ChangePill value={ch} digits={1} /> : null}
              </div>
            );
          })}
        </div>

        <div className="border-t border-line">
          <div className="px-5 pt-3.5 pb-1 text-label">{t("homeV2.hero.radarTitle")}</div>
          {radar && radar.length > 0 ? (
            <ul>
              {radar.map((r) => {
                const base = r.ticker.symbol.replace("USDT", "");
                return (
                  <li key={r.ticker.symbol} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className="flex items-center gap-2.5 min-w-0">
                      <CoinLogo base={base} size={26} />
                      <span className="font-data font-semibold">{base}</span>
                      <span className="text-sm text-text-muted truncate">{t(`radar.setup.${r.setup}`)}</span>
                    </span>
                    <ChangePill value={r.change} digits={1} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-5 pb-4 pt-1 text-sm text-text-muted">{market.rows ? t("radar.shortlistEmpty") : ""}</div>
          )}
          <Link href="/radar" className="flex items-center justify-center gap-2 px-5 py-3 border-t border-line text-sm font-medium text-gold bg-gold/5 hover:bg-gold/10 transition-colors">
            {t("pulseSection.openRadar")} <span aria-hidden className="rtl:rotate-180">{"→"}</span>
          </Link>
        </div>
      </div>

      {fg && (
        <div className="hidden sm:flex absolute -bottom-14 start-6 items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 shadow-lg home-rise" style={{ animationDelay: "0.7s" }}>
          <span className="text-label">{t("homeV2.hero.sentiment")}</span>
          <span className="font-data text-xl font-bold">{Math.round(fg.value)}</span>
          <span className="text-sm text-gold font-medium">{fgLabel(fg.classification ?? undefined, t)}</span>
        </div>
      )}
    </div>
  );
}

const FG_KEYS: Record<string, string> = {
  "extreme fear": "fgExtremeFear", fear: "fgFear", neutral: "fgNeutral", greed: "fgGreed", "extreme greed": "fgExtremeGreed",
};
export function fgLabel(classification: string | undefined, t: (k: string) => string) {
  const k = classification ? FG_KEYS[classification.toLowerCase()] : null;
  return k ? t(`marketOverview.${k}`) : classification ?? "";
}
