// Pure spot-LONG risk maths for the Risk Calculator. No market data, no side effects.
// Two modes:
//   risk     - balance + risk % + entry + stop  -> maximum planned loss, position size, quantity
//   position - balance + investment + entry + stop -> potential loss and its % of investment / balance
// Fees, slippage and execution are NOT modelled; the UI says so.

export const RISK_PRESETS = [0.5, 1, 1.5, 2] as const;

/** Parse a user-typed number. Accepts Arabic-Indic digits, "," thousands separators and "٫" decimals. Positive finite only. */
export function parseInput(raw: string): number | null {
  const s = raw
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/[,٬\s]/g, "");
  if (s === "" || !/^\d*\.?\d+$|^\d+\.$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type RiskError =
  | "stopNotBelowEntry" // spot long: stop-loss must be below entry
  | "targetNotAboveEntry" // take-profit must be above entry
  | "riskTooHigh" // risk % must be ≤ 100
  | "investmentTooHigh"; // spot: cannot invest more than the balance

export type Common = {
  /** Maximum planned loss in USDT if the stop-loss is hit at the planned price. */
  maxLoss: number;
  positionUsdt: number;
  quantity: number;
  /** (entry - stop) / entry, in %. */
  stopDistancePct: number;
  /** Loss as % of the position value (== stopDistancePct). */
  lossPctOfPosition: number;
  lossPctOfBalance: number;
  /** Position bigger than the balance: not possible on spot without borrowing. */
  exceedsBalance: boolean;
  profit: number | null;
  profitPctOfBalance: number | null;
  /** Reward : risk using TP3. */
  rr: number | null;
};

export type RiskResult = { ok: true; value: Common } | { ok: false; error: RiskError };

type Levels = { entry: number; stop: number; tp: number | null };

function levelsError(l: Levels): RiskError | null {
  if (!(l.stop < l.entry)) return "stopNotBelowEntry";
  if (l.tp !== null && !(l.tp > l.entry)) return "targetNotAboveEntry";
  return null;
}

function finish(balance: number, quantity: number, l: Levels): Common {
  const distance = l.entry - l.stop;
  const maxLoss = quantity * distance;
  const positionUsdt = quantity * l.entry;
  const profit = l.tp !== null ? quantity * (l.tp - l.entry) : null;
  return {
    maxLoss,
    positionUsdt,
    quantity,
    stopDistancePct: (distance / l.entry) * 100,
    lossPctOfPosition: (distance / l.entry) * 100,
    lossPctOfBalance: (maxLoss / balance) * 100,
    exceedsBalance: positionUsdt > balance * (1 + 1e-9),
    profit,
    profitPctOfBalance: profit !== null ? (profit / balance) * 100 : null,
    rr: l.tp !== null ? (l.tp - l.entry) / distance : null,
  };
}

export function calcRiskBased(i: { balance: number; riskPct: number; entry: number; stop: number; tp: number | null }): RiskResult {
  if (i.riskPct > 100) return { ok: false, error: "riskTooHigh" };
  const err = levelsError(i);
  if (err) return { ok: false, error: err };
  const maxLoss = i.balance * (i.riskPct / 100);
  const quantity = maxLoss / (i.entry - i.stop);
  return { ok: true, value: finish(i.balance, quantity, i) };
}

export function calcPositionBased(i: { balance: number; investment: number; entry: number; stop: number; tp: number | null }): RiskResult {
  if (i.investment > i.balance * (1 + 1e-9)) return { ok: false, error: "investmentTooHigh" };
  const err = levelsError(i);
  if (err) return { ok: false, error: err };
  const quantity = i.investment / i.entry;
  return { ok: true, value: finish(i.balance, quantity, i) };
}
