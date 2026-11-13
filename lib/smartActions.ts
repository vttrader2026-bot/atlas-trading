// Smart Actions: where a user can go next with a coin they found in Radar or Market Pulse.
// Pure helpers only. Every link opens an existing page; nothing is created or saved from here.

import { isSupportedTicker } from "@/lib/investor/assets";
import { baseOf, normalizeSymbol } from "@/lib/watchlist";

export type SmartActionKey = "analyze" | "plan" | "bought" | "invest";
export type SmartAction = { key: SmartActionKey; href: string };

/** "BTC", "btcusdt" or "BTC/USDT" -> "BTC"; null for anything that is not a USDT coin. */
export function smartBase(input: string): string | null {
  const sym = normalizeSymbol(input);
  return sym ? baseOf(sym) : null;
}

/** Atlas Investor only supports its 17 curated coins; no other coin is ever suggested for it. */
export function investorEligible(input: string): boolean {
  const base = smartBase(input);
  return base !== null && isSupportedTicker(base);
}

export function smartActions(input: string): SmartAction[] {
  const base = smartBase(input);
  if (!base) return [];
  const pair = encodeURIComponent(`${base}/USDT`);
  const out: SmartAction[] = [
    { key: "analyze", href: `/analyzer?pair=${pair}` },
    { key: "plan", href: `/trade-plan?pair=${pair}` },
    { key: "bought", href: `/journal?pair=${pair}` },
  ];
  if (isSupportedTicker(base)) out.push({ key: "invest", href: `/investor?asset=${encodeURIComponent(base)}` });
  return out;
}
