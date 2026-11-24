"use client";

// ATLAS CHARTS — Phase 1: standalone chart workspace (/charts).
//
// Reuses the existing stack: Lightweight Charts (loaded lazily, client-only),
// the validated /api/chart/klines endpoint for history, lib/indicators for
// EMA, and the existing theme variables. Live candles come from an isolated
// per-chart Binance kline WebSocket (lib/klineStream.ts); the shared ticker
// stream is not touched. No drawings, saved layouts or persistence here.

import { useCallback, useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { useLanguage } from "@/lib/i18n";
import { formatPrice, priceDecimals } from "@/lib/binance";
import { calcEMA } from "@/lib/indicators";
import type { Candle, Interval } from "@/lib/marketDataTypes";
import { createKlineStream, type StreamStatus } from "@/lib/klineStream";
import {
  CHART_HISTORY_LIMIT,
  CHART_TIMEFRAMES,
  DEFAULT_CHART_INTERVAL,
  DEFAULT_CHART_SYMBOL,
  applyLiveKline,
  baseOfUsdtSymbol,
  errorKeyForCode,
  parseChartParams,
} from "@/lib/chartLive";
import ChartSymbolPicker from "@/components/charts/ChartSymbolPicker";

const EMA_PERIODS = [20, 50, 200] as const;
type EmaPeriod = (typeof EMA_PERIODS)[number];
const EMA_COLORS: Record<EmaPeriod, string> = { 20: "#60a5fa", 50: "", 200: "#c084fc" }; // 50 uses the theme gold

type LoadState = { status: "loading" } | { status: "ready"; stale: boolean } | { status: "error"; code: string };

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function themeColors() {
  return {
    bull: cssVar("--bull") || "#35c48a",
    bear: cssVar("--bear") || "#ef5350",
    text: cssVar("--text-muted") || "#939dac",
    line: cssVar("--line") || "#212a36",
    gold: cssVar("--gold") || "#d4af37",
  };
}
const toTime = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;

async function fetchCandles(symbol: string, interval: Interval): Promise<{ candles: Candle[]; stale: boolean }> {
  const base = baseOfUsdtSymbol(symbol);
  if (!base) throw Object.assign(new Error("bad symbol"), { code: "UNSUPPORTED_PAIR" });
  const params = new URLSearchParams({ symbol: base, quote: "USDT", interval, limit: String(CHART_HISTORY_LIMIT) });
  let res: Response;
  try {
    res = await fetch(`/api/chart/klines?${params.toString()}`);
  } catch {
    throw Object.assign(new Error("network"), { code: "NETWORK_ERROR" });
  }
  let data: { candles?: Candle[]; stale?: boolean; error?: string } | null = null;
  try {
    data = await res.json();
  } catch {
    /* handled below */
  }
  if (!res.ok || !data || !Array.isArray(data.candles)) {
    throw Object.assign(new Error("klines failed"), { code: data?.error || "UNKNOWN_ERROR" });
  }
  return { candles: data.candles, stale: !!data.stale };
}

export default function ChartWorkspace() {
  const { t } = useLanguage();

  const [ready, setReady] = useState(false); // URL params read (avoids a wasted default-symbol fetch)
  const [symbol, setSymbol] = useState(DEFAULT_CHART_SYMBOL);
  const [interval, setIntervalValue] = useState<Interval>(DEFAULT_CHART_INTERVAL);
  const [emaOn, setEmaOn] = useState<Record<EmaPeriod, boolean>>({ 20: true, 50: true, 200: false });
  const [chartReady, setChartReady] = useState(false);
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [dataKey, setDataKey] = useState<string | null>(null); // "BTCUSDT:1h" once history for it is on the chart
  const [liveStatus, setLiveStatus] = useState<StreamStatus>("connecting");
  const [lastCandle, setLastCandle] = useState<Candle | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const emaSeriesRef = useRef<Partial<Record<EmaPeriod, ISeriesApi<"Line">>>>({});
  const candlesRef = useRef<Candle[]>([]);
  const seqRef = useRef(0);
  const resyncingRef = useRef(false);
  const emaOnRef = useRef(emaOn);

  // Initial symbol/timeframe from ?symbol=&tf= (validated; anything else falls back to defaults).
  useEffect(() => {
    const p = parseChartParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the URL after mount (SSR cannot see it)
    setSymbol(p.symbol);
    setIntervalValue(p.interval);
    setReady(true);
  }, []);

  // Keep the URL shareable without adding history entries.
  useEffect(() => {
    if (!ready) return;
    const qs = `?symbol=${symbol}&tf=${interval}`;
    if (window.location.search !== qs) window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs}`);
  }, [ready, symbol, interval]);

  // Create the chart once. The library is imported lazily so /charts' first paint doesn't wait on it.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let observer: MutationObserver | null = null;

    import("lightweight-charts").then((lwc) => {
      if (cancelled || !containerRef.current) return;
      const c = themeColors();
      const chart = lwc.createChart(containerRef.current, {
        layout: { background: { color: "transparent" }, textColor: c.text },
        grid: { vertLines: { color: c.line }, horzLines: { color: c.line } },
        rightPriceScale: { borderColor: c.line },
        timeScale: { borderColor: c.line, timeVisible: true, secondsVisible: false },
        crosshair: { mode: lwc.CrosshairMode.Normal },
        autoSize: true,
      });
      const candles = chart.addSeries(lwc.CandlestickSeries, {
        upColor: c.bull,
        downColor: c.bear,
        borderVisible: false,
        wickUpColor: c.bull,
        wickDownColor: c.bear,
      });
      candles.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.28 } });
      const volume = chart.addSeries(lwc.HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "" });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });

      const lines: Partial<Record<EmaPeriod, ISeriesApi<"Line">>> = {};
      for (const p of EMA_PERIODS) {
        lines[p] = chart.addSeries(lwc.LineSeries, {
          color: EMA_COLORS[p] || c.gold,
          lineWidth: 1,
          visible: emaOnRef.current[p],
          priceLineVisible: false,
          lastValueVisible: false,
        });
      }

      chartRef.current = chart;
      candleSeriesRef.current = candles;
      volumeSeriesRef.current = volume;
      emaSeriesRef.current = lines;

      // Follow the light/dark toggle (the theme is a class on <html>).
      observer = new MutationObserver(() => {
        const n = themeColors();
        chart.applyOptions({
          layout: { textColor: n.text },
          grid: { vertLines: { color: n.line }, horzLines: { color: n.line } },
          rightPriceScale: { borderColor: n.line },
          timeScale: { borderColor: n.line },
        });
        candles.applyOptions({ upColor: n.bull, downColor: n.bear, wickUpColor: n.bull, wickDownColor: n.bear });
        lines[50]?.applyOptions({ color: n.gold });
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      setChartReady(true);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      emaSeriesRef.current = {};
      setChartReady(false);
    };
  }, []);

  // EMA visibility only — no refetch.
  useEffect(() => {
    emaOnRef.current = emaOn;
    for (const p of EMA_PERIODS) emaSeriesRef.current[p]?.applyOptions({ visible: emaOn[p] });
  }, [emaOn, chartReady]);

  /** Replaces every series' data from `candles` (initial load and resync only — never per live tick). */
  const paintAll = useCallback((candles: Candle[], fit: boolean) => {
    const colors = themeColors();
    const cs = candleSeriesRef.current;
    const vs = volumeSeriesRef.current;
    if (!cs || !vs) return;
    cs.setData(candles.map((c) => ({ time: toTime(c.openTime), open: c.open, high: c.high, low: c.low, close: c.close })));
    vs.setData(
      candles.map((c) => ({ time: toTime(c.openTime), value: c.volume, color: c.close >= c.open ? `${colors.bull}80` : `${colors.bear}80` }))
    );
    for (const p of EMA_PERIODS) {
      emaSeriesRef.current[p]?.setData(calcEMA(candles, p).map((pt) => ({ time: toTime(pt.time), value: pt.value })));
    }
    const lastClose = candles[candles.length - 1]?.close;
    if (lastClose) {
      const precision = priceDecimals(lastClose);
      cs.applyOptions({ priceFormat: { type: "price", precision, minMove: 1 / 10 ** precision } });
    }
    if (fit) chartRef.current?.timeScale().fitContent();
  }, []);

  // History: (re)load whenever the symbol or timeframe changes, or on retry. Stale responses are dropped by sequence number.
  useEffect(() => {
    if (!ready || !chartReady) return;
    const seq = ++seqRef.current;
    /* eslint-disable react-hooks/set-state-in-effect -- loading state must flip as soon as the pair/timeframe changes */
    setLoad({ status: "loading" });
    setDataKey(null);
    setLastCandle(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    candlesRef.current = [];
    candleSeriesRef.current?.setData([]);
    volumeSeriesRef.current?.setData([]);
    for (const p of EMA_PERIODS) emaSeriesRef.current[p]?.setData([]);

    fetchCandles(symbol, interval)
      .then(({ candles, stale }) => {
        if (seqRef.current !== seq) return;
        if (candles.length === 0) {
          setLoad({ status: "error", code: "NO_DATA" });
          return;
        }
        candlesRef.current = candles;
        paintAll(candles, true);
        setLastCandle(candles[candles.length - 1]);
        setLoad({ status: "ready", stale });
        setDataKey(`${symbol}:${interval}`);
      })
      .catch((err: { code?: string }) => {
        if (seqRef.current !== seq) return;
        setLoad({ status: "error", code: err?.code || "UNKNOWN_ERROR" });
      });
  }, [ready, chartReady, symbol, interval, reloadNonce, paintAll]);

  // Reload history once, in place, after a reconnect or a detected gap (no loading flash; keeps the user's zoom).
  // Takes the symbol/timeframe explicitly so its identity never changes — a changing callback would restart the live socket.
  const resync = useCallback(
    (sym: string, tf: Interval) => {
      if (resyncingRef.current) return;
      const seq = seqRef.current;
      resyncingRef.current = true;
      fetchCandles(sym, tf)
        .then(({ candles }) => {
          if (seqRef.current !== seq || candles.length === 0) return;
          candlesRef.current = candles;
          paintAll(candles, false);
          setLastCandle(candles[candles.length - 1]);
        })
        .catch(() => {})
        .finally(() => {
          resyncingRef.current = false;
        });
    },
    [paintAll]
  );

  // Live candles: one isolated kline socket for the symbol/timeframe whose history is on screen.
  useEffect(() => {
    if (!dataKey) return;
    const [sym, tf] = dataKey.split(":") as [string, Interval];
    const colors = themeColors();

    const stream = createKlineStream({
      symbol: sym,
      interval: tf,
      onStatus: setLiveStatus,
      onResync: () => resync(sym, tf),
      onKline: (k) => {
        const r = applyLiveKline(candlesRef.current, k, tf);
        if (r.kind === "stale") return;
        if (r.kind === "gap") {
          resync(sym, tf);
          return;
        }
        candlesRef.current = r.candles;
        const time = toTime(r.candle.openTime);
        try {
          candleSeriesRef.current?.update({ time, open: r.candle.open, high: r.candle.high, low: r.candle.low, close: r.candle.close });
          volumeSeriesRef.current?.update({
            time,
            value: r.candle.volume,
            color: r.candle.close >= r.candle.open ? `${colors.bull}80` : `${colors.bear}80`,
          });
          for (const p of EMA_PERIODS) {
            const pts = calcEMA(r.candles, p);
            const lastPt = pts[pts.length - 1];
            if (lastPt && toTime(lastPt.time) === time) emaSeriesRef.current[p]?.update({ time, value: lastPt.value });
          }
        } catch {
          resync(sym, tf); // the chart rejected an out-of-order point: rebuild from history instead of drifting
        }
        setLastCandle(r.candle);
      },
    });

    const wake = () => {
      if (document.visibilityState === "visible") stream.kick();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      stream.close();
    };
  }, [dataKey, resync]);

  const base = baseOfUsdtSymbol(symbol) ?? symbol;
  const tfLabel = CHART_TIMEFRAMES.find((x) => x.value === interval)?.label ?? interval;
  const up = lastCandle ? lastCandle.close >= lastCandle.open : true;
  const liveLabel =
    load.status !== "ready"
      ? null
      : liveStatus === "live"
        ? t("charts.live")
        : liveStatus === "reconnecting"
          ? t("charts.reconnecting")
          : t("charts.connecting");
  const pill = (active: boolean) =>
    `px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md border text-sm font-medium transition-colors ${active ? "border-gold text-gold bg-gold/15" : "border-line text-text-muted hover:text-text"}`;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-widest text-gold">{t("charts.eyebrow")}</p>
          <h1 className="font-heading text-xl sm:text-2xl font-semibold mt-0.5">{t("charts.title")}</h1>
          <p className="hidden sm:block text-text-muted text-sm mt-1 max-w-2xl">{t("charts.subtitle")}</p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:gap-4 sm:grid-cols-[minmax(0,18rem)_1fr] items-start">
        <ChartSymbolPicker value={symbol} onChange={setSymbol} />
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2 sm:justify-end">
          <div>
            <p className="text-xs text-text-muted">{t("charts.timeframeLabel")}</p>
            <div className="mt-1.5 flex gap-1.5" role="group" aria-label={t("charts.timeframeLabel")}>
              {CHART_TIMEFRAMES.map((tf) => (
                <button key={tf.value} type="button" className={pill(interval === tf.value)} aria-pressed={interval === tf.value} onClick={() => setIntervalValue(tf.value)}>
                  {tf.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-text-muted">{t("charts.indicatorsLabel")}</p>
            <div className="mt-1.5 flex gap-1.5" role="group" aria-label={t("charts.indicatorsLabel")}>
              {EMA_PERIODS.map((p) => (
                <button key={p} type="button" className={pill(emaOn[p])} aria-pressed={emaOn[p]} onClick={() => setEmaOn((prev) => ({ ...prev, [p]: !prev[p] }))}>
                  EMA {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <section className="mt-3 rounded-xl border border-line bg-surface overflow-hidden" aria-label={`${base}/USDT ${tfLabel}`}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 border-b border-line">
          <h2 className="font-data text-base sm:text-lg font-semibold">
            {base}/USDT <span className="text-text-muted font-normal">· {tfLabel}</span>
          </h2>
          <span className="text-xs text-text-muted">Binance Spot</span>
          {lastCandle && (
            <span className={`font-data text-sm sm:text-base ${up ? "text-bull" : "text-bear"}`}>${formatPrice(lastCandle.close)}</span>
          )}
          {load.status === "ready" && load.stale && (
            <span className="text-[11px] px-2 py-0.5 rounded border border-gold/40 text-gold">{t("charts.stale")}</span>
          )}
          {liveLabel && (
            <span className="ms-auto inline-flex items-center gap-1.5 text-xs text-text-muted" role="status">
              <span className={`inline-block h-2 w-2 rounded-full ${liveStatus === "live" ? "bg-bull" : "bg-gold"}`} aria-hidden="true" />
              {liveLabel}
            </span>
          )}
        </div>

        <div className="relative h-[70dvh] min-h-[340px] sm:h-[calc(100dvh-19rem)] sm:min-h-[460px]" dir="ltr">
          <div ref={containerRef} className="absolute inset-0" />
          {load.status === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-text-muted bg-surface/60" role="status">
              {t("charts.loading")}
            </div>
          )}
          {load.status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center bg-surface" role="alert">
              <p className="text-sm sm:text-base max-w-md">
                {load.code === "NO_DATA" ? t("charts.err.noData") : t(`charts.err.${errorKeyForCode(load.code)}`)}
              </p>
              {errorKeyForCode(load.code) !== "unsupportedPair" && load.code !== "NO_DATA" && (
                <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={() => setReloadNonce((n) => n + 1)}>
                  {t("charts.retry")}
                </button>
              )}
            </div>
          )}
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
