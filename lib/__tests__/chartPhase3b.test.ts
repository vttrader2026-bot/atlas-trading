import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, loadSettings, sanitizeSettings, saveSettings } from "@/lib/chartSettings";

const mem = (initial?: Record<string, string>) => {
  const m = new Map<string, string>(Object.entries(initial ?? {}));
  return { m, store: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } };
};

describe("volume panel: hidden by default (Phase 3B)", () => {
  it("is off for a new viewer", () => {
    expect(DEFAULT_SETTINGS.volume).toBe(false);
    expect(loadSettings(mem().store).volume).toBe(false);
    expect(sanitizeSettings(undefined).volume).toBe(false);
  });
  it("saved settings that never recorded a volume choice (old default true) come back off, other settings kept", () => {
    const old = { ...DEFAULT_SETTINGS, grid: "none", volume: true } as Record<string, unknown>;
    delete old.volumeChosen; // what Phase 2 wrote
    const { store } = mem({ [SETTINGS_STORAGE_KEY]: JSON.stringify(old) });
    const s = loadSettings(store);
    expect(s.volume).toBe(false);
    expect(s.grid).toBe("none");
  });
  it("an explicit choice is respected, on or off, across a reload", () => {
    const { store, m } = mem();
    saveSettings({ ...DEFAULT_SETTINGS, volume: true, volumeChosen: true }, store);
    expect(loadSettings(store).volume).toBe(true);
    saveSettings({ ...DEFAULT_SETTINGS, volume: false, volumeChosen: true }, store);
    expect(loadSettings(store)).toMatchObject({ volume: false, volumeChosen: true });
    expect(JSON.parse(m.get(SETTINGS_STORAGE_KEY)!).volumeChosen).toBe(true);
  });
  it("ignores a non-boolean choice flag or value", () => {
    expect(sanitizeSettings({ volume: true, volumeChosen: "yes" }).volume).toBe(false);
    expect(sanitizeSettings({ volume: "yes", volumeChosen: true }).volume).toBe(false);
  });
  it("the settings menu records the choice when volume is toggled", () => {
    expect(readFileSync("components/charts/workspace/SettingsMenu.tsx", "utf8")).toContain("onChange({ volume: v, volumeChosen: true })");
  });
  it("toggling never refetches or reconnects: volume is applied by useChartInstance.applyAppearance only", () => {
    const inst = readFileSync("components/charts/hooks/useChartInstance.ts", "utf8");
    expect(inst).toContain("if (s.volume && !core.volumeSeriesRef.current)");
    expect(inst).toContain("chart.removePane(1)");
    const data = readFileSync("components/charts/hooks/useChartData.ts", "utf8");
    expect(data).not.toMatch(/\[[^\]]*settings[^\]]*\]/);
    const live = readFileSync("components/charts/hooks/useLiveCandles.ts", "utf8");
    expect(live).toMatch(/\[core, dataKey, resync, onCandle\]/);
  });
});

describe("fullscreen (Phase 3B)", () => {
  const hook = readFileSync("components/charts/hooks/useFullscreen.ts", "utf8");
  const view = readFileSync("components/charts/ChartWorkspace.tsx", "utf8");
  const bar = readFileSync("components/charts/workspace/ChartToolbar.tsx", "utf8");
  it("uses the real Fullscreen API (with WebKit fallbacks), never a fake size change", () => {
    expect(hook).toContain("requestFullscreen");
    expect(hook).toContain("webkitRequestFullscreen");
    expect(hook).toContain("exitFullscreen");
    expect(hook).toContain("fullscreenchange");
    expect(hook).toContain("fullscreenerror");
    expect(hook).toContain("document.fullscreenEnabled".replace("document.", "d."));
  });
  it("active state mirrors document.fullscreenElement so Escape and browser exit stay in sync", () => {
    expect(hook).toMatch(/fullscreenElement \?\? .*webkitFullscreenElement/);
    expect(hook).toMatch(/setActive\(!!el && currentElement\(\) === el\)/);
  });
  it("cleans up listeners and leaves fullscreen on unmount", () => {
    expect(hook.match(/removeEventListener/g)?.length).toBe(4);
    expect(hook).toContain("Leaving the page while fullscreen");
  });
  it("rejected or unsupported requests surface a message instead of failing silently", () => {
    expect(hook).toMatch(/catch \{\s*flagFailure\(\)/);
    expect(view).toContain("charts.fullscreenFailed");
    expect(bar).toContain("charts.fullscreenUnsupported");
    expect(bar).toContain("disabled={!p.fullscreen.supported}");
  });
  it("the chart panel itself is the fullscreen element and its layout fills the screen", () => {
    expect(view).toContain("ref={panelRef}");
    expect(view).toContain("useFullscreen(panelRef)");
    expect(view).toMatch(/fs \? "h-dvh w-full overflow-hidden"/);
    expect(view).toContain("flex min-h-0 flex-1"); // chart row fills the remaining height (Part 2 layout)
  });
  it("has the exit control in the toolbar and labels in all three languages", () => {
    expect(bar).toContain("charts.exitFullscreen");
    for (const l of ["en", "ar", "fr"]) {
      const src = readFileSync(`lib/i18n/${l}.ts`, "utf8");
      for (const k of ["fullscreen", "exitFullscreen", "fullscreenUnsupported", "fullscreenFailed"]) expect(src, `${l}.${k}`).toMatch(new RegExp(`\\n    ${k}: "[^"]+",`));
    }
  });
});
