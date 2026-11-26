import { MAX_TEXT_LENGTH, type KindDef } from "./types";
import { finitePt, shiftPt, textBox } from "./geometry";

/** Text label anchored to a time/price; the box grows upward from the anchor. */
export const text: KindDef<"text"> = {
  kind: "text",
  gesture: "text",
  validate(d) {
    const t = d.text.trim();
    return finitePt(d.at) && t.length > 0 && t.length <= MAX_TEXT_LENGTH;
  },
  project(d, xOf, yOf) {
    const x = xOf(d.at.time), y = yOf(d.at.price);
    if (x === null || y === null) return null;
    const b = textBox(d.text);
    return { id: d.id ?? "", kind: "text", x, y, w: b.w, h: b.h, text: d.text };
  },
  hit: (g, x, y) => (x >= g.x && x <= g.x + g.w && y >= g.y - g.h && y <= g.y ? 0 : Infinity),
  handles: () => [],
  move: (d, dLogical, dPrice, times) => ({ ...d, at: shiftPt(times, d.at, dLogical, dPrice) }),
  paint(ctx, g, o, env) {
    // g.y is the label's bottom-left; the box grows upward so a click lands just above the anchor price
    const c = env.colors;
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = c.surface;
    ctx.fillRect(g.x, g.y - g.h, g.w, g.h);
    ctx.globalAlpha = 1;
    ctx.lineWidth = o.selected ? 2 : 1;
    ctx.strokeRect(g.x, g.y - g.h, g.w, g.h);
    ctx.fillStyle = c.text;
    ctx.fillText(g.text, g.x + 7, g.y - g.h / 2);
  },
};
