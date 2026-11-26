import type { PaintEnv, Pt, Tool, ToolGesture } from "./types";

/** The measure tool is a tool, not a drawing kind: its readout is temporary and never enters history. */
export const measureTool: { tool: Tool; gesture: ToolGesture } = { tool: "measure", gesture: "measure" };

export type MeasureReadout = { a: Pt; b: Pt; lines: string[] };

/** Paints the measurement box, diagonal and label (moved verbatim from the series primitive). */
export function paintMeasure(
  ctx: CanvasRenderingContext2D,
  m: MeasureReadout,
  xOf: (time: number) => number | null,
  yOf: (price: number) => number | null,
  env: PaintEnv
): void {
  const c = env.colors;
  const x1 = xOf(m.a.time), y1 = yOf(m.a.price), x2 = xOf(m.b.time), y2 = yOf(m.b.price);
  if (x1 === null || y1 === null || x2 === null || y2 === null) return;
  const up = m.b.price >= m.a.price;
  const col = up ? c.bull : c.bear;
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = col;
  ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = col;
  ctx.lineWidth = 1;
  ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  // label box next to the end point, kept inside the pane
  const lines = m.lines;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
  const h = lines.length * 18 + 8;
  const bx = Math.min(Math.max(4, x2 + 8), env.width - w - 4);
  const by = Math.min(Math.max(4, up ? y2 - h - 8 : y2 + 8), env.height - h - 4);
  ctx.fillStyle = c.surface;
  ctx.globalAlpha = 0.95;
  ctx.fillRect(bx, by, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeRect(bx, by, w, h);
  ctx.fillStyle = c.text;
  lines.forEach((l, i) => ctx.fillText(l, bx + 8, by + 13 + i * 18));
}
