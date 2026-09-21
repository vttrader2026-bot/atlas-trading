"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import type { PublishedTrade } from "@/lib/tradeFeed";

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="text-sm">
      <span className="text-text-muted">{label}: </span>
      <span className="font-data">{value}</span>
    </div>
  );
}

export default function TradeFeedPage() {
  const { t, lang } = useLanguage();
  const [trades, setTrades] = useState<PublishedTrade[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
          const targets = [trade.tp1, trade.tp2, trade.tp3].filter(Boolean).join(" / ");
          const isLong = trade.direction === "Long";
          return (
            <article key={trade.id} className="rounded-xl border border-white/10 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-data text-lg">{trade.pair}</span>
                  <span
                    className={
                      "text-xs px-2 py-0.5 rounded-full border " +
                      (isLong ? "border-bull/40 text-bull" : "border-bear/40 text-bear")
                    }
                  >
                    {isLong ? t("risk.long") : t("risk.short")}
                  </span>
                  {trade.timeframe && (
                    <span className="text-xs text-text-muted font-data">{trade.timeframe}</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <time className="text-xs text-text-muted">
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
              <div className="mt-3 space-y-1">
                <Row label={t("tradePlan.entry")} value={trade.entryZone} />
                <Row label={t("tradePlan.invalidation")} value={trade.invalidation} />
                <Row label={t("tradePlan.targets")} value={targets} />
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
