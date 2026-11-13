// ATLAS INVESTOR V1: DCA planner. A plan is a checklist of purchases YOU make yourself; nothing executes automatically.
import { DcaPlan, Frequency, InvestorDoc, Purchase, purchaseCost, r8 } from "./model";

export type Slot = {
  key: string;
  kind: "initial" | "recurring" | "dip";
  /** Planned amount in USDT. */
  amount: number;
  /** Due date for initial/recurring slots. */
  date: string | null;
  /** Dip level price (refPrice x (1 - drop%)). */
  triggerPrice: number | null;
  dropPct: number | null;
  purchase: Purchase | null;
  status: "done" | "due" | "upcoming" | "triggered" | "waiting";
};

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** n-th occurrence (0-based) of a schedule starting at `start`. Monthly keeps the day of month, clamped to the month's end. */
export function nthDate(start: string, freq: Frequency, n: number): string {
  const s = new Date(`${start}T00:00:00Z`);
  if (freq === "weekly") return ymd(new Date(s.getTime() + n * 7 * 86_400_000));
  if (freq === "biweekly") return ymd(new Date(s.getTime() + n * 14 * 86_400_000));
  const day = s.getUTCDate();
  const first = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return ymd(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, last))));
}

/**
 * Adds or updates a purchase. One plan slot = one purchase: if the slot already has a recorded purchase (double submit,
 * second tab), that purchase is updated instead of a second transaction being added. Pure.
 */
export function withPlanPurchase(purchases: readonly Purchase[], p: Purchase): Purchase[] {
  const prior = p.planId && p.slot ? slotPurchase(purchases, p.planId, p.slot) : undefined;
  const next = { ...p, id: prior ? prior.id : p.id };
  return purchases.some((x) => x.id === next.id) ? purchases.map((x) => (x.id === next.id ? next : x)) : [...purchases, next];
}

export type PlanProgress = {
  slots: Slot[];
  spent: number;
  remaining: number;
  committed: number;
  overCommitted: boolean;
  doneCount: number;
  totalCount: number;
  history: Purchase[];
  /** Total quantity bought through this plan (recorded purchases only). */
  qty: number;
  /** Average entry = total cost incl. fees / total quantity of the recorded purchases. null until a purchase is recorded. */
  avgEntry: number | null;
};

/** The purchase already recorded for a plan slot, if any. One slot = one purchase. */
export const slotPurchase = (purchases: readonly Purchase[], planId: string, slot: string): Purchase | undefined =>
  purchases.find((p) => p.planId === planId && p.slot === slot);

export function planProgress(plan: DcaPlan, purchases: Purchase[], today: string, livePrice: number | null): PlanProgress {
  const linked = purchases.filter((p) => p.planId === plan.id);
  const bySlot = new Map(linked.filter((p) => p.slot).map((p) => [p.slot as string, p]));
  const slots: Slot[] = [];
  if (plan.initial > 0) {
    const p = bySlot.get("initial") ?? null;
    slots.push({ key: "initial", kind: "initial", amount: plan.initial, date: plan.recurring.startDate, triggerPrice: null, dropPct: null, purchase: p, status: p ? "done" : plan.recurring.startDate <= today ? "due" : "upcoming" });
  }
  for (let i = 0; i < plan.recurring.count; i++) {
    const date = nthDate(plan.recurring.startDate, plan.recurring.frequency, i + (plan.initial > 0 ? 1 : 0));
    const p = bySlot.get(`r${i + 1}`) ?? null;
    slots.push({ key: `r${i + 1}`, kind: "recurring", amount: plan.recurring.amount, date, triggerPrice: null, dropPct: null, purchase: p, status: p ? "done" : date <= today ? "due" : "upcoming" });
  }
  plan.dips.forEach((d, i) => {
    const p = bySlot.get(`d${i + 1}`) ?? null;
    const trigger = r8(plan.refPrice * (1 - d.dropPct / 100));
    slots.push({ key: `d${i + 1}`, kind: "dip", amount: d.amount, date: null, triggerPrice: trigger, dropPct: d.dropPct, purchase: p, status: p ? "done" : livePrice !== null && livePrice <= trigger ? "triggered" : "waiting" });
  });
  const spent = r8(linked.reduce((a, p) => a + purchaseCost(p), 0));
  const qty = r8(linked.reduce((a, p) => a + p.qty, 0));
  const committed = r8(slots.reduce((a, s) => a + s.amount, 0));
  return { slots, spent, remaining: r8(plan.budget - spent), committed, overCommitted: committed > plan.budget + 1e-9, doneCount: slots.filter((s) => s.status === "done").length, totalCount: slots.length, history: linked.sort((a, b) => b.date.localeCompare(a.date)), qty, avgEntry: qty > 0 ? spent / qty : null };
}

export const plansOf = (doc: InvestorDoc) => doc.plans;
