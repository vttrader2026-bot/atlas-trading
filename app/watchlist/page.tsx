"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatCompact, formatPrice } from "@/lib/binance";
import { useLanguage } from "@/lib/i18n";
import { useWatchlist } from "@/lib/useWatchlist";
import { useWatchlistMarket } from "@/lib/useWatchlistMarket";
import { WATCHLIST_LIMITS } from "@/lib/watchlistConfig";
import {
  WATCH_SORT_KEYS, baseOf, normalizeSymbol, sortWatchRows, statusChange,
  type StatusKey, type WatchRow, type WatchSortDir, type WatchSortKey,
} from "@/lib/watchlist";
import { ChangePill, CoinLogo } from "@/components/market/MarketBits";

const DEFAULT_DIR: Record<WatchSortKey, WatchSortDir> = { added: "desc", price: "desc", change: "desc", volume: "desc", status: "asc" };
const DIR_LABELS: Record<WatchSortKey, [string, string]> = {
  added: ["watchlist.dir.newest", "watchlist.dir.oldest"],
  price: ["watchlist.dir.highest", "watchlist.dir.lowest"],
  change: ["watchlist.dir.highest", "watchlist.dir.lowest"],
  volume: ["watchlist.dir.highest", "watchlist.dir.lowest"],
  status: ["watchlist.dir.mostActive", "watchlist.dir.leastActive"],
};
const TAG_BY_STATUS: Partial<Record<StatusKey, string>> = {
  breakout: "tag-bull", pullback: "tag-gold", breakoutWatch: "tag-gold", atSupport: "tag-gold",
  relativeStrength: "tag-bull", relativeWeakness: "tag-bear",
};

