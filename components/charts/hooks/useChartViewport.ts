"use client";

// Viewport controls: zoom in/out around the current visible range, and reset to fit.

import { useCallback } from "react";
import { zoomRange } from "@/lib/chartViewport";
import type { ChartCore } from "@/components/charts/hooks/chartCore";

export function useChartViewport(core: ChartCore) {
  const zoom = useCallback(
    (factor: number) => {
      const ts = core.chartRef.current?.timeScale();
      const r = ts?.getVisibleLogicalRange();
      if (ts && r) ts.setVisibleLogicalRange(zoomRange({ from: r.from as number, to: r.to as number }, factor));
    },
    [core]
  );
  const fit = useCallback(() => core.chartRef.current?.timeScale().fitContent(), [core]);
  return { zoom, fit };
}
