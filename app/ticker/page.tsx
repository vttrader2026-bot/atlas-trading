"use client";

import { useEffect, useMemo, useState } from "react";
import { getAllTickers24h, formatPrice, formatCompact, Ticker24h } from "@/lib/binance";
import { useLanguage } from "@/lib/i18n";

type SortKey = "symbol" | "priceChangePercent" | "quoteVolume";

export default function TickerPage() {
  const { t } = useLanguage();
  const [tickers, setTickers] = useState<Ticker24h[]>([]);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("quoteVolume");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getAllTickers24h();
        if (!cancelled) {
          setTickers(data);
          setError(null);
        }
      } catch {
        if (!cancelled) setError(t("ticker.error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    const filtered = tickers.filter((t) =>
      t.symbol.toLowerCase().includes(query.toLowerCase())
    );
    return filtered.sort((a, b) => {
      if (sortKey === "symbol") return a.symbol.localeCompare(b.symbol);
      return parseFloat(b[sortKey]) - parseFloat(a[sortKey]);
    });
  }, [tickers, query, sortKey]);

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 sm:py-14">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">{t("ticker.title")}</h1>
          <p className="text-text-muted text-sm mt-1">
            {t("ticker.subtitle")} · {tickers.length || "…"} {t("ticker.symbols")} · {t("ticker.refreshes")}
          </p>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("ticker.searchPlaceholder")}
          className="input w-56"
        />
      </div>

      {error && <p className="mt-4 text-sm text-bear">{error}</p>}

      <div className="mt-6 card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-surface text-text-muted">
            <tr>
              <Th onClick={() => setSortKey("symbol")} active={sortKey === "symbol"}>
                {t("ticker.pair")}
              </Th>
              <th className="text-right px-4 py-3 font-normal">{t("ticker.lastPrice")}</th>
              <th className="text-right px-4 py-3 font-normal">{t("ticker.high")}</th>
              <th className="text-right px-4 py-3 font-normal">{t("ticker.low")}</th>
              <Th onClick={() => setSortKey("priceChangePercent")} active={sortKey === "priceChangePercent"} align="right">
                {t("ticker.change")}
              </Th>
              <Th onClick={() => setSortKey("quoteVolume")} active={sortKey === "quoteVolume"} align="right">
                {t("ticker.volume")}
              </Th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-text-muted">
                  {t("ticker.loading")}
                </td>
              </tr>
            )}
            {rows.slice(0, 100).map((tk) => {
              const change = parseFloat(tk.priceChangePercent);
              const positive = change >= 0;
              return (
                <tr key={tk.symbol} className="border-t border-line hover:bg-surface/60">
                  <td className="px-4 py-3 font-data">{tk.symbol.replace("USDT", "/USDT")}</td>
                  <td className="px-4 py-3 font-data text-right">${formatPrice(tk.lastPrice)}</td>
                  <td className="px-4 py-3 font-data text-right text-text-muted">${formatPrice(tk.highPrice)}</td>
                  <td className="px-4 py-3 font-data text-right text-text-muted">${formatPrice(tk.lowPrice)}</td>
                  <td className={`px-4 py-3 font-data text-right ${positive ? "text-bull" : "text-bear"}`}>
                    {positive ? "+" : ""}
                    {change.toFixed(2)}%
                  </td>
                  <td className="px-4 py-3 font-data text-right text-text-muted">
                    ${formatCompact(tk.quoteVolume)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
      {rows.length > 100 && (
        <p className="mt-3 text-xs text-text-muted">
          {t("ticker.showingTop")} {rows.length} {t("ticker.bySort")}
        </p>
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
