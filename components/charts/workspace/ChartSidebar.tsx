"use client";

// Right-hand panel: Watchlist, Market, Trade and Data. Every tab reuses an
// existing ATLAS source (the shared watchlist store, the shared live ticker
// stream, the Analyzer / Trade Plan / Trade Feed / Radar pages) or shows real
// data for the open chart. Nothing is simulated and no orders can be placed.
// Only the active tab is mounted, so a closed or idle panel costs nothing.

import Link from "next/link";
import { useMemo } from "react";
import { useLanguage } from "@/lib/i18n";
import { formatPrice } from "@/lib/binance";
import { useLiveTickers } from "@/lib/useLiveTickers";
import { useWatchlist } from "@/lib/useWatchlist";
import { baseOf } from "@/lib/watchlist";
import type { Candle } from "@/lib/marketDataTypes";
import type { SidebarTab } from "@/components/charts/hooks/useChartLayout";
import StarButton from "@/components/watchlist/StarButton";

const TABS: SidebarTab[] = ["watchlist", "market", "trade", "data"];
const TAB_KEY: Record<SidebarTab, string> = { watchlist: "tabWatchlist", market: "tabMarket", trade: "tabTrade", data: "tabData" };
const LEVERAGED = /(UP|DOWN|BULL|BEAR)USDT$/;

type Props = {
  variant: "side" | "sheet";
  symbol: string;
  onSelect: (symbol: string) => void;
  tab: SidebarTab;
  onTab: (t: SidebarTab) => void;
  onClose: () => void;
  lastCandle: Candle | null;
  timeframeLabel: string;
};

function Row({ symbol, active, price, pct, onSelect }: { symbol: string; active: boolean; price?: string; pct?: string; onSelect: (s: string) => void }) {
  const p = pct === undefined ? null : Number(pct);
  return (
    <button type="button" onClick={() => onSelect(symbol)} aria-current={active ? "true" : undefined} className={`flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-gold/10 ${active ? "bg-gold/15" : ""}`}>
      <span className="font-data font-medium">{baseOf(symbol)}<span className="text-text-muted">/USDT</span></span>
      <span className="ms-auto font-data" dir="ltr">{price !== undefined ? formatPrice(price) : "—"}</span>
      <span className={`w-16 text-end font-data text-xs ${p === null ? "text-text-muted" : p >= 0 ? "text-bull" : "text-bear"}`} dir="ltr">
        {p === null || !Number.isFinite(p) ? "" : `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`}
      </span>
    </button>
  );
}

function WatchlistTab({ symbol, onSelect }: { symbol: string; onSelect: (s: string) => void }) {
  const { t } = useLanguage();
  const wl = useWatchlist();
  const tickers = useLiveTickers();
  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="font-data text-sm">{baseOf(symbol)}/USDT</span>
        <StarButton symbol={symbol} size={18} />
      </div>
      {wl.items.length === 0 ? (
        <p className="px-3 py-4 text-sm text-text-muted">{t("charts.wlEmpty")}</p>
      ) : (
        wl.items.map((i) => <Row key={i.symbol} symbol={i.symbol} active={i.symbol === symbol} price={tickers[i.symbol]?.lastPrice} pct={tickers[i.symbol]?.priceChangePercent} onSelect={onSelect} />)
      )}
      <Link href="/watchlist" target="_blank" rel="noopener noreferrer" className="block px-3 py-3 text-xs text-gold underline">
        {t("charts.wlOpen")}
      </Link>
    </div>
  );
}

function MarketTab({ symbol, onSelect }: { symbol: string; onSelect: (s: string) => void }) {
  const { t } = useLanguage();
  const tickers = useLiveTickers();
  const top = useMemo(
    () =>
      Object.values(tickers)
        .filter((k) => k.symbol.endsWith("USDT") && !LEVERAGED.test(k.symbol))
        .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
        .slice(0, 30),
    [tickers]
  );
  return (
    <div>
      <p className="px-3 py-2 text-xs text-text-muted">{t("charts.mkTitle")}</p>
      {top.length === 0 ? <p className="px-3 py-3 text-sm text-text-muted">{t("charts.mkLoading")}</p> : top.map((k) => <Row key={k.symbol} symbol={k.symbol} active={k.symbol === symbol} price={k.lastPrice} pct={k.priceChangePercent} onSelect={onSelect} />)}
      <div className="flex gap-3 px-3 py-3 text-xs">
        <Link href="/radar" target="_blank" rel="noopener noreferrer" className="text-gold underline">{t("charts.mkRadar")}</Link>
        <Link href="/market-intelligence" target="_blank" rel="noopener noreferrer" className="text-gold underline">{t("nav.marketIntel")}</Link>
      </div>
    </div>
  );
}

