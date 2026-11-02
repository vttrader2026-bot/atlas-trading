import { describe, it, expect } from "vitest";
import { calcPositionBased, calcRiskBased, parseInput, RISK_PRESETS } from "@/lib/riskCalc";

const ok = (r: ReturnType<typeof calcRiskBased>) => {
  if (!r.ok) throw new Error("expected ok, got " + r.error);
  return r.value;
};

describe("parseInput", () => {
  it("parses plain, comma and Arabic-Indic numbers", () => {
    expect(parseInput("1000")).toBe(1000);
    expect(parseInput(" 1,250.5 ")).toBe(1250.5);
    expect(parseInput("٦٢٠٠٠")).toBe(62000);
    expect(parseInput("٠٫٥")).toBe(0.5);
    expect(parseInput("0.0001")).toBe(0.0001);
  });
  it("rejects empty, zero, negative, text and exponent forms", () => {
    for (const bad of ["", " ", "0", "-5", "abc", "1e3", "1.2.3", "Infinity", "NaN", "--1", "5%"]) expect(parseInput(bad)).toBeNull();
  });
});

describe("Risk-Based mode", () => {
  it("1000 balance, 1% risk, entry 100, stop 95", () => {
    const v = ok(calcRiskBased({ balance: 1000, riskPct: 1, entry: 100, stop: 95, tp: null }));
    expect(v.maxLoss).toBeCloseTo(10, 10);
    expect(v.quantity).toBeCloseTo(2, 10);
    expect(v.positionUsdt).toBeCloseTo(200, 10);
    expect(v.stopDistancePct).toBeCloseTo(5, 10);
    expect(v.lossPctOfBalance).toBeCloseTo(1, 10);
    expect(v.exceedsBalance).toBe(false);
    expect(v.profit).toBeNull();
    expect(v.rr).toBeNull();
  });
  it("TP3 gives profit and risk/reward", () => {
    const v = ok(calcRiskBased({ balance: 1000, riskPct: 1, entry: 100, stop: 95, tp: 115 }));
    expect(v.profit).toBeCloseTo(30, 10);
    expect(v.rr).toBeCloseTo(3, 10);
    expect(v.profitPctOfBalance).toBeCloseTo(3, 10);
  });
  it("tight stop that needs more than the balance is flagged, not hidden", () => {
    const v = ok(calcRiskBased({ balance: 1000, riskPct: 2, entry: 100, stop: 99.9, tp: null }));
    expect(v.positionUsdt).toBeCloseTo(20000, 6);
    expect(v.exceedsBalance).toBe(true);
  });
  it("loss at the stop always equals the planned loss", () => {
    for (const [b, r, e, s] of [[500, 0.5, 0.0123, 0.0111], [25000, 2, 62000, 60500], [10, 1.5, 3.2, 2.9]]) {
      const v = ok(calcRiskBased({ balance: b, riskPct: r, entry: e, stop: s, tp: null }));
      expect(v.quantity * (e - s)).toBeCloseTo(b * (r / 100), 9);
    }
  });
  it("rejects a stop at/above entry (spot LONG only)", () => {
    expect(calcRiskBased({ balance: 1000, riskPct: 1, entry: 100, stop: 100, tp: null })).toEqual({ ok: false, error: "stopNotBelowEntry" });
    expect(calcRiskBased({ balance: 1000, riskPct: 1, entry: 100, stop: 105, tp: null })).toEqual({ ok: false, error: "stopNotBelowEntry" });
  });
  it("rejects a target at/below entry and risk above 100%", () => {
    expect(calcRiskBased({ balance: 1000, riskPct: 1, entry: 100, stop: 95, tp: 100 })).toEqual({ ok: false, error: "targetNotAboveEntry" });
    expect(calcRiskBased({ balance: 1000, riskPct: 1, entry: 100, stop: 95, tp: 90 })).toEqual({ ok: false, error: "targetNotAboveEntry" });
    expect(calcRiskBased({ balance: 1000, riskPct: 101, entry: 100, stop: 95, tp: null })).toEqual({ ok: false, error: "riskTooHigh" });
  });
});

describe("Position-Based mode", () => {
  it("1000 balance, 400 invested, entry 100, stop 95", () => {
    const r = calcPositionBased({ balance: 1000, investment: 400, entry: 100, stop: 95, tp: null });
    if (!r.ok) throw new Error(r.error);
    const v = r.value;
    expect(v.quantity).toBeCloseTo(4, 10);
    expect(v.positionUsdt).toBeCloseTo(400, 10);
    expect(v.maxLoss).toBeCloseTo(20, 10);
    expect(v.lossPctOfPosition).toBeCloseTo(5, 10);
    expect(v.lossPctOfBalance).toBeCloseTo(2, 10);
    expect(v.exceedsBalance).toBe(false);
  });
  it("TP3 profit and R:R", () => {
    const r = calcPositionBased({ balance: 1000, investment: 400, entry: 100, stop: 95, tp: 120 });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.profit).toBeCloseTo(80, 10);
    expect(r.value.rr).toBeCloseTo(4, 10);
  });
  it("can invest the full balance but not more", () => {
    expect(calcPositionBased({ balance: 1000, investment: 1000, entry: 100, stop: 90, tp: null }).ok).toBe(true);
    expect(calcPositionBased({ balance: 1000, investment: 1000.01, entry: 100, stop: 90, tp: null })).toEqual({ ok: false, error: "investmentTooHigh" });
  });
  it("rejects invalid spot-long levels", () => {
    expect(calcPositionBased({ balance: 1000, investment: 400, entry: 100, stop: 101, tp: null })).toEqual({ ok: false, error: "stopNotBelowEntry" });
    expect(calcPositionBased({ balance: 1000, investment: 400, entry: 100, stop: 95, tp: 99 })).toEqual({ ok: false, error: "targetNotAboveEntry" });
  });
  it("modes agree: sizing from risk then re-entering that position gives the same loss", () => {
    const a = ok(calcRiskBased({ balance: 2000, riskPct: 1.5, entry: 250, stop: 230, tp: 300 }));
    const b = calcPositionBased({ balance: 2000, investment: a.positionUsdt, entry: 250, stop: 230, tp: 300 });
    if (!b.ok) throw new Error(b.error);
    expect(b.value.maxLoss).toBeCloseTo(a.maxLoss, 9);
    expect(b.value.rr).toBeCloseTo(a.rr!, 9);
  });
});

it("offers the four requested presets", () => expect([...RISK_PRESETS]).toEqual([0.5, 1, 1.5, 2]));
