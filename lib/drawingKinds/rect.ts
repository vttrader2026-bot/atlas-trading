import type { KindDef, Pt } from "./types";
import { distToRectBorder, finitePt, shiftPt } from "./geometry";

/** A rectangle needs a different time AND a different price; a flat or empty box is ignored. */
export function isDegenerateRect(a: Pt, b: Pt): boolean {
  return a.time === b.time || a.price === b.price;
}

/** Rectangle: a time/price box with a translucent fill and four corner handles. */
export const rect: KindDef<"rect"> = {
  kind: "rect",
  gesture: "two-point",
  validate: (d) => finitePt(d.a) && finitePt(d.b),
  project(d, xOf, yOf) {
    const x1 = xOf(d.a.time), y1 = yOf(d.a.price), x2 = xOf(d.b.time), y2 = yOf(d.b.price);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
    return { id: d.id ?? "", kind: "rect", x1, y1, x2, y2 };
  },
  hit: (g, x, y) => distToRectBorder(x, y, g.x1, g.y1, g.x2, g.y2),
  inside: (g, x, y) => x >= Math.min(g.x1, g.x2) && x <= Math.max(g.x1, g.x2) && y >= Math.min(g.y1, g.y2) && y <= Math.max(g.y1, g.y2),
  handles: (g) => [
    { name: "a", x: g.x1, y: g.y1 },
    { name: "c", x: g.x2, y: g.y1 },
    { name: "d", x: g.x1, y: g.y2 },
    { name: "b", x: g.x2, y: g.y2 },
  ],
  move: (d, dLogical, dPrice, times) => ({ ...d, a: shiftPt(times, d.a, dLogical, dPrice), b: shiftPt(times, d.b, dLogical, dPrice) }),
  edit(d, handle, p) {
    if (handle === "a") return { ...d, a: p };
    if (handle === "b") return { ...d, b: p };
    if (handle === "c") return { ...d, a: { ...d.a, price: p.price }, b: { ...d.b, time: p.time } }; // (b.time, a.price) corner
    if (handle === "d") return { ...d, a: { ...d.a, time: p.time }, b: { ...d.b, price: p.price } }; // (a.time, b.price) corner
    return null;
  },
  isDegenerate: (d) => isDegenerateRect(d.a, d.b),
  fromAnchors: (a, b) => ({ kind: "rect", a, b }),
  draftAnchor: (d) => d.a,
  paint(ctx, g, o) {
    ctx.globalAlpha = o.selected ? 0.22 : 0.14;
    ctx.fillRect(g.x1, g.y1, g.x2 - g.x1, g.y2 - g.y1);
    ctx.globalAlpha = 1;
    ctx.strokeRect(g.x1, g.y1, g.x2 - g.x1, g.y2 - g.y1);
  },
};
