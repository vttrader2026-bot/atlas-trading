"use client";

import StarButton from "@/components/watchlist/StarButton";
import { useEffect, useId, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useLanguage } from "@/lib/i18n";
import { getRemainingUses, recordUse, DAILY_ANALYZE_LIMIT } from "@/lib/usageLimit";
import { useAuth } from "@clerk/nextjs";
import PairPicker from "@/components/analyzer/PairPicker";
import AnalysisResult from "@/components/analyzer/AnalysisResult";
import type { AnalysisData } from "@/components/analyzer/types";
import { recordAnalysis } from "@/lib/analysisHistory";

type Analysis = AnalysisData;

const TIMEFRAMES = ["auto", "15M", "1H", "4H", "1D", "1W"];

export default function AnalyzerPage() {
  return (
    <Suspense fallback={null}>
      <AnalyzerPageInner />
    </Suspense>
  );
}

function AnalyzerPageInner() {
  const { t, lang } = useLanguage();
  const searchParams = useSearchParams();
  const { isLoaded, isSignedIn } = useAuth();

  const queryPair = searchParams.get("pair");
  const initialPair = queryPair || "auto";
  const queryTimeframe = searchParams.get("timeframe");
  const initialTimeframe = queryTimeframe || "auto";
  const timeframeOptions =
    queryTimeframe && !TIMEFRAMES.includes(queryTimeframe)
      ? [...TIMEFRAMES, queryTimeframe]
      : TIMEFRAMES;

  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pair, setPair] = useState(initialPair);
  const [timeframe, setTimeframe] = useState(initialTimeframe);
  const [style, setStyle] = useState("spotSwing");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);
  const [analyzedAt, setAnalyzedAt] = useState<number>(0);
  const [remaining, setRemaining] = useState(DAILY_ANALYZE_LIMIT);
  const [limit, setLimit] = useState(DAILY_ANALYZE_LIMIT);
  // "free" until the server says otherwise (anonymous visitors are free too).
  const [plan, setPlan] = useState<string>("free");
  const analyzingRef = useRef(false);

  useEffect(() => {
    // Restoring localStorage-backed state after mount avoids an SSR/client
    // hydration mismatch (localStorage isn't available on the server).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRemaining(getRemainingUses());
  }, []);

  // Signed-in accounts have a real, server-tracked plan limit - fetch it
  // once so the display and gating reflect it instead of the anonymous
  // local default.
  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    fetch("/api/me/plan", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad status"))))
      .then((data) => {
        if (cancelled) return;
        if (typeof data.plan === "string") setPlan(data.plan);
        if (typeof data.limit === "number") setLimit(data.limit);
        if (typeof data.remaining === "number") setRemaining(data.remaining);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  function onFile(f: File | null) {
    if (!f) return;
    // Same limits the server enforces, checked here so the user gets a clear message instead of a failed upload.
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(f.type)) {
      setError(t("analyzerV2.errors.notImage"));
      return;
    }
    if (f.size > 4 * 1024 * 1024) {
      setError(t("analyzerV2.errors.tooLarge"));
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError(null);
  }

  async function analyze() {
    if (!file || remaining <= 0) return;
    // Synchronous guard against double-firing from a rapid double-click —
    // React state (`loading`) can be stale across two clicks in the same
    // tick, but a ref updates immediately.
    if (analyzingRef.current) return;
    analyzingRef.current = true;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("lang", lang);
      formData.append("pair", pair);
      formData.append("timeframe", timeframe);
      formData.append("style", t(`analyzer.style.${style}`));
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await res.json();
      // Only a genuinely successful, well-formed analysis consumes one of
      // the 3 free attempts — never a 429/503/network/validation failure.
      const isValidAnalysis =
        res.ok && data && typeof data === "object" && data.marketStructure && data.tradePlan;
      if (!isValidAnalysis) {
        setError((data && data.error) || t("analyzer.genericError"));
      } else {
        setRemaining(recordUse());
        if (data._usage && typeof data._usage.remaining === "number") {
          setRemaining(data._usage.remaining);
          if (typeof data._usage.limit === "number") setLimit(data._usage.limit);
        }
        recordAnalysis(data); // Workflow "Analyze" progress; failed analyses never reach this branch
        setAnalyzedAt(Date.now());
        setResult(data);
      }
    } catch {
      setError(t("analyzer.connectionError"));
    } finally {
      setLoading(false);
      analyzingRef.current = false;
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-12 sm:py-14">
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">{t("analyzer.title")}</h1>
      <p className="text-text-muted text-sm mt-1 max-w-xl">{t("analyzer.subtitle")}</p>
      <span className="mt-3 inline-block px-2.5 py-1 rounded-full border border-gold/30 text-gold text-xs font-semibold">
        {t("analyzer.valueProp")}
      </span>

      {isLoaded && !isSignedIn && (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="font-medium">
              {lang === "ar" ? "انضم إلى Atlas Trading مجانًا" : "Join Atlas Trading for free"}
            </div>
            <p className="text-sm text-text-muted leading-relaxed mt-1">
              {lang === "ar"
                ? "استفد من خلاصة الصفقات العامة، والمحلل الذكي، والرادار، وخطة الصفقة، وأدوات المخاطر، والسجل."
                : "Access the public Trade Feed, AI Analyzer, Radar, Trade Plan, Risk tools, and Journal."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/sign-in"
              className="px-3 py-1.5 rounded-md border border-line text-sm text-text-muted hover:text-text hover:border-text-muted transition-colors whitespace-nowrap"
            >
              {lang === "ar" ? "تسجيل الدخول" : "Sign In"}
            </Link>
            <Link href="/sign-up" className="btn-primary whitespace-nowrap">
              {lang === "ar" ? "أنشئ حسابك المجاني ←" : "Create your free account →"}
            </Link>
          </div>
        </div>
      )}

      {isSignedIn && (
        <>
      <div className="mt-6 grid sm:grid-cols-3 gap-3">
        <PairPicker value={pair} onChange={setPair} />
        <Select label={t("analyzer.timeframeLabel")} value={timeframe} onChange={setTimeframe}>
          {timeframeOptions.map((tf) => (
            <option key={tf} value={tf}>
              {tf === "auto" ? t("analyzer.autoDetect") : tf}
            </option>
          ))}
        </Select>
        <Select label={t("analyzer.styleLabel")} value={style} onChange={setStyle}>
          <option value="spotSwing">{t("analyzer.style.spotSwing")}</option>
          <option value="dayTrade">{t("analyzer.style.dayTrade")}</option>
          <option value="scalping">{t("analyzer.style.scalping")}</option>
          <option value="learning">{t("analyzer.style.learning")}</option>
        </Select>
      </div>

      {!result && (
        <div className="mt-5 flex items-center gap-1.5 flex-wrap text-xs text-text-muted">
          {[
            t("analyzer.flow.upload"),
            t("analyzer.flow.structure"),
            t("analyzer.flow.levels"),
            t("analyzer.flow.scenarios"),
            t("analyzer.flow.plan"),
          ].map((step, i, arr) => (
            <span key={step} className="flex items-center gap-1.5">
              <span className="px-2 py-1 rounded border border-line">{step}</span>
              {i < arr.length - 1 && <span aria-hidden>→</span>}
            </span>
          ))}
        </div>
      )}

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFile(e.dataTransfer.files?.[0] ?? null);
        }}
        className="mt-4 border border-dashed border-line rounded-xl p-12 text-center"
      >
        {preview ? (
          <div className="relative w-full max-w-lg mx-auto aspect-video">
            <Image src={preview} alt="chart preview" fill className="object-contain rounded-md" unoptimized />
          </div>
        ) : (
          <p className="text-text-muted text-sm">{t("analyzer.dragHere")}</p>
        )}
        <label className="btn-secondary mt-4 cursor-pointer">
          {t("analyzer.chooseFile")}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      {remaining > 0 ? (
        <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
          {preview && (
            <button onClick={analyze} disabled={loading} className="btn-primary">
              {loading ? t("analyzer.readingChart") : t("analyzer.analyzeChart")}
            </button>
          )}
          <span className="text-xs text-text-muted">
            {remaining} / {limit} {t("analyzer.usesRemainingLabel")}
          </span>
        </div>
      ) : plan === "free" ? (
        <div className="mt-6 border border-gold/30 bg-gold/5 rounded-xl p-6">
          <div className="text-sm text-gold">{t("analyzer.limitReachedTitle")}</div>
          <p className="mt-2 text-sm text-text-muted leading-relaxed">{t("analyzer.limitUpgradeBody")}</p>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="text-2xl font-bold">
              $14.99<span className="text-sm text-text-muted font-normal">{t("eliteSection.perMonth")}</span>
            </div>
            <Link href="/elite" className="btn-primary inline-flex">
              {t("analyzer.limitUpgradeCta")}
            </Link>
          </div>
          <p className="mt-3 text-xs text-text-muted leading-relaxed">{t("analyzer.limitReached")}</p>
        </div>
      ) : (
        <div className="mt-6 border border-gold/30 bg-gold/5 rounded-xl p-6">
          <div className="text-sm text-gold">{t("analyzer.limitReachedTitle")}</div>
          <p className="mt-2 text-sm text-text-muted leading-relaxed">{t("analyzer.limitEliteBody")}</p>
        </div>
      )}

      {error && (
        <div className="mt-6 border border-bear/30 bg-bear/5 rounded-xl p-6">
          <p className="text-sm text-bear leading-relaxed">{error}</p>
        </div>
      )}

      {result && <AnalysisResult data={result} analyzedAt={analyzedAt} starSlot={<StarButton symbol={result.pair} />} />}

      {!result && !error && (
        <p className="mt-8 text-xs text-text-muted leading-relaxed max-w-xl">
          {t("analyzer.precisionNote")}
        </p>
      )}
        </>
      )}

    </main>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-xs text-text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input mt-1.5"
      >
        {children}
      </select>
    </div>
  );
}
