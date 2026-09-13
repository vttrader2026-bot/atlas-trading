"use client";

import { useEffect, useMemo, useState } from "react";
import { getAllTickers24h, getTicker24h, formatPrice, formatCompact } from "@/lib/binance";
import { buildRadarRows, RadarRow, RadarTag } from "@/lib/radar";
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

  const filtered = useMemo(() => {
    if (!rows) return [];
    const list = filter === "all" ? rows : rows.filter((r) => r.tags.includes(filter));
    return [...list].sort((a, b) => b.volume - a.volume).slice(0, 60);
  }, [rows, filter]);

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <h1 className="text-2xl tracking-tight">{t("radar.title")}</h1>
      <p className="text-text-muted text-sm mt-1 max-w-2xl leading-relaxed">
        {t("radar.subtitle")}
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
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

      {error && <p className="mt-6 text-sm text-bear">{t("radar.error")}</p>}

      {!error && !rows && <p className="mt-8 text-sm text-text-muted">{t("radar.loading")}</p>}

      {rows && (
        <div className="mt-6 border border-line rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface text-text-muted">
              <tr>
                <th className="text-left px-4 py-3 font-normal">{t("radar.pair")}</th>
                <th className="text-right px-4 py-3 font-normal">{t("radar.price")}</th>
                <th className="text-right px-4 py-3 font-normal">{t("radar.change24h")}</th>
                <th className="text-right px-4 py-3 font-normal">{t("radar.vsBtc")}</th>
                <th className="text-right px-4 py-3 font-normal">{t("radar.volume")}</th>
                <th className="text-left px-4 py-3 font-normal">{t("radar.tags")}</th>
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
                const vsBtcPositive = row.vsBtcPct >= 0;
                return (
                  <tr key={row.ticker.symbol} className="border-t border-line hover:bg-surface/60">
                    <td className="px-4 py-3 font-data">
                      {row.ticker.symbol.replace("USDT", "/USDT")}
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
                    <td
                      className={`px-4 py-3 font-data text-right ${
                        vsBtcPositive ? "text-bull" : "text-bear"
                      }`}
                    >
                      {vsBtcPositive ? "+" : ""}
                      {row.vsBtcPct.toFixed(2)}pp
                    </td>
                    <td className="px-4 py-3 font-data text-right text-text-muted">
                      ${formatCompact(row.volume)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {row.tags.map((tag) => (
                          <TagBadge key={tag} tag={tag} label={t(`radar.tag.${tag}`)} />
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-text-muted leading-relaxed max-w-2xl">
        {t("radar.disclaimer")}
      </p>
    </main>
  );
}

function TagBadge({ tag, label }: { tag: RadarTag; label: string }) {
  const styles: Record<RadarTag, string> = {
    breakout: "border-bull/40 text-bull",
    pullback: "border-gold/40 text-gold",
    highVolume: "border-line text-text-muted",
    nearHigh: "border-bull/40 text-bull",
    nearLow: "border-bear/40 text-bear",
    outperformBtc: "border-bull/40 text-bull",
    underperformBtc: "border-bear/40 text-bear",
  };
  return (
    <span className={`px-2 py-0.5 rounded border text-[11px] whitespace-nowrap ${styles[tag]}`}>
      {label}
    </span>
  );
}
