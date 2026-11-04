"use client";

// ATLAS-TRADEPLAN-v2
import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useLanguage } from "@/lib/i18n";
import { TradePlanDraft, emptyDraft, loadDraft, saveDraft, clearDraft } from "@/lib/tradePlan";
import { loadTrades, saveTrades } from "@/lib/journal";
import { computePlan } from "@/lib/planCalc";
import { DEFAULT_BALANCE, DEFAULT_RISK, planToTrade } from "@/lib/planBridge";
import { RISK_PRESETS, parseInput, type RiskError } from "@/lib/riskCalc";
import { pct, price, qty, todayLocal, usd } from "@/components/journal/format";
import { applyOfficialLevels, signalChanges, signalToDraft } from "@/lib/signalLink";
import { fetchFeed, syncLocalRecords } from "@/lib/signalSync";

const ADMIN_KEY = "atlas-trading.adminSecret";

const ERR_KEY: Record<RiskError, string> = {
  stopNotBelowEntry: "risk.errStop",
  targetNotAboveEntry: "risk.errTarget",
  riskTooHigh: "risk.errRisk",
  investmentTooHigh: "risk.errInvest",
};

function Num({ children, cls = "" }: { children: React.ReactNode; cls?: string }) {
  return <span dir="ltr" className={`font-data ${cls}`} style={{ unicodeBidi: "isolate", display: "inline-block" }}>{children}</span>;
}

