"use client";

// JOURNAL-TABS-v1: Open Trades (MANAGE) / Closed Trades (REVIEW) views over the SAME Journal data.
// Nothing is recalculated here: every figure comes from the existing engine (statusOf, remainingQty, pnlCell, ...).
import { Trade, SortKey, exitsOf, filterAndSort, investedOf, realizedPnl, remainingQty, statusOf } from "@/lib/journal";
import { isMonitorable } from "@/lib/autoSl";
import { Num, Query, pnlCell } from "./History";
import { price, qty, signedPct, signedUsd, tone, usd } from "./format";

export type View = "open" | "closed";
type T = (k: string) => string;

export function splitCounts(trades: Trade[]): { open: number; closed: number } {
  const open = trades.filter((x) => statusOf(x) === "open").length;
  return { open, closed: trades.length - open };
}

function stopStatus(tr: Trade, t: T): { text: string; on: boolean } {
  if (!(tr.stop > 0)) return { text: t("journal.noStop"), on: false };
  return isMonitorable(tr) ? { text: t("journal.autoSlWatching"), on: true } : { text: t("journal.autoSlOff"), on: false };
}

function outcomeOf(tr: Trade): "win" | "loss" | "even" {
  const p = realizedPnl(tr) ?? 0;
  return p > 0 ? "win" : p < 0 ? "loss" : "even";
}

function Tab({ active, onClick, accent, label, count, eyebrow }: { active: boolean; onClick: () => void; accent: string; label: string; count: number; eyebrow: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{ "--acc": accent } as React.CSSProperties}
      className={`group flex-1 rounded-xl border px-4 py-3 text-start transition-all duration-200 ${
        active ? "border-[var(--acc)] bg-[color-mix(in_srgb,var(--acc)_12%,var(--surface))] shadow-[0_8px_24px_-14px_var(--acc)]" : "border-line bg-surface hover:border-[color-mix(in_srgb,var(--acc)_50%,var(--line))]"
      }`}
    >
      <span className="block font-data text-[0.68rem] tracking-[0.22em] text-[var(--acc)]">{eyebrow}</span>
      <span className="mt-1 flex items-center justify-between gap-3">
        <span className={`text-base sm:text-lg font-semibold ${active ? "text-text" : "text-text-muted group-hover:text-text"}`}>{label}</span>
        <span dir="ltr" className={`font-data rounded-full px-2.5 py-0.5 text-sm font-semibold ${active ? "bg-[var(--acc)] text-[var(--bg)]" : "bg-surface-raised text-text-muted"}`}>{count}</span>
      </span>
    </button>
  );
}

