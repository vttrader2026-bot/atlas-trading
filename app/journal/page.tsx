"use client";

import { useState } from "react";
import { Trade, loadTrades, saveTrades, tradePnl, tradesToCsv } from "@/lib/journal";
import { useLanguage } from "@/lib/i18n";

const empty: Omit<Trade, "id"> = {
  date: new Date().toISOString().slice(0, 10),
  pair: "",
  side: "Long",
  entry: 0,
  stop: 0,
  target: 0,
  exit: null,
  size: 0,
  notes: "",
};

export default function JournalPage() {
  const { t } = useLanguage();
  const [trades, setTrades] = useState<Trade[]>(() => loadTrades());
  const [form, setForm] = useState(empty);

  function addTrade() {
    if (!form.pair || !form.entry || !form.stop || !form.size) return;
    const next: Trade[] = [{ ...form, id: crypto.randomUUID() }, ...trades];
    setTrades(next);
    saveTrades(next);
    setForm(empty);
  }

  function removeTrade(id: string) {
    const next = trades.filter((t) => t.id !== id);
    setTrades(next);
    saveTrades(next);
  }

  function exportCsv() {
    const csv = tradesToCsv(trades);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "atlas-trading-journal.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{t("journal.title")}</h1>
          <p className="text-text-muted text-sm mt-1">{t("journal.subtitle")}</p>
        </div>
        <button
          onClick={exportCsv}
          disabled={trades.length === 0}
          className="btn-secondary"
        >
          {t("journal.exportCsv")}
        </button>
      </div>

      <div className="mt-6 border border-line rounded-lg bg-surface p-5">
        <div className="grid sm:grid-cols-3 md:grid-cols-6 gap-3">
          <input
            className="input"
            placeholder={t("journal.pairPlaceholder")}
            value={form.pair}
            onChange={(e) => setForm({ ...form, pair: e.target.value.toUpperCase() })}
          />
          <select
            className="input"
            value={form.side}
            onChange={(e) => setForm({ ...form, side: e.target.value as "Long" | "Short" })}
          >
            <option value="Long">{t("risk.long")}</option>
            <option value="Short">{t("risk.short")}</option>
          </select>
          <input
            className="input font-data"
            placeholder={t("journal.entryPlaceholder")}
            inputMode="decimal"
            value={form.entry || ""}
            onChange={(e) => setForm({ ...form, entry: parseFloat(e.target.value) || 0 })}
          />
          <input
            className="input font-data"
            placeholder={t("journal.stopPlaceholder")}
            inputMode="decimal"
            value={form.stop || ""}
            onChange={(e) => setForm({ ...form, stop: parseFloat(e.target.value) || 0 })}
          />
          <input
            className="input font-data"
            placeholder={t("journal.targetPlaceholder")}
            inputMode="decimal"
            value={form.target || ""}
            onChange={(e) => setForm({ ...form, target: parseFloat(e.target.value) || 0 })}
          />
          <input
            className="input font-data"
            placeholder={t("journal.sizePlaceholder")}
            inputMode="decimal"
            value={form.size || ""}
            onChange={(e) => setForm({ ...form, size: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div className="mt-3 grid sm:grid-cols-3 gap-3">
          <input
            className="input font-data"
            placeholder={t("journal.exitPlaceholder")}
            inputMode="decimal"
            value={form.exit ?? ""}
            onChange={(e) => setForm({ ...form, exit: e.target.value ? parseFloat(e.target.value) : null })}
          />
          <input
            className="input sm:col-span-2"
            placeholder={t("journal.notesPlaceholder")}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <button
          onClick={addTrade}
          className="btn-primary mt-4"
        >
          {t("journal.logTrade")}
        </button>
      </div>

      <div className="mt-8 border border-line rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface text-text-muted">
            <tr>
              <th className="text-left px-4 py-3 font-normal">{t("journal.date")}</th>
              <th className="text-left px-4 py-3 font-normal">{t("journal.pair")}</th>
              <th className="text-left px-4 py-3 font-normal">{t("journal.side")}</th>
              <th className="text-right px-4 py-3 font-normal">{t("journal.entry")}</th>
              <th className="text-right px-4 py-3 font-normal">{t("journal.stop")}</th>
              <th className="text-right px-4 py-3 font-normal">{t("journal.exit")}</th>
              <th className="text-right px-4 py-3 font-normal">{t("journal.pnl")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-10 text-text-muted">
                  {t("journal.noTrades")}
                </td>
              </tr>
            )}
            {trades.map((tr) => {
              const pnl = tradePnl(tr);
              return (
                <tr key={tr.id} className="border-t border-line">
                  <td className="px-4 py-3 text-text-muted">{tr.date}</td>
                  <td className="px-4 py-3 font-data">{tr.pair}</td>
                  <td className="px-4 py-3">{tr.side === "Long" ? t("risk.long") : t("risk.short")}</td>
                  <td className="px-4 py-3 font-data text-right">{tr.entry}</td>
                  <td className="px-4 py-3 font-data text-right">{tr.stop}</td>
                  <td className="px-4 py-3 font-data text-right">{tr.exit ?? "—"}</td>
                  <td
                    className={`px-4 py-3 font-data text-right ${
                      pnl === null ? "text-text-muted" : pnl >= 0 ? "text-bull" : "text-bear"
                    }`}
                  >
                    {pnl === null ? t("journal.open") : `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}`}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => removeTrade(tr.id)}
                      className="text-text-muted hover:text-bear text-xs"
                    >
                      {t("journal.remove")}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
