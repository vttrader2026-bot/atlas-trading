"use client";

// INVEST-SIGNAL-v1: an Investment Signal on the Trade Feed, and its locked placeholder for non-ELITE viewers.
// Not a trade: no entry, stop-loss or targets, no Confirm Trade, no Journal link. "Create My Investment Plan" only OPENS
// Atlas Investor (/investor?plan=COIN); nothing is created there until the member saves their own plan.
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { adminApi } from "@/components/admin/adminApi";
import { useLanguage } from "@/lib/i18n";
import { INVESTMENT_STATUSES, canMoveInvestment, investmentIsOpen, type InvestmentSignal, type InvestmentStatus, type LockedInvestment } from "@/lib/investmentSignal";

const ST_KEY: Record<InvestmentStatus, string> = { active: "stActive", review: "stReview", completed: "stCompleted", cancelled: "stCancelled" };
const ST_CLASS: Record<InvestmentStatus, string> = {
  active: "border-bull/40 bg-bull/10 text-bull",
  review: "border-gold/40 bg-gold/10 text-gold",
  completed: "border-line text-text-muted",
  cancelled: "border-line text-text-muted",
};

export function InvestmentSignalCard({ signal, logo, isOwner = false, onUpdated, onDeleted, onNotice }: {
  signal: InvestmentSignal;
  logo: ReactNode;
  isOwner?: boolean;
  onUpdated?: (s: InvestmentSignal) => void;
  onDeleted?: (id: string) => void;
  onNotice?: (text: string) => void;
}) {
  const { t, lang } = useLanguage();
  const [dialog, setDialog] = useState(false);
  const [delDialog, setDelDialog] = useState(false);
  const [next, setNext] = useState<InvestmentStatus>(signal.status);
  const open = investmentIsOpen(signal);
  const targets = INVESTMENT_STATUSES.filter((s) => canMoveInvestment(signal.status, s));
  const when = new Date(signal.createdAt).toLocaleDateString(lang === "ar" ? "en-GB" : lang === "fr" ? "fr" : "en", { dateStyle: "medium" });
  const block = (key: string, body: string) => (
    <div>
      <h4 className="text-label text-text-muted">{t(`investSignal.${key}`)}</h4>
      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{body}</p>
    </div>
  );
  return (
    <article data-investment-signal={signal.id} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      <div aria-hidden className="h-px w-full bg-gradient-to-r from-transparent via-gold to-transparent" />
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
        <header className="flex min-w-0 items-center gap-3">
          <div className="shrink-0">{logo}</div>
          <div className="min-w-0 flex-1">
            <h3 className="font-heading text-xl font-semibold leading-tight tracking-tight"><span dir="ltr" className="font-data" style={{ unicodeBidi: "isolate" }}>{signal.pair}</span></h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-md border border-gold/40 bg-gold/10 px-2 py-0.5 text-xs font-semibold text-gold">{t("investSignal.tag")}</span>
              {signal.tier === "elite" && <span className="inline-flex items-center rounded-md border border-gold/40 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-gold">ELITE</span>}
              <span data-investment-status={signal.status} className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${ST_CLASS[signal.status]}`}>{t(`investSignal.${ST_KEY[signal.status]}`)}</span>
            </div>
          </div>
          <time dir="ltr" dateTime={new Date(signal.createdAt).toISOString()} className="shrink-0 text-xs text-text-muted">{when}</time>
        </header>

        <p className="text-xs text-text-muted">{t("investSignal.notTrade")}</p>
        <div>
          <h4 className="text-label text-text-muted">{t("investSignal.horizon")}</h4>
          <p className="mt-1 text-sm font-medium">{t("investSignal.months").replace("{n}", String(signal.horizonMonths))}</p>
        </div>
        {block("thesis", signal.thesis)}
        {block("strategy", signal.strategy)}
        {signal.zone && block("zone", signal.zone)}
        {block("risks", signal.risks)}
        {signal.notes && block("notes", signal.notes)}

        <footer className="mt-auto flex flex-col gap-2 border-t border-line pt-3">
          {open && (
            <>
              <Link href={`/investor?plan=${encodeURIComponent(signal.asset)}`} data-investment-create-plan className="btn-primary self-start">{t("investSignal.createPlan")}</Link>
              <p className="text-[11px] leading-snug text-text-muted">{t("investSignal.createPlanNote")}</p>
            </>
          )}
          {isOwner && targets.length > 0 && (
            <button type="button" onClick={() => { setNext(targets[0]); setDialog(true); }} className="btn-secondary self-start">{t("investSignal.changeStatus")}</button>
          )}
          {isOwner && (
            <button type="button" data-investment-delete onClick={() => setDelDialog(true)} className="btn-secondary self-start text-bear">{t("investSignal.deleteBtn")}</button>
          )}
        </footer>
      </div>

      {delDialog && (
        <ConfirmDialog title={t("investSignal.deleteTitle")} confirmLabel={t("investSignal.deleteConfirm")} danger onClose={() => setDelDialog(false)}
          onConfirm={async () => {
            const r = await adminApi(`/api/admin/investment-signals/${encodeURIComponent(signal.id)}`, "DELETE", { confirm: true });
            if (!r.ok) return r.error || t("investSignal.errGeneric");
            onDeleted?.(signal.id);
            onNotice?.(t("investSignal.deleted"));
            return null;
          }}>
          <p>{t("investSignal.deleteNote")}</p>
        </ConfirmDialog>
      )}
      {dialog && (
        <ConfirmDialog title={t("investSignal.statusTitle")} confirmLabel={t("investSignal.statusSave")} onClose={() => setDialog(false)}
          onConfirm={async () => {
            const r = await adminApi<{ signal?: InvestmentSignal }>(`/api/admin/investment-signals/${encodeURIComponent(signal.id)}/status`, "POST", { confirm: true, status: next });
            if (!r.ok) return r.error || t("investSignal.errGeneric");
            if (r.data.signal) onUpdated?.(r.data.signal);
            onNotice?.(t("investSignal.statusDone"));
            return null;
          }}>
          <p>{t("investSignal.statusNote")}</p>
          <div>
            <label htmlFor={`inv-st-${signal.id}`} className="text-xs text-text-muted">{t("investSignal.statusLabel")}</label>
            <select id={`inv-st-${signal.id}`} value={next} onChange={(e) => setNext(e.target.value as InvestmentStatus)} className="input mt-1 w-full">
              {targets.map((s) => <option key={s} value={s}>{t(`investSignal.${ST_KEY[s]}`)}</option>)}
            </select>
          </div>
        </ConfirmDialog>
      )}
    </article>
  );
}

/** What a member without ELITE access sees: the coin and that it is an ELITE idea, nothing else. */
export function LockedInvestmentCard({ signal, logo }: { signal: LockedInvestment; logo: ReactNode }) {
  const { t } = useLanguage();
  return (
    <article data-investment-locked className="flex flex-col gap-3 rounded-2xl border border-gold/25 bg-surface p-4 sm:p-5">
      <header className="flex min-w-0 items-center gap-3">
        <div className="shrink-0">{logo}</div>
        <div className="min-w-0">
          <h3 className="font-heading text-xl font-semibold leading-tight"><span dir="ltr" className="font-data" style={{ unicodeBidi: "isolate" }}>{signal.pair}</span></h3>
          <span className="mt-1 inline-flex items-center rounded-md border border-gold/40 bg-gold/10 px-2 py-0.5 text-xs font-semibold text-gold">{t("investSignal.eliteLocked")}</span>
        </div>
      </header>
      <p className="text-sm text-text-muted"><span aria-hidden>🔒 </span>{t("investSignal.eliteLockedMsg")}</p>
      <Link href="/elite" className="btn-primary self-start">{t("tradeFeed.unlockElite")}</Link>
    </article>
  );
}
