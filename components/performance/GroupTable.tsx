"use client";
import { useState } from "react";
import { sortRows, type GroupKey, type GroupRow } from "@/lib/performance";
import { pct, signedPct, signedUsd, tone } from "@/components/journal/format";
import { Num, fill } from "./util";

export default function GroupTable({ title, kind, rows, t }: { title: string; kind: "coin" | "month"; rows: GroupRow[]; t: (k: string) => string }) {
  const [sort, setSort] = useState<{ by: GroupKey; desc: boolean }>(kind === "month" ? { by: "key", desc: true } : { by: "pnl", desc: true });
  const sorted = sortRows(rows, sort.by, sort.desc);
  const cols: { by: GroupKey; label: string; right: boolean }[] = [
    { by: "key", label: t(kind === "coin" ? "perf.colCoin" : "perf.colMonth"), right: false },
    { by: "trades", label: t("perf.colTrades"), right: true },
    { by: "winRate", label: t("perf.colWinRate"), right: true },
    { by: "pnl", label: t("perf.colPnl"), right: true },
    { by: "avgReturn", label: t("perf.colAvgReturn"), right: true },
  ];
  const click = (by: GroupKey) => setSort((s) => (s.by === by ? { by, desc: !s.desc } : { by, desc: by !== "key" }));
  return (
    <section className="card p-5 sm:p-6" aria-label={title}>
      <div className="text-label mb-3">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-text-muted">
              {cols.map((c) => (
                <th key={c.by} scope="col" className={`py-2 font-medium ${c.right ? "text-end" : "text-start"}`}
                  aria-sort={sort.by === c.by ? (sort.desc ? "descending" : "ascending") : "none"}>
                  <button type="button" onClick={() => click(c.by)} title={fill(t("perf.sortBy"), { col: c.label })} className="inline-flex items-center gap-1 hover:text-text transition-colors">
                    {c.label}<span aria-hidden="true" className={sort.by === c.by ? "text-gold" : "opacity-30"}>{sort.by === c.by ? (sort.desc ? "▼" : "▲") : "↕"}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.key} className="border-t border-line">
                <td className="py-2 text-start"><Num>{r.key}</Num></td>
                <td className="py-2 text-end"><Num>{r.trades}</Num></td>
                <td className="py-2 text-end"><Num>{pct(r.winRate)}</Num></td>
                <td className="py-2 text-end"><Num cls={tone(r.pnl)}>{signedUsd(r.pnl)}</Num></td>
                <td className="py-2 text-end"><Num cls={tone(r.avgReturn)}>{r.avgReturn === null ? "—" : signedPct(r.avgReturn)}</Num></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
