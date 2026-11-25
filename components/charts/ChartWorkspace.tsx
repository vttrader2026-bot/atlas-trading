"use client";

// ATLAS CHARTS — standalone chart workspace (/charts).
//
// Phase 1: lazy Lightweight Charts, history from /api/chart/klines, an
// isolated live kline WebSocket per symbol/timeframe, EMA overlays.
// Phase 2: top toolbar, drawing toolbar with undo/redo, volume pane,
// chart settings, indicators menu, OHLC legend, monthly timeframe.
//
// Drawings, history and selection are in-memory for this open chart only:
// nothing is persisted yet (Phase 4). Appearance settings are a per-viewer
// preference (lib/chartSettings), not part of any drawing or layout.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { useLanguage } from "@/lib/i18n";
import { formatPrice, priceDecimals } from "@/lib/binance";
import { calcEMA } from "@/lib/indicators";
import type { Candle, ChartInterval } from "@/lib/marketDataTypes";
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
import { formatDuration, measure, type Drawing, type Tool } from "@/lib/chartDrawings";
import { canRedo, canUndo, commit, createHistory, redo, undo, type History } from "@/lib/chartHistory";
import { DEFAULT_INDICATORS, INDICATORS, canToggle, type IndicatorId } from "@/lib/chartIndicators";
import {
  DEFAULT_SETTINGS,
  candleColors,
  candleOptionsFor,
  chartOptionsFor,
  clearSettings,
  loadSettings,
  saveSettings,
  withAlpha,
  type ChartSettings,
  type ThemeColors,
} from "@/lib/chartSettings";
import { ZOOM_STEP, zoomRange } from "@/lib/chartViewport";
import { DrawingsPrimitive } from "@/components/charts/drawingsPrimitive";
import { DrawingController } from "@/components/charts/drawing/DrawingController";
import ChartSymbolPicker from "@/components/charts/ChartSymbolPicker";
import ChartToolbar from "@/components/charts/workspace/ChartToolbar";
import DrawingToolbar from "@/components/charts/workspace/DrawingToolbar";
import OhlcLegend from "@/components/charts/workspace/OhlcLegend";
import { Icons } from "@/components/charts/workspace/icons";

const EMA_DEFS = INDICATORS.filter((i) => i.period !== undefined) as (typeof INDICATORS[number] & { period: number })[];
const EMA_COLORS: Record<number, string> = { 20: "#60a5fa", 50: "", 200: "#c084fc" }; // 50 uses the theme gold

type LoadState = { status: "loading" } | { status: "ready"; stale: boolean } | { status: "error"; code: string };
type TextRequest = { x: number; y: number; at: { time: number; price: number }; editId?: string; text?: string };

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function themeColors(): ThemeColors & { gold: string; textStrong: string } {
  return {
    bull: cssVar("--bull") || "#35c48a",
    bear: cssVar("--bear") || "#ef5350",
    text: cssVar("--text-muted") || "#939dac",
    textStrong: cssVar("--text") || "#e6e8eb",
    line: cssVar("--line") || "#212a36",
    gold: cssVar("--gold") || "#d4af37",
    bg: cssVar("--bg") || "#0b0f14",
    surface: cssVar("--surface") || "#11151c",
  };
}
const toTime = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;

