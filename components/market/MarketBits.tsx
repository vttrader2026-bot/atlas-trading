"use client";

import { useState } from "react";

// Small shared building blocks for market lists (Radar, Market Intelligence,
// Home previews). Presentation only — all numbers come from the caller.

/** Percentage change with arrow + sign + colour (never colour alone). */
export function ChangePill({ value, digits = 2 }: { value: number | null; digits?: number }) {
  if (value === null || !Number.isFinite(value)) {
    return <span dir="ltr" className="chg chg-flat">—</span>;
  }
  const up = value > 0;
  const down = value < 0;
  const cls = up ? "chg-up" : down ? "chg-down" : "chg-flat";
  return (
    <span dir="ltr" className={`chg ${cls}`} style={{ unicodeBidi: "isolate" }}>
      <span aria-hidden="true" className="text-[0.7em]">
        {up ? "▲" : down ? "▼" : "–"}
      </span>
      {up ? "+" : ""}
      {value.toFixed(digits)}%
    </span>
  );
}

/** Where the last price sits between the 24h low and high (real ticker values). */
export function RangeBar({ low, high, last }: { low: number; high: number; last: number }) {
  if (!(high > low) || !Number.isFinite(last)) return <span className="text-text-muted">—</span>;
  const pos = Math.min(1, Math.max(0, (last - low) / (high - low)));
  return (
    <div className="w-20" dir="ltr" title={`${low} – ${high}`}>
      <div className="relative h-1.5 rounded-full bg-line">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-text-muted/50"
          style={{ width: `${pos * 100}%` }}
        />
        <div
          className="absolute top-1/2 w-2.5 h-2.5 -translate-y-1/2 -translate-x-1/2 rounded-full bg-gold border-2 border-surface"
          style={{ left: `${pos * 100}%` }}
        />
      </div>
    </div>
  );
}

/** Coin logo from the same icon source the site already uses, with a text fallback. */
export function CoinLogo({ base, size = 36 }: { base: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (failed) {
    return (
      <span
        style={style}
        className="rounded-full flex items-center justify-center text-xs font-bold text-text-muted shrink-0 font-data bg-surface-raised border border-line"
      >
        {base.slice(0, 3)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://assets.coincap.io/assets/icons/${base.toLowerCase()}@2x.png`}
      alt=""
      style={style}
      className="rounded-full shrink-0 bg-white object-contain p-0.5"
      onError={() => setFailed(true)}
    />
  );
}
