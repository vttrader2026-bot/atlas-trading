// Pure logic for the basic chart drawing tools (horizontal line, trendline, rectangle).
// Drawings are anchored to candle time (UTC seconds) and price, never to screen
// pixels, so they stay put through zoom, pan, resize and timeframe changes.
// Nothing here is saved anywhere: drawings live in memory for the open chart.

export type Tool = "cursor" | "hline" | "trend" | "rect";
export type Pt = { time: number; price: number };
export type DrawingDraft = { kind: "hline"; price: number } | { kind: "trend"; a: Pt; b: Pt } | { kind: "rect"; a: Pt; b: Pt };
export type Drawing = DrawingDraft & { id: string };
export type Geo =
  | { id: string; kind: "hline"; y: number }
  | { id: string; kind: "trend" | "rect"; x1: number; y1: number; x2: number; y2: number };

export const MAX_DRAWINGS = 50;
export const HIT_TOLERANCE_PX = 10;
export const CLICK_SLOP_PX = 6;

/** Index of the candle whose time is closest to `t`. `times` is sorted ascending. */
export function nearestIndex(times: number[], t: number): number {
  if (times.length === 0) return 0;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(times[lo - 1] - t) <= Math.abs(times[lo] - t)) return lo - 1;
  return lo;
}

/**
 * Fractional candle position (chart "logical index") of a time. Exact inside the
 * loaded range (interpolated between candles); outside it, extended using the
 * average candle spacing, so a line drawn on one timeframe still lands at the
 * right moment after switching to another.
 */
export function timeToLogical(times: number[], t: number): number {
  const n = times.length;
  if (n === 0) return 0;
  if (n === 1) return 0;
  const first = times[0];
  const last = times[n - 1];
  const step = (last - first) / (n - 1) || 1;
  if (t <= first) return (t - first) / step;
  if (t >= last) return n - 1 + (t - last) / step;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  const span = times[hi] - times[lo] || 1;
  return lo + (t - times[lo]) / span;
}

/** Snap a (possibly fractional) logical index to a real candle and return its time. */
export function snapTime(times: number[], logical: number): number | null {
  if (times.length === 0 || !Number.isFinite(logical)) return null;
  const i = Math.min(times.length - 1, Math.max(0, Math.round(logical)));
  return times[i];
}

export function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Distance from (x, y) to the border of a rectangle (0 on the border; grows both inside and outside). */
export function distToRectBorder(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const l = Math.min(x1, x2), r = Math.max(x1, x2), t = Math.min(y1, y2), b = Math.max(y1, y2);
  const inside = px >= l && px <= r && py >= t && py <= b;
  if (inside) return Math.min(px - l, r - px, py - t, b - py);
  return Math.hypot(Math.max(l - px, 0, px - r), Math.max(t - py, 0, py - b));
}

function insideRect(g: Geo, x: number, y: number): boolean {
  return g.kind === "rect" && x >= Math.min(g.x1, g.x2) && x <= Math.max(g.x1, g.x2) && y >= Math.min(g.y1, g.y2) && y <= Math.max(g.y1, g.y2);
}

/**
 * Id of the topmost drawing within `tol` pixels of (x, y), or null. Later drawings sit on top.
 * Lines and rectangle borders win first; a click inside a rectangle only selects it when no line is close,
 * so a line drawn across a zone stays selectable.
 */
export function hitTest(geos: Geo[], x: number, y: number, tol: number = HIT_TOLERANCE_PX): string | null {
  for (let i = geos.length - 1; i >= 0; i--) {
    const g = geos[i];
    const d =
      g.kind === "hline" ? Math.abs(y - g.y)
      : g.kind === "rect" ? distToRectBorder(x, y, g.x1, g.y1, g.x2, g.y2)
      : distToSegment(x, y, g.x1, g.y1, g.x2, g.y2);
    if (d <= tol) return g.id;
  }
  for (let i = geos.length - 1; i >= 0; i--) if (insideRect(geos[i], x, y)) return geos[i].id;
  return null;
}

export function addDrawing(list: Drawing[], d: Drawing): Drawing[] {
  return list.length >= MAX_DRAWINGS ? list : [...list, d];
}

export function removeDrawing(list: Drawing[], id: string | null): Drawing[] {
  return id === null ? list : list.filter((d) => d.id !== id);
}

/** A rectangle needs a different time AND a different price; a flat or empty box is ignored. */
export function isDegenerateRect(a: Pt, b: Pt): boolean {
  return a.time === b.time || a.price === b.price;
}

/** A trendline needs two distinct points; two taps on the same spot are ignored. */
export function isDegenerateTrend(a: Pt, b: Pt): boolean {
  return a.time === b.time && a.price === b.price;
}
