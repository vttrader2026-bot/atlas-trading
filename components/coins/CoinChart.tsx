"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, Interval } from "@/lib/marketDataTypes";
import { subscribeKline, type StreamStatus } from "@/lib/binanceKlineStream";

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
    bg: "transparent",
  };
}

function toChartCandle(c: Candle) {
  return {
    time: Math.floor(c.openTime / 1000) as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  };
}

function toChartVolume(c: Candle, colors: { bull: string; bear: string }) {
  return {
    time: Math.floor(c.openTime / 1000) as UTCTimestamp,
    value: c.volume,
    color: c.close >= c.open ? `${colors.bull}80` : `${colors.bear}80`,
  };
}

export default function CoinChart({
  symbol,
  interval,
  initialCandles,
  statusLabels,
}: {
  symbol: string; // Binance trading symbol, e.g. "BTCUSDT"
  interval: Interval;
  initialCandles: Candle[];
  statusLabels: { connecting: string; live: string; reconnecting: string; offline: string };
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const lastCandleRef = useRef<Candle | null>(initialCandles[initialCandles.length - 1] ?? null);
  const [status, setStatus] = useState<StreamStatus>("connecting");

  const colors = useMemo(() => readThemeColors(), []);

  // Create the chart once per mount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      layout: {
        background: { color: "transparent" },
        textColor: colors.text,
      },
      grid: {
        vertLines: { color: colors.line },
        horzLines: { color: colors.line },
      },
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

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme changes: the app toggles a `light` class on <html> (ThemeToggle.tsx)
  // rather than firing an event, so a MutationObserver is how the chart
  // notices without that component needing to know this chart exists.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const next = readThemeColors();
      chartRef.current?.applyOptions({
        layout: { textColor: next.text },
        grid: { vertLines: { color: next.line }, horzLines: { color: next.line } },
        rightPriceScale: { borderColor: next.line },
        timeScale: { borderColor: next.line },
      });
      candleSeriesRef.current?.applyOptions({
        upColor: next.bull,
        downColor: next.bear,
        wickUpColor: next.bull,
        wickDownColor: next.bear,
      });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Load (or reload, on an interval change) the validated REST history.
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;
    candleSeriesRef.current.setData(initialCandles.map(toChartCandle));
    volumeSeriesRef.current.setData(initialCandles.map((c) => toChartVolume(c, colors)));
    lastCandleRef.current = initialCandles[initialCandles.length - 1] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCandles, interval]);

  // Live updates over the Binance kline WebSocket for the active symbol/interval.
  useEffect(() => {
    const unsubscribe = subscribeKline(
      symbol,
      interval,
      (candle) => {
        // Never apply a live tick older than the history we already loaded -
        // guards against a stray out-of-order frame silently rewinding the
        // chart.
        const last = lastCandleRef.current;
        if (last && candle.openTime < last.openTime) return;

        candleSeriesRef.current?.update(toChartCandle(candle));
        volumeSeriesRef.current?.update(toChartVolume(candle, colors));
        lastCandleRef.current = candle;
      },
      setStatus
    );
    return unsubscribe;
  }, [symbol, interval, colors]);

  return (
    <div className="relative">
      <div ref={containerRef} className="h-[420px] w-full" />
      <ConnectionBadge status={status} labels={statusLabels} />
    </div>
  );
}

function ConnectionBadge({
  status,
  labels,
}: {
  status: StreamStatus;
  labels: { connecting: string; live: string; reconnecting: string; offline: string };
}) {
  const label =
    status === "live"
      ? labels.live
      : status === "connecting"
        ? labels.connecting
        : status === "reconnecting"
          ? labels.reconnecting
          : labels.offline;
  const dotClass = status === "live" ? "bg-bull" : status === "closed" ? "bg-bear" : "bg-gold";

  return (
    <div className="absolute top-2 right-2 flex items-center gap-1.5 rounded-full border border-line bg-surface/80 backdrop-blur px-2.5 py-1 text-[11px] font-medium text-text-muted">
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotClass} ${status === "live" ? "animate-pulse" : ""}`} />
      {label}
    </div>
  );
}
