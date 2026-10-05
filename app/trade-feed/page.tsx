"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
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

// Same spirit as the Journal's data-sufficiency rule: don't show stats until
// there's enough real data to not look thin. Adjust to match the Journal's
// actual threshold if it differs from this.
const MIN_TRADES_FOR_STATS = 10;

const TP_LABEL_EN: Record<string, string> = { TP1: "TP1", TP2: "TP2", TP3: "TP3" };
const TP_LABEL_AR: Record<string, string> = {
  TP1: "\u0627\u0644\u0647\u062F\u0641 \u0627\u0644\u0623\u0648\u0644",
  TP2: "\u0627\u0644\u0647\u062F\u0641 \u0627\u0644\u062B\u0627\u0646\u064A",
  TP3: "\u0627\u0644\u0647\u062F\u0641 \u0627\u0644\u062B\u0627\u0644\u062B",
};

function tradeStatus(trade: PublishedTrade, lang: string) {
  const hitLevels = trade.hitLevels ?? [];
  const status = trade.status ?? "open";
  const last = hitLevels[hitLevels.length - 1];

  if (status === "closed") {
    if (last === "SL") {
      return {
        text: lang === "ar" ? "\u0645\u063A\u0644\u0642\u0629 \u2014 \u0648\u0642\u0641 \u062E\u0633\u0627\u0631\u0629" : "Closed \u2014 Stop Loss",
        className: "border-bear/40 text-bear",
      };
    }
    if (last && TP_LABEL_EN[last]) {
      return {
        text:
          lang === "ar"
            ? `\u0645\u063A\u0644\u0642\u0629 \u0628\u0631\u0628\u062D (${TP_LABEL_AR[last]})`
            : `Closed \u2014 Profit (${TP_LABEL_EN[last]} Hit)`,
        className: "border-bull/40 text-bull",
      };
    }
    return { text: lang === "ar" ? "\u0645\u063A\u0644\u0642\u0629" : "Closed", className: "border-line text-text-muted" };
  }

  if (last && TP_LABEL_EN[last]) {
    return {
      text: lang === "ar" ? `\u062A\u062D\u0642\u0642 ${TP_LABEL_AR[last]}` : `${TP_LABEL_EN[last]} Hit`,
      className: "border-bull/40 text-bull",
    };
  }

  return { text: lang === "ar" ? "\u0646\u0634\u0637\u0629" : "Active", className: "border-gold/40 text-gold" };
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

// Real coin logo via CoinCap's free public icon CDN (no API key, indexed by
// lowercase ticker symbol - e.g. assets.coincap.io/assets/icons/sol@2x.png).
// Falls back to the colored-initials CoinBadge if a symbol has no icon
// there (newer/obscure listings) or the request fails for any reason, so
// every trade still gets a visual regardless of logo availability.
function CoinLogo({ pair }: { pair: string }) {
  const base = pairBase(pair);
  const [imgFailed, setImgFailed] = useState(false);
  if (imgFailed) return <CoinBadge pair={pair} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://assets.coincap.io/assets/icons/${base.toLowerCase()}@2x.png`}
      alt={base}
      className="w-8 h-8 rounded-full shrink-0 bg-white object-contain p-0.5"
      onError={() => setImgFailed(true)}
    />
  );
}

