// Thin client for Binance's public REST endpoints. No API key required —
// these are the same public endpoints powering the price ticker.

export type Ticker24h = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  quoteVolume: string;
  closeTime?: number;
};

export type Kline = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
};

const BASE = "https://data-api.binance.vision/api/v3";

/** All USDT-quoted symbols, e.g. ["BTCUSDT", "ETHUSDT", ...] */
export async function getUsdtSymbols(): Promise<string[]> {
  const res = await fetch(`${BASE}/exchangeInfo`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load symbol list");
  const data = await res.json();
  return (data.symbols as Array<{ symbol: string; quoteAsset: string; status: string }>)
    .filter((s) => s.quoteAsset === "USDT" && s.status === "TRADING")
    .map((s) => s.symbol)
    .sort();
}

/** 24h ticker stats for every USDT pair in one call. */
export async function getAllTickers24h(): Promise<Ticker24h[]> {
  const res = await fetch(`${BASE}/ticker/24hr`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load ticker data");
  const data = (await res.json()) as Ticker24h[];
  return data.filter((t) => t.symbol.endsWith("USDT"));
}

/** 24h ticker stats for a single symbol, e.g. "BTCUSDT". */
export async function getTicker24h(symbol: string): Promise<Ticker24h> {
  const res = await fetch(`${BASE}/ticker/24hr?symbol=${symbol}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${symbol}`);
  return res.json();
}

/**
 * Daily (or other interval) candles for a symbol, oldest first, most recent
 * (possibly still-forming) candle last. Used for real historical performance
 * and volatility math — never estimated visually or guessed.
 */
export async function getKlines(symbol: string, interval: string, limit: number): Promise<Kline[]> {
  const res = await fetch(`${BASE}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Failed to load klines for ${symbol}`);
  const raw = (await res.json()) as unknown[];
  return (raw as Array<Array<string | number>>).map((k) => ({
    openTime: Number(k[0]),
    open: parseFloat(String(k[1])),
    high: parseFloat(String(k[2])),
    low: parseFloat(String(k[3])),
    close: parseFloat(String(k[4])),
    volume: parseFloat(String(k[5])),
    closeTime: Number(k[6]),
    quoteVolume: parseFloat(String(k[7])),
  }));
}

export function formatPrice(value: string | number, digits = 2): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  // A genuine $0 price on a live USDT pair never happens — a literal 0 here
  // always means missing/invalid upstream data (a transient empty ticker
  // field, a reconnect gap, a delisted symbol still momentarily present),
  // never a real price. Show the same "unavailable" marker as NaN rather
  // than a misleading "$0.00".
  if (Number.isNaN(n) || n <= 0) return "—";
  const decimals = n < 1 ? 6 : n < 100 ? 4 : digits;
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatCompact(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
}
