"use client";

import type { ReactNode } from "react";
import type { EngineResult } from "@/lib/analyzerEngine";
import { useLanguage } from "@/lib/i18n";
import Frame, { Num, TfChip } from "@/components/analyzer/Frame";
import { HIGHER_TF_LABEL, fill, px, tfLabel, type AnalysisData } from "@/components/analyzer/types";

function Tile({ title, tf, children }: { title: string; tf: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-bg/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-label">{title}</div>
        <TfChip tf={tf} />
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

const Chip = ({ tone, children }: { tone: "bull" | "bear" | "gold" | "muted"; children: ReactNode }) => (
  <span
    className={`text-xs px-2 py-0.5 rounded-md border ${
      tone === "bull" ? "text-bull border-bull/40" : tone === "bear" ? "text-bear border-bear/40" : tone === "gold" ? "text-gold border-gold/40" : "text-text-muted border-line"
    }`}
  >
    {children}
  </span>
);

export default function EvidenceGrid({ data, engine }: { data: AnalysisData; engine: EngineResult }) {
  const { t } = useLanguage();
  const m = engine.market;
  const tf = tfLabel(engine.interval);
  const htfTf = engine.interval ? HIGHER_TF_LABEL[engine.interval] ?? "" : "";
  const none = t("analyzerV2.evidence.noHistory");

  const confirmed = [
    ...(engine.closedCandles ? [fill(t("analyzerV2.evidence.candles"), { n: engine.closedCandles, tf })] : []),
    ...(data.observations?.confirmed ?? []),
  ];
  const uncertain = data.observations?.uncertain ?? [];

  return (
    <Frame eyebrow={t("analyzerV2.evidence.confirmed") + " · " + t("analyzerV2.evidence.uncertain")} title={t("analyzerV2.evidence.title")}>
      {m ? (
        <div className="grid gap-3 @md:grid-cols-2 @3xl:grid-cols-3">
          <Tile title={t("analyzerV2.evidence.emaStack")} tf={tf}>
            <ul className="space-y-2">
              {([["20", m.ema20], ["50", m.ema50], ["200", m.ema200]] as const).map(([n, v]) => (
                <li key={n} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-text-muted">
                    {t("analyzerV2.evidence.ema")} {n}
                  </span>
                  {v === null ? (
                    <span className="text-xs text-text-muted">{none}</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Num>{px(v)}</Num>
                      <Chip tone={m.price > v ? "bull" : "bear"}>{m.price > v ? t("analyzerV2.evidence.above") : t("analyzerV2.evidence.below")}</Chip>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Tile>

          <Tile title={t("analyzerV2.evidence.rsi")} tf={tf}>
            {m.rsi14 === null ? (
              <span className="text-sm text-text-muted">{none}</span>
            ) : (
              <>
                <div className="flex items-baseline justify-between">
                  <Num className="text-2xl font-semibold">{m.rsi14.toFixed(1)}</Num>
                  <Chip tone={m.rsi14 >= 70 ? "bear" : m.rsi14 <= 30 ? "bull" : "muted"}>
                    {m.rsi14 >= 70 ? t("analyzerV2.evidence.overbought") : m.rsi14 <= 30 ? t("analyzerV2.evidence.oversold") : t("analyzerV2.evidence.neutral")}
                  </Chip>
                </div>
                <div dir="ltr" className="relative mt-3 h-2 rounded-full bg-line overflow-hidden">
                  <div className="absolute inset-y-0 left-0 w-[30%] bg-bull/25" />
                  <div className="absolute inset-y-0 right-0 w-[30%] bg-bear/25" />
                  <div className="absolute top-[-3px] h-[14px] w-[3px] rounded bg-gold" style={{ left: `calc(${Math.min(100, Math.max(0, m.rsi14))}% - 1.5px)` }} />
                </div>
              </>
            )}
          </Tile>

          <Tile title={t("analyzerV2.evidence.macd")} tf={tf}>
            {m.macd === null ? (
              <span className="text-sm text-text-muted">{none}</span>
            ) : (
              <>
                <div className="mb-2">
                  <Chip tone={m.macd.histogram >= 0 ? "bull" : "bear"}>{m.macd.histogram >= 0 ? t("analyzerV2.evidence.macdBull") : t("analyzerV2.evidence.macdBear")}</Chip>
                </div>
                <ul className="space-y-1.5 text-sm">
                  {([["macdLine", m.macd.line], ["macdSignal", m.macd.signal], ["macdHist", m.macd.histogram]] as const).map(([k, v]) => (
                    <li key={k} className="flex justify-between">
                      <span className="text-text-muted">{t(`analyzerV2.evidence.${k}`)}</span>
                      <Num>{px(v)}</Num>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Tile>

          <Tile title={t("analyzerV2.evidence.volume")} tf={tf}>
            <div className="flex items-center justify-between">
              <Chip tone={m.volume.trend === "expanding" ? "bull" : m.volume.trend === "contracting" ? "bear" : "muted"}>
                {t(`analyzerV2.evidence.${m.volume.trend === "expanding" ? "exp" : m.volume.trend === "contracting" ? "con" : m.volume.trend === "flat" ? "flat" : "unknown"}`)}
              </Chip>
              {m.volume.lastVsAvg20 !== null && (
                <span className="text-sm">
                  <Num className="font-semibold">{m.volume.lastVsAvg20.toFixed(2)}×</Num>
                </span>
              )}
            </div>
            <div className="mt-2 text-xs text-text-muted">{t("analyzerV2.evidence.lastVsAvg")}</div>
            <div className="mt-2 text-sm">
              {m.volume.breakoutConfirmation === "high-close-on-high-volume"
                ? t("analyzerV2.evidence.breakoutHigh")
                : m.volume.breakoutConfirmation === "low-close-on-high-volume"
                  ? t("analyzerV2.evidence.breakoutLow")
                  : t("analyzerV2.evidence.breakoutNone")}
            </div>
          </Tile>

          <Tile title={t("analyzerV2.evidence.atr")} tf={tf}>
            <Num className="text-2xl font-semibold">{px(m.atr)}</Num>
            <div className="mt-1 text-sm text-text-muted">
              {fill(t("analyzerV2.evidence.atrPct"), { p: ((m.atr / m.price) * 100).toFixed(2) })}
            </div>
          </Tile>

          <Tile title={t("analyzerV2.evidence.htf")} tf={htfTf}>
            {engine.higherTimeframe ? (
              <Chip tone={engine.higherTimeframe.direction === "Bullish" ? "bull" : engine.higherTimeframe.direction === "Bearish" ? "bear" : "gold"}>
                {t(`analyzerV2.state.${engine.higherTimeframe.direction}`)}
              </Chip>
            ) : (
              <span className="text-sm text-text-muted">{t("analyzerV2.evidence.htfNA")}</span>
            )}
          </Tile>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-line p-4 text-sm text-text-muted">{t("analyzerV2.ladder.empty")}</div>
      )}

      {(confirmed.length > 0 || uncertain.length > 0) && (
        <div className="mt-4 grid gap-3 @2xl:grid-cols-2">
          <FactList title={t("analyzerV2.evidence.confirmed")} items={confirmed} tone="bull" />
          <FactList title={t("analyzerV2.evidence.uncertain")} items={uncertain} tone="gold" />
        </div>
      )}
    </Frame>
  );
}

function FactList({ title, items, tone }: { title: string; items: string[]; tone: "bull" | "gold" }) {
  return (
    <div className={`rounded-xl border p-4 ${tone === "bull" ? "border-bull/25" : "border-gold/30 border-dashed"}`}>
      <div className={`text-label ${tone === "bull" ? "text-bull" : "text-gold"}`}>{title}</div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-text-muted">—</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="text-sm leading-relaxed flex gap-2">
              <span aria-hidden className={`mt-2 w-1.5 h-1.5 rounded-full shrink-0 ${tone === "bull" ? "bg-bull" : "bg-gold"}`} />
              <span className="text-text-muted">{it}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
