"use client";

import { Trade, SortKey, StatusFilter, investedOf, realizedPnl, roiPct, statusOf, unrealizedPnl } from "@/lib/journal";
import { price, signedPct, signedUsd, tone, usd } from "./format";

export type Query = { query: string; status: StatusFilter; sort: SortKey; desc: boolean };

function Num({ children, cls = "" }: { children: React.ReactNode; cls?: string }) {
  return <span dir="ltr" className={`font-data ${cls}`} style={{ unicodeBidi: "isolate", display: "inline-block" }}>{children}</span>;
}

function StatusTag({ trade, t }: { trade: Trade; t: (k: string) => string }) {
  const open = statusOf(trade) === "open";
  return <span className={`tag ${open ? "" : "tag-bull"}`}>{open ? t("journal.statusOpen") : t("journal.statusClosed")}</span>;
}

/** Realized PnL for closed trades, live/manual unrealized for open ones. */
export function pnlCell(tr: Trade, prices: Record<string, number>) {
  const realized = realizedPnl(tr);
  if (realized !== null) return { value: realized, live: false, roi: roiPct(tr) };
  const p = unrealizedPnl(tr, prices[tr.pair] ?? tr.markPrice ?? null);
  const inv = investedOf(tr);
  return { value: p, live: p !== null, roi: p !== null && inv > 0 ? (p / inv) * 100 : null };
}

export default function History({
  rows, q, setQ, prices, onOpen, highlight, t,
}: {
  rows: Trade[]; q: Query; setQ: (q: Query) => void; prices: Record<string, number>; onOpen: (id: string) => void; highlight: string | null; t: (k: string) => string;
}) {
  const filters: StatusFilter[] = ["all", "open", "closed"];
  const label = (f: StatusFilter) => (f === "all" ? t("journal.all") : f === "open" ? t("journal.statusOpen") : t("journal.statusClosed"));
  return (
    <section className="mt-8" aria-label={t("journal.history")}>
      <div className="text-label mb-3">{t("journal.history")}</div>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q.query}
          onChange={(e) => setQ({ ...q, query: e.target.value })}
          placeholder={t("journal.search")}
          aria-label={t("journal.search")}
          className="input flex-1 min-w-[12rem]"
        />
        <div role="group" className="flex rounded-md border border-line overflow-hidden">
          {filters.map((f) => (
            <button key={f} type="button" aria-pressed={q.status === f} onClick={() => setQ({ ...q, status: f })}
              className={`px-3 py-2 text-sm transition-colors ${q.status === f ? "bg-surface-raised text-text" : "text-text-muted hover:text-text"}`}>
              {label(f)}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          {t("journal.sortBy")}
          <select className="input !w-auto" value={q.sort} onChange={(e) => setQ({ ...q, sort: e.target.value as SortKey })}>
            <option value="date">{t("journal.sortDate")}</option>
            <option value="pair">{t("journal.sortPair")}</option>
            <option value="pnl">{t("journal.sortPnl")}</option>
            <option value="invested">{t("journal.sortInvested")}</option>
          </select>
        </label>
        <button type="button" className="btn-secondary" onClick={() => setQ({ ...q, desc: !q.desc })} aria-label={q.desc ? t("journal.descending") : t("journal.ascending")}>
          {q.desc ? "↓" : "↑"} {q.desc ? t("journal.descending") : t("journal.ascending")}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4 card p-8 text-center text-text-muted text-sm">{t("journal.noMatches")}</div>
      ) : (
        <>
          {/* md+: table */}
          <div className="hidden md:block mt-4 card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface text-text-muted">
                <tr>
                  {["colDate", "colPair", "colStatus", "colEntry", "colExit", "colInvested", "colPnl", "colRoi"].map((k, i) => (
                    <th key={k} scope="col" className={`px-4 py-3 font-normal ${i >= 3 ? "text-end" : "text-start"}`}>{t(`journal.${k}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((tr) => {
                  const c = pnlCell(tr, prices);
                  return (
                    <tr key={tr.id} onClick={() => onOpen(tr.id)} tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(tr.id)}
                      className={`border-t border-line cursor-pointer hover:bg-surface-raised focus:outline-none focus-visible:bg-surface-raised ${highlight === tr.id ? "bg-surface-raised" : ""}`}>
                      <td className="px-4 py-3 text-text-muted"><Num>{tr.date}</Num></td>
                      <td className="px-4 py-3"><Num>{tr.pair}</Num></td>
                      <td className="px-4 py-3"><StatusTag trade={tr} t={t} /></td>
                      <td className="px-4 py-3 text-end"><Num>{price(tr.entry)}</Num></td>
                      <td className="px-4 py-3 text-end"><Num>{statusOf(tr) === "closed" ? price(tr.exit) : "—"}</Num>{statusOf(tr) === "closed" && tr.exitSource === "auto-sl" && <span className="tag ms-1" title={t("journal.autoSlNote")}>{t("journal.autoSlTag")}</span>}</td>
                      <td className="px-4 py-3 text-end"><Num>{usd(investedOf(tr))}</Num></td>
                      <td className={`px-4 py-3 text-end ${c.live ? "opacity-80" : ""}`}>
                        <Num cls={tone(c.value)}>{c.value === null ? "—" : signedUsd(c.value)}</Num>
                        {c.live && <span className="ms-1 text-[10px] text-text-muted">{t("journal.live")}</span>}
                      </td>
                      <td className="px-4 py-3 text-end"><Num cls={tone(c.roi)}>{c.roi === null ? "—" : signedPct(c.roi)}</Num></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* mobile: cards */}
          <ul className="md:hidden mt-4 space-y-3">
            {rows.map((tr) => {
              const c = pnlCell(tr, prices);
              return (
                <li key={tr.id}>
                  <button type="button" onClick={() => onOpen(tr.id)} className={`card w-full p-4 text-start ${highlight === tr.id ? "card-accent" : ""}`}>
                    <div className="flex items-center justify-between gap-3">
                      <Num cls="text-base font-semibold">{tr.pair}</Num>
                      <StatusTag trade={tr} t={t} />
                    </div>
                    <div className="mt-1 text-xs text-text-muted"><Num>{tr.date}</Num></div>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div className="text-xs text-text-muted">{t("journal.colInvested")} <Num cls="text-text">{usd(investedOf(tr))}</Num></div>
                      <div className="text-end">
                        <Num cls={`text-lg ${tone(c.value)}`}>{c.value === null ? "—" : signedUsd(c.value)}</Num>
                        {c.roi !== null && <div className="text-xs"><Num cls={tone(c.roi)}>{signedPct(c.roi)}</Num></div>}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
