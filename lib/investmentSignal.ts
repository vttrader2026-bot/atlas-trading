// INVEST-SIGNAL-v1: Investment Signals, the second Trade Feed publication type (next to the Spot Swing Signal).
// A shared long-term idea, NOT a trading position: no entry, stop-loss or take-profit, no Journal link, no confirm.
// Stored in its OWN Redis list so the existing Spot Swing feed (bot, performance, active-signal badges, Journal sync)
// never sees or changes. Only the 17 coins Atlas Investor supports can be published, so every member can act on one.
import { isSupportedTicker } from "@/lib/investor/assets";
import type { DcaPlan } from "@/lib/investor/model";
import type { SignalTier } from "@/lib/tradeFeed";

export const INVESTMENT_KEY = "atlas:investment-signals";
export const INVESTMENT_MAX = 50;
export const HORIZON_MIN = 6;
export const HORIZON_MAX = 36;

export const INVESTMENT_STATUSES = ["active", "review", "completed", "cancelled"] as const;
export type InvestmentStatus = (typeof INVESTMENT_STATUSES)[number];

export type InvestmentSignal = {
  id: string;
  createdAt: number;
  updatedAt: number;
  tier: SignalTier;
  /** Investor ticker, e.g. "BTC". */
  asset: string;
  pair: string;
  thesis: string;
  horizonMonths: number;
  strategy: string;
  /** Optional accumulation zone, free text. */
  zone: string;
  risks: string;
  notes: string;
  status: InvestmentStatus;
};

/** What a viewer without ELITE access gets for an ELITE investment idea: nothing but that it exists. */
export type LockedInvestment = { id: string; createdAt: number; asset: string; pair: string; tier: "elite"; locked: true };

export type InvestmentFields = Pick<InvestmentSignal, "asset" | "thesis" | "horizonMonths" | "strategy" | "zone" | "risks" | "notes">;
export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** "BTC", "btcusdt" and "BTC/USDT" all mean BTC. null when it is not one of the supported Investor coins. */
export function investmentAsset(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim().toUpperCase().replace(/\s+/g, "");
  const base = s.includes("/") ? (s.endsWith("/USDT") ? s.slice(0, -5) : "") : s.endsWith("USDT") && s.length > 4 ? s.slice(0, -4) : s;
  return base && isSupportedTicker(base) ? base : null;
}

export function parseInvestmentFields(body: Record<string, unknown>): ParseResult<InvestmentFields> {
  const asset = investmentAsset(body.asset ?? body.pair);
  if (!asset) return { ok: false, error: "Choose one of the coins Atlas Investor supports" };
  const thesis = text(body.thesis, 1500);
  const strategy = text(body.strategy, 600);
  const risks = text(body.risks, 800);
  const horizon = Number(body.horizonMonths);
  if (!thesis) return { ok: false, error: "The investment thesis is required" };
  if (!Number.isInteger(horizon) || horizon < HORIZON_MIN || horizon > HORIZON_MAX) return { ok: false, error: `The investment horizon must be ${HORIZON_MIN} to ${HORIZON_MAX} months` };
  if (!strategy) return { ok: false, error: "The DCA / accumulation strategy is required" };
  if (!risks) return { ok: false, error: "The risk factors are required" };
  return { ok: true, value: { asset, thesis, horizonMonths: horizon, strategy, zone: text(body.zone, 200), risks, notes: text(body.notes, 800) } };
}

export function newInvestmentSignal(fields: InvestmentFields, tier: SignalTier, id: string, now: number): InvestmentSignal {
  return { id, createdAt: now, updatedAt: now, tier, ...fields, pair: `${fields.asset}/USDT`, status: "active" };
}

/** active <-> review while the idea is live; completed and cancelled are final. */
export function canMoveInvestment(from: InvestmentStatus, to: InvestmentStatus): boolean {
  if (from === to) return false;
  if (from === "completed" || from === "cancelled") return false;
  return (INVESTMENT_STATUSES as readonly string[]).includes(to);
}
export const investmentIsOpen = (s: { status?: unknown }) => s.status === "active" || s.status === "review";

/** True when an idea for this coin and audience is already open, so the same idea is not published twice. */
export function hasOpenInvestment(list: readonly InvestmentSignal[], asset: string, tier: SignalTier): boolean {
  return list.some((s) => s.asset === asset && s.tier === tier && investmentIsOpen(s));
}

/**
 * The only place that decides what a viewer may see: FREE ideas everyone; ELITE ideas only ELITE members and the owner.
 * Everyone else gets an identity-only placeholder (no thesis, strategy, zone, risks or notes), kept in a separate list.
 */
export function investmentsForViewer(stored: readonly InvestmentSignal[], canSeeElite: boolean): { investments: InvestmentSignal[]; locked: LockedInvestment[] } {
  const investments: InvestmentSignal[] = [];
  const locked: LockedInvestment[] = [];
  for (const s of stored) {
    if (s.tier === "elite" && !canSeeElite) locked.push({ id: s.id, createdAt: s.createdAt, asset: s.asset, pair: s.pair, tier: "elite", locked: true });
    else investments.push(s);
  }
  return { investments, locked };
}

const FREQ_DAYS = { weekly: 7, biweekly: 14, monthly: 30.4 } as const;

/**
 * Public-safe starting point for sharing a DCA plan. It reads ONLY the coin, the schedule shape (cadence and number of buys)
 * and the dip percentages. The plan's name, budget, amounts, reference price, purchases and dates are never read, so they
 * cannot reach the Trade Feed. The owner reviews and edits every field before anything is published.
 */
export function planToInvestmentDraft(plan: Pick<DcaPlan, "asset" | "initial" | "recurring" | "dips">): Pick<InvestmentFields, "asset" | "strategy" | "horizonMonths"> {
  const { frequency, count } = plan.recurring;
  const months = Math.round((count * FREQ_DAYS[frequency]) / 30.4);
  const horizonMonths = Math.min(HORIZON_MAX, Math.max(HORIZON_MIN, count > 0 ? months : 12));
  const parts: string[] = [];
  if (plan.initial > 0) parts.push("start with an initial buy");
  if (count > 0) parts.push(`then buy ${frequency} (${count} buys)`);
  const drops = [...new Set(plan.dips.map((d) => d.dropPct))].sort((a, b) => a - b);
  if (drops.length) parts.push(`add extra buys on ${drops.map((d) => `${d}%`).join(", ")} drops from the reference price`);
  const strategy = parts.length ? parts.join(", ").replace(/^./, (c) => c.toUpperCase()) + "." : "Accumulate gradually.";
  return { asset: plan.asset, strategy, horizonMonths };
}
