"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getAllTickers24h, getTicker24h, formatPrice, formatCompact } from "@/lib/binance";
import { buildRadarRows, RadarRow, RadarTag, MarketCondition } from "@/lib/radar";
import { useLanguage } from "@/lib/i18n";

const FILTERS: { key: RadarTag | "all"; labelKey: string }[] = [
  { key: "all", labelKey: "radar.filterAll" },
  { key: "highVolume", labelKey: "radar.filterVolume" },
  { key: "breakout", labelKey: "radar.filterBreakout" },
  { key: "pullback", labelKey: "radar.filterPullback" },
  { key: "nearHigh", labelKey: "radar.filterNearHigh" },
  { key: "nearLow", labelKey: "radar.filterNearLow" },
  { key: "outperformBtc", labelKey: "radar.filterOutperform" },
];

const SHORTLIST_SIZE = 8;

export default function RadarPage() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<RadarRow[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<RadarTag | "all">("all");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [tickers, btc] = await Promise.all([getAllTickers24h(), getTicker24h("BTCUSDT")]);
        if (cancelled) return;
        const btcChange = parseFloat(btc.priceChangePercent);
        setRows(buildRadarRows(tickers, btcChange));
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      }
    }
    load();
    const id = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Shortlist = pairs genuinely beating BTC's 24h performance, ranked by
  // how far ahead they are. Stablecoins are already excluded upstream.
  const shortlist = useMemo(() => {
    if (!rows) return [];
    return [...rows]
      .filter((r) => r.tags.includes("outperformBtc"))
      .sort((a, b) => b.vsBtcPct - a.vsBtcPct)
      .slice(0, SHORTLIST_SIZE);
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const list = filter === "all" ? rows : rows.filter((r) => r.tags.includes(filter));
    return [...list].sort((a, b) => b.volume - a.volume).slice(0, 60);
  }, [rows, filter]);

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{t("radar.title")}</h1>
      <p className="text-text-muted text-sm mt-1 max-w-2xl leading-relaxed">
        {t("radar.subtitle")}
      </p>

      {!error && !rows && <p className="mt-8 text-sm text-text-muted">{t("radar.loading")}</p>}
      {error && <p className="mt-6 text-sm text-bear">{t("radar.error")}</p>}

      {rows && (
        <>
          <div className="mt-8">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h2 className="font-heading text-lg font-semibold tracking-tight">
                {t("radar.shortlistTitle")}
              </h2>
              <span className="text-xs text-text-muted">{t("radar.shortlistNote")}</span>
            </div>

            {shortlist.length === 0 ? (
              <p className="mt-4 text-sm text-text-muted">{t("radar.shortlistEmpty")}</p>
            ) : (
              <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {shortlist.map((row) => (
                  <ShortlistCard key={row.ticker.symbol} row={row} t={t} />
                ))}
              </div>
            )}
          </div>

          <div className="mt-10 border-t border-line pt-8">
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
                    filter === f.key
                      ? "border-gold text-gold bg-gold/10"
                      : "border-line text-text-muted hover:text-text"
                  }`}
                >
                  {t(f.labelKey)}
                </button>
              ))}
            </div>

            <div className="mt-4 border border-line rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-surface text-text-muted">
                  <tr>
                    <th className="text-left px-4 py-3 font-normal">{t("radar.pair")}</th>
                    <th className="text-right px-4 py-3 font-normal">{t("radar.price")}</th>
                    <th className="text-right px-4 py-3 font-normal">{t("radar.change24h")}</th>
                    <th className="text-right px-4 py-3 font-normal">{t("radar.volume")}</th>
                    <th className="text-left px-4 py-3 font-normal">{t("radar.conditionHeader")}</th>
                    <th className="text-left px-4 py-3 font-normal">{t("radar.setupHeader")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-text-muted">
                        {t("radar.empty")}
                      </td>
                    </tr>
                  )}
                  {filtered.map((row) => {
                    const positive = row.change >= 0;
                    return (
                      <tr key={row.ticker.symbol} className="border-t border-line hover:bg-surface/60">
                        <td className="px-4 py-3 font-data">
                          <Link
                            href={`/analyzer?pair=${encodeURIComponent(row.ticker.symbol.replace("USDT", "/USDT"))}`}
                            className="hover:text-gold transition-colors"
                          >
                            {row.ticker.symbol.replace("USDT", "/USDT")}
                          </Link>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        </>
      )}

      <p className="mt-6 text-xs text-text-muted leading-relaxed max-w-2xl">
        {t("radar.disclaimer")}
      </p>
    </main>
  );
}

function ShortlistCard({ row, t }: { row: RadarRow; t: (key: string) => string }) {
  const positive = row.change >= 0;
  return (
    <div className="border border-line rounded-lg bg-surface p-4">
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
      <div className="mt-2 text-xs text-gold font-data">
        +{row.vsBtcPct.toFixed(2)}pp {t("radar.vsBtc")}
      </div>
      <Link
        href={`/analyzer?pair=${encodeURIComponent(row.ticker.symbol.replace("USDT", "/USDT"))}`}
        className="mt-3 block text-center text-xs btn-secondary"
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
