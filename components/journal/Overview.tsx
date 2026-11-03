"use client";

import type { Dashboard } from "@/lib/journal";
import { pct, signedUsd, tone } from "./format";

function Num({ children, cls = "" }: { children: React.ReactNode; cls?: string }) {
  return <span dir="ltr" className={`font-data ${cls}`} style={{ unicodeBidi: "isolate", display: "inline-block" }}>{children}</span>;
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 text-xl sm:text-2xl truncate">{children}</div>
    </div>
  );
}

export default function Overview({ d, unrealized, t }: { d: Dashboard; unrealized: number | null; t: (k: string) => string }) {
  return (
    <section className="mt-8 card p-5 sm:p-6" aria-label={t("journal.overview")}>
      <div className="text-label mb-4">{t("journal.overview")}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-5">
        <Tile label={t("journal.total")}><Num>{d.total}</Num></Tile>
        <Tile label={t("journal.openTrades")}><Num>{d.open}</Num></Tile>
        <Tile label={t("journal.closedTrades")}><Num>{d.closed}</Num></Tile>
        <Tile label={t("journal.winRate")}><Num>{d.winRate === null ? "—" : pct(d.winRate)}</Num></Tile>
        <Tile label={t("journal.wins")}><Num cls="text-bull">{d.wins}</Num></Tile>
        <Tile label={t("journal.losses")}><Num cls="text-bear">{d.losses}</Num></Tile>
        <Tile label={t("journal.realizedPnl")}><Num cls={tone(d.closed ? d.realizedPnl : null)}>{d.closed ? signedUsd(d.realizedPnl) : "—"}</Num></Tile>
        <Tile label={t("journal.unrealizedTotal")}><Num cls={tone(unrealized)}>{unrealized === null ? "—" : signedUsd(unrealized)}</Num></Tile>
        <Tile label={t("journal.avgWin")}><Num cls="text-bull">{d.avgWin === null ? "—" : signedUsd(d.avgWin)}</Num></Tile>
        <Tile label={t("journal.avgLoss")}><Num cls="text-bear">{d.avgLoss === null ? "—" : signedUsd(d.avgLoss)}</Num></Tile>
        <Tile label={t("journal.best")}>
          {d.best ? <><Num cls="text-bull">{signedUsd(d.best.pnl)}</Num> <span className="text-xs text-text-muted"><Num>{d.best.trade.pair}</Num></span></> : "—"}
        </Tile>
        <Tile label={t("journal.worst")}>
          {d.worst ? <><Num cls={tone(d.worst.pnl)}>{signedUsd(d.worst.pnl)}</Num> <span className="text-xs text-text-muted"><Num>{d.worst.trade.pair}</Num></span></> : "—"}
        </Tile>
      </div>
      <p className="mt-5 text-xs text-text-muted leading-relaxed">{t("journal.dashNote")} {unrealized !== null && t("journal.unrealizedNote")}</p>
    </section>
  );
}
