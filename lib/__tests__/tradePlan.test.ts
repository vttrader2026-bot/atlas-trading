import { describe, expect, it } from "vitest";
import { computePlan, type PlanInputs } from "@/lib/planCalc";
import { planToTrade } from "@/lib/planBridge";
import { emptyDraft, normalizeDraft, type TradePlanDraft } from "@/lib/tradePlan";
import { realizedPnl, validateTrade } from "@/lib/journal";

const inp = (o: Partial<PlanInputs> = {}): PlanInputs => ({ balance: "1000", riskPct: "1", entry: "100", invalidation: "95", tp1: "110", tp2: "120", tp3: "130", ...o });
const val = (i: PlanInputs) => {
  const r = computePlan(i);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe("plan sizing", () => {
  it("risk-based size: planned loss, position, quantity, stop distance", () => {
    const v = val(inp());
    expect(v.plannedLoss).toBeCloseTo(10, 10);
    expect(v.maxLoss).toBeCloseTo(10, 10);
    expect(v.quantity).toBeCloseTo(2, 10);
    expect(v.positionUsdt).toBeCloseTo(200, 10);
    expect(v.stopDistancePct).toBeCloseTo(5, 10);
    expect(v.capped).toBe(false);
  });
  it("profit and risk/reward at each target", () => {
    const v = val(inp());
    expect(v.targets.map((t) => [t.key, t.profit, t.rr])).toEqual([["TP1", 20, 2], ["TP2", 40, 4], ["TP3", 60, 6]]);
    expect(v.targets[2].profitPctOfBalance).toBeCloseTo(6, 10);
  });
  it("blended 30/40/30 result when all three targets are valid", () => {
    const v = val(inp());
    // avg exit = 110*.3 + 120*.4 + 130*.3 = 120 -> profit 2*(120-100)=40, R = 4
    expect(v.blended?.profit).toBeCloseTo(40, 10);
    expect(v.blended?.rr).toBeCloseTo(4, 10);
    expect(val(inp({ tp3: "" })).blended).toBeNull();
  });
  it("NEVER sizes a position larger than the account balance", () => {
    const v = val(inp({ riskPct: "2", invalidation: "99.9" })); // would need $20,000
    expect(v.capped).toBe(true);
    expect(v.positionUsdt).toBeCloseTo(1000, 8);
    expect(v.quantity).toBeCloseTo(10, 8);
    expect(v.maxLoss).toBeCloseTo(10 * 0.1, 8); // real max loss is far below the planned $20
    expect(v.plannedLoss).toBeCloseTo(20, 10);
    expect(v.positionUsdt).toBeLessThanOrEqual(1000 + 1e-9);
  });
  it("holds the cap for many random inputs", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let n = 0; n < 500; n++) {
      const balance = 10 + rnd() * 100000, entry = 0.001 + rnd() * 70000, stop = entry * (0.5 + rnd() * 0.499), risk = 0.1 + rnd() * 20;
      const r = computePlan(inp({ balance: String(balance), entry: String(entry), invalidation: String(stop), riskPct: String(risk), tp1: "", tp2: "", tp3: "" }));
      if (!r.ok) continue;
      expect(r.value.positionUsdt).toBeLessThanOrEqual(balance * (1 + 1e-9));
      expect(r.value.maxLoss).toBeLessThanOrEqual(balance * (risk / 100) * (1 + 1e-9));
    }
  });
  it("incomplete and invalid levels", () => {
    expect(computePlan(inp({ entry: "" }))).toEqual({ ok: false, error: "incomplete" });
    expect(computePlan(inp({ balance: "abc" }))).toEqual({ ok: false, error: "incomplete" });
    expect(computePlan(inp({ invalidation: "100" }))).toEqual({ ok: false, error: "stopNotBelowEntry" });
    expect(computePlan(inp({ invalidation: "105" }))).toEqual({ ok: false, error: "stopNotBelowEntry" });
    expect(computePlan(inp({ riskPct: "150" }))).toEqual({ ok: false, error: "riskTooHigh" });
  });
  it("bad targets are flagged without blocking the sizing", () => {
    const v = val(inp({ tp1: "90", tp2: "x", tp3: "130" }));
    expect(v.targets.map((t) => t.key)).toEqual(["TP3"]);
    expect(v.targetIssues).toEqual([{ key: "TP1", code: "notAboveEntry" }, { key: "TP2", code: "invalid" }]);
    expect(val(inp({ tp1: "130", tp2: "120", tp3: "125" })).targetIssues.map((x) => x.code)).toContain("order");
  });
  it("accepts Arabic-Indic digits like the Risk Calculator", () => {
    expect(val(inp({ entry: "١٠٠", invalidation: "٩٥" })).quantity).toBeCloseTo(2, 10);
  });
});

