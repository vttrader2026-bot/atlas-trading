"use client";
// PERFORMANCE-v1: read-only analytics over the Journal's closed trades. Reads the trades the Journal already keeps on this
// device and never writes them. The optional starting equity is the only thing stored here, on this device only.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { loadTrades, type Trade } from "@/lib/journal";
import { partialRealizedTotal } from "@/lib/exits";
import { computePerformance } from "@/lib/performance";
import { signedUsd } from "@/components/journal/format";
import Filters from "./Filters";
import MetricTiles from "./MetricTiles";
import EquityChart from "./EquityChart";
import StreakCard from "./StreakCard";
import GroupTable from "./GroupTable";
import { fill, parseEquity, rangeFor, type Preset } from "./util";

const EQUITY_KEY = "atlas-trading.performance.startingEquity";

export default function PerformanceView() {
  const { t } = useLanguage();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [mounted, setMounted] = useState(false);
  const [range, setRange] = useState<{ from: string; to: string; preset: Preset | "custom" }>({ from: "", to: "", preset: "all" });
  const [includeEstimated, setIncludeEstimated] = useState(true);
  const [equityText, setEquityText] = useState("");

  useEffect(() => {
    const read = () => setTrades(loadTrades());
    read();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setEquityText(window.localStorage.getItem(EQUITY_KEY) ?? ""); } catch { /* storage unavailable: the field simply starts empty */ }
    setMounted(true);
    window.addEventListener("atlas-journal-updated", read);
    return () => window.removeEventListener("atlas-journal-updated", read);
  }, []);

  const onEquity = (v: string) => {
    setEquityText(v);
    try {
      if (v.trim()) localStorage.setItem(EQUITY_KEY, v);
      else localStorage.removeItem(EQUITY_KEY);
    } catch { /* ignore */ }
  };

  const startingEquity = parseEquity(equityText);
  const all = useMemo(() => computePerformance(trades), [trades]);
  const p = useMemo(
    () => computePerformance(trades, { from: range.from || null, to: range.to || null, includeEstimated, startingEquity }),
    [trades, range.from, range.to, includeEstimated, startingEquity],
  );
  const partial = useMemo(() => partialRealizedTotal(trades), [trades]);

  if (!mounted) return null;
  return (
    <main className="max-w-5xl mx-auto px-6 py-12 sm:py-14">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="max-w-xl">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">{t("perf.title")}</h1>
          <p className="text-text-muted text-sm mt-1">{t("perf.subtitle")}</p>
        </div>
        <Link href="/journal" className="btn-secondary">{t("perf.backToJournal")}</Link>
      </div>
      <p className="mt-3 text-xs text-text-muted">{t("perf.scope")}</p>

      {all.count === 0 ? (
        <div className="card p-8 mt-8 text-center">
          <p className="text-base">{t("perf.empty")}</p>
          <p className="text-sm text-text-muted mt-1">{t("perf.emptyHint")}</p>
        </div>
      ) : (
        <div className="mt-8 space-y-5">
          <Filters t={t} from={range.from} to={range.to} preset={range.preset}
            onPreset={(preset) => setRange({ ...rangeFor(preset), preset })}
            onFrom={(from) => setRange((r) => ({ ...r, from, preset: "custom" }))}
            onTo={(to) => setRange((r) => ({ ...r, to, preset: "custom" }))}
            includeEstimated={includeEstimated} onIncludeEstimated={setIncludeEstimated}
            equityText={equityText} onEquity={onEquity} />

          {p.count === 0 ? (
            <div className="card p-8 text-center text-sm text-text-muted">{t("perf.emptyFiltered")}</div>
          ) : null}

          <MetricTiles p={p} hasEquity={startingEquity !== null} t={t} />

          <section className="card p-5 sm:p-6" aria-label={t("perf.equityTitle")}>
            <div className="text-label">{t("perf.equityTitle")}</div>
            <p className="text-xs text-text-muted mt-1 mb-4">{t("perf.equitySubtitle")}</p>
            <EquityChart curve={p.curve} t={t} />
          </section>

          <StreakCard s={p.streaks} t={t} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <GroupTable title={t("perf.byCoin")} kind="coin" rows={p.coins} t={t} />
            <GroupTable title={t("perf.byMonth")} kind="month" rows={p.months} t={t} />
          </div>

          <ul className="space-y-1 text-xs text-text-muted list-disc ps-5">
            {p.legacyCount > 0 && <li>{fill(t("perf.noteLegacy"), { n: p.legacyCount })}</li>}
            {p.estimatedCount > 0 && <li>{fill(t("perf.noteEstimated"), { n: p.estimatedCount })}</li>}
            {partial !== null && <li>{fill(t("perf.notePartial"), { amount: signedUsd(partial) })}</li>}
          </ul>
        </div>
      )}
    </main>
  );
}
