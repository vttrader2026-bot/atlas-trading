"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trade, feesOf, grossPnl, investedOf, plannedLoss, pnlPct, realizedPnl, roiPct, statusOf, unrealizedPnl } from "@/lib/journal";
import { price, qty, signedPct, signedUsd, tone, usd } from "./format";

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
function Text({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs text-text-muted">{label}</div>
      <p className="mt-0.5 text-sm whitespace-pre-wrap break-words">{value}</p>
    </div>
  );
}

export default function TradeDetails({
  trade, livePrice, onClose, onEdit, onDelete, t,
}: {
  trade: Trade; livePrice: number | null; onClose: () => void; onEdit: (closeIt: boolean) => void; onDelete: () => void; t: (k: string) => string;
}) {
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const closed = statusOf(trade) === "closed";
  const realized = realizedPnl(trade);
  const px = livePrice ?? trade.markPrice ?? null;
  const unreal = unrealizedPnl(trade, px);
  const inv = investedOf(trade);
  const pl = plannedLoss(trade);
  const tps = [trade.tp1 ?? (trade.target || null), trade.tp2, trade.tp3];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t("journal.details")} onClick={(e) => e.stopPropagation()}
        className="card w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto p-5 sm:p-6 rounded-b-none sm:rounded-b-[inherit]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-label">{t("journal.details")}</div>
            <h2 className="mt-1 text-2xl font-bold"><Num>{trade.pair}</Num></h2>
            <div className="mt-1 flex flex-wrap gap-2 items-center">
              <span className={`tag ${closed ? "tag-bull" : ""}`}>{closed ? t("journal.statusClosed") : t("journal.statusOpen")}</span>
              {trade.side === "Short" && <span className="tag">{t("journal.legacyShort")}</span>}
              {trade.source === "plan" && <span className="tag">{t("journal.fromPlan")}</span>}
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn-secondary">{t("journal.close")}</button>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Row label={t("journal.fEntryDate")}><Num>{trade.date}</Num></Row>
          <Row label={t("journal.fEntryPrice")}><Num>{price(trade.entry)}</Num></Row>
          <Row label={t("journal.fStop")}><Num>{trade.stop ? price(trade.stop) : "—"}</Num></Row>
          {closed && <Row label={t("journal.fExitDate")}><Num>{trade.exitDate || "—"}</Num></Row>}
          {closed && <Row label={t("journal.fExitPrice")}><Num>{price(trade.exit)}</Num></Row>}
          <Row label={t("journal.fInvested")}><Num>{usd(inv)}</Num></Row>
          <Row label={t("journal.fQuantity")}><Num>{qty(trade.size)}</Num></Row>
          <Row label={t("journal.fFees")}><Num>{feesOf(trade) ? usd(feesOf(trade)) : "—"}</Num></Row>
          {pl !== null && <Row label={t("journal.plannedLoss")}><Num cls="text-bear">{usd(pl)}</Num></Row>}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4">
          {tps.map((v, i) => <Row key={i} label={`TP${i + 1}`}><Num>{v ? price(v) : "—"}</Num></Row>)}
        </div>

        <div className="mt-5 pt-5 border-t border-line grid grid-cols-2 sm:grid-cols-3 gap-4">
          {closed && realized !== null && trade.exit !== null ? (
            <>
              <Row label={t("journal.grossPnl")}><Num cls={tone(grossPnl(trade, trade.exit))}>{signedUsd(grossPnl(trade, trade.exit))}</Num></Row>
              <Row label={t("journal.netPnl")}><Num cls={`text-lg ${tone(realized)}`}>{signedUsd(realized)}</Num></Row>
              <Row label={t("journal.pnlPct")}><Num cls={tone(pnlPct(trade))}>{pnlPct(trade) === null ? "—" : signedPct(pnlPct(trade) as number)}</Num></Row>
              <Row label={t("journal.roi")}><Num cls={tone(roiPct(trade))}>{roiPct(trade) === null ? "—" : signedPct(roiPct(trade) as number)}</Num></Row>
            </>
          ) : (
            <>
              <Row label={t("journal.livePrice")}><Num>{px === null ? "—" : price(px)}</Num></Row>
              <Row label={t("journal.unrealizedPnl")}><Num cls={`text-lg ${tone(unreal)}`}>{unreal === null ? "—" : signedUsd(unreal)}</Num></Row>
              <Row label={t("journal.roi")}>
                <Num cls={tone(unreal)}>{unreal === null || !(inv > 0) ? "—" : signedPct((unreal / inv) * 100)}</Num>
              </Row>
            </>
          )}
        </div>

        <div className="mt-5 space-y-3">
          <Text label={t("journal.fStrategy")} value={trade.strategy} />
          <Text label={t("journal.fEntryReason")} value={trade.entryReason} />
          <Text label={t("journal.fNotes")} value={trade.notes} />
          <Text label={t("journal.fLessons")} value={trade.lessons} />
        </div>

        {confirming ? (
          <div className="mt-6 rounded-md border border-bear p-4" role="alertdialog" aria-label={t("journal.confirmDeleteTitle")}>
            <div className="font-semibold">{t("journal.confirmDeleteTitle")}</div>
            <p className="mt-1 text-sm text-text-muted">{t("journal.confirmDeleteBody")}</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button type="button" onClick={onDelete} className="btn-primary !bg-bear !border-bear">{t("journal.confirmDelete")}</button>
              <button type="button" onClick={() => setConfirming(false)} className="btn-secondary">{t("journal.cancel")}</button>
            </div>
          </div>
        ) : (
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => onEdit(!closed)} className="btn-primary">{closed ? t("journal.edit") : t("journal.closeTrade")}</button>
            {!closed && <button type="button" onClick={() => onEdit(false)} className="btn-secondary">{t("journal.edit")}</button>}
            <button type="button" onClick={() => setConfirming(true)} className="btn-secondary hover:text-bear">{t("journal.delete")}</button>
            {trade.planId && <Link href="/trade-plan" className="btn-secondary">{t("journal.openPlan")}</Link>}
          </div>
        )}
      </div>
    </div>
  );
}
