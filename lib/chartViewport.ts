// Zoom button math for the chart's visible range (in candle "logical" units).

export type LogicalRange = { from: number; to: number };

export const MIN_VISIBLE_BARS = 8;
export const MAX_VISIBLE_BARS = 3000;
export const ZOOM_STEP = 0.7;

/** Scales the visible range about its centre. factor < 1 zooms in, > 1 zooms out; the width stays within sane bounds. */
export function zoomRange(range: LogicalRange, factor: number): LogicalRange {
  const width = Math.max(1e-9, range.to - range.from);
  const next = Math.min(MAX_VISIBLE_BARS, Math.max(MIN_VISIBLE_BARS, width * factor));
  const mid = (range.from + range.to) / 2;
  return { from: mid - next / 2, to: mid + next / 2 };
}
