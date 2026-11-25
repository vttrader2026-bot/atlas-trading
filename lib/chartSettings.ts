// ATLAS CHARTS Phase 2: chart appearance settings. Every setting here is
// wired to a real Lightweight Charts option in ChartWorkspace; nothing is
// shown that cannot be applied. Settings are a per-viewer preference kept in
// this browser only (never sent to a server, never part of drawings).

export type GridMode = "both" | "horz" | "vert" | "none";
export type CandleStyle = "solid" | "hollow";
export type ColorPreset = "atlas" | "classic" | "colorblind";
export type BackgroundTone = "surface" | "base";
export type CrosshairMode = "normal" | "magnet";
export type CrosshairStyle = "dashed" | "solid" | "dotted";

export type ChartSettings = {
  candleStyle: CandleStyle;
  colors: ColorPreset;
  grid: GridMode;
  background: BackgroundTone;
  priceScale: boolean;
  timeScale: boolean;
  crosshair: boolean;
  crosshairMode: CrosshairMode;
  crosshairStyle: CrosshairStyle;
  volume: boolean;
};

export const DEFAULT_SETTINGS: ChartSettings = {
  candleStyle: "solid",
  colors: "atlas",
  grid: "both",
  background: "surface",
  priceScale: true,
  timeScale: true,
  crosshair: true,
  crosshairMode: "normal",
  crosshairStyle: "dashed",
  volume: true,
};

/** `null` means "use the Atlas theme's own --bull / --bear (follows light/dark)". */
export const COLOR_PRESETS: Record<ColorPreset, { up: string | null; down: string | null }> = {
  atlas: { up: null, down: null },
  classic: { up: "#16a34a", down: "#dc2626" },
  colorblind: { up: "#3b82f6", down: "#f59e0b" },
};

export const GRID_MODES: GridMode[] = ["both", "horz", "vert", "none"];
export const COLOR_PRESET_IDS = Object.keys(COLOR_PRESETS) as ColorPreset[];
export const CROSSHAIR_STYLES: CrosshairStyle[] = ["dashed", "solid", "dotted"];

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

/** Accepts anything (e.g. parsed JSON from storage) and returns a complete, valid settings object. */
export function sanitizeSettings(raw: unknown): ChartSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  return {
    candleStyle: pick(r.candleStyle, ["solid", "hollow"], d.candleStyle),
    colors: pick(r.colors, COLOR_PRESET_IDS, d.colors),
    grid: pick(r.grid, GRID_MODES, d.grid),
    background: pick(r.background, ["surface", "base"], d.background),
    priceScale: bool(r.priceScale, d.priceScale),
    timeScale: bool(r.timeScale, d.timeScale),
    crosshair: bool(r.crosshair, d.crosshair),
    crosshairMode: pick(r.crosshairMode, ["normal", "magnet"], d.crosshairMode),
    crosshairStyle: pick(r.crosshairStyle, CROSSHAIR_STYLES, d.crosshairStyle),
    volume: bool(r.volume, d.volume),
  };
}

export const SETTINGS_STORAGE_KEY = "atlas-charts-settings-v1";
type ReadStore = Pick<Storage, "getItem">;
type WriteStore = Pick<Storage, "setItem" | "removeItem">;

/** Reads saved settings; any storage or JSON problem falls back to the defaults. */
export function loadSettings(store?: ReadStore): ChartSettings {
  try {
    const s = store ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    const raw = s?.getItem(SETTINGS_STORAGE_KEY);
    return raw ? sanitizeSettings(JSON.parse(raw)) : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: ChartSettings, store?: WriteStore): void {
  try {
    const s = store ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    s?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* private mode or blocked storage: settings simply won't persist */
  }
}

export function clearSettings(store?: WriteStore): void {
  try {
    const s = store ?? (typeof window !== "undefined" ? window.localStorage : undefined);
    s?.removeItem(SETTINGS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export type ThemeColors = { bull: string; bear: string; text: string; line: string; bg: string; surface: string };

// Lightweight Charts numeric enums, kept here so this module needs no runtime import of the library.
const LINE_STYLE = { solid: 0, dotted: 1, dashed: 2 } as const;
const CROSSHAIR_MODE = { normal: 0, magnet: 1 } as const;

/** Resolved up/down colors for a settings object under the current theme. */
export function candleColors(s: ChartSettings, theme: ThemeColors): { up: string; down: string } {
  const p = COLOR_PRESETS[s.colors];
  return { up: p.up ?? theme.bull, down: p.down ?? theme.bear };
}

/** Chart-level options (not series options) for the given settings and theme. */
export function chartOptionsFor(s: ChartSettings, theme: ThemeColors) {
  const line = theme.line;
  const gridLine = { color: line };
  const noLine = { color: "transparent", visible: false };
  const cross = { color: theme.text, labelBackgroundColor: theme.text, style: LINE_STYLE[s.crosshairStyle], visible: s.crosshair };
  return {
    layout: { background: { color: s.background === "base" ? theme.bg : "transparent" }, textColor: theme.text },
    grid: {
      vertLines: s.grid === "both" || s.grid === "vert" ? { ...gridLine, visible: true } : noLine,
      horzLines: s.grid === "both" || s.grid === "horz" ? { ...gridLine, visible: true } : noLine,
    },
    rightPriceScale: { borderColor: line, visible: s.priceScale },
    timeScale: { borderColor: line, visible: s.timeScale, timeVisible: true, secondsVisible: false },
    crosshair: { mode: CROSSHAIR_MODE[s.crosshairMode], vertLine: cross, horzLine: cross },
  };
}

/** Candlestick series options for the given settings and theme (hollow = transparent body for up candles). */
export function candleOptionsFor(s: ChartSettings, theme: ThemeColors) {
  const { up, down } = candleColors(s, theme);
  return {
    upColor: s.candleStyle === "hollow" ? "transparent" : up,
    downColor: down,
    borderVisible: s.candleStyle === "hollow",
    borderUpColor: up,
    borderDownColor: down,
    wickUpColor: up,
    wickDownColor: down,
  };
}

/** Appends an alpha channel to a #rrggbb color (for volume bars); other color formats are returned unchanged. */
export function withAlpha(color: string, alphaHex = "80"): string {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}${alphaHex}` : color;
}
