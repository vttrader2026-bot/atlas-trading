"use client";

import { useState } from "react";
import Image from "next/image";
import { useLanguage } from "@/lib/i18n";

type Level = { label: string; price: string };
type Scenario = { confirmation: string; targets: string[]; why: string } | null;
type TradePlan = {
  direction: string;
  entryZone: string;
  invalidation: string;
  targets: string[];
  riskNote: string;
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
};

const PAIRS = ["auto", "BTC/USDT", "ETH/USDT", "SOL/USDT", "BNB/USDT", "XRP/USDT"];
const TIMEFRAMES = ["auto", "15M", "1H", "4H", "1D", "1W"];

export default function AnalyzerPage() {
  const { t, lang } = useLanguage();
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pair, setPair] = useState("auto");
  const [timeframe, setTimeframe] = useState("auto");
  const [style, setStyle] = useState("spotSwing");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Analysis | null>(null);

  function onFile(f: File | null) {
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError(null);
  }

  async function analyze() {
    if (!file) return;
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
      if (!res.ok) {
        setError(data.error ?? t("analyzer.genericError"));
      } else {
        setResult(data);
      }
    } catch {
      setError(t("analyzer.connectionError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl tracking-tight">{t("analyzer.title")}</h1>
      <p className="text-text-muted text-sm mt-1 max-w-xl">{t("analyzer.subtitle")}</p>

      <div className="mt-6 grid sm:grid-cols-3 gap-3">
        <Select label={t("analyzer.pairLabel")} value={pair} onChange={setPair}>
          {PAIRS.map((p) => (
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
        <label className="mt-4 inline-block cursor-pointer px-4 py-2 rounded-md border border-line text-sm hover:bg-surface transition-colors">
          {t("analyzer.chooseFile")}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      {preview && (
        <button
          onClick={analyze}
          disabled={loading}
          className="mt-5 px-5 py-2.5 rounded-md bg-gold text-bg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? t("analyzer.readingChart") : t("analyzer.analyzeChart")}
        </button>
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
  return (
    <div>
      <label className="text-xs text-text-muted">{label}</label>
      <select
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
  return (
    <div className="mt-8 space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-data text-sm px-2.5 py-1 rounded border border-line text-text-muted">
          {result.pair}
        </span>
        <span className="font-data text-sm px-2.5 py-1 rounded border border-line text-text-muted">
          {result.timeframe}
        </span>
      </div>

      <Section title={t("analyzer.marketStructure")}>
        <span
          className={`inline-block px-2.5 py-1 rounded border text-sm ${stateColor(
            result.marketStructure.state
          )}`}
        >
          {result.marketStructure.state}
        </span>
        <p className="mt-2 text-sm text-text-muted leading-relaxed">
          {result.marketStructure.explanation}
        </p>
      </Section>

      <Section title={t("analyzer.trend")}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-1 rounded border text-sm ${stateColor(result.trend.direction)}`}>
            {result.trend.direction}
          </span>
          <span className="px-2.5 py-1 rounded border border-line text-text-muted text-sm">
            {result.trend.strength}
          </span>
        </div>
        <p className="mt-2 text-sm text-text-muted leading-relaxed">{result.trend.explanation}</p>
      </Section>

      <Section title={t("analyzer.momentum")}>
        <p className="text-sm text-text-muted leading-relaxed">{result.momentum}</p>
      </Section>

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
        </Section>
      )}

      <Section title={t("analyzer.currentCondition")} highlight>
        <div className="text-base">{result.currentCondition.label}</div>
        <p className="mt-2 text-sm text-text-muted leading-relaxed">
          {result.currentCondition.explanation}
        </p>
      </Section>

      {result.noClearSetup && (
        <div className="border border-line rounded-lg p-5 bg-surface">
          <div className="text-sm text-text-muted">{t("analyzer.noClearSetup")}</div>
          <p className="mt-2 text-sm leading-relaxed">{result.noClearSetup}</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {result.bullishScenario && (
          <ScenarioCard
            title={t("analyzer.bullishScenario")}
            scenario={result.bullishScenario}
            tone="bull"
            t={t}
          />
        )}
        {result.bearishScenario && (
          <ScenarioCard
            title={t("analyzer.bearishScenario")}
            scenario={result.bearishScenario}
            tone="bear"
            t={t}
          />
        )}
      </div>

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
        </Section>
      )}

      <div className="border border-bear/30 bg-bear/5 rounded-lg p-5">
        <div className="text-sm text-bear">{t("analyzer.invalidation")}</div>
        <div className="mt-1 font-data text-base">{result.invalidation.level}</div>
        <p className="mt-2 text-sm text-text-muted leading-relaxed">
          {result.invalidation.explanation}
        </p>
      </div>

      {result.tradePlan && (
        <div className="border border-gold/30 rounded-lg p-5 bg-surface">
          <div className="text-sm text-gold">{t("analyzer.tradePlan")}</div>
          <div className="mt-3 grid sm:grid-cols-2 gap-3 text-sm">
            <PlanField label={t("analyzer.direction")} value={result.tradePlan.direction} />
            <PlanField label={t("analyzer.entryZone")} value={result.tradePlan.entryZone} />
            <PlanField
              label={t("analyzer.invalidationShort")}
              value={result.tradePlan.invalidation}
            />
            <PlanField
              label={t("analyzer.targets")}
              value={result.tradePlan.targets?.join(" · ") || "—"}
            />
          </div>
          <p className="mt-3 text-xs text-text-muted leading-relaxed">
            {result.tradePlan.riskNote}
          </p>
        </div>
      )}
    </div>
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
