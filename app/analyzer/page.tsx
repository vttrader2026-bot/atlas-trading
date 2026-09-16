"use client";

import { useEffect, useId, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { useLanguage } from "@/lib/i18n";
import { saveDraft, firstNumber, TradePlanDraft } from "@/lib/tradePlan";
import { getRemainingUses, recordUse, DAILY_ANALYZE_LIMIT } from "@/lib/usageLimit";
import { loadHistory, addHistoryEntry, HistoryEntry } from "@/lib/analysisHistory";

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

  const queryPair = searchParams.get("pair");
  const initialPair = queryPair || "auto";
  const pairOptions =
    queryPair && !PAIRS.includes(queryPair) ? [...PAIRS, queryPair] : PAIRS;

  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pair, setPair] = useState(initialPair);
  const [timeframe, setTimeframe] = useState("auto");
  const [style, setStyle] = useState("spotSwing");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);
  const [remaining, setRemaining] = useState(DAILY_ANALYZE_LIMIT);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    // Restoring localStorage-backed state after mount avoids an SSR/client
    // hydration mismatch (localStorage isn't available on the server).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRemaining(getRemainingUses());
    setHistory(loadHistory());
  }, []);

  function onFile(f: File | null) {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError(null);
  }

  async function analyze() {
    if (!file || remaining <= 0) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setRemaining(recordUse());
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("lang", lang);
      formData.append("pair", pair);
      formData.append("timeframe", timeframe);
      formData.append("style", t(`analyzer.style.${style}`));
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("analyzer.genericError"));
      } else {
        setResult(data);
        addHistoryEntry({
          pair: data.pair,
          timeframe: data.timeframe,
          marketStructure: data.marketStructure?.state ?? "",
          currentCondition: data.currentCondition?.label ?? "",
          tradeDirection: data.tradePlan?.direction ?? "",
        });
        setHistory(loadHistory());
      }
    } catch {
      setError(t("analyzer.connectionError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{t("analyzer.title")}</h1>
      <p className="text-text-muted text-sm mt-1 max-w-xl">{t("analyzer.subtitle")}</p>
      <span className="mt-3 inline-block px-2.5 py-1 rounded-md border border-gold/30 text-gold text-xs">
        {"2 free AI analyses every day"}
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
          {TIMEFRAMES.map((tf) => (
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
            "Upload",
            "Market structure",
            "Key levels",
            "Scenarios",
            "Trade plan",
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
        className="mt-4 border border-dashed border-line rounded-lg p-10 text-center"
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
            {remaining} / {DAILY_ANALYZE_LIMIT} {"free AI analyses remaining today"}
          </span>
        </div>
      ) : (
        <div className="mt-6 border border-gold/30 bg-gold/5 rounded-lg p-5">
          <div className="text-sm text-gold">{"Daily limit reached"}</div>
          <p className="mt-2 text-sm text-text-muted leading-relaxed">
            {"You have used your 2 free AI analyses for today. Your limit resets at midnight."}
          </p>
          <a
            href="https://t.me/Atlascryptotrader"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-sm text-gold hover:opacity-80 transition-opacity"
          >
            {"Learn about Atlas Elite"} →
          </a>
        </div>
      )}

      {error && (
        <div className="mt-6 border border-bear/30 bg-bear/5 rounded-lg p-5">
          <p className="text-sm text-bear leading-relaxed">{error}</p>
        </div>
      )}

      {result && <AnalysisResult result={result} t={t} />}

      {!result && !error && (
        <p className="mt-8 text-xs text-text-muted leading-relaxed max-w-xl">
          {t("analyzer.precisionNote")}
        </p>
      )}

      {history.length > 0 && (
        <div className="mt-10 border-t border-line pt-6">
          <h2 className="font-heading text-base font-semibold tracking-tight">
            {t("analyzer.historyTitle")}
          </h2>
          <div className="mt-3 divide-y divide-line border border-line rounded-lg overflow-hidden">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-data text-text-muted">{h.pair}</span>
                  <span className="text-text-muted text-xs">{h.timeframe}</span>
                  <span className="text-xs">{h.marketStructure}</span>
                </div>
                <span className="text-xs text-text-muted">
                  {new Date(h.date).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
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

      {/* Summary strip — the most important info, always visible */}
      <div className="grid sm:grid-cols-3 gap-3">
        <SummaryStat label={t("analyzer.marketStructure")} value={result.marketStructure.state} tone={stateColor(result.marketStructure.state)} />
        <SummaryStat
          label={t("analyzer.trend")}
          value={`${result.trend.direction} · ${result.trend.strength}`}
          tone={stateColor(result.trend.direction)}
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

      <CollapsibleExplain title={t("analyzer.marketStructure")}>
        <p className="text-sm text-text-muted leading-relaxed">
          {teachMode ? result.teachMe.structure : result.marketStructure.explanation}
        </p>
      </CollapsibleExplain>

      <CollapsibleExplain title={t("analyzer.trend")}>
        <p className="text-sm text-text-muted leading-relaxed">
          {teachMode ? result.teachMe.trend : result.trend.explanation}
        </p>
      </CollapsibleExplain>

      <CollapsibleExplain title={t("analyzer.momentum")}>
        <p className="text-sm text-text-muted leading-relaxed">{result.momentum}</p>
      </CollapsibleExplain>

      {result.keyLevels?.length > 0 && (
        <Section title={t("analyzer.keyLevels")}>
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

      <div className="border border-bear/30 bg-bear/5 rounded-lg p-5">
        <div className="text-sm text-bear">{t("analyzer.invalidation")}</div>
        <div className="mt-1 font-data text-base">{result.invalidation.level}</div>
        <p className="mt-2 text-sm text-text-muted leading-relaxed">
          {teachMode ? result.teachMe.invalidation : result.invalidation.explanation}
        </p>
      </div>

      {result.tradePlan && (
        <div className="border border-gold/30 rounded-lg p-5 bg-surface">
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

function SummaryStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className={`border rounded-lg p-3.5 ${tone.split(" ")[1] || "border-line"}`}>
      <div className="text-[11px] text-text-muted uppercase tracking-wide">{label}</div>
      <div className={`mt-1 text-sm font-medium ${tone.split(" ")[0] || "text-text"}`}>{value}</div>
    </div>
  );
}

function CollapsibleExplain({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group border border-line rounded-lg bg-surface overflow-hidden">
      <summary className="px-5 py-3 text-sm cursor-pointer select-none flex items-center justify-between list-none [&::-webkit-details-marker]:hidden">
        <span className="text-text-muted">{title}</span>
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
}: {
  title: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className={`border rounded-lg p-5 ${highlight ? "border-gold/30 bg-surface" : "border-line bg-surface"}`}>
      <div className="text-xs text-text-muted uppercase tracking-wide mb-2">{title}</div>
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
    <div className={`border ${border} rounded-lg p-5 bg-surface`}>
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



