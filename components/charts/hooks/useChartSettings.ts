"use client";

// Appearance settings: per-viewer preference in localStorage (lib/chartSettings).
// Changes re-apply to the live chart without reloading any candles.

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SETTINGS, clearSettings, loadSettings, saveSettings, type ChartSettings } from "@/lib/chartSettings";
import type { ChartCore } from "@/components/charts/hooks/chartCore";

export function useChartSettings(core: ChartCore, chartReady: boolean, applyAppearance: () => void) {
  const [settings, setSettings] = useState<ChartSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of saved preferences after mount (SSR cannot see them) */
    setSettings(loadSettings());
  }, []);

  useEffect(() => {
    core.settingsRef.set(settings);
    if (chartReady) applyAppearance();
  }, [core, settings, chartReady, applyAppearance]);

  const update = useCallback((patch: Partial<ChartSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);
  const reset = useCallback(() => {
    clearSettings();
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  return { settings, update, reset };
}
