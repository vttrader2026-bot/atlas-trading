"use client";

// ATLAS ANALYSIS PANEL — Phase 5: the mobile-first "open chart" experience
// embedded in Radar and Market Intelligence. Owns candle fetching (with
// stale-request cancellation on symbol/timeframe switches), the timeframe
// and indicator controls, the fullscreen/expanded layout, and the inline
// "Analyze with Atlas AI" call — all without navigating away from the host
// page.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import type { Candle, Interval } from "@/lib/marketDataTypes";
import { SUPPORTED_INTERVALS } from "@/lib/marketDataTypes";
import { useLanguage } from "@/lib/i18n";
import { saveDraft, firstNumber, type TradePlanDraft } from "@/lib/tradePlan";
import AnalysisChart, { DEFAULT_TOGGLES, type IndicatorToggles } from "@/components/charts/AnalysisChart";

type Level = { label: string; price: string };
type Scenario = { confirmation: string; targets: string[]; why: string } | null;
type Analysis = {
  pair: string;
  timeframe: string;
  marketStructure: { state: string; explanation: string };
  trend: { direction: string; strength: string; explanation: string };
  momentum: string;
  keyLevels: Level[];
  currentCondition: { label: string; explanation: string };
  bullishScenario: Scenario;
  bearishScenario: Scenario;
  whatToWatch: string[];
  noClearSetup: string | null;
  invalidation: { level: string; explanation: string };
  tradePlan: { direction: string; entryZone: string; invalidation: string; targets: string[]; riskNote: string };
  _usage?: { plan: string; remaining: number; limit: number };
};

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
  const router = useRouter();

  const [interval, setInterval_] = useState<Interval>("1h");
  const [toggles, setToggles] = useState<IndicatorToggles>(DEFAULT_TOGGLES);
  const [fullscreen, setFullscreen] = useState(false);
  const [klines, setKlines] = useState<KlinesState>({ status: "loading" });
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  // Load candles whenever the pair or timeframe changes. Stale in-flight
  // requests are ignored by id, so switching timeframes quickly never lets
  // an older response overwrite a newer one (never stale data under a
  // different coin/timeframe label).
  useEffect(() => {
    const thisRequest = ++requestIdRef.current;
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
      setAnalysis(data as Analysis);
    } catch {
      setAnalyzeError(t("chart.analyzeError"));
    } finally {
      setAnalyzing(false);
    }
  }

  function createTradePlan() {
    if (!analysis) return;
    const direction: TradePlanDraft["direction"] = analysis.tradePlan.direction.toLowerCase().includes("short")
      ? "Short"
      : analysis.tradePlan.direction.toLowerCase().includes("long")
        ? "Long"
        : "Wait";
    const draft: TradePlanDraft = {
      pair: analysis.pair,
      direction,
      timeframe: analysis.timeframe || "",
      entryZone: analysis.tradePlan.entryZone,
      invalidationText: analysis.invalidation?.level || analysis.tradePlan.invalidation,
      entry: firstNumber(analysis.tradePlan.entryZone),
      invalidation: firstNumber(analysis.invalidation?.level || analysis.tradePlan.invalidation),
      tp1: firstNumber(analysis.tradePlan.targets?.[0] || ""),
      tp2: firstNumber(analysis.tradePlan.targets?.[1] || ""),
      tp3: firstNumber(analysis.tradePlan.targets?.[2] || ""),
      reasoning: analysis.currentCondition?.explanation || "",
    };
    saveDraft(draft);
    router.push("/trade-plan");
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

        {/* Chart */}
        <div className="mt-3 rounded-lg border border-line overflow-hidden">
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
            <AnalysisChart candles={klines.candles} toggles={toggles} fullscreen={fullscreen} />
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

        {analysis && (
          <div className="mt-6 space-y-4 border-t border-line pt-5">
            <div className="grid sm:grid-cols-3 gap-3">
              <SummaryStat label={t("analyzer.marketStructure")} value={analysis.marketStructure.state} />
              <SummaryStat
                label={t("analyzer.trend")}
                value={`${analysis.trend.direction} · ${analysis.trend.strength}`}
              />
              <SummaryStat label={t("analyzer.currentCondition")} value={analysis.currentCondition.label} />
            </div>

            <p className="text-sm text-text-muted leading-relaxed">{analysis.currentCondition.explanation}</p>

            {analysis.keyLevels?.length > 0 && (
              <div className="divide-y divide-line border border-line rounded-md overflow-hidden">
                {analysis.keyLevels.map((lvl, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-text-muted">{lvl.label}</span>
                    <span className="font-data">{lvl.price}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="border border-bear/30 bg-bear/5 rounded-xl p-4">
              <div className="text-xs text-bear">{t("analyzer.invalidation")}</div>
              <div className="mt-1 font-data text-sm">{analysis.invalidation.level}</div>
            </div>

            <div className="border border-gold/30 rounded-xl p-4 bg-surface">
              <div className="text-xs text-gold">{t("analyzer.tradePlan")}</div>
              <div className="mt-2 grid sm:grid-cols-2 gap-2 text-sm">
                <PlanField label={t("analyzer.direction")} value={analysis.tradePlan.direction} />
                <PlanField label={t("analyzer.entryZone")} value={analysis.tradePlan.entryZone} />
                <PlanField label={t("analyzer.invalidationShort")} value={analysis.tradePlan.invalidation} />
                <PlanField label={t("analyzer.targets")} value={analysis.tradePlan.targets?.join(" · ") || "—"} />
              </div>
              <p className="mt-2 text-xs text-text-muted leading-relaxed">{analysis.tradePlan.riskNote}</p>
              <button onClick={createTradePlan} className="btn-primary mt-3 text-sm">
                {t("analyzer.createTradePlan")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatPrice(n: number): string {
  const decimals = n < 1 ? 6 : n < 100 ? 4 : 2;
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line rounded-xl p-3">
      <div className="text-[11px] text-text-muted uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function PlanField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-0.5">{value}</div>
    </div>
  );
}
