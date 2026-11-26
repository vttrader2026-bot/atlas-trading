// Drawing Quality Fix 1: regression tests for the four bugs found in the drawing quality audit.
//   1. fractional candle positions collapsed to x=0 after a timeframe change
//   2. overlapping drawings selected the newest instead of the closest
//   3. unchanged drags created no-op undo entries
//   4. handles jumped to the pointer when grabbed away from their centre

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DrawingEngine, type EngineHost, type EngineView } from "@/lib/chartDrawingEngine";
import { HIT_TIE_PX, drawingsEqual, handlePosition, hitTest, projectDrawing, timeToLogical, type Drawing, type Geo } from "@/lib/chartDrawings";
import { logicalToX } from "@/lib/drawingKinds";

const src = (p: string) => readFileSync(join(__dirname, "..", "..", p), "utf8");

// ------------------------------------------------------------------ helpers

/** Behaves like Lightweight Charts 5.2.1: linear in the index, but 0 for any non-integer index. */
const lwc = (spacing: number, x0: number) => (i: number) => (Number.isInteger(i) ? x0 + i * spacing : 0);

const P = (time: number, price: number) => ({ time, price });
const geo = (d: Drawing): Geo => projectDrawing(d, (t) => t, (p) => p) as Geo; // identity mappers: time = x, price = y

// Engine view: candle i sits at x = 10 * i, price = 2000 - y (1px = 1 price unit), 100 hourly candles.
const TIMES = Array.from({ length: 100 }, (_, i) => 1_000_000 + i * 3600);
const view: EngineView = {
  times: () => TIMES,
  xOf: (t) => timeToLogical(TIMES, t) * 10,
  yOf: (p) => 2000 - p,
  pointAt: (x, y) => ({ logical: x / 10, price: 2000 - y }),
  candleAt: () => null,
};
type Calls = { live: Drawing[][]; commit: Drawing[][]; select: (string | null)[] };
function make(list: Drawing[]) {
  const calls: Calls = { live: [], commit: [], select: [] };
  const host: EngineHost = {
    onLive: (l) => calls.live.push(l),
    onCommit: (l) => calls.commit.push(l),
    onSelect: (id) => calls.select.push(id),
    onTool: () => {},
    onDraft: () => {},
    onMeasure: () => {},
    onRequestText: () => {},
    onNotice: () => {},
  };
  const engine = new DrawingEngine(view, host);
  engine.setDrawings(list);
  return { engine, calls };
}
const T = (i: number) => TIMES[i]; // time of candle i (x = 10 * i)
const lastLive = (c: Calls) => c.live[c.live.length - 1];

// -------------------------------------------------------------------- Fix 1

