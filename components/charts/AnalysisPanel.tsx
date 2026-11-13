"use client";

// ATLAS ANALYSIS PANEL — Phase 5: the mobile-first "open chart" experience
// embedded in Radar and Market Pulse. Owns candle fetching (with
// stale-request cancellation on symbol/timeframe switches), the timeframe
// and indicator controls, the fullscreen/expanded layout, and the inline
// "Analyze with Atlas AI" call — all without navigating away from the host
// page.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import type { Candle, Interval } from "@/lib/marketDataTypes";
import { SUPPORTED_INTERVALS } from "@/lib/marketDataTypes";
import { useLanguage } from "@/lib/i18n";
import AnalysisResult from "@/components/analyzer/AnalysisResult";
import type { AnalysisData } from "@/components/analyzer/types";
import AnalysisChart, { DEFAULT_TOGGLES, type IndicatorToggles } from "@/components/charts/AnalysisChart";
import SmartActions from "@/components/SmartActions";
import { recordAnalysis } from "@/lib/analysisHistory";
import { addDrawing, removeDrawing, type Drawing, type DrawingDraft, type Tool } from "@/lib/chartDrawings";

type Analysis = AnalysisData;

type KlinesState =
  | { status: "loading" }
  | { status: "ready"; candles: Candle[]; stale: boolean }
  | { status: "unavailable"; code: string };

