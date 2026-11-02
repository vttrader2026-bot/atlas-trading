"use client";

// ATLAS-RISK-CALC-v2
import { useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { RISK_PRESETS, calcPositionBased, calcRiskBased, parseInput, type Common, type RiskError } from "@/lib/riskCalc";

type Mode = "risk" | "position";

const ERROR_KEY: Record<RiskError, string> = {
  stopNotBelowEntry: "risk.errStop",
  targetNotAboveEntry: "risk.errTarget",
  riskTooHigh: "risk.errRisk",
  investmentTooHigh: "risk.errInvest",
};

// Latin digits in every language so numbers stay unambiguous next to prices on exchanges.
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
function qty(n: number) {
  const digits = n >= 1000 ? 2 : n >= 1 ? 4 : 8;
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export default function RiskPage() {
  const { t } = useLanguage();
  const [mode, setMode] = useState<Mode>("risk");
  const [balance, setBalance] = useState("1000");
  const [riskPct, setRiskPct] = useState("1");
  const [investment, setInvestment] = useState("");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");

  const calc = useMemo(() => {
    const bal = parseInput(balance);
    const e = parseInput(entry);
    const s = parseInput(stop);
    const tp = target.trim() === "" ? null : parseInput(target);
    const tpInvalid = target.trim() !== "" && tp === null;
    const third = mode === "risk" ? parseInput(riskPct) : parseInput(investment);
    if (bal === null || e === null || s === null || third === null) {
      return { ready: false as const, tpInvalid };
    }
    const r =
      mode === "risk"
        ? calcRiskBased({ balance: bal, riskPct: third, entry: e, stop: s, tp })
        : calcPositionBased({ balance: bal, investment: third, entry: e, stop: s, tp });
    return { ready: true as const, tpInvalid, result: r };
  }, [mode, balance, riskPct, investment, entry, stop, target]);

  const bad = (raw: string, optional = false) => raw.trim() !== "" && parseInput(raw) === null && !(optional && raw.trim() === "");
  const presetValue = parseInput(riskPct);

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 sm:py-14">
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">{t("risk.title")}</h1>
      <p className="text-text-muted text-sm mt-1">{t("risk.subtitle")}</p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label={t("risk.modeLabel")} className="flex rounded-md border border-line overflow-hidden">
          {(["risk", "position"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`px-4 py-2 text-sm transition-colors ${mode === m ? "bg-surface-raised text-text" : "text-text-muted hover:text-text"}`}
            >
              {m === "risk" ? t("risk.modeRisk") : t("risk.modePosition")}
            </button>
          ))}
        </div>
        <span className="tag tag-bull">{t("risk.spotLong")}</span>
      </div>

      <div className="mt-6 grid sm:grid-cols-2 gap-6">
        <Field label={t("risk.balance")} value={balance} onChange={setBalance} invalid={bad(balance)} errorText={t("risk.errNumber")} />

        {mode === "risk" ? (
          <div>
            <Field
              label={t("risk.riskPct")}
              value={riskPct}
              onChange={setRiskPct}
              invalid={bad(riskPct)}
              errorText={t("risk.errNumber")}
              lessonHref="/academy/risk-percentage"
              lessonText={t("risk.whyRisk")}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label={t("risk.presets")}>
              <span className="text-xs text-text-muted">{t("risk.presets")}</span>
              {RISK_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setRiskPct(String(p))}
                  aria-pressed={presetValue === p}
                  className={`font-data text-xs px-3 py-1 rounded-full border transition-colors ${
                    presetValue === p ? "border-gold text-gold bg-gold/10" : "border-line text-text-muted hover:text-text hover:border-text-muted"
                  }`}
                >
                  <span dir="ltr">{p}%</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <Field label={t("risk.investment")} value={investment} onChange={setInvestment} placeholder="e.g. 400" invalid={bad(investment)} errorText={t("risk.errNumber")} />
        )}

        <Field label={t("risk.entry")} value={entry} onChange={setEntry} placeholder="e.g. 62000" invalid={bad(entry)} errorText={t("risk.errNumber")} />
        <Field label={t("risk.stop")} value={stop} onChange={setStop} placeholder="e.g. 60500" invalid={bad(stop)} errorText={t("risk.errNumber")} />
        <Field label={t("risk.targetTp3")} value={target} onChange={setTarget} placeholder="e.g. 66000" invalid={bad(target, true)} errorText={t("risk.errNumber")} />
      </div>

      <div className="mt-8 card card-accent p-6" aria-live="polite">
        {!calc.ready && (
          <p className="text-text-muted text-sm">{mode === "risk" ? t("risk.emptyRisk") : t("risk.emptyPosition")}</p>
        )}
        {calc.ready && !calc.result.ok && <p className="text-sm text-bear">{t(ERROR_KEY[calc.result.error])}</p>}
        {calc.ready && calc.result.ok && <Results v={calc.result.value} mode={mode} t={t} />}
      </div>

      <p className="mt-4 text-xs text-text-muted leading-relaxed">{t("risk.disclaimer")}</p>
    </main>
  );
}

