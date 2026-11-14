"use client";
import type { Performance } from "@/lib/performance";
import { pct, signedPct, signedUsd, usd, tone } from "@/components/journal/format";
import { Num, fill } from "./util";

function Tile({ label, children, hint, extra }: { label: string; children: React.ReactNode; hint?: string; extra?: React.ReactNode }) {
  return (
    <div className="card p-5 min-w-0 flex flex-col">
      <div className="text-label">{label}</div>
      <div className="mt-2 text-2xl sm:text-3xl truncate">{children}</div>
      {hint && <div className="mt-1 text-xs text-text-muted">{hint}</div>}
      {extra}
    </div>
  );
}

export default function MetricTiles({ p, hasEquity, t }: { p: Performance; hasEquity: boolean; t: (k: string) => string }) {
  const pf = p.profitFactor, ex = p.expectancy, r = p.r, dd = p.drawdown;
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-label={t("perf.title")}>
      <Tile label={t("perf.netPnl")}><Num cls={tone(p.count ? p.netPnl : null)}>{p.count ? signedUsd(p.netPnl) : "—"}</Num></Tile>
      <Tile label={t("perf.closedTrades")}><Num>{p.count}</Num></Tile>
      <Tile label={t("perf.profitFactor")}
        hint={pf.value === null ? (p.count ? t("perf.profitFactorNaHint") : undefined) : fill(t("perf.profitFactorHint"), { profit: usd(pf.grossProfit), loss: usd(pf.grossLoss) })}>
        {pf.value === null ? <span className="font-data text-text-muted">{p.count ? t("perf.profitFactorNa") : "—"}</span> : <Num cls={pf.value >= 1 ? "text-bull" : "text-bear"}>{pf.value.toFixed(2)}</Num>}
      </Tile>
      <Tile label={t("perf.expectancy")}
        hint={ex.usd === null ? undefined : ex.pct === null ? t("perf.expectancyHintNoPct") : fill(t("perf.expectancyHint"), { pct: signedPct(ex.pct) })}>
        <Num cls={tone(ex.usd)}>{ex.usd === null ? "—" : signedUsd(ex.usd)}</Num>
      </Tile>
      <Tile label={t("perf.avgR")}
        hint={p.count ? fill(t("perf.avgRIncluded"), { n: r.included, total: p.count }) : undefined}
        extra={<>
          {r.estimatedIncluded > 0 && <div className="mt-1 text-xs text-gold">{fill(t("perf.avgREstimated"), { n: r.estimatedIncluded })}</div>}
          <div className="mt-2 text-xs text-text-muted">{t("perf.avgRLimit")}</div>
        </>}>
        {r.avg === null ? <span className="font-data text-text-muted">{p.count ? t("perf.avgRNa") : "—"}</span> : <Num cls={tone(r.avg)}>{`${r.avg > 0 ? "+" : ""}${r.avg.toFixed(2)}R`}</Num>}
      </Tile>
      <Tile label={t("perf.maxDrawdown")}
        hint={!p.count ? undefined : dd.usd === 0 ? t("perf.maxDrawdownNone") : dd.pct !== null ? fill(t("perf.maxDrawdownPct"), { pct: pct(dd.pct) }) : hasEquity ? undefined : t("perf.maxDrawdownNeedEquity")}>
        {dd.usd > 0 ? <Num cls="text-bear">{`-${usd(dd.usd)}`}</Num> : <Num>{p.count ? usd(0) : "—"}</Num>}
      </Tile>
    </section>
  );
}
