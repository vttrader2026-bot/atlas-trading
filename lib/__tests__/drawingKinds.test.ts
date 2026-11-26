// V2-0: the drawing registry (lib/drawingKinds). One block per kind, then the registry-wide
// guarantees (every tool covered, dispatchers agree with the kinds, files wired as documented).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HIT_TOLERANCE_PX,
  KINDS,
  LINE_HANDLE_X,
  MAX_BRUSH_POINTS,
  MAX_DRAWINGS,
  MAX_TEXT_LENGTH,
  MAX_TOTAL_BRUSH_POINTS,
  TOOL_GESTURES,
  brushDraft,
  cursorTool,
  defOf,
  draftFromAnchors,
  draftFromPoint,
  gestureOf,
  isDegenerateDrawing,
  isDrawingTool,
  measureTool,
  paintMeasure,
  type Drawing,
  type DrawingKind,
  type Geo,
  type PaintEnv,
  type Tool,
} from "@/lib/drawingKinds";
import { editHandle, handlesOf, hitHandle, hitTest, moveDrawing, projectDrawing, tryAddDrawing, validateDrawing } from "@/lib/chartDrawings";

const root = join(__dirname, "..", "..");
const src = (p: string) => readFileSync(join(root, p), "utf8");

// A simple linear view: 1 second = 1px horizontally, price 100 = y 1000 (1 price = 10px, inverted).
const xOf = (t: number) => t;
const yOf = (p: number) => 2000 - p * 10;
const nullX = () => null;
const times = [0, 60, 120, 180, 240];
const P = (time: number, price: number) => ({ time, price });

const ENV: PaintEnv = { colors: { accent: "#a", text: "#t", surface: "#s", bull: "#b", bear: "#r" }, width: 800, height: 600 };

/** A canvas stand-in that records every call and property write. */
function recorder() {
  const calls: string[] = [];
  const props: Record<string, unknown> = {};
  const ctx = new Proxy(
    {},
    {
      get: (_t, k: string) => (k === "measureText" ? (s: string) => ({ width: s.length * 7 }) : (...a: unknown[]) => void calls.push(`${k}(${a.join(",")})`)),
      set: (_t, k: string, v) => {
        props[k] = v;
        calls.push(`${k}=${String(v)}`);
        return true;
      },
    }
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, props };
}

const ALL_TOOLS: Tool[] = ["cursor", "trend", "hline", "vline", "rect", "zone", "brush", "text", "measure"];
const KIND_IDS: DrawingKind[] = ["hline", "vline", "trend", "rect", "zone", "brush", "text"];

const samples: Record<DrawingKind, Drawing> = {
  hline: { id: "h", kind: "hline", price: 100 },
  vline: { id: "v", kind: "vline", time: 100 },
  trend: { id: "t", kind: "trend", a: P(50, 90), b: P(150, 110) },
  rect: { id: "r", kind: "rect", a: P(50, 90), b: P(150, 110) },
  zone: { id: "z", kind: "zone", top: 110, bottom: 90 },
  brush: { id: "b", kind: "brush", pts: [P(10, 100), P(20, 101), P(30, 99)] },
  text: { id: "x", kind: "text", at: P(100, 100), text: "Hello" },
};
const geo = (d: Drawing): Geo => projectDrawing(d, xOf, yOf) as Geo;

describe("registry shape", () => {
  it("has exactly the seven drawing kinds, each keyed by its own kind", () => {
    expect(Object.keys(KINDS).sort()).toEqual([...KIND_IDS].sort());
    for (const k of KIND_IDS) expect(KINDS[k].kind).toBe(k);
  });

  it("covers all 9 tools: seven drawing tools plus cursor and measure", () => {
    expect(Object.keys(TOOL_GESTURES).sort()).toEqual([...ALL_TOOLS].sort());
    expect(ALL_TOOLS.filter(isDrawingTool).sort()).toEqual([...KIND_IDS].sort());
    expect(isDrawingTool("cursor")).toBe(false);
    expect(isDrawingTool("measure")).toBe(false);
    expect(cursorTool).toEqual({ tool: "cursor", gesture: "none" });
    expect(measureTool).toEqual({ tool: "measure", gesture: "measure" });
  });

  it("assigns the gesture each tool had before the refactor", () => {
    expect(gestureOf("cursor")).toBe("none");
    expect(gestureOf("hline")).toBe("point");
    expect(gestureOf("vline")).toBe("point");
    expect(gestureOf("text")).toBe("text");
    expect(gestureOf("brush")).toBe("freehand");
    expect(gestureOf("trend")).toBe("two-point");
    expect(gestureOf("rect")).toBe("two-point");
    expect(gestureOf("zone")).toBe("two-point");
    expect(gestureOf("measure")).toBe("measure");
  });

  it("every kind projects, hits, moves and paints (the mandatory members exist)", () => {
    for (const k of KIND_IDS) {
      const def = defOf(k);
      for (const fn of ["validate", "project", "hit", "handles", "move", "paint"] as const) expect(typeof def[fn]).toBe("function");
      expect(def.validate(samples[k])).toBe(true);
      expect(geo(samples[k])).not.toBeNull();
    }
  });

  it("the toolbar still offers every tool", () => {
    const bar = src("components/charts/workspace/DrawingToolbar.tsx");
    for (const t of ALL_TOOLS) expect(bar).toContain(`"${t}"`);
  });
});

