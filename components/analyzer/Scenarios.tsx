"use client";

import type { ReactNode } from "react";
import type { EngineResult } from "@/lib/analyzerEngine";
import { useLanguage } from "@/lib/i18n";
import Frame, { Num } from "@/components/analyzer/Frame";
import { fill, px, verdictOf, type AnalysisData } from "@/components/analyzer/types";

function Card({ tone, title, children }: { tone: "bull" | "bear"; title: string; children: ReactNode }) {
  return (
    <div className={`rounded-xl border p-5 ${tone === "bull" ? "border-bull/30" : "border-bear/30"} bg-bg/30`}>
      <div className={`text-label ${tone === "bull" ? "text-bull" : "text-bear"}`}>{title}</div>
      <div className="mt-3 space-y-4">{children}</div>
    </div>
  );
}

function Block({ label, tone, children }: { label: string; tone?: "bear"; children: ReactNode }) {
  return (
    <div>
      <div className={`text-xs font-semibold ${tone === "bear" ? "text-bear" : "text-text-muted"}`}>{label}</div>
      <div className="mt-1 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

/**
 * Bullish + downside scenarios. Text comes from the (scrubbed) AI explanation; every
 * price in the "invalidated if" lines and every target comes from the engine.
 */
export default function Scenarios({ data, engine }: { data: AnalysisData; engine: EngineResult | undefined }) {
  const { t } = useLanguage();
  const m = engine?.market ?? null;
  const plan = engine?.plan ?? null;
  const bull = data.bullishScenario;
  const bear = data.bearishScenario;
  if (!bull && !bear) return null;
  // AI commentary is only shown where the engine sees a setup in play; under NO CLEAN SETUP it could contradict the verdict.
  const showWhy = verdictOf(data) !== "NO_CLEAN_SETUP";

  const swingLow = m?.structure.lastSwingLow ?? undefined;
  const nearestRes = m ? [...m.resistance].filter((z) => z.mid > m.price).sort((a, b) => a.mid - b.mid)[0] : undefined;

  const bullInvalid = plan
    ? fill(t("analyzerV2.scenarios.closeBelowStop"), { p: px(plan.stopLoss) })
    : swingLow !== undefined && m && m.price > swingLow
      ? fill(t("analyzerV2.scenarios.closeBelowLow"), { p: px(swingLow) })
      : null;
  const bearInvalid = nearestRes ? fill(t("analyzerV2.scenarios.reclaim"), { p: px(nearestRes.high) }) : null;

  return (
    <Frame title={t("analyzerV2.scenarios.title")}>
      <div className="grid gap-4 @2xl:grid-cols-2">
        {bull && (
          <Card tone="bull" title={t("analyzerV2.scenarios.bull")}>
            <Block label={t("analyzerV2.scenarios.confirms")}>{bull.confirmation}</Block>
            {showWhy && bull.why && <Block label={t("analyzerV2.scenarios.why")}>{bull.why}</Block>}
            <Block label={t("analyzerV2.scenarios.targets")}>
              {plan ? (
                <div className="flex flex-wrap gap-2">
                  {plan.targets.map((tp, i) => (
                    <span key={i} className="tag tag-bull">
                      TP{i + 1} <Num className="ms-1">{px(tp.price)}</Num>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-text-muted">{t("analyzerV2.scenarios.noTargets")}</span>
              )}
            </Block>
            {bullInvalid && (
              <Block label={t("analyzerV2.scenarios.invalidated")} tone="bear">
                <Num className="!font-sans">{bullInvalid}</Num>
              </Block>
            )}
          </Card>
        )}
        {bear && (
          <Card tone="bear" title={t("analyzerV2.scenarios.bear")}>
            <Block label={t("analyzerV2.scenarios.confirms")}>{bear.confirmation}</Block>
            {showWhy && bear.why && <Block label={t("analyzerV2.scenarios.why")}>{bear.why}</Block>}
            {bearInvalid && (
              <Block label={t("analyzerV2.scenarios.invalidated")}>
                <Num className="!font-sans">{bearInvalid}</Num>
              </Block>
            )}
          </Card>
        )}
      </div>
    </Frame>
  );
}
