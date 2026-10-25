"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { formatPrice, formatCompact } from "@/lib/binance";
import { useLanguage } from "@/lib/i18n";
import { useLiveTickers } from "@/lib/useLiveTickers";

type CanonicalPair = { symbol: string; baseAsset: string; quoteAsset: string };
type SortKey = "baseAsset" | "priceChangePercent" | "quoteVolume";

export default function CoinsPage() {
  const { t } = useLanguage();
  const { isLoaded, isSignedIn } = useAuth();
  const tickers = useLiveTickers();
  const [pairs, setPairs] = useState<CanonicalPair[]>([]);
  const [pairsStale, setPairsStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("quoteVolume");

  useEffect(() => {
    // Only signed-in accounts can see this directory, so there's no reason
    // to call the API for a logged-out visitor.
    if (!isSignedIn) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/coins", { cache: "no-store" });
        if (!res.ok) throw new Error("request failed");
        const data = (await res.json()) as { pairs: CanonicalPair[]; stale: boolean };
        if (!cancelled) {
          setPairs(data.pairs);
          setPairsStale(data.stale);
          setError(null);
        }
      } catch {
        if (!cancelled) setError(t("coins.error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn]);

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase();
    const filtered = pairs.filter((p) => !q || p.baseAsset.includes(q) || p.symbol.includes(q));
    return filtered
      .map((p) => ({ pair: p, ticker: tickers[p.symbol] }))
      .sort((a, b) => {
        if (sortKey === "baseAsset") return a.pair.baseAsset.localeCompare(b.pair.baseAsset);
        const av = a.ticker ? parseFloat(a.ticker[sortKey]) : -Infinity;
        const bv = b.ticker ? parseFloat(b.ticker[sortKey]) : -Infinity;
        return bv - av;
      });
  }, [pairs, tickers, query, sortKey]);

  return (
    <main className="max-w-6xl mx-auto px-6 py-10 sm:py-14">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">{t("coins.title")}</h1>
          <p className="text-text-muted text-sm mt-1">
            {t("coins.subtitle")} · {pairs.length || "…"} {t("coins.pairs")}
          </p>
        </div>
        {isSignedIn && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("coins.searchPlaceholder")}
            className="input w-56"
          />
        )}
      </div>

      {isLoaded && !isSignedIn && (
        <div className="mt-8 rounded-2xl border border-line bg-surface p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="font-medium">{t("coins.authGate.title")}</div>
            <p className="text-sm text-text-muted leading-relaxed mt-1 max-w-md">{t("coins.authGate.body")}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/sign-in"
              className="px-3 py-1.5 rounded-md border border-line text-sm text-text-muted hover:text-text hover:border-text-muted transition-colors whitespace-nowrap"
            >
              {t("coins.authGate.signIn")}
            </Link>
            <Link href="/sign-up" className="btn-primary whitespace-nowrap">
              {t("coins.authGate.signUp")}
            </Link>
          </div>
        </div>
      )}

      {isSignedIn && (
        <>
          {error && <p className="mt-4 text-sm text-bear">{error}</p>}
          {!error && pairsStale && <p className="mt-4 text-sm text-gold">{t("coins.staleWarning")}</p>}

          <div className="mt-6 card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-surface text-text-muted">
                  <tr>
                    <Th onClick={() => setSortKey("baseAsset")} active={sortKey === "baseAsset"}>
                      {t("coins.pair")}
                    </Th>
                    <th className="text-right px-4 py-3 font-normal">{t("coins.lastPrice")}</th>
                    <Th onClick={() => setSortKey("priceChangePercent")} active={sortKey === "priceChangePercent"} align="right">
                      {t("coins.change")}
                    </Th>
                    <Th onClick={() => setSortKey("quoteVolume")} active={sortKey === "quoteVolume"} align="right">
                      {t("coins.volume")}
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {loading && rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-10 text-text-muted">
                        {t("coins.loading")}
                      </td>
                    </tr>
                  )}
                  {rows.slice(0, 150).map(({ pair, ticker }) => {
                    const change = ticker ? parseFloat(ticker.priceChangePercent) : null;
                    const positive = change !== null && change >= 0;
                    return (
                      <tr key={pair.symbol} className="border-t border-line hover:bg-surface/60">
                        <td className="px-4 py-3">
                          <Link href={`/coins/${pair.baseAsset}`} className="font-data text-text hover:text-gold transition-colors">
                            {pair.baseAsset}/{pair.quoteAsset}
                          </Link>
                        </td>
                        <td className="px-4 py-3 font-data text-right">
                          {ticker ? `$${formatPrice(ticker.lastPrice)}` : "—"}
                        </td>
                        <td
                          className={`px-4 py-3 font-data text-right ${
                            change === null ? "text-text-muted" : positive ? "text-bull" : "text-bear"
                          }`}
                        >
                          {change === null ? "—" : `${positive ? "+" : ""}${change.toFixed(2)}%`}
                        </td>
                        <td className="px-4 py-3 font-data text-right text-text-muted">
                          {ticker ? `$${formatCompact(ticker.quoteVolume)}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {rows.length > 150 && (
            <p className="mt-3 text-xs text-text-muted">
              {t("coins.showingTop")} {rows.length} {t("coins.bySort")}
            </p>
          )}
        </>
      )}
    </main>
  );
}

function Th({
  children,
  onClick,
  active,
  align = "left",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  align?: "left" | "right";
}) {
  return (
    <th
      onClick={onClick}
      className={`px-4 py-3 font-normal cursor-pointer select-none ${
        align === "right" ? "text-right" : "text-left"
      } ${active ? "text-text" : ""}`}
    >
      {children}
      {active && " ↓"}
    </th>
  );
}