describe("hline", () => {
  const d = samples.hline as Extract<Drawing, { kind: "hline" }>;
  it("validates a positive finite price only", () => {
    expect(validateDrawing({ kind: "hline", price: 1 })).toBe(true);
    for (const price of [0, -1, NaN, Infinity]) expect(validateDrawing({ kind: "hline", price })).toBe(false);
  });
  it("projects to a y, or null when the price has no coordinate", () => {
    expect(geo(d)).toEqual({ id: "h", kind: "hline", y: 1000 });
    expect(projectDrawing(d, xOf, () => null)).toBeNull();
  });
  it("hits by vertical distance only", () => {
    const g = geo(d);
    expect(hitTest([g], 5, 1000 + HIT_TOLERANCE_PX)).toBe("h");
    expect(hitTest([g], 5, 1000 + HIT_TOLERANCE_PX + 1)).toBeNull();
    expect(hitTest([g], 9999, 1000)).toBe("h");
  });
  it("has no edit handles but one painted marker at the line grab point", () => {
    expect(handlesOf(geo(d))).toEqual([]);
    expect(KINDS.hline.markers?.(geo(d) as never)).toEqual([{ name: "line", x: LINE_HANDLE_X, y: 1000 }]);
  });
  it("moves by price only", () => {
    expect(moveDrawing(d, 3, 5, times)).toEqual({ ...d, price: 105 });
    expect(moveDrawing(d, 0, -200, times)).toBe(d); // would go non-positive: refused
  });
  it("is created from one point and paints a full-width line", () => {
    expect(draftFromPoint("hline", P(7, 42))).toEqual({ kind: "hline", price: 42 });
    const r = recorder();
    KINDS.hline.paint(r.ctx, geo(d) as never, { selected: false, dashed: false }, ENV);
    expect(r.calls).toEqual(["beginPath()", "moveTo(0,1000)", "lineTo(800,1000)", "stroke()"]);
  });
});

describe("vline", () => {
  const d = samples.vline as Extract<Drawing, { kind: "vline" }>;
  it("validates a finite time", () => {
    expect(validateDrawing({ kind: "vline", time: 0 })).toBe(true);
    expect(validateDrawing({ kind: "vline", time: NaN })).toBe(false);
  });
  it("projects, and is null off the time axis", () => {
    expect(geo(d)).toEqual({ id: "v", kind: "vline", x: 100 });
    expect(projectDrawing(d, nullX, yOf)).toBeNull();
  });
  it("hits by horizontal distance only", () => {
    const g = geo(d);
    expect(hitTest([g], 100 + HIT_TOLERANCE_PX, 5)).toBe("v");
    expect(hitTest([g], 100 + HIT_TOLERANCE_PX + 1, 5)).toBeNull();
  });
  it("moves by whole candles only", () => {
    expect(moveDrawing(d, 1, 999, times)).toEqual({ ...d, time: 160 }); // 100 is 1.67 candles in; +1 candle = 2.67 -> 160
    expect((moveDrawing(d, 1, 999, times) as { price?: number }).price).toBeUndefined();
  });
  it("is created from one point, has a top marker and paints full height", () => {
    expect(draftFromPoint("vline", P(7, 42))).toEqual({ kind: "vline", time: 7 });
    expect(KINDS.vline.markers?.(geo(d) as never)).toEqual([{ name: "line", x: 100, y: LINE_HANDLE_X }]);
    const r = recorder();
    KINDS.vline.paint(r.ctx, geo(d) as never, { selected: false, dashed: false }, ENV);
    expect(r.calls).toEqual(["beginPath()", "moveTo(100,0)", "lineTo(100,600)", "stroke()"]);
  });
});

