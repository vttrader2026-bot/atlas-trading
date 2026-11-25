// Pure logic for the chart drawing tools. Drawings are anchored to candle time
// (UTC seconds) and price, never to screen pixels, so they stay put through
// zoom, pan, resize and timeframe changes. Nothing here is saved anywhere:
// drawings live in memory for the open chart session.
//
// ATLAS CHARTS Phase 2 extends the original foundation (horizontal line,
// trendline, rectangle) with vertical line, support/resistance zone, brush
// and text; selection, moving and handle editing; and replaces the old hard
// 50-drawing cap with validation and performance limits.

export type Tool = "cursor" | "trend" | "hline" | "vline" | "rect" | "zone" | "brush" | "text" | "measure";
export type Pt = { time: number; price: number };
export type DrawingDraft =
  | { kind: "hline"; price: number }
  | { kind: "vline"; time: number }
  | { kind: "trend"; a: Pt; b: Pt }
  | { kind: "rect"; a: Pt; b: Pt }
  /** Support/resistance zone: a price band that spans the full chart width. */
  | { kind: "zone"; top: number; bottom: number }
  | { kind: "brush"; pts: Pt[] }
  | { kind: "text"; at: Pt; text: string };
export type Drawing = DrawingDraft & { id: string };
export type Geo =
  | { id: string; kind: "hline"; y: number }
  | { id: string; kind: "vline"; x: number }
  | { id: string; kind: "trend" | "rect"; x1: number; y1: number; x2: number; y2: number }
  | { id: string; kind: "zone"; y1: number; y2: number }
  | { id: string; kind: "brush"; pts: [number, number][] }
  | { id: string; kind: "text"; x: number; y: number; w: number; h: number; text: string };

// Safeguards (replace the old arbitrary 50-drawing cap).
/** Generous ceiling on drawings in one session; keeps repaint cost bounded. */
export const MAX_DRAWINGS = 500;
/** Points kept for one brush stroke (longer strokes are evenly thinned). */
export const MAX_BRUSH_POINTS = 600;
/** Total brush points across all drawings. */
export const MAX_TOTAL_BRUSH_POINTS = 20_000;
export const MAX_TEXT_LENGTH = 80;
export const HIT_TOLERANCE_PX = 10;
export const HANDLE_TOLERANCE_PX = 12;
export const HANDLE_TOLERANCE_TOUCH_PX = 20;
export const CLICK_SLOP_PX = 6;
export const MAGNET_TOLERANCE_PX = 24;
/** Left offset (px) where grab handles for full-width lines are drawn. */
export const LINE_HANDLE_X = 24;

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

/** Snap a (possibly fractional) logical index to a real candle and return its time. */
export function snapTime(times: number[], logical: number): number | null {
  if (times.length === 0 || !Number.isFinite(logical)) return null;
  const i = Math.min(times.length - 1, Math.max(0, Math.round(logical)));
  return times[i];
}

