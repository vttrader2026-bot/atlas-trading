"use client";

// Creates the Lightweight Charts instance exactly once (the library is
// imported lazily so first paint doesn't wait on it), with the candle series,
// EMA overlay lines and the drawings primitive; applies appearance (settings
// + theme, including the volume pane); follows the light/dark toggle; and
// tears everything down on unmount.

import { useCallback, useEffect, useState, type RefObject } from "react";
import type { ISeriesApi } from "lightweight-charts";
import { EMA_COLORS, EMA_DEFS } from "@/lib/chartIndicators";
import { candleColors, candleOptionsFor, chartOptionsFor, withAlpha } from "@/lib/chartSettings";
import { DrawingsPrimitive } from "@/components/charts/drawingsPrimitive";
import { themeColors, toTime, type ChartCore } from "@/components/charts/hooks/chartCore";

export function useChartInstance(core: ChartCore, containerRef: RefObject<HTMLDivElement | null>) {
  const [chartReady, setChartReady] = useState(false);

  /** Settings + theme -> chart/series options. Also adds or removes the volume pane. Stable identity. */
  const applyAppearance = useCallback(() => {
    const chart = core.chartRef.current;
    const candles = core.candleSeriesRef.current;
    const lwc = core.lwcRef.current;
    if (!chart || !candles || !lwc) return;
    const s = core.settingsRef.current;
    const theme = themeColors();
    chart.applyOptions(chartOptionsFor(s, theme));
    candles.applyOptions(candleOptionsFor(s, theme));
    for (const e of EMA_DEFS) core.emaSeriesRef.current[e.period]?.applyOptions({ color: EMA_COLORS[e.period] || theme.gold });

    // Volume lives in its own pane below the price pane; the setting adds or removes that pane.
    if (s.volume && !core.volumeSeriesRef.current) {
      core.volumeSeriesRef.set(chart.addSeries(lwc.HistogramSeries, { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false }, 1));
    } else if (!s.volume && core.volumeSeriesRef.current) {
      chart.removeSeries(core.volumeSeriesRef.current);
      core.volumeSeriesRef.set(null);
      if (chart.panes().length > 1) chart.removePane(1);
    }
    const panes = chart.panes();
    panes[0]?.setStretchFactor(4);
    panes[1]?.setStretchFactor(1);
    const volume = core.volumeSeriesRef.current;
    volume?.priceScale().applyOptions({ visible: s.priceScale, borderColor: theme.line, scaleMargins: { top: 0.12, bottom: 0 } });
    const colors = candleColors(s, theme);
    volume?.setData(core.candlesRef.current.map((c) => ({ time: toTime(c.openTime), value: c.volume, color: withAlpha(c.close >= c.open ? colors.up : colors.down) })));
    core.primitiveRef.current?.setState({ colors: { accent: theme.gold, text: theme.textStrong, surface: theme.surface, bull: theme.bull, bear: theme.bear } });
  }, [core]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let observer: MutationObserver | null = null;
    let detachPrimitive: (() => void) | null = null;

    import("lightweight-charts").then((lwc) => {
      if (cancelled || !containerRef.current) return;
      core.lwcRef.set(lwc);
      const s = core.settingsRef.current;
      const theme = themeColors();
      const chart = lwc.createChart(containerRef.current, { ...chartOptionsFor(s, theme), autoSize: true });
      const candles = chart.addSeries(lwc.CandlestickSeries, { ...candleOptionsFor(s, theme) }, 0);
      candles.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.06 } });

      const lines: Record<number, ISeriesApi<"Line">> = {};
      for (const e of EMA_DEFS) {
        lines[e.period] = chart.addSeries(
          lwc.LineSeries,
          { color: EMA_COLORS[e.period] || theme.gold, lineWidth: 1, visible: core.indicatorsRef.current[e.id], priceLineVisible: false, lastValueVisible: false },
          0
        );
      }

      const primitive = new DrawingsPrimitive();
      candles.attachPrimitive(primitive);

      core.chartRef.set(chart);
      core.candleSeriesRef.set(candles);
      core.emaSeriesRef.set(lines);
      core.primitiveRef.set(primitive);

      // Follow the light/dark toggle (the theme is a class on <html>).
      observer = new MutationObserver(() => applyAppearance());
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

      detachPrimitive = () => candles.detachPrimitive(primitive);
      setChartReady(true);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      detachPrimitive?.();
      core.primitiveRef.set(null);
      core.chartRef.current?.remove();
      core.chartRef.set(null);
      core.candleSeriesRef.set(null);
      core.volumeSeriesRef.set(null);
      core.emaSeriesRef.set({});
      setChartReady(false);
    };
  }, [core, containerRef, applyAppearance]);

  return { chartReady, applyAppearance };
}
