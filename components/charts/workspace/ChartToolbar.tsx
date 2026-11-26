"use client";

import type { ReactNode } from "react";
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
  fullscreen: { supported: boolean; active: boolean; onToggle: () => void };
  /** The symbol search (kept inside the toolbar so it is reachable in fullscreen). */
  symbolSlot: ReactNode;
  sidebar: { open: boolean; onToggle: () => void };
};

/**
 * Top toolbar: Price / Market Cap, Undo, Redo, Indicators, timeframes, Settings.
 * Market Cap is shown but disabled: no historical circulating-supply data source is
 * connected, and a market-cap chart without it would be invented numbers.
 */
export default function ChartToolbar(p: ChartToolbarProps) {
  const { t } = useLanguage();
  const btn = "inline-flex h-10 sm:h-9 items-center justify-center gap-1.5 rounded-md border border-line px-2.5 text-sm text-text-muted transition-colors hover:text-text disabled:opacity-40 disabled:cursor-not-allowed";
  const seg = (active: boolean) => `h-10 sm:h-9 px-3 text-sm font-medium transition-colors ${active ? "bg-gold/15 text-gold" : "text-text-muted hover:text-text"}`;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1.5 border-b border-line px-2 py-1.5 sm:gap-x-2 sm:px-3">
      <div className="order-1 min-w-0 flex-1 sm:w-44 sm:flex-none lg:w-52">{p.symbolSlot}</div>

      <select className="input order-2 !hidden !h-9 !w-auto !py-0 text-sm lg:!block" aria-label={t("charts.providerLabel")} title={t("charts.providerLabel")} defaultValue="binance">
        <option value="binance">Binance Spot</option>
      </select>

      <div className="order-6 !hidden overflow-hidden rounded-md border border-line xl:!inline-flex" role="group" aria-label={`${t("charts.priceMode")} / ${t("charts.marketCapMode")}`}>
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

      <div className="order-5 flex gap-1">
        <button type="button" className={`${btn} w-10 px-0 sm:w-9`} disabled={!p.canUndo} onClick={p.onUndo} aria-label={t("charts.undo")} title={`${t("charts.undo")} (Ctrl+Z)`}>
          {Icons.undo}
        </button>
        <button type="button" className={`${btn} w-10 px-0 sm:w-9`} disabled={!p.canRedo} onClick={p.onRedo} aria-label={t("charts.redo")} title={`${t("charts.redo")} (Ctrl+Shift+Z)`}>
          {Icons.redo}
        </button>
      </div>

      <div className="order-4"><IndicatorsMenu enabled={p.indicators} onToggle={p.onIndicator} btnClass={btn} /></div>

      <div className="order-3 flex w-full overflow-x-auto sm:w-auto" role="group" aria-label={t("charts.timeframeLabel")}>
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

      <div className="order-2 ms-auto flex items-center gap-1 sm:order-last">
        <button
          type="button"
          className={`${btn} ${p.fullscreen.active ? "border-gold/50 text-gold" : ""} w-10 px-0 sm:w-9 lg:w-auto lg:px-3`}
          disabled={!p.fullscreen.supported}
          onClick={p.fullscreen.onToggle}
          aria-pressed={p.fullscreen.active}
          aria-label={p.fullscreen.active ? t("charts.exitFullscreen") : t("charts.fullscreen")}
          title={!p.fullscreen.supported ? t("charts.fullscreenUnsupported") : p.fullscreen.active ? `${t("charts.exitFullscreen")} (Esc)` : t("charts.fullscreen")}
        >
          {p.fullscreen.active ? Icons.fullscreenExit : Icons.fullscreen}
          <span className="hidden lg:inline">{p.fullscreen.active ? t("charts.exitFullscreen") : t("charts.fullscreen")}</span>
        </button>
        <SettingsMenu settings={p.settings} onChange={p.onSettings} onReset={p.onResetSettings} btnClass={`${btn} w-10 px-0 sm:w-9`} />
        <button type="button" className={`${btn} w-10 px-0 sm:w-9 ${p.sidebar.open ? "border-gold/50 text-gold" : ""}`} onClick={p.sidebar.onToggle} aria-pressed={p.sidebar.open} aria-label={p.sidebar.open ? t("charts.panelHide") : t("charts.panelShow")} title={p.sidebar.open ? t("charts.panelHide") : t("charts.panelShow")}>
          {Icons.panel}
        </button>
      </div>
    </div>
  );
}
