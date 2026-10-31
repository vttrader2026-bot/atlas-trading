"use client";

import type { ReactNode } from "react";
import type { Verdict } from "@/lib/analyzerEngine";
import { useLanguage } from "@/lib/i18n";
import { Num, TfChip } from "@/components/analyzer/Frame";
import { fill, tfLabel, verdictOf, type AnalysisData } from "@/components/analyzer/types";

const STYLE: Record<Verdict, { key: "valid" | "wait" | "none" | "visual"; text: string; border: string; glow: string; rail: string }> = {
  VALID_SETUP: { key: "valid", text: "text-bull", border: "border-bull/50", glow: "var(--bull)", rail: "bg-bull" },
  WAIT_FOR_CONFIRMATION: { key: "wait", text: "text-gold", border: "border-gold/50 border-dashed", glow: "var(--gold)", rail: "bg-gold" },
  NO_CLEAN_SETUP: { key: "none", text: "text-text", border: "border-line", glow: "var(--text-muted)", rail: "bg-text-muted" },
  VISUAL_READ_ONLY: { key: "visual", text: "text-text-muted", border: "border-line border-dashed", glow: "var(--text-muted)", rail: "bg-text-muted/60" },
};

function Icon({ verdict }: { verdict: Verdict }) {
  const common = { width: 30, height: 30, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (verdict === "VALID_SETUP")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5l3 3 5-6" />
      </svg>
    );
  if (verdict === "WAIT_FOR_CONFIRMATION")
    return (
      <svg {...common}>
        <path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" />
      </svg>
    );
  if (verdict === "VISUAL_READ_ONLY")
    return (
      <svg {...common}>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </svg>
  );
}

export default function VerdictHero({
  data,
  analyzedAt,
  starSlot,
  actions,
}: {
  data: AnalysisData;
  analyzedAt: number;
  starSlot?: ReactNode;
  actions?: ReactNode;
}) {
  const { t, lang } = useLanguage();
  const verdict = verdictOf(data);
  const s = STYLE[verdict];
  const engine = data._engine;
  const plan = engine?.plan ?? null;
  const locale = lang === "ar" ? "en-GB" : lang === "fr" ? "fr" : "en"; // Latin digits, one reading direction for the timestamp
  const when = new Date(analyzedAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  const lastCandle = engine?.lastClosedTime
    ? new Date(engine.lastClosedTime).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
    : null;
  const reasons = data.verdictReasons ?? [];

  return (
    <section className={`relative overflow-hidden rounded-2xl border ${s.border} bg-surface home-rise`}>
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 70% 90% at 0% 0%, color-mix(in srgb, ${s.glow} 14%, transparent), transparent 70%)` }}
      />
      <span aria-hidden className={`absolute inset-y-0 start-0 w-1 ${s.rail}`} />
      <div className="relative p-5 @md:p-8">
        {/* identity row */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Num className="text-lg font-semibold px-3 py-1 rounded-lg border border-line bg-bg/40">{data.pair}</Num>
            {starSlot}
            <TfChip tf={tfLabel(engine?.interval) || data.timeframe} />
            <span className="text-xs px-2 py-0.5 rounded-md border border-gold/40 text-gold">{t("analyzerV2.spotOnly")}</span>
          </div>
          {actions}
        </div>

        {/* verdict */}
        <div className="mt-6 flex items-start gap-4">
          <span className={`${s.text} mt-1.5 shrink-0`}>
            <Icon verdict={verdict} />
          </span>
          <div className="min-w-0">
            <div className={`text-label ${s.text}`}>{t(`analyzerV2.verdictTag.${s.key}`)}</div>
            <h2 className={`mt-1 font-heading font-bold tracking-tight leading-[1.05] text-4xl @md:text-5xl @2xl:text-6xl ${s.text}`}>
              {t(`analyzerV2.verdict.${s.key}`)}
            </h2>
          </div>
        </div>

        <p className="mt-5 text-base @md:text-lg leading-relaxed max-w-3xl">{t(`analyzerV2.verdictLead.${s.key}`)}</p>

        {verdict === "VALID_SETUP" && data.currentCondition?.explanation && (
          <p className="mt-3 text-sm @md:text-base text-text-muted leading-relaxed max-w-3xl">{data.currentCondition.explanation}</p>
        )}

        {verdict === "VALID_SETUP" && plan && (
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="tag tag-bull">{t(`analyzerV2.setupType.${plan.setup}`)}</span>
            <span className="tag tag-gold">
              {t("analyzerV2.plan.rr")} <Num className="ms-1">1 : {plan.targets[0].rr}</Num>
            </span>
          </div>
        )}

        {verdict !== "VALID_SETUP" && reasons.length > 0 && (
          <div className="mt-5 rounded-xl border border-line bg-bg/40 p-4 max-w-3xl">
            <div className="text-label">{t("analyzerV2.whyVerdict")}</div>
            <ul className="mt-2 space-y-1.5">
              {reasons.map((r) => (
                <li key={r.code} className="text-sm @md:text-base leading-relaxed flex gap-2">
                  <span className={`${s.text} mt-2 w-1.5 h-1.5 rounded-full shrink-0 bg-current`} aria-hidden />
                  {r.text}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* provenance */}
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-muted">
          <span>
            {t("analyzerV2.analyzedAt")}: <Num>{when}</Num>
          </span>
          {lastCandle && (
            <span>
              {t("analyzerV2.lastCandle")}: <Num>{lastCandle}</Num>
            </span>
          )}
          {engine && engine.closedCandles > 0 && <span>{fill(t("analyzerV2.basedOn"), { n: engine.closedCandles })}</span>}
        </div>
      </div>
    </section>
  );
}
