"use client";

import { useLanguage } from "@/lib/i18n";
import type { ChartInterval } from "@/lib/marketDataTypes";
import { CHART_TIMEFRAMES } from "@/lib/chartLive";
import type { ChartSettings } from "@/lib/chartSettings";
import type { IndicatorId } from "@/lib/chartIndicators";
import IndicatorsMenu from "@/components/charts/workspace/IndicatorsMenu";
import SettingsMenu from "@/components/charts/workspace/SettingsMenu";
import { Icons } from "@/components/charts/workspace/icons";

export type ChartToolbarProps = {
  interval: ChartInterval;
  onInterval: (i: ChartInterval) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  indicators: Record<IndicatorId, boolean>;
  onIndicator: (id: IndicatorId) => void;
  settings: ChartSettings;
  onSettings: (patch: Partial<ChartSettings>) => void;
  onResetSettings: () => void;
};

/**
 * Top toolbar: Price / Market Cap, Undo, Redo, Indicators, timeframes, Settings.
 * Market Cap is shown but disabled: no historical circulating-supply data source is
 * connected, and a market-cap chart without it would be invented numbers.
 */
export default function ChartToolbar(p: ChartToolbarProps) {
  const { t } = useLanguage();
  const btn = "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-line px-2.5 text-sm text-text-muted transition-colors hover:text-text disabled:opacity-40 disabled:cursor-not-allowed";
  const seg = (active: boolean) => `h-9 px-3 text-sm font-medium transition-colors ${active ? "bg-gold/15 text-gold" : "text-text-muted hover:text-text"}`;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-line px-2 py-2 sm:px-3">
      <div className="inline-flex overflow-hidden rounded-md border border-line" role="group" aria-label={`${t("charts.priceMode")} / ${t("charts.marketCapMode")}`}>
        <button type="button" className={seg(true)} aria-pressed="true">
          {t("charts.priceMode")}
        </button>
        <button type="button" className={`${seg(false)} cursor-not-allowed border-s border-line opacity-60`} aria-disabled="true" aria-describedby="mcap-note" title={t("charts.marketCapUnavailable")} onClick={(e) => e.preventDefault()}>
          {t("charts.marketCapMode")}
        </button>
        <span id="mcap-note" className="sr-only">
          {t("charts.marketCapUnavailable")}
        </span>
      </div>

      <div className="flex gap-1">
        <button type="button" className={`${btn} w-9 px-0`} disabled={!p.canUndo} onClick={p.onUndo} aria-label={t("charts.undo")} title={`${t("charts.undo")} (Ctrl+Z)`}>
          {Icons.undo}
        </button>
        <button type="button" className={`${btn} w-9 px-0`} disabled={!p.canRedo} onClick={p.onRedo} aria-label={t("charts.redo")} title={`${t("charts.redo")} (Ctrl+Shift+Z)`}>
          {Icons.redo}
        </button>
      </div>

      <IndicatorsMenu enabled={p.indicators} onToggle={p.onIndicator} btnClass={btn} />

      <div className="order-last flex w-full overflow-x-auto sm:order-none sm:w-auto" role="group" aria-label={t("charts.timeframeLabel")}>
        <div className="inline-flex overflow-hidden rounded-md border border-line">
          {CHART_TIMEFRAMES.map((tf, i) => (
            <button
              key={tf.value}
              type="button"
              className={`${seg(p.interval === tf.value)} min-w-11 ${i > 0 ? "border-s border-line" : ""}`}
              aria-pressed={p.interval === tf.value}
              title={tf.value === "1d" ? "24h / 1D" : tf.label}
              onClick={() => p.onInterval(tf.value)}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ms-auto">
        <SettingsMenu settings={p.settings} onChange={p.onSettings} onReset={p.onResetSettings} btnClass={`${btn} w-9 px-0`} />
      </div>
    </div>
  );
}
