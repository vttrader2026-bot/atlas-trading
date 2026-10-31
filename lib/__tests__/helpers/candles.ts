import type { Candle } from "@/lib/marketDataTypes";

export const HOUR = 3_600_000;

/**
 * Deterministic candles from waypoints: `[targetPrice, candleCount]` segments
 * are interpolated linearly. open = midpoint of previous/current close so the
 * turning candles are strict swing extremes.
 */
export function build(start: number, segs: [number, number][], opts: { wick?: number; volume?: (i: number, n: number) => number } = {}): Candle[] {
  const wick = opts.wick ?? 0.5;
  const closes: number[] = [];
  let prev = start;
  for (const [target, n] of segs) {
    for (let k = 1; k <= n; k++) closes.push(prev + ((target - prev) * k) / n);
    prev = target;
  }
  let pc = start;
  return closes.map((close, i) => {
    const open = (pc + close) / 2;
    pc = close;
    return {
      openTime: i * HOUR,
      closeTime: i * HOUR + HOUR - 1,
      open,
      high: Math.max(open, close) + wick,
      low: Math.min(open, close) - wick,
      close,
      volume: opts.volume ? opts.volume(i, closes.length) : 100,
      quoteVolume: 1,
      status: "closed" as const,
    };
  });
}

