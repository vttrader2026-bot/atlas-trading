"use client";

import { useRouter } from "next/navigation";
import type { EngineResult } from "@/lib/analyzerEngine";
import { useLanguage } from "@/lib/i18n";
import { saveDraft, firstNumber, type TradePlanDraft } from "@/lib/tradePlan";
import Frame, { Num } from "@/components/analyzer/Frame";
import { fill, px, verdictOf, type AnalysisData } from "@/components/analyzer/types";

const MIN_RR = 1.2; // mirrors ENGINE_CONFIG.minRrTp1 (display text only)

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-bg/30 p-4">
      <div className="text-label">{label}</div>
      <div className="mt-2 text-lg">{children}</div>
      {note && <div className="mt-1 text-xs text-text-muted">{note}</div>}
    </div>
  );
}

function CreateTradePlanButton({ data }: { data: AnalysisData }) {
  const { t } = useLanguage();
  const router = useRouter();
  function create() {
    const reasoning = [data.currentCondition?.explanation, data.bullishScenario?.why].filter(Boolean).join(" ");
    const draft: TradePlanDraft = {
      pair: data.pair,
      direction: "Long",
      timeframe: data.timeframe || "",
      entryZone: data.tradePlan.entryZone,
      invalidationText: data.invalidation?.level || data.tradePlan.invalidation,
      entry: firstNumber(data.tradePlan.entryZone),
      invalidation: firstNumber(data.invalidation?.level || data.tradePlan.invalidation),
      tp1: firstNumber(data.tradePlan.targets?.[0] || ""),
      tp2: firstNumber(data.tradePlan.targets?.[1] || ""),
      tp3: firstNumber(data.tradePlan.targets?.[2] || ""),
      reasoning,
    };
    saveDraft(draft);
    router.push("/trade-plan");
  }
  return (
    <button onClick={create} className="btn-primary">
      {t("analyzerV2.plan.create")}
    </button>
  );
}

export default function TradePlanPanel({ data, engine }: { data: AnalysisData; engine: EngineResult | undefined }) {
  const { t } = useLanguage();
  const verdict = verdictOf(data);
  const plan = verdict === "VALID_SETUP" ? engine?.plan ?? null : null;

  if (!plan) {
    const next = data.whatToWatch ?? [];
    return (
      <Frame eyebrow={t("analyzerV2.plan.title")} title={t("analyzerV2.plan.nextTitle")}>
        <p className="text-sm text-text-muted">{t("analyzerV2.plan.noPlan")}</p>
        {next.length > 0 && (
          <ol className="mt-4 space-y-2.5">
            {next.map((item, i) => (
              <li key={i} className="flex gap-3 rounded-xl border border-dashed border-gold/40 p-3.5 text-sm leading-relaxed">
                <span className="font-data text-gold shrink-0">{i + 1}</span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        )}
      </Frame>
    );
  }

  const conditions = [
    t("analyzerV2.plan.cStructure"),
    t("analyzerV2.plan.cConfirm"),
    t("analyzerV2.plan.cHtf"),
    fill(t("analyzerV2.plan.cRr"), { n: MIN_RR }),
    t("analyzerV2.plan.cStop"),
  ];
  const srcLabel = (s: string) => t(s === "resistance" ? "analyzerV2.plan.srcResistance" : s === "range_high" ? "analyzerV2.plan.srcRange" : "analyzerV2.plan.srcAtr");

  return (
    <Frame eyebrow={t("analyzerV2.setupType." + plan.setup)} title={t("analyzerV2.plan.title")}>
      <div className="grid gap-3 @md:grid-cols-2">
        <Field label={t("analyzerV2.plan.entry")} note={`${t("analyzerV2.plan.worst")}: ${px(plan.entry.high)}`}>
          <Num className="font-semibold text-gold">
            {plan.entry.low === plan.entry.high ? px(plan.entry.low) : `${px(plan.entry.low)} – ${px(plan.entry.high)}`}
          </Num>
        </Field>
        <Field label={t("analyzerV2.plan.stop")} note={`${t("analyzerV2.plan.risk")}: ${px(plan.risk)}`}>
          <Num className="font-semibold text-bear">{px(plan.stopLoss)}</Num>
        </Field>
      </div>

      <div className="mt-3 grid gap-3 @md:grid-cols-3">
        {plan.targets.map((tp, i) => (
          <div key={i} className="rounded-xl border border-bull/30 bg-bull/5 p-4">
            <div className="flex items-center justify-between">
              <span className="text-label text-bull">TP{i + 1}</span>
              <Num className="text-xs text-text-muted">{tp.rr}R</Num>
            </div>
            <Num className="mt-2 block text-lg font-semibold">{px(tp.price)}</Num>
            <div className="mt-1 text-xs text-text-muted">{srcLabel(tp.source)}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-xl border border-gold/40 bg-gold/5 p-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-label text-gold">{t("analyzerV2.plan.rr")}</div>
          <div className="text-xs text-text-muted mt-0.5">{t("analyzerV2.plan.rrNote")}</div>
        </div>
        <Num className="text-xl font-semibold">
          {plan.targets.map((tp) => `${tp.rr}R`).join("  ·  ")}
        </Num>
      </div>

      <div className="mt-5">
        <div className="text-label">{t("analyzerV2.plan.conditions")}</div>
        <ul className="mt-2 space-y-1.5">
          {conditions.map((c, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span aria-hidden className="text-bull">✓</span>
              <span className="text-text-muted">{c}</span>
            </li>
          ))}
        </ul>
      </div>

      {data.tradePlan?.riskNote && (
        <p className="mt-4 text-xs text-text-muted leading-relaxed">
          <span className="font-semibold">{t("analyzerV2.plan.riskNote")}: </span>
          {data.tradePlan.riskNote}
        </p>
      )}
      <div className="mt-5">
        <CreateTradePlanButton data={data} />
      </div>
    </Frame>
  );
}
