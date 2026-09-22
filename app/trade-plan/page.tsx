"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n";
import { TradePlanDraft, emptyDraft, loadDraft, saveDraft, clearDraft } from "@/lib/tradePlan";
import { loadTrades, saveTrades, Trade } from "@/lib/journal";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";

const ADMIN_KEY = "atlas-trading.adminSecret";

export default function TradePlanPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [draft, setDraft] = useState<TradePlanDraft>(emptyDraft);
  const [accountSize, setAccountSize] = useState("1000");
  const [riskPct, setRiskPct] = useState("1");
  const [saved, setSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishMsg, setPublishMsg] = useState<string | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);
  const [accountMsg, setAccountMsg] = useState<string | null>(null);
  const [showSignIn, setShowSignIn] = useState(false);

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
      const res = await fetch("/api/me/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      setAccountMsg(res.ok ? t("tradePlan.savedToAccount") : t("tradePlan.accountSaveError"));
    } catch {
      setAccountMsg(t("tradePlan.accountSaveError"));
    } finally {
      setSavingAccount(false);
    }
  }

  async function publishToFeed() {
    if (!draft.pair || draft.direction === "Wait") return;
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
          secret,
          pair: draft.pair,
          direction: draft.direction,
          timeframe: draft.timeframe,
          entryZone: draft.entryZone || draft.entry,
          invalidation: draft.invalidationText || draft.invalidation,
          tp1: draft.tp1,
          tp2: draft.tp2,
          tp3: draft.tp3,
          reasoning: draft.reasoning,
        }),
      });
      if (res.status === 401) {
        window.localStorage.removeItem(ADMIN_KEY);
        setPublishMsg(t("tradePlan.publishUnauthorized"));
      } else if (res.ok) {
        window.localStorage.setItem(ADMIN_KEY, secret);
        setPublishMsg(t("tradePlan.publishSuccess"));
      } else {
        setPublishMsg(t("tradePlan.publishError"));
      }
    } catch {
      setPublishMsg(t("tradePlan.publishError"));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-12 sm:py-14">
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">{t("tradePlan.title")}</h1>
      <p className="text-text-muted text-sm mt-1 max-w-xl">{t("tradePlan.subtitle")}</p>

      <div className="mt-8 grid sm:grid-cols-3 gap-4">
        <Field label={t("tradePlan.pair")} value={draft.pair} onChange={(v) => update("pair", v)} placeholder="BTC/USDT" />
        <div>
          <label htmlFor="tp-direction" className="text-xs text-text-muted">
            {t("tradePlan.direction")}
          </label>
          <select
            id="tp-direction"
            value={draft.direction}
            onChange={(e) => update("direction", e.target.value as TradePlanDraft["direction"])}
            className="input mt-1.5"
          >
            <option value="Long">{t("risk.long")}</option>
            <option value="Short">{t("risk.short")}</option>
            <option value="Wait">{t("tradePlan.wait")}</option>
          </select>
        </div>
        <Field
          label={t("tradePlan.timeframe")}
          value={draft.timeframe}
          onChange={(v) => update("timeframe", v)}
          placeholder="4H"
        />
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
        <div className="text-label mb-3">
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
        <label htmlFor="tp-reasoning" className="text-xs text-text-muted">
          {t("tradePlan.reasoning")}
        </label>
        <textarea
          id="tp-reasoning"
          value={draft.reasoning}
          onChange={(e) => update("reasoning", e.target.value)}
          rows={3}
          className="input mt-1.5 resize-none"
          placeholder={t("tradePlan.reasoningPlaceholder")}
        />
      </div>

      <div className="mt-8 card p-6">
        <div className="text-label mb-3">
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
          className="btn-primary"
        >
          {saved ? t("tradePlan.saved") : t("tradePlan.saveToJournal")}
        </button>
        <button
          onClick={publishToFeed}
          disabled={publishing || !draft.pair || draft.direction === "Wait"}
          className="btn-secondary"
        >
          {publishing ? t("tradePlan.publishing") : t("tradePlan.publishToFeed")}
        </button>
        <button
          onClick={saveToAccount}
          disabled={savingAccount || !draft.pair}
          className="btn-secondary"
        >
          {savingAccount ? t("tradePlan.savingToAccount") : t("tradePlan.saveToAccount")}
        </button>
        <button
          onClick={clearPlan}
          className="btn-secondary"
        >
          {t("tradePlan.clear")}
        </button>
      </div>
      {publishMsg && <p className="mt-3 text-sm text-text-muted">{publishMsg}</p>}
      {accountMsg && (
        <p className="mt-3 text-sm text-text-muted">
          {accountMsg}{" "}
          {showSignIn && (
            <Link href="/sign-in" className="underline">
              {t("account.signIn")}
            </Link>
          )}
        </p>
      )}

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
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-xs text-text-muted">
        {label}
      </label>
      <input
        id={id}
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