function TradeTab({ symbol }: { symbol: string }) {
  const { t } = useLanguage();
  const link = "block rounded-md border border-line px-3 py-2.5 text-sm hover:border-gold/60 hover:text-gold";
  return (
    <div className="space-y-2 p-3">
      <p className="text-sm text-text-muted">{t("charts.tradeIntro")}</p>
      <Link className={link} href={`/analyzer?pair=${baseOf(symbol)}/USDT`} target="_blank" rel="noopener noreferrer">{t("charts.tradeAnalyze")}</Link>
      <Link className={link} href="/trade-plan" target="_blank" rel="noopener noreferrer">{t("charts.tradePlan")}</Link>
      <Link className={link} href="/trade-feed" target="_blank" rel="noopener noreferrer">{t("charts.tradeFeed")}</Link>
      <p className="text-xs text-text-muted">{t("charts.tradeOpensTab")}</p>
    </div>
  );
}

function DataTab({ symbol, lastCandle, timeframeLabel }: { symbol: string; lastCandle: Candle | null; timeframeLabel: string }) {
  const { t } = useLanguage();
  const tickers = useLiveTickers();
  const k = tickers[symbol];
  const line = (label: string, value: string, tone = "") => (
    <div className="flex items-baseline justify-between gap-3 border-b border-line/60 px-3 py-2 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className={`font-data ${tone}`} dir="ltr">{value}</span>
    </div>
  );
  const pct = k ? Number(k.priceChangePercent) : null;
  return (
    <div>
      <p className="px-3 py-2 text-xs font-semibold text-text-muted">{t("charts.dataTitle")}</p>
      {k ? (
        <>
          {line(t("charts.dataChange"), `${(pct ?? 0) >= 0 ? "+" : ""}${(pct ?? 0).toFixed(2)}%`, (pct ?? 0) >= 0 ? "text-bull" : "text-bear")}
          {line(t("charts.dataHigh"), formatPrice(k.highPrice))}
          {line(t("charts.dataLow"), formatPrice(k.lowPrice))}
          {line(t("charts.dataVolume"), Number(k.quoteVolume).toLocaleString("en-US", { maximumFractionDigits: 0 }))}
        </>
      ) : (
        <p className="px-3 py-3 text-sm text-text-muted">{t("charts.dataWaiting")}</p>
      )}
      <p className="px-3 pb-1 pt-3 text-xs font-semibold text-text-muted">{t("charts.dataLast")}</p>
      {lastCandle && (
        <>
          {line("O", formatPrice(lastCandle.open))}
          {line("H", formatPrice(lastCandle.high))}
          {line("L", formatPrice(lastCandle.low))}
          {line("C", formatPrice(lastCandle.close))}
          {line(t("charts.dataState"), lastCandle.status === "forming" ? t("charts.dataForming") : t("charts.dataClosed"))}
        </>
      )}
      {line(t("charts.dataFrame"), timeframeLabel)}
      {line(t("charts.dataSource"), "Binance Spot")}
    </div>
  );
}

export default function ChartSidebar(p: Props) {
  const { t } = useLanguage();
  const sheet = p.variant === "sheet";
  return (
    <aside
      aria-label={t("charts.sidePanel")}
      className={sheet ? "absolute inset-x-0 bottom-0 z-30 flex h-[55%] min-h-0 flex-col border-t border-line bg-surface shadow-xl" : "flex min-h-0 w-[300px] shrink-0 flex-col border-s border-line bg-surface xl:w-[320px]"}
    >
      <div className="flex shrink-0 items-center border-b border-line" role="tablist">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={p.tab === id}
            className={`h-10 flex-1 px-1 text-sm font-medium transition-colors ${p.tab === id ? "border-b-2 border-gold text-gold" : "text-text-muted hover:text-text"}`}
            onClick={() => p.onTab(id)}
          >
            {t(`charts.${TAB_KEY[id]}`)}
          </button>
        ))}
        <button type="button" className="h-10 w-10 shrink-0 text-lg text-text-muted hover:text-text" onClick={p.onClose} aria-label={t("charts.panelHide")} title={t("charts.panelHide")}>
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" role="tabpanel">
        {p.tab === "watchlist" && <WatchlistTab symbol={p.symbol} onSelect={p.onSelect} />}
        {p.tab === "market" && <MarketTab symbol={p.symbol} onSelect={p.onSelect} />}
        {p.tab === "trade" && <TradeTab symbol={p.symbol} />}
        {p.tab === "data" && <DataTab symbol={p.symbol} lastCandle={p.lastCandle} timeframeLabel={p.timeframeLabel} />}
      </div>
    </aside>
  );
}
