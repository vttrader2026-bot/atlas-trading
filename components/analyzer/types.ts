// Shared shape of an Analyzer response (screenshot and live-chart paths return
// the same JSON; see lib/analyzerEngineApply.ts). Every price shown by the
// result UI comes from `_engine` / `tradePlan` — never from AI text.

import type { EngineResult, Verdict } from "@/lib/analyzerEngine";

export type Scenario = { confirmation: string; targets: string[]; why: string } | null;

export type AnalysisData = {
  pair: string;
  timeframe: string;
  marketStructure: { state: string; explanation: string };
  trend: { direction: string; strength: string; explanation: string };
  momentum: string;
  keyLevels: { label: string; price: string }[];
  currentCondition: { label: string; explanation: string };
  bullishScenario: Scenario;
  bearishScenario: Scenario;
  whatToWatch: string[];
  noClearSetup: string | null;
  invalidation: { level: string; explanation: string };
  tradePlan: {
    direction: string;
    entryZone: string;
    invalidation: string;
    targets: string[];
    riskNote: string;
    riskReward?: string;
  };
  observations?: { confirmed: string[]; uncertain: string[] };
  teachMe?: {
    structure: string;
    trend: string;
    keyLevels: string;
    confirmation: string;
    invalidation: string;
  };
  verdict?: Verdict;
  verdictLabel?: string;
  verdictReasons?: { code: string; text: string }[];
  _engine?: EngineResult;
  _usage?: { plan: string; remaining: number; limit: number };
};

export type T = (key: string) => string;

/** Verdict for rendering. Older/unexpected responses without an engine fall back to the plan direction. */
export function verdictOf(d: AnalysisData): Verdict {
  if (d.verdict) return d.verdict;
  if (d._engine) return d._engine.verdict;
  const dir = d.tradePlan?.direction?.toLowerCase() ?? "";
  return dir.includes("long") && !d.noClearSetup ? "VALID_SETUP" : d.noClearSetup ? "NO_CLEAN_SETUP" : "WAIT_FOR_CONFIRMATION";
}

/** Price text exactly as the engine produced it (8 significant digits, no re-rounding). */
export function px(v: number): string {
  return Number.isFinite(v) ? String(Number(v.toPrecision(8))) : "—";
}

export const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), s);

export const HIGHER_TF_LABEL: Record<string, string> = { "15m": "1H", "1h": "4H", "4h": "1D", "1d": "1W" };
export const tfLabel = (i: string | null | undefined) => (i ? i.toUpperCase() : "");
