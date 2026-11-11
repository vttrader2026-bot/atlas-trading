"use client";
// ATLAS INVESTOR display currency. Display only: nothing here touches the investor document, its calculations or its API.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { useLanguage } from "@/lib/i18n";
import {
  effectiveCurrency, formatMoney, formatSignedMoney, formatUnitPrice, loadCurrency, saveCurrency,
  type DisplayCurrency, type RateInfo,
} from "@/lib/investor/currency";
import { fill } from "./fmt";

type RateStatus = "idle" | "loading" | "ready" | "unavailable";
type Ctx = {
  choice: DisplayCurrency;
  setChoice: (c: DisplayCurrency) => void;
  /** What is really shown (MRU only with a usable rate). */
  currency: DisplayCurrency;
  info: RateInfo | null;
  status: RateStatus;
};
const Currency = createContext<Ctx>({ choice: "USDT", setChoice: () => {}, currency: "USDT", info: null, status: "idle" });

/** Money formatters for the active display currency. Without a provider (or in USDT) they produce the original USD output. */
export function useMoney() {
  const { currency, info } = useContext(Currency);
  const rate = currency === "MRU" && info ? info.rate : null;
  return useMemo(
    () => ({
      currency,
      usd: (n: number) => formatMoney(n, currency, rate),
      signedUsd: (n: number) => formatSignedMoney(n, currency, rate),
      price: (n: number) => formatUnitPrice(n, currency, rate),
    }),
    [currency, rate]
  );
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const [choice, setChoiceState] = useState<DisplayCurrency>("USDT");
  const [info, setInfo] = useState<RateInfo | null>(null);
  const [status, setStatus] = useState<RateStatus>("idle");
  const [now, setNow] = useState(0);

  // The saved choice is per user and per browser; read after mount (no hydration mismatch).
  useEffect(() => {
    if (!userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoiceState(loadCurrency(window.localStorage, userId));
  }, [userId]);

  // The rate is only requested when MRU is chosen.
  useEffect(() => {
    if (choice !== "MRU") return;
    let off = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus("loading");
    fetch("/api/fx/usd-mru")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; info?: RateInfo } | null) => {
        if (off) return;
        setNow(Date.now());
        if (j?.ok && j.info) {
          setInfo(j.info);
          setStatus("ready");
        } else setStatus("unavailable");
      })
      .catch(() => {
        if (off) return;
        setNow(Date.now());
        setStatus("unavailable");
      });
    return () => {
      off = true;
    };
  }, [choice]);

  // Re-check the 48-hour limit while the page stays open.
  useEffect(() => {
    if (choice !== "MRU") return;
    const id = window.setInterval(() => setNow(Date.now()), 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [choice]);

  const setChoice = useCallback(
    (c: DisplayCurrency) => {
      setChoiceState(c);
      saveCurrency(window.localStorage, userId, c);
    },
    [userId]
  );

  const currency = now > 0 ? effectiveCurrency(choice, info, now) : "USDT";
  const value = useMemo(() => ({ choice, setChoice, currency, info, status }), [choice, setChoice, currency, info, status]);
  return <Currency.Provider value={value}>{children}</Currency.Provider>;
}

/** The USDT / MRU selector with the reference rate, its update time, notices and the required attribution. */
export function CurrencyBar() {
  const { t } = useLanguage();
  const { choice, setChoice, currency, info, status } = useContext(Currency);
  const usable = choice === "MRU" && currency === "MRU" && info;
  const notice =
    choice !== "MRU" ? null
    : status === "loading" || status === "idle" ? t("investor.rateLoading")
    : !usable ? t("investor.rateUnavailable")
    : info.stale ? t("investor.rateStale")
    : null;
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <span className="text-text-muted" id="inv-currency-label">{t("investor.currencyLabel")}</span>
      <div role="radiogroup" aria-labelledby="inv-currency-label" className="inline-flex overflow-hidden rounded-lg border border-line">
        {(["USDT", "MRU"] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={choice === c}
            onClick={() => setChoice(c)}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors ${choice === c ? "bg-gold/15 text-gold" : "text-text-muted hover:text-text"}`}
          >
            {t(c === "USDT" ? "investor.currencyUsdt" : "investor.currencyMru")}
          </button>
        ))}
      </div>
      {usable && (
        <span className="text-xs text-text-muted" dir="auto">
          {fill(t("investor.rateLine"), { rate: info.rate.toLocaleString("en-US", { maximumFractionDigits: 4 }), time: new Date(info.sourceUpdatedAt).toLocaleString() })}
        </span>
      )}
      {choice === "MRU" && (
        <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" className="text-[11px] text-text-muted underline" dir="ltr">
          {t("investor.attribution")}
        </a>
      )}
      {notice && <p role="status" className="basis-full text-xs text-gold">{notice}</p>}
      {usable && <p className="basis-full text-[11px] text-text-muted leading-snug">{t("investor.rateNote")}</p>}
    </div>
  );
}

/** One line under forms and price inputs: what is typed there is always USDT, whatever the display currency. */
export function UsdtNote() {
  const { t } = useLanguage();
  return <p className="text-[11px] text-text-muted">{t("investor.inputsUsdt")}</p>;
}
