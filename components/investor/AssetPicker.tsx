"use client";
import { useEffect, useId, useRef, useState } from "react";
import { assetOf, searchAssets } from "@/lib/investor/assets";
import { CoinLogo } from "@/components/market/MarketBits";
import { useLanguage } from "@/lib/i18n";

/** Searchable dropdown limited to the 17 supported assets. Shows logo, name and ticker. Keyboard accessible. */
export default function AssetPicker({ value, onChange, id }: { value: string; onChange: (ticker: string) => void; id?: string }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const items = searchAssets(q);
  const current = value ? assetOf(value) : undefined;

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (ticker: string) => { onChange(ticker); setOpen(false); setQ(""); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && open && items[hi]) { e.preventDefault(); pick(items[hi].ticker); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={root} className="relative">
      <div className="input flex items-center gap-2 cursor-text" onClick={() => setOpen(true)}>
        {current && !open && <CoinLogo base={current.ticker} size={22} />}
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          className="bg-transparent outline-none flex-1 min-w-0 text-sm"
          placeholder={current ? `${current.name} (${current.ticker})` : t("investor.chooseAsset")}
          value={open ? q : current ? `${current.name} (${current.ticker})` : ""}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQ(e.target.value); setHi(0); setOpen(true); }}
          onKeyDown={onKey}
        />
      </div>
      {open && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-line bg-surface shadow-lg">
          {items.length === 0 && <li className="px-3 py-2 text-sm text-text-muted">{t("investor.noMatch")}</li>}
          {items.map((a, i) => (
            <li key={a.ticker} role="option" aria-selected={a.ticker === value}
              onMouseDown={(e) => { e.preventDefault(); pick(a.ticker); }} onMouseEnter={() => setHi(i)}
              className={`flex items-center gap-3 px-3 py-2 cursor-pointer text-sm ${i === hi ? "bg-surface-raised" : ""}`}>
              <CoinLogo base={a.ticker} size={24} />
              <span className="flex-1 truncate">{a.name}</span>
              <span dir="ltr" className="font-data text-xs text-text-muted">{a.ticker}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
