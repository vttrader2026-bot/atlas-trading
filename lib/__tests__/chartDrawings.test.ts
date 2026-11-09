import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dictionaries } from "@/lib/i18n";
import {
  addDrawing, distToSegment, hitTest, isDegenerateTrend, MAX_DRAWINGS, nearestIndex,
  removeDrawing, snapTime, timeToLogical, type Drawing, type Geo,
} from "@/lib/chartDrawings";

const times = [1000, 1060, 1120, 1180, 1240]; // 1-minute candles

describe("time anchoring", () => {
  it("finds the nearest candle", () => {
    expect(nearestIndex(times, 1000)).toBe(0);
    expect(nearestIndex(times, 1029)).toBe(0);
    expect(nearestIndex(times, 1031)).toBe(1);
    expect(nearestIndex(times, 99999)).toBe(4);
    expect(nearestIndex([], 5)).toBe(0);
  });
  it("snaps a click to a real candle time and clamps to the loaded range", () => {
    expect(snapTime(times, 1.4)).toBe(1060);
    expect(snapTime(times, 1.6)).toBe(1120);
    expect(snapTime(times, -7)).toBe(1000);
    expect(snapTime(times, 400)).toBe(1240);
    expect(snapTime([], 1)).toBeNull();
    expect(snapTime(times, NaN)).toBeNull();
  });
  it("maps time to a fractional position, exactly inside the range", () => {
    expect(timeToLogical(times, 1000)).toBe(0);
    expect(timeToLogical(times, 1090)).toBeCloseTo(1.5);
    expect(timeToLogical(times, 1240)).toBe(4);
  });
  it("extends past both ends using the candle spacing (timeframe switches)", () => {
    expect(timeToLogical(times, 940)).toBeCloseTo(-1);
    expect(timeToLogical(times, 1360)).toBeCloseTo(6);
    expect(timeToLogical([5], 99)).toBe(0);
  });
  it("round-trips: snapped time maps back to its own candle index", () => {
    times.forEach((t, i) => expect(timeToLogical(times, snapTime(times, i) as number)).toBe(i));
  });
});

describe("selection", () => {
  const geos: Geo[] = [
    { id: "h", kind: "hline", y: 100 },
    { id: "t", kind: "trend", x1: 10, y1: 10, x2: 110, y2: 60 },
  ];
  it("hits a horizontal line anywhere along its length within tolerance", () => {
    expect(hitTest(geos, 500, 104)).toBe("h");
    expect(hitTest(geos, 500, 120)).toBeNull();
  });
  it("hits a trendline near the segment but not on its extension", () => {
    expect(hitTest(geos, 60, 36)).toBe("t");
    expect(hitTest(geos, 200, 150)).toBeNull();
    expect(distToSegment(0, 0, 0, 0, 0, 0)).toBe(0);
  });
  it("prefers the drawing added last when two overlap", () => {
    const both: Geo[] = [{ id: "a", kind: "hline", y: 50 }, { id: "b", kind: "hline", y: 52 }];
    expect(hitTest(both, 5, 51)).toBe("b");
  });
});

describe("add and delete", () => {
  const h = (id: string): Drawing => ({ id, kind: "hline", price: 1 });
  it("adds, deletes only the selected one, and ignores no selection", () => {
    let l = addDrawing([], h("a"));
    l = addDrawing(l, h("b"));
    expect(removeDrawing(l, "a").map((d) => d.id)).toEqual(["b"]);
    expect(removeDrawing(l, null)).toBe(l);
    expect(l).toHaveLength(2);
  });
  it("caps the number of drawings", () => {
    let l: Drawing[] = [];
    for (let i = 0; i < MAX_DRAWINGS + 5; i++) l = addDrawing(l, h(`d${i}`));
    expect(l).toHaveLength(MAX_DRAWINGS);
  });
  it("treats two taps on the same point as no trendline", () => {
    expect(isDegenerateTrend({ time: 1, price: 2 }, { time: 1, price: 2 })).toBe(true);
    expect(isDegenerateTrend({ time: 1, price: 2 }, { time: 2, price: 2 })).toBe(false);
  });
});

describe("wiring", () => {
  const panel = readFileSync("components/charts/AnalysisPanel.tsx", "utf8");
  const chart = readFileSync("components/charts/AnalysisChart.tsx", "utf8");
  const prim = readFileSync("components/charts/drawingsPrimitive.ts", "utf8");
  it("Radar and Market Intelligence both open the shared panel; the Analyzer is untouched", () => {
    for (const f of ["app/radar/page.tsx", "app/market-intelligence/page.tsx"]) {
      expect(readFileSync(f, "utf8")).toContain("<AnalysisPanel");
    }
    expect(readFileSync("app/analyzer/page.tsx", "utf8")).not.toMatch(/chartDrawings|drawingsPrimitive/);
  });
  it("drawings live in the panel (survive chart rebuilds) and are never persisted", () => {
    expect(panel).toContain("useState<Drawing[]>");
    for (const src of [panel, chart, prim, readFileSync("lib/chartDrawings.ts", "utf8")]) {
      expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB|fetch\(\s*["'`]\/api\/(me|drawings)/);
    }
  });
  it("is a primitive on the candle series (price pane only), anchored by time and price", () => {
    expect(chart).toContain("candleSeries.attachPrimitive(prim)");
    expect(prim).toContain("logicalToCoordinate");
    expect(prim).toContain("priceToCoordinate");
  });
  it("pauses pan/zoom only while a drawing tool is active", () => {
    expect(chart).toContain("handleScroll: !drawing, handleScale: !drawing");
    expect(chart).toContain('tool !== "cursor"');
  });
  it("EN, FR and AR have every drawing-tool string", () => {
    const keys = ["toolbar", "cursor", "hline", "trend", "delete", "hintHline", "hintTrend"];
    for (const l of ["en", "fr", "ar"] as const) {
      const d = (dictionaries[l].chart as unknown as { draw: Record<string, string> }).draw;
      for (const k of keys) expect(d[k]?.length).toBeGreaterThan(0);
    }
  });
});
