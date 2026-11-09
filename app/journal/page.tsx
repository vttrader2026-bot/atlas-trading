"use client";

// ATLAS-JOURNAL-v2
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Trade, computeDashboard, loadTrades, saveTrades, statusOf, unrealizedPnl } from "@/lib/journal";
import { useLanguage } from "@/lib/i18n";
import { loadDraft } from "@/lib/tradePlan";
import { planToTrade } from "@/lib/planBridge";
import { getKlinesFrom, getTicker24h } from "@/lib/binance";
import { partialRealizedTotal } from "@/lib/exits";
import { applyAutoSl, findAutoSlTouches, newMonitorState } from "@/lib/autoSl";
import Overview from "@/components/journal/Overview";
import type { Query } from "@/components/journal/History";
import TradeViews, { type View } from "@/components/journal/TradeViews";
import TradeDetails from "@/components/journal/TradeDetails";
import TradeForm, { tradeToForm } from "@/components/journal/TradeForm";
import { todayLocal } from "@/components/journal/format";
import { fetchFeed, syncLocalRecords } from "@/lib/signalSync";
import { confirmPlanIfElite, outcomeText } from "@/lib/eliteConfirmClient";
import { isLiveSignal, isLongSignal, signalToTrade, type SignalLink } from "@/lib/signalLink";
import type { PublishedTrade } from "@/lib/tradeFeed";
import { normalizeSymbol, baseOf } from "@/lib/watchlist";
import NotificationCard from "@/components/NotificationCard";

const nowMs = () => Date.now();

type Editing = { base: Trade | null; initial: ReturnType<typeof tradeToForm>; key: number; entryHint?: string } | null;
type Pending = { source: "plan" | "signal"; planId?: string; signalId?: string; signal?: SignalLink } | null;
type Picker = { loading: boolean; list: PublishedTrade[]; error: string | null } | null;

