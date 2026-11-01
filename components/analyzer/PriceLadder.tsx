"use client";

import type { EngineResult } from "@/lib/analyzerEngine";
import { useLanguage } from "@/lib/i18n";
import Frame, { Num, TfChip } from "@/components/analyzer/Frame";
import { fill, px, tfLabel } from "@/components/analyzer/types";

type Kind = "res" | "sup" | "price" | "entry" | "tp" | "sl" | "watch";
type Row = { kind: Kind; sort: number; label: string; sub?: string; subNum?: string; value: string; pct: number | null; tie: number };

const zoneText = (low: number, high: number) => (low === high ? px(low) : `${px(low)} – ${px(high)}`);

/**
 * Vertical price ladder. Every row is an engine value (zones, price, plan);
 * the only derived number is the percentage distance from the current price.
 * Entry, stop-loss and targets exist only when the engine produced a plan
 * (VALID_SETUP) — for any other verdict `engine.plan` is null and they are absent.
 */
export default function PriceLadder({ engine }: { engine: EngineResult }) {
  const { t } = useLanguage();
  const m = engine.market;
  const plan = engine.plan;

  if (!m) {
    return (
      <Frame eyebrow={t("analyzerV2.ladder.subtitle")} title={t("analyzerV2.ladder.title")}>
        <div className="rounded-xl border border-dashed border-line p-4 text-sm text-text-muted">{t("analyzerV2.ladder.empty")}</div>
      </Frame>
    );
  }

  const price = m.price;
  const pct = (v: number) => ((v - price) / price) * 100;
  const touches = (n: number) => (n === 1 ? t("analyzerV2.ladder.touch") : fill(t("analyzerV2.ladder.touches"), { n }));
  const rows: Row[] = [];

  // A target that IS a resistance zone is shown once, as the target (no duplicate price rows).
  const targetZones = (z: { low: number; high: number }) => !!plan?.targets.some((tp) => tp.source === "resistance" && tp.price >= z.low && tp.price <= z.high);
  m.resistance.forEach((z, i) =>
    targetZones(z) ? null : rows.push({ kind: "res", sort: z.mid, label: `${t("analyzerV2.ladder.resistance")} ${m.resistance.length - i}`, sub: touches(z.touches), value: zoneText(z.low, z.high), pct: pct(z.mid), tie: 0 })
  );
  rows.push({ kind: "price", sort: price, label: t("analyzerV2.ladder.price"), value: px(price), pct: null, tie: 1 });
  m.support.forEach((z, i) =>
    rows.push({ kind: "sup", sort: z.mid, label: `${t("analyzerV2.ladder.support")} ${i + 1}`, sub: touches(z.touches), value: zoneText(z.low, z.high), pct: pct(z.mid), tie: 0 })
  );

  if (plan) {
    const mid = (plan.entry.low + plan.entry.high) / 2;
    rows.push({ kind: "entry", sort: mid, label: t("analyzerV2.ladder.entry"), value: zoneText(plan.entry.low, plan.entry.high), pct: pct(mid), tie: 0 });
    rows.push({ kind: "sl", sort: plan.stopLoss, label: t("analyzerV2.ladder.stop"), sub: t("analyzerV2.ladder.invalidation"), value: px(plan.stopLoss), pct: pct(plan.stopLoss), tie: 0 });
    plan.targets.forEach((tp, i) =>
      rows.push({ kind: "tp", sort: tp.price, label: t(`analyzerV2.ladder.tp${i + 1}`), subNum: `${tp.rr}R`, sub: t(tp.source === "resistance" ? "analyzerV2.plan.srcResistance" : tp.source === "range_high" ? "analyzerV2.plan.srcRange" : "analyzerV2.plan.srcAtr"), value: px(tp.price), pct: pct(tp.price), tie: 0 })
    );
  } else if (engine.watch) {
    rows.push({ kind: "watch", sort: engine.watch.price, label: t("analyzerV2.ladder.watch"), sub: t("analyzerV2.ladder.watchNote"), value: px(engine.watch.price), pct: pct(engine.watch.price), tie: 0 });
  }

  rows.sort((a, b) => b.sort - a.sort || b.tie - a.tie);

  return (
    <Frame eyebrow={t("analyzerV2.ladder.subtitle")} title={t("analyzerV2.ladder.title")} aside={<TfChip tf={tfLabel(engine.interval)} />}>
      <ol className="relative ms-3 border-s border-line">
        {rows.map((r, i) => (
          <li key={i} className={`relative ps-6 pe-0 py-1.5 ${i === 0 ? "pt-0" : ""}`}>
            <span aria-hidden className={`absolute -start-[6px] top-1/2 -translate-y-1/2 rounded-full ${dot(r.kind)}`} />
            <div className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 ${box(r.kind)}`}>
              <div className="min-w-0">
                <div className={`text-sm font-semibold ${labelTone(r.kind)}`}>
                  {r.label}
                  {r.subNum && <Num className="ms-2 text-xs font-normal text-text-muted">{r.subNum}</Num>}
                  {r.sub && <span className="ms-2 text-xs font-normal text-text-muted">{r.sub}</span>}
                </div>
              </div>
              <div className="text-end shrink-0">
                <Num className={`text-base ${r.kind === "price" ? "font-bold text-gold" : "font-medium"}`}>{r.value}</Num>
                {r.pct !== null && (
                  <div className="text-xs text-text-muted">
                    <Num>
                      {r.pct >= 0 ? "+" : "−"}
                      {Math.abs(r.pct).toFixed(2)}%
                    </Num>
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {!plan && <p className="mt-4 text-sm text-text-muted">{t("analyzerV2.ladder.hidden")}</p>}
    </Frame>
  );
}

function dot(k: Kind): string {
  switch (k) {
    case "price": return "w-3 h-3 bg-gold ring-4 ring-gold/25";
    case "res": return "w-2.5 h-2.5 bg-bear/80";
    case "sup": return "w-2.5 h-2.5 bg-bull/80";
    case "entry": return "w-2.5 h-2.5 bg-gold";
    case "tp": return "w-2.5 h-2.5 bg-bull";
    case "sl": return "w-2.5 h-2.5 bg-bear";
    default: return "w-2.5 h-2.5 border border-dashed border-text-muted bg-bg";
  }
}
function box(k: Kind): string {
  switch (k) {
    case "price": return "bg-gold/10 border border-gold/50";
    case "entry": return "bg-gold/10 border border-gold/40";
    case "tp": return "bg-bull/8 border border-bull/30";
    case "sl": return "bg-bear/10 border border-bear/40";
    case "watch": return "border border-dashed border-text-muted/50";
    default: return "border border-line bg-bg/30";
  }
}
function labelTone(k: Kind): string {
  switch (k) {
    case "price": case "entry": return "text-gold";
    case "tp": case "sup": return "text-bull";
    case "sl": case "res": return "text-bear";
    default: return "text-text-muted";
  }
}