describe("trend", () => {
  const d = samples.trend as Extract<Drawing, { kind: "trend" }>;
  it("validates two finite anchors with positive prices", () => {
    expect(validateDrawing({ kind: "trend", a: P(1, 1), b: P(2, 2) })).toBe(true);
    expect(validateDrawing({ kind: "trend", a: P(1, 0), b: P(2, 2) })).toBe(false);
    expect(validateDrawing({ kind: "trend", a: P(NaN, 1), b: P(2, 2) })).toBe(false);
  });
  it("projects both ends, null if either is unknown", () => {
    expect(geo(d)).toEqual({ id: "t", kind: "trend", x1: 50, y1: 1100, x2: 150, y2: 900 });
    expect(projectDrawing(d, nullX, yOf)).toBeNull();
  });
  it("hits along the segment, not beyond its ends", () => {
    const g = geo(d);
    expect(hitTest([g], 100, 1000)).toBe("t");
    expect(hitTest([g], 400, 1000)).toBeNull();
  });
  it("has two end handles and edits each one", () => {
    const g = geo(d);
    expect(handlesOf(g).map((h) => h.name)).toEqual(["a", "b"]);
    expect(hitHandle(g, 52, 1101, 12)).toBe("a");
    expect(editHandle(d, "a", P(10, 95))).toEqual({ ...d, a: P(10, 95) });
    expect(editHandle(d, "b", P(200, 120))).toEqual({ ...d, b: P(200, 120) });
    expect(editHandle(d, "zzz", P(1, 1))).toBe(d);
  });
  it("moves both anchors together", () => {
    const m = moveDrawing(d, 0, 10, times) as typeof d;
    expect(m.a.price).toBe(100);
    expect(m.b.price).toBe(120);
  });
  it("two identical points are degenerate; creation uses anchors", () => {
    expect(isDegenerateDrawing({ kind: "trend", a: P(5, 5), b: P(5, 5) })).toBe(true);
    expect(isDegenerateDrawing({ kind: "trend", a: P(5, 5), b: P(6, 5) })).toBe(false);
    expect(draftFromAnchors("trend", P(1, 1), P(2, 2))).toEqual({ kind: "trend", a: P(1, 1), b: P(2, 2) });
    expect(KINDS.trend.draftAnchor?.({ kind: "trend", a: P(1, 1), b: P(2, 2) })).toEqual(P(1, 1));
  });
  it("paints one segment", () => {
    const r = recorder();
    KINDS.trend.paint(r.ctx, geo(d) as never, { selected: false, dashed: false }, ENV);
    expect(r.calls).toEqual(["beginPath()", "moveTo(50,1100)", "lineTo(150,900)", "stroke()"]);
  });
});

describe("rect", () => {
  const d = samples.rect as Extract<Drawing, { kind: "rect" }>;
  it("validates like a two-point drawing", () => {
    expect(validateDrawing(d)).toBe(true);
    expect(validateDrawing({ kind: "rect", a: P(1, 1), b: P(2, -1) })).toBe(false);
  });
  it("projects corners", () => {
    expect(geo(d)).toEqual({ id: "r", kind: "rect", x1: 50, y1: 1100, x2: 150, y2: 900 });
  });
  it("hits the border, and the fill only as a fallback behind closer lines", () => {
    const g = geo(d);
    expect(hitTest([g], 50, 1000)).toBe("r"); // on the left border
    expect(hitTest([g], 100, 1000)).toBe("r"); // inside the fill: fallback
    const line = geo({ id: "h2", kind: "hline", price: 100 });
    expect(hitTest([g, line], 100, 1000)).toBe("h2"); // a line across the box stays selectable
    expect(hitTest([g], 600, 1000)).toBeNull();
  });
  it("has four corner handles and edits all of them", () => {
    expect(handlesOf(geo(d)).map((h) => h.name).sort()).toEqual(["a", "b", "c", "d"]);
    expect(editHandle(d, "a", P(10, 80))).toEqual({ ...d, a: P(10, 80) });
    expect(editHandle(d, "b", P(200, 120))).toEqual({ ...d, b: P(200, 120) });
    expect(editHandle(d, "c", P(200, 120))).toEqual({ ...d, a: P(50, 120), b: P(200, 110) });
    expect(editHandle(d, "d", P(10, 80))).toEqual({ ...d, a: P(10, 90), b: P(150, 80) });
    expect(editHandle(d, "nope", P(1, 1))).toBe(d);
  });
  it("is degenerate when flat in time or price", () => {
    expect(isDegenerateDrawing({ kind: "rect", a: P(1, 1), b: P(1, 5) })).toBe(true);
    expect(isDegenerateDrawing({ kind: "rect", a: P(1, 1), b: P(5, 1) })).toBe(true);
    expect(isDegenerateDrawing({ kind: "rect", a: P(1, 1), b: P(5, 5) })).toBe(false);
  });
  it("paints a translucent fill (stronger when selected) and a border", () => {
    for (const [selected, alpha] of [[false, "0.14"], [true, "0.22"]] as const) {
      const r = recorder();
      KINDS.rect.paint(r.ctx, geo(d) as never, { selected, dashed: false }, ENV);
      expect(r.calls).toEqual([`globalAlpha=${alpha}`, "fillRect(50,1100,100,-200)", "globalAlpha=1", "strokeRect(50,1100,100,-200)"]);
    }
  });
});

