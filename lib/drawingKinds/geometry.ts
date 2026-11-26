// Pure geometry and time helpers shared by the drawing kinds.
// (Moved verbatim from lib/chartDrawings.ts; that module re-exports them.)

import type { Pt } from "./types";

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

/** Inverse of timeToLogical: the time at a fractional candle position (extended past both ends by the average spacing). */
export function logicalToTime(times: number[], logical: number): number {
  const n = times.length;
  if (n === 0 || !Number.isFinite(logical)) return 0;
  if (n === 1) return times[0];
  const first = times[0];
  const last = times[n - 1];
  const step = (last - first) / (n - 1) || 1;
  if (logical <= 0) return first + logical * step;
  if (logical >= n - 1) return last + (logical - (n - 1)) * step;
  const lo = Math.floor(logical);
  const frac = logical - lo;
  return times[lo] + frac * (times[lo + 1] - times[lo]);
}

/**
 * Pixel x of a (possibly fractional) candle position.
 *
 * Lightweight Charts' `timeScale().logicalToCoordinate()` only understands whole
 * candle indexes: for a fractional position it returns 0, which collapsed every
 * drawing whose time falls between two candles (the normal case after switching
 * timeframe) onto the left edge of the chart. Candle x positions are linear in
 * the index, so a fractional position is the exact interpolation between its two
 * neighbouring whole candles. `coordOfIndex` must accept whole numbers only.
 */
export function logicalToX(logical: number, coordOfIndex: (index: number) => number | null): number | null {
  if (!Number.isFinite(logical)) return null;
  if (Number.isInteger(logical)) return coordOfIndex(logical);
  const lo = Math.floor(logical);
  const a = coordOfIndex(lo);
  const b = coordOfIndex(lo + 1);
  if (a === null || b === null) return null;
  return a + (b - a) * (logical - lo);
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

/** Distance to the nearest segment of a polyline (bounding-box pre-check keeps long strokes cheap). */
export function distToPolyline(px: number, py: number, pts: [number, number][], limit: number): number {
  if (pts.length === 0) return Infinity;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (px < minX - limit || px > maxX + limit || py < minY - limit || py > maxY + limit) return Infinity;
  if (pts.length === 1) return Math.hypot(px - pts[0][0], py - pts[0][1]);
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const d = distToSegment(px, py, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    if (d < best) best = d;
  }
  return best;
}

/** Estimated pixel box of a text label (used for painting its background and for hit-testing). */
export function textBox(text: string): { w: number; h: number } {
  return { w: Math.max(24, text.length * 7.4 + 14), h: 22 };
}

export const validPrice = (p: number) => Number.isFinite(p) && p > 0;
export const finitePt = (p: Pt | undefined): p is Pt => !!p && Number.isFinite(p.time) && validPrice(p.price);

/** Evenly thins a point list to at most `max` points, always keeping the first and last. */
export function decimatePoints<T>(pts: T[], max: number): T[] {
  if (pts.length <= max || max < 2) return pts.length <= max ? pts : pts.slice(0, max);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(pts[Math.round((i * (pts.length - 1)) / (max - 1))]);
  return out;
}

/** Keeps a zone's `top` at or above its `bottom` after one edge is dragged past the other. */
export function normalizeZone<T extends { top: number; bottom: number }>(z: T): T {
  return z.top >= z.bottom ? z : { ...z, top: z.bottom, bottom: z.top };
}

/** Shifts a time by a whole number of candles' worth of logical distance. */
export function shiftTime(times: number[], t: number, dLogical: number): number {
  return Math.round(logicalToTime(times, timeToLogical(times, t) + dLogical));
}

export function shiftPt(times: number[], p: Pt, dLogical: number, dPrice: number): Pt {
  return { time: shiftTime(times, p.time, dLogical), price: p.price + dPrice };
}
