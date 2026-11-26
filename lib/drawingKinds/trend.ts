import type { KindDef, Pt } from "./types";
import { distToSegment, finitePt, shiftPt } from "./geometry";

/** A trendline needs two distinct points; two taps on the same spot are ignored. */
export function isDegenerateTrend(a: Pt, b: Pt): boolean {
  return a.time === b.time && a.price === b.price;
}

/** Trendline: a segment between two anchored points. */
export const trend: KindDef<"trend"> = {
  kind: "trend",
  gesture: "two-point",
  validate: (d) => finitePt(d.a) && finitePt(d.b),
  project(d, xOf, yOf) {
    const x1 = xOf(d.a.time), y1 = yOf(d.a.price), x2 = xOf(d.b.time), y2 = yOf(d.b.price);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
    return { id: d.id ?? "", kind: "trend", x1, y1, x2, y2 };
  },
  hit: (g, x, y) => distToSegment(x, y, g.x1, g.y1, g.x2, g.y2),
  handles: (g) => [
    { name: "a", x: g.x1, y: g.y1 },
    { name: "b", x: g.x2, y: g.y2 },
  ],
  move: (d, dLogical, dPrice, times) => ({ ...d, a: shiftPt(times, d.a, dLogical, dPrice), b: shiftPt(times, d.b, dLogical, dPrice) }),
  edit(d, handle, p) {
    if (handle === "a") return { ...d, a: p };
    if (handle === "b") return { ...d, b: p };
    return null;
  },
  isDegenerate: (d) => isDegenerateTrend(d.a, d.b),
  fromAnchors: (a, b) => ({ kind: "trend", a, b }),
  draftAnchor: (d) => d.a,
  paint(ctx, g) {
    ctx.beginPath();
    ctx.moveTo(g.x1, g.y1);
    ctx.lineTo(g.x2, g.y2);
    ctx.stroke();
  },
};
