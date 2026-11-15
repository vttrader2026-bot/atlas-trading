"use client";

import { useEffect, useRef, useState } from "react";
import { authHref } from "@/lib/activeSignals";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useLanguage } from "@/lib/i18n";
import { getTicker24h, Ticker24h } from "@/lib/binance";
import type { LockedSignal, PublishedTrade } from "@/lib/tradeFeed";
import { SignalCard } from "@/components/tradefeed/SignalCard";
import { LockedSignalCard } from "@/components/tradefeed/LockedSignalCard";
import { startTickerRefresh, browserRefreshEnv } from "@/lib/tickerRefresh";
import { SignalActions } from "@/components/tradefeed/SignalActions";
import OwnerSignalControls from "@/components/tradefeed/OwnerSignalControls";
import { useIsOwner } from "@/lib/useIsOwner";
import { loadTrades } from "@/lib/journal";
import { loadDraft } from "@/lib/tradePlan";
import { normalizeWatch, type Watched } from "@/lib/signalLink";
import { DRAFT_EVENT, JOURNAL_EVENT, syncLocalRecords } from "@/lib/signalSync";

const nowMs = () => Date.now();

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

/** Full signals and locked previews in one newest-first list. */
function mixed(trades: PublishedTrade[], locked: LockedSignal[]): Array<PublishedTrade | LockedSignal> {
  return [...trades, ...locked].sort((a, b) => b.createdAt - a.createdAt);
}

