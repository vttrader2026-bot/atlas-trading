import { LINE_HANDLE_X, type KindDef } from "./types";
import { validPrice } from "./geometry";

/** Horizontal line: one price, spans the full chart width. */
export const hline: KindDef<"hline"> = {
  kind: "hline",
  gesture: "point",
  validate: (d) => validPrice(d.price),
  project(d, _xOf, yOf) {
    const y = yOf(d.price);
    return y === null ? null : { id: d.id ?? "", kind: "hline", y };
  },
  hit: (g, _x, y) => Math.abs(y - g.y),
  handles: () => [],
  markers: (g) => [{ name: "line", x: LINE_HANDLE_X, y: g.y }],
  move: (d, _dLogical, dPrice) => ({ ...d, price: d.price + dPrice }),
  fromPoint: (p) => ({ kind: "hline", price: p.price }),
  paint(ctx, g, _o, env) {
    ctx.beginPath();
    ctx.moveTo(0, g.y);
    ctx.lineTo(env.width, g.y);
    ctx.stroke();
  },
};