function Results({ v, mode, t }: { v: Common; mode: Mode; t: (k: string) => string }) {
  return (
    <div>
      <div className="text-label text-bear">{t("risk.maxLoss")}</div>
      <div className="mt-1">
        <span dir="ltr" className="font-data text-4xl sm:text-5xl font-bold text-bear" style={{ unicodeBidi: "isolate", display: "inline-block" }}>
          {usd(v.maxLoss)} <span className="text-lg sm:text-xl font-medium text-text-muted">USDT</span>
        </span>
      </div>

      <div className="mt-6 grid sm:grid-cols-2 gap-6">
        <Stat label={t("risk.positionUsdt")} value={usd(v.positionUsdt)} />
        <Stat label={t("risk.quantity")} value={qty(v.quantity)} />
        <Stat label={t("risk.stopDistance")} value={pct(v.stopDistancePct)} />
        {mode === "position" ? (
          <>
            <Stat label={t("risk.lossPctInvestment")} value={pct(v.lossPctOfPosition)} />
            <Stat label={t("risk.lossPctBalance")} value={pct(v.lossPctOfBalance)} />
          </>
        ) : (
          <Stat label={t("risk.lossPctBalance")} value={pct(v.lossPctOfBalance)} />
        )}
        {v.profit !== null && v.rr !== null && (
          <>
            <Stat label={t("risk.profit")} value={usd(v.profit)} tone="bull" />
            <Stat label={t("risk.rewardRisk")} value={`${v.rr.toFixed(2)}R`} />
          </>
        )}
      </div>

      {v.profit === null && <p className="mt-5 text-xs text-text-muted">{t("risk.addTarget")}</p>}
      {v.exceedsBalance && <p className="mt-4 text-sm text-bear">{t("risk.warnExceeds")}</p>}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  lessonHref,
  lessonText,
  invalid,
  errorText,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  lessonHref?: string;
  lessonText?: string;
  invalid?: boolean;
  errorText?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-sm text-text-muted">{label}</label>
        {lessonHref && (
          <Link href={lessonHref} className="text-xs text-gold hover:opacity-80 transition-opacity">
            {lessonText}
          </Link>
        )}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        dir="ltr"
        aria-invalid={invalid || undefined}
        className={`mt-1.5 w-full bg-surface border rounded-md px-3 py-2 font-data outline-none focus:border-text-muted ${
          invalid ? "border-bear" : "border-line"
        }`}
      />
      {invalid && errorText && <p className="mt-1 text-xs text-bear">{errorText}</p>}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" }) {
  return (
    <div>
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1">
        <span dir="ltr" className={`font-data text-2xl ${tone === "bull" ? "text-bull" : ""}`} style={{ unicodeBidi: "isolate", display: "inline-block" }}>
          {value}
        </span>
      </div>
    </div>
  );
}