describe("zone", () => {
  const d = samples.zone as Extract<Drawing, { kind: "zone" }>;
  it("validates top >= bottom, both positive", () => {
    expect(validateDrawing(d)).toBe(true);
    expect(validateDrawing({ kind: "zone", top: 90, bottom: 110 })).toBe(false);
    expect(validateDrawing({ kind: "zone", top: 10, bottom: 0 })).toBe(false);
  });
  it("projects both edges; null if either is unknown", () => {
    expect(geo(d)).toEqual({ id: "z", kind: "zone", y1: 900, y2: 1100 });
    expect(projectDrawing(d, xOf, () => null)).toBeNull();
  });
  it("hits its edges and, as a fallback, its band", () => {
    const g = geo(d);
    expect(hitTest([g], 5, 900)).toBe("z");
    expect(hitTest([g], 5, 1000)).toBe("z"); // inside
    expect(hitTest([g], 5, 1300)).toBeNull();
  });
  it("has top and bottom handles; dragging one past the other swaps them", () => {
    expect(handlesOf(geo(d)).map((h) => h.name)).toEqual(["top", "bottom"]);
    expect(editHandle(d, "top", P(0, 120))).toEqual({ ...d, top: 120 });
    expect(editHandle(d, "top", P(0, 80))).toEqual({ ...d, top: 90, bottom: 80 });
    expect(editHandle(d, "bottom", P(0, 130))).toEqual({ ...d, top: 130, bottom: 110 });
  });
  it("moves by price only", () => {
    expect(moveDrawing(d, 5, 10, times)).toEqual({ ...d, top: 120, bottom: 100 });
  });
  it("is built from two anchors in either order; a flat band is degenerate", () => {
    expect(draftFromAnchors("zone", P(1, 90), P(2, 110))).toEqual({ kind: "zone", top: 110, bottom: 90 });
    expect(draftFromAnchors("zone", P(1, 110), P(2, 90))).toEqual({ kind: "zone", top: 110, bottom: 90 });
    expect(isDegenerateDrawing({ kind: "zone", top: 100, bottom: 100 })).toBe(true);
  });
  it("paints a full-width band with dashed edges (a different dash while drafting)", () => {
    const solid = recorder();
    KINDS.zone.paint(solid.ctx, geo(d) as never, { selected: false, dashed: false }, ENV);
    expect(solid.calls).toContain("fillRect(0,900,800,200)");
    expect(solid.calls).toContain("setLineDash(6,4)");
    const drafting = recorder();
    KINDS.zone.paint(drafting.ctx, geo(d) as never, { selected: false, dashed: true }, ENV);
    expect(drafting.calls).toContain("setLineDash(5,4)");
  });
});

