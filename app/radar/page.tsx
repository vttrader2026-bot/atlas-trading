"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatPrice, formatCompact, getSpotTradingSymbols } from "@/lib/binance";
import { useLiveTickers } from "@/lib/useLiveTickers";
import { buildRadarRows, RadarRow, RadarTag, MarketCondition } from "@/lib/radar";
import { useLanguage } from "@/lib/i18n";
import AnalysisPanel from "@/components/charts/AnalysisPanel";
import { ChangePill, CoinLogo, RangeBar } from "@/components/market/MarketBits";
import StarButton from "@/components/watchlist/StarButton";
import { DEFAULT_SORT, SORT_KEYS, defaultDir, sortRows, type SortDir, type SortKey } from "@/lib/radarSort";

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

// Direction labels depend on the field: highest/lowest, nearest/farthest, A–Z.
function dirOptions(key: SortKey): { value: SortDir; labelKey: string }[] {
  if (key === "distHigh" || key === "distLow")
    return [
      { value: "asc", labelKey: "radar.dir.nearest" },
      { value: "desc", labelKey: "radar.dir.farthest" },
    ];
  if (key === "name")
    return [
      { value: "asc", labelKey: "radar.dir.az" },
      { value: "desc", labelKey: "radar.dir.za" },
    ];
  return [
    { value: "desc", labelKey: "radar.dir.highest" },
    { value: "asc", labelKey: "radar.dir.lowest" },
  ];
}

