"use client";

import { useEffect, useId, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useLanguage } from "@/lib/i18n";
import { saveDraft, firstNumber, TradePlanDraft } from "@/lib/tradePlan";
import { getRemainingUses, recordUse, DAILY_ANALYZE_LIMIT } from "@/lib/usageLimit";
import { useAuth } from "@clerk/nextjs";

type Level = { label: string; price: string };
type Scenario = { confirmation: string; targets: string[]; why: string } | null;
type TradePlan = {
  direction: string;
  entryZone: string;
  invalidation: string;
  targets: string[];
  riskNote: string;
};
type TeachMe = {
  structure: string;
  trend: string;
  keyLevels: string;
  confirmation: string;
  invalidation: string;
};

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
  tradePlan: TradePlan;
  teachMe: TeachMe;
};

const PAIRS = ["auto", "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT"];
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
  const { isSignedIn } = useAuth();

  const queryPair = searchParams.get("pair");
  const initialPair = queryPair || "auto";
  const pairOptions =
    queryPair && !PAIRS.includes(queryPair) ? [...PAIRS, queryPair] : PAIRS;
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
  const [remaining, setRemaining] = useState(DAILY_ANALYZE_LIMIT);
  const [limit, setLimit] = useState(DAILY_ANALYZE_LIMIT);
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
      // the 2 free attempts — never a 429/503/network/validation failure.
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

      <div className="mt-6 grid sm:grid-cols-3 gap-3">
        <Select label={t("analyzer.pairLabel")} value={pair} onChange={setPair}>
          {pairOptions.map((p) => (
            <option key={p} value={p}>
              {p === "auto" ? t("analyzer.autoDetect") : p}
            </option>
          ))}
        </Select>
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
      ) : (
        <div className="mt-6 border border-gold/30 bg-gold/5 rounded-xl p-6">
          <div className="text-sm text-gold">{t("analyzer.limitReachedTitle")}</div>
          <p className="mt-2 text-sm text-text-muted leading-relaxed">
            {t("analyzer.limitReached")}
          </p>
          <Link href="/elite" className="btn-primary mt-3 inline-flex">
            {t("analyzer.limitReachedCta")}
          </Link>
        </div>
      )}

      {error && (
        <div className="mt-6 border border-bear/30 bg-bear/5 rounded-xl p-6">
          <p className="text-sm text-bear leading-relaxed">{error}</p>
        </div>
      )}

      {result && <AnalysisResult result={result} t={t} />}

      {!result && !error && (
        <p className="mt-8 text-xs text-text-muted leading-relaxed max-w-xl">
          {t("analyzer.precisionNote")}
        </p>
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

function stateColor(state: string): string {
  const s = state.toLowerCase();
  if (s.includes("bull")) return "text-bull border-bull/40";
  if (s.includes("bear")) return "text-bear border-bear/40";
  if (s.includes("rang") || s.includes("neutral")) return "text-gold border-gold/40";
  return "text-text-muted border-line";
}

async function downloadAnalysisPdf(result: Analysis) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const marginX = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - marginX * 2;
  let y = 56;

  function ensureSpace(lineHeight: number) {
    if (y + lineHeight > pageHeight - 48) {
      doc.addPage();
      y = 56;
    }
  }

  function heading(text: string, size = 16) {
    ensureSpace(size + 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setTextColor(20, 20, 20);
    doc.text(text, marginX, y);
    y += size + 8;
  }

  function label(text: string) {
    ensureSpace(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(text.toUpperCase(), marginX, y);
    y += 14;
  }

  function paragraph(text: string | undefined, size = 10) {
    if (!text) return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(40, 40, 40);
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    for (const line of lines) {
      ensureSpace(size + 4);
      doc.text(line, marginX, y);
      y += size + 4;
    }
    y += 4;
  }

  function divider() {
    ensureSpace(14);
    doc.setDrawColor(220, 220, 220);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 14;
  }

  heading(`Atlas Trading - ${result.pair} - ${result.timeframe}`);
  paragraph(`Generated ${new Date().toLocaleString()}`, 9);
  divider();

  label("Market Structure");
  paragraph(result.marketStructure.state);
  paragraph(result.marketStructure.explanation, 9);

  label("Trend");
  paragraph(`${result.trend.direction} - ${result.trend.strength}`);
  paragraph(result.trend.explanation, 9);

  label("Current Condition");
  paragraph(result.currentCondition.label);
  paragraph(result.currentCondition.explanation, 9);

  if (result.momentum) {
    label("Momentum");
    paragraph(result.momentum, 9);
  }

  if (result.keyLevels?.length) {
    label("Key Levels");
    for (const lvl of result.keyLevels) paragraph(`${lvl.label}: ${lvl.price}`, 10);
  }

  const isWait = !!result.noClearSetup || result.tradePlan?.direction?.toLowerCase().includes("wait");
  if (isWait) {
    label("No Clear Setup");
    paragraph(result.noClearSetup || result.currentCondition.explanation, 9);
  } else {
    if (result.bullishScenario) {
      label("Bullish Scenario");
      paragraph(`Confirmation: ${result.bullishScenario.confirmation}`, 9);
      if (result.bullishScenario.targets?.length) {
        paragraph(`Targets: ${result.bullishScenario.targets.join(", ")}`, 9);
      }
      paragraph(`Why: ${result.bullishScenario.why}`, 9);
    }
    if (result.bearishScenario) {
      label("Bearish Scenario");
      paragraph(`Confirmation: ${result.bearishScenario.confirmation}`, 9);
      if (result.bearishScenario.targets?.length) {
        paragraph(`Targets: ${result.bearishScenario.targets.join(", ")}`, 9);
      }
      paragraph(`Why: ${result.bearishScenario.why}`, 9);
    }
  }

  if (result.whatToWatch?.length) {
    label("What To Watch");
    for (const item of result.whatToWatch) paragraph(`- ${item}`, 9);
  }

  divider();
  label("Invalidation");
  paragraph(result.invalidation.level);
  paragraph(result.invalidation.explanation, 9);

  if (result.tradePlan) {
    divider();
    label("Atlas Trade Plan");
    paragraph(`Direction: ${result.tradePlan.direction}`);
    paragraph(`Entry Zone: ${result.tradePlan.entryZone}`);
    paragraph(`Invalidation: ${result.tradePlan.invalidation}`);
    if (result.tradePlan.targets?.length) paragraph(`Targets: ${result.tradePlan.targets.join(", ")}`);
    paragraph(result.tradePlan.riskNote, 9);
  }

  divider();
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text("Not financial advice. Generated by Atlas Trading.", marginX, y);

  const safePair = result.pair.replace(/[^a-z0-9]/gi, "") || "chart";
  const safeTf = (result.timeframe || "chart").replace(/[^a-z0-9]/gi, "");
  doc.save(`atlas-${safePair}-${safeTf}.pdf`);
}

function DownloadPdfButton({ result }: { result: Analysis }) {
  const [working, setWorking] = useState(false);

  async function handleClick() {
    setWorking(true);
    try {
      await downloadAnalysisPdf(result);
    } catch (err) {
      console.error("Could not generate PDF", err);
    } finally {
      setWorking(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={working}
      className="px-3 py-1.5 rounded-md text-xs border border-line text-text-muted hover:text-text transition-colors"
    >
      {working ? "Preparing PDF..." : "Download PDF"}
    </button>
  );
}

function AnalysisResult({
  result,
  t,
}: {
  result: Analysis;
  t: (key: string) => string;
}) {
  const [teachMode, setTeachMode] = useState(false);
  const isWait =
    !!result.noClearSetup || result.tradePlan?.direction?.toLowerCase().includes("wait");

  return (
    <div className="mt-8 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-data text-sm px-2.5 py-1 rounded border border-line text-text-muted">
            {result.pair}
          </span>
          <span className="font-data text-sm px-2.5 py-1 rounded border border-line text-text-muted">
            {result.timeframe}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <DownloadPdfButton result={result} />
          <button
            onClick={() => setTeachMode((v) => !v)}
            className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
              teachMode
                ? "border-gold text-gold bg-gold/10"
                : "border-line text-text-muted hover:text-text"
            }`}
          >
            {t("analyzer.teachMeToggle")}
          </button>
        </div>
      </div>

      {/* Summary strip — the most important info, always visible */}
      <div className="grid sm:grid-cols-3 gap-3">
        <SummaryStat
          label={t("analyzer.marketStructure")}
          value={result.marketStructure.state}
          tone={stateColor(result.marketStructure.state)}
          lessonHref="/academy/trend-direction"
        />
        <SummaryStat
          label={t("analyzer.trend")}
          value={`${result.trend.direction} · ${result.trend.strength}`}
          tone={stateColor(result.trend.direction)}
          lessonHref="/academy/trend-direction"
        />
        <SummaryStat
          label={t("analyzer.currentCondition")}
          value={result.currentCondition.label}
          tone="text-text border-line"
        />
      </div>

      {isWait && (
        <div className="border border-gold/40 bg-gold/5 rounded-lg p-5">
          <div className="text-sm text-gold">⚪ {t("analyzer.waitLabel")}</div>
          <p className="mt-2 text-sm leading-relaxed">
            {result.noClearSetup || result.currentCondition.explanation}
          </p>
        </div>
      )}

      <CollapsibleExplain title={t("analyzer.marketStructure")} lessonHref="/academy/trend-direction">
        <p className="text-sm text-text-muted leading-relaxed">
          {teachMode ? result.teachMe.structure : result.marketStructure.explanation}
        </p>
      </CollapsibleExplain>

      <CollapsibleExplain title={t("analyzer.trend")} lessonHref="/academy/trend-direction">
        <p className="text-sm text-text-muted leading-relaxed">
          {teachMode ? result.teachMe.trend : result.trend.explanation}
        </p>
      </CollapsibleExplain>

      <CollapsibleExplain title={t("analyzer.momentum")}>
        <p className="text-sm text-text-muted leading-relaxed">{result.momentum}</p>
      </CollapsibleExplain>

      {result.keyLevels?.length > 0 && (
        <Section title={t("analyzer.keyLevels")} lessonHref="/academy/support-resistance">
          <div className="divide-y divide-line border border-line rounded-md overflow-hidden">
            {result.keyLevels.map((lvl, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-text-muted">{lvl.label}</span>
                <span className="font-data">{lvl.price}</span>
              </div>
            ))}
          </div>
          {teachMode && (
            <p className="mt-3 text-sm text-text-muted leading-relaxed">{result.teachMe.keyLevels}</p>
          )}
        </Section>
      )}

      {!isWait && (
        <div className="grid sm:grid-cols-2 gap-4">
          {result.bullishScenario && (
            <ScenarioCard title={t("analyzer.bullishScenario")} scenario={result.bullishScenario} tone="bull" t={t} />
          )}
          {result.bearishScenario && (
            <ScenarioCard title={t("analyzer.bearishScenario")} scenario={result.bearishScenario} tone="bear" t={t} />
          )}
        </div>
      )}

      {result.whatToWatch?.length > 0 && (
        <Section title={t("analyzer.whatToWatch")}>
          <ul className="space-y-1.5">
            {result.whatToWatch.map((item, i) => (
              <li key={i} className="text-sm text-text-muted flex gap-2">
                <span className="text-gold">•</span>
                {item}
              </li>
            ))}
          </ul>
          {teachMode && (
            <p className="mt-3 text-sm text-text-muted leading-relaxed border-t border-line pt-3">
              {result.teachMe.confirmation}
            </p>
          )}
        </Section>
      )}

      <div className="border border-bear/30 bg-bear/5 rounded-xl p-6">
        <div className="text-sm text-bear">{t("analyzer.invalidation")}</div>
        <div className="mt-1 font-data text-base">{result.invalidation.level}</div>
        <p className="mt-2 text-sm text-text-muted leading-relaxed">
          {teachMode ? result.teachMe.invalidation : result.invalidation.explanation}
        </p>
      </div>

      {result.tradePlan && (
        <div className="border border-gold/30 rounded-xl p-6 bg-surface">
          <div className="text-sm text-gold">{t("analyzer.tradePlan")}</div>
          <div className="mt-3 grid sm:grid-cols-2 gap-3 text-sm">
            <PlanField label={t("analyzer.direction")} value={result.tradePlan.direction} />
            <PlanField label={t("analyzer.entryZone")} value={result.tradePlan.entryZone} />
            <PlanField label={t("analyzer.invalidationShort")} value={result.tradePlan.invalidation} />
            <PlanField label={t("analyzer.targets")} value={result.tradePlan.targets?.join(" · ") || "—"} />
          </div>
          <p className="mt-3 text-xs text-text-muted leading-relaxed">{result.tradePlan.riskNote}</p>
          <CreateTradePlanButton result={result} t={t} />
        </div>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
  lessonHref,
}: {
  label: string;
  value: string;
  tone: string;
  lessonHref?: string;
}) {
  return (
    <div className={`border rounded-xl p-4 ${tone.split(" ")[1] || "border-line"}`}>
      <div className="flex items-center gap-1.5">
        <div className="text-[11px] text-text-muted uppercase tracking-wide">{label}</div>
        {lessonHref && (
          <Link href={lessonHref} className="text-text-muted hover:text-gold transition-colors text-xs" title="تعلّم المزيد">
            ⓘ
          </Link>
        )}
      </div>
      <div className={`mt-1 text-sm font-medium ${tone.split(" ")[0] || "text-text"}`}>{value}</div>
    </div>
  );
}

function CollapsibleExplain({
  title,
  children,
  lessonHref,
}: {
  title: string;
  children: React.ReactNode;
  lessonHref?: string;
}) {
  return (
    <details className="group card card-hover overflow-hidden">
      <summary className="px-5 py-3 text-sm cursor-pointer select-none flex items-center justify-between list-none [&::-webkit-details-marker]:hidden">
        <span className="text-text-muted flex items-center gap-1.5">
          {title}
          {lessonHref && (
            <Link
              href={lessonHref}
              onClick={(e) => e.stopPropagation()}
              className="text-text-muted hover:text-gold transition-colors text-xs"
              title="تعلّم المزيد"
            >
              ⓘ
            </Link>
          )}
        </span>
        <span className="text-text-muted text-xs group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="px-5 pb-4">{children}</div>
    </details>
  );
}

function CreateTradePlanButton({ result, t }: { result: Analysis; t: (key: string) => string }) {
  const router = useRouter();

  function create() {
    const direction: TradePlanDraft["direction"] = result.tradePlan.direction
      .toLowerCase()
      .includes("short")
      ? "Short"
      : result.tradePlan.direction.toLowerCase().includes("long")
        ? "Long"
        : "Wait";

    const reasoningParts = [
      result.currentCondition?.explanation,
      direction === "Long" ? result.bullishScenario?.why : undefined,
      direction === "Short" ? result.bearishScenario?.why : undefined,
    ].filter(Boolean);

    const draft: TradePlanDraft = {
      pair: result.pair,
      direction,
      timeframe: result.timeframe || "",
      entryZone: result.tradePlan.entryZone,
      invalidationText: result.invalidation?.level || result.tradePlan.invalidation,
      entry: firstNumber(result.tradePlan.entryZone),
      invalidation: firstNumber(result.invalidation?.level || result.tradePlan.invalidation),
      tp1: firstNumber(result.tradePlan.targets?.[0] || ""),
      tp2: firstNumber(result.tradePlan.targets?.[1] || ""),
      tp3: firstNumber(result.tradePlan.targets?.[2] || ""),
      reasoning: reasoningParts.join(" "),
    };
    saveDraft(draft);
    router.push("/trade-plan");
  }

  return (
    <button
      onClick={create}
      className="btn-primary mt-4"
    >
      {t("analyzer.createTradePlan")}
    </button>
  );
}

function Section({
  title,
  children,
  highlight,
  lessonHref,
}: {
  title: string;
  children: React.ReactNode;
  highlight?: boolean;
  lessonHref?: string;
}) {
  return (
    <div className={`border rounded-xl p-6 ${highlight ? "border-gold/30 bg-surface" : "border-line bg-surface"}`}>
      <div className="text-label mb-2 flex items-center gap-1.5">
        {title}
        {lessonHref && (
          <Link href={lessonHref} className="text-text-muted hover:text-gold transition-colors text-xs normal-case tracking-normal" title="تعلّم المزيد">
            ⓘ
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function ScenarioCard({
  title,
  scenario,
  tone,
  t,
}: {
  title: string;
  scenario: { confirmation: string; targets: string[]; why: string };
  tone: "bull" | "bear";
  t: (key: string) => string;
}) {
  const border = tone === "bull" ? "border-bull/30" : "border-bear/30";
  const text = tone === "bull" ? "text-bull" : "text-bear";
  return (
    <div className={`border ${border} rounded-xl p-6 bg-surface`}>
      <div className={`text-sm ${text}`}>{title}</div>
      <div className="mt-3">
        <div className="text-xs text-text-muted">{t("analyzer.confirmation")}</div>
        <p className="text-sm mt-1">{scenario.confirmation}</p>
      </div>
      {scenario.targets?.length > 0 && (
        <div className="mt-3">
          <div className="text-xs text-text-muted">{t("analyzer.targets")}</div>
          <p className="text-sm mt-1 font-data">{scenario.targets.join(" · ")}</p>
        </div>
      )}
      <div className="mt-3">
        <div className="text-xs text-text-muted">{t("analyzer.why")}</div>
        <p className="text-sm mt-1 text-text-muted leading-relaxed">{scenario.why}</p>
      </div>
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