describe("brush", () => {
  const d = samples.brush as Extract<Drawing, { kind: "brush" }>;
  it("validates between 2 and MAX_BRUSH_POINTS finite points", () => {
    expect(validateDrawing(d)).toBe(true);
    expect(validateDrawing({ kind: "brush", pts: [P(1, 1)] })).toBe(false);
    expect(validateDrawing({ kind: "brush", pts: Array.from({ length: MAX_BRUSH_POINTS + 1 }, (_, i) => P(i, 1)) })).toBe(false);
    expect(validateDrawing({ kind: "brush", pts: [P(1, 1), P(2, NaN)] })).toBe(false);
  });
  it("projects only known points and needs at least two", () => {
    expect(geo(d)).toEqual({ id: "b", kind: "brush", pts: [[10, 1000], [20, 990], [30, 1010]] });
    expect(projectDrawing(d, (t) => (t === 10 ? 10 : null), yOf)).toBeNull();
  });
  it("hits near the stroke and not far from it", () => {
    const g = geo(d);
    expect(hitTest([g], 15, 995)).toBe("b");
    expect(hitTest([g], 15, 1300)).toBeNull();
  });
  it("moves as a whole, with start/end markers and no edit handles", () => {
    expect(handlesOf(geo(d))).toEqual([]);
    expect(KINDS.brush.markers?.(geo(d) as never)).toEqual([{ name: "start", x: 10, y: 1000 }, { name: "end", x: 30, y: 1010 }]);
    const m = moveDrawing(d, 0, 5, times) as typeof d;
    expect(m.pts.map((p) => p.price)).toEqual([105, 106, 104]);
  });
  it("thins long strokes keeping both ends, and refuses past the total point budget", () => {
    const pts = Array.from({ length: 1000 }, (_, i) => P(i, 100 + (i % 7)));
    const draft = brushDraft(pts);
    expect(draft.pts.length).toBe(MAX_BRUSH_POINTS);
    expect(draft.pts[0]).toEqual(pts[0]);
    expect(draft.pts[draft.pts.length - 1]).toEqual(pts[999]);
    const full: Drawing[] = Array.from({ length: MAX_TOTAL_BRUSH_POINTS / 100 }, (_, i) => ({ id: `f${i}`, kind: "brush", pts: Array.from({ length: 100 }, (_, j) => P(j, 100)) }));
    expect(tryAddDrawing(full, { ...d, id: "over" })).toEqual({ ok: false, reason: "limit" });
    expect(tryAddDrawing(full.slice(1), { ...d, id: "ok" }).ok).toBe(true);
  });
  it("paints one polyline", () => {
    const r = recorder();
    KINDS.brush.paint(r.ctx, geo(d) as never, { selected: false, dashed: false }, ENV);
    expect(r.calls).toEqual(["beginPath()", "moveTo(10,1000)", "lineTo(20,990)", "lineTo(30,1010)", "stroke()"]);
  });
});

describe("text", () => {
  const d = samples.text as Extract<Drawing, { kind: "text" }>;
  it("validates a trimmed non-empty label of at most MAX_TEXT_LENGTH", () => {
    expect(validateDrawing(d)).toBe(true);
    expect(validateDrawing({ ...d, text: "   " })).toBe(false);
    expect(validateDrawing({ ...d, text: "x".repeat(MAX_TEXT_LENGTH) })).toBe(true);
    expect(validateDrawing({ ...d, text: "x".repeat(MAX_TEXT_LENGTH + 1) })).toBe(false);
    expect(validateDrawing({ ...d, at: P(NaN, 1) })).toBe(false);
  });
  it("projects with the label box size", () => {
    const g = geo(d) as Extract<Geo, { kind: "text" }>;
    expect(g.x).toBe(100);
    expect(g.y).toBe(1000);
    expect(g.h).toBe(22);
    expect(g.w).toBeCloseTo(Math.max(24, 5 * 7.4 + 14));
  });
  it("hits inside its box (which grows upward from the anchor)", () => {
    const g = geo(d);
    expect(hitTest([g], 110, 990)).toBe("x");
    expect(hitTest([g], 110, 1100)).toBeNull();
  });
  it("moves its anchor and has no handles", () => {
    expect(handlesOf(geo(d))).toEqual([]);
    expect(moveDrawing(d, 0, 10, times)).toEqual({ ...d, at: P(100, 110) });
  });
  it("paints a background, border and the label", () => {
    const r = recorder();
    KINDS.text.paint(r.ctx, geo(d) as never, { selected: true, dashed: false }, ENV);
    expect(r.calls.some((c) => c.startsWith("fillText(Hello,107,"))).toBe(true);
    expect(r.calls.filter((c) => c.startsWith("strokeRect")).length).toBe(1);
    expect(r.props.lineWidth).toBe(2);
  });
});

