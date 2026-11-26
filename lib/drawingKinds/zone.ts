import { LINE_HANDLE_X, type KindDef } from "./types";
import { normalizeZone, validPrice } from "./geometry";

/** Support/resistance zone: a price band across the full chart width. */
export const zone: KindDef<"zone"> = {
  kind: "zone",
  gesture: "two-point",
  validate: (d) => validPrice(d.top) && validPrice(d.bottom) && d.top >= d.bottom,
  project(d, _xOf, yOf) {
    const y1 = yOf(d.top), y2 = yOf(d.bottom);
    return y1 === null || y2 === null ? null : { id: d.id ?? "", kind: "zone", y1, y2 };
  },
  hit: (g, _x, y) => Math.min(Math.abs(y - g.y1), Math.abs(y - g.y2)),
  inside: (g, _x, y) => y >= Math.min(g.y1, g.y2) && y <= Math.max(g.y1, g.y2),
  handles: (g) => [
    { name: "top", x: LINE_HANDLE_X, y: g.y1 },
    { name: "bottom", x: LINE_HANDLE_X, y: g.y2 },
  ],
  move: (d, _dLogical, dPrice) => ({ ...d, top: d.top + dPrice, bottom: d.bottom + dPrice }),
  edit(d, handle, p) {
    if (handle === "top") return normalizeZone({ ...d, top: p.price });
    if (handle === "bottom") return normalizeZone({ ...d, bottom: p.price });
    return null;
  },
  isDegenerate: (d) => d.top === d.bottom,
  fromAnchors: (a, b) => ({ kind: "zone", top: Math.max(a.price, b.price), bottom: Math.min(a.price, b.price) }),
  paint(ctx, g, o, env) {
    const top = Math.min(g.y1, g.y2);
    const h = Math.abs(g.y2 - g.y1);
    ctx.globalAlpha = o.selected ? 0.22 : 0.14;
    ctx.fillRect(0, top, env.width, h);
    ctx.globalAlpha = 1;
    ctx.lineWidth = o.selected ? 2 : 1;
    ctx.setLineDash(o.dashed ? [5, 4] : [6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, g.y1);
    ctx.lineTo(env.width, g.y1);
    ctx.moveTo(0, g.y2);
    ctx.lineTo(env.width, g.y2);
    ctx.stroke();
  },
};
