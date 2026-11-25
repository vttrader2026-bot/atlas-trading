"use client";

// ATLAS CHARTS — standalone chart workspace (/charts): presentation only.
//
// All behaviour lives in focused hooks under components/charts/hooks:
//   useChartQuery      symbol + timeframe, mirrored in the URL
//   useChartInstance   the Lightweight Charts instance, series, theme/appearance
//   useChartSettings   per-viewer appearance preferences
//   useChartIndicators indicator toggles
//   useChartData       historical candles + in-place resync
//   useLiveCandles     the isolated Binance kline socket
//   useCrosshairCandle candle under the crosshair (OHLC legend)
//   useDrawingSession  drawings, undo/redo, tools, selection, text editor
//   useChartViewport   zoom / fit
//
// Drawings, history and selection are in-memory for this open chart only;
// nothing is persisted yet.

import { useCallback, useRef } from "react";
import { useLanguage } from "@/lib/i18n";
import { formatPrice } from "@/lib/binance";
import { CHART_TIMEFRAMES, baseOfUsdtSymbol, errorKeyForCode } from "@/lib/chartLive";
import { ZOOM_STEP } from "@/lib/chartViewport";
import { useChartCore } from "@/components/charts/hooks/chartCore";
import { useChartQuery } from "@/components/charts/hooks/useChartQuery";
import { useChartInstance } from "@/components/charts/hooks/useChartInstance";
import { useChartSettings } from "@/components/charts/hooks/useChartSettings";
import { useChartIndicators } from "@/components/charts/hooks/useChartIndicators";
import { useChartData } from "@/components/charts/hooks/useChartData";
import { useLiveCandles } from "@/components/charts/hooks/useLiveCandles";
import { useCrosshairCandle } from "@/components/charts/hooks/useCrosshairCandle";
import { useDrawingSession } from "@/components/charts/hooks/useDrawingSession";
import { useChartViewport } from "@/components/charts/hooks/useChartViewport";
import ChartSymbolPicker from "@/components/charts/ChartSymbolPicker";
import ChartToolbar from "@/components/charts/workspace/ChartToolbar";
import DrawingToolbar from "@/components/charts/workspace/DrawingToolbar";
import OhlcLegend from "@/components/charts/workspace/OhlcLegend";
import { Icons } from "@/components/charts/workspace/icons";

