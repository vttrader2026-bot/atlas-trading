"use client";

import type { EngineResult, Verdict } from "@/lib/analyzerEngine";
import { useLanguage } from "@/lib/i18n";
import Frame, { TfChip } from "@/components/analyzer/Frame";
import { tfLabel } from "@/components/analyzer/types";

const dirTone = (d: string) => (d === "Bullish" ? "text-bull" : d === "Bearish" ? "text-bear" : "text-gold");

export default function StructureMap({ engine, verdict }: { engine: EngineResult; verdict: Verdict }) {
  const { t } = useLanguage();
  const m = engine.market;

  const setupKey = verdict === "VALID_SETUP" ? "valid" : verdict === "WAIT_FOR_CONFIRMATION" ? "pending" : verdict === "VISUAL_READ_ONLY" ? "visual" : "none";
  const setupTone = verdict === "VALID_SETUP" ? "text-bull" : verdict === "WAIT_FOR_CONFIRMATION" ? "text-gold" : "text-text-muted";

  return (
    <Frame eyebrow={t("analyzerV2.structure.title")} title={m ? t(`analyzerV2.state.${m.structure.state}`) : t("analyzerV2.state.Unclear")} aside={<TfChip tf={tfLabel(engine.interval)} />}>
      {/* Trend vs setup: two different questions, answered separately */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line p-4">
          <div className="text-label">{t("analyzerV2.trendVsSetup.market")}</div>
          <div className={`mt-1.5 text-lg font-semibold ${m ? dirTone(m.trend.direction) : "text-text-muted"}`}>
            {m ? t(`analyzerV2.state.${m.trend.direction}`) : "—"}
          </div>
          {m && <div className="text-sm text-text-muted">{t(`analyzerV2.strength.${m.trend.strength}`)}</div>}
        </div>
        <div className={`rounded-xl border p-4 ${verdict === "VALID_SETUP" ? "border-bull/40" : verdict === "WAIT_FOR_CONFIRMATION" ? "border-gold/40 border-dashed" : "border-line"}`}>
          <div className="text-label">{t("analyzerV2.trendVsSetup.setup")}</div>
          <div className={`mt-1.5 text-lg font-semibold ${setupTone}`}>{t(`analyzerV2.trendVsSetup.${setupKey}`)}</div>
        </div>
      </div>
      <p className="mt-3 text-sm text-text-muted leading-relaxed">{t("analyzerV2.trendVsSetup.note")}</p>
    </Frame>
  );
}
