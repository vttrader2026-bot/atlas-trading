import { describe, expect, it } from "vitest";
import { checkLongPlan, classifyStructure, findSwings, findZones, volumeReport } from "@/lib/chartStructure";
import type { Candle } from "@/lib/marketDataTypes";

function mk(highs: number[], lows: number[], vols?: number[]): Candle[] {
  return highs.map((h, i) => ({
    openTime: i * 60_000,
    closeTime: i * 60_000 + 59_999,
    open: (h + lows[i]) / 2,
    high: h,
    low: lows[i],
    close: (h + lows[i]) / 2,
    volume: vols?.[i] ?? 1,
    quoteVolume: 1,
    status: "closed" as const,
  }));
}

// Zig-zag with rising peaks and troughs => bullish structure.
const bullHighs = [10, 12, 14, 12, 10, 12, 16, 18, 16, 14, 16, 20, 22, 20, 18, 20, 22];
const bullLows = bullHighs.map((h) => h - 2);

describe("findSwings", () => {
  it("finds pivots and never reports the unconfirmed tail", () => {
    const c = mk(bullHighs, bullLows);
    const swings = findSwings(c, 2);
    expect(swings.length).toBeGreaterThan(0);
    for (const s of swings) {
      expect(s.index).toBeGreaterThanOrEqual(2);
      expect(s.index).toBeLessThan(c.length - 2);
    }
  });
  it("returns nothing for too-short history", () => {
    expect(findSwings(mk([1, 2, 3], [0, 1, 2]), 3)).toEqual([]);
  });
});

describe("classifyStructure", () => {
  it("labels rising swings Bullish", () => {
    const c = mk(bullHighs, bullLows);
    const r = classifyStructure(c, findSwings(c, 2));
    expect(r.state).toBe("Bullish");
    expect(r.labelled.some((l) => l.label === "HH")).toBe(true);
  });
  it("labels falling swings Bearish", () => {
    const h = [...bullHighs].reverse();
    const c = mk(h, h.map((x) => x - 2));
    const r = classifyStructure(c, findSwings(c, 2));
    expect(r.state).toBe("Bearish");
  });
  it("is Unclear with no confirmed swings, not a guess", () => {
    const c = mk([1, 2, 3], [0, 1, 2]);
    expect(classifyStructure(c, []).state).toBe("Unclear");
  });
});

describe("findZones", () => {
  it("merges nearby swings into one zone with a touch count and splits by price", () => {
    const swings = [
      { index: 1, time: 1, price: 100, kind: "low" as const },
      { index: 5, time: 5, price: 100.3, kind: "low" as const },
      { index: 9, time: 9, price: 120, kind: "high" as const },
    ];
    const z = findZones(swings, 110);
    expect(z.support).toHaveLength(1);
    expect(z.support[0].touches).toBe(2);
    expect(z.resistance).toHaveLength(1);
    expect(z.resistance[0].mid).toBe(120);
  });
});

describe("volumeReport", () => {
  it("is unknown without enough history", () => {
    expect(volumeReport(mk([1, 2], [0, 1])).trend).toBe("unknown");
  });
  it("flags a high-volume close above the prior 20-candle high", () => {
    const n = 30;
    const highs = Array.from({ length: n }, () => 10);
    const lows = Array.from({ length: n }, () => 8);
    const vols = Array.from({ length: n }, () => 100);
    const c = mk(highs, lows, vols);
    const last = c[n - 1];
    last.close = 12;
    last.high = 12;
    last.volume = 400;
    expect(volumeReport(c).breakoutConfirmation).toBe("high-close-on-high-volume");
  });
});

describe("checkLongPlan", () => {
  it("accepts invalidation below and targets above price", () => {
    expect(checkLongPlan(100, 95, [105, 110, 120]).ok).toBe(true);
  });
  it("rejects inverted or missing numbers", () => {
    expect(checkLongPlan(100, 105, [110]).ok).toBe(false);
    expect(checkLongPlan(100, null, [110]).ok).toBe(false);
    expect(checkLongPlan(100, 95, [99]).ok).toBe(false);
    expect(checkLongPlan(100, 95, [null]).ok).toBe(false);
  });
});

import { enforceSpotPlan } from "@/lib/spotPlan";

describe("enforceSpotPlan", () => {
  const mkPlan = (direction: string, invalidation: string, targets: string[]) => ({
    tradePlan: { direction, entryZone: "99-100", invalidation, targets, riskNote: "", riskReward: "1 : 2" },
  });
  it("never lets a Short through", () => {
    const p = mkPlan("Short", "105", ["90"]) as Record<string, unknown>;
    enforceSpotPlan(p, 100);
    expect((p.tradePlan as { direction: string }).direction).toMatch(/Wait/);
    expect(p.noClearSetup).toBeTruthy();
  });
  it("downgrades an inverted Long and keeps a coherent one", () => {
    const bad = mkPlan("Long", "$105", ["$110"]) as Record<string, unknown>;
    enforceSpotPlan(bad, 100);
    expect((bad.tradePlan as { direction: string }).direction).toMatch(/Wait/);
    const good = mkPlan("Long", "$95.5", ["$105", "$110", "$120"]) as Record<string, unknown>;
    enforceSpotPlan(good, 100);
    expect((good.tradePlan as { direction: string }).direction).toBe("Long");
  });
  it("without a price only blocks shorts", () => {
    const p = mkPlan("Long", "105", ["110"]) as Record<string, unknown>;
    enforceSpotPlan(p, null);
    expect((p.tradePlan as { direction: string }).direction).toBe("Long");
  });
});
