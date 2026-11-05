"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trade, feesOf, grossPnl, investedOf, plannedLoss, pnlPct, realizedPnl, roiPct, statusOf, unrealizedPnl } from "@/lib/journal";
import { signalChanges } from "@/lib/signalLink";
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
              {trade.source === "signal" && <span className="tag">{t("journal.fromSignal")}</span>}
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn-secondary">{t("journal.close")}</button>
        </div>

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Row label={t("journal.fEntryDate")}><Num>{trade.date}</Num></Row>
          <Row label={t("journal.fEntryPrice")}><Num>{price(trade.entry)}</Num></Row>
          <Row label={t("journal.fStop")}><Num>{trade.stop ? price(trade.stop) : "—"}</Num></Row>
          {closed && <Row label={t("journal.fExitDate")}><Num>{trade.exitDate || "—"}</Num></Row>}
          {closed && <Row label={t("journal.fExitPrice")}><Num>{price(trade.exit)}</Num>{trade.exitSource === "auto-sl" && <span className="tag ms-2">{t("journal.autoSlTag")}</span>}</Row>}
          {closed && trade.exitSource === "auto-sl" && (
            <div className="col-span-full rounded-lg border border-gold/40 bg-gold/10 p-3 text-xs text-text-muted">
              {t("journal.autoSlNote")}
              {trade.autoSl && <> <Num>{new Date(trade.autoSl.detectedAt).toISOString().slice(0, 16).replace("T", " ")} UTC</Num></>}
            </div>
          )}
          <Row label={t("journal.fInvested")}><Num>{usd(inv)}</Num></Row>
          <Row label={t("journal.fQuantity")}><Num>{qty(trade.size)}</Num></Row>
          <Row label={t("journal.fFees")}><Num>{feesOf(trade) ? usd(feesOf(trade)) : "—"}</Num></Row>
          {pl !== null && <Row label={t("journal.plannedLoss")}><Num cls="text-bear">{usd(pl)}</Num></Row>}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4">
          {tps.map((v, i) => <Row key={i} label={`TP${i + 1}`}><Num>{v ? price(v) : "—"}</Num></Row>)}
        </div>

        {trade.signal && (
          <section className="mt-5 rounded-lg border border-line p-4" aria-label={t("journal.signalSection")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-label">{t("journal.signalSection")}</span>
              <span className={`tag ${trade.signal.status === "closed" ? "" : "tag-bull"}`}>{trade.signal.status === "closed" ? t("journal.statusClosed") : t("journal.statusOpen")}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <Row label={t("journal.signalIdLabel")}><Num>{trade.signal.tradeId || trade.signal.id.slice(0, 8)}</Num></Row>
              <Row label={t("journal.signalHit")}><Num>{trade.signal.hitLevels.length ? trade.signal.hitLevels.join(", ") : t("journal.signalNoHit")}</Num></Row>
            </div>
            <div className="mt-3 grid grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-1 text-sm items-baseline">
              <span />
              <span className="text-xs text-text-muted">{t("journal.signalOfficial")}</span>
              <span className="text-xs text-text-muted">{t("journal.signalYours")}</span>
              <span className="text-xs text-text-muted">{t("journal.fStop")}</span>
              <Num>{trade.signal.latest.invalidation || "—"}</Num>
              <Num>{trade.stop ? price(trade.stop) : "—"}</Num>
              {tps.map((mine, i) => {
                const off = [trade.signal!.latest.tp1, trade.signal!.latest.tp2, trade.signal!.latest.tp3][i];
                return (
                  <span key={i} className="contents">
                    <span className="text-xs text-text-muted">TP{i + 1}</span>
                    <Num>{off || "—"}</Num>
                    <Num>{mine ? price(mine) : "—"}</Num>
                  </span>
                );
              })}
            </div>
            {signalChanges(trade.signal).length > 0 && (
              <p className="mt-3 text-xs text-gold">
                {t("journal.signalChanged")}. {t("journal.signalChangedNote")}
              </p>
            )}
          </section>
        )}

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