describe("Fix 1: fractional candle positions project to the right x (never 0)", () => {
  it("documents the root cause: the chart returns 0 for a non-integer index", () => {
    expect(lwc(10, 100)(3)).toBe(130);
    expect(lwc(10, 100)(3.5)).toBe(0); // what collapsed drawings onto the left edge
  });

  it("interpolates between the two neighbouring candles", () => {
    const c = lwc(10, 100);
    expect(logicalToX(3.5, c)).toBe(135);
    expect(logicalToX(3.25, c)).toBe(132.5);
    expect(logicalToX(3.999, c)).toBeCloseTo(139.99, 6);
  });

  it("keeps whole indexes exact and works outside the loaded range", () => {
    const c = lwc(10, 100);
    expect(logicalToX(4, c)).toBe(140);
    expect(logicalToX(0, c)).toBe(100);
    expect(logicalToX(-2.25, c)).toBe(77.5); // before the first candle
    expect(logicalToX(150.75, c)).toBe(1607.5); // past the last candle (the future)
    expect(logicalToX(-3, c)).toBe(70);
  });

  it("propagates 'chart not ready' and bad input", () => {
    expect(logicalToX(3.5, () => null)).toBeNull();
    expect(logicalToX(3, () => null)).toBeNull();
    expect(logicalToX(NaN, lwc(10, 0))).toBeNull();
    expect(logicalToX(Infinity, lwc(10, 0))).toBeNull();
  });

  // Hourly candles, then the same anchors viewed on 4h, 1D and 1M candle sets and back.
  const HOUR = 3600;
  const end = Date.UTC(2026, 10, 25, 14) / 1000;
  const series = (stepSec: number, n: number) => Array.from({ length: n }, (_, i) => end - (n - 1 - i) * stepSec).map((t) => Math.floor(t / stepSec) * stepSec);
  const monthly = Array.from({ length: 36 }, (_, i) => Date.UTC(2024, 0 + i, 1) / 1000);
  const frames: Record<string, number[]> = { "1h": series(HOUR, 500), "4h": series(4 * HOUR, 500), "1D": series(24 * HOUR, 500), "1M": monthly };
  const anchors = [end - 7 * HOUR, end - 30 * HOUR, end - 100 * HOUR, end - 300 * HOUR].map((t) => Math.floor(t / HOUR) * HOUR + 1800); // half-hour offsets: between candles on every frame

  it("anchors stay inside the pane (not 0) on every timeframe, ordered by time, and return to their exact 1h positions", () => {
    const xsOn = (name: string) => {
      const times = frames[name];
      const c = lwc(9.56, 0);
      return anchors.map((t) => logicalToX(timeToLogical(times, t), c) as number);
    };
    const first = xsOn("1h");
    for (const name of ["4h", "1D", "1M", "1h"]) {
      const xs = xsOn(name);
      for (const x of xs) {
        expect(Number.isFinite(x)).toBe(true);
        expect(x).not.toBe(0);
      }
      // older anchors sit further left, newer further right (time order is preserved)
      const sorted = [...anchors].map((t, i) => [t, xs[i]]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
      expect(sorted).toEqual([...sorted].sort((a, b) => a - b));
    }
    expect(xsOn("1h")).toEqual(first); // 1h -> 4h -> 1D -> 1M -> 1h returns exactly
  });

  it("matches the exact linear position for a time between two candles (UTC time anchoring preserved)", () => {
    const times = frames["4h"];
    const spacing = 12;
    const x0 = 50;
    const c = lwc(spacing, x0);
    const t = times[300] + 4800; // 1h20m after candle 300 -> 1/3 of the way to 301
    const expected = x0 + (300 + 4800 / (4 * HOUR)) * spacing;
    expect(logicalToX(timeToLogical(times, t), c)).toBeCloseTo(expected, 9);
  });

  it("the primitive uses the interpolating projection, not the raw chart call on a fractional index", () => {
    const prim = src("components/charts/drawingsPrimitive.ts");
    expect(prim).toContain("logicalToX(timeToLogical(this.times, time)");
    expect(prim).not.toMatch(/logicalToCoordinate\(timeToLogical\(/);
  });
});

// -------------------------------------------------------------------- Fix 2

describe("Fix 2: the closest drawing is selected, ties go to the newest", () => {
  const older: Drawing = { id: "old", kind: "hline", price: 300 };
  const newer: Drawing = { id: "new", kind: "hline", price: 306 };

  it("clicking exactly on the older of two close lines selects it (it used to pick the newer)", () => {
    expect(hitTest([geo(older), geo(newer)], 5, 300)).toBe("old");
    expect(hitTest([geo(older), geo(newer)], 5, 306)).toBe("new");
  });

  it("picks whichever is nearer", () => {
    const g = [geo(older), geo(newer)];
    expect(hitTest(g, 5, 302)).toBe("old"); // 2px vs 4px
    expect(hitTest(g, 5, 304)).toBe("new"); // 4px vs 2px
  });

  it("equally close drawings resolve to the newest, in either order of creation", () => {
    expect(hitTest([geo(older), geo(newer)], 5, 303)).toBe("new");
    expect(hitTest([geo(newer), geo(older)], 5, 303)).toBe("old"); // later in the list = on top
    expect(HIT_TIE_PX).toBe(1);
  });

  it("a point inside a label wins over a newer line a few pixels away", () => {
    const label: Drawing = { id: "label", kind: "text", at: P(100, 300), text: "Support" }; // box x 100.., y 278..300
    const line: Drawing = { id: "line", kind: "hline", price: 304 };
    const g = projectDrawing(label, (t) => t, (p) => p) as Geo;
    expect(hitTest([g, geo(line)], 120, 299)).toBe("label"); // inside the box (distance 0) beats the line 5px away
    expect(hitTest([g, geo(line)], 120, 303)).toBe("line"); // outside the box: only the line is within reach
  });

  it("still prefers an edge or line over the fill of a rectangle and keeps the fill as a fallback", () => {
    const box: Drawing = { id: "box", kind: "rect", a: P(100, 200), b: P(300, 400) };
    const line: Drawing = { id: "line", kind: "hline", price: 300 };
    const g = [geo(box), geo(line)];
    expect(hitTest(g, 200, 300)).toBe("line");
    expect(hitTest(g, 200, 250)).toBe("box"); // inside the fill, line out of range
    expect(hitTest(g, 1000, 1000)).toBeNull();
  });

  it("reaches the engine: pressing exactly on the older line selects it", () => {
    const { engine, calls } = make([
      { id: "old", kind: "hline", price: 1700 }, // y = 300
      { id: "new", kind: "hline", price: 1694 }, // y = 306
    ]);
    engine.pointerDown(500, 300);
    engine.pointerUp(500, 300);
    expect(calls.select).toEqual(["old"]);
  });
});

// -------------------------------------------------------------------- Fix 3

describe("Fix 3: unchanged drags are not history entries", () => {
  it("drawingsEqual compares content, not identity", () => {
    const a: Drawing = { id: "t", kind: "trend", a: P(1, 2), b: P(3, 4) };
    expect(drawingsEqual(a, { id: "t", kind: "trend", a: P(1, 2), b: P(3, 4) })).toBe(true);
    expect(drawingsEqual(a, { id: "t", kind: "trend", a: P(1, 2), b: P(3, 5) })).toBe(false);
    expect(drawingsEqual(a, { id: "x", kind: "trend", a: P(1, 2), b: P(3, 4) })).toBe(false);
    const b1: Drawing = { id: "b", kind: "brush", pts: [P(1, 1), P(2, 2)] };
    expect(drawingsEqual(b1, { id: "b", kind: "brush", pts: [P(1, 1), P(2, 2)] })).toBe(true);
    expect(drawingsEqual(b1, { id: "b", kind: "brush", pts: [P(1, 1), P(2, 3)] })).toBe(false);
    expect(drawingsEqual(b1, { id: "b", kind: "brush", pts: [P(1, 1)] })).toBe(false);
  });

  for (const pointer of ["mouse", "touch"] as const) {
    it(`a horizontal line dragged along itself adds no undo step (${pointer})`, () => {
      const list: Drawing[] = [{ id: "h", kind: "hline", price: 1500 }]; // y = 500
      const { engine, calls } = make(list);
      engine.pointerDown(300, 500, pointer);
      engine.pointerMove(340, 500);
      engine.pointerMove(380, 500);
      engine.pointerUp(380, 500);
      expect(calls.commit).toHaveLength(0);
      expect(lastLive(calls)).toBe(list); // the list is put back exactly as it was
      expect(engine.getDrawings()).toBe(list);
    });

    it(`a vertical line dragged along itself adds no undo step (${pointer})`, () => {
      const list: Drawing[] = [{ id: "v", kind: "vline", time: T(30) }]; // x = 300
      const { engine, calls } = make(list);
      engine.pointerDown(300, 100, pointer);
      engine.pointerMove(300, 160);
      engine.pointerMove(300, 260);
      engine.pointerUp(300, 260);
      expect(calls.commit).toHaveLength(0);
    });

    it(`a zone swiped sideways (a pan attempt) adds no undo step (${pointer})`, () => {
      const list: Drawing[] = [{ id: "z", kind: "zone", top: 1600, bottom: 1400 }]; // y 400..600
      const { engine, calls } = make(list);
      engine.pointerDown(200, 500, pointer);
      engine.pointerMove(260, 500);
      engine.pointerMove(420, 500);
      engine.pointerUp(420, 500);
      expect(calls.commit).toHaveLength(0);
    });
  }

  it("moving away and back before release is not a change either", () => {
    const list: Drawing[] = [{ id: "t", kind: "trend", a: P(T(20), 1600), b: P(T(40), 1700) }]; // (200,400)-(400,300)
    const { engine, calls } = make(list);
    engine.pointerDown(300, 350);
    engine.pointerMove(360, 390);
    engine.pointerMove(300, 350);
    engine.pointerUp(300, 350);
    expect(calls.commit).toHaveLength(0);
  });

  it("a genuine move is still exactly one undo step with the new position", () => {
    const list: Drawing[] = [{ id: "t", kind: "trend", a: P(T(20), 1600), b: P(T(40), 1700) }];
    const { engine, calls } = make(list);
    engine.pointerDown(300, 350);
    engine.pointerMove(340, 380);
    engine.pointerMove(400, 410);
    engine.pointerUp(400, 410);
    expect(calls.commit).toHaveLength(1);
    const moved = calls.commit[0][0] as Extract<Drawing, { kind: "trend" }>;
    expect(moved.a.time).toBe(T(30)); // 100px = 10 candles
    expect(moved.a.price).toBe(1540); // 60px down
    expect(list[0]).toEqual({ id: "t", kind: "trend", a: P(T(20), 1600), b: P(T(40), 1700) }); // the previous list is untouched, so undo restores it
    expect(engine.getDrawings()).toBe(calls.commit[0]);
  });

  it("a genuine horizontal move of a vertical line still commits", () => {
    const { engine, calls } = make([{ id: "v", kind: "vline", time: T(30) }]);
    engine.pointerDown(300, 100);
    engine.pointerMove(350, 100);
    engine.pointerUp(350, 100);
    expect(calls.commit).toHaveLength(1);
    expect((calls.commit[0][0] as Extract<Drawing, { kind: "vline" }>).time).toBe(T(35));
  });

  it("a handle press-and-release without moving is not a history entry", () => {
    const list: Drawing[] = [{ id: "t", kind: "trend", a: P(T(20), 1600), b: P(T(40), 1700) }];
    const { engine, calls } = make(list);
    engine.pointerDown(300, 350); // select it
    engine.pointerUp(300, 350);
    engine.pointerDown(200, 400); // grab handle A dead centre
    engine.pointerMove(200, 400);
    engine.pointerUp(200, 400);
    expect(calls.commit).toHaveLength(0);
  });

  it("source: the engine compares before committing", () => {
    const eng = src("lib/chartDrawingEngine.ts");
    expect(eng).toContain("drawingsEqual(next, orig)");
  });
});

// -------------------------------------------------------------------- Fix 4

describe("Fix 4: handles keep the pointer's grab offset", () => {
  const trend = (): Drawing[] => [{ id: "t", kind: "trend", a: P(T(20), 1600), b: P(T(40), 1700) }]; // A (200,400)  B (400,300)
  const select = (engine: DrawingEngine) => {
    engine.pointerDown(300, 350);
    engine.pointerUp(300, 350);
  };
  const a = (list: Drawing[]) => (list[0] as Extract<Drawing, { kind: "trend" }>).a;

  it("handlePosition finds a handle's pixel centre", () => {
    const g = geo({ id: "t", kind: "trend", a: P(200, 400), b: P(400, 300) });
    expect(handlePosition(g, "a")).toEqual({ x: 200, y: 400 });
    expect(handlePosition(g, "b")).toEqual({ x: 400, y: 300 });
    expect(handlePosition(g, "nope")).toBeNull();
  });

  it("mouse: grabbing 8px off-centre then moving 1px moves the handle 1px (it used to jump 9px)", () => {
    const { engine, calls } = make(trend());
    select(engine);
    engine.pointerDown(208, 408); // 11.3px from handle A, within the 12px grab radius
    engine.pointerMove(209, 409);
    const live = a(lastLive(calls));
    expect(live.time).toBe(T(20)); // x offset preserved: 201 - 8 = 193+... stays on candle 20
    expect(live.price).toBe(1599); // 1px = 1 price unit; before the fix this was 1591
    engine.pointerUp(209, 409);
    expect(calls.commit).toHaveLength(1);
    expect(a(calls.commit[0]).price).toBe(1599);
  });

  it("mouse: the handle follows the pointer by a constant offset throughout the drag", () => {
    const { engine, calls } = make(trend());
    select(engine);
    engine.pointerDown(206, 395); // 6px right, 5px above the handle
    engine.pointerMove(256, 445);
    engine.pointerMove(306, 495);
    const live = a(lastLive(calls));
    expect(live.time).toBe(T(30)); // handle x = 300 -> candle 30
    expect(live.price).toBe(1500 + 0); // handle y = 495 - (-5) = 500 -> price 1500
    engine.pointerUp(306, 495);
    expect(a(calls.commit[0])).toEqual(P(T(30), 1500));
  });

  it("touch: a grab 19px from the handle (inside the 20px touch radius) does not jump", () => {
    const { engine, calls } = make(trend());
    select(engine);
    engine.pointerDown(181, 400, "touch"); // 19px left of handle A
    engine.pointerMove(181, 440);
    const live = a(lastLive(calls));
    expect(live.time).toBe(T(20)); // before the fix the handle jumped 19px left: candle 18
    expect(live.price).toBe(1560); // handle y 440
    engine.pointerUp(181, 440);
    expect(a(calls.commit[0])).toEqual(P(T(20), 1560));
  });

  it("a rectangle corner handle keeps its offset on both axes", () => {
    const { engine, calls } = make([{ id: "r", kind: "rect", a: P(T(20), 1600), b: P(T(40), 1800) }]); // a (200,400) b (400,200)
    engine.pointerDown(300, 200); // on the top border: select
    engine.pointerUp(300, 200);
    engine.pointerDown(406, 207); // 6px right, 7px below corner b
    engine.pointerMove(436, 227);
    const r = lastLive(calls)[0] as Extract<Drawing, { kind: "rect" }>;
    expect(r.b.time).toBe(T(43)); // corner x = 430
    expect(r.b.price).toBe(1800 - 20); // corner y = 220
  });

  it("a zone edge handle keeps its vertical offset", () => {
    const { engine, calls } = make([{ id: "z", kind: "zone", top: 1600, bottom: 1400 }]); // top y 400, bottom y 600
    engine.pointerDown(300, 500); // inside: select
    engine.pointerUp(300, 500);
    engine.pointerDown(24, 406); // 6px below the top handle
    engine.pointerMove(24, 416);
    const z = lastLive(calls)[0] as Extract<Drawing, { kind: "zone" }>;
    expect(z.top).toBe(1590); // 10px moved, not 16
    expect(z.bottom).toBe(1400);
  });

  it("source: the engine stores and applies the grab offset", () => {
    const eng = src("lib/chartDrawingEngine.ts");
    expect(eng).toContain("offX");
    expect(eng).toContain("this.pointFrom(x - drag.offX, y - drag.offY)");
  });
});
