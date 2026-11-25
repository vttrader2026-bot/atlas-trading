"use client";

// Indicator toggles and their effect on the chart. Visibility only: toggling
// never refetches or recomputes history. Phase 3 plugs new indicators in here.

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_INDICATORS, EMA_DEFS, canToggle, type IndicatorId } from "@/lib/chartIndicators";
import type { ChartCore } from "@/components/charts/hooks/chartCore";

export function useChartIndicators(core: ChartCore, chartReady: boolean) {
  const [indicators, setIndicators] = useState<Record<IndicatorId, boolean>>(DEFAULT_INDICATORS);

  useEffect(() => {
    core.indicatorsRef.set(indicators);
    for (const e of EMA_DEFS) core.emaSeriesRef.current[e.period]?.applyOptions({ visible: indicators[e.id] });
  }, [core, indicators, chartReady]);

  const toggle = useCallback((id: IndicatorId) => {
    if (!canToggle(id)) return;
    setIndicators((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return { indicators, toggle };
}
