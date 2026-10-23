"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { formatCompact, formatPrice } from "@/lib/binance";
import { useLanguage } from "@/lib/i18n";
import { miT, type MiLang } from "@/lib/marketIntelI18n";
import type { AssetCategory } from "@/lib/marketIntelAssets";

type ApiAsset = {
  symbol: string;
  price: number;
  change24hPct: number;
  perf7dPct: number | null;
  perf30dPct: number | null;
  relBtc7dPct: number | null;
  relBtc30dPct: number | null;
  trendStrengthPct: number | null;
  volumeChangePct: number | null;
  liquidityUsdt: number;
  volatilityPct: number | null;
  dataFreshnessMinutes: number;
  insufficientHistory: boolean;
  categories: AssetCategory[];
  strengthScore: number;
  rank: number;
};

type ApiResponse = {
  generatedAt: string;
  baselineDate: string;
  assets: ApiAsset[];
  sincePerf: Array<{ symbol: string; sincePct: number | null }>;
  btcSincePct: number | null;
  universeLog: Array<{ date: string; added: string[]; removed: string[] }>;
  cached?: boolean;
  stale?: boolean;
  error?: string;
};

const CATEGORY_FILTERS: Array<AssetCategory | "all"> = ["all", "grayscale", "coinbase50", "madeInUsa", "worldLiberty"];

type SortKey = "rank" | "change24h" | "perf7d" | "perf30d" | "volume" | "name";

const REFRESH_MS = 5 * 60 * 1000;

