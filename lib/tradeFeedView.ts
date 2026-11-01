// Pure view helpers for the Trade Feed signal card. They only read what a published trade already
// contains (strings it was published with, status, hit levels) plus an optional live price; nothing
// here changes or invents a price, and nothing is persisted.

import type { PublishedTrade } from "@/lib/tradeFeed";

/** First number in a published price string ("1,234.5", "$0.0123"). Null if there is none. */
export function parsePrice(s: string | undefined | null): number | null {
  if (!s) return null;
  const m = s.match(/\d[\d,]*(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** "119.5 - 121.5" -> {low, high}; a single number -> a zero-width zone; anything else -> null. */
export function parseZone(s: string | undefined | null): { low: number; high: number } | null {
  if (!s) return null;
  const nums = (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((x) => Number(x.replace(/,/g, ""))).filter(Number.isFinite);
  if (nums.length === 1) return { low: nums[0], high: nums[0] };
  if (nums.length === 2) return { low: Math.min(...nums), high: Math.max(...nums) };
  return null;
}

export type CardState = "waiting" | "inZone" | "active" | "tpHit" | "completed" | "stopped" | "closed";

export type DerivedState = { state: CardState; lastTp: "TP1" | "TP2" | "TP3" | null };

const isTp = (x: string | undefined): x is "TP1" | "TP2" | "TP3" => x === "TP1" || x === "TP2" || x === "TP3";

/**
 * Card state from the trade's own status and hit levels. For an OPEN long that has not hit any level,
 * the live price decides between "waiting" (price above the entry zone), "inZone" and plain "active".
 * Without a live price (or a parseable zone) it stays "active" - we never guess.
 */
export function deriveState(trade: PublishedTrade, livePrice: number | null): DerivedState {
  const hit = trade.hitLevels ?? [];
  const last = hit[hit.length - 1];
  const lastTp = [...hit].reverse().find(isTp) ?? null;
  if ((trade.status ?? "open") === "closed") {
    if (last === "SL") return { state: "stopped", lastTp };
    if (isTp(last)) return { state: "completed", lastTp: last };
    return { state: "closed", lastTp };
  }
  if (last === "SL") return { state: "stopped", lastTp };
  if (isTp(last)) return { state: "tpHit", lastTp: last };
  if (trade.direction === "Long" && livePrice !== null) {
    const z = parseZone(trade.entryZone);
    if (z) {
      if (livePrice > z.high) return { state: "waiting", lastTp: null };
      if (livePrice >= z.low) return { state: "inZone", lastTp: null };
    }
  }
  return { state: "active", lastTp: null };
}

export type Rail = {
  /** 0-100 positions along an ascending price axis. */
  sl: number;
  zone: { from: number; to: number };
  tps: [number, number, number];
  live: { pos: number; outside: "below" | "above" | null } | null;
};

/** Positions for the price map, only when SL < entry zone < TP1 <= TP2 <= TP3 (a coherent long). */
export function buildRail(trade: PublishedTrade, livePrice: number | null): Rail | null {
  const sl = parsePrice(trade.invalidation);
  const zone = parseZone(trade.entryZone);
  const tp = [parsePrice(trade.tp1), parsePrice(trade.tp2), parsePrice(trade.tp3)];
  if (sl === null || !zone || tp.some((x) => x === null)) return null;
  const [t1, t2, t3] = tp as [number, number, number];
  if (!(sl < zone.low && zone.high < t1 && t1 <= t2 && t2 <= t3)) return null;
  const span = t3 - sl;
  const min = sl - span * 0.06;
  const max = t3 + span * 0.06;
  const at = (v: number) => ((v - min) / (max - min)) * 100;
  let live: Rail["live"] = null;
  if (livePrice !== null && Number.isFinite(livePrice)) {
    const p = at(livePrice);
    live = p < 0 ? { pos: 0, outside: "below" } : p > 100 ? { pos: 100, outside: "above" } : { pos: p, outside: null };
  }
  return { sl: at(sl), zone: { from: at(zone.low), to: at(zone.high) }, tps: [at(t1), at(t2), at(t3)], live };
}

/** Allocation of the position closed at each target, as set by Atlas's trade management. */
export const TP_ALLOCATION = [30, 40, 30] as const;
