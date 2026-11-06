// TRADEPLAN-FIXES-v1: size mode, timeframe dropdown, strategy-aware take profits. Existing maths is unchanged.
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { computePlan, type PlanInputs } from "@/lib/planCalc";
import { planToTrade } from "@/lib/planBridge";
import { TIMEFRAMES, emptyDraft, missingTargets, normalizeDraft, normalizeTimeframe, requiredTargets, type TradePlanDraft } from "@/lib/tradePlan";
import { dictionaries } from "@/lib/i18n";

const inp = (o: Partial<PlanInputs> = {}): PlanInputs => ({ balance: "1000", riskPct: "1", entry: "100", invalidation: "95", tp1: "110", tp2: "120", tp3: "130", ...o });
const val = (i: PlanInputs) => {
  const r = computePlan(i);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};
const entered = (o: Partial<TradePlanDraft> = {}): TradePlanDraft => ({ ...emptyDraft, pair: "SOL/USDT", entry: "100", invalidation: "95", tp1: "110", tp2: "120", tp3: "130", status: "entered", enteredAt: "2026-11-06", balance: "1000", riskPct: "1", ...o });
const plan = (d: TradePlanDraft) => planToTrade(d, { id: "t1", today: "2026-11-06", now: 1 });

describe("1. position size: risk % (unchanged), fixed USDT, % of balance", () => {
  it("no size mode = the original risk-based result, exactly", () => {
    const a = val(inp());
    expect(val(inp({ sizeMode: "risk" }))).toEqual(a);
    expect([a.quantity, a.positionUsdt, a.maxLoss, a.plannedLoss]).toEqual([2, 200, 10, 10]);
  });
  it("Fixed USDT: quantity = USDT / entry, loss at the stop follows", () => {
    const v = val(inp({ sizeMode: "usdt", sizeValue: "500" }));
    expect(v.positionUsdt).toBeCloseTo(500, 10);
    expect(v.quantity).toBeCloseTo(5, 10);
    expect(v.maxLoss).toBeCloseTo(25, 10); // 5 x (100 - 95)
    expect(v.plannedLoss).toBeCloseTo(25, 10);
    expect(v.lossPctOfBalance).toBeCloseTo(2.5, 10);
    expect(v.capped).toBe(false);
    expect(v.targets.map((t) => t.profit)).toEqual([50, 100, 150]);
  });
  it("% of account balance: position = balance x %, quantity automatic", () => {
    const v = val(inp({ sizeMode: "balancePct", sizeValue: "25", balance: "2000" }));
    expect(v.positionUsdt).toBeCloseTo(500, 10);
    expect(v.quantity).toBeCloseTo(5, 10);
    expect(v.maxLoss).toBeCloseTo(25, 10);
    expect(val(inp({ sizeMode: "balancePct", sizeValue: "100" })).positionUsdt).toBeCloseTo(1000, 10);
  });
  it("spot: more than the balance is refused (same rule as the Risk Calculator); bad or missing values are incomplete", () => {
    expect(computePlan(inp({ sizeMode: "usdt", sizeValue: "1500" }))).toEqual({ ok: false, error: "investmentTooHigh" });
    expect(computePlan(inp({ sizeMode: "balancePct", sizeValue: "101" }))).toEqual({ ok: false, error: "investmentTooHigh" });
    for (const v of ["", "abc", "0", "-5"]) expect(computePlan(inp({ sizeMode: "usdt", sizeValue: v }))).toEqual({ ok: false, error: "incomplete" });
    expect(computePlan(inp({ sizeMode: "usdt", sizeValue: "500", invalidation: "105" }))).toEqual({ ok: false, error: "stopNotBelowEntry" });
  });
  it("the risk % is ignored in the fixed modes, and the USDT value is ignored in risk mode", () => {
    expect(val(inp({ sizeMode: "usdt", sizeValue: "500", riskPct: "" })).quantity).toBeCloseTo(5, 10);
    expect(val(inp({ sizeMode: "risk", sizeValue: "999" })).quantity).toBeCloseTo(2, 10);
  });
  it("the Journal trade gets the right quantity and invested amount, sized from the actual fill when it differs", () => {
    const r = plan(entered({ sizeMode: "usdt", sizeValue: "500" }));
    if (!r.ok) throw new Error(r.error);
    expect(r.trade).toMatchObject({ size: 5, invested: 500, entry: 100, stop: 95 });
    const r2 = plan(entered({ sizeMode: "usdt", sizeValue: "500", actualEntry: "125", tp1: "130", tp2: "140", tp3: "150" }));
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.trade.size).toBeCloseTo(4, 10);
    expect(r2.trade.invested).toBeCloseTo(500, 10);
    const old = plan(entered());
    if (!old.ok) throw new Error(old.error);
    expect(old.trade).toMatchObject({ size: 2, invested: 200 });
  });
  it("saved plans without the new fields still load as risk %; the new fields survive a save/load round trip; junk is dropped", () => {
    expect(normalizeDraft({ pair: "BTC", balance: "500" }).sizeMode).toBeUndefined();
    expect(normalizeDraft({ pair: "BTC", sizeMode: "usdt", sizeValue: "300" })).toMatchObject({ sizeMode: "usdt", sizeValue: "300" });
    expect(normalizeDraft({ pair: "BTC", sizeMode: "all-in", sizeValue: 5 }).sizeMode).toBeUndefined();
  });
});

