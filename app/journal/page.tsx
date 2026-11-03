"use client";

// ATLAS-JOURNAL-v2
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Trade, computeDashboard, filterAndSort, loadTrades, saveTrades, statusOf, tradesToCsv, unrealizedPnl } from "@/lib/journal";
import { useLanguage } from "@/lib/i18n";
import { loadDraft } from "@/lib/tradePlan";
import { planToTrade } from "@/lib/planBridge";
import { getTicker24h } from "@/lib/binance";
import Overview from "@/components/journal/Overview";
import History, { Query } from "@/components/journal/History";
import TradeDetails from "@/components/journal/TradeDetails";
import TradeForm, { tradeToForm } from "@/components/journal/TradeForm";
import { todayLocal } from "@/components/journal/format";

type Editing = { base: Trade | null; initial: ReturnType<typeof tradeToForm>; key: number } | null;

export default function JournalPage() {
  const { t } = useLanguage();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [mounted, setMounted] = useState(false);
  const [editing, setEditing] = useState<Editing>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const pendingPlan = useRef<null | { planId: string; source: "plan" }>(null);
  const [q, setQ] = useState<Query>({ query: "", status: "all", sort: "date", desc: true });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    setTrades(loadTrades());
    const refresh = () => setTrades(loadTrades());
    window.addEventListener("atlas-journal-updated", refresh);
    const id = new URLSearchParams(window.location.search).get("trade");
    if (id) {
      setHighlight(id);
      setSelected(id);
    }
    return () => window.removeEventListener("atlas-journal-updated", refresh);
  }, []);

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
    };
    load();
    const iv = setInterval(load, 60_000);
    return () => {
      off = true;
      clearInterval(iv);
    };
  }, [openPairs]);

  const persist = useCallback((next: Trade[]) => {
    setTrades(next);
    saveTrades(next);
  }, []);

  const dash = useMemo(() => computeDashboard(trades), [trades]);
  const unrealized = useMemo(() => {
    const vals = trades.map((x) => unrealizedPnl(x, prices[x.pair] ?? x.markPrice ?? null)).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  }, [trades, prices]);
  const rows = useMemo(() => filterAndSort(trades, q), [trades, q]);
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

  function importFromPlan() {
    const draft = loadDraft();
    if (!draft || !draft.pair) return setMsg(t("journal.importNone"));
    if (draft.direction === "Wait") return setMsg(t("journal.importWait"));
    if ((draft.id && trades.some((x) => x.planId === draft.id)) || (draft.journalId && trades.some((x) => x.id === draft.journalId))) {
      return setMsg(t("journal.importDup"));
    }
    const r = planToTrade(draft, { id: crypto.randomUUID(), today: todayLocal() });
    if (!r.ok) return setMsg(t("journal.importIncomplete"));
    setEditing({ base: null, initial: { ...tradeToForm(r.trade) }, key: Date.now() });
    // keep the plan link on save
    pendingPlan.current = { planId: draft.id ?? "", source: "plan" };
    setMsg(t("journal.importOk"));
  }

  function onSave(tr: Trade) {
    const link = !editing?.base ? pendingPlan.current : null;
    const finalTrade = link ? { ...tr, source: link.source, ...(link.planId ? { planId: link.planId } : {}) } : tr;
    pendingPlan.current = null;
    const exists = trades.some((x) => x.id === finalTrade.id);
    persist(exists ? trades.map((x) => (x.id === finalTrade.id ? finalTrade : x)) : [finalTrade, ...trades]);
    setEditing(null);
    setMsg(t("journal.saved"));
    setHighlight(finalTrade.id);
  }

  function onDelete() {
    if (!current) return;
    persist(trades.filter((x) => x.id !== current.id));
    setSelected(null);
    setMsg(t("journal.deleted"));
  }

  function exportCsv() {
    const blob = new Blob(["﻿" + tradesToCsv(trades)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "atlas-trading-journal.csv";
    a.click();
    URL.revokeObjectURL(url);
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
          <button type="button" onClick={exportCsv} disabled={trades.length === 0} className="btn-secondary">{t("journal.exportCsv")}</button>
          <button type="button" onClick={startNew} className="btn-primary">{t("journal.addTrade")}</button>
        </div>
      </div>

      {msg && <p className="mt-4 text-sm text-text-muted" role="status">{msg}</p>}

      {editing && (
        <TradeForm
          key={editing.key}
          initial={editing.initial}
          base={editing.base}
          onSave={onSave}
          onCancel={() => { pendingPlan.current = null; setEditing(null); }}
          t={t}
          title={editing.base ? t("journal.editTrade") : t("journal.addTrade")}
        />
      )}

      <Overview d={dash} unrealized={unrealized} t={t} />

      {trades.length === 0 ? (
        <div className="mt-8 card p-10 text-center text-text-muted text-sm">{t("journal.noTrades")}</div>
      ) : (
        <History rows={rows} q={q} setQ={setQ} prices={prices} onOpen={setSelected} highlight={highlight} t={t} />
      )}

      {current && (
        <TradeDetails
          trade={current}
          livePrice={prices[current.pair] ?? null}
          onClose={() => setSelected(null)}
          onEdit={(closeIt) => startEdit(current, closeIt)}
          onDelete={onDelete}
          t={t}
        />
      )}
    </main>
  );
}
