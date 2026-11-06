"use client";

// EXIT-STRATEGY-v1: exit strategy, recorded exits, remaining position and realized / unrealized results of one trade.
// Realized = exits the member recorded. Unrealized = the part still held at the live price (a paper figure).
import { useState } from "react";
import { exitsOf, type ExitLevel, type Trade } from "@/lib/journal";
import { allowedLevels, applyExit, correctAutoSlExit, levelPrice, plannedExitQty, positionOf } from "@/lib/exits";
import { ExitStrategyPicker } from "./ExitStrategyPicker";
import { plain, price, qty, signedPct, signedUsd, todayLocal, tone } from "./format";
import { parseInput } from "@/lib/riskCalc";

function Num({ children, cls = "" }: { children: React.ReactNode; cls?: string }) {
  return <span dir="ltr" className={`font-data ${cls}`} style={{ unicodeBidi: "isolate", display: "inline-block" }}>{children}</span>;
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-0.5 text-sm break-words">{children}</div>
    </div>
  );
}

const ERR: Record<string, string> = { price: "journal.p3ErrPrice", date: "journal.p3ErrDate" };

export default function ExitsPanel({ trade, livePrice, onRecord, t }: { trade: Trade; livePrice: number | null; onRecord: (next: Trade) => void; t: (k: string) => string }) {
  const exits = exitsOf(trade);
  const px = livePrice ?? trade.markPrice ?? null;
  const pos = positionOf(trade, px);
  const open = pos.remainingQty > 0;
  return (
    <section className="mt-5 rounded-lg border border-line p-4" aria-label={t("journal.p3ExitsTitle")}>
      <div className="text-label">{t("journal.p3ExitsTitle")}</div>
      <div className="mt-3"><ExitStrategyPicker value={trade.exitStrategy ?? "split"} disabled t={t} /></div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Row label={t("journal.p3Sold")}><Num>{qty(pos.soldQty)}</Num></Row>
        <Row label={t("journal.p3Remaining")}><Num>{qty(pos.remainingQty)}</Num></Row>
        <Row label={t("journal.p3Realized")}><Num cls={tone(exits.length ? pos.realizedPnl : null)}>{exits.length ? signedUsd(pos.realizedPnl) : "—"}</Num></Row>
        <Row label={t("journal.p3RealizedRoi")}><Num cls={tone(pos.realizedRoiPct)}>{pos.realizedRoiPct === null ? "—" : signedPct(pos.realizedRoiPct)}</Num></Row>
        {open && <Row label={t("journal.p3Unrealized")}><Num cls={tone(pos.unrealizedPnl)}>{pos.unrealizedPnl === null ? "—" : signedUsd(pos.unrealizedPnl)}</Num></Row>}
        {open && <Row label={t("journal.p3UnrealizedRoi")}><Num cls={tone(pos.unrealizedRoiPct)}>{pos.unrealizedRoiPct === null ? "—" : signedPct(pos.unrealizedRoiPct)}</Num></Row>}
        <Row label={t("journal.p3Total")}><Num cls={tone(pos.totalPnl)}>{pos.totalPnl === null ? "—" : `${signedUsd(pos.totalPnl)} (${signedPct(pos.totalRoiPct ?? 0)})`}</Num></Row>
      </div>
      {open && px === null && <p className="mt-2 text-xs text-text-muted">{t("journal.p3NoPrice")}</p>}

      {exits.length === 0 ? (
        <p className="mt-4 text-xs text-text-muted">{t("journal.p3NoExits")}</p>
      ) : (
        <ul className="mt-4 grid gap-1 text-sm">
          {exits.map((e, i) => (
            <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/60 pb-1">
              <span className="font-semibold">{e.level}</span>
              <Num>{qty(e.qty)} @ {price(e.price)}</Num>
              <Num cls="text-text-muted">{e.date}</Num>
              <Num cls={tone((e.price - trade.entry) * e.qty)}>{signedUsd((e.price - trade.entry) * e.qty)}</Num>
            </li>
          ))}
        </ul>
      )}

      {trade.exitSource === "auto-sl" && <CorrectExit trade={trade} onRecord={onRecord} t={t} />}
      {trade.autoSl?.correctedAt && <p className="mt-3 text-xs text-text-muted">{t("journal.autoSlCorrected")}</p>}

      {open && allowedLevels(trade).length > 0 && <RecordExit key={`${exits.length}-${allowedLevels(trade).join()}`} trade={trade} onRecord={onRecord} t={t} />}

      <p className="mt-4 text-xs text-text-muted">{t("journal.p3Estimates")}</p>
    </section>
  );
}