export default function TradeViews({
  trades, view, setView, q, setQ, prices, onOpen, onCloseTrade, highlight, t,
}: {
  trades: Trade[]; view: View; setView: (v: View) => void; q: Query; setQ: (q: Query) => void; prices: Record<string, number>;
  onOpen: (id: string) => void; onCloseTrade: (tr: Trade) => void; highlight: string | null; t: T;
}) {
  const counts = splitCounts(trades);
  const rows = filterAndSort(trades, { query: q.query, status: view, sort: q.sort, desc: q.desc });
  const isOpen = view === "open";
  const acc = isOpen ? "var(--bull)" : "var(--gold)";
  const fill = (s: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((a, [k, v]) => a.replace(`{${k}}`, String(v)), s);

  const wins = isOpen ? 0 : rows.filter((x) => outcomeOf(x) === "win").length;
  const losses = isOpen ? 0 : rows.filter((x) => outcomeOf(x) === "loss").length;
  const realizedTotal = isOpen ? 0 : rows.reduce((a, x) => a + (realizedPnl(x) ?? 0), 0);

  return (
    <section className="mt-8" aria-label={t("journal.history")}>
      <div role="tablist" aria-label={t("journal.history")} className="flex flex-col sm:flex-row gap-3">
        <Tab active={isOpen} onClick={() => setView("open")} accent="var(--bull)" label={t("journal.tabOpen")} count={counts.open} eyebrow={t("journal.manageEyebrow")} />
        <Tab active={!isOpen} onClick={() => setView("closed")} accent="var(--gold)" label={t("journal.tabClosed")} count={counts.closed} eyebrow={t("journal.reviewEyebrow")} />
      </div>

      <div className="mt-4 rounded-2xl border border-line border-t-2 bg-surface/40 p-4 sm:p-5" style={{ borderTopColor: acc }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-text-muted leading-relaxed">{t(isOpen ? "journal.manageHint" : "journal.reviewHint")}</p>
          {!isOpen && rows.length > 0 && (
            <p className="font-data text-xs sm:text-sm text-text-muted">
              <span dir="ltr" style={{ unicodeBidi: "isolate" }}>{fill(t("journal.closedSummary"), { w: wins, l: losses })}</span>
              {" · "}
              <Num cls={tone(realizedTotal)}>{signedUsd(realizedTotal)}</Num>
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input type="search" value={q.query} onChange={(e) => setQ({ ...q, query: e.target.value })} placeholder={t("journal.search")} aria-label={t("journal.search")} className="input flex-1 min-w-[12rem]" />
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
          <div className="mt-4 card p-8 text-center text-text-muted text-sm">
            {q.query.trim() ? t("journal.noMatches") : t(isOpen ? "journal.noOpenTrades" : "journal.noClosedTrades")}
          </div>
        ) : isOpen ? (
          <OpenRows rows={rows} prices={prices} onOpen={onOpen} onCloseTrade={onCloseTrade} highlight={highlight} t={t} fill={fill} />
        ) : (
          <ClosedRows rows={rows} prices={prices} onOpen={onOpen} highlight={highlight} t={t} />
        )}
      </div>
    </section>
  );
}

type RowProps = { rows: Trade[]; prices: Record<string, number>; onOpen: (id: string) => void; highlight: string | null; t: T };

function OpenRows({ rows, prices, onOpen, onCloseTrade, highlight, t, fill }: RowProps & { onCloseTrade: (tr: Trade) => void; fill: (s: string, v: Record<string, string | number>) => string }) {
  const model = (tr: Trade) => {
    const c = pnlCell(tr, prices);
    const cur = prices[tr.pair] ?? tr.markPrice ?? null;
    return {
      c,
      cur,
      left: remainingQty(tr),
      exits: exitsOf(tr).length,
      realized: c.parts ? c.parts.realized : null,
      unreal: c.parts ? c.parts.unrealized : c.value,
      stop: stopStatus(tr, t),
    };
  };
  const Actions = ({ tr }: { tr: Trade }) => (
    <div className="flex flex-wrap gap-2 whitespace-nowrap">
      <button type="button" onClick={() => onOpen(tr.id)} className="btn-secondary !py-1.5">{t("journal.btnManage")}</button>
      <button type="button" onClick={() => onCloseTrade(tr)} className="btn-primary !py-1.5">{t("journal.btnClosePos")}</button>
    </div>
  );
  return (
    <>
      <div className="hidden lg:block mt-4 card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-text-muted">
            <tr>
              {["colPair", "colEntry", "colCurrent", "colRemaining", "colRealized", "colUnrealized", "colRoi", "colStopSl"].map((k, i) => (
                <th key={k} scope="col" className={`px-3 py-3 font-normal ${i >= 1 && i <= 6 ? "text-end" : "text-start"}`}>{t(`journal.${k}`)}</th>
              ))}
              <th scope="col" className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((tr) => {
              const m = model(tr);
              return (
                <tr key={tr.id} className={`border-t border-line align-top hover:bg-surface-raised ${highlight === tr.id ? "bg-surface-raised" : ""}`}>
                  <td className="px-3 py-3">
                    <Num cls="font-semibold">{tr.pair}</Num>
                    <div className="mt-0.5 text-xs text-text-muted"><Num>{tr.date}</Num>{m.exits > 0 && <span className="tag ms-2">{fill(t("journal.partialN"), { n: m.exits })}</span>}</div>
                  </td>
                  <td className="px-3 py-3 text-end"><Num>{price(tr.entry)}</Num></td>
                  <td className="px-3 py-3 text-end"><Num>{price(m.cur)}</Num></td>
                  <td className="px-3 py-3 text-end"><Num>{qty(m.left)}</Num><div className="text-[10px] text-text-muted">{fill(t("journal.ofSize"), { n: qty(tr.size) })}</div></td>
                  <td className="px-3 py-3 text-end"><Num cls={tone(m.realized)}>{m.realized === null ? "—" : signedUsd(m.realized)}</Num></td>
                  <td className="px-3 py-3 text-end"><Num cls={tone(m.unreal)}>{m.unreal === null ? "—" : signedUsd(m.unreal)}</Num></td>
                  <td className="px-3 py-3 text-end"><Num cls={tone(m.c.roi)}>{m.c.roi === null ? "—" : signedPct(m.c.roi)}</Num></td>
                  <td className="px-3 py-3 text-xs">
                    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${m.stop.on ? "text-bull" : "text-text-muted"}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${m.stop.on ? "bg-bull" : "bg-line"}`} />{m.stop.text}</span>
                    {tr.stop > 0 && <div className="mt-0.5 text-text-muted"><Num>{price(tr.stop)}</Num></div>}
                  </td>
                  <td className="px-3 py-3"><Actions tr={tr} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="lg:hidden mt-4 space-y-3">
        {rows.map((tr) => {
          const m = model(tr);
          return (
            <li key={tr.id} className={`card p-4 border-s-4 border-s-bull ${highlight === tr.id ? "card-accent" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Num cls="text-lg font-semibold">{tr.pair}</Num>
                  <div className="mt-0.5 text-xs text-text-muted"><Num>{tr.date}</Num>{m.exits > 0 && <span className="tag ms-2">{fill(t("journal.partialN"), { n: m.exits })}</span>}</div>
                </div>
                <div className="text-end">
                  <Num cls={`text-xl ${tone(m.c.value)}`}>{m.c.value === null ? "—" : signedUsd(m.c.value)}</Num>
                  {m.c.roi !== null && <div className="text-xs"><Num cls={tone(m.c.roi)}>{signedPct(m.c.roi)}</Num></div>}
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div><dt className="text-text-muted">{t("journal.colEntry")}</dt><dd><Num>{price(tr.entry)}</Num></dd></div>
                <div><dt className="text-text-muted">{t("journal.colCurrent")}</dt><dd><Num>{price(m.cur)}</Num></dd></div>
                <div><dt className="text-text-muted">{t("journal.colRemaining")}</dt><dd><Num>{qty(m.left)}</Num> <span className="text-text-muted">{fill(t("journal.ofSize"), { n: qty(tr.size) })}</span></dd></div>
                <div><dt className="text-text-muted">{t("journal.colRealized")}</dt><dd><Num cls={tone(m.realized)}>{m.realized === null ? "—" : signedUsd(m.realized)}</Num></dd></div>
                <div><dt className="text-text-muted">{t("journal.colUnrealized")}</dt><dd><Num cls={tone(m.unreal)}>{m.unreal === null ? "—" : signedUsd(m.unreal)}</Num></dd></div>
                <div><dt className="text-text-muted">{t("journal.colStopSl")}</dt><dd className={m.stop.on ? "text-bull" : "text-text-muted"}>{m.stop.text}{tr.stop > 0 && <> · <Num>{price(tr.stop)}</Num></>}</dd></div>
              </dl>
              <div className="mt-4"><Actions tr={tr} /></div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ClosedRows({ rows, prices, onOpen, highlight, t }: RowProps) {
  const Outcome = ({ tr }: { tr: Trade }) => {
    const o = outcomeOf(tr);
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className={`tag ${o === "win" ? "tag-bull" : ""} ${o === "loss" ? "!text-bear" : ""}`}>{t(o === "win" ? "journal.outcomeWin" : o === "loss" ? "journal.outcomeLoss" : "journal.outcomeEven")}</span>
        {tr.exitSource === "auto-sl" && <span className="tag" title={t("journal.autoSlNote")}>{t("journal.autoSlTag")}</span>}
      </span>
    );
  };
  return (
    <>
      <div className="hidden md:block mt-4 card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-text-muted">
            <tr>
              {["colPair", "colDate", "colClosedOn", "colEntry", "colExit", "colPnl", "colRoi", "colOutcome"].map((k, i) => (
                <th key={k} scope="col" className={`px-4 py-3 font-normal ${i >= 3 && i <= 6 ? "text-end" : "text-start"}`}>{t(`journal.${k}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((tr) => {
              const c = pnlCell(tr, prices);
              return (
                <tr key={tr.id} onClick={() => onOpen(tr.id)} tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(tr.id)}
                  className={`border-t border-line cursor-pointer hover:bg-surface-raised focus:outline-none focus-visible:bg-surface-raised ${highlight === tr.id ? "bg-surface-raised" : ""}`}>
                  <td className="px-4 py-3"><Num cls="font-semibold">{tr.pair}</Num></td>
                  <td className="px-4 py-3 text-text-muted"><Num>{tr.date}</Num></td>
                  <td className="px-4 py-3 text-text-muted"><Num>{tr.exitDate || "—"}</Num></td>
                  <td className="px-4 py-3 text-end"><Num>{price(tr.entry)}</Num></td>
                  <td className="px-4 py-3 text-end"><Num>{price(tr.exit)}</Num></td>
                  <td className="px-4 py-3 text-end"><Num cls={tone(c.value)}>{c.value === null ? "—" : signedUsd(c.value)}</Num></td>
                  <td className="px-4 py-3 text-end"><Num cls={tone(c.roi)}>{c.roi === null ? "—" : signedPct(c.roi)}</Num></td>
                  <td className="px-4 py-3"><Outcome tr={tr} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="md:hidden mt-4 space-y-3">
        {rows.map((tr) => {
          const c = pnlCell(tr, prices);
          return (
            <li key={tr.id}>
              <button type="button" onClick={() => onOpen(tr.id)} className={`card w-full p-4 text-start border-s-4 border-s-gold ${highlight === tr.id ? "card-accent" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Num cls="text-lg font-semibold">{tr.pair}</Num>
                    <div className="mt-1"><Outcome tr={tr} /></div>
                  </div>
                  <div className="text-end">
                    <Num cls={`text-xl ${tone(c.value)}`}>{c.value === null ? "—" : signedUsd(c.value)}</Num>
                    {c.roi !== null && <div className="text-xs"><Num cls={tone(c.roi)}>{signedPct(c.roi)}</Num></div>}
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div><dt className="text-text-muted">{t("journal.colEntry")}</dt><dd><Num>{price(tr.entry)}</Num></dd></div>
                  <div><dt className="text-text-muted">{t("journal.colExit")}</dt><dd><Num>{price(tr.exit)}</Num></dd></div>
                  <div><dt className="text-text-muted">{t("journal.entered")}</dt><dd><Num>{tr.date}</Num></dd></div>
                  <div><dt className="text-text-muted">{t("journal.colClosedOn")}</dt><dd><Num>{tr.exitDate || "—"}</Num></dd></div>
                  <div><dt className="text-text-muted">{t("journal.colInvested")}</dt><dd><Num>{usd(investedOf(tr))}</Num></dd></div>
                </dl>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
