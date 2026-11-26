// Pure logic for the chart drawing tools. Drawings are anchored to candle time
// (UTC seconds) and price, never to screen pixels, so they stay put through
// zoom, pan, resize and timeframe changes. Nothing here is saved anywhere:
// drawings live in memory for the open chart session.
//
// ATLAS CHARTS Phase 4 (V2-0): the per-kind logic (validation, projection,
// hit-testing, handles, moving, editing, painting) now lives in one module per
// kind under lib/drawingKinds/. The functions below keep their original public
// signatures and dispatch through that registry, so callers are unchanged.

import {
  HIT_TOLERANCE_PX,
  MAGNET_TOLERANCE_PX,
  MAX_DRAWINGS,
  defOf,
  logicalToTime,
  timeToLogical,
  type Drawing,
  type DrawingDraft,
  type Geo,
  type Handle,
  type Pt,
} from "@/lib/drawingKinds";

// Public API kept compatible: types, constants and helpers moved into the registry are re-exported here.
export type { Tool, Pt, DrawingDraft, Drawing, Geo, Handle } from "@/lib/drawingKinds";
export {
  MAX_DRAWINGS,
  MAX_BRUSH_POINTS,
  MAX_TOTAL_BRUSH_POINTS,
  MAX_TEXT_LENGTH,
  HIT_TOLERANCE_PX,
  HANDLE_TOLERANCE_PX,
  HANDLE_TOLERANCE_TOUCH_PX,
  CLICK_SLOP_PX,
  MAGNET_TOLERANCE_PX,
  LINE_HANDLE_X,
  timeToLogical,
  logicalToTime,
  distToSegment,
  distToRectBorder,
  distToPolyline,
  textBox,
  decimatePoints,
  normalizeZone,
  isDegenerateRect,
  isDegenerateTrend,
} from "@/lib/drawingKinds";

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

/** Two drawings whose distance to the pointer differs by less than this are "equally close": the newer one wins. */
export const HIT_TIE_PX = 1;

/**
 * Id of the drawing closest to (x, y) within `tol` pixels, or null. When two are equally close (within
 * HIT_TIE_PX) the later, topmost one wins, so a click on exactly overlapping drawings is predictable.
 * Lines, borders, strokes and labels win first; a click inside a rectangle or zone only selects it when
 * nothing else is close, so a line drawn across a zone stays selectable.
 */
export function hitTest(geos: Geo[], x: number, y: number, tol: number = HIT_TOLERANCE_PX): string | null {
  let bestId: string | null = null;
  let bestD = Infinity;
  for (let i = geos.length - 1; i >= 0; i--) {
    const g = geos[i];
    const d = defOf(g.kind).hit(g, x, y, tol);
    if (d <= tol && d < bestD - HIT_TIE_PX) {
      bestD = d;
      bestId = g.id;
    }
  }
  if (bestId) return bestId;
  for (let i = geos.length - 1; i >= 0; i--) {
    const g = geos[i];
    if (defOf(g.kind).inside?.(g, x, y)) return g.id;
  }
  return null;
}

// ---------------------------------------------------------------- projection

/** Converts one drawing to pixel geometry with the supplied time→x and price→y mappers (null = off-screen/unknown). */
export function projectDrawing(
  d: DrawingDraft & { id?: string },
  xOf: (time: number) => number | null,
  yOf: (price: number) => number | null
): Geo | null {
  return defOf(d.kind).project(d, xOf, yOf);
}

/** Grab handles of a selected drawing (trend: 2 ends; rect: 4 corners; zone: top and bottom edge). Others move as a whole. */
export function handlesOf(g: Geo): Handle[] {
  return defOf(g.kind).handles(g);
}

/** Pixel position of a named handle, or null. */
export function handlePosition(g: Geo, name: string): { x: number; y: number } | null {
  const h = handlesOf(g).find((k) => k.name === name);
  return h ? { x: h.x, y: h.y } : null;
}

/** Structural equality of two drawings (same kind, same anchors, same content). */
export function drawingsEqual(a: Drawing, b: Drawing): boolean {
  if (a === b) return true;
  return sameValue(a, b);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (!sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
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

/** Shift a drawing by whole candles (`dLogical`) and a price amount. Returns the original if the result would be invalid. */
export function moveDrawing(d: Drawing, dLogical: number, dPrice: number, times: number[]): Drawing {
  const def = defOf(d.kind);
  const next = def.move(d, dLogical, dPrice, times);
  return def.validate(next) ? next : d;
}

/** Move one grab handle of a drawing to a new point. Returns the original for unknown handles or invalid results. */
export function editHandle(d: Drawing, handle: string, p: Pt): Drawing {
  const def = defOf(d.kind);
  const next = def.edit?.(d, handle, p) ?? null;
  return next && def.validate(next) ? next : d;
}

// ---------------------------------------------------------------- validation

/** Structural validation: finite coordinates, positive prices, bounded sizes. */
export function validateDrawing(d: DrawingDraft): boolean {
  return defOf(d.kind).validate(d);
}

export type AddResult = { ok: true; list: Drawing[] } | { ok: false; reason: "limit" | "invalid" };

/** Adds a drawing if it is valid and within the session limits; explains why not otherwise. */
export function tryAddDrawing(list: Drawing[], d: Drawing): AddResult {
  const def = defOf(d.kind);
  if (!def.validate(d)) return { ok: false, reason: "invalid" };
  if (list.length >= MAX_DRAWINGS) return { ok: false, reason: "limit" };
  if (def.exceedsLimit?.(list, d)) return { ok: false, reason: "limit" };
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