function num(v: string | undefined): number | null {
  if (v === undefined) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export default function WatchlistPage() {
  const { t } = useLanguage();
  const wl = useWatchlist();
  const { snap, updatedAt, failed, reload } = useWatchlistMarket();

  const [sortKey, setSortKey] = useState<WatchSortKey>("added");
  const [sortDir, setSortDir] = useState<WatchSortDir>("desc");
  const [query, setQuery] = useState("");
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [limitMsg, setLimitMsg] = useState<number | null>(null);

  // "Updated Xs ago" ticks once a second, only while the page is visible.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!id) id = setInterval(() => setNow(Date.now()), 1000); };
    const stop = () => { if (id) { clearInterval(id); id = null; } };
    const onVis = () => { if (document.visibilityState === "visible") { setNow(Date.now()); start(); } else stop(); };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  const statusLabel = (k: StatusKey) => (k === "outside" || k === "delisted" ? t(`watchlist.status.${k}`) : t(`radar.setup.${k}`));

  // ---- rows: real data only, never invented -----------------------------
  const rows = useMemo<WatchRow[]>(() => {
    const list: WatchRow[] = wl.items.map((item) => {
      const base = baseOf(item.symbol);
      const base0: WatchRow = { symbol: item.symbol, base, addedAt: item.addedAt, price: null, change: null, volume: null, status: null, radar: null };
      if (!snap) return base0;
      const tk = snap.tickers.get(item.symbol);
      const radar = snap.radar.get(item.symbol) ?? null;
      const notSpot = snap.spot ? !snap.spot.has(item.symbol) : false;
      if (!tk || notSpot) return { ...base0, status: "delisted" };
      return {
        ...base0,
        price: num(tk.lastPrice), change: num(tk.priceChangePercent), volume: num(tk.quoteVolume),
        status: radar ? radar.setup : "outside", radar,
      };
    });
    return list;
  }, [wl.items, snap]);

  const sorted = useMemo(() => sortWatchRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);

  // ---- "changed since your last visit" ----------------------------------
  // Remember the statuses saved at the previous visit once, when both the
  // saved list and the market data are first ready. Then save the current ones.
  const [prevSeen, setPrevSeen] = useState<Record<string, string> | null>(null);
  if (!prevSeen && wl.ready && snap) setPrevSeen({ ...wl.seen });

  const lastSaved = useRef("");
  useEffect(() => {
    if (!prevSeen) return;
    const updates: Record<string, string> = {};
    for (const r of rows) if (r.status && wl.seen[r.symbol] !== r.status) updates[r.symbol] = r.status;
    const payload = JSON.stringify(updates);
    if (Object.keys(updates).length && payload !== lastSaved.current) {
      lastSaved.current = payload;
      wl.saveSeen(updates);
    }
  }, [rows, prevSeen, wl]);

  // ---- suggestions for the empty state (from the real Radar rows) -------
  const suggestions = useMemo(() => {
    if (!snap) return [];
    const have = new Set(wl.items.map((i) => i.symbol));
    const all = [...snap.radar.values()].filter((r) => !have.has(r.ticker.symbol)).sort((a, b) => b.volume - a.volume);
    const active = all.filter((r) => ["breakout", "pullback", "breakoutWatch"].includes(r.setup));
    const rest = all.filter((r) => !active.includes(r));
    return [...active, ...rest].slice(0, 5);
  }, [snap, wl.items]);

  // ---- search ------------------------------------------------------------
  const matches = useMemo(() => {
    const q = query.trim().toUpperCase().replace(/[\s/_-]+/g, "").replace(/USDT$/, "");
    if (!q || !snap) return [];
    const universe = snap.spot ? [...snap.spot] : [...snap.tickers.keys()];
    const have = new Set(wl.items.map((i) => i.symbol));
    return universe
      .map((s) => ({ s, base: baseOf(s) }))
      .filter((x) => x.base.includes(q) && normalizeSymbol(x.s))
      .sort((a, b) => {
        const rank = (x: { base: string }) => (x.base === q ? 0 : x.base.startsWith(q) ? 1 : 2);
        return rank(a) - rank(b) || (num(snap.tickers.get(b.s)?.quoteVolume) ?? 0) - (num(snap.tickers.get(a.s)?.quoteVolume) ?? 0);
      })
      .slice(0, 8)
      .map((x) => ({ ...x, have: have.has(x.s) }));
  }, [query, snap, wl.items]);

  function tryAdd(symbol: string) {
    setSearchMsg(null);
    setLimitMsg(null);
    if (wl.has(symbol)) { setSearchMsg(t("watchlist.alreadyAdded")); return; }
    const r = wl.add(symbol);
    if (!r.ok) {
      if (r.reason === "limit") setLimitMsg(r.limit);
      else setSearchMsg(t("watchlist.noMatch"));
      return;
    }
    setQuery("");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    if (!snap) return;
    const exact = normalizeSymbol(query);
    const pick = matches.find((m) => m.s === exact) ?? (matches.length === 1 ? matches[0] : undefined) ?? matches[0];
    if (!pick) { setSearchMsg(t("watchlist.noMatch")); return; }
    tryAdd(pick.s);
  }

  const secondsAgo = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  const updatedText =
    secondsAgo === null ? "" : secondsAgo < 60
      ? t("watchlist.updatedAgo").replace("{n}", String(secondsAgo))
      : t("watchlist.updatedMinAgo").replace("{n}", String(Math.floor(secondsAgo / 60)));

  const limitText = (n: number) => (
    <>
      {t("watchlist.limitReached").replace("{n}", String(n))}
      {wl.plan !== "elite" && (
        <>
          {" "}
          <Link href="/elite" className="text-gold underline">{t("watchlist.elitePitch").replace("{n}", String(WATCHLIST_LIMITS.elite))}</Link>
        </>
      )}
    </>
  );

  const loadingList = !wl.ready || (wl.items.length > 0 && !snap && !failed);
  const hardError = !snap && failed;

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 sm:py-14">
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">{t("watchlist.title")}</h1>
      <p className="text-text-muted text-base mt-2 max-w-2xl leading-relaxed">{t("watchlist.subtitle")}</p>

      {/* Add a coin */}
      <form onSubmit={onSubmit} className="mt-8 relative max-w-xl" role="search">
        <label htmlFor="watch-search" className="text-sm text-text-muted">{t("watchlist.searchLabel")}</label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="watch-search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSearchMsg(null); setLimitMsg(null); }}
            placeholder={t("watchlist.searchPlaceholder")}
            autoComplete="off"
            className="input flex-1 min-w-0"
          />
          <button type="submit" className="btn-primary !px-5 shrink-0">{t("watchlist.add")}</button>
        </div>
        {matches.length > 0 && (
          <ul className="mt-2 panel divide-y divide-line overflow-hidden" aria-label={t("watchlist.searchLabel")}>
            {matches.map((m) => (
              <li key={m.s} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="flex items-center gap-2.5 min-w-0">
                  <CoinLogo base={m.base} size={28} />
                  <span className="font-data" dir="ltr"><span className="font-semibold">{m.base}</span><span className="text-text-muted text-sm">/USDT</span></span>
                </span>
                {m.have ? (
                  <span className="text-sm text-text-muted">{t("watchlist.alreadyAdded")}</span>
                ) : (
                  <button type="button" onClick={() => tryAdd(m.s)} className="btn-secondary !py-1.5 !px-3 text-sm">{t("watchlist.add")}</button>
                )}
              </li>
            ))}
          </ul>
        )}
        {query.trim() && snap && matches.length === 0 && !searchMsg && (
          <p className="mt-2 text-sm text-text-muted" role="status">{t("watchlist.noMatch")}</p>
        )}
        {searchMsg && <p className="mt-2 text-sm text-text-muted" role="status">{searchMsg}</p>}
        {limitMsg !== null && wl.items.length >= wl.limit && <p className="mt-2 text-sm text-gold leading-relaxed" role="status">{limitText(limitMsg)}</p>}
      </form>

      {/* Notices */}
      <div className="mt-6 space-y-2">
        {!wl.signedIn && wl.ready && (
          <p className="text-sm text-text-muted">
            {t("watchlist.localNote")}{" "}
            <Link href="/sign-in" className="text-gold underline">{t("watchlist.signIn")}</Link>
          </p>
        )}
        {wl.syncError && <p className="text-sm text-bear" role="alert">{t("watchlist.syncError")}</p>}
        {wl.mergedDropped > 0 && (
          <p className="text-sm text-gold" role="status">
            {t("watchlist.mergeDropped").replace("{n}", String(wl.mergedDropped))}{" "}
            <button type="button" onClick={wl.dismissMergeNotice} className="underline">OK</button>
          </p>
        )}
        {snap && failed && <p className="text-sm text-bear" role="alert">{t("watchlist.refreshFailed")}</p>}
      </div>

      {loadingList && !hardError && <p className="mt-8 text-base text-text-muted">{t("watchlist.loading")}</p>}

      {hardError && (
        <div className="mt-8">
          <p className="text-base text-bear" role="alert">{t("watchlist.loadFailed")}</p>
          <button type="button" onClick={() => void reload()} className="mt-3 btn-secondary !py-2 !px-4 text-sm">{t("watchlist.retry")}</button>
        </div>
      )}

      {/* Empty state */}
      {wl.ready && wl.items.length === 0 && (
        <section className="mt-8 panel p-6">
          <h2 className="font-heading text-xl font-bold">{t("watchlist.emptyTitle")}</h2>
          <p className="mt-2 text-text-muted leading-relaxed max-w-2xl">{t("watchlist.emptyBody")}</p>
          {suggestions.length > 0 && (
            <>
              <div className="mt-5 text-sm text-text-muted">{t("watchlist.suggested")}</div>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {suggestions.map((r) => {
                  const base = baseOf(r.ticker.symbol);
                  return (
                    <li key={r.ticker.symbol} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
                      <span className="flex items-center gap-2.5 min-w-0">
                        <CoinLogo base={base} size={32} />
                        <span className="min-w-0">
                          <span className="font-data font-semibold block" dir="ltr">{base}</span>
                          <span className="text-xs text-text-muted block truncate">{statusLabel(r.setup)}</span>
                        </span>
                      </span>
                      <button type="button" onClick={() => tryAdd(r.ticker.symbol)} className="btn-secondary !py-1.5 !px-3 text-sm shrink-0">{t("watchlist.add")}</button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      {/* The list */}
      {wl.ready && wl.items.length > 0 && !hardError && (
        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div className="text-sm text-text-muted">
              <span className="font-data">{t("watchlist.count").replace("{n}", String(wl.items.length)).replace("{max}", String(wl.limit))}</span>
              {updatedText && <span> · {updatedText}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="watch-sort-key">{t("watchlist.sortBy")}</label>
              <select
                id="watch-sort-key" value={sortKey} className="input !w-auto !py-2 !px-3 text-sm"
                onChange={(e) => { const k = e.target.value as WatchSortKey; setSortKey(k); setSortDir(DEFAULT_DIR[k]); }}
              >
                {WATCH_SORT_KEYS.map((k) => <option key={k} value={k}>{t("watchlist.sortBy")}: {t(`watchlist.sort.${k}`)}</option>)}
              </select>
              <label className="sr-only" htmlFor="watch-sort-dir">{t("watchlist.sortBy")}</label>
              <select
                id="watch-sort-dir" value={sortDir} className="input !w-auto !py-2 !px-3 text-sm"
                onChange={(e) => setSortDir(e.target.value as WatchSortDir)}
              >
                <option value={DEFAULT_DIR[sortKey]}>{t(DIR_LABELS[sortKey][0])}</option>
                <option value={DEFAULT_DIR[sortKey] === "asc" ? "desc" : "asc"}>{t(DIR_LABELS[sortKey][1])}</option>
              </select>
            </div>
          </div>

          <div className="mt-4 panel overflow-hidden">
            {/* Desktop / tablet */}
            <div className="hidden sm:block">
              <table className="w-full">
                <thead className="bg-surface-raised/40">
                  <tr>
                    <th className="mkt-th text-start">{t("watchlist.colCoin")}</th>
                    <th className="mkt-th text-end">{t("watchlist.colPrice")}</th>
                    <th className="mkt-th text-end">{t("watchlist.colChange")}</th>
                    <th className="mkt-th text-end hidden md:table-cell">{t("watchlist.colVolume")}</th>
                    <th className="mkt-th text-start">{t("watchlist.colStatus")}</th>
                    <th className="mkt-th" aria-hidden="true" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => {
                    const changed = statusChange(prevSeen?.[r.symbol], r.status);
                    return (
                      <tr key={r.symbol} className="mkt-row border-t border-line" data-symbol={r.symbol}>
                        <td className="mkt-td">
                          <span className="flex items-center gap-3">
                            <CoinLogo base={r.base} size={36} />
                            <span className="font-data" dir="ltr"><span className="font-semibold text-base">{r.base}</span><span className="text-text-muted text-sm">/USDT</span></span>
                          </span>
                        </td>
                        <td className="mkt-td font-data text-end text-base font-medium" dir="ltr">{r.price !== null ? `$${formatPrice(r.price)}` : "—"}</td>
                        <td className="mkt-td text-end"><ChangePill value={r.change} /></td>
                        <td className="mkt-td font-data text-end text-text-muted hidden md:table-cell" dir="ltr">{r.volume !== null ? `$${formatCompact(r.volume)}` : "—"}</td>
                        <td className="mkt-td">
                          <StatusCell row={r} changed={changed} label={statusLabel} nowText={(k) => t("watchlist.nowStatus").replace("{status}", statusLabel(k))} noData={t("watchlist.noData")} />
                        </td>
                        <td className="mkt-td text-end whitespace-nowrap">
                          <Actions row={r} t={t} onRemove={wl.remove} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: compact cards, no horizontal scroll */}
            <ul className="sm:hidden divide-y divide-line">
              {sorted.map((r) => {
                const changed = statusChange(prevSeen?.[r.symbol], r.status);
                return (
                  <li key={r.symbol} className="px-4 py-3.5" data-symbol={r.symbol}>
                    <div className="flex items-center gap-3">
                      <CoinLogo base={r.base} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-data" dir="ltr"><span className="font-semibold text-base">{r.base}</span><span className="text-text-muted text-sm">/USDT</span></span>
                          <span className="font-data text-base font-medium" dir="ltr">{r.price !== null ? `$${formatPrice(r.price)}` : "—"}</span>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <span className="text-sm text-text-muted font-data" dir="ltr">{r.volume !== null ? `$${formatCompact(r.volume)}` : "—"}</span>
                          <ChangePill value={r.change} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                      <StatusCell row={r} changed={changed} label={statusLabel} nowText={(k) => t("watchlist.nowStatus").replace("{status}", statusLabel(k))} noData={t("watchlist.noData")} />
                      <Actions row={r} t={t} onRemove={wl.remove} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}
    </main>
  );
}

function StatusCell({
  row, changed, label, nowText, noData,
}: {
  row: WatchRow; changed: StatusKey | null; label: (k: StatusKey) => string; nowText: (k: StatusKey) => string; noData: string;
}) {
  if (!row.status) return <span className="text-sm text-text-muted">{noData}</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className={`tag ${TAG_BY_STATUS[row.status] ?? ""}`}>{label(row.status)}</span>
      {changed && <span className="text-xs font-semibold text-gold" data-changed="1">{nowText(changed)}</span>}
    </span>
  );
}

function Actions({ row, t, onRemove }: { row: WatchRow; t: (k: string) => string; onRemove: (s: string) => void }) {
  return (
    <span className="inline-flex items-center gap-2 ms-auto">
      <Link href={`/analyzer?pair=${row.base}/USDT`} className="btn-secondary !py-1.5 !px-3 text-sm">{t("watchlist.analyze")}</Link>
      <button
        type="button" onClick={() => onRemove(row.symbol)}
        aria-label={`${t("watchlist.remove")}: ${row.base}`} title={t("watchlist.remove")}
        className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-text-muted hover:text-bear hover:bg-bear/10 transition-colors"
      >
        <span aria-hidden="true" className="text-lg leading-none">{"×"}</span>
      </button>
    </span>
  );
}
// WATCHLIST-1030
