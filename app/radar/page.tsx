"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatPrice, formatCompact } from "@/lib/binance";
import { useLiveTickers } from "@/lib/useLiveTickers";
import { buildRadarRows, RadarRow, RadarTag, MarketCondition } from "@/lib/radar";
import { useLanguage } from "@/lib/i18n";
import AnalysisPanel from "@/components/charts/AnalysisPanel";

const FILTERS: { key: RadarTag | "all"; labelKey: string }[] = [
  { key: "all", labelKey: "radar.filterAll" },
  { key: "breakout", labelKey: "radar.filterBreakout" },
  { key: "pullback", labelKey: "radar.filterPullback" },
  { key: "nearLow", labelKey: "radar.filterAtSupport" },
  { key: "outperformBtc", labelKey: "radar.filterRelativeStrength" },
  { key: "underperformBtc", labelKey: "radar.filterRelativeWeakness" },
];

// Only filters with a genuinely matching Academy lesson get an info icon —
// no icon is better than a forced, misleading link.
const FILTER_LESSON_SLUGS: Partial<Record<RadarTag, string>> = {
  breakout: "breakout-retest",
  outperformBtc: "relative-strength-btc",
};

const SHORTLIST_SIZE = 8;

export default function RadarPage() {
  const { t } = useLanguage();
  const tickers = useLiveTickers();
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<RadarTag | "all">("all");
  const [chartSymbol, setChartSymbol] = useState<string | null>(null);

  // The live WebSocket feed (lib/binanceStream) bootstraps itself via REST
  // and keeps reconnecting on its own, so the only failure mode worth
  // surfacing here is "still nothing after a while" (e.g. the stream is
  // blocked by the network).
  useEffect(() => {
    if (Object.keys(tickers).length > 0) {
      setError(false);
      return;
    }
    const timer = setTimeout(() => setError(true), 15000);
    return () => clearTimeout(timer);
  }, [tickers]);

  const rows = useMemo<RadarRow[] | null>(() => {
    const list = Object.values(tickers);
    if (list.length === 0) return null;
    const btc = tickers["BTCUSDT"];
    const btcChange = btc ? parseFloat(btc.priceChangePercent) : 0;
    return buildRadarRows(list, btcChange);
  }, [tickers]);

  const shortlist = useMemo(() => {
    if (!rows) return [];
    return [...rows]
      .filter((r) => r.tags.includes("outperformBtc") && r.tags.includes("highVolume"))
      .sort((a, b) => b.vsBtcPct - a.vsBtcPct)
      .slice(0, SHORTLIST_SIZE);
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const list = filter === "all" ? rows : rows.filter((r) => r.tags.includes(filter));
    return [...list].sort((a, b) => b.volume - a.volume).slice(0, 60);
  }, [rows, filter]);

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 sm:py-14">
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">{t("radar.title")}</h1>
      <p className="text-text-muted text-sm mt-1 max-w-2xl leading-relaxed">
        {t("radar.subtitle")}
      </p>

      {!error && !rows && <p className="mt-8 text-sm text-text-muted">{t("radar.loading")}</p>}
      {error && <p className="mt-6 text-sm text-bear">{t("radar.error")}</p>}

      {rows && (
        <>
          <div className="mt-8">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">
                {t("radar.shortlistTitle")}
              </h2>
              <span className="text-xs text-text-muted">{t("radar.shortlistNote")}</span>
            </div>

            {shortlist.length === 0 ? (
              <p className="mt-4 text-sm text-text-muted">{t("radar.shortlistEmpty")}</p>
            ) : (
              <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {shortlist.map((row) => (
                  <ShortlistCard key={row.ticker.symbol} row={row} t={t} onViewChart={setChartSymbol} />
                ))}
              </div>
            )}
          </div>

          <div className="mt-14 border-t border-line pt-10">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => {
                const lessonSlug = f.key !== "all" ? FILTER_LESSON_SLUGS[f.key] : undefined;
                return (
                  <div key={f.key} className="flex items-center gap-1">
                    <button
                      onClick={() => setFilter(f.key)}
                      className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                        filter === f.key
                          ? "border-gold text-gold bg-gold/10"
                          : "border-line text-text-muted hover:text-text"
                      }`}
                    >
                      {t(f.labelKey)}
                    </button>
                    {lessonSlug && (
                      <Link
                        href={`/academy/${lessonSlug}`}
                        className="text-text-muted hover:text-gold transition-colors text-xs"
                        title={"تعلّم المزيد"}
                      >
                        {"ⓘ"}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 card overflow-hidden">
              {/* Desktop / tablet: compact terminal-style table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-surface-raised/40 text-text-muted">
                    <tr>
                      <th className="text-left px-4 py-3 font-normal text-[11px] uppercase tracking-wide">{t("radar.pair")}</th>
                      <th className="text-right px-4 py-3 font-normal text-[11px] uppercase tracking-wide">{t("radar.price")}</th>
                      <th className="text-right px-4 py-3 font-normal text-[11px] uppercase tracking-wide">{t("radar.change24h")}</th>
                      <th className="text-right px-4 py-3 font-normal text-[11px] uppercase tracking-wide">{t("radar.volume")}</th>
                      <th className="text-left px-4 py-3 font-normal text-[11px] uppercase tracking-wide">{t("radar.conditionHeader")}</th>
                      <th className="text-left px-4 py-3 font-normal text-[11px] uppercase tracking-wide">{t("radar.setupHeader")}</th>
                      <th className="px-3 py-3" aria-hidden="true" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={7} className="text-center py-10 text-text-muted">
                          {t("radar.empty")}
                        </td>
                      </tr>
                    )}
                    {filtered.map((row) => {
                      const positive = row.change >= 0;
                      const base = row.ticker.symbol.replace("USDT", "");
                      return (
                        <tr
                          key={row.ticker.symbol}
                          className="group border-t border-line hover:bg-surface-raised/40 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <button
                              onClick={() => setChartSymbol(base)}
                              title={t("radar.viewChart")}
                              className="flex items-center gap-2.5 group-hover:text-gold transition-colors text-left"
                            >
                              <RadarLogo base={base} />
                              <span className="font-data font-medium">{row.ticker.symbol.replace("USDT", "/USDT")}</span>
                            </button>
                          </td>
                          <td className="px-4 py-3 font-data text-right">
                            ${formatPrice(row.ticker.lastPrice)}
                          </td>
                          <td
                            className={`px-4 py-3 font-data text-right ${
                              positive ? "text-bull" : "text-bear"
                            }`}
                          >
                            {positive ? "+" : ""}
                            {row.change.toFixed(2)}%
                          </td>
                          <td className="px-4 py-3 font-data text-right text-text-muted">
                            ${formatCompact(row.volume)}
                          </td>
                          <td className="px-4 py-3">
                            <ConditionBadge condition={row.condition} label={t(`radar.condition.${row.condition}`)} />
                          </td>
                          <td className="px-4 py-3 text-text-muted">{t(`radar.setup.${row.setup}`)}</td>
                          <td className="px-3 py-3 text-right">
                            <Link
                              href={`/analyzer?pair=${encodeURIComponent(row.ticker.symbol.replace("USDT", "/USDT"))}`}
                              title={t("radar.analyze")}
                              className="inline-flex items-center gap-1 text-xs text-text-muted opacity-0 group-hover:opacity-100 hover:text-gold transition-all whitespace-nowrap"
                            >
                              {t("radar.analyze")}
                              <span aria-hidden="true">{"→"}</span>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile: compact stacked rows, no horizontal scroll */}
              <div className="sm:hidden divide-y divide-line">
                {filtered.length === 0 && (
                  <div className="text-center py-10 text-sm text-text-muted">{t("radar.empty")}</div>
                )}
                {filtered.map((row) => {
                  const positive = row.change >= 0;
                  const base = row.ticker.symbol.replace("USDT", "");
                  return (
                    <div
                      key={row.ticker.symbol}
                      className="flex items-center gap-3 px-4 py-3 active:bg-surface-raised/40 transition-colors"
                    >
                      <button
                        onClick={() => setChartSymbol(base)}
                        className="flex items-center gap-3 min-w-0 flex-1 text-left"
                      >
                        <RadarLogo base={base} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-data text-sm font-medium truncate">
                              {row.ticker.symbol.replace("USDT", "/USDT")}
                            </span>
                            <span className="font-data text-sm">${formatPrice(row.ticker.lastPrice)}</span>
                          </div>
                          <div className="mt-1 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <ConditionBadge condition={row.condition} label={t(`radar.condition.${row.condition}`)} />
                              <span className="text-[11px] text-text-muted truncate">{t(`radar.setup.${row.setup}`)}</span>
                            </div>
                            <span
                              className={`font-data text-xs shrink-0 ${positive ? "text-bull" : "text-bear"}`}
                            >
                              {positive ? "+" : ""}
                              {row.change.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      </button>
                      <Link
                        href={`/analyzer?pair=${encodeURIComponent(row.ticker.symbol.replace("USDT", "/USDT"))}`}
                        title={t("radar.analyze")}
                        className="shrink-0 px-2 py-1 rounded border border-line text-[11px] text-text-muted active:text-gold active:border-gold/40 transition-colors"
                      >
                        {t("radar.analyze")}
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      <p className="mt-6 text-xs text-text-muted leading-relaxed max-w-2xl">
        {t("radar.disclaimer")}
      </p>

      {chartSymbol && <AnalysisPanel baseAsset={chartSymbol} onClose={() => setChartSymbol(null)} />}
    </main>
  );
}

function ShortlistCard({
  row,
  t,
  onViewChart,
}: {
  row: RadarRow;
  t: (key: string) => string;
  onViewChart: (base: string) => void;
}) {
  const positive = row.change >= 0;
  const base = row.ticker.symbol.replace("USDT", "");
  return (
    <div className="card card-hover p-4">
      <button onClick={() => onViewChart(base)} className="block w-full text-left hover:text-gold transition-colors">
        <div className="flex items-center justify-between">
          <span className="font-data text-sm">{row.ticker.symbol.replace("USDT", "/USDT")}</span>
          <ConditionBadge condition={row.condition} label={t(`radar.condition.${row.condition}`)} />
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-data text-lg">${formatPrice(row.ticker.lastPrice)}</span>
          <span className={`font-data text-xs ${positive ? "text-bull" : "text-bear"}`}>
            {positive ? "+" : ""}
            {row.change.toFixed(2)}%
          </span>
        </div>
      </button>
      <div className="mt-2 text-xs text-gold font-data">
        +{row.vsBtcPct.toFixed(2)}pp {t("radar.vsBtc")}
      </div>
      <button onClick={() => onViewChart(base)} className="mt-3 block w-full text-center text-xs btn-primary">
        {t("radar.viewChart")}
      </button>
      <Link
        href={`/analyzer?pair=${encodeURIComponent(row.ticker.symbol.replace("USDT", "/USDT"))}`}
        className="mt-2 block text-center text-xs btn-secondary"
      >
        {t("radar.analyze")}
      </Link>
    </div>
  );
}

function ConditionBadge({ condition, label }: { condition: MarketCondition; label: string }) {
  const styles: Record<MarketCondition, string> = {
    bullish: "border-bull/40 text-bull",
    bearish: "border-bear/40 text-bear",
    range: "border-gold/40 text-gold",
  };
  return (
    <span className={`px-2 py-0.5 rounded border text-[11px] whitespace-nowrap ${styles[condition]}`}>
      {label}
    </span>
  );
}

function RadarLogo({ base }: { base: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  if (imgFailed) {
    return (
      <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-text-muted shrink-0 font-data bg-surface-raised border border-line">
        {base.slice(0, 3)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://assets.coincap.io/assets/icons/${base.toLowerCase()}@2x.png`}
      alt={base}
      className="w-7 h-7 rounded-full shrink-0 bg-white object-contain p-0.5"
      onError={() => setImgFailed(true)}
    />
  );
}
// RADAR-VIEWCHART-2205
