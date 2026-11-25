"use client";

// Shared, stable bag of chart objects for the /charts hooks. It holds refs
// only (no React state), so passing it around never causes a re-render and
// every hook reads the current chart/series from the same place.

import { useState } from "react";
import type { IChartApi, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import type { Candle } from "@/lib/marketDataTypes";
import { DEFAULT_INDICATORS, type IndicatorId } from "@/lib/chartIndicators";
import { DEFAULT_SETTINGS, type ChartSettings, type ThemeColors } from "@/lib/chartSettings";
import type { DrawingsPrimitive } from "@/components/charts/drawingsPrimitive";

/**
 * A tiny mutable cell: read with `.current` (like a ref), write with `.set()`.
 * Writes go through a method so the React compiler lint can tell they are
 * deliberate imperative updates to chart objects, not render-time mutation.
 */
export class Slot<T> {
  private value: T;
  constructor(initial: T) {
    this.value = initial;
  }
  get current(): T {
    return this.value;
  }
  set(next: T): void {
    this.value = next;
  }
}

export type ChartCore = {
  chartRef: Slot<IChartApi | null>;
  lwcRef: Slot<typeof import("lightweight-charts") | null>;
  candleSeriesRef: Slot<ISeriesApi<"Candlestick"> | null>;
  volumeSeriesRef: Slot<ISeriesApi<"Histogram"> | null>;
  emaSeriesRef: Slot<Record<number, ISeriesApi<"Line">>>;
  primitiveRef: Slot<DrawingsPrimitive | null>;
  /** Candles currently on the chart (history + live), ascending. */
  candlesRef: Slot<Candle[]>;
  /** Latest settings / indicator toggles, readable from async callbacks without stale closures. */
  settingsRef: Slot<ChartSettings>;
  indicatorsRef: Slot<Record<IndicatorId, boolean>>;
};

export function useChartCore(): ChartCore {
  const [core] = useState<ChartCore>(() => ({
    chartRef: new Slot<IChartApi | null>(null),
    lwcRef: new Slot<typeof import("lightweight-charts") | null>(null),
    candleSeriesRef: new Slot<ISeriesApi<"Candlestick"> | null>(null),
    volumeSeriesRef: new Slot<ISeriesApi<"Histogram"> | null>(null),
    emaSeriesRef: new Slot<Record<number, ISeriesApi<"Line">>>({}),
    primitiveRef: new Slot<DrawingsPrimitive | null>(null),
    candlesRef: new Slot<Candle[]>([]),
    settingsRef: new Slot<ChartSettings>(DEFAULT_SETTINGS),
    indicatorsRef: new Slot<Record<IndicatorId, boolean>>(DEFAULT_INDICATORS),
  }));
  return core;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Atlas theme variables (they change with the light/dark class on <html>), with dark-theme fallbacks. */
export function themeColors(): ThemeColors & { gold: string; textStrong: string } {
  return {
    bull: cssVar("--bull") || "#35c48a",
    bear: cssVar("--bear") || "#ef5350",
    text: cssVar("--text-muted") || "#939dac",
    textStrong: cssVar("--text") || "#e6e8eb",
    line: cssVar("--line") || "#212a36",
    gold: cssVar("--gold") || "#d4af37",
    bg: cssVar("--bg") || "#0b0f14",
    surface: cssVar("--surface") || "#11151c",
  };
}

export const toTime = (ms: number) => Math.floor(ms / 1000) as UTCTimestamp;