describe("2. timeframe dropdown", () => {
  it("offers exactly 15M, 30M, 1H, 4H, 1D, 1W, 1M", () => {
    expect([...TIMEFRAMES]).toEqual(["15M", "30M", "1H", "4H", "1D", "1W", "1M"]);
  });
  it("old free-text values map onto the list; unknown values are kept, never lost", () => {
    expect(normalizeTimeframe("4h")).toBe("4H");
    expect(normalizeTimeframe(" 15m ")).toBe("15M");
    expect(normalizeTimeframe("1D")).toBe("1D");
    expect(normalizeTimeframe("1M")).toBe("1M");
    expect(normalizeTimeframe("1m")).toBeNull(); // could have meant one minute: not offered, so not guessed
    expect(normalizeTimeframe("2H")).toBeNull();
    expect(normalizeDraft({ pair: "BTC", timeframe: "4h" }).timeframe).toBe("4H");
    expect(normalizeDraft({ pair: "BTC", timeframe: "2H" }).timeframe).toBe("2H");
    expect(normalizeDraft({ pair: "BTC", timeframe: "1m" }).timeframe).toBe("1m");
  });
  it("the page uses a <select> with those options instead of a text input", () => {
    const page = readFileSync(join(__dirname, "..", "..", "app/trade-plan/page.tsx"), "utf8");
    expect(page).toContain('id="tp-timeframe"');
    expect(page).toMatch(/<select id="tp-timeframe"/);
    expect(page).toContain("TIMEFRAMES.map");
    expect(page).not.toMatch(/Field label=\{t\("tradePlan\.timeframe"\)\}/);
  });
});

describe("3. take profits follow the exit strategy", () => {
  it("Split requires TP1, TP2 and TP3; TP3 Only requires TP3 only", () => {
    expect(requiredTargets("split")).toEqual(["tp1", "tp2", "tp3"]);
    expect(requiredTargets(undefined)).toEqual(["tp1", "tp2", "tp3"]);
    expect(requiredTargets("tp3")).toEqual(["tp3"]);
    expect(missingTargets({ tp1: "", tp2: "", tp3: "", exitStrategy: "split" })).toEqual(["tp1", "tp2", "tp3"]);
    expect(missingTargets({ tp1: "110", tp2: "", tp3: "130", exitStrategy: "split" })).toEqual(["tp2"]);
    expect(missingTargets({ tp1: "", tp2: "", tp3: "130", exitStrategy: "tp3" })).toEqual([]);
    expect(missingTargets({ tp1: "110", tp2: "120", tp3: "  ", exitStrategy: "tp3" })).toEqual(["tp3"]);
  });
  it("Send to Journal is refused until the required targets are filled and valid", () => {
    expect(plan(entered({ tp2: "" }))).toEqual({ ok: false, error: "targets" });
    expect(plan(entered({ exitStrategy: "split", tp1: "" }))).toEqual({ ok: false, error: "targets" });
    expect(plan(entered({ tp3: "90" }))).toEqual({ ok: false, error: "targets" }); // not above the entry
    expect(plan(entered({ exitStrategy: "tp3", tp1: "", tp2: "", tp3: "" }))).toEqual({ ok: false, error: "targets" });
    expect(plan(entered()).ok).toBe(true);
  });
  it("TP3 Only: TP1 and TP2 are not needed and never reach the Journal, even if something is left in them", () => {
    const r = plan(entered({ exitStrategy: "tp3", tp1: "105", tp2: "115" }));
    if (!r.ok) throw new Error(r.error);
    expect(r.trade).toMatchObject({ exitStrategy: "tp3", tp1: null, tp2: null, tp3: 130, target: 130 });
    const r2 = plan(entered({ exitStrategy: "tp3", tp1: "", tp2: "" }));
    expect(r2.ok).toBe(true);
  });
  it("Split keeps TP1/TP2/TP3 and the Journal target exactly as before", () => {
    const r = plan(entered());
    if (!r.ok) throw new Error(r.error);
    expect(r.trade).toMatchObject({ exitStrategy: "split", tp1: 110, tp2: 120, tp3: 130, target: 110 });
  });
  it("the plan maths: TP3 Only shows TP3 alone (no TP1/TP2 rows, no 30/40/30 blend); Split is unchanged", () => {
    const only = val(inp({ strategy: "tp3", tp1: "105", tp2: "115" }));
    expect(only.targets.map((t) => t.key)).toEqual(["TP3"]);
    expect(only.blended).toBeNull();
    expect(only.targetIssues).toEqual([]);
    const split = val(inp({ strategy: "split" }));
    expect(split.targets.map((t) => t.key)).toEqual(["TP1", "TP2", "TP3"]);
    expect(split.blended?.profit).toBeCloseTo(40, 10);
    expect(val(inp())).toEqual(split);
  });
  it("the page hides TP1 and TP2 for TP3 Only, marks the required fields, and the strategy picker sits above them", () => {
    const page = readFileSync(join(__dirname, "..", "..", "app/trade-plan/page.tsx"), "utf8");
    expect(page).toMatch(/strategy === "split" && \(\s*<>[\s\S]*label="TP1 \*"[\s\S]*label="TP2 \*"[\s\S]*<\/>\s*\)\}/);
    expect(page).toContain('label="TP3 *"');
    expect(page.indexOf("<ExitStrategyPicker")).toBeLessThan(page.indexOf('label="TP1 *"'));
    expect(page.match(/<ExitStrategyPicker/g)).toHaveLength(1);
  });
});

describe("translations for the new texts", () => {
  const keys = ["timeframeSelect", "sizeMode", "sizeModeRisk", "sizeModeUsdt", "sizeModePct", "sizeUsdt", "sizePct", "tpRequired"];
  for (const l of ["en", "ar", "fr"] as const) {
    it(l, () => {
      const d = dictionaries[l].tradePlan as unknown as Record<string, string>;
      for (const k of keys) expect(typeof d[k] === "string" && d[k].trim().length > 0, `${l}.${k}`).toBe(true);
    });
  }
});
