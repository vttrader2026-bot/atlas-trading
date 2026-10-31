"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { downloadAnalysisPdf } from "@/lib/analysisPdf";
import Frame from "@/components/analyzer/Frame";
import VerdictHero from "@/components/analyzer/VerdictHero";
import StructureMap from "@/components/analyzer/StructureMap";
import PriceLadder from "@/components/analyzer/PriceLadder";
import EvidenceGrid from "@/components/analyzer/EvidenceGrid";
import Scenarios from "@/components/analyzer/Scenarios";
import TradePlanPanel from "@/components/analyzer/TradePlanPanel";
import { verdictOf, type AnalysisData } from "@/components/analyzer/types";

function PdfButton({ data }: { data: AnalysisData }) {
  const { t } = useLanguage();
  const [working, setWorking] = useState(false);
  async function go() {
    setWorking(true);
    try {
      await downloadAnalysisPdf(data as Parameters<typeof downloadAnalysisPdf>[0]);
    } catch (err) {
      console.error("Could not generate PDF", err);
    } finally {
      setWorking(false);
    }
  }
  return (
    <button onClick={go} disabled={working} className="px-3 py-1.5 rounded-md text-xs border border-line text-text-muted hover:text-text transition-colors">
      {working ? t("analyzerV2.plan.preparing") : t("analyzerV2.plan.pdf")}
    </button>
  );
}

function Explain({ title, href, children }: { title: string; href?: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-line bg-bg/30 overflow-hidden">
      <summary className="px-4 py-3 text-sm cursor-pointer select-none flex items-center justify-between list-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 text-text-muted">
          {title}
          {href && (
            <Link href={href} onClick={(e) => e.stopPropagation()} className="text-xs hover:text-gold">
              ⓘ
            </Link>
          )}
        </span>
        <span className="text-xs text-text-muted group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="px-4 pb-4 text-sm text-text-muted leading-relaxed">{children}</div>
    </details>
  );
}

/**
 * The single Analyzer result renderer. Used by the screenshot page and the live-chart panel,
 * so both paths share one visual language.
 */
export default function AnalysisResult({ data, analyzedAt, starSlot }: { data: AnalysisData; analyzedAt: number; starSlot?: ReactNode }) {
  const { t } = useLanguage();
  const [teach, setTeach] = useState(false);
  const engine = data._engine;
  const verdict = verdictOf(data);

  const actions = (
    <div className="flex items-center gap-2">
      <PdfButton data={data} />
      {data.teachMe && (
        <button
          onClick={() => setTeach((v) => !v)}
          className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${teach ? "border-gold text-gold bg-gold/10" : "border-line text-text-muted hover:text-text"}`}
        >
          {t("analyzerV2.details.teach")}
        </button>
      )}
    </div>
  );

  return (
    <div className="@container mt-8 space-y-5">
      <VerdictHero data={data} analyzedAt={analyzedAt} starSlot={starSlot} actions={actions} />

      {engine && <StructureMap engine={engine} verdict={verdict} />}
      {engine && <PriceLadder engine={engine} />}
      {engine && <EvidenceGrid data={data} engine={engine} />}
      <Scenarios data={data} engine={engine} />
      <TradePlanPanel data={data} engine={engine} />

      <Frame title={t("analyzerV2.details.title")}>
        <div className="space-y-2.5">
          <Explain title={t("analyzer.marketStructure")} href="/academy/trend-direction">
            {teach && data.teachMe ? data.teachMe.structure : data.marketStructure?.explanation}
          </Explain>
          <Explain title={t("analyzer.trend")} href="/academy/trend-direction">
            {teach && data.teachMe ? data.teachMe.trend : data.trend?.explanation}
          </Explain>
          {data.momentum && <Explain title={t("analyzer.momentum")}>{data.momentum}</Explain>}
          {data.invalidation?.explanation && (
            <Explain title={t("analyzer.invalidation")}>{teach && data.teachMe ? data.teachMe.invalidation : data.invalidation.explanation}</Explain>
          )}
          {teach && data.teachMe && (
            <>
              <Explain title={t("analyzer.keyLevels")}>{data.teachMe.keyLevels}</Explain>
              <Explain title={t("analyzer.whatToWatch")}>{data.teachMe.confirmation}</Explain>
            </>
          )}
        </div>
      </Frame>
    </div>
  );
}
// ANALYZER-UI-P3-1805