describe("cursor and measure (tools, not drawings)", () => {
  it("cursor and measure never become drawing kinds or drafts", () => {
    expect(draftFromPoint("cursor", P(1, 1))).toBeNull();
    expect(draftFromAnchors("measure", P(1, 1), P(2, 2))).toBeNull();
    expect("cursor" in KINDS).toBe(false);
    expect("measure" in KINDS).toBe(false);
  });
  it("paints the readout in the bull colour going up and the bear colour going down", () => {
    const up = recorder();
    paintMeasure(up.ctx, { a: P(10, 100), b: P(60, 110), lines: ["+10", "5 bars"] }, xOf, yOf, ENV);
    expect(up.calls).toContain("strokeStyle=#b");
    expect(up.calls.filter((c) => c.startsWith("fillText"))).toHaveLength(2);
    const down = recorder();
    paintMeasure(down.ctx, { a: P(10, 110), b: P(60, 100), lines: ["-10"] }, xOf, yOf, ENV);
    expect(down.calls).toContain("strokeStyle=#r");
  });
  it("paints nothing when a point has no coordinate", () => {
    const r = recorder();
    paintMeasure(r.ctx, { a: P(10, 100), b: P(60, 110), lines: ["x"] }, nullX, yOf, ENV);
    expect(r.calls).toEqual([]);
  });
  it("keeps the label inside the pane", () => {
    const r = recorder();
    paintMeasure(r.ctx, { a: P(10, 100), b: P(790, 195), lines: ["a very long measurement label here"] }, xOf, yOf, ENV);
    const box = r.calls.filter((c) => c.startsWith("fillRect")).pop() as string;
    const [bx, by, w, h] = box.slice("fillRect(".length, -1).split(",").map(Number);
    expect(bx).toBeGreaterThanOrEqual(4);
    expect(bx + w).toBeLessThanOrEqual(ENV.width - 4 + 1e-9);
    expect(by).toBeGreaterThanOrEqual(4);
    expect(by + h).toBeLessThanOrEqual(ENV.height - 4 + 1e-9);
  });
});

describe("registry-wide guarantees", () => {
  it("session limit still applies to every kind", () => {
    const list: Drawing[] = Array.from({ length: MAX_DRAWINGS }, (_, i) => ({ id: `h${i}`, kind: "hline", price: 1 + i }));
    for (const k of KIND_IDS) expect(tryAddDrawing(list, { ...samples[k], id: `n-${k}` })).toEqual({ ok: false, reason: "limit" });
  });
  it("invalid drawings are refused for every kind", () => {
    const bad: Drawing[] = [
      { id: "1", kind: "hline", price: -1 },
      { id: "2", kind: "vline", time: NaN },
      { id: "3", kind: "trend", a: P(1, 0), b: P(2, 2) },
      { id: "4", kind: "rect", a: P(1, 1), b: P(2, NaN) },
      { id: "5", kind: "zone", top: 1, bottom: 2 },
      { id: "6", kind: "brush", pts: [] },
      { id: "7", kind: "text", at: P(1, 1), text: "" },
    ];
    for (const b of bad) expect(tryAddDrawing([], b)).toEqual({ ok: false, reason: "invalid" });
  });
  it("moving a drawing keeps its id and kind, and returns the original when the result is invalid", () => {
    for (const k of KIND_IDS) {
      const m = moveDrawing(samples[k], 1, 1, times);
      expect(m.id).toBe(samples[k].id);
      expect(m.kind).toBe(k);
    }
    expect(moveDrawing(samples.trend, 0, -1000, times)).toBe(samples.trend);
  });
  it("engine and painter no longer switch on kinds", () => {
    const engine = src("lib/chartDrawingEngine.ts");
    expect(engine).toContain("gestureOf(");
    expect(engine).not.toMatch(/case "(hline|vline|zone|brush)":/);
    expect(engine).not.toContain("isDegenerateRect");
    const painter = src("components/charts/drawingsPrimitive.ts");
    expect(painter).toContain("defOf(g.kind).paint(");
    expect(painter).not.toMatch(/case "(hline|vline|trend|rect|zone|brush|text)":/);
    const model = src("lib/chartDrawings.ts");
    expect(model).not.toMatch(/switch \(d\.kind\)|switch \(g\.kind\)/);
  });
  it("kind modules depend only on the registry's shared files (no cycles back into chartDrawings)", () => {
    for (const f of ["hline", "vline", "trend", "rect", "zone", "brush", "text", "cursor", "measure", "geometry", "types"]) {
      expect(src(`lib/drawingKinds/${f}.ts`)).not.toMatch(/from "@\/lib\/chartDrawings"/);
    }
  });
  it("no persistence, styling or new tools were added", () => {
    expect(Object.keys(KINDS)).toHaveLength(7);
    for (const f of ["types", "index"]) expect(src(`lib/drawingKinds/${f}.ts`)).not.toMatch(/localStorage|fetch\(|style\??:/);
  });
});