export default function TradePlanPage() {
  const { t } = useLanguage();
  const { isLoaded, isSignedIn } = useAuth();
  const [draft, setDraft] = useState<TradePlanDraft>(emptyDraft);
  const [loaded, setLoaded] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<string | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountMsg, setAccountMsg] = useState<string | null>(null);
  const [showSignIn, setShowSignIn] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const [journalHas, setJournalHas] = useState(false);
  const [confirmPrice, setConfirmPrice] = useState("");
  const [confirmDate, setConfirmDate] = useState("");
  // Signal import: a pending replacement of an in-progress draft, and any import message.
  const [incoming, setIncoming] = useState<TradePlanDraft | null>(null);
  const [signalMsg, setSignalMsg] = useState<string | null>(null);

  // localStorage is client-only; loading after mount avoids a hydration mismatch.
  // Also handles /trade-plan?signal=<Signal ID> (from the Trade Feed) and keeps a linked signal's
  // official data fresh. Only the official `signal` link is ever refreshed, never the user's numbers.
  useEffect(() => {
    const stored = loadDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setDraft(stored);
    setConfirmDate(todayLocal());
    setLoaded(true);
    const sid = new URLSearchParams(window.location.search).get("signal");
    if (!sid && !stored?.signal) return;
    let off = false;
    (async () => {
      if (sid) setSignalMsg(t("tradePlan.signalLoading"));
      const feed = await fetchFeed();
      if (off) return;
      if (!feed.ok) {
        setSignalMsg(sid ? t(feed.reason === "auth" ? "tradePlan.signalSignIn" : "journal.signalLoadErr") : null);
        return;
      }
      syncLocalRecords(feed.trades);
      const fresh = loadDraft();
      if (fresh) setDraft(fresh);
      if (!sid) return;
      window.history.replaceState(null, "", window.location.pathname);
      const sig = feed.trades.find((x) => x.id === sid);
      if (!sig) return setSignalMsg(t("tradePlan.signalNotFound"));
      if (fresh?.signalId === sid) return setSignalMsg(null); // already planning this signal: keep the user's draft
      const r = signalToDraft(sig, { id: crypto.randomUUID() });
      if (!r.ok) return setSignalMsg(t("tradePlan.signalShort"));
      const hasWork = !!fresh && [fresh.pair, fresh.entry, fresh.invalidation, fresh.tp1, fresh.entryZone, fresh.reasoning].some((v) => v.trim() !== "");
      setSignalMsg(null);
      if (hasWork) setIncoming(r.draft);
      else {
        setDraft(r.draft);
        saveDraft(r.draft);
      }
    })();
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loaded) return;
    // Is the linked journal trade still there? (it may have been deleted in the Journal)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJournalHas(!!draft.journalId && loadTrades().some((x) => x.id === draft.journalId));
  }, [loaded, draft.journalId]);

  function commit(next: TradePlanDraft) {
    setDraft(next);
    saveDraft(next);
  }
  function update<K extends keyof TradePlanDraft>(key: K, value: TradePlanDraft[K]) {
    commit({ ...draft, [key]: value, id: draft.id ?? crypto.randomUUID(), status: draft.status ?? "draft" });
  }

  const balance = draft.balance ?? DEFAULT_BALANCE;
  const riskPct = draft.riskPct ?? DEFAULT_RISK;
  const entered = draft.status === "entered";
  const calc = useMemo(
    () => computePlan({ entry: draft.entry, invalidation: draft.invalidation, tp1: draft.tp1, tp2: draft.tp2, tp3: draft.tp3, balance, riskPct }),
    [draft.entry, draft.invalidation, draft.tp1, draft.tp2, draft.tp3, balance, riskPct],
  );
  const bad = (s: string) => s.trim() !== "" && parseInput(s) === null;

  function confirmEntry() {
    const px = confirmPrice.trim() === "" ? draft.entry : confirmPrice;
    if (parseInput(px) === null) return;
    commit({ ...draft, id: draft.id ?? crypto.randomUUID(), status: "entered", actualEntry: px, enteredAt: confirmDate || todayLocal() });
  }
  function revertDraft() {
    commit({ ...draft, status: "draft", actualEntry: undefined, enteredAt: undefined });
  }

  function sendToJournal() {
    setSendMsg(null);
    const withId = { ...draft, id: draft.id ?? crypto.randomUUID() };
    const r = planToTrade(withId, { id: crypto.randomUUID(), today: todayLocal() });
    if (!r.ok) {
      const key = r.error === "notEntered" ? "tradePlan.confirmFirst" : r.error === "wait" ? "tradePlan.sendWait" : r.error === "pair" ? "tradePlan.sendPair" : r.error === "incomplete" ? "tradePlan.fillToCalculate" : ERR_KEY[r.error as RiskError];
      return setSendMsg(t(key));
    }
    saveTrades([r.trade, ...loadTrades()]);
    commit({ ...withId, journalId: r.trade.id });
    setSendMsg(t("tradePlan.sendOk"));
  }

  function replaceWithSignal() {
    if (!incoming) return;
    setDraft(incoming);
    saveDraft(incoming);
    setIncoming(null);
    setSendMsg(null);
  }
  function useOfficial() {
    commit(applyOfficialLevels(draft));
  }

  function clearPlan() {
    setDraft(emptyDraft);
    clearDraft();
    setSendMsg(null);
    setConfirmPrice("");
  }

  async function saveToAccount() {
    if (!draft.pair || savingAccount || !isLoaded) return;
    if (!isSignedIn) {
      setAccountMsg(t("tradePlan.signInToSave"));
      setShowSignIn(true);
      return;
    }
    setShowSignIn(false);
    setSavingAccount(true);
    setAccountMsg(null);
    try {
      const res = await fetch("/api/me/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      setAccountMsg(res.ok ? t("tradePlan.savedToAccount") : t("tradePlan.accountSaveError"));
    } catch {
      setAccountMsg(t("tradePlan.accountSaveError"));
    } finally {
      setSavingAccount(false);
    }
  }

  async function publishToFeed() {
    if (!draft.pair || draft.direction !== "Long") return;
    let secret = window.localStorage.getItem(ADMIN_KEY);
    if (!secret) {
      secret = window.prompt(t("tradePlan.enterAdminSecret"));
      if (!secret) return;
    }
    setPublishing(true);
    setPublishMsg(null);
    try {
      const res = await fetch("/api/trade-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret, source: "trade-plan", pair: draft.pair, direction: draft.direction, timeframe: draft.timeframe,
          entryZone: draft.entryZone || draft.entry, invalidation: draft.invalidationText || draft.invalidation,
          tp1: draft.tp1, tp2: draft.tp2, tp3: draft.tp3, reasoning: draft.reasoning,
        }),
      });
      if (res.status === 401) {
        window.localStorage.removeItem(ADMIN_KEY);
        setPublishMsg(t("tradePlan.publishUnauthorized"));
      } else if (res.ok) {
        window.localStorage.setItem(ADMIN_KEY, secret);
        setPublishMsg(t("tradePlan.publishSuccess"));
      } else setPublishMsg(t("tradePlan.publishError"));
    } catch {
      setPublishMsg(t("tradePlan.publishError"));
    } finally {
      setPublishing(false);
    }
  }

  const v = calc.ok ? calc.value : null;
  const calcErr = !calc.ok && calc.error !== "incomplete" ? calc.error : null;
  const sent = journalHas;
  const issueText = (code: "invalid" | "notAboveEntry" | "order") => t(code === "invalid" ? "tradePlan.errTpInvalid" : code === "order" ? "tradePlan.errTpOrder" : "tradePlan.errTpBelow");

  return (
    <main className="max-w-4xl mx-auto px-6 py-12 sm:py-14">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">{t("tradePlan.title")}</h1>
        <div className="flex gap-2 items-center mt-2">
          <span className="tag tag-bull">{t("risk.spotLong")}</span>
          <span className={`tag ${entered ? "tag-bull" : ""}`}>{entered ? t("tradePlan.enteredChip") : t("tradePlan.draftChip")}</span>
        </div>
      </div>
      <p className="text-text-muted text-sm mt-1 max-w-xl">{t("tradePlan.subtitle")}</p>

      {signalMsg && <p className="mt-4 text-sm text-text-muted" role="status">{signalMsg}</p>}
      {incoming && (
        <div className="mt-4 card card-accent p-4" role="alertdialog" aria-label={t("tradePlan.replaceTitle")}>
          <div className="font-semibold">{t("tradePlan.replaceTitle")}</div>
          <p className="mt-1 text-sm text-text-muted">{t("tradePlan.replaceBody")} <Num>{incoming.pair}</Num></p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" onClick={replaceWithSignal} className="btn-primary">{t("tradePlan.replace")}</button>
            <button type="button" onClick={() => setIncoming(null)} className="btn-secondary">{t("tradePlan.keepCurrent")}</button>
          </div>
        </div>
      )}

      {draft.signal && (
        <section className="mt-6 card p-4 sm:p-5" aria-label={t("tradePlan.fromSignal")}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="tag tag-bull">{t("tradePlan.fromSignal")}</span>
            <span className={`tag ${draft.signal.status === "closed" ? "" : "tag-bull"}`}>{draft.signal.status === "closed" ? t("journal.statusClosed") : t("journal.statusOpen")}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div><div className="text-xs text-text-muted">{t("tradeFeed.signalId")}</div><Num>{draft.signal.tradeId || draft.signal.id.slice(0, 8)}</Num></div>
            <div><div className="text-xs text-text-muted">{t("tradePlan.levelsHit")}</div><Num>{draft.signal.hitLevels.length ? draft.signal.hitLevels.join(", ") : t("tradePlan.noneYet")}</Num></div>
          </div>
          {(!draft.entry || !draft.invalidation) && (
            <p className="mt-3 text-xs text-text-muted">{!draft.entry && t("tradePlan.entryUnreadable")} {!draft.invalidation && t("tradePlan.stopUnreadable")}</p>
          )}
          {signalChanges(draft.signal).length > 0 && (
            <div className="mt-4 rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm">
              <div className="font-semibold text-gold">{t("tradePlan.officialChanged")}</div>
              <ul className="mt-2 space-y-1">
                {signalChanges(draft.signal).map((c) => (
                  <li key={c.field}>
                    {c.field === "invalidation" ? t("tradePlan.stopLoss") : c.field.toUpperCase()}: <Num cls="text-text-muted">{c.from || "—"}</Num> → <Num>{c.to || "—"}</Num>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-text-muted">{t("tradePlan.officialKept")}</p>
              <button type="button" onClick={useOfficial} className="btn-secondary mt-3">{t("tradePlan.useOfficial")}</button>
            </div>
          )}
        </section>
      )}

      <div className="mt-8 grid sm:grid-cols-3 gap-4">
        <Field label={t("tradePlan.pair")} value={draft.pair} onChange={(x) => update("pair", x)} placeholder="BTC/USDT" ltr />
        <div>
          <div className="text-xs text-text-muted">{t("tradePlan.direction")}</div>
          <div role="radiogroup" aria-label={t("tradePlan.direction")} className="mt-1.5 flex rounded-md border border-line overflow-hidden w-fit">
            {(["Long", "Wait"] as const).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={draft.direction === d} onClick={() => update("direction", d)}
                className={`px-5 py-2 text-sm transition-colors ${draft.direction === d ? "bg-surface-raised text-text" : "text-text-muted hover:text-text"}`}>
                {d === "Long" ? t("risk.long") : t("tradePlan.wait")}
              </button>
            ))}
          </div>
          {draft.direction === "Wait" && <p className="mt-1 text-xs text-text-muted">{t("tradePlan.waitHint")}</p>}
        </div>
        <Field label={t("tradePlan.timeframe")} value={draft.timeframe} onChange={(x) => update("timeframe", x)} placeholder="4H" ltr />
      </div>

      <div className="mt-4 grid sm:grid-cols-2 gap-4">
        <Field label={t("tradePlan.entryZone")} value={draft.entryZone} onChange={(x) => update("entryZone", x)} placeholder="e.g. 61,200 – 61,800" />
        <Field label={t("tradePlan.invalidationText")} value={draft.invalidationText} onChange={(x) => update("invalidationText", x)} placeholder="e.g. close below 60,500" />
      </div>

      <div className="mt-6 border-t border-line pt-6">
        <div className="text-label mb-3">{t("tradePlan.numbersHeading")}</div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label={t("tradePlan.entry")} value={draft.entry} onChange={(x) => update("entry", x)} numeric invalid={bad(draft.entry)} errorText={t("risk.errNumber")} />
          <Field label={t("tradePlan.stopLoss")} value={draft.invalidation} onChange={(x) => update("invalidation", x)} numeric invalid={bad(draft.invalidation)} errorText={t("risk.errNumber")} />
          <span className="hidden sm:block" />
          <Field label="TP1" value={draft.tp1} onChange={(x) => update("tp1", x)} numeric invalid={bad(draft.tp1)} errorText={t("risk.errNumber")} />
          <Field label="TP2" value={draft.tp2} onChange={(x) => update("tp2", x)} numeric invalid={bad(draft.tp2)} errorText={t("risk.errNumber")} />
          <Field label="TP3" value={draft.tp3} onChange={(x) => update("tp3", x)} numeric invalid={bad(draft.tp3)} errorText={t("risk.errNumber")} />
        </div>
      </div>

      <div className="mt-6">
        <label htmlFor="tp-reasoning" className="text-xs text-text-muted">{t("tradePlan.reasoning")}</label>
        <textarea id="tp-reasoning" value={draft.reasoning} onChange={(e) => update("reasoning", e.target.value)} rows={3}
          className="input mt-1.5 resize-none w-full" placeholder={t("tradePlan.reasoningPlaceholder")} />
      </div>

      <section className="mt-8 card card-accent p-5 sm:p-6" aria-live="polite">
        <div className="text-label mb-4">{t("tradePlan.sizingHeading")}</div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t("risk.balance")} value={balance} onChange={(x) => update("balance", x)} numeric invalid={bad(balance)} errorText={t("risk.errNumber")} />
          <div>
            <Field label={t("risk.riskPct")} value={riskPct} onChange={(x) => update("riskPct", x)} numeric invalid={bad(riskPct)} errorText={t("risk.errNumber")} />
            <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label={t("risk.presets")}>
              <span className="text-xs text-text-muted">{t("risk.presets")}</span>
              {RISK_PRESETS.map((p) => (
                <button key={p} type="button" aria-pressed={parseInput(riskPct) === p} onClick={() => update("riskPct", String(p))}
                  className={`font-data text-xs px-3 py-1 rounded-full border transition-colors ${parseInput(riskPct) === p ? "border-gold text-gold bg-gold/10" : "border-line text-text-muted hover:text-text hover:border-text-muted"}`}>
                  <span dir="ltr">{p}%</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {!v && !calcErr && <p className="mt-5 text-sm text-text-muted">{t("tradePlan.fillToCalculate")}</p>}
        {calcErr && <p className="mt-5 text-sm text-bear">{t(ERR_KEY[calcErr as RiskError])}</p>}
        {v && (
          <div className="mt-6">
            <div className="text-label text-bear">{t("risk.maxLoss")}</div>
            <div className="mt-1"><Num cls="text-3xl sm:text-4xl font-bold text-bear">{usd(v.maxLoss)} <span className="text-base font-medium text-text-muted">USDT</span></Num></div>
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-5">
              <Stat label={t("risk.positionUsdt")} value={usd(v.positionUsdt)} />
              <Stat label={t("risk.quantity")} value={qty(v.quantity)} />
              <Stat label={t("risk.stopDistance")} value={pct(v.stopDistancePct)} />
              <Stat label={t("tradePlan.plannedLoss")} value={usd(v.plannedLoss)} />
              <Stat label={t("risk.lossPctBalance")} value={pct(v.lossPctOfBalance)} />
            </div>
            {v.capped && <p className="mt-4 text-sm text-bear">{t("tradePlan.cappedNote")}</p>}

            {(v.targets.length > 0 || v.targetIssues.length > 0) && (
              <div className="mt-6 pt-5 border-t border-line">
                <div className="text-label mb-3">{t("tradePlan.targetsHeading")}</div>
                {v.targets.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[20rem]">
                      <thead className="text-text-muted">
                        <tr>
                          <th className="text-start font-normal py-2">{t("tradePlan.colTarget")}</th>
                          <th className="text-end font-normal py-2">{t("tradePlan.colPrice")}</th>
                          <th className="text-end font-normal py-2">{t("tradePlan.colProfit")}</th>
                          <th className="text-end font-normal py-2">{t("tradePlan.colPctBalance")}</th>
                          <th className="text-end font-normal py-2">{t("tradePlan.colRr")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {v.targets.map((x) => (
                          <tr key={x.key} className="border-t border-line">
                            <td className="py-2.5">{x.key}</td>
                            <td className="py-2.5 text-end"><Num>{price(x.price)}</Num></td>
                            <td className="py-2.5 text-end"><Num cls="text-bull">+{usd(x.profit)}</Num></td>
                            <td className="py-2.5 text-end"><Num>{pct(x.profitPctOfBalance)}</Num></td>
                            <td className="py-2.5 text-end"><Num>{x.rr.toFixed(2)}R</Num></td>
                          </tr>
                        ))}
                        {v.blended && (
                          <tr className="border-t border-line text-text-muted">
                            <td className="py-2.5" colSpan={2}>{t("tradePlan.scaleOut")}</td>
                            <td className="py-2.5 text-end"><Num cls="text-bull">+{usd(v.blended.profit)}</Num></td>
                            <td className="py-2.5 text-end"><Num>{pct((v.blended.profit / (parseInput(balance) ?? 1)) * 100)}</Num></td>
                            <td className="py-2.5 text-end"><Num>{v.blended.rr.toFixed(2)}R</Num></td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
                {v.targetIssues.map((i, k) => <p key={k} className="mt-2 text-xs text-bear">{i.key !== "order" ? `${i.key}: ` : ""}{issueText(i.code)}</p>)}
                <p className="mt-3 text-xs text-text-muted">{t("tradePlan.fullPositionNote")}</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Lifecycle: draft -> entered */}
      <section className="mt-6 card p-5 sm:p-6">
        {entered ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="text-text-muted">{t("tradePlan.enteredOn")} </span><Num>{draft.enteredAt}</Num>
              <span className="text-text-muted"> · {t("tradePlan.actualEntry")} </span><Num>{draft.actualEntry}</Num>
            </div>
            <button type="button" onClick={revertDraft} className="btn-secondary">{t("tradePlan.revertDraft")}</button>
          </div>
        ) : (
          <>
            <div className="font-semibold">{t("tradePlan.confirmHeading")}</div>
            <p className="mt-1 text-xs text-text-muted">{t("tradePlan.confirmHint")}</p>
            <div className="mt-4 grid sm:grid-cols-3 gap-3 items-end">
              <Field label={t("tradePlan.actualEntry")} value={confirmPrice} onChange={setConfirmPrice} numeric placeholder={draft.entry} invalid={bad(confirmPrice)} errorText={t("risk.errNumber")} />
              <Field label={t("tradePlan.entryDate")} value={confirmDate} onChange={setConfirmDate} type="date" ltr />
              <button type="button" onClick={confirmEntry} disabled={parseInput(confirmPrice.trim() === "" ? draft.entry : confirmPrice) === null} className="btn-primary">{t("tradePlan.confirmEntry")}</button>
            </div>
          </>
        )}
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        {sent ? (
          <Link href={`/journal?trade=${draft.journalId}`} className="btn-primary">{t("tradePlan.openInJournal")}</Link>
        ) : (
          <button type="button" onClick={sendToJournal} disabled={!draft.pair || draft.direction === "Wait" || !entered} className="btn-primary">{t("tradePlan.sendToJournal")}</button>
        )}
        <button type="button" onClick={publishToFeed} disabled={publishing || !draft.pair || draft.direction !== "Long"} className="btn-secondary">
          {publishing ? t("tradePlan.publishing") : t("tradePlan.publishToFeed")}
        </button>
        <button type="button" onClick={saveToAccount} disabled={savingAccount || !draft.pair} className="btn-secondary">
          {savingAccount ? t("tradePlan.savingToAccount") : t("tradePlan.saveToAccount")}
        </button>
        <button type="button" onClick={clearPlan} className="btn-secondary">{t("tradePlan.clear")}</button>
      </div>
      {!sent && !entered && draft.direction === "Long" && <p className="mt-3 text-xs text-text-muted">{t("tradePlan.confirmFirst")}</p>}
      {sent && <p className="mt-3 text-sm text-text-muted">{t("tradePlan.sentToJournal")}</p>}
      {sendMsg && <p className="mt-3 text-sm text-text-muted" role="status">{sendMsg}</p>}
      {publishMsg && <p className="mt-3 text-sm text-text-muted">{publishMsg}</p>}
      {accountMsg && (
        <p className="mt-3 text-sm text-text-muted">
          {accountMsg}{" "}
          {showSignIn && <Link href="/sign-in" className="underline">{t("account.signIn")}</Link>}
        </p>
      )}
      <p className="mt-3 text-xs text-text-muted">{t("tradePlan.autosaved")}</p>

      <p className="mt-6 text-xs text-text-muted leading-relaxed max-w-xl">{t("tradePlan.disclaimer")}</p>
      <p className="mt-2 text-xs text-text-muted leading-relaxed max-w-xl">{t("risk.disclaimer")}</p>
    </main>
  );
}

function Field({
  label, value, onChange, placeholder, numeric, invalid, errorText, type, ltr,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean; invalid?: boolean; errorText?: string; type?: string; ltr?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-xs text-text-muted">{label}</label>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        inputMode={numeric ? "decimal" : undefined} dir={numeric || ltr ? "ltr" : undefined} aria-invalid={invalid || undefined}
        className={`input mt-1.5 w-full ${numeric ? "font-data" : ""} ${invalid ? "!border-bear" : ""}`} />
      {invalid && errorText && <p className="mt-1 text-xs text-bear">{errorText}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1"><Num cls="text-xl">{value}</Num></div>
    </div>
  );
}

