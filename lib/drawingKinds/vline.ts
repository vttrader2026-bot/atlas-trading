import { LINE_HANDLE_X, type KindDef } from "./types";
import { shiftTime } from "./geometry";

/** Vertical line: one moment in time, spans the full chart height. */
export const vline: KindDef<"vline"> = {
  kind: "vline",
  gesture: "point",
  validate: (d) => Number.isFinite(d.time),
  project(d, xOf) {
    const x = xOf(d.time);
    return x === null ? null : { id: d.id ?? "", kind: "vline", x };
  },
  hit: (g, x) => Math.abs(x - g.x),
  handles: () => [],
  markers: (g) => [{ name: "line", x: g.x, y: LINE_HANDLE_X }],
  move: (d, dLogical, _dPrice, times) => ({ ...d, time: shiftTime(times, d.time, dLogical) }),
  fromPoint: (p) => ({ kind: "vline", time: p.time }),
  paint(ctx, g, _o, env) {
    ctx.beginPath();
    ctx.moveTo(g.x, 0);
    ctx.lineTo(g.x, env.height);
    ctx.stroke();
  },
};
