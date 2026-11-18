"use client";

import { useState } from "react";
import { thumbHigh, thumbMedium } from "@/lib/videos";

// VIDEOS-v1: YouTube thumbnail in a fixed 16:9 box. "high" tries the HD still first and falls back to the always-present medium one.
export default function VideoThumb({ id, high = false, className = "" }: { id: string; high?: boolean; className?: string }) {
  const [fallback, setFallback] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote YouTube still, lazy-loaded; not worth image-optimizer config
    <img
      src={high && !fallback ? thumbHigh(id) : thumbMedium(id)}
      onError={() => setFallback(true)}
      alt=""
      loading="lazy"
      decoding="async"
      className={`absolute inset-0 h-full w-full object-cover ${className}`}
    />
  );
}

export function PlayBadge({ large = false }: { large?: boolean }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gold text-[#0b0e11] shadow-lg transition-transform duration-200 group-hover:scale-110 ${large ? "h-16 w-16" : "h-11 w-11"}`}
    >
      <svg viewBox="0 0 24 24" className={large ? "h-7 w-7" : "h-5 w-5"} fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>
    </span>
  );
}
