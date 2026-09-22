"use client";

import { useMemo, useState } from "react";
import { useLanguage } from "@/lib/i18n";

export default function RiskPage() {
  const { t } = useLanguage();
  const [balance, setBalance] = useState("1000");
  const [riskPct, setRiskPct] = useState("1");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [side, setSide] = useState<"Long" | "Short">("Long");

  const result = useMemo(() => {
    const bal = parseFloat(balance);
    const risk = parseFloat(riskPct);
    const e = parseFloat(entry);
    const s = parseFloat(stop);
    const tgt = parseFloat(target);

    if (![bal, risk, e, s].every((n) => !Number.isNaN(n) && n > 0)) return null;

    const stopDistance = Math.abs(e - s);
    if (stopDistance === 0) return null;

    const riskAmount = bal * (risk / 100);
    const positionSize = riskAmount / stopDistance;
    const notional = positionSize * e;

    let rr: number | null = null;
    if (!Number.isNaN(tgt) && tgt > 0) {
      const rewardDistance = Math.abs(tgt - e);
      rr = rewardDistance / stopDistance;
    }

    const invalid =
      side === "Long" ? s >= e || (tgt && tgt <= e) : s <= e || (tgt && tgt >= e);

    return { riskAmount, positionSize, notional, rr, invalid, stopDistance };
  }, [balance, riskPct, entry, stop, target, side]);

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 sm:py-14">
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">{t("risk.title")}</h1>
      <p className="text-text-muted text-sm mt-1">{t("risk.subtitle")}</p>

      <div className="mt-10 grid sm:grid-cols-2 gap-6">
        <Field label={t("risk.balance")} value={balance} onChange={setBalance} />
        <Field label={t("risk.riskPct")} value={riskPct} onChange={setRiskPct} />

        <div>
          <label className="text-sm text-text-muted">{t("risk.side")}</label>
          <div className="mt-1.5 flex rounded-md border border-line overflow-hidden">
            {(["Long", "Short"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`flex-1 py-2 text-sm transition-colors ${
                  side === s ? "bg-surface-raised text-text" : "text-text-muted"
                }`}
              >
                {s === "Long" ? t("risk.long") : t("risk.short")}
              </button>
            ))}
          </div>
        </div>

        <Field label={t("risk.entry")} value={entry} onChange={setEntry} placeholder="e.g. 62000" />
        <Field label={t("risk.stop")} value={stop} onChange={setStop} placeholder="e.g. 60500" />
        <Field label={t("risk.target")} value={target} onChange={setTarget} placeholder="e.g. 66000" />
      </div>

      <div className="mt-8 card p-6">
        {!result && <p className="text-text-muted text-sm">{t("risk.empty")}</p>}
        {result && (
          <div className="grid sm:grid-cols-2 gap-6">
            <Stat label={t("risk.risking")} value={`$${result.riskAmount.toFixed(2)}`} />
            <Stat
              label={t("risk.positionSize")}
              value={`${result.positionSize.toFixed(6)} ${t("risk.units")}`}
            />
            <Stat label={t("risk.notional")} value={`$${result.notional.toFixed(2)}`} />
            <Stat
              label={t("risk.rewardRisk")}
              value={result.rr !== null ? `${result.rr.toFixed(2)}R` : t("risk.addTarget")}
            />
          </div>
        )}
        {result?.invalid && (
          <p className="mt-4 text-sm text-bear">
            {t("risk.invalid")} {side === "Long" ? t("risk.long").toLowerCase() : t("risk.short").toLowerCase()}.
          </p>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-sm text-text-muted">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        className="mt-1.5 w-full bg-surface border border-line rounded-md px-3 py-2 font-data outline-none focus:border-text-muted"
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-text-muted">{label}</div>
      <div className="font-data text-2xl mt-1">{value}</div>
    </div>
  );
}