export default function ChartWorkspace() {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const core = useChartCore();

  const { ready, symbol, setSymbol, interval, setInterval: setIntervalValue } = useChartQuery();
  const { chartReady, applyAppearance } = useChartInstance(core, containerRef);
  const { settings, update: updateSettings, reset: resetSettings } = useChartSettings(core, chartReady, applyAppearance);
  const { indicators, toggle: toggleIndicator } = useChartIndicators(core, chartReady);
  const { load, dataKey, lastCandle, setLastCandle, resync, retry } = useChartData(core, { ready, chartReady, symbol, interval });
  const liveStatus = useLiveCandles(core, dataKey, resync, setLastCandle);
  const hoverCandle = useCrosshairCandle(core, chartReady, dataKey);
  const drawing = useDrawingSession(core, containerRef, chartReady, t);
  const { zoom, fit } = useChartViewport(core);

  // Symbol change: drawings are priced for one pair, so the session starts fresh.
  const changeSymbol = useCallback(
    (next: string) => {
      if (next === symbol) return;
      setSymbol(next);
      drawing.reset();
    },
    [symbol, setSymbol, drawing]
  );

  const base = baseOfUsdtSymbol(symbol) ?? symbol;
  const tfLabel = CHART_TIMEFRAMES.find((x) => x.value === interval)?.label ?? interval;
  const shown = hoverCandle ?? lastCandle;
  const up = lastCandle ? lastCandle.close >= lastCandle.open : true;
  const liveLabel =
    load.status !== "ready"
      ? null
      : liveStatus === "live"
        ? t("charts.live")
        : liveStatus === "reconnecting"
          ? t("charts.reconnecting")
          : t("charts.connecting");

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-5">
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-widest text-gold">{t("charts.eyebrow")}</p>
        <h1 className="font-heading text-xl sm:text-2xl font-semibold mt-0.5">{t("charts.title")}</h1>
        <p className="hidden sm:block text-text-muted text-sm mt-1 max-w-2xl">{t("charts.subtitle")}</p>
      </div>

      <div className="mt-3 max-w-xs">
        <ChartSymbolPicker value={symbol} onChange={changeSymbol} />
      </div>

      <section className="mt-3 rounded-xl border border-line bg-surface" aria-label={`${base}/USDT ${tfLabel}`}>
        <ChartToolbar
          interval={interval}
          onInterval={setIntervalValue}
          canUndo={drawing.canUndo}
          canRedo={drawing.canRedo}
          onUndo={drawing.undo}
          onRedo={drawing.redo}
          indicators={indicators}
          onIndicator={toggleIndicator}
          settings={settings}
          onSettings={updateSettings}
          onResetSettings={resetSettings}
        />

        <div className="flex flex-col sm:flex-row">
          <DrawingToolbar
            tool={drawing.tool}
            onTool={drawing.selectTool}
            magnet={drawing.magnet}
            onMagnet={drawing.toggleMagnet}
            locked={drawing.locked}
            onLock={drawing.toggleLocked}
            hidden={drawing.hidden}
            onHidden={drawing.toggleHidden}
            onZoomIn={() => zoom(ZOOM_STEP)}
            onZoomOut={() => zoom(1 / ZOOM_STEP)}
            onZoomReset={fit}
            canDelete={drawing.canDelete}
            onDelete={drawing.deleteSelected}
            drawingCount={drawing.drawings.length}
            onClear={drawing.clearAll}
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-b border-line">
              <h2 className="font-data text-base sm:text-lg font-semibold">
                {base}/USDT <span className="text-text-muted font-normal">· {tfLabel}</span>
              </h2>
              <span className="text-xs text-text-muted">Binance Spot</span>
              {lastCandle && <span className={`font-data text-sm sm:text-base ${up ? "text-bull" : "text-bear"}`}>${formatPrice(lastCandle.close)}</span>}
              {load.status === "ready" && load.stale && <span className="text-[11px] px-2 py-0.5 rounded border border-gold/40 text-gold">{t("charts.stale")}</span>}
              {drawing.selectedDrawing?.kind === "text" && !drawing.locked && (
                <button type="button" className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-xs text-text-muted hover:text-text" onClick={drawing.editSelectedText}>
                  {Icons.edit}
                  {t("charts.editText")}
                </button>
              )}
              {drawing.notice && (
                <span className="text-xs text-gold" role="status">
                  {t(`charts.notice.${drawing.notice}`)}
                </span>
              )}
              {liveLabel && (
                <span className="ms-auto inline-flex items-center gap-1.5 text-xs text-text-muted" role="status">
                  <span className={`inline-block h-2 w-2 rounded-full ${liveStatus === "live" ? "bg-bull" : "bg-gold"}`} aria-hidden="true" />
                  {liveLabel}
                </span>
              )}
            </div>

            <div className="relative h-[68dvh] min-h-[360px] sm:h-[calc(100dvh-22rem)] sm:min-h-[480px]" dir="ltr">
              <div ref={containerRef} className="absolute inset-0" />
              {load.status === "ready" && <OhlcLegend candle={shown} />}
              {load.status === "loading" && (
                <div className="absolute inset-0 z-20 flex items-center justify-center text-sm text-text-muted bg-surface/60" role="status">
                  {t("charts.loading")}
                </div>
              )}
              {load.status === "error" && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 px-6 text-center bg-surface" role="alert">
                  <p className="text-sm sm:text-base max-w-md">{load.code === "NO_DATA" ? t("charts.err.noData") : t(`charts.err.${errorKeyForCode(load.code)}`)}</p>
                  {errorKeyForCode(load.code) !== "unsupportedPair" && load.code !== "NO_DATA" && (
                    <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={retry}>
                      {t("charts.retry")}
                    </button>
                  )}
                </div>
              )}
              {drawing.textReq && (
                <form
                  className="absolute z-30 flex gap-1 rounded-md border border-gold bg-surface p-1.5 shadow-lg"
                  style={{ left: Math.max(4, Math.min(drawing.textReq.x, 9999)), top: Math.max(4, drawing.textReq.y - 20) }}
                  dir="auto"
                  onSubmit={(e) => {
                    e.preventDefault();
                    drawing.submitText(new FormData(e.currentTarget).get("note")?.toString() ?? "");
                  }}
                >
                  <input
                    name="note"
                    autoFocus
                    maxLength={80}
                    defaultValue={drawing.textReq.text ?? ""}
                    placeholder={t("charts.textPlaceholder")}
                    className="input h-9 w-44 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        drawing.cancelText();
                      }
                    }}
                  />
                  <button type="submit" className="rounded bg-gold px-3 text-sm font-medium text-bg">
                    {drawing.textReq.editId ? t("charts.textSaveEdit") : t("charts.textSave")}
                  </button>
                  <button type="button" className="rounded border border-line px-2 text-sm" onClick={drawing.cancelText} aria-label={t("charts.cancel")}>
                    ×
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      <p className="mt-3 text-xs text-text-muted leading-relaxed">{t("charts.disclaimer")}</p>
      {/* Apache-2.0 attribution for Lightweight Charts (NOTICE text + link). Do not remove. */}
      <p className="mt-2 text-xs text-text-muted" dir="ltr">
        TradingView Lightweight Charts™ · Copyright (c) 2026 TradingView, Inc. ·{" "}
        <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-text">
          https://www.tradingview.com/
        </a>
      </p>
    </main>
  );
}