export default function TradeFeedPage() {
  const { t, lang } = useLanguage();
  const { isLoaded, isSignedIn } = useAuth();
  const [trades, setTrades] = useState<PublishedTrade[] | null>(null);
  // Open ELITE signals the viewer cannot access: server-built previews with no levels (ELITE-LOCKED-v1).
  const [locked, setLocked] = useState<LockedSignal[]>([]);
  const [failed, setFailed] = useState(false);
  // True only for an active ELITE member (set by the server); enables Confirm Trade on ELITE signals.
  const [canConfirm, setCanConfirm] = useState(false);
  const isOwner = useIsOwner(); // FEED-ADMIN-v1: display only; every management API re-checks the owner on the server
  const [notice, setNotice] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tickers, setTickers] = useState<Record<string, Ticker24h>>({});
  // Connected workflow: which signals the user follows, and which are already in their Journal / plan draft.
  const [watched, setWatched] = useState<Watched[]>([]);
  const [watchBusy, setWatchBusy] = useState<string | null>(null);
  const [journalBySignal, setJournalBySignal] = useState<Record<string, string>>({});
  const [planSignalId, setPlanSignalId] = useState<string | null>(null);
  // ACTIVE-SIGNAL-v1: /trade-feed?signal=<id> scrolls to that setup and highlights it briefly.
  const [focusId, setFocusId] = useState<string | null>(null);
  const focused = useRef(false);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("signal");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (id) setFocusId(id);
  }, []);
  useEffect(() => {
    if (!focusId || focused.current || trades === null) return;
    const el = document.getElementById(`signal-${focusId}`);
    if (!el) return;
    focused.current = true;
    el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    const timer = setTimeout(() => setFocusId(null), 5000);
    return () => clearTimeout(timer);
  }, [focusId, trades, locked]);

  useEffect(() => {
    const refresh = () => {
      const map: Record<string, string> = {};
      for (const tr of loadTrades()) if (tr.signalId) map[tr.signalId] = tr.id;
      setJournalBySignal(map);
      setPlanSignalId(loadDraft()?.signalId ?? null);
    };
    refresh();
    window.addEventListener(JOURNAL_EVENT, refresh);
    window.addEventListener(DRAFT_EVENT, refresh);
    return () => {
      window.removeEventListener(JOURNAL_EVENT, refresh);
      window.removeEventListener(DRAFT_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    fetch("/api/me/signals", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setWatched(normalizeWatch(d).items);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  // Keep the official link on the user's linked Journal trades / plan up to date (personal data is never touched).
  useEffect(() => {
    if (trades) syncLocalRecords(trades);
  }, [trades]);

  async function watchOp(body: Record<string, unknown>, optimistic: Watched[]) {
    const before = watched;
    setWatched(optimistic);
    setWatchBusy(String(body.id));
    setMessage(null);
    try {
      const res = await fetch("/api/me/signals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (res.ok && data) setWatched(normalizeWatch(data).items);
      else {
        setWatched(before);
        setMessage(res.status === 409 ? t("tradeFeed.watchLimit") : t("tradeFeed.watchErr"));
      }
    } catch {
      setWatched(before);
      setMessage(t("tradeFeed.watchErr"));
    } finally {
      setWatchBusy(null);
    }
  }
  function toggleWatch(tr: PublishedTrade) {
    const cur = watched.find((w) => w.id === tr.id);
    if (cur) return watchOp({ op: "unwatch", id: tr.id }, watched.filter((w) => w.id !== tr.id));
    const w: Watched = { id: tr.id, pair: tr.pair, at: nowMs(), status: tr.status === "closed" ? "closed" : "open", hitLevels: tr.hitLevels ?? [] };
    return watchOp({ op: "watch", id: tr.id, pair: tr.pair, status: w.status, hitLevels: w.hitLevels }, [w, ...watched]);
  }
  function markSeen(tr: PublishedTrade) {
    const status = tr.status === "closed" ? "closed" : "open";
    const hit = tr.hitLevels ?? [];
    return watchOp({ op: "seen", id: tr.id, status, hitLevels: hit }, watched.map((w) => (w.id === tr.id ? { ...w, status, hitLevels: hit } : w)));
  }

  // Real counts from the actual feed \u2014 never shown until there's enough data.
  const publishedCount = (trades?.length ?? 0) + locked.length;
  const activeCount = (trades?.filter((x) => (x.status ?? "open") !== "closed").length ?? 0) + locked.length;
  const hasEnoughDataForStats = trades !== null && publishedCount >= MIN_TRADES_FOR_STATS;

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    // Public feed for everyone (also gives canConfirm / locked previews). The owner then gets the complete FREE + ELITE feed from
    // the owner-only route; no secret is sent from the browser.
    fetch("/api/trade-feed", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("bad status");
        return res.json();
      })
      .then(async (data) => {
        let list = Array.isArray(data.trades) ? data.trades : [];
        let lockedList = Array.isArray(data.locked) ? data.locked : [];
        if (isOwner) {
          try {
            const r = await fetch("/api/admin/signals/feed", { cache: "no-store" });
            if (r.ok) {
              const d = await r.json();
              if (Array.isArray(d.trades)) { list = d.trades; lockedList = []; }
            }
          } catch {
            /* keep the public feed */
          }
        }
        if (!cancelled) {
          setTrades(list);
          setLocked(lockedList);
          setCanConfirm(data.canConfirm === true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, isOwner]);

  // Live prices for every unique pair currently shown. Refreshed every 15s while the tab is visible (and on
  // return to the tab): a single fetch at load made prices freeze at page-open time. A failed refresh keeps the
  // last good price per symbol instead of wiping it, and one bad pair never blocks the rest.
  useEffect(() => {
    if (!trades || trades.length === 0) return;
    const symbols = Array.from(new Set(trades.map((tr) => binanceSymbol(tr.pair))));
    return startTickerRefresh({
      symbols,
      fetchTicker: getTicker24h,
      onUpdate: (fresh) => setTickers((prev) => ({ ...prev, ...fresh })),
      env: browserRefreshEnv(),
    });
  }, [trades]);

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{t("tradeFeed.title")}</h1>
          <p className="text-text-muted text-sm mt-1 max-w-xl">{t("tradeFeed.subtitle")}</p>
        </div>
        {isLoaded && isSignedIn && (
          <Link href="/journal" className="btn-secondary shrink-0">{t("tradeFeed.myJournal")}</Link>
        )}
      </div>

      {isLoaded && !isSignedIn && (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="font-medium">
              {lang === "ar" ? "انضم إلى Atlas Trading مجانًا" : "Join Atlas Trading for free"}
            </div>
            {focusId && <p className="mt-1 text-sm font-medium text-gold">{t("tradeFeed.signalSignInPrompt")}</p>}
            <p className="text-sm text-text-muted leading-relaxed mt-1">
              {lang === "ar"
                ? "استفد من خلاصة الصفقات العامة، والمحلل الذكي، والرادار، وخطة الصفقة، وأدوات المخاطر، والسجل."
                : "Access the public Trade Feed, AI Analyzer, Radar, Trade Plan, Risk tools, and Journal."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={authHref("sign-in", focusId)}
              className="px-3 py-1.5 rounded-md border border-line text-sm text-text-muted hover:text-text hover:border-text-muted transition-colors whitespace-nowrap"
            >
              {lang === "ar" ? "تسجيل الدخول" : "Sign In"}
            </Link>
            <Link href={authHref("sign-up", focusId)} className="btn-primary whitespace-nowrap">
              {lang === "ar" ? "أنشئ حسابك المجاني ←" : "Create your free account →"}
            </Link>
          </div>
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
            <span aria-hidden="true">{"\u00B7"}</span>
            <span>
              <span className="font-data text-text">{activeCount}</span>{" "}
              {lang === "ar" ? "\u0646\u0634\u0637\u0629 \u062D\u0627\u0644\u064A\u0627\u064B" : "currently active"}
            </span>
          </div>
        )}

        {message && <p className="text-bear text-sm">{message}</p>}
        {notice && <p role="status" className="text-bull text-sm">{notice}</p>}
        {failed && <p className="text-bear text-sm">{t("tradeFeed.error")}</p>}
        {!failed && trades === null && (
          <p className="text-text-muted text-sm">{t("tradeFeed.loading")}</p>
        )}
        {trades !== null && trades.length === 0 && locked.length === 0 && (
          <p className="text-text-muted text-sm">{t("tradeFeed.empty")}</p>
        )}
      </div>

      <div className="mt-4 grid sm:grid-cols-2 gap-4">
        {trades && mixed(trades, locked).map((item) => {
          if ("locked" in item) {
            return (
              <div key={item.id} id={`signal-${item.id}`} className={`rounded-2xl transition-shadow duration-500 ${focusId === item.id ? "ring-2 ring-gold shadow-[0_0_28px_-6px_var(--gold)]" : ""}`}>
                <LockedSignalCard signal={item} logo={<CoinLogo pair={item.pair} />} />
              </div>
            );
          }
          const trade = item;
          const ticker = tickers[binanceSymbol(trade.pair)];
          const live = ticker ? parseFloat(ticker.lastPrice) : NaN;

          return (
            <div key={trade.id} id={`signal-${trade.id}`} className={`rounded-2xl transition-shadow duration-500 ${focusId === trade.id ? "ring-2 ring-gold shadow-[0_0_28px_-6px_var(--gold)]" : ""}`}>
            <SignalCard
              trade={trade}
              livePrice={Number.isFinite(live) && live > 0 ? live : null}
              logo={<CoinLogo pair={trade.pair} />}
              actions={
                <SignalActions
                  signal={trade}
                  journalTradeId={journalBySignal[trade.id] ?? null}
                  hasPlan={planSignalId === trade.id}
                  watched={watched.find((w) => w.id === trade.id) ?? null}
                  watchBusy={watchBusy === trade.id}
                  onToggleWatch={() => toggleWatch(trade)}
                  onSeen={() => markSeen(trade)}
                  onTook={() => window.dispatchEvent(new Event(JOURNAL_EVENT))}
                  confirmable={trade.tier === "elite" ? canConfirm : true}
                />
              }
              adminAction={
                isOwner ? (
                  <OwnerSignalControls
                    trade={trade}
                    onUpdated={(next) => setTrades((prev) => (prev ? prev.map((x) => (x.id === next.id ? { ...x, ...next } : x)) : prev))}
                    onDeleted={(id) => setTrades((prev) => (prev ? prev.filter((x) => x.id !== id) : prev))}
                    onNotice={setNotice}
                  />
                ) : null
              }
            />
            </div>
          );
        })}
      </div>

        </>
      )}
    </main>
  );
}