/** Time of the whole-candle position nearest `logical`. Unlike snapTime this may fall beyond the last candle (future), extended by the average spacing. */
export function snapTimeUnclamped(times: number[], logical: number): number | null {
  if (times.length === 0 || !Number.isFinite(logical)) return null;
  return Math.round(logicalToTime(times, Math.round(logical)));
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

function insideBand(g: Geo, x: number, y: number): boolean {
  if (g.kind === "rect") return x >= Math.min(g.x1, g.x2) && x <= Math.max(g.x1, g.x2) && y >= Math.min(g.y1, g.y2) && y <= Math.max(g.y1, g.y2);
  if (g.kind === "zone") return y >= Math.min(g.y1, g.y2) && y <= Math.max(g.y1, g.y2);
  return false;
}

/**
 * Id of the topmost drawing within `tol` pixels of (x, y), or null. Later drawings sit on top.
 * Lines, borders, strokes and labels win first; a click inside a rectangle or zone only selects it when
 * nothing else is close, so a line drawn across a zone stays selectable.
 */
export function hitTest(geos: Geo[], x: number, y: number, tol: number = HIT_TOLERANCE_PX): string | null {
  for (let i = geos.length - 1; i >= 0; i--) {
    const g = geos[i];
    let d: number;
    switch (g.kind) {
      case "hline":
        d = Math.abs(y - g.y);
        break;
      case "vline":
        d = Math.abs(x - g.x);
        break;
      case "rect":
        d = distToRectBorder(x, y, g.x1, g.y1, g.x2, g.y2);
        break;
      case "zone":
        d = Math.min(Math.abs(y - g.y1), Math.abs(y - g.y2));
        break;
      case "brush":
        d = distToPolyline(x, y, g.pts, tol);
        break;
      case "text":
        d = x >= g.x && x <= g.x + g.w && y >= g.y - g.h && y <= g.y ? 0 : Infinity;
        break;
      default:
        d = distToSegment(x, y, g.x1, g.y1, g.x2, g.y2);
    }
    if (d <= tol) return g.id;
  }
  for (let i = geos.length - 1; i >= 0; i--) if (insideBand(geos[i], x, y)) return geos[i].id;
  return null;
}

// ---------------------------------------------------------------- projection

/** Converts one drawing to pixel geometry with the supplied time→x and price→y mappers (null = off-screen/unknown). */
export function projectDrawing(
  d: DrawingDraft & { id?: string },
  xOf: (time: number) => number | null,
  yOf: (price: number) => number | null
): Geo | null {
  const id = d.id ?? "";
  switch (d.kind) {
    case "hline": {
      const y = yOf(d.price);
      return y === null ? null : { id, kind: "hline", y };
    }
    case "vline": {
      const x = xOf(d.time);
      return x === null ? null : { id, kind: "vline", x };
    }
    case "zone": {
      const y1 = yOf(d.top), y2 = yOf(d.bottom);
      return y1 === null || y2 === null ? null : { id, kind: "zone", y1, y2 };
    }
    case "brush": {
      const pts: [number, number][] = [];
      for (const p of d.pts) {
        const x = xOf(p.time), y = yOf(p.price);
        if (x !== null && y !== null) pts.push([x, y]);
      }
      return pts.length < 2 ? null : { id, kind: "brush", pts };
    }
    case "text": {
      const x = xOf(d.at.time), y = yOf(d.at.price);
      if (x === null || y === null) return null;
      const b = textBox(d.text);
      return { id, kind: "text", x, y, w: b.w, h: b.h, text: d.text };
    }
    default: {
      const x1 = xOf(d.a.time), y1 = yOf(d.a.price), x2 = xOf(d.b.time), y2 = yOf(d.b.price);
      if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
      return { id, kind: d.kind, x1, y1, x2, y2 };
    }
  }
}

export type Handle = { name: string; x: number; y: number };

/** Grab handles of a selected drawing (trend: 2 ends; rect: 4 corners; zone: top and bottom edge). Others move as a whole. */
export function handlesOf(g: Geo): Handle[] {
  switch (g.kind) {
    case "trend":
      return [{ name: "a", x: g.x1, y: g.y1 }, { name: "b", x: g.x2, y: g.y2 }];
    case "rect":
      return [
        { name: "a", x: g.x1, y: g.y1 },
        { name: "c", x: g.x2, y: g.y1 },
        { name: "d", x: g.x1, y: g.y2 },
        { name: "b", x: g.x2, y: g.y2 },
      ];
    case "zone":
      return [{ name: "top", x: LINE_HANDLE_X, y: g.y1 }, { name: "bottom", x: LINE_HANDLE_X, y: g.y2 }];
    default:
      return [];
  }
}

/** Nearest handle within `tol` pixels, or null. */
export function hitHandle(g: Geo, x: number, y: number, tol: number): string | null {
  let best: string | null = null;
  let bestD = tol;
  for (const h of handlesOf(g)) {
    const d = Math.hypot(x - h.x, y - h.y);
    if (d <= bestD) {
      bestD = d;
      best = h.name;
    }
  }
  return best;
}

// ------------------------------------------------------- editing and moving

const validPrice = (p: number) => Number.isFinite(p) && p > 0;

/** Shift a drawing by whole candles (`dLogical`) and a price amount. Returns the original if the result would be invalid. */
export function moveDrawing(d: Drawing, dLogical: number, dPrice: number, times: number[]): Drawing {
  const shiftTime = (t: number) => Math.round(logicalToTime(times, timeToLogical(times, t) + dLogical));
  const shiftPt = (p: Pt): Pt => ({ time: shiftTime(p.time), price: p.price + dPrice });
  let next: Drawing;
  switch (d.kind) {
    case "hline":
      next = { ...d, price: d.price + dPrice };
      break;
    case "vline":
      next = { ...d, time: shiftTime(d.time) };
      break;
    case "zone":
      next = { ...d, top: d.top + dPrice, bottom: d.bottom + dPrice };
      break;
    case "brush":
      next = { ...d, pts: d.pts.map(shiftPt) };
      break;
    case "text":
      next = { ...d, at: shiftPt(d.at) };
      break;
    default:
      next = { ...d, a: shiftPt(d.a), b: shiftPt(d.b) };
  }
  return validateDrawing(next) ? next : d;
}

/** Move one grab handle of a drawing to a new point. Returns the original for unknown handles or invalid results. */
export function editHandle(d: Drawing, handle: string, p: Pt): Drawing {
  let next: Drawing | null = null;
  if (d.kind === "trend") {
    if (handle === "a") next = { ...d, a: p };
    else if (handle === "b") next = { ...d, b: p };
  } else if (d.kind === "rect") {
    if (handle === "a") next = { ...d, a: p };
    else if (handle === "b") next = { ...d, b: p };
    else if (handle === "c") next = { ...d, a: { ...d.a, price: p.price }, b: { ...d.b, time: p.time } }; // (b.time, a.price) corner
    else if (handle === "d") next = { ...d, a: { ...d.a, time: p.time }, b: { ...d.b, price: p.price } }; // (a.time, b.price) corner
  } else if (d.kind === "zone") {
    if (handle === "top") next = normalizeZone({ ...d, top: p.price });
    else if (handle === "bottom") next = normalizeZone({ ...d, bottom: p.price });
  }
  return next && validateDrawing(next) ? next : d;
}

/** Keeps a zone's `top` at or above its `bottom` after one edge is dragged past the other. */
export function normalizeZone<T extends { top: number; bottom: number }>(z: T): T {
  return z.top >= z.bottom ? z : { ...z, top: z.bottom, bottom: z.top };
}

// ---------------------------------------------------------------- validation

/** Evenly thins a point list to at most `max` points, always keeping the first and last. */
export function decimatePoints<T>(pts: T[], max: number): T[] {
  if (pts.length <= max || max < 2) return pts.length <= max ? pts : pts.slice(0, max);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(pts[Math.round((i * (pts.length - 1)) / (max - 1))]);
  return out;
}

const finitePt = (p: Pt | undefined): p is Pt => !!p && Number.isFinite(p.time) && validPrice(p.price);

/** Structural validation: finite coordinates, positive prices, bounded sizes. */
export function validateDrawing(d: DrawingDraft): boolean {
  switch (d.kind) {
    case "hline":
      return validPrice(d.price);
    case "vline":
      return Number.isFinite(d.time);
    case "zone":
      return validPrice(d.top) && validPrice(d.bottom) && d.top >= d.bottom;
    case "brush":
      return d.pts.length >= 2 && d.pts.length <= MAX_BRUSH_POINTS && d.pts.every(finitePt);
    case "text": {
      const t = d.text.trim();
      return finitePt(d.at) && t.length > 0 && t.length <= MAX_TEXT_LENGTH;
    }
    default:
      return finitePt(d.a) && finitePt(d.b);
  }
}

export type AddResult = { ok: true; list: Drawing[] } | { ok: false; reason: "limit" | "invalid" };

function brushPoints(list: Drawing[]): number {
  let n = 0;
  for (const d of list) if (d.kind === "brush") n += d.pts.length;
  return n;
}

/** Adds a drawing if it is valid and within the session limits; explains why not otherwise. */
export function tryAddDrawing(list: Drawing[], d: Drawing): AddResult {
  if (!validateDrawing(d)) return { ok: false, reason: "invalid" };
  if (list.length >= MAX_DRAWINGS) return { ok: false, reason: "limit" };
  if (d.kind === "brush" && brushPoints(list) + d.pts.length > MAX_TOTAL_BRUSH_POINTS) return { ok: false, reason: "limit" };
  return { ok: true, list: [...list, d] };
}

export function addDrawing(list: Drawing[], d: Drawing): Drawing[] {
  const r = tryAddDrawing(list, d);
  return r.ok ? r.list : list;
}

export function removeDrawing(list: Drawing[], id: string | null): Drawing[] {
  return id === null ? list : list.filter((d) => d.id !== id);
}

export function replaceDrawing(list: Drawing[], next: Drawing): Drawing[] {
  return list.map((d) => (d.id === next.id ? next : d));
}

/** A rectangle needs a different time AND a different price; a flat or empty box is ignored. */
export function isDegenerateRect(a: Pt, b: Pt): boolean {
  return a.time === b.time || a.price === b.price;
}

/** A trendline needs two distinct points; two taps on the same spot are ignored. */
export function isDegenerateTrend(a: Pt, b: Pt): boolean {
  return a.time === b.time && a.price === b.price;
}

let idCounter = 0;
/** Unique-enough id for a drawing within a session. */
export function newDrawingId(): string {
  idCounter += 1;
  return `d${Date.now().toString(36)}${idCounter.toString(36)}`;
}

// -------------------------------------------------------------------- magnet

export type OhlcPrices = { open: number; high: number; low: number; close: number };

/**
 * Snaps `price` to the nearest of the candle's open/high/low/close if that level is
 * within `tolPx` pixels (measured on screen via `yOf`); otherwise returns `price` unchanged.
 */
export function magnetPrice(candle: OhlcPrices | null, price: number, yOf: (p: number) => number | null, tolPx: number = MAGNET_TOLERANCE_PX): number {
  if (!candle) return price;
  const y0 = yOf(price);
  if (y0 === null) return price;
  let best = price;
  let bestD = tolPx;
  for (const level of [candle.high, candle.low, candle.open, candle.close]) {
    const y = yOf(level);
    if (y === null) continue;
    const d = Math.abs(y - y0);
    if (d <= bestD) {
      bestD = d;
      best = level;
    }
  }
  return best;
}

// --------------------------------------------------------------- measurement

export type Measurement = { dPrice: number; pct: number; bars: number; seconds: number };

/** Price change, percent change, candle count and elapsed time between two points. */
export function measure(a: Pt, b: Pt, times: number[]): Measurement {
  return {
    dPrice: b.price - a.price,
    pct: a.price === 0 ? 0 : ((b.price - a.price) / a.price) * 100,
    bars: Math.round(timeToLogical(times, b.time) - timeToLogical(times, a.time)),
    seconds: b.time - a.time,
  };
}

/** "3d 4h", "2h 15m", "45m" — the two most significant units of a duration in seconds. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.abs(Math.round(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m && parts.length < 2 && !d) parts.push(`${m}m`);
  return parts.length ? parts.slice(0, 2).join(" ") : "0m";
}
