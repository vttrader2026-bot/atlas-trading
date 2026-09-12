// Thin client for Binance's public REST endpoints. No API key required —
// these are the same public endpoints powering the price ticker.

export type Ticker24h = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  quoteVolume: string;
};

const BASE = "https://api.binance.com/api/v3";

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

export function formatPrice(value: string | number, digits = 2): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  const decimals = n < 1 ? 6 : n < 100 ? 4 : digits;
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatCompact(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
}
