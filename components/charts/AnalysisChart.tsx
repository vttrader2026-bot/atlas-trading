"use client";

// ATLAS ANALYSIS CHART — Phase 5: shared chart used by both Radar and
// Market Intelligence's "open chart" panels. Presentational only — it
// renders whatever candles it's given and recomputes indicators from them;
// data fetching, timeframe switching, and the Analyze button live in the
// AnalysisPanel wrapper that owns this component.

import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/marketDataTypes";
import { calcEMA, calcMACD, calcRSI } from "@/lib/indicators";

function cssVar(name: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function readThemeColors() {
  return {
    bull: cssVar("--bull") || "#35c48a",
    bear: cssVar("--bear") || "#ef5350",
    text: cssVar("--text-muted") || "#939dac",
    line: cssVar("--line") || "#212a36",
    gold: cssVar("--gold") || "#d4af37",
  };
}

function toTime(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp;
}

export type IndicatorToggles = {
  ema20: boolean;
  ema50: boolean;
  ema200: boolean;
  rsi: boolean;
  macd: boolean;
};

export const DEFAULT_TOGGLES: IndicatorToggles = {
  ema20: true,
  ema50: true,
  ema200: false,
  rsi: false,
  macd: false,
};

export default function AnalysisChart({
  candles,
  toggles,
  fullscreen,
}: {
  candles: Candle[];
  toggles: IndicatorToggles;
  /** Taller layout when the panel is in its expanded/fullscreen mode. */
  fullscreen: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdLineRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSignalRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const colors = useMemo(() => readThemeColors(), []);

  // Build the chart, its fixed panes, and every series once per mount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: { background: { color: "transparent" }, textColor: colors.text },
      grid: { vertLines: { color: colors.line }, horzLines: { color: colors.line } },
      rightPriceScale: { borderColor: colors.line },
      timeScale: { borderColor: colors.line, timeVisible: true, secondsVisible: false },
      autoSize: true,
      crosshair: { mode: 0 },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: colors.bull,
      downColor: colors.bear,
      borderVisible: false,
      wickUpColor: colors.bull,
      wickDownColor: colors.bear,
    });
    candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.28 } });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });

    const ema20 = chart.addSeries(LineSeries, { color: "#60a5fa", lineWidth: 1, visible: false, priceLineVisible: false, lastValueVisible: false });
    const ema50 = chart.addSeries(LineSeries, { color: colors.gold, lineWidth: 1, visible: false, priceLineVisible: false, lastValueVisible: false });
    const ema200 = chart.addSeries(LineSeries, { color: "#c084fc", lineWidth: 1, visible: false, priceLineVisible: false, lastValueVisible: false });

    // RSI in its own pane (index 1), collapsed by default.
    const rsiSeries = chart.addSeries(
      LineSeries,
      { color: colors.gold, lineWidth: 2, visible: false, priceLineVisible: false, lastValueVisible: false },
      1
    );
    rsiSeries.createPriceLine({ price: 70, color: colors.line, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
    rsiSeries.createPriceLine({ price: 30, color: colors.line, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: "" });
    chart.panes()[1]?.setStretchFactor(0);

    // MACD in its own pane (index 2), collapsed by default.
    const macdHist = chart.addSeries(
      HistogramSeries,
      { color: colors.text, visible: false, priceLineVisible: false, lastValueVisible: false },
      2
    );
    const macdLine = chart.addSeries(
      LineSeries,
      { color: "#60a5fa", lineWidth: 1, visible: false, priceLineVisible: false, lastValueVisible: false },
      2
    );
    const macdSignal = chart.addSeries(
      LineSeries,
      { color: colors.gold, lineWidth: 1, visible: false, priceLineVisible: false, lastValueVisible: false },
      2
    );
    chart.panes()[2]?.setStretchFactor(0);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    ema20Ref.current = ema20;
    ema50Ref.current = ema50;
    ema200Ref.current = ema200;
    rsiSeriesRef.current = rsiSeries;
    macdLineRef.current = macdLine;
    macdSignalRef.current = macdSignal;
    macdHistRef.current = macdHist;

    return () => {
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push real candle data + derived indicators into every series whenever
  // the candle set changes (new symbol, new timeframe, or a refresh).
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries || !volumeSeries) return;

    candleSeries.setData(
      candles.map((c) => ({ time: toTime(c.openTime), open: c.open, high: c.high, low: c.low, close: c.close }))
    );
    volumeSeries.setData(
      candles.map((c) => ({
        time: toTime(c.openTime),
        value: c.volume,
        color: c.close >= c.open ? `${colors.bull}80` : `${colors.bear}80`,
      }))
    );

    ema20Ref.current?.setData(calcEMA(candles, 20).map((p) => ({ time: toTime(p.time), value: p.value })));
    ema50Ref.current?.setData(calcEMA(candles, 50).map((p) => ({ time: toTime(p.time), value: p.value })));
    ema200Ref.current?.setData(calcEMA(candles, 200).map((p) => ({ time: toTime(p.time), value: p.value })));

    const rsi = calcRSI(candles, 14);
    rsiSeriesRef.current?.setData(rsi.map((p) => ({ time: toTime(p.time), value: p.value })));

    const { macd, signal, histogram } = calcMACD(candles);
    macdLineRef.current?.setData(macd.map((p) => ({ time: toTime(p.time), value: p.value })));
    macdSignalRef.current?.setData(signal.map((p) => ({ time: toTime(p.time), value: p.value })));
    macdHistRef.current?.setData(
      histogram.map((p) => ({ time: toTime(p.time), value: p.value, color: p.value >= 0 ? `${colors.bull}90` : `${colors.bear}90` }))
    );

    chartRef.current?.timeScale().fitContent();
  }, [candles, colors]);

  // Apply indicator toggle visibility + pane sizing without re-fetching data.
  useEffect(() => {
    ema20Ref.current?.applyOptions({ visible: toggles.ema20 });
    ema50Ref.current?.applyOptions({ visible: toggles.ema50 });
    ema200Ref.current?.applyOptions({ visible: toggles.ema200 });

    rsiSeriesRef.current?.applyOptions({ visible: toggles.rsi });
    chartRef.current?.panes()[1]?.setStretchFactor(toggles.rsi ? 2 : 0);

    macdLineRef.current?.applyOptions({ visible: toggles.macd });
    macdSignalRef.current?.applyOptions({ visible: toggles.macd });
    macdHistRef.current?.applyOptions({ visible: toggles.macd });
    chartRef.current?.panes()[2]?.setStretchFactor(toggles.macd ? 2 : 0);
  }, [toggles]);

  // Re-apply the panel's new size (e.g. entering/leaving fullscreen) —
  // autoSize handles ordinary resizes, but a layout mode change can happen
  // without the container's own box actually resizing on the next tick.
  useEffect(() => {
    const id = requestAnimationFrame(() => chartRef.current?.timeScale().fitContent());
    return () => cancelAnimationFrame(id);
  }, [fullscreen]);

  return (
    <div
      ref={containerRef}
      className={fullscreen ? "w-full h-[calc(100dvh-220px)]" : "w-full h-[320px] sm:h-[420px]"}
    />
  );
}
