"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { getSpotTradingSymbols } from "@/lib/binance";
import { pairsFromSymbols, QUICK_PAIRS, searchPairs } from "@/lib/pairList";

/**
 * Searchable Binance Spot USDT pair selector for /charts. Uses the same
 * cached symbol set and search helpers as the Analyzer's pair picker. `value`
 * is a Binance symbol such as "BTCUSDT". If the symbol list cannot load, a
 * typed ticker is still offered and the server verifies it against Binance —
 * a pair that does not exist shows a clear error, never invented data.
 */
export default function ChartSymbolPicker({ value, onChange }: { value: string; onChange: (symbol: string) => void }) {
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
  const typed = query.trim().toUpperCase().replace(/USDT$/, "").replace(/[/\-_ ]/g, "");
  const offline = all.length === 0 && /^[A-Z0-9]{1,15}$/.test(typed) ? `${typed}/USDT` : null;
  const current = `${value.slice(0, -4)}/USDT`;

  const choose = (pair: string) => {
    onChange(pair.replace("/", ""));
    setQuery("");
    setOpen(false);
  };
  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-md border text-xs transition-colors ${active ? "border-gold text-gold bg-gold/15" : "border-line text-text-muted hover:text-text"}`;
  const optionClass = "w-full px-3 py-2 text-start text-sm hover:bg-gold/15";

  return (
    <div className="relative min-w-0">
      <label htmlFor={id} className="text-xs text-text-muted">
        {t("charts.symbolLabel")}
      </label>
      <input
        id={id}
        className="input mt-1 font-data"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder={current}
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
      <div className="mt-1 flex flex-wrap gap-1.5" aria-label={t("charts.quickPairs")}>
        {QUICK_PAIRS.map((p) => (
          <button key={p} type="button" className={chip(p === current)} onClick={() => choose(p)}>
            {p.replace("/USDT", "")}
          </button>
        ))}
        {!(QUICK_PAIRS as readonly string[]).includes(current) && <span className={chip(true)}>{current.replace("/USDT", "")}</span>}
      </div>
      {open && (query || all.length > 0) && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-30 mt-1 max-h-60 w-full min-w-[12rem] overflow-auto rounded-lg border border-line bg-surface shadow-lg">
          {matches.map((p) => (
            <li key={p} role="option" aria-selected={p === current}>
              <button type="button" className={optionClass} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(p)}>
                {p}
              </button>
            </li>
          ))}
          {matches.length === 0 && offline && (
            <li>
              <button type="button" className={optionClass} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(offline)}>
                {offline}
              </button>
            </li>
          )}
          {matches.length === 0 && !offline && <li className="px-3 py-2 text-sm text-text-muted">{t("charts.noMatch")}</li>}
        </ul>
      )}
    </div>
  );
}
