"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { getSpotTradingSymbols } from "@/lib/binance";
import { pairsFromSymbols, QUICK_PAIRS, searchPairs } from "@/lib/pairList";

/** Searchable Binance Spot USDT pair selector. "auto" = let the Analyzer read it from the screenshot. */
export default function PairPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useLanguage();
  const id = useId();
  const [symbols, setSymbols] = useState<Set<string> | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    getSpotTradingSymbols()
      .then((s) => alive && setSymbols(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const all = useMemo(() => pairsFromSymbols(symbols), [symbols]);
  const matches = useMemo(() => searchPairs(all, query), [all, query]);
  // If the symbol list could not load, a plain ticker is still accepted; the server verifies it against Binance.
  const typed = query.trim().toUpperCase().replace(/USDT$/, "").replace(/[/\-_ ]/g, "");
  const offline = all.length === 0 && /^[A-Z0-9]{1,15}$/.test(typed) ? `${typed}/USDT` : null;

  const choose = (v: string) => {
    onChange(v);
    setQuery("");
    setOpen(false);
  };
  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-md border text-xs ${active ? "border-gold text-gold bg-gold/15" : "border-line text-text-muted hover:text-text"}`;

  return (
    <div className="relative">
      <label htmlFor={id} className="text-xs text-text-muted">
        {t("analyzer.pairLabel")}
      </label>
      <input
        id={id}
        className="input mt-1.5"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        autoComplete="off"
        placeholder={value === "auto" ? t("analyzer.autoDetect") : value}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const first = matches[0] ?? offline;
            if (first) choose(first);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label={t("analyzer.pairQuick")}>
        <button type="button" className={chip(value === "auto")} onClick={() => choose("auto")}>
          {t("analyzer.autoDetect")}
        </button>
        {QUICK_PAIRS.map((p) => (
          <button key={p} type="button" className={chip(value === p)} onClick={() => choose(p)}>
            {p.replace("/USDT", "")}
          </button>
        ))}
        {value !== "auto" && !(QUICK_PAIRS as readonly string[]).includes(value) && (
          <span className={chip(true)}>{value}</span>
        )}
      </div>
      {open && (query || all.length > 0) && (
        <ul
          id={`${id}-list`}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-line bg-surface shadow-lg"
        >
          {matches.map((p) => (
            <li key={p} role="option" aria-selected={p === value}>
              <button type="button" className="w-full px-3 py-2 text-start text-sm hover:bg-gold/15" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(p)}>
                {p}
              </button>
            </li>
          ))}
          {matches.length === 0 && offline && (
            <li>
              <button type="button" className="w-full px-3 py-2 text-start text-sm hover:bg-gold/15" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(offline)}>
                {offline}
              </button>
            </li>
          )}
          {matches.length === 0 && !offline && <li className="px-3 py-2 text-sm text-text-muted">{t("analyzer.pairNoMatch")}</li>}
        </ul>
      )}
    </div>
  );
}
