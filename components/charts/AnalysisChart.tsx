"use client";

// ATLAS ANALYSIS CHART — Phase 5: shared chart used by both Radar and
// Market Pulse's "open chart" panels. Presentational only — it
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
import {
  CLICK_SLOP_PX,
  hitTest,
  isDegenerateRect,
  isDegenerateTrend,
  snapTime,
  type Drawing,
  type DrawingDraft,
  type Pt,
  type Tool,
} from "@/lib/chartDrawings";
import { DrawingsPrimitive } from "@/components/charts/drawingsPrimitive";

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
  tool,
  drawings,
  selectedId,
  onCreate,
  onSelect,
}: {
  candles: Candle[];
  toggles: IndicatorToggles;
  /** Taller layout when the panel is in its expanded/fullscreen mode. */
  fullscreen: boolean;
  /** Basic drawing tools: state is owned by AnalysisPanel so it survives chart rebuilds. */
  tool: Tool;
  drawings: Drawing[];
  selectedId: string | null;
  onCreate: (d: DrawingDraft) => void;
  onSelect: (id: string | null) => void;
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
  const times = useMemo(() => candles.map((c) => toTime(c.openTime) as number), [candles]);
  const primRef = useRef<DrawingsPrimitive | null>(null);
  const pendingRef = useRef<Pt | null>(null); // trendline start waiting for its end point

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

    const prim = new DrawingsPrimitive();
    prim.setState({ color: colors.gold });
    candleSeries.attachPrimitive(prim);
    primRef.current = prim;

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
      primRef.current = null;
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

    primRef.current?.setState({ times });
    chartRef.current?.timeScale().fitContent();
  }, [candles, colors, times]);

  // Hand the drawings (owned by the panel) to the primitive; it repaints itself.
  useEffect(() => {
    primRef.current?.setState({ drawings, selectedId });
  }, [drawings, selectedId]);

  // Drawing interaction. Cursor mode leaves the chart's own pan/zoom untouched;
  // a drawing tool pauses pan/zoom so a drag draws instead of moving the chart.
  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    const prim = primRef.current;
    if (!container || !chart || !series || !prim) return;

    const drawing = tool !== "cursor";
    chart.applyOptions({ handleScroll: !drawing, handleScale: !drawing });
    container.style.touchAction = drawing ? "none" : "";
    pendingRef.current = null;
    prim.setState({ preview: null });

    // Pointer position -> pixel in the price pane + the candle time / price under it.
    const locate = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const paneH = chart.panes()[0]?.getHeight() ?? 0;
      if (x < 0 || y < 0 || x > chart.timeScale().width() || y > paneH) return null;
      const time = snapTime(times, chart.timeScale().coordinateToLogical(x) ?? NaN);
      const price = series.coordinateToPrice(y);
      if (time === null || price === null) return null;
      return { x, y, pt: { time, price: price as number } };
    };

    // trendline and rectangle share the same two-point gesture (drag, or tap-tap on touch)
    const twoPoint = tool === "trend" || tool === "rect";
    const finishTwoPoint = (a: Pt, b: Pt) => {
      pendingRef.current = null;
      prim.setState({ preview: null });
      if (tool === "rect") {
        if (!isDegenerateRect(a, b)) onCreate({ kind: "rect", a, b });
      } else if (!isDegenerateTrend(a, b)) onCreate({ kind: "trend", a, b });
    };

    let down: { x: number; y: number; hadStart: boolean } | null = null;

    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const p = locate(e);
      if (!p) {
        down = null;
        return;
      }
      down = { x: p.x, y: p.y, hadStart: pendingRef.current !== null };
      if (twoPoint && !pendingRef.current) {
        pendingRef.current = p.pt;
        prim.setState({ preview: { a: p.pt, b: null, rect: tool === "rect" } });
      }
      if (drawing) {
        try { container.setPointerCapture(e.pointerId); } catch { /* not capturable: fine */ }
      }
    };

    const onMove = (e: PointerEvent) => {
      const a = pendingRef.current;
      if (!twoPoint || !a) return;
      const p = locate(e);
      if (p) prim.setState({ preview: { a, b: p.pt, rect: tool === "rect" } });
    };

    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      const p = locate(e);
      if (!d || !p) return;
      const moved = Math.hypot(p.x - d.x, p.y - d.y) > CLICK_SLOP_PX;
      if (tool === "cursor") {
        if (!moved) onSelect(hitTest(prim.projectAll(), p.x, p.y));
      } else if (tool === "hline") {
        if (!moved) onCreate({ kind: "hline", price: p.pt.price });
      } else {
        const a = pendingRef.current;
        // drag = start..end in one gesture; otherwise the first tap set the start and this tap ends it
        if (a && (moved || d.hadStart)) finishTwoPoint(a, p.pt);
      }
    };

    const onCancel = () => {
      down = null;
    };

    container.addEventListener("pointerdown", onDown, true);
    container.addEventListener("pointermove", onMove, true);
    container.addEventListener("pointerup", onUp, true);
    container.addEventListener("pointercancel", onCancel, true);
    return () => {
      container.removeEventListener("pointerdown", onDown, true);
      container.removeEventListener("pointermove", onMove, true);
      container.removeEventListener("pointerup", onUp, true);
      container.removeEventListener("pointercancel", onCancel, true);
    };
  }, [tool, times, onCreate, onSelect]);

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
