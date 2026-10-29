"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWatchlist } from "@/lib/useWatchlist";
import { useLanguage } from "@/lib/i18n";
import { normalizeSymbol, baseOf } from "@/lib/watchlist";
import { onServerLimit } from "@/lib/watchlistStore";
import { WATCHLIST_LIMITS } from "@/lib/watchlistConfig";

/** Add / remove a coin from the Watchlist. `symbol` accepts "BTCUSDT", "BTC/USDT" or "BTC". */
export default function StarButton({ symbol, className = "", size = 20 }: { symbol: string; className?: string; size?: number }) {
  const { t } = useLanguage();
  const wl = useWatchlist();
  const sym = normalizeSymbol(symbol);
  const [msg, setMsg] = useState<{ limit: number; plan: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!sym) return null;

  const on = wl.has(sym);
  const base = baseOf(sym);

  function showLimit(info: { limit: number; plan: string }) {
    setMsg(info);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 6000);
  }

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!sym) return;
    if (on) { wl.remove(sym); setMsg(null); return; }
    onServerLimit(showLimit);
    const r = wl.add(sym);
    if (!r.ok && r.reason === "limit") showLimit({ limit: r.limit, plan: r.plan });
  }

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        aria-label={`${on ? t("watchlist.removeFrom") : t("watchlist.addTo")}: ${base}`}
        title={on ? t("watchlist.removeFrom") : t("watchlist.addTo")}
        className={`inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${
          on ? "text-gold bg-gold/10" : "text-text-muted hover:text-gold hover:bg-gold/10"
        }`}
      >
        <svg viewBox="0 0 24 24" width={size} height={size} fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 16.9l-5.25 2.8 1-5.85L3.5 9.7l5.9-.9L12 3.5z" />
        </svg>
      </button>
      {msg && (
        <span role="status" className="absolute z-30 top-full mt-1 end-0 w-60 panel p-3 text-sm text-start leading-relaxed shadow-lg">
          {t("watchlist.limitReached").replace("{n}", String(msg.limit))}
          {msg.plan !== "elite" && (
            <>
              {" "}
              <Link href="/elite" className="text-gold underline">{t("watchlist.elitePitch").replace("{n}", String(WATCHLIST_LIMITS.elite))}</Link>
            </>
          )}
        </span>
      )}
    </span>
  );
}
