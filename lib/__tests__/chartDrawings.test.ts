import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dictionaries } from "@/lib/i18n";
import {
  addDrawing, distToRectBorder, distToSegment, hitTest, isDegenerateRect, isDegenerateTrend, MAX_DRAWINGS, nearestIndex,
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

describe("rectangle / price zone", () => {
  const rect: Geo = { id: "r", kind: "rect", x1: 100, y1: 50, x2: 300, y2: 150 };
  it("measures distance to the border from inside and outside, whichever corner was drawn first", () => {
    expect(distToRectBorder(100, 80, 100, 50, 300, 150)).toBe(0);
    expect(distToRectBorder(200, 100, 100, 50, 300, 150)).toBe(50);
    expect(distToRectBorder(90, 50, 300, 150, 100, 50)).toBe(10);
    expect(distToRectBorder(103, 45, 100, 50, 300, 150)).toBe(5);
  });
  it("selects on the border and on the filled interior, but not outside", () => {
    expect(hitTest([rect], 200, 52)).toBe("r");
    expect(hitTest([rect], 200, 100)).toBe("r");
    expect(hitTest([rect], 200, 400)).toBeNull();
    expect(hitTest([rect], 50, 100)).toBeNull();
  });
  it("keeps a line that crosses a zone selectable, and the zone selectable around it", () => {
    const geos: Geo[] = [{ id: "h", kind: "hline", y: 100 }, rect]; // rectangle drawn after the line
    expect(hitTest(geos, 200, 102)).toBe("h");
    expect(hitTest(geos, 200, 70)).toBe("r");
  });
  it("a later rectangle wins where two zones overlap", () => {
    const a: Geo = { id: "a", kind: "rect", x1: 0, y1: 0, x2: 100, y2: 100 };
    const b: Geo = { id: "b", kind: "rect", x1: 40, y1: 40, x2: 160, y2: 160 };
    expect(hitTest([a, b], 70, 70)).toBe("b");
    expect(hitTest([a, b], 10, 10)).toBe("a");
  });
  it("ignores a flat or empty box", () => {
    expect(isDegenerateRect({ time: 1, price: 2 }, { time: 1, price: 9 })).toBe(true);
    expect(isDegenerateRect({ time: 1, price: 2 }, { time: 5, price: 2 })).toBe(true);
    expect(isDegenerateRect({ time: 1, price: 2 }, { time: 5, price: 9 })).toBe(false);
  });
  it("shares the 50-drawing cap with the other tools and deletes only the selected zone", () => {
    const r = (id: string): Drawing => ({ id, kind: "rect", a: { time: 1, price: 1 }, b: { time: 2, price: 2 } });
    let l: Drawing[] = [{ id: "h", kind: "hline", price: 1 }];
    for (let i = 0; i < MAX_DRAWINGS + 5; i++) l = addDrawing(l, r(`r${i}`));
    expect(l).toHaveLength(MAX_DRAWINGS);
    expect(l[0].id).toBe("h");
    expect(removeDrawing(l, "r3")).toHaveLength(MAX_DRAWINGS - 1);
    expect(removeDrawing(l, "r3").some((d) => d.id === "h")).toBe(true);
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
  it("the toolbar offers Rectangle, and the rectangle reuses the two-point gesture and selection/delete", () => {
    expect(panel).toContain('["rect", "chart.draw.rect"');
    expect(panel).toContain('tool === "rect" ? t("chart.draw.hintRect")');
    expect(chart).toContain('const twoPoint = tool === "trend" || tool === "rect"');
    expect(chart).toContain("isDegenerateRect(a, b)");
    expect(chart).toContain("onSelect(hitTest(prim.projectAll()");
    expect(prim).toContain("fillRect");
    expect(prim).toContain("strokeRect");
  });
  it("pauses pan/zoom only while a drawing tool is active", () => {
    expect(chart).toContain("handleScroll: !drawing, handleScale: !drawing");
    expect(chart).toContain('tool !== "cursor"');
  });
  it("EN, FR and AR have every drawing-tool string", () => {
    const keys = ["toolbar", "cursor", "hline", "trend", "rect", "delete", "hintHline", "hintTrend", "hintRect"];
    for (const l of ["en", "fr", "ar"] as const) {
      const d = (dictionaries[l].chart as unknown as { draw: Record<string, string> }).draw;
      for (const k of keys) expect(d[k]?.length).toBeGreaterThan(0);
    }
  });
});