describe("normalizeDraft (spot only)", () => {
  it("reads a legacy Short as Wait and defaults everything else", () => {
    expect(normalizeDraft({ pair: "BTC/USDT", direction: "Short" }).direction).toBe("Wait");
    expect(normalizeDraft({ direction: "Long" }).direction).toBe("Long");
    expect(normalizeDraft(null)).toEqual({ ...emptyDraft });
    expect(normalizeDraft("garbage")).toEqual({ ...emptyDraft });
  });
  it("keeps the lifecycle fields and ignores junk types", () => {
    const d = normalizeDraft({ pair: "ETH/USDT", id: "p1", status: "entered", balance: "500", riskPct: "1.5", enteredAt: "2026-10-01", actualEntry: "101", journalId: "j1", tp1: 5, status2: 1 });
    expect(d).toMatchObject({ id: "p1", status: "entered", balance: "500", riskPct: "1.5", enteredAt: "2026-10-01", actualEntry: "101", journalId: "j1", tp1: "" });
    expect(normalizeDraft({ status: "weird" }).status).toBeUndefined();
  });
  it("accepts the Analyzer hand-off shape unchanged", () => {
    const d: TradePlanDraft = { pair: "BTC/USDT", direction: "Long", timeframe: "4H", entryZone: "61,200 - 61,800", invalidationText: "close below 60,500", entry: "61200", invalidation: "60500", tp1: "63000", tp2: "64500", tp3: "66000", reasoning: "r" };
    expect(normalizeDraft(d)).toEqual(d);
  });
});

describe("Send to Journal (plan -> trade)", () => {
  const draft: TradePlanDraft = { ...emptyDraft, id: "plan-1", pair: "BTC/USDT", timeframe: "4H", entryZone: "99 - 101", invalidationText: "close below 95", entry: "100", invalidation: "95", tp1: "110", tp2: "120", tp3: "130", reasoning: "Reclaim of range high", balance: "1000", riskPct: "1", status: "entered" };
  const ctx = { id: "trade-1", today: "2026-11-02", now: 1 };
  it("creates an Open spot long with sizing, targets, links and the plan text", () => {
    const r = planToTrade(draft, ctx);
    if (!r.ok) throw new Error(r.error);
    expect(r.trade).toMatchObject({ id: "trade-1", date: "2026-11-02", pair: "BTCUSDT", side: "Long", entry: 100, stop: 95, target: 110, tp1: 110, tp2: 120, tp3: 130, exit: null, status: "open", source: "plan", planId: "plan-1", entryReason: "Reclaim of range high" });
    expect(r.trade.size).toBeCloseTo(2, 10);
    expect(r.trade.invested).toBeCloseTo(200, 10);
    expect(r.trade.notes).toContain("Entry zone: 99 - 101");
    expect(r.trade.notes).toContain("Invalidation: close below 95");
    expect(validateTrade(r.trade)).toEqual([]);
    expect(realizedPnl(r.trade)).toBeNull();
  });
  it("uses the confirmed actual entry price and date, resizing from it", () => {
    const r = planToTrade({ ...draft, actualEntry: "98", enteredAt: "2026-10-30" }, ctx);
    if (!r.ok) throw new Error(r.error);
    expect(r.trade.entry).toBe(98);
    expect(r.trade.date).toBe("2026-10-30");
    expect(r.trade.size).toBeCloseTo(10 / 3, 10); // risk 10 / stop distance 3
  });
  it("carries a capped position (never above the balance)", () => {
    const r = planToTrade({ ...draft, riskPct: "2", invalidation: "99.9" }, ctx);
    if (!r.ok) throw new Error(r.error);
    expect(r.trade.invested).toBeLessThanOrEqual(1000 + 1e-9);
  });
  it("never creates a trade for a plan whose entry is not confirmed", () => {
    expect(planToTrade({ ...draft, status: "draft" }, ctx)).toEqual({ ok: false, error: "notEntered" });
    expect(planToTrade({ ...draft, status: undefined }, ctx)).toEqual({ ok: false, error: "notEntered" });
  });
  it("refuses Wait plans, missing pair and unusable levels", () => {
    expect(planToTrade({ ...draft, direction: "Wait" }, ctx)).toEqual({ ok: false, error: "wait" });
    expect(planToTrade({ ...draft, pair: " " }, ctx)).toEqual({ ok: false, error: "pair" });
    expect(planToTrade({ ...draft, invalidation: "101" }, ctx)).toEqual({ ok: false, error: "stopNotBelowEntry" });
    expect(planToTrade({ ...draft, entry: "" }, ctx)).toEqual({ ok: false, error: "incomplete" });
  });
  it("Split refuses a target that is not above entry (all three are required); TP3 Only ignores TP1/TP2 so bad data never reaches the Journal", () => {
    expect(planToTrade({ ...draft, tp2: "90" }, ctx)).toEqual({ ok: false, error: "targets" });
    const r = planToTrade({ ...draft, exitStrategy: "tp3", tp2: "90" }, ctx);
    if (!r.ok) throw new Error(r.error);
    expect(r.trade.tp2).toBeNull();
    expect(validateTrade(r.trade)).toEqual([]);
  });
});
