"use client";

import type { EngineResult, Verdict } from "@/lib/analyzerEngine";
import { useLanguage } from "@/lib/i18n";
import Frame, { Num, TfChip } from "@/components/analyzer/Frame";
import { px, tfLabel } from "@/components/analyzer/types";

const LABEL_TONE: Record<string, string> = { HH: "bull", HL: "bull", LH: "bear", LL: "bear" };
const isHigh = (l: string) => l === "HH" || l === "LH";

const dirTone = (d: string) => (d === "Bullish" ? "text-bull" : d === "Bearish" ? "text-bear" : "text-gold");

export default function StructureMap({ engine, verdict }: { engine: EngineResult; verdict: Verdict }) {
  const { t } = useLanguage();
  const m = engine.market;
  const swings = m?.structure.labelled ?? [];

  const setupKey = verdict === "VALID_SETUP" ? "valid" : verdict === "WAIT_FOR_CONFIRMATION" ? "pending" : verdict === "VISUAL_READ_ONLY" ? "visual" : "none";
  const setupTone = verdict === "VALID_SETUP" ? "text-bull" : verdict === "WAIT_FOR_CONFIRMATION" ? "text-gold" : "text-text-muted";

  // Swing map geometry (real swing prices only).
  const W = 320;
  const H = 150;
  const pad = 26;
  const prices = swings.map((s) => s.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const xAt = (i: number) => (swings.length === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (swings.length - 1));
  const yAt = (p: number) => pad + (1 - (p - lo) / (hi - lo || 1)) * (H - 2 * pad);
  const pts = swings.map((s, i) => `${xAt(i).toFixed(1)},${yAt(s.price).toFixed(1)}`).join(" ");

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

      {/* Swing map */}
      <div className="mt-6">
        <div className="text-label mb-2">{t("analyzerV2.structure.legend")}</div>
        {swings.length >= 2 ? (
          <>
            <div dir="ltr" className="rounded-xl border border-line bg-bg/40 p-2">
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t("analyzerV2.structure.title")}>
                <polyline points={pts} fill="none" className="stroke-text-muted/50" strokeWidth={1.5} strokeLinejoin="round" strokeDasharray="3 3" />
                {swings.map((s, i) => {
                  const tone = LABEL_TONE[s.label];
                  const x = xAt(i);
                  const y = yAt(s.price);
                  const above = isHigh(s.label);
                  return (
                    <g key={i}>
                      <circle cx={x} cy={y} r={5} className={tone === "bull" ? "fill-bull" : "fill-bear"} />
                      <text x={x} y={above ? y - 12 : y + 20} textAnchor="middle" fontSize={13} fontWeight={700} className={tone === "bull" ? "fill-bull" : "fill-bear"}>
                        {s.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <ul className="mt-3 flex flex-wrap gap-2">
              {swings.map((s, i) => (
                <li key={i} className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${LABEL_TONE[s.label] === "bull" ? "border-bull/30" : "border-bear/30"}`}>
                  <span className={`font-bold ${LABEL_TONE[s.label] === "bull" ? "text-bull" : "text-bear"}`}>{s.label}</span>
                  <Num className="text-text-muted">{px(s.price)}</Num>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-text-muted">
              {t("analyzerV2.structure.HH")} · {t("analyzerV2.structure.HL")} · {t("analyzerV2.structure.LH")} · {t("analyzerV2.structure.LL")}
            </p>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-line p-4 text-sm text-text-muted">{t("analyzerV2.structure.noSwings")}</div>
        )}
      </div>
    </Frame>
  );
}