export default function JournalPage() {
  const { t } = useLanguage();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [mounted, setMounted] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const pendingPlan = useRef<Pending>(null);
  const [picker, setPicker] = useState<Picker>(null);
  const [q, setQ] = useState<Query>({ query: "", status: "all", sort: "date", desc: true });
  const [view, setView] = useState<View>("open"); // JOURNAL-TABS-v1

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    setTrades(loadTrades());
    const refresh = () => setTrades(loadTrades());
    window.addEventListener("atlas-journal-updated", refresh);
    const params = new URLSearchParams(window.location.search);
    const id = params.get("trade");
    // /journal?pair=BTC (from Smart Actions): open the empty "new trade" form with the coin filled in. Nothing is saved until Save.
    const want = !id && params.get("pair") ? normalizeSymbol(params.get("pair")) : null;
    if (want) {
      window.history.replaceState(null, "", window.location.pathname);
      setEditing({ base: null, initial: { ...tradeToForm(null), pair: `${baseOf(want)}/USDT` }, key: Date.now() });
    }
    if (id) {
      setHighlight(id);
      setSelected(id);
      const linked = loadTrades().find((x) => x.id === id);
      if (linked) setView(statusOf(linked)); // open the tab the linked trade lives in
    }
    return () => window.removeEventListener("atlas-journal-updated", refresh);
  }, []);

  // Keep the OFFICIAL link of signal-linked trades fresh (status, hit levels, official SL/TPs).
  // Personal entry, stop, targets, exit and notes are never written by this.
  useEffect(() => {
    if (!mounted || !loadTrades().some((x) => x.signal)) return;
    let off = false;
    fetchFeed().then((f) => {
      if (off || !f.ok) return;
      if (syncLocalRecords(f.trades).journal) setTrades(loadTrades());
    });
    return () => {
      off = true;
    };
  }, [mounted]);

  const persist = useCallback((next: Trade[]) => {
    setTrades(next);
    saveTrades(next);
  }, []);

  // AUTO-SL-v1: in the same 60-second loop, close open trades whose stop was touched by a 1-minute candle low.
  // Only this page triggers it, and only from the trade's own data (never from the official signal's status).
  const autoSl = useRef(newMonitorState());
  const checkAutoSl = useCallback(async () => {
    const touches = await findAutoSlTouches(loadTrades(), async (sym, interval, start, limit) => getKlinesFrom(sym, interval, start, limit), Date.now(), autoSl.current);
    if (!touches.size) return;
    const now = Date.now();
    const closed: string[] = [];
    const next = loadTrades().map((x) => {
      const hit = touches.get(x.id);
      const c = hit ? applyAutoSl(x, hit, now) : null; // null when it is no longer an open, unprocessed trade: never applied twice
      if (c) closed.push(c.pair);
      return c ?? x;
    });
    if (!closed.length) return;
    persist(next);
    setMsg(`${t("journal.autoSlClosed")} ${closed.join(", ")}`);
  }, [persist, t]);

  // Live prices for open trades only (best effort: Binance may be unreachable; manual price is the fallback).
  const openPairs = useMemo(() => Array.from(new Set(trades.filter((x) => statusOf(x) === "open").map((x) => x.pair))).sort().join(","), [trades]);
  useEffect(() => {
    if (!openPairs) return;
    let off = false;
    const load = async () => {
      const next: Record<string, number> = {};
      await Promise.all(
        openPairs.split(",").map(async (sym) => {
          try {
            const p = parseFloat((await getTicker24h(sym)).lastPrice);
            if (Number.isFinite(p) && p > 0) next[sym] = p;
          } catch {
            /* offline or unknown symbol */
          }
        }),
      );
      if (!off) setPrices((prev) => ({ ...prev, ...next }));
      if (!off) await checkAutoSl();
    };
    load();
    const iv = setInterval(load, 60_000);
    return () => {
      off = true;
      clearInterval(iv);
    };
  }, [openPairs, checkAutoSl]);

  const dash = useMemo(() => computeDashboard(trades), [trades]);
  const unrealized = useMemo(() => {
    const vals = trades.map((x) => unrealizedPnl(x, prices[x.pair] ?? x.markPrice ?? null)).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  }, [trades, prices]);
  const partial = useMemo(() => partialRealizedTotal(trades), [trades]);
  const current = trades.find((x) => x.id === selected) ?? null;

  function startNew() {
    setMsg(null);
    setEditing({ base: null, initial: tradeToForm(null), key: Date.now() });
  }
  function startEdit(tr: Trade, closeIt: boolean) {
    const initial = tradeToForm(tr);
    if (closeIt) {
      initial.status = "closed";
      initial.exitDate = initial.exitDate || todayLocal();
    }
    setSelected(null);
    setMsg(null);
    setEditing({ base: tr, initial, key: Date.now() });
  }

  async function importFromPlan() {
    const draft = loadDraft();
    if (!draft || !draft.pair) return setMsg(t("journal.importNone"));
    if (draft.direction === "Wait") return setMsg(t("journal.importWait"));
    if ((draft.id && trades.some((x) => x.planId === draft.id)) || (draft.journalId && trades.some((x) => x.id === draft.journalId))) {
      return setMsg(t("journal.importDup"));
    }
    const r = planToTrade(draft, { id: crypto.randomUUID(), today: todayLocal() });
    if (!r.ok) return setMsg(t(r.error === "notEntered" ? "journal.importPlanNotEntered" : "journal.importIncomplete"));
    // ELITE-CONFIRM-v1: a plan built on an ELITE signal goes through the server check instead of the local form.
    const elite = await confirmPlanIfElite(draft, r.trade);
    if (elite) {
      if (!elite.ok) return setMsg(outcomeText(elite, t));
      setTrades(loadTrades());
      return setMsg(t("tradeFeed.cfDone"));
    }
    setEditing({ base: null, initial: { ...tradeToForm(r.trade) }, key: nowMs() });
    // keep the plan (and signal) links on save
    pendingPlan.current = { source: "plan", planId: draft.id ?? "", signalId: draft.signal?.id, signal: draft.signal };
    setMsg(t("journal.importOk"));
  }

  async function openSignalPicker() {
    setMsg(null);
    setPicker({ loading: true, list: [], error: null });
    const f = await fetchFeed();
    if (!f.ok) return setPicker({ loading: false, list: [], error: t(f.reason === "auth" ? "journal.signalSignIn" : "journal.signalLoadErr") });
    const taken = new Set(trades.map((x) => x.signalId).filter(Boolean));
    setPicker({ loading: false, list: f.trades.filter((x) => isLongSignal(x) && isLiveSignal(x) && !taken.has(x.id) && x.tier !== "elite"), error: null });
  }

  // Importing a signal only PRE-FILLS the form. The entry price is left blank on purpose: nothing is
  // recorded until the user types the price they actually paid and saves.
  function importSignal(sig: PublishedTrade) {
    const draftTrade = signalToTrade(sig, { id: crypto.randomUUID(), date: todayLocal(), entry: 0 });
    const initial = tradeToForm(draftTrade);
    initial.entry = "";
    initial.invested = "";
    initial.size = "";
    setEditing({ base: null, initial, key: nowMs(), entryHint: `${t("journal.signalZoneHint")} ${sig.entryZone || "—"}` });
    pendingPlan.current = { source: "signal", signalId: sig.id, signal: draftTrade.signal };
    setPicker(null);
    setMsg(t("journal.signalImportHint"));
  }

  function onSave(tr: Trade) {
    const link = !editing?.base ? pendingPlan.current : null;
    const finalTrade: Trade = link
      ? {
          ...tr,
          source: link.source,
          ...(link.planId ? { planId: link.planId } : {}),
          ...(link.signalId && link.signal ? { signalId: link.signalId, signal: link.signal } : {}),
        }
      : tr;
    pendingPlan.current = null;
    const exists = trades.some((x) => x.id === finalTrade.id);
    persist(exists ? trades.map((x) => (x.id === finalTrade.id ? finalTrade : x)) : [finalTrade, ...trades]);
    setEditing(null);
    setMsg(t("journal.saved"));
    setHighlight(finalTrade.id);
    setView(statusOf(finalTrade)); // a trade closed in the form moves to the Closed tab; partial exits keep it Open
  }

  function onDelete() {
    if (!current) return;
    persist(trades.filter((x) => x.id !== current.id));
    setSelected(null);
    setMsg(t("journal.deleted"));
  }

  async function downloadPdf() {
    setMsg(null);
    try {
      const { downloadJournalPdf } = await import("@/lib/journalPdf");
      await downloadJournalPdf(trades);
    } catch (err) {
      console.error("journal pdf failed", err);
      setMsg(t("journal.pdfError"));
    }
  }

  if (!mounted) return null;

  return (
    <main className="max-w-5xl mx-auto px-6 py-12 sm:py-14">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="max-w-xl">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">{t("journal.title")}</h1>
          <p className="text-text-muted text-sm mt-1">{t("journal.subtitle")}</p>
          <Link href="/academy/trading-journal-habit" className="inline-block mt-2 text-xs text-gold hover:opacity-80 transition-opacity">
            {t("journal.guideLink")}
          </Link>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={importFromPlan} className="btn-secondary">{t("journal.importPlan")}</button>
          <button type="button" onClick={openSignalPicker} className="btn-secondary">{t("journal.importSignal")}</button>
          <button type="button" onClick={downloadPdf} disabled={trades.length === 0} className="btn-secondary">{t("journal.downloadPdf")}</button>
          <button type="button" onClick={startNew} className="btn-primary">{t("journal.addTrade")}</button>
        </div>
      </div>

      <NotificationCard />

      {msg && <p className="mt-4 text-sm text-text-muted" role="status">{msg}</p>}

      {picker && (
        <section className="mt-4 card p-4 sm:p-5" aria-label={t("journal.signalPickTitle")}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-label">{t("journal.signalPickTitle")}</div>
            <button type="button" onClick={() => setPicker(null)} className="btn-secondary">{t("journal.cancelPick")}</button>
          </div>
          {picker.loading && <p className="mt-3 text-sm text-text-muted">{t("tradePlan.signalLoading")}</p>}
          {picker.error && <p className="mt-3 text-sm text-bear">{picker.error}</p>}
          {!picker.loading && !picker.error && picker.list.length === 0 && <p className="mt-3 text-sm text-text-muted">{t("journal.signalNone")}</p>}
          <ul className="mt-3 space-y-2">
            {picker.list.map((sg) => (
              <li key={sg.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3 py-2">
                <div className="min-w-0 text-sm">
                  <span dir="ltr" className="font-data font-semibold" style={{ unicodeBidi: "isolate" }}>{sg.pair}</span>{" "}
                  <span dir="ltr" className="font-data text-text-muted text-xs" style={{ unicodeBidi: "isolate" }}>{sg.timeframe} · {sg.entryZone}</span>
                </div>
                <button type="button" onClick={() => importSignal(sg)} className="btn-primary !py-1.5">{t("journal.importSignal")}</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <TradeForm
          key={editing.key}
          initial={editing.initial}
          base={editing.base}
          onSave={onSave}
          onCancel={() => { pendingPlan.current = null; setEditing(null); }}
          t={t}
          title={editing.base ? t("journal.editTrade") : t("journal.addTrade")}
          entryHint={editing.entryHint}
        />
      )}

      <Overview d={dash} unrealized={unrealized} partial={partial} t={t} />

      {trades.length === 0 ? (
        <div className="mt-8 card p-10 text-center text-text-muted text-sm">{t("journal.noTrades")}</div>
      ) : (
        <TradeViews trades={trades} view={view} setView={setView} q={q} setQ={setQ} prices={prices} onOpen={setSelected} onCloseTrade={(tr) => startEdit(tr, true)} highlight={highlight} t={t} />
      )}

      {current && (
        <TradeDetails
          trade={current}
          livePrice={prices[current.pair] ?? null}
          onClose={() => setSelected(null)}
          onEdit={(closeIt) => startEdit(current, closeIt)}
          onDelete={onDelete}
          onRecord={(next) => persist(trades.map((x) => (x.id === next.id ? next : x)))}
          t={t}
        />
      )}
    </main>
  );
}
