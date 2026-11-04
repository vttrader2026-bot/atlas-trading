"use client";

// ATLAS-SIGNAL-ACTIONS-v1
// The three connected actions on a Trade Feed signal: Create Trade Plan, I Took This Trade, Watch Signal.
// Nothing here changes the official signal. "I Took This Trade" only writes a Journal trade after the
// user types the price they actually paid and confirms.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import type { PublishedTrade } from "@/lib/tradeFeed";
import { loadTrades, saveTrades, validateTrade } from "@/lib/journal";
import { parseInput } from "@/lib/riskCalc";
import { isLiveSignal, isLongSignal, numericLevels, linkFromSignal, signalToTrade, watchUpdates, type Watched } from "@/lib/signalLink";
import { JOURNAL_EVENT } from "@/lib/signalSync";
import { plain, todayLocal } from "@/components/journal/format";

const ISSUE_KEY: Record<string, string> = {
  entry: "journal.errEntry", quantity: "journal.errInvested", invested: "journal.errInvested", stop: "journal.errStop",
  date: "journal.errDate", fees: "journal.errFees", tp: "journal.errTp", tpOrder: "journal.errTpOrder", pair: "journal.errPair",
};

const pill = "inline-flex items-center justify-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap";
const pillIdle = "border-line text-text-muted hover:text-text hover:border-text-muted";