function RecordExit({ trade, onRecord, t }: { trade: Trade; onRecord: (next: Trade) => void; t: (k: string) => string }) {
  const levels = allowedLevels(trade);
  const [level, setLevel] = useState<ExitLevel>(levels[0]);
  const [px, setPx] = useState(plain(levelPrice(trade, levels[0])));
  const [date, setDate] = useState(todayLocal());
  const [err, setErr] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = parseInput(px);
    if (p === null) return setErr(t(ERR.price));
    const r = applyExit(trade, { level, price: p, date });
    if (!r.ok) return setErr(t(ERR[r.error] ?? "journal.p3ErrGeneric"));
    setErr(null);
    onRecord(r.trade);
  }

  return (
    <form onSubmit={submit} noValidate className="mt-4 grid gap-3 sm:grid-cols-4 items-end">
      <div>
        <label className="text-xs text-text-muted">{t("journal.p3Level")}</label>
        <select value={level} onChange={(e) => { const l = e.target.value as ExitLevel; setLevel(l); setPx(plain(levelPrice(trade, l))); }} className="input mt-1.5 w-full" dir="ltr">
          {levels.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs text-text-muted">{t("journal.p3ExitPrice")}</label>
        <input value={px} onChange={(e) => setPx(e.target.value)} inputMode="decimal" dir="ltr" className="input mt-1.5 w-full font-data" />
      </div>
      <div>
        <label className="text-xs text-text-muted">{t("journal.p3ExitDate")}</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" className="input mt-1.5 w-full" />
      </div>
      <button type="submit" className="btn-primary">{t("journal.p3RecordExit")}</button>
      <p className="sm:col-span-4 text-xs text-text-muted">{t("journal.p3ExitQty")}: <Num cls="text-text">{qty(plannedExitQty(trade, level))}</Num></p>
      {err && <p className="sm:col-span-4 text-sm text-bear" role="alert">{err}</p>}
    </form>
  );
}

/** Replaces the ESTIMATED automatic stop-loss exit price with the member's real fill. Earlier partial exits are untouched. */
function CorrectExit({ trade, onRecord, t }: { trade: Trade; onRecord: (next: Trade) => void; t: (k: string) => string }) {
  const [px, setPx] = useState("");
  const [err, setErr] = useState(false);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = correctAutoSlExit(trade, parseInput(px) ?? Number.NaN);
    if (!r.ok) return setErr(true);
    setErr(false);
    onRecord(r.trade);
  }
  return (
    <form onSubmit={submit} noValidate className="mt-4 rounded-lg border border-gold/40 bg-gold/10 p-3 grid gap-2 sm:grid-cols-3 items-end">
      <p className="sm:col-span-3 text-xs text-text-muted">{t("journal.autoSlNoteExits")}</p>
      <div className="sm:col-span-2">
        <label className="text-xs text-text-muted">{t("journal.autoSlCorrectLabel")}</label>
        <input value={px} onChange={(e) => setPx(e.target.value)} inputMode="decimal" dir="ltr" className="input mt-1.5 w-full font-data" placeholder={String(trade.autoSl?.estimatedExit ?? "")} />
      </div>
      <button type="submit" className="btn-primary">{t("journal.autoSlCorrectBtn")}</button>
      {err && <p className="sm:col-span-3 text-sm text-bear" role="alert">{t("journal.p3ErrPrice")}</p>}
    </form>
  );
}
