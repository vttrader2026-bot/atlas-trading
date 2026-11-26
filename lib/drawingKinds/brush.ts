import { MAX_BRUSH_POINTS, MAX_TOTAL_BRUSH_POINTS, type Drawing, type DrawingDraft, type KindDef, type Pt } from "./types";
import { decimatePoints, distToPolyline, finitePt, shiftPt } from "./geometry";

/** Total brush points across a drawing list. */
export function brushPoints(list: Drawing[]): number {
  let n = 0;
  for (const d of list) if (d.kind === "brush") n += d.pts.length;
  return n;
}

/** The brush drawing for a collected stroke (long strokes are evenly thinned). */
export function brushDraft(pts: Pt[]): Extract<DrawingDraft, { kind: "brush" }> {
  return { kind: "brush", pts: decimatePoints(pts, MAX_BRUSH_POINTS) };
}

/** Freehand brush stroke. Moves as a whole; its two ends are shown as markers. */
export const brush: KindDef<"brush"> = {
  kind: "brush",
  gesture: "freehand",
  validate: (d) => d.pts.length >= 2 && d.pts.length <= MAX_BRUSH_POINTS && d.pts.every(finitePt),
  project(d, xOf, yOf) {
    const pts: [number, number][] = [];
    for (const p of d.pts) {
      const x = xOf(p.time), y = yOf(p.price);
      if (x !== null && y !== null) pts.push([x, y]);
    }
    return pts.length < 2 ? null : { id: d.id ?? "", kind: "brush", pts };
  },
  hit: (g, x, y, tol) => distToPolyline(x, y, g.pts, tol),
  handles: () => [],
  markers(g) {
    const first = g.pts[0], last = g.pts[g.pts.length - 1];
    return [
      { name: "start", x: first[0], y: first[1] },
      { name: "end", x: last[0], y: last[1] },
    ];
  },
  move: (d, dLogical, dPrice, times) => ({ ...d, pts: d.pts.map((p) => shiftPt(times, p, dLogical, dPrice)) }),
  exceedsLimit: (list, d) => brushPoints(list) + d.pts.length > MAX_TOTAL_BRUSH_POINTS,
  paint(ctx, g) {
    ctx.beginPath();
    g.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  },
};
