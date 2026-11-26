// Drawing registry: one module per drawing kind (hline, vline, trend, rect,
// zone, brush, text) plus tool descriptors for the two tools that are not
// drawings (cursor, measure). lib/chartDrawings.ts, the interaction engine and
// the painter dispatch through here, so adding a kind means adding one module
// and one entry below rather than editing a dozen switch statements.

import type { Drawing, DrawingDraft, DrawingKind, Geo, KindDef, Tool, ToolGesture } from "./types";
import { hline } from "./hline";
import { vline } from "./vline";
import { trend } from "./trend";
import { rect } from "./rect";
import { zone } from "./zone";
import { brush } from "./brush";
import { text } from "./text";
import { cursorTool } from "./cursor";
import { measureTool } from "./measure";

export * from "./types";
export { cursorTool } from "./cursor";
export { measureTool, paintMeasure, type MeasureReadout } from "./measure";
export { brushDraft, brushPoints } from "./brush";
export { isDegenerateRect } from "./rect";
export { isDegenerateTrend } from "./trend";
export * from "./geometry";

/** Every drawing kind, keyed by its `kind`. The compiler enforces that none is missing. */
export const KINDS: { [K in DrawingKind]: KindDef<K> } = { hline, vline, trend, rect, zone, brush, text };

/** The generic definition used for dispatch on a runtime `kind`. */
export function defOf(kind: DrawingKind): KindDef {
  return KINDS[kind] as KindDef;
}

/** Gesture of every tool; drawing tools come from their kind, cursor and measure from their descriptors. */
export const TOOL_GESTURES: Record<Tool, ToolGesture> = {
  cursor: cursorTool.gesture,
  measure: measureTool.gesture,
  hline: hline.gesture,
  vline: vline.gesture,
  trend: trend.gesture,
  rect: rect.gesture,
  zone: zone.gesture,
  brush: brush.gesture,
  text: text.gesture,
};

export function gestureOf(tool: Tool): ToolGesture {
  return TOOL_GESTURES[tool];
}

/** True when the tool creates a drawing kind (everything except cursor and measure). */
export function isDrawingTool(tool: Tool): tool is DrawingKind {
  return tool in KINDS;
}

/** Draft for a drawing tool pressed at a point (point tools only; null otherwise). */
export function draftFromPoint(tool: Tool, p: { time: number; price: number }): DrawingDraft | null {
  if (!isDrawingTool(tool)) return null;
  return defOf(tool).fromPoint?.(p) ?? null;
}

/** Draft for a two-point drawing tool from its anchors (null for other tools). Not degeneracy-checked. */
export function draftFromAnchors(tool: Tool, a: { time: number; price: number }, b: { time: number; price: number }): DrawingDraft | null {
  if (!isDrawingTool(tool)) return null;
  return defOf(tool).fromAnchors?.(a, b) ?? null;
}

/** A shape collapsed to nothing (flat rectangle, zero-length line, zero-height zone). */
export function isDegenerateDrawing(d: DrawingDraft): boolean {
  return defOf(d.kind).isDegenerate?.(d) ?? false;
}

export type { Drawing, Geo };