export default function RadarPage() {
  const { t } = useLanguage();
  const tickers = useLiveTickers();
  const [error, setError] = useState(false);
  // undefined = still loading, null = unavailable (fall back to built-in rules), Set = live spot list
  const [spot, setSpot] = useState<Set<string> | null | undefined>(undefined);
  const [filter, setFilter] = useState<RadarTag | "all">("all");
  const [chartSymbol, setChartSymbol] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT.key);
  const [sortDir, setSortDir] = useState<SortDir>(DEFAULT_SORT.dir);

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

  useEffect(() => {
    let cancelled = false;
    getSpotTradingSymbols().then((s) => {
      if (!cancelled) setSpot(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo<RadarRow[] | null>(() => {
    const list = Object.values(tickers);
    if (list.length === 0 || spot === undefined) return null;
    const btc = tickers["BTCUSDT"];
    const btcChange = btc ? parseFloat(btc.priceChangePercent) : 0;
    return buildRadarRows(list, btcChange, spot);
  }, [tickers, spot]);

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
    // Default (volume, highest first) is exactly the previous ordering.
    return sortRows(list, sortKey, sortDir).slice(0, 60);
  }, [rows, filter, sortKey, sortDir]);

  // Real counts per screen, derived from the same rows the filters use.
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    if (!rows) return out;
    out.all = rows.length;
    for (const f of FILTERS) {
      if (f.key !== "all") out[f.key] = rows.filter((r) => r.tags.includes(f.key as RadarTag)).length;
    }
    return out;
  }, [rows]);

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 sm:py-14">
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">{t("radar.title")}</h1>
      <p className="text-text-muted text-base mt-2 max-w-2xl leading-relaxed">
        {t("radar.subtitle")}
      </p>

      {!error && !rows && <p className="mt-8 text-base text-text-muted">{t("radar.loading")}</p>}
      {error && <p className="mt-6 text-base text-bear">{t("radar.error")}</p>}

      {rows && (
        <>
          <div className="mt-10">
            <div className="flex items-baseline justify-between gap-x-4 gap-y-1 flex-wrap">
              <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">
                {t("radar.shortlistTitle")}
              </h2>
              <span className="text-sm text-text-muted">{t("radar.shortlistNote")}</span>
            </div>

            {shortlist.length === 0 ? (
              <p className="mt-4 text-base text-text-muted">{t("radar.shortlistEmpty")}</p>
            ) : (
              <div className="mt-4 flex sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3 overflow-x-auto sm:overflow-visible snap-x snap-mandatory scrollbar-none -mx-6 px-6 sm:mx-0 sm:px-0 pb-1">
                {shortlist.map((row) => (
                  <ShortlistCard key={row.ticker.symbol} row={row} t={t} onViewChart={setChartSymbol} />
                ))}
              </div>
            )}
          </div>

          <div className="mt-14 border-t border-line pt-10">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => {
                const lessonSlug = f.key !== "all" ? FILTER_LESSON_SLUGS[f.key] : undefined;
                const active = filter === f.key;
                return (
                  <div key={f.key} className="flex items-center gap-1">
                    <button
                      onClick={() => setFilter(f.key)}
                      aria-pressed={active}
                      className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        active
                          ? "border-gold text-gold bg-gold/10"
                          : "border-line text-text-muted hover:text-text hover:border-text-muted"
                      }`}
                    >
                      {t(f.labelKey)}
                      <span
                        className={`font-data text-xs px-1.5 rounded ${
                          active ? "bg-gold/20 text-gold" : "bg-surface-raised text-text-muted"
                        }`}
                      >
                        {counts[f.key] ?? 0}
                      </span>
                    </button>
                    {lessonSlug && (
                      <Link
                        href={`/academy/${lessonSlug}`}
                        className="text-text-muted hover:text-gold transition-colors text-base px-1"
                        title={"تعلّم المزيد"}
                      >
                        {"ⓘ"}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="radar-sort-key">{t("radar.sortBy")}</label>
              <select
                id="radar-sort-key"
                value={sortKey}
                onChange={(e) => {
                  const k = e.target.value as SortKey;
                  setSortKey(k);
                  setSortDir(defaultDir(k));
                }}
                className="input !w-auto !py-2 !px-3 text-sm"
              >
                {SORT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {t("radar.sortBy")}: {t(`radar.sort.${k}`)}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="radar-sort-dir">{t("radar.sortDirection")}</label>
              <select
                id="radar-sort-dir"
                value={sortDir}
                onChange={(e) => setSortDir(e.target.value as SortDir)}
                className="input !w-auto !py-2 !px-3 text-sm"
              >
                {dirOptions(sortKey).map((o) => (
                  <option key={o.value} value={o.value}>
                    {t(o.labelKey)}
                  </option>
                ))}
              </select>
            </div>
            </div>

            <div className="mt-4 panel overflow-hidden">
              {/* Desktop / tablet: compact terminal-style table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full min-w-[720px]">
                  <thead className="bg-surface-raised/40">
                    <tr>
                      <th className="mkt-th text-start">{t("radar.pair")}</th>
                      <th className="mkt-th text-end">{t("radar.price")}</th>
                      <th className="mkt-th text-end">{t("radar.change24h")}</th>
                      <th className="mkt-th text-end">{t("radar.volume")}</th>
                      <th className="mkt-th !whitespace-normal text-start hidden xl:table-cell">{t("radar.range24h")}</th>
                      <th className="mkt-th !whitespace-normal text-start">{t("radar.conditionHeader")}</th>
                      <th className="mkt-th !whitespace-normal text-start">{t("radar.setupHeader")}</th>
                      <th className="mkt-th w-24" aria-hidden="true" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-base text-text-muted">
                          {t("radar.empty")}
                        </td>
                      </tr>
                    )}
                    {filtered.map((row) => {
                      const base = row.ticker.symbol.replace("USDT", "");
                      return (
                        <tr key={row.ticker.symbol} className="mkt-row group border-t border-line">
                          <td className="mkt-td">
                            <button
                              onClick={() => setChartSymbol(base)}
                              title={t("radar.viewChart")}
                              className="flex items-center gap-3 group-hover:text-gold transition-colors text-start"
                            >
                              <CoinLogo base={base} size={36} />
                              <span className="font-data">
                                <span className="font-semibold text-base">{base}</span>
                                <span className="text-text-muted text-sm">/USDT</span>
                              </span>
                            </button>
                          </td>
                          <td className="mkt-td font-data text-end text-base font-medium">
                            ${formatPrice(row.ticker.lastPrice)}
                          </td>
                          <td className="mkt-td text-end">
                            <ChangePill value={row.change} />
                          </td>
                          <td className="mkt-td font-data text-end text-text-muted">
                            ${formatCompact(row.volume)}
                          </td>
                          <td className="mkt-td hidden xl:table-cell">
                            <RangeBar
                              low={parseFloat(row.ticker.lowPrice)}
                              high={parseFloat(row.ticker.highPrice)}
                              last={parseFloat(row.ticker.lastPrice)}
                            />
                          </td>
                          <td className="mkt-td">
                            <ConditionBadge condition={row.condition} label={t(`radar.condition.${row.condition}`)} />
                          </td>
                          <td className="mkt-td text-text-muted text-sm whitespace-nowrap">{t(`radar.setup.${row.setup}`)}</td>
                          <td className="mkt-td ps-0 text-end whitespace-nowrap">
                            <StarButton symbol={row.ticker.symbol} />
                            <button
                              onClick={() => setChartSymbol(base)}
                              title={t("radar.viewChart")}
                              aria-label={`${t("radar.viewChart")} ${base}`}
                              className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-text-muted opacity-60 group-hover:opacity-100 hover:text-gold hover:bg-gold/10 transition-all"
                            >
                              <span aria-hidden="true" className="rtl:rotate-180">{"→"}</span>
                            </button>
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
                  <div className="text-center py-12 text-base text-text-muted">{t("radar.empty")}</div>
                )}
                {filtered.map((row) => {
                  const base = row.ticker.symbol.replace("USDT", "");
                  return (
                    <div key={row.ticker.symbol} className="flex items-stretch">
                    <button
                      onClick={() => setChartSymbol(base)}
                      className="flex items-center gap-3 ps-4 pe-2 py-3.5 flex-1 min-w-0 text-start active:bg-surface-raised/50 transition-colors"
                    >
                      <CoinLogo base={base} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-data truncate">
                            <span className="font-semibold text-base">{base}</span>
                            <span className="text-text-muted text-sm">/USDT</span>
                          </span>
                          <span className="font-data text-base font-medium">${formatPrice(row.ticker.lastPrice)}</span>
                        </div>
                        <div className="mt-1.5 flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                            <ConditionBadge condition={row.condition} label={t(`radar.condition.${row.condition}`)} />
                            <span className="text-sm text-text-muted">{t(`radar.setup.${row.setup}`)}</span>
                          </div>
                          <ChangePill value={row.change} />
                        </div>
                      </div>
                    </button>
                    <StarButton symbol={row.ticker.symbol} className="items-center pe-3" />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      <p className="mt-6 text-sm text-text-muted leading-relaxed max-w-2xl">
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
  const base = row.ticker.symbol.replace("USDT", "");
  return (
    <div className="panel p-4 flex flex-col transition-colors hover:border-text-muted min-w-[250px] sm:min-w-0 snap-start shrink-0 sm:shrink relative">
      <StarButton symbol={row.ticker.symbol} className="absolute top-2 end-2 z-10" />
      <button onClick={() => onViewChart(base)} className="block w-full text-start">
        <div className="flex items-center gap-3">
          <CoinLogo base={base} size={36} />
          <div className="min-w-0">
            <div className="font-data leading-tight">
              <span className="font-semibold text-base">{base}</span>
              <span className="text-text-muted text-sm">/USDT</span>
            </div>
            <div className="mt-1">
              <ConditionBadge condition={row.condition} label={t(`radar.condition.${row.condition}`)} />
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="font-data text-xl font-semibold">${formatPrice(row.ticker.lastPrice)}</span>
          <ChangePill value={row.change} />
        </div>
      </button>
      <div className="mt-3 text-sm text-gold font-data">
        <span dir="ltr" style={{ unicodeBidi: "isolate", display: "inline-block" }}>
          +{row.vsBtcPct.toFixed(2)}pp
        </span>{" "}
        {t("radar.vsBtc")}
      </div>
      <button onClick={() => onViewChart(base)} className="mt-4 block w-full text-center text-sm btn-primary !py-2.5 !px-4">
        {t("radar.viewChart")}
      </button>
    </div>
  );
}

function ConditionBadge({ condition, label }: { condition: MarketCondition; label: string }) {
  const styles: Record<MarketCondition, string> = {
    bullish: "tag-bull",
    bearish: "tag-bear",
    range: "tag-gold",
  };
  return <span className={`tag ${styles[condition]}`}>{label}</span>;
}
// RADAR-VIEWCHART-2205
// RADAR-NOANALYZE-0217
// RADAR-REDESIGN-1951
// RADAR-SORT-0245