export function SignalActions({
  signal, livePrice, journalTradeId, hasPlan, watched, watchBusy, onToggleWatch, onSeen, onTook,
}: {
  signal: PublishedTrade;
  livePrice: number | null;
  /** Journal trade already linked to this signal, if any. */
  journalTradeId: string | null;
  /** The current Trade Plan draft is linked to this signal. */
  hasPlan: boolean;
  watched: Watched | null;
  watchBusy: boolean;
  onToggleWatch: () => void;
  onSeen: () => void;
  onTook: () => void;
}) {
  const { t } = useLanguage();
  const [dialog, setDialog] = useState(false);
  const long = isLongSignal(signal);
  const live = isLiveSignal(signal);
  const upd = watched ? watchUpdates(watched, signal) : null;
  const hasUpd = !!upd && (upd.newLevels.length > 0 || upd.closed);
  const label = signal.tradeId || signal.id.slice(0, 8);

  return (
    <div className="mt-3 border-t border-line pt-3" role="group" aria-label={t("tradeFeed.actionsLabel")}>
      {hasUpd && upd && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-xs">
          <span>
            <span className="font-semibold text-gold">{t("tradeFeed.watchNew")}: </span>
            {upd.newLevels.map((l) => `${l} ${t("tradeFeed.hit")}`).concat(upd.closed ? [t("tradeFeed.updClosed")] : []).join(" · ")}
          </span>
          <button type="button" onClick={onSeen} className="underline text-text-muted hover:text-text">{t("tradeFeed.watchMarkRead")}</button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {long && (live || hasPlan) && (
          <Link href={`/trade-plan?signal=${encodeURIComponent(signal.id)}`} className={`${pill} ${pillIdle}`}>
            {hasPlan ? t("tradeFeed.actPlanOpen") : t("tradeFeed.actPlan")}
          </Link>
        )}
        {long && journalTradeId ? (
          <Link href={`/journal?trade=${encodeURIComponent(journalTradeId)}`} className={`${pill} border-bull/40 bg-bull/10 text-bull`}>
            ✓ {t("tradeFeed.actInJournal")}
          </Link>
        ) : (
          long && live && (
            <button type="button" onClick={() => setDialog(true)} className={`${pill} border-gold/50 bg-gold/10 text-gold hover:bg-gold/20`}>
              {t("tradeFeed.actTook")}
            </button>
          )
        )}
        {(live || watched) && (
          <button
            type="button"
            onClick={onToggleWatch}
            disabled={watchBusy}
            aria-pressed={!!watched}
            className={`${pill} ${watched ? "border-gold/50 bg-gold/10 text-gold" : pillIdle} disabled:opacity-60`}
          >
            {watched ? `✓ ${t("tradeFeed.actWatching")}` : t("tradeFeed.actWatch")}
          </button>
        )}
      </div>
      {!long && <p className="mt-2 text-xs text-text-muted">{t("tradeFeed.shortNote")}</p>}
      <p className="mt-2 text-[11px] text-text-muted">
        {t("tradeFeed.signalId")}: <span dir="ltr" className="font-data" style={{ unicodeBidi: "isolate" }} title={signal.id}>{label}</span>
      </p>

      {dialog && <TookDialog signal={signal} livePrice={livePrice} onClose={() => setDialog(false)} onDone={onTook} />}
    </div>
  );
}

function TookDialog({ signal, livePrice, onClose, onDone }: { signal: PublishedTrade; livePrice: number | null; onClose: () => void; onDone: () => void }) {
  const { t } = useLanguage();
  const lv = numericLevels(linkFromSignal(signal).imported);
  const [entry, setEntry] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [invested, setInvested] = useState("");
  const [fees, setFees] = useState("");
  const [stop, setStop] = useState(plain(lv.stop));
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  function confirm(e: React.FormEvent) {
    e.preventDefault();
    const nums = { entry: parseInput(entry), invested: parseInput(invested), stop: stop.trim() === "" ? null : parseInput(stop), fees: fees.trim() === "" ? 0 : parseInput(fees) };
    if (nums.entry === null || nums.invested === null || (stop.trim() !== "" && nums.stop === null) || nums.fees === null) {
      return setError(t(nums.entry === null ? "journal.errEntry" : nums.invested === null ? "journal.errInvested" : "risk.errNumber"));
    }
    if (loadTrades().some((x) => x.signalId === signal.id)) return setError(t("journal.importDup"));
    const trade = signalToTrade(signal, { id: crypto.randomUUID(), date, entry: nums.entry, invested: nums.invested, fees: nums.fees, stop: nums.stop });
    const issues = validateTrade(trade);
    if (issues.length) return setError(t(ISSUE_KEY[issues[0].code] ?? "journal.errEntry"));
    saveTrades([trade, ...loadTrades()]);
    window.dispatchEvent(new Event(JOURNAL_EVENT));
    setSavedId(trade.id);
    onDone();
  }

  const input = (id: string, label: string, value: string, set: (v: string) => void, o: { num?: boolean; type?: string; hint?: string } = {}) => (
    <div>
      <label htmlFor={id} className="text-xs text-text-muted">{label}</label>
      <input id={id} type={o.type} value={value} onChange={(e) => set(e.target.value)} inputMode={o.num ? "decimal" : undefined} dir="ltr"
        className={`input mt-1.5 w-full ${o.num ? "font-data" : ""}`} />
      {o.hint && <p className="mt-1 text-xs text-text-muted">{o.hint}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t("tradeFeed.tookTitle")} onClick={(e) => e.stopPropagation()}
        className="card w-full sm:max-w-md max-h-[92vh] overflow-y-auto p-5 sm:p-6 rounded-b-none sm:rounded-b-[inherit]">
        {savedId ? (
          <div>
            <div className="font-semibold text-bull">✓ {t("tradeFeed.tookDone")}</div>
            <div className="mt-4 flex gap-3">
              <Link href={`/journal?trade=${encodeURIComponent(savedId)}`} className="btn-primary">{t("tradeFeed.tookView")}</Link>
              <button type="button" onClick={onClose} className="btn-secondary">{t("journal.close")}</button>
            </div>
          </div>
        ) : (
          <form onSubmit={confirm} noValidate>
            <div className="text-label">{signal.pair}</div>
            <h2 className="mt-1 text-xl font-bold">{t("tradeFeed.tookTitle")}</h2>
            <p className="mt-1 text-sm text-text-muted">{t("tradeFeed.tookBody")}</p>
            <p className="mt-3 text-xs text-text-muted">
              {t("tradeFeed.tookZone")}: <span dir="ltr" className="font-data text-text" style={{ unicodeBidi: "isolate" }}>{signal.entryZone || "—"}</span>
            </p>
            <div className="mt-4 grid gap-4">
              <div>
                {input("took-entry", t("tradeFeed.tookEntry"), entry, setEntry, { num: true })}
                {livePrice !== null && (
                  <button type="button" onClick={() => setEntry(plain(livePrice))} className="mt-1 text-xs text-gold hover:opacity-80">
                    {t("journal.livePrice")}: <span dir="ltr" className="font-data">{plain(livePrice)}</span>
                  </button>
                )}
              </div>
              {input("took-date", t("tradeFeed.tookDate"), date, setDate, { type: "date" })}
              {input("took-inv", t("tradeFeed.tookInvested"), invested, setInvested, { num: true })}
              {input("took-fees", t("tradeFeed.tookFees"), fees, setFees, { num: true })}
              {input("took-stop", t("tradeFeed.tookStop"), stop, setStop, { num: true })}
            </div>
            {error && <p className="mt-3 text-sm text-bear" role="alert">{error}</p>}
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="submit" className="btn-primary">{t("tradeFeed.tookConfirm")}</button>
              <button type="button" onClick={onClose} className="btn-secondary">{t("journal.cancel")}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
