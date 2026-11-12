// SIGNAL-NOTIFY-v1
// Coin display name for the "New signal: Bitcoin (BTC)" notification. Server-only (reads Redis and CoinMarketCap).
// Order: built-in names for the big coins, then a Redis cache, then CoinMarketCap (existing COINMARKETCAP_API_KEY),
// whose answer is cached. If no name can be found the caller falls back to the symbol alone; nothing is invented.
import type { Redis } from "@upstash/redis";
import { getCoinNameFromCmc } from "@/lib/coinmarketcap";
import { KNOWN } from "@/lib/coinNamesKnown";



const CACHE_KEY = (symbol: string) => `coin:name:${symbol}`;
const CACHE_SECONDS = 60 * 60 * 24 * 30;

/** "ZRO/USDT" | "ZROUSDT" | "zro-usdt" -> "ZRO". Null when it is not a plausible ticker. */
export function baseSymbol(pair: string): string | null {
  const s = String(pair ?? "").replace(/[\/\s-]/g, "").toUpperCase();
  const base = s.length > 4 && s.endsWith("USDT") ? s.slice(0, -4) : s;
  return /^[A-Z0-9]{1,15}$/.test(base) ? base : null;
}

/** Display name for a ticker, or null when unknown. Never throws. */
export async function coinNameFor(symbol: string, redis: Redis | null, lookup: (s: string) => Promise<string | null> = getCoinNameFromCmc): Promise<string | null> {
  if (KNOWN[symbol]) return KNOWN[symbol];
  try {
    const cached = redis ? await redis.get<string>(CACHE_KEY(symbol)) : null;
    if (typeof cached === "string" && cached) return cached;
    const found = await lookup(symbol);
    if (found && redis) await redis.set(CACHE_KEY(symbol), found, { ex: CACHE_SECONDS }).catch(() => {});
    return found;
  } catch (err) {
    console.error("coinName: lookup failed", err);
    return null;
  }
}
