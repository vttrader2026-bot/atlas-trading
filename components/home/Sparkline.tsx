"use client";

import { useId } from "react";

/** Area line from real closes. Draws itself once on mount (CSS), no fake points. */
export default function Sparkline({ values, height = 120 }: { values: number[]; height?: number }) {
  const id = useId().replace(/:/g, "");
  const w = 320;
  const h = 100;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 6 - ((v - min) / span) * (h - 14)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w} ${h} L0 ${h} Z`;
  const up = values[values.length - 1] >= values[0];
  const last = pts[pts.length - 1];
  return (
    <div dir="ltr">
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full block" style={{ height }} role="img" aria-label="BTC/USDT, last 24 hours">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={up ? "var(--gold)" : "var(--bear)"} stopOpacity="0.28" />
          <stop offset="1" stopColor={up ? "var(--gold)" : "var(--bear)"} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={w} y1={h * f} y2={h * f} stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="2 5" />
      ))}
      <path d={area} fill={`url(#g${id})`} className="home-fade" />
      <path d={line} fill="none" stroke={up ? "var(--gold)" : "var(--bear)"} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" pathLength={1} className="home-draw" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill={up ? "var(--gold)" : "var(--bear)"} className="home-fade" vectorEffect="non-scaling-stroke" />
    </svg>
    </div>
  );
}
