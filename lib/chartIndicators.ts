// ATLAS CHARTS: the indicators menu registry. Phase 2 builds the menu and
// keeps the existing EMA overlays working; RSI, MACD and SMA are listed as
// "soon" so Phase 3 only has to flip their status and add the series — the
// menu, labels and toggle plumbing already read from this list.

export type IndicatorId = "ema20" | "ema50" | "ema200" | "sma" | "rsi" | "macd";
export type IndicatorGroup = "overlay" | "pane";

export type IndicatorDef = {
  id: IndicatorId;
  label: string;
  group: IndicatorGroup;
  /** "active": drawn today. "soon": shown disabled, reserved for Phase 3. */
  status: "active" | "soon";
  /** EMA period for the overlay indicators. */
  period?: number;
};

export const INDICATORS: IndicatorDef[] = [
  { id: "ema20", label: "EMA 20", group: "overlay", status: "active", period: 20 },
  { id: "ema50", label: "EMA 50", group: "overlay", status: "active", period: 50 },
  { id: "ema200", label: "EMA 200", group: "overlay", status: "active", period: 200 },
  { id: "sma", label: "SMA", group: "overlay", status: "soon" },
  { id: "rsi", label: "RSI", group: "pane", status: "soon" },
  { id: "macd", label: "MACD", group: "pane", status: "soon" },
];

export const DEFAULT_INDICATORS: Record<IndicatorId, boolean> = { ema20: true, ema50: true, ema200: false, sma: false, rsi: false, macd: false };

export const activeIndicators = () => INDICATORS.filter((i) => i.status === "active");
export const upcomingIndicators = () => INDICATORS.filter((i) => i.status === "soon");
/** Only indicators that are actually drawn can be switched on. */
export const canToggle = (id: IndicatorId) => INDICATORS.some((i) => i.id === id && i.status === "active");