export default function AnalysisPanel({
  baseAsset,
  quoteAsset = "USDT",
  onClose,
}: {
  baseAsset: string;
  quoteAsset?: string;
  onClose: () => void;
}) {
  const { t, lang } = useLanguage();
  const { isSignedIn } = useAuth();

  const [interval, setInterval_] = useState<Interval>("1h");
  const [toggles, setToggles] = useState<IndicatorToggles>(DEFAULT_TOGGLES);
  const [fullscreen, setFullscreen] = useState(false);
  const [analyzedAt, setAnalyzedAt] = useState(0);
  const [klines, setKlines] = useState<KlinesState>({ status: "loading" });
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  // Basic drawing tools. Kept here (not in the chart) so drawings survive the chart
  // being rebuilt on a timeframe change. In memory only: closing the panel clears them.
  const [tool, setTool] = useState<Tool>("cursor");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const drawingSeq = useRef(0);

  const createDrawing = useCallback((draft: DrawingDraft) => {
    const id = `d${++drawingSeq.current}`;
    setDrawings((prev) => addDrawing(prev, { ...draft, id }));
    setSelectedId(id);
    setTool("cursor");
  }, []);
  const deleteSelected = useCallback(() => {
    setDrawings((prev) => removeDrawing(prev, selectedId));
    setSelectedId(null);
  }, [selectedId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) {
          e.preventDefault();
          deleteSelected();
        }
      } else if (e.key === "Escape") {
        setTool("cursor");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, deleteSelected]);

  // Load candles whenever the pair or timeframe changes. Stale in-flight
  // requests are ignored by id, so switching timeframes quickly never lets
  // an older response overwrite a newer one (never stale data under a
  // different coin/timeframe label).
  useEffect(() => {
    const thisRequest = ++requestIdRef.current;
    // Pre-existing pattern: the loading state must flip as soon as the pair/timeframe changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKlines({ status: "loading" });
    setAnalysis(null);
    setAnalyzeError(null);

    const params = new URLSearchParams({ symbol: baseAsset, quote: quoteAsset, interval, limit: "300" });
    fetch(`/api/chart/klines?${params.toString()}`)
      .then(async (res) => {
        if (requestIdRef.current !== thisRequest) return;
        const data = await res.json();
        if (!res.ok) {
          setKlines({ status: "unavailable", code: data?.error || "UNKNOWN_ERROR" });
          return;
        }
        setKlines({ status: "ready", candles: data.candles, stale: !!data.stale });
      })
      .catch(() => {
        if (requestIdRef.current !== thisRequest) return;
        setKlines({ status: "unavailable", code: "NETWORK_ERROR" });
      });
  }, [baseAsset, quoteAsset, interval]);

  const toggle = useCallback((key: keyof IndicatorToggles) => {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  async function runAnalysis() {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const res = await fetch("/api/analyze-chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseAsset, quoteAsset, interval, lang }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAnalyzeError(data?.error || t("chart.analyzeError"));
        return;
      }
      recordAnalysis(data); // Workflow "Analyze" progress; saves nothing for a malformed response
      setAnalyzedAt(Date.now());
      setAnalysis(data as Analysis);
    } catch {
      setAnalyzeError(t("chart.analyzeError"));
    } finally {
      setAnalyzing(false);
    }
  }

  const lastCandle =
    klines.status === "ready" && klines.candles.length > 0 ? klines.candles[klines.candles.length - 1] : null;

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 bg-bg overflow-y-auto"
          : "fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      }
      onClick={fullscreen ? undefined : (e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={
          fullscreen
            ? "w-full min-h-full p-4 sm:p-6"
            : "w-full sm:max-w-3xl max-h-[92dvh] overflow-y-auto bg-surface border border-line rounded-t-2xl sm:rounded-2xl p-4 sm:p-6"
        }
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-data text-base font-semibold">{baseAsset}/{quoteAsset}</span>
            {lastCandle && (
              <span className="font-data text-sm text-text-muted">${formatPrice(lastCandle.close)}</span>
            )}
            {klines.status === "ready" && klines.stale && (
              <span className="text-[11px] px-2 py-0.5 rounded border border-gold/40 text-gold">
                {t("chart.staleWarning")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFullscreen((v) => !v)}
              className="px-2.5 py-1.5 rounded-md border border-line text-xs text-text-muted hover:text-text transition-colors"
              aria-label={t("chart.expand")}
            >
              {fullscreen ? "⤢" : "⤡"}
            </button>
            <button
              onClick={onClose}
              className="px-2.5 py-1.5 rounded-md border border-line text-xs text-text-muted hover:text-text transition-colors"
              aria-label={t("chart.close")}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Timeframe switcher — horizontally scrollable on narrow screens */}
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {SUPPORTED_INTERVALS.map((iv) => (
            <button
              key={iv}
              onClick={() => setInterval_(iv)}
              className={`shrink-0 px-3 py-1.5 rounded-md text-xs border transition-colors ${
                interval === iv ? "border-gold text-gold bg-gold/10" : "border-line text-text-muted hover:text-text"
              }`}
            >
              {iv.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Indicator toggles — compact, wraps/scrolls on mobile */}
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {(
            [
              ["ema20", "EMA 20"],
              ["ema50", "EMA 50"],
              ["ema200", "EMA 200"],
              ["rsi", "RSI"],
              ["macd", "MACD"],
            ] as [keyof IndicatorToggles, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => toggle(key)}
              className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] border transition-colors font-data ${
                toggles[key] ? "border-gold text-gold bg-gold/10" : "border-line text-text-muted hover:text-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Drawing tools — horizontally scrollable on narrow screens */}
        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="toolbar" aria-label={t("chart.draw.toolbar")}>
          {(
            [
              ["cursor", "chart.draw.cursor", <path key="c" d="M5 3l14 7-6 2-2 6L5 3z" />],
              ["hline", "chart.draw.hline", <path key="h" d="M3 12h18M3 12h0M21 12h0" />],
              ["trend", "chart.draw.trend", <g key="t"><path d="M5 18L19 6" /><circle cx="5" cy="18" r="1.6" /><circle cx="19" cy="6" r="1.6" /></g>],
              ["rect", "chart.draw.rect", <rect key="r" x="4" y="7" width="16" height="10" rx="1" />],
            ] as [Tool, string, React.ReactNode][]
          ).map(([key, label, icon]) => (
            <button
              key={key}
              type="button"
              data-tool={key}
              aria-pressed={tool === key}
              aria-label={t(label)}
              title={t(label)}
              onClick={() => setTool(key)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] border transition-colors ${
                tool === key ? "border-gold text-gold bg-gold/10" : "border-line text-text-muted hover:text-text"
              }`}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg>
              <span className="hidden sm:inline">{t(label)}</span>
            </button>
          ))}
          <button
            type="button"
            data-tool="delete"
            onClick={deleteSelected}
            disabled={!selectedId}
            aria-label={t("chart.draw.delete")}
            title={t("chart.draw.delete")}
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] border border-line text-text-muted hover:text-bear transition-colors disabled:opacity-40 disabled:hover:text-text-muted"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" /></svg>
            <span className="hidden sm:inline">{t("chart.draw.delete")}</span>
          </button>
        </div>

        {/* Chart */}
        <div className="relative mt-3 rounded-lg border border-line overflow-hidden">
          {/* Overlay (not in the flow) so choosing a tool never shifts the chart. */}
          {tool !== "cursor" && (
            <p role="status" className="pointer-events-none absolute start-2 top-2 z-10 max-w-[80%] rounded bg-surface/85 px-2 py-1 text-[11px] leading-snug text-gold">
              {tool === "hline" ? t("chart.draw.hintHline") : tool === "rect" ? t("chart.draw.hintRect") : t("chart.draw.hintTrend")}
            </p>
          )}
          {klines.status === "loading" && (
            <div className="h-[320px] sm:h-[420px] flex items-center justify-center text-sm text-text-muted">
              {t("chart.loading")}
            </div>
          )}
          {klines.status === "unavailable" && (
            <div className="h-[320px] sm:h-[420px] flex items-center justify-center text-sm text-text-muted px-6 text-center">
              {t("chart.unavailable")}
            </div>
          )}
          {klines.status === "ready" && (
            <AnalysisChart
              candles={klines.candles}
              toggles={toggles}
              fullscreen={fullscreen}
              tool={tool}
              drawings={drawings}
              selectedId={selectedId}
              onCreate={createDrawing}
              onSelect={setSelectedId}
            />
          )}
        </div>

        {/* Analyze with Atlas AI */}
        <div className="mt-4">
          {!isSignedIn ? (
            <div className="rounded-xl border border-line p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{t("chart.authGate.title")}</div>
                <p className="text-xs text-text-muted mt-1 max-w-md">{t("chart.authGate.body")}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href="/sign-in"
                  className="px-3 py-1.5 rounded-md border border-line text-sm text-text-muted hover:text-text transition-colors whitespace-nowrap"
                >
                  {t("chart.authGate.signIn")}
                </Link>
                <Link href="/sign-up" className="btn-primary whitespace-nowrap text-sm">
                  {t("chart.authGate.signUp")}
                </Link>
              </div>
            </div>
          ) : (
            <button
              onClick={runAnalysis}
              disabled={analyzing || klines.status !== "ready"}
              className="btn-primary w-full sm:w-auto disabled:opacity-50"
            >
              {analyzing ? t("chart.analyzing") : t("chart.analyzeWithAi")}
            </button>
          )}
          {analyzeError && <p className="mt-2 text-sm text-bear">{analyzeError}</p>}
        </div>

        {analysis && <AnalysisResult data={analysis} analyzedAt={analyzedAt} />}

        <SmartActions base={baseAsset} analyzed={!!analysis} />
      </div>
    </div>
  );
}

function formatPrice(n: number): string {
  const decimals = n < 1 ? 6 : n < 100 ? 4 : 2;
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
