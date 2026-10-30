"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { miT } from "@/lib/marketIntelI18n";
import { GROUP_STYLE } from "@/lib/marketGroups";
import type { AssetCategory } from "@/lib/marketIntelAssets";
import type { RankedAsset } from "@/lib/marketIntelCompute";
import type { PublishedTrade } from "@/lib/tradeFeed";
import { lessons, SECTION_LABELS, SECTION_ORDER } from "@/lib/academy-content";
import type { HomeMarket } from "@/lib/useHomeData";
import { ChangePill, CoinLogo } from "@/components/market/MarketBits";
import { IconRadar, IconMarketIntel, IconAnalyzer, IconTradeFeed, IconAcademy } from "@/components/icons";
import { topOutperformers } from "@/components/home/HeroBoard";

function Tile({
  icon, title, body, href, live = true, className = "", children, delay = 0,
}: {
  icon: React.ReactNode; title: string; body: string; href: string; live?: boolean; className?: string; children: React.ReactNode; delay?: number;
}) {
  const { t } = useLanguage();
  return (
    <Link
      href={href}
      className={`home-tile home-rise group flex flex-col rounded-2xl border border-line bg-surface overflow-hidden ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="p-6 pb-4">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl border border-line flex items-center justify-center text-gold bg-gold/5">{icon}</span>
            <span className="font-heading text-xl font-bold tracking-tight">{title}</span>
          </span>
          {live && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-bull">
              <span className="w-1.5 h-1.5 rounded-full bg-bull animate-pulse" />
              {t("homeV2.products.livePreview")}
            </span>
          )}
        </div>
        <p className="mt-3 text-base text-text-muted leading-relaxed max-w-md">{body}</p>
      </div>
      <div className="flex-1 px-6 pb-2">{children}</div>
      <div className="px-6 py-4 mt-2 border-t border-line text-base font-medium text-text-muted group-hover:text-gold transition-colors flex items-center gap-1.5">
        {t("homeV2.products.open")} {title} <span aria-hidden className="rtl:rotate-180">{"→"}</span>
      </div>
    </Link>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="py-6 text-sm text-text-muted">{text}</div>;
}

export default function ProductShowcase({
  market, assets, assetsFailed, trades,
}: {
  market: HomeMarket; assets: RankedAsset[] | null; assetsFailed: boolean; trades: PublishedTrade[] | null;
}) {
  const { t, lang } = useLanguage();
  const radar = topOutperformers(market.rows, 4);
  const topAssets = assets ? assets.slice(0, 4) : null;
  const short = (c: string) => miT(lang, `category.${c}Short`);
  const readyLessons = lessons.filter((l) => l.ready);

  return (
    <div className="grid lg:grid-cols-6 gap-4">
      {/* RADAR */}
      <Tile className="lg:col-span-3" delay={0} href="/radar" icon={<IconRadar className="w-5 h-5" />} title={t("nav.radar")} body={t("homeV2.products.radarBody")}>
        {radar === null ? (
          <Empty text={market.failed ? t("homeV2.hero.noData") : t("radar.loading")} />
        ) : radar.length === 0 ? (
          <Empty text={t("radar.shortlistEmpty")} />
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {radar.map((r) => {
              const base = r.ticker.symbol.replace("USDT", "");
              return (
                <li key={r.ticker.symbol} className="flex items-center justify-between gap-3 py-3">
                  <span className="flex items-center gap-3 min-w-0">
                    <CoinLogo base={base} size={32} />
                    <span className="min-w-0">
                      <span className="block font-data font-semibold text-base leading-tight">{base}<span className="text-text-muted text-sm">/USDT</span></span>
                      <span className="block text-sm text-text-muted leading-tight">{t(`radar.setup.${r.setup}`)}</span>
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span dir="ltr" className="hidden sm:inline font-data text-sm text-gold">+{r.vsBtcPct.toFixed(2)}pp</span>
                    <ChangePill value={r.change} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Tile>

      {/* MARKET INTELLIGENCE */}
      <Tile className="lg:col-span-3" delay={80} href="/market-intelligence" icon={<IconMarketIntel className="w-5 h-5" />} title={t("nav.marketIntel")} body={t("homeV2.products.intelBody")}>
        {topAssets === null ? (
          <Empty text={assetsFailed ? t("homeV2.intel.unavailable") : t("marketOverview.loading")} />
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {topAssets.map((a) => (
              <li key={a.symbol} className="flex items-center justify-between gap-3 py-3">
                <span className="flex items-center gap-3 min-w-0">
                  <CoinLogo base={a.symbol} size={32} />
                  <span className="min-w-0">
                    <span className="block font-data font-semibold text-base leading-tight">{a.symbol}</span>
                    <span className="flex flex-wrap gap-1.5 mt-1">
                      {a.categories.map((c) => (
                        <span key={c} className="grp-chip" style={{ "--c": GROUP_STYLE[c as AssetCategory].color } as React.CSSProperties}>{short(c)}</span>
                      ))}
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-2"><span className="text-xs text-text-muted">{t("homeV2.intel.perf7d")}</span><ChangePill value={a.perf7dPct} digits={1} /></span>
              </li>
            ))}
          </ul>
        )}
      </Tile>

      {/* ANALYZER: shows the sections of a real report; no numbers are shown because none are invented */}
      <Tile className="lg:col-span-2" delay={160} live={false} href="/analyzer" icon={<IconAnalyzer className="w-5 h-5" />} title={t("nav.analyzer")} body={t("homeV2.products.analyzerBody")}>
        <div className="rounded-xl border border-line bg-bg/40 p-4">
          <ul className="space-y-3">
            {(["marketStructure", "keyLevels", "currentCondition", "invalidationShort", "whatToWatch"] as const).map((k, i) => (
              <li key={k} className="flex items-center gap-3">
                <span className="font-data text-xs text-gold w-5">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-sm font-medium flex-1">{t(`analyzer.${k}`)}</span>
                <span className="h-1.5 rounded-full bg-line" style={{ width: `${44 - i * 6}%` }} />
              </li>
            ))}
          </ul>
          <div className="mt-4 pt-3 border-t border-line text-sm text-gold">{t("homeV2.products.analyzerHint")}</div>
        </div>
      </Tile>

      {/* TRADE FEED */}
      <Tile className="lg:col-span-2" delay={240} live={false} href="/trade-feed" icon={<IconTradeFeed className="w-5 h-5" />} title={t("nav.tradeFeed")} body={t("homeV2.products.feedBody")}>
        {trades === null ? (
          <Empty text={t("marketOverview.loading")} />
        ) : trades.length === 0 ? (
          <Empty text={t("homeV2.products.noTrades")} />
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {trades.map((tr) => (
              <li key={tr.id} className="py-3 flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block font-data font-semibold text-base leading-tight" dir="ltr">{tr.pair}</span>
                  <span className="block text-sm text-text-muted leading-tight truncate">{t("tradePlan.entry")}: <span className="font-data text-text" dir="ltr">{tr.entryZone}</span></span>
                </span>
                <span className={`tag ${tr.direction === "Long" ? "tag-bull" : "tag-bear"}`}>{tr.direction === "Long" ? t("risk.long") : t("risk.short")}</span>
              </li>
            ))}
          </ul>
        )}
      </Tile>

      {/* ACADEMY */}
      <Tile className="lg:col-span-2" delay={320} live={false} href="/academy" icon={<IconAcademy className="w-5 h-5" />} title={t("nav.academy")} body={t("homeV2.products.academyBody")}>
        <ul className="divide-y divide-line border-y border-line">
          {SECTION_ORDER.map((s) => (
            <li key={s} className="py-3 flex items-center justify-between gap-3">
              <span className="text-base">{SECTION_LABELS[s][lang]}</span>
              <span className="font-data text-sm text-text-muted">{t("homeV2.products.lessons").replace("{n}", String(readyLessons.filter((l) => l.section === s).length))}</span>
            </li>
          ))}
        </ul>
      </Tile>
    </div>
  );
}
