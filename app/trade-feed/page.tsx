"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { getTicker24h, formatPrice, Ticker24h } from "@/lib/binance";
import type { PublishedTrade } from "@/lib/tradeFeed";

// Deterministic color per pair so each coin badge looks distinct without
// needing a real logo asset for every symbol Atlas might publish.
const BADGE_COLORS = ["#F7931A", "#627EEA", "#00D4B4", "#E3A23D", "#9B6DFF", "#35C48A", "#EF5350"];

function badgeColorFor(pair: string) {
  let hash = 0;
  for (const ch of pair) hash = (hash * 31 + ch.charCodeAt(0)) % BADGE_COLORS.length;
  return BADGE_COLORS[hash];
}

function pairBase(pair: string) {
  // "BTC/USDT" -> "BTC", "BTCUSDT" -> "BTC"
  const cleaned = pair.replace("/", "").toUpperCase();
  return cleaned.endsWith("USDT") ? cleaned.slice(0, -4) : cleaned.slice(0, 4);
}

function binanceSymbol(pair: string) {
  return pair.replace("/", "").toUpperCase();
}

function CoinBadge({ pair }: { pair: string }) {
  const base = pairBase(pair);
  const color = badgeColorFor(pair);
  return (
    <span
      className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 font-data"
      style={{ backgroundColor: color }}
    >
      {base.slice(0, 3)}
    </span>
  );
}

export default function TradeFeedPage() {
  const { t, lang } = useLanguage();
  const [trades, setTrades] = useState<PublishedTrade[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tickers, setTickers] = useState<Record<string, Ticker24h>>({});

  useEffect(() => {
    // Admin mode is only a UI switch; the API still checks the secret.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsAdmin(new URLSearchParams(window.location.search).get("admin") === "1");
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/trade-feed", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("bad status");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setTrades(Array.isArray(data.trades) ? data.trades : []);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Live prices for every unique pair currently shown, mirroring the
  // homepage's BTC card. Failures for any one symbol are swallowed so a bad
  // pair doesn't block the rest.
  useEffect(() => {
    if (!trades || trades.length === 0) return;
    let cancelled = false;
    const symbols = Array.from(new Set(trades.map((tr) => binanceSymbol(tr.pair))));
    Promise.all(
      symbols.map((sym) =>
        getTicker24h(sym)
          .then((data) => [sym, data] as const)
          .catch(() => null)
      )
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, Ticker24h> = {};
      for (const r of results) {
        if (r) next[r[0]] = r[1];
      }
      setTickers(next);
    });
    return () => {
      cancelled = true;
    };
  }, [trades]);

  async function removeTrade(id: string) {
    if (!window.confirm(t("tradeFeed.confirmRemove"))) return;
    const secret = window.prompt(t("tradePlan.enterAdminSecret"));
    if (!secret) return;
    setMessage(null);
    try {
      const res = await fetch("/api/trade-feed", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, id }),
      });
      if (res.status === 401) {
        setMessage(t("tradePlan.publishUnauthorized"));
      } else if (res.ok) {
        setTrades((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
      } else {
        setMessage(t("tradeFeed.removeError"));
      }
    } catch {
      setMessage(t("tradeFeed.removeError"));
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{t("tradeFeed.title")}</h1>
      <p className="text-text-muted text-sm mt-1 max-w-xl">{t("tradeFeed.subtitle")}</p>

      <div className="mt-8 space-y-4">
        {message && <p className="text-bear text-sm">{message}</p>}
        {failed && <p className="text-bear text-sm">{t("tradeFeed.error")}</p>}
        {!failed && trades === null && (
          <p className="text-text-muted text-sm">{t("tradeFeed.loading")}</p>
        )}
        {trades !== null && trades.length === 0 && (
          <p className="text-text-muted text-sm">{t("tradeFeed.empty")}</p>
        )}

        {trades?.map((trade) => {
          const isLong = trade.direction === "Long";
          const sym = binanceSymbol(trade.pair);
          const ticker = tickers[sym];
          const targets = [trade.tp1, trade.tp2, trade.tp3].filter(Boolean);

          return (
            <article
              key={trade.id}
              className="rounded-2xl border border-line bg-surface p-5 shadow-[0_0_40px_rgba(227,162,61,0.08)]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <CoinBadge pair={trade.pair} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-data text-base font-medium">{trade.pair}</span>
                      <span
                        className={
                          "text-[11px] px-2 py-0.5 rounded-full border " +
                          (isLong ? "border-bull/40 text-bull" : "border-bear/40 text-bear")
                        }
                      >
                        {isLong ? t("risk.long") : t("risk.short")}
                      </span>
                    </div>
                    {ticker && (
                      <div className="font-data text-lg font-bold mt-0.5">${formatPrice(ticker.lastPrice)}</div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  {trade.timeframe && (
                    <span className="text-[11px] text-text-muted font-data">{trade.timeframe}</span>
                  )}
                  <time className="text-[11px] text-text-muted">
                    {new Date(trade.createdAt).toLocaleString(lang === "ar" ? "ar" : "en")}
                  </time>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => removeTrade(trade.id)}
                      className="text-xs text-bear border border-bear/40 rounded-full px-3 py-1 hover:bg-bear/10"
                    >
                      {t("tradeFeed.remove")}
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-line grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wide">{t("tradePlan.entry")}</div>
                  <div className="font-data text-sm mt-0.5">{trade.entryZone || "—"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wide">{t("tradePlan.targets")}</div>
                  <div className="font-data text-sm mt-0.5 text-bull">
                    {targets.length > 0 ? targets.join(" / ") : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wide">
                    {t("tradePlan.invalidation")}
                  </div>
                  <div className="font-data text-sm mt-0.5 text-bear">{trade.invalidation || "—"}</div>
                </div>
              </div>

              {trade.reasoning && (
                <p className="mt-3 text-sm text-text-muted leading-relaxed whitespace-pre-line">
                  {trade.reasoning}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </main>
  );
}