export default function TradeFeedPage() {
  const { t, lang } = useLanguage();
  const { isLoaded, isSignedIn } = useAuth();
  const [trades, setTrades] = useState<PublishedTrade[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tickers, setTickers] = useState<Record<string, Ticker24h>>({});

  // Real counts from the actual feed \u2014 never shown until there's enough data.
  const publishedCount = trades?.length ?? 0;
  const activeCount = trades?.filter((x) => (x.status ?? "open") !== "closed").length ?? 0;
  const hasEnoughDataForStats = trades !== null && publishedCount >= MIN_TRADES_FOR_STATS;

  useEffect(() => {
    // Admin mode is only a UI switch; the API still checks the secret.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsAdmin(new URLSearchParams(window.location.search).get("admin") === "1");
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
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
  }, [isLoaded, isSignedIn]);

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

      {isLoaded && !isSignedIn && (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="font-medium">
              {lang === "ar" ? "انضم إلى Atlas Trading مجانًا" : "Join Atlas Trading for free"}
            </div>
            <p className="text-sm text-text-muted leading-relaxed mt-1">
              {lang === "ar"
                ? "استفد من خلاصة الصفقات العامة، والمحلل الذكي، والرادار، وخطة الصفقة، وأدوات المخاطر، والسجل."
                : "Access the public Trade Feed, AI Analyzer, Radar, Trade Plan, Risk tools, and Journal."}
            </p>
          </div>
          <Link href="/sign-up" className="btn-primary shrink-0 whitespace-nowrap">
            {lang === "ar" ? "أنشئ حسابك المجاني ←" : "Create your free account →"}
          </Link>
        </div>
      )}

      {isSignedIn && (
        <>
      <div className="mt-8 space-y-4">
        {hasEnoughDataForStats && (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <span>
              <span className="font-data text-text">{publishedCount}</span>{" "}
              {lang === "ar" ? "\u0635\u0641\u0642\u0629 \u0645\u0646\u0634\u0648\u0631\u0629" : "calls published"}
            </span>
            <span aria-hidden="true">\u00B7</span>
            <span>
              <span className="font-data text-text">{activeCount}</span>{" "}
              {lang === "ar" ? "\u0646\u0634\u0637\u0629 \u062D\u0627\u0644\u064A\u0627\u064B" : "currently active"}
            </span>
          </div>
        )}

        {message && <p className="text-bear text-sm">{message}</p>}
        {failed && <p className="text-bear text-sm">{t("tradeFeed.error")}</p>}
        {!failed && trades === null && (
          <p className="text-text-muted text-sm">{t("tradeFeed.loading")}</p>
        )}
        {trades !== null && trades.length === 0 && (
          <p className="text-text-muted text-sm">{t("tradeFeed.empty")}</p>
        )}
      </div>

      <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {trades?.map((trade) => {
          const isLong = trade.direction === "Long";
          const sym = binanceSymbol(trade.pair);
          const ticker = tickers[sym];
          const targets = [trade.tp1, trade.tp2, trade.tp3].filter(Boolean);
          const hitLevels = trade.hitLevels ?? [];
          const hitAnyTp = hitLevels.some((h) => h.startsWith("TP"));
          const hitSl = hitLevels.includes("SL");
          // Only a clean TP close \u2014 never a trade that hit SL after a partial TP.
          const showEliteNudge = trade.status === "closed" && hitAnyTp && !hitSl;
          const status = tradeStatus(trade, lang);

          return (
            <article
              key={trade.id}
              className="rounded-2xl border border-line bg-surface p-5 shadow-[0_0_40px_rgba(227,162,61,0.08)]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <CoinLogo pair={trade.pair} />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-data text-base font-medium">{trade.pair}</span>
                      <span
                        className={
                          "text-[11px] px-2 py-0.5 rounded-full border " +
                          (isLong ? "border-bull/40 text-bull" : "border-bear/40 text-bear")
                        }
                      >
                        {isLong ? t("risk.long") : t("risk.short")}
                      </span>
                      <span className={"text-[11px] px-2 py-0.5 rounded-full border " + status.className}>
                        {status.text}
                      </span>
                    </div>
                    {ticker && (
                      <div className="font-data text-2xl font-bold mt-0.5">${formatPrice(ticker.lastPrice)}</div>
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
                  <div className="font-data text-sm mt-0.5">{trade.entryZone || "\u2014"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wide">{t("tradePlan.targets")}</div>
                  <div className="font-data text-sm mt-0.5 text-bull">
                    {targets.length > 0 ? targets.join(" / ") : "\u2014"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-text-muted uppercase tracking-wide">
                    {t("tradeFeed.slLabel")}
                  </div>
                  <div className="font-data text-sm mt-0.5 text-bear">{trade.invalidation || "\u2014"}</div>
                </div>
              </div>

              {trade.reasoning && (
                <p className="mt-3 text-sm text-text-muted leading-relaxed whitespace-pre-line">
                  {trade.reasoning}
                </p>
              )}
              {showEliteNudge && (
                <p className="mt-3 text-xs text-gold">
                  {lang === "ar"
                    ? "\u0623\u0639\u0636\u0627\u0621 Atlas Elite \u0631\u0635\u062F\u0648\u0627 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u0642\u0629 \u0642\u0628\u0644 \u062A\u062D\u0631\u0643\u0647\u0627."
                    : "Elite members caught this before it moved."}
                </p>
              )}
            </article>
          );
        })}
      </div>

        </>
      )}

      {trades && trades.length > 0 && (
        <div className="mt-8 rounded-2xl border border-line bg-surface p-6 text-center shadow-[0_0_40px_-14px_color-mix(in_srgb,var(--gold)_45%,transparent)]">
          <div className="text-label text-gold">{"\u269C Atlas Elite"}</div>
          <p className="mt-2 text-sm text-text-muted max-w-md mx-auto">
            {lang === "ar"
              ? "\u0647\u0630\u0647 \u0625\u0634\u0627\u0631\u0627\u062A \u0639\u0627\u0645\u0629. \u0623\u0639\u0636\u0627\u0621 Elite \u064A\u062D\u0635\u0644\u0648\u0646 \u0639\u0644\u0649 \u0625\u0634\u0627\u0631\u0627\u062A \u062E\u0627\u0635\u0629\u060C \u0648\u0635\u0648\u0644 \u0623\u0628\u0643\u0631\u060C \u0648\u062A\u062D\u062F\u064A\u062B\u0627\u062A \u0643\u0627\u0645\u0644\u0629 \u0644\u0644\u0635\u0641\u0642\u0629."
              : "These are the public signals. Elite members get private signals, earlier access, and full trade management."}
          </p>
          <Link href="/elite" className="btn-primary mt-4 inline-flex">
            {lang === "ar" ? "\u0627\u0646\u0636\u0645 \u0625\u0644\u0649 Atlas Elite" : "Join Atlas Elite"}
          </Link>
        </div>
      )}
    </main>
  );
}
