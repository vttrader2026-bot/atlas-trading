"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n";
import { TradePlanDraft, emptyDraft, loadDraft, saveDraft, clearDraft } from "@/lib/tradePlan";
import { loadTrades, saveTrades, Trade } from "@/lib/journal";

export default function TradePlanPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [draft, setDraft] = useState<TradePlanDraft>(emptyDraft);
  const [accountSize, setAccountSize] = useState("1000");
  const [riskPct, setRiskPct] = useState("1");
  const [saved, setSaved] = useState(false);

  // Loading the saved draft only after mount avoids an SSR/client hydration
  // mismatch — localStorage isn't available on the server.
  useEffect(() => {
    const stored = loadDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setDraft(stored);
  }, []);

  function update<K extends keyof TradePlanDraft>(key: K, value: TradePlanDraft[K]) {
    const next = { ...draft, [key]: value };
    setDraft(next);
    saveDraft(next);
  }

  const calc = useMemo(() => {
    const acc = parseFloat(accountSize);
    const risk = parseFloat(riskPct);
    const entry = parseFloat(draft.entry);
    const invalidation = parseFloat(draft.invalidation);
    const tp1 = parseFloat(draft.tp1);

    if (![acc, risk, entry, invalidation].every((n) => !Number.isNaN(n) && n > 0)) return null;
    const stopDistance = Math.abs(entry - invalidation);
    if (stopDistance === 0) return null;

    const riskAmount = acc * (risk / 100);
    const positionSize = riskAmount / stopDistance;
    const notional = positionSize * entry;
    let rr: number | null = null;
    if (!Number.isNaN(tp1) && tp1 > 0) {
      rr = Math.abs(tp1 - entry) / stopDistance;
    }
    return { riskAmount, positionSize, notional, rr };
  }, [accountSize, riskPct, draft.entry, draft.invalidation, draft.tp1]);

  function saveToJournal() {
    const entry = parseFloat(draft.entry);
    const stop = parseFloat(draft.invalidation);
    const target = parseFloat(draft.tp1);
    if (!draft.pair || Number.isNaN(entry) || Number.isNaN(stop) || !calc) return;

    const trade: Trade = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      pair: draft.pair.replace("/", ""),
      side: draft.direction === "Short" ? "Short" : "Long",
      entry,
      stop,
      target: Number.isNaN(target) ? 0 : target,
      exit: null,
      size: calc.positionSize,
      notes: draft.reasoning,
    };
    const trades = loadTrades();
    saveTrades([trade, ...trades]);
    clearDraft();
    setSaved(true);
    setTimeout(() => router.push("/journal"), 800);
  }

  function clearPlan() {
    setDraft(emptyDraft);
    clearDraft();
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{t("tradePlan.title")}</h1>
      <p className="text-text-muted text-sm mt-1 max-w-xl">{t("tradePlan.subtitle")}</p>

      <div className="mt-8 grid sm:grid-cols-2 gap-4">
        <Field label={t("tradePlan.pair")} value={draft.pair} onChange={(v) => update("pair", v)} placeholder="BTC/USDT" />
        <div>
          <label className="text-xs text-text-muted">{t("tradePlan.direction")}</label>
          <select
            value={draft.direction}
            onChange={(e) => update("direction", e.target.value as TradePlanDraft["direction"])}
            className="input mt-1.5"
          >
            <option value="Long">{t("risk.long")}</option>
            <option value="Short">{t("risk.short")}</option>
            <option value="Wait">{t("tradePlan.wait")}</option>
          </select>
        </div>
      </div>

      <div className="mt-4 grid sm:grid-cols-2 gap-4">
        <Field
          label={t("tradePlan.entryZone")}
          value={draft.entryZone}
          onChange={(v) => update("entryZone", v)}
          placeholder="e.g. 61,200 – 61,800"
        />
        <Field
          label={t("tradePlan.invalidationText")}
          value={draft.invalidationText}
          onChange={(v) => update("invalidationText", v)}
          placeholder="e.g. close below 60,500"
        />
      </div>

      <div className="mt-6 border-t border-line pt-6">
        <div className="text-xs text-text-muted uppercase tracking-wide mb-3">
          {t("tradePlan.numbersHeading")}
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field
            label={t("tradePlan.entry")}
            value={draft.entry}
            onChange={(v) => update("entry", v)}
            numeric
          />
          <Field
            label={t("tradePlan.invalidation")}
            value={draft.invalidation}
            onChange={(v) => update("invalidation", v)}
            numeric
          />
          <Field label="TP1" value={draft.tp1} onChange={(v) => update("tp1", v)} numeric />
          <Field label="TP2" value={draft.tp2} onChange={(v) => update("tp2", v)} numeric />
          <Field label="TP3" value={draft.tp3} onChange={(v) => update("tp3", v)} numeric />
        </div>
      </div>

      <div className="mt-6">
        <label className="text-xs text-text-muted">{t("tradePlan.reasoning")}</label>
        <textarea
          value={draft.reasoning}
          onChange={(e) => update("reasoning", e.target.value)}
          rows={3}
          className="input mt-1.5 resize-none"
          placeholder={t("tradePlan.reasoningPlaceholder")}
        />
      </div>

      <div className="mt-8 border border-line rounded-lg bg-surface p-6">
        <div className="text-xs text-text-muted uppercase tracking-wide mb-3">
          {t("tradePlan.riskHeading")}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={t("risk.balance")} value={accountSize} onChange={setAccountSize} numeric />
          <Field label={t("risk.riskPct")} value={riskPct} onChange={setRiskPct} numeric />
        </div>
        {calc ? (
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <Stat label={t("risk.risking")} value={`$${calc.riskAmount.toFixed(2)}`} />
            <Stat label={t("risk.positionSize")} value={`${calc.positionSize.toFixed(6)} ${t("risk.units")}`} />
            <Stat label={t("risk.notional")} value={`$${calc.notional.toFixed(2)}`} />
            <Stat
              label={t("risk.rewardRisk")}
              value={calc.rr !== null ? `${calc.rr.toFixed(2)}R` : t("risk.addTarget")}
            />
          </div>
        ) : (
          <p className="mt-4 text-sm text-text-muted">{t("tradePlan.fillToCalculate")}</p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={saveToJournal}
          disabled={!calc || !draft.pair}
          className="px-5 py-2.5 rounded-md bg-gold text-bg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {saved ? t("tradePlan.saved") : t("tradePlan.saveToJournal")}
        </button>
        <button
          onClick={clearPlan}
          className="px-5 py-2.5 rounded-md border border-line text-sm hover:bg-surface transition-colors"
        >
          {t("tradePlan.clear")}
        </button>
      </div>

      <p className="mt-6 text-xs text-text-muted leading-relaxed max-w-xl">
        {t("tradePlan.disclaimer")}
      </p>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  numeric,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  numeric?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-text-muted">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={numeric ? "decimal" : undefined}
        className={`input mt-1.5 ${numeric ? "font-data" : ""}`}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-text-muted">{label}</div>
      <div className="font-data text-lg mt-1">{value}</div>
    </div>
  );
}