async function fetchCandles(symbol: string, interval: ChartInterval): Promise<{ candles: Candle[]; stale: boolean }> {
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
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const [ready, setReady] = useState(false); // URL params + saved settings read
  const [symbol, setSymbol] = useState(DEFAULT_CHART_SYMBOL);
  const [interval, setIntervalValue] = useState<ChartInterval>(DEFAULT_CHART_INTERVAL);
  const [indicators, setIndicators] = useState<Record<IndicatorId, boolean>>(DEFAULT_INDICATORS);
  const [settings, setSettings] = useState<ChartSettings>(DEFAULT_SETTINGS);
  const [chartReady, setChartReady] = useState(false);
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [dataKey, setDataKey] = useState<string | null>(null); // "BTCUSDT:1h" once history for it is on the chart
  const [liveStatus, setLiveStatus] = useState<StreamStatus>("connecting");
  const [lastCandle, setLastCandle] = useState<Candle | null>(null);
  const [hoverCandle, setHoverCandle] = useState<Candle | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Drawing session state (in memory only)
  const [history, setHistory] = useState<History<Drawing[]>>(() => createHistory<Drawing[]>([]));
  const [tool, setToolState] = useState<Tool>("cursor");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [magnet, setMagnet] = useState(false);
  const [locked, setLocked] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [textReq, setTextReq] = useState<TextRequest | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lwcRef = useRef<typeof import("lightweight-charts") | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const emaSeriesRef = useRef<Record<number, ISeriesApi<"Line">>>({});
  const primitiveRef = useRef<DrawingsPrimitive | null>(null);
  const controllerRef = useRef<DrawingController | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const seqRef = useRef(0);
  const resyncingRef = useRef(false);
  const indicatorsRef = useRef(indicators);
  const settingsRef = useRef(settings);
  const hoverTimeRef = useRef<number | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial symbol/timeframe from ?symbol=&tf= (validated) and saved appearance settings.
  useEffect(() => {
    const p = parseChartParams(window.location.search);
    /* eslint-disable react-hooks/set-state-in-effect -- one-time read of URL/storage after mount (SSR cannot see them) */
    setSymbol(p.symbol);
    setIntervalValue(p.interval);
    setSettings(loadSettings());
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Keep the URL shareable without adding history entries.
  useEffect(() => {
    if (!ready) return;
    const qs = `?symbol=${symbol}&tf=${interval}`;
    if (window.location.search !== qs) window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs}`);
  }, [ready, symbol, interval]);

  const showNotice = useCallback((code: string) => {
    setNotice(code);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  }, []);

  // ---- appearance (settings + theme) -> chart options
  const applyAppearance = useCallback(() => {
    const chart = chartRef.current;
    const candles = candleSeriesRef.current;
    const lwc = lwcRef.current;
    if (!chart || !candles || !lwc) return;
    const s = settingsRef.current;
    const theme = themeColors();
    chart.applyOptions(chartOptionsFor(s, theme));
    candles.applyOptions(candleOptionsFor(s, theme));
    for (const e of EMA_DEFS) emaSeriesRef.current[e.period]?.applyOptions({ color: EMA_COLORS[e.period] || theme.gold });

    // Volume lives in its own pane below the price pane; the setting adds or removes that pane.
    if (s.volume && !volumeSeriesRef.current) {
      volumeSeriesRef.current = chart.addSeries(lwc.HistogramSeries, { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false }, 1);
    } else if (!s.volume && volumeSeriesRef.current) {
      chart.removeSeries(volumeSeriesRef.current);
      volumeSeriesRef.current = null;
      if (chart.panes().length > 1) chart.removePane(1);
    }
    const panes = chart.panes();
    panes[0]?.setStretchFactor(4);
    panes[1]?.setStretchFactor(1);
    volumeSeriesRef.current?.priceScale().applyOptions({ visible: s.priceScale, borderColor: theme.line, scaleMargins: { top: 0.12, bottom: 0 } });
    volumeSeriesRef.current?.setData(
      candlesRef.current.map((c) => ({ time: toTime(c.openTime), value: c.volume, color: withAlpha(c.close >= c.open ? candleColors(s, theme).up : candleColors(s, theme).down) }))
    );
    primitiveRef.current?.setState({ colors: { accent: theme.gold, text: theme.textStrong, surface: theme.surface, bull: theme.bull, bear: theme.bear } });
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
    if (chartReady) applyAppearance();
  }, [settings, chartReady, applyAppearance]);

  const updateSettings = useCallback((patch: Partial<ChartSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);
  const resetSettings = useCallback(() => {
    clearSettings();
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  // ---- chart creation (once). The library is imported lazily so first paint doesn't wait on it.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let observer: MutationObserver | null = null;
    let cleanupChart: (() => void) | null = null;

    import("lightweight-charts").then((lwc) => {
      if (cancelled || !containerRef.current) return;
      lwcRef.current = lwc;
      const s = settingsRef.current;
      const theme = themeColors();
      const chart = lwc.createChart(containerRef.current, { ...chartOptionsFor(s, theme), autoSize: true });
      const candles = chart.addSeries(lwc.CandlestickSeries, { ...candleOptionsFor(s, theme) }, 0);
      candles.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.06 } });

      const lines: Record<number, ISeriesApi<"Line">> = {};
      for (const e of EMA_DEFS) {
        lines[e.period] = chart.addSeries(
          lwc.LineSeries,
          { color: EMA_COLORS[e.period] || theme.gold, lineWidth: 1, visible: indicatorsRef.current[e.id], priceLineVisible: false, lastValueVisible: false },
          0
        );
      }

      const primitive = new DrawingsPrimitive();
      candles.attachPrimitive(primitive);

      chartRef.current = chart;
      candleSeriesRef.current = candles;
      emaSeriesRef.current = lines;
      primitiveRef.current = primitive;

      const measureLines = (m: { a: { time: number; price: number }; b: { time: number; price: number } }) => {
        const times = candlesRef.current.map((c) => Math.floor(c.openTime / 1000));
        const r = measure(m.a, m.b, times);
        const sign = r.dPrice >= 0 ? "+" : "−";
        return [
          `${sign}${formatPrice(Math.abs(r.dPrice))} (${sign}${Math.abs(r.pct).toFixed(2)}%)`,
          `${Math.abs(r.bars)} ${tRef.current("charts.measureBars")} · ${formatDuration(r.seconds)}`,
        ];
      };

      const controller = new DrawingController({
        container: containerRef.current,
        chart,
        primitive,
        getCandles: () => candlesRef.current,
        host: {
          onLive: (list) => primitive.setState({ drawings: list }),
          onCommit: (list) => setHistory((h) => commit(h, list)),
          onSelect: (id) => {
            setSelectedId(id);
            primitive.setState({ selectedId: id });
          },
          onTool: (next) => {
            setToolState(next);
            controllerRef.current?.syncTool(next);
          },
          onDraft: (d) => primitive.setState({ draft: d }),
          onMeasure: (m) => primitive.setState({ measure: m ? { a: m.a, b: m.b, lines: measureLines(m) } : null }),
          onRequestText: (req) => setTextReq(req),
          onNotice: (code) => showNotice(code),
        },
      });
      controllerRef.current = controller;

      // OHLC legend follows the crosshair; leaving the chart falls back to the latest candle.
      const onCrosshair = (param: { time?: unknown }) => {
        const time = typeof param.time === "number" ? param.time : null;
        if (time === hoverTimeRef.current) return;
        hoverTimeRef.current = time;
        if (time === null) return setHoverCandle(null);
        const arr = candlesRef.current;
        let lo = 0;
        let hi = arr.length - 1;
        let found: Candle | null = null;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const ct = Math.floor(arr[mid].openTime / 1000);
          if (ct === time) {
            found = arr[mid];
            break;
          }
          if (ct < time) lo = mid + 1;
          else hi = mid - 1;
        }
        setHoverCandle(found);
      };
      chart.subscribeCrosshairMove(onCrosshair);

      // Follow the light/dark toggle (the theme is a class on <html>).
      observer = new MutationObserver(() => applyAppearance());
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

      cleanupChart = () => {
        chart.unsubscribeCrosshairMove(onCrosshair);
        controller.destroy();
        candles.detachPrimitive(primitive);
      };
      setChartReady(true);
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      cleanupChart?.();
      controllerRef.current = null;
      primitiveRef.current = null;
      chartRef.current?.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      emaSeriesRef.current = {};
      setChartReady(false);
    };
  }, [showNotice, applyAppearance]);

  // ---- indicators: visibility only, no refetch
  useEffect(() => {
    indicatorsRef.current = indicators;
    for (const e of EMA_DEFS) emaSeriesRef.current[e.period]?.applyOptions({ visible: indicators[e.id] });
  }, [indicators, chartReady]);
  const toggleIndicator = useCallback((id: IndicatorId) => {
    if (!canToggle(id)) return;
    setIndicators((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // ---- drawing session -> primitive / engine
  useEffect(() => {
    primitiveRef.current?.setState({ drawings: history.present });
    controllerRef.current?.engine.setDrawings(history.present);
  }, [history.present, chartReady]);
  useEffect(() => {
    controllerRef.current?.engine.setMagnet(magnet);
  }, [magnet, chartReady]);
  useEffect(() => {
    controllerRef.current?.engine.setLocked(locked);
  }, [locked, chartReady]);
  useEffect(() => {
    controllerRef.current?.engine.setHidden(hidden);
    primitiveRef.current?.setState({ hidden });
  }, [hidden, chartReady]);

  const selectTool = useCallback((next: Tool) => {
    const engine = controllerRef.current?.engine;
    if (!engine) return;
    if (next !== "cursor" && hidden) {
      setHidden(false);
      engine.setHidden(false); // drawing while drawings are hidden would be invisible
    }
    engine.setTool(engine.getTool() === next && next !== "cursor" ? "cursor" : next);
  }, [hidden]);

  const doUndo = useCallback(() => setHistory((h) => undo(h)), []);
  const doRedo = useCallback(() => setHistory((h) => redo(h)), []);
  const clearAll = useCallback(() => setHistory((h) => commit(h, [])), []);
  const deleteSelected = useCallback(() => {
    controllerRef.current?.engine.deleteSelected();
  }, []);

  // Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y (not while typing in a field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        doUndo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        doRedo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doUndo, doRedo]);

  // Symbol change: drawings are priced for one pair, so the session (drawings + undo history) starts fresh.
  const changeSymbol = useCallback(
    (next: string) => {
      if (next === symbol) return;
      setSymbol(next);
      setHistory(createHistory<Drawing[]>([]));
      controllerRef.current?.engine.setTool("cursor");
    },
    [symbol]
  );

  // ---- candles on screen
  /** Replaces every series' data from `candles` (initial load and resync only — never per live tick). */
  const paintAll = useCallback((candles: Candle[], fit: boolean) => {
    const theme = themeColors();
    const s = settingsRef.current;
    const colors = candleColors(s, theme);
    const cs = candleSeriesRef.current;
    if (!cs) return;
    cs.setData(candles.map((c) => ({ time: toTime(c.openTime), open: c.open, high: c.high, low: c.low, close: c.close })));
    volumeSeriesRef.current?.setData(candles.map((c) => ({ time: toTime(c.openTime), value: c.volume, color: withAlpha(c.close >= c.open ? colors.up : colors.down) })));
    for (const e of EMA_DEFS) {
      emaSeriesRef.current[e.period]?.setData(calcEMA(candles, e.period).map((pt) => ({ time: toTime(pt.time), value: pt.value })));
    }
    primitiveRef.current?.setState({ times: candles.map((c) => Math.floor(c.openTime / 1000)) });
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
    setHoverCandle(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    hoverTimeRef.current = null;
    candlesRef.current = [];
    candleSeriesRef.current?.setData([]);
    volumeSeriesRef.current?.setData([]);
    for (const e of EMA_DEFS) emaSeriesRef.current[e.period]?.setData([]);
    primitiveRef.current?.setState({ times: [], draft: null, measure: null });

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
    (sym: string, tf: ChartInterval) => {
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
    const [sym, tf] = dataKey.split(":") as [string, ChartInterval];

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
        const colors = candleColors(settingsRef.current, themeColors());
        try {
          candleSeriesRef.current?.update({ time, open: r.candle.open, high: r.candle.high, low: r.candle.low, close: r.candle.close });
          volumeSeriesRef.current?.update({ time, value: r.candle.volume, color: withAlpha(r.candle.close >= r.candle.open ? colors.up : colors.down) });
          for (const e of EMA_DEFS) {
            const pts = calcEMA(r.candles, e.period);
            const lastPt = pts[pts.length - 1];
            if (lastPt && toTime(lastPt.time) === time) emaSeriesRef.current[e.period]?.update({ time, value: lastPt.value });
          }
          if (r.kind === "append") primitiveRef.current?.setState({ times: r.candles.map((c) => Math.floor(c.openTime / 1000)) });
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

  // ---- zoom buttons
  const zoom = useCallback((factor: number) => {
    const ts = chartRef.current?.timeScale();
    const r = ts?.getVisibleLogicalRange();
    if (ts && r) ts.setVisibleLogicalRange(zoomRange({ from: r.from as number, to: r.to as number }, factor));
  }, []);

  // ---- text editor
  const submitText = (value: string) => {
    const engine = controllerRef.current?.engine;
    const req = textReq;
    setTextReq(null);
    if (!engine || !req) return;
    if (req.editId) engine.updateText(req.editId, value);
    else engine.addText(req.at, value);
  };
  const cancelText = () => {
    setTextReq(null);
    controllerRef.current?.engine.cancelText();
  };

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
  const selectedDrawing = useMemo(() => history.present.find((d) => d.id === selectedId) ?? null, [history.present, selectedId]);
  const canDelete = !!selectedDrawing && !locked;

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
          canUndo={canUndo(history)}
          canRedo={canRedo(history)}
          onUndo={doUndo}
          onRedo={doRedo}
          indicators={indicators}
          onIndicator={toggleIndicator}
          settings={settings}
          onSettings={updateSettings}
          onResetSettings={resetSettings}
        />

        <div className="flex flex-col sm:flex-row">
          <DrawingToolbar
            tool={tool}
            onTool={selectTool}
            magnet={magnet}
            onMagnet={() => setMagnet((m) => !m)}
            locked={locked}
            onLock={() => setLocked((l) => !l)}
            hidden={hidden}
            onHidden={() => setHidden((h) => !h)}
            onZoomIn={() => zoom(ZOOM_STEP)}
            onZoomOut={() => zoom(1 / ZOOM_STEP)}
            onZoomReset={() => chartRef.current?.timeScale().fitContent()}
            canDelete={canDelete}
            onDelete={deleteSelected}
            drawingCount={history.present.length}
            onClear={clearAll}
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-b border-line">
              <h2 className="font-data text-base sm:text-lg font-semibold">
                {base}/USDT <span className="text-text-muted font-normal">· {tfLabel}</span>
              </h2>
              <span className="text-xs text-text-muted">Binance Spot</span>
              {lastCandle && <span className={`font-data text-sm sm:text-base ${up ? "text-bull" : "text-bear"}`}>${formatPrice(lastCandle.close)}</span>}
              {load.status === "ready" && load.stale && <span className="text-[11px] px-2 py-0.5 rounded border border-gold/40 text-gold">{t("charts.stale")}</span>}
              {selectedDrawing?.kind === "text" && !locked && (
                <button type="button" className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-xs text-text-muted hover:text-text" onClick={() => controllerRef.current?.engine.requestEditSelected()}>
                  {Icons.edit}
                  {t("charts.editText")}
                </button>
              )}
              {notice && (
                <span className="text-xs text-gold" role="status">
                  {t(`charts.notice.${notice}`)}
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
                    <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={() => setReloadNonce((n) => n + 1)}>
                      {t("charts.retry")}
                    </button>
                  )}
                </div>
              )}
              {textReq && (
                <form
                  className="absolute z-30 flex gap-1 rounded-md border border-gold bg-surface p-1.5 shadow-lg"
                  style={{ left: Math.max(4, Math.min(textReq.x, 9999)), top: Math.max(4, textReq.y - 20) }}
                  dir="auto"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitText(new FormData(e.currentTarget).get("note")?.toString() ?? "");
                  }}
                >
                  <input
                    name="note"
                    autoFocus
                    maxLength={80}
                    defaultValue={textReq.text ?? ""}
                    placeholder={t("charts.textPlaceholder")}
                    className="input h-9 w-44 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        cancelText();
                      }
                    }}
                  />
                  <button type="submit" className="rounded bg-gold px-3 text-sm font-medium text-bg">
                    {textReq.editId ? t("charts.textSaveEdit") : t("charts.textSave")}
                  </button>
                  <button type="button" className="rounded border border-line px-2 text-sm" onClick={cancelText} aria-label={t("charts.cancel")}>
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