export default function MarketIntelligencePage() {
  const { lang } = useLanguage() as { lang: MiLang };
  const tr = (key: string) => miT(lang, key);
  const { isLoaded, isSignedIn } = useAuth();

  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState<AssetCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("rank");

  useEffect(() => {
    // Only signed-in accounts can see this tool, so there's no reason to
    // call the data API (or keep polling it) for a logged-out visitor.
    if (!isSignedIn) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/market-intel/data", { cache: "no-store" });
        const json = (await res.json()) as ApiResponse;
        if (cancelled) return;
        if (!res.ok || json.error) {
          setError(true);
          return;
        }
        setData(json);
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      }
    }
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isSignedIn]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = data.assets;
    if (category !== "all") list = list.filter((a) => a.categories.includes(category));
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      list = list.filter((a) => a.symbol.includes(q));
    }
    const sorted = [...list];
    switch (sortKey) {
      case "change24h":
        sorted.sort((a, b) => b.change24hPct - a.change24hPct);
        break;
      case "perf7d":
        sorted.sort((a, b) => (b.perf7dPct ?? -Infinity) - (a.perf7dPct ?? -Infinity));
        break;
      case "perf30d":
        sorted.sort((a, b) => (b.perf30dPct ?? -Infinity) - (a.perf30dPct ?? -Infinity));
        break;
      case "volume":
        sorted.sort((a, b) => b.liquidityUsdt - a.liquidityUsdt);
        break;
      case "name":
        sorted.sort((a, b) => a.symbol.localeCompare(b.symbol));
        break;
      default:
        sorted.sort((a, b) => a.rank - b.rank);
    }
    return sorted;
  }, [data, category, search, sortKey]);

  const bestWorst = useMemo(() => {
    if (!data) return null;
    const withSince = data.sincePerf.filter((s) => s.sincePct !== null) as Array<{ symbol: string; sincePct: number }>;
    if (withSince.length === 0) return null;
    const sorted = [...withSince].sort((a, b) => b.sincePct - a.sincePct);
    const outperforming =
      data.btcSincePct !== null ? withSince.filter((s) => s.sincePct > (data.btcSincePct as number)).length : 0;
    return {
      best: sorted.slice(0, 5),
      worst: sorted.slice(-5).reverse(),
      pctOutperform: data.btcSincePct !== null ? (outperforming / withSince.length) * 100 : null,
      sampleSize: withSince.length,
    };
  }, [data]);

  return (
    <main className="max-w-6xl mx-auto px-6 py-12 sm:py-14">
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">{tr("title")}</h1>
      <p className="text-text-muted text-sm mt-2 max-w-2xl leading-relaxed">{tr("subtitle")}</p>
      <p className="text-text-muted text-xs mt-3 max-w-2xl leading-relaxed italic">{tr("disclaimer")}</p>

      {isLoaded && !isSignedIn && (
        <div className="mt-8 rounded-2xl border border-line bg-surface p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="font-medium">{tr("authGate.title")}</div>
            <p className="text-sm text-text-muted leading-relaxed mt-1 max-w-md">{tr("authGate.body")}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/sign-in"
              className="px-3 py-1.5 rounded-md border border-line text-sm text-text-muted hover:text-text hover:border-text-muted transition-colors whitespace-nowrap"
            >
              {tr("authGate.signIn")}
            </Link>
            <Link href="/sign-up" className="btn-primary whitespace-nowrap">
              {tr("authGate.signUp")}
            </Link>
          </div>
        </div>
      )}

      {isSignedIn && (
        <>
      <div className="mt-8 flex flex-wrap gap-2">
        {CATEGORY_FILTERS.map((key) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            className={`px-3 py-1.5 rounded-md text-xs border transition-colors ${
              category === key ? "border-gold text-gold bg-gold/10" : "border-line text-text-muted hover:text-text"
            }`}
          >
            {key === "all" ? tr("filterAll") : tr(`category.${key}`)}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tr("searchPlaceholder")}
          className="px-3 py-1.5 rounded-md text-sm bg-surface-raised border border-line focus:outline-none focus:border-gold"
        />
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="px-3 py-1.5 rounded-md text-xs bg-surface-raised border border-line text-text-muted"
        >
          <option value="rank">{tr("sort.rank")}</option>
          <option value="change24h">{tr("sort.change24h")}</option>
          <option value="perf7d">{tr("sort.perf7d")}</option>
          <option value="perf30d">{tr("sort.perf30d")}</option>
          <option value="volume">{tr("sort.volume")}</option>
          <option value="name">{tr("sort.name")}</option>
        </select>
      </div>

      {!error && !data && <p className="mt-8 text-sm text-text-muted">{tr("loading")}</p>}
      {error && !data && <p className="mt-6 text-sm text-bear">{tr("error")}</p>}

      {data && (
        <>
          <div className="mt-6 text-xs text-text-muted">
            {tr("lastUpdated")}: {new Date(data.generatedAt).toLocaleString()}
            {data.stale && <span className="text-gold ms-2">{tr("staleNotice")}</span>}
          </div>

          <div className="mt-4 card overflow-hidden">
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead className="bg-surface-raised/40 text-text-muted">
                  <tr>
                    <th className="text-left px-4 py-3 font-normal text-[11px] uppercase tracking-wide">{tr("col.rank")}</th>
                    <th className="text-left px-4 py-3 font-normal text-[11px] uppercase tracking-wide">{tr("col.asset")}</th>
                    <th className="text-right px-4 py-3 font-normal text-[11px] uppercase tracking-wide">{tr("col.price")}</th>
                    <th className="text-right px-4 py-3 font-normal text-[11px] uppercase tracking-wide">{tr("col.change24h")}</th>
                    <th className="text-right px-4 py-3 font-normal text-[11px] uppercase tracking-wide">{tr("col.perf7d")}</th>
                    <th className="text-right px-4 py-3 font-normal text-[11px] uppercase tracking-wide">{tr("col.perf30d")}</th>
                    <th className="text-right px-4 py-3 font-normal text-[11px] uppercase tracking-wide">{tr("col.volume")}</th>
                    <th className="text-left px-4 py-3 font-normal text-[11px] uppercase tracking-wide">{tr("col.categories")}</th>
                    <th className="text-right px-4 py-3 font-normal text-[11px] uppercase tracking-wide">{tr("col.score")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-10 text-text-muted">
                        {tr("empty")}
                      </td>
                    </tr>
                  )}
                  {filtered.map((asset) => (
                    <AssetRow key={asset.symbol} asset={asset} tr={tr} />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="sm:hidden divide-y divide-line">
              {filtered.length === 0 && <div className="text-center py-10 text-sm text-text-muted">{tr("empty")}</div>}
              {filtered.map((asset) => (
                <AssetCardMobile key={asset.symbol} asset={asset} tr={tr} />
              ))}
            </div>
          </div>

          <section className="mt-14 border-t border-line pt-10">
            <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">{tr("methodology.title")}</h2>
            <p className="mt-3 text-sm text-text-muted leading-relaxed max-w-3xl">{tr("methodology.body")}</p>
            <ul className="mt-4 text-xs text-text-muted space-y-1 max-w-2xl list-disc ps-4">
              <li>{tr("methodology.w30d")}</li>
              <li>{tr("methodology.w7d")}</li>
              <li>{tr("methodology.wRelBtc")}</li>
              <li>{tr("methodology.wTrend")}</li>
              <li>{tr("methodology.wVolume")}</li>
              <li>{tr("methodology.wLiquidity")}</li>
              <li>{tr("methodology.wVolatility")}</li>
            </ul>
            <p className="mt-4 text-xs text-gold leading-relaxed max-w-2xl">{tr("methodology.disclaimer")}</p>
          </section>

          <section className="mt-14 border-t border-line pt-10">
            <h2 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">{tr("history.title")}</h2>
            <p className="mt-2 text-xs text-text-muted">
              {tr("history.baseline")}: <span className="font-data">{data.baselineDate}</span>
            </p>

            {bestWorst ? (
              <>
                {bestWorst.pctOutperform !== null && (
                  <p className="mt-3 text-sm text-text-muted">
                    {tr("history.outperformPrefix")}{" "}
                    <span className="text-gold font-data">{bestWorst.pctOutperform.toFixed(0)}%</span>{" "}
                    {tr("history.outperformSuffix")}
                    {data.btcSincePct !== null && (
                      <>
                        {" "}
                        ({tr("history.btcSince")}:{" "}
                        <span className="font-data">
                          {data.btcSincePct >= 0 ? "+" : ""}
                          {data.btcSincePct.toFixed(1)}%
                        </span>
                        )
                      </>
                    )}
                  </p>
                )}
                <div className="mt-4 grid sm:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-medium text-bull">{tr("history.best")}</h3>
                    <ul className="mt-2 text-sm space-y-1">
                      {bestWorst.best.map((b) => (
                        <li key={b.symbol} className="flex justify-between font-data">
                          <span>{b.symbol}</span>
                          <span className="text-bull">+{b.sincePct.toFixed(1)}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-bear">{tr("history.worst")}</h3>
                    <ul className="mt-2 text-sm space-y-1">
                      {bestWorst.worst.map((b) => (
                        <li key={b.symbol} className="flex justify-between font-data">
                          <span>{b.symbol}</span>
                          <span className="text-bear">
                            {b.sincePct >= 0 ? "+" : ""}
                            {b.sincePct.toFixed(1)}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm text-text-muted">{tr("history.buildingUp")}</p>
            )}

            {data.universeLog.length > 0 && (
              <details className="mt-6 text-xs text-text-muted">
                <summary className="cursor-pointer hover:text-text">{tr("history.universeChanges")}</summary>
                <ul className="mt-2 space-y-1">
                  {data.universeLog.map((entry, i) => (
                    <li key={i} className="font-data">
                      {entry.date}: {entry.added.length > 0 && `+${entry.added.join(", ")}`}{" "}
                      {entry.removed.length > 0 && `-${entry.removed.join(", ")}`}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <p className="mt-6 text-xs text-text-muted leading-relaxed max-w-2xl">{tr("history.disclaimer")}</p>
          </section>
        </>
      )}
        </>
      )}
    </main>
  );
}

function PerfCell({ value }: { value: number | null }) {
  if (value === null) {
    return <td className="px-4 py-3 font-data text-right text-text-muted">—</td>;
  }
  const positive = value >= 0;
  return (
    <td className={`px-4 py-3 font-data text-right ${positive ? "text-bull" : "text-bear"}`}>
      {positive ? "+" : ""}
      {value.toFixed(1)}%
    </td>
  );
}

function CategoryBadges({ categories, tr }: { categories: AssetCategory[]; tr: (k: string) => string }) {
  return (
    <div className="flex flex-wrap gap-1">
      {categories.map((c) => (
        <span key={c} className="text-[10px] px-1.5 py-0.5 rounded border border-line text-text-muted whitespace-nowrap">
          {tr(`category.${c}Short`)}
        </span>
      ))}
    </div>
  );
}

function AssetRow({ asset, tr }: { asset: ApiAsset; tr: (k: string) => string }) {
  const positive24h = asset.change24hPct >= 0;
  return (
    <tr className="group border-t border-line hover:bg-surface-raised/40 transition-colors">
      <td className="px-4 py-3 text-text-muted font-data">#{asset.rank}</td>
      <td className="px-4 py-3">
        <Link href={`/coins/${asset.symbol}`} className="flex items-center gap-2.5 group-hover:text-gold transition-colors">
          <AssetLogo base={asset.symbol} />
          <span className="font-data font-medium">{asset.symbol}/USDT</span>
          {asset.insufficientHistory && (
            <span
              className="text-[10px] text-gold border border-gold/40 rounded px-1 shrink-0"
              title={tr("insufficientHistory")}
            >
              !
            </span>
          )}
        </Link>
      </td>
      <td className="px-4 py-3 font-data text-right">${formatPrice(asset.price)}</td>
      <td className={`px-4 py-3 font-data text-right ${positive24h ? "text-bull" : "text-bear"}`}>
        {positive24h ? "+" : ""}
        {asset.change24hPct.toFixed(2)}%
      </td>
      <PerfCell value={asset.perf7dPct} />
      <PerfCell value={asset.perf30dPct} />
      <td className="px-4 py-3 font-data text-right text-text-muted">${formatCompact(asset.liquidityUsdt)}</td>
      <td className="px-4 py-3">
        <CategoryBadges categories={asset.categories} tr={tr} />
      </td>
      <td className="px-4 py-3 font-data text-right text-gold">{asset.strengthScore.toFixed(0)}</td>
    </tr>
  );
}

function AssetCardMobile({ asset, tr }: { asset: ApiAsset; tr: (k: string) => string }) {
  const positive24h = asset.change24hPct >= 0;
  return (
    <Link href={`/coins/${asset.symbol}`} className="flex items-start gap-3 px-4 py-3 active:bg-surface-raised/40 transition-colors">
      <AssetLogo base={asset.symbol} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-data text-sm font-medium truncate">
            #{asset.rank} {asset.symbol}/USDT
          </span>
          <span className="font-data text-sm">${formatPrice(asset.price)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <CategoryBadges categories={asset.categories} tr={tr} />
          <span className={`font-data text-xs shrink-0 ${positive24h ? "text-bull" : "text-bear"}`}>
            {positive24h ? "+" : ""}
            {asset.change24hPct.toFixed(2)}%
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-text-muted">
          <span>
            7d: {asset.perf7dPct === null ? "—" : `${asset.perf7dPct >= 0 ? "+" : ""}${asset.perf7dPct.toFixed(1)}%`} ·{" "}
            30d: {asset.perf30dPct === null ? "—" : `${asset.perf30dPct >= 0 ? "+" : ""}${asset.perf30dPct.toFixed(1)}%`}
          </span>
          <span className="text-gold">{tr("col.score")}: {asset.strengthScore.toFixed(0)}</span>
        </div>
      </div>
    </Link>
  );
}

function AssetLogo({ base }: { base: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  if (imgFailed) {
    return (
      <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-text-muted shrink-0 font-data bg-surface-raised border border-line">
        {base.slice(0, 3)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://assets.coincap.io/assets/icons/${base.toLowerCase()}@2x.png`}
      alt={base}
      className="w-7 h-7 rounded-full shrink-0 bg-white object-contain p-0.5"
      onError={() => setImgFailed(true)}
    />
  );
}
