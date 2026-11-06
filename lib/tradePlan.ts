import { normalizeLink, type SignalLink } from "@/lib/signalLink";

export type PlanStatus = "draft" | "entered";

/** How the position is sized. "risk" is the original behaviour (risk % of the balance). */
export type SizeMode = "risk" | "usdt" | "balancePct";

/** The only timeframes the Trade Plan offers. */
export const TIMEFRAMES = ["15M", "30M", "1H", "4H", "1D", "1W", "1M"] as const;

/**
 * Maps what an older plan or the Analyzer hand-off stored ("4h", "15m", " 1D ") to a dropdown value.
 * "1m" (lower case) is NOT mapped: it could have meant one minute, which is not offered, so it is kept as typed.
 */
export function normalizeTimeframe(raw: string): string | null {
  const t = raw.trim();
  if ((TIMEFRAMES as readonly string[]).includes(t)) return t;
  if (t === "1m") return null;
  const up = t.toUpperCase();
  return (TIMEFRAMES as readonly string[]).includes(up) ? up : null;
}

export type TpKey = "tp1" | "tp2" | "tp3";
/** Split needs TP1, TP2 and TP3. TP3 Only needs TP3 alone. */
export function requiredTargets(strategy: "split" | "tp3" | undefined): readonly TpKey[] {
  return strategy === "tp3" ? ["tp3"] : ["tp1", "tp2", "tp3"];
}
/** Required targets that are empty (the plan can't go to the Journal until they are filled). */
export function missingTargets(d: Pick<TradePlanDraft, "tp1" | "tp2" | "tp3" | "exitStrategy">): TpKey[] {
  return requiredTargets(d.exitStrategy).filter((k) => d[k].trim() === "");
}

export type TradePlanDraft = {
  pair: string;
  /**
   * Spot only: the UI offers Long or Wait. "Short" stays in the type solely so plans saved by older
   * versions still type-check; normalizeDraft() reads any "Short" as "Wait".
   */
  direction: "Long" | "Short" | "Wait";
  timeframe: string;
  entryZone: string;
  invalidationText: string;
  entry: string; // best-effort numeric parse of entryZone, editable
  invalidation: string; // best-effort numeric parse of invalidationText, editable
  tp1: string;
  tp2: string;
  tp3: string;
  reasoning: string;
  // Optional lifecycle + sizing inputs (absent on plans saved by older versions and by the Analyzer hand-off).
  /** Stable id so a plan can be linked to the journal trade created from it. */
  id?: string;
  status?: PlanStatus;
  balance?: string;
  riskPct?: string;
  /** Position sizing mode and its value (USDT amount, or % of the balance). Absent = risk % (older plans). */
  sizeMode?: SizeMode;
  sizeValue?: string;
  /** Set when the user confirms they actually entered the trade. */
  enteredAt?: string;
  actualEntry?: string;
  /** Exit strategy chosen for the trade (EXIT-STRATEGY-v1). Defaults to the 30/40/30 split. */
  exitStrategy?: "split" | "tp3";
  /** Journal trade created from this plan. */
  journalId?: string;
  /** Atlas signal this plan was created from (Signal ID) and the official data linked to it. */
  signalId?: string;
  signal?: SignalLink;
};

const STORAGE_KEY = "atlas-trading.tradeplan.v1";

export const emptyDraft: TradePlanDraft = {
  pair: "",
  direction: "Long",
  timeframe: "",
  entryZone: "",
  invalidationText: "",
  entry: "",
  invalidation: "",
  tp1: "",
  tp2: "",
  tp3: "",
  reasoning: "",
};

/** Pulls the first plain number out of a string like "$61,200 – $64,800". */
export function firstNumber(text: string): string {
  const match = text.replace(/,/g, "").match(/\d+(\.\d+)?/);
  return match ? match[0] : "";
}

const s = (x: unknown) => (typeof x === "string" ? x : "");

/** Accepts anything stored or handed over (Analyzer, Account, older versions) and returns a valid spot draft. */
export function normalizeDraft(raw: unknown): TradePlanDraft {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const d: TradePlanDraft = {
    pair: s(r.pair),
    direction: r.direction === "Wait" || r.direction === "Short" ? "Wait" : "Long",
    timeframe: normalizeTimeframe(s(r.timeframe)) ?? s(r.timeframe),
    entryZone: s(r.entryZone),
    invalidationText: s(r.invalidationText),
    entry: s(r.entry),
    invalidation: s(r.invalidation),
    tp1: s(r.tp1),
    tp2: s(r.tp2),
    tp3: s(r.tp3),
    reasoning: s(r.reasoning),
  };
  if (typeof r.id === "string" && r.id) d.id = r.id;
  if (r.status === "draft" || r.status === "entered") d.status = r.status;
  for (const k of ["balance", "riskPct", "enteredAt", "actualEntry", "journalId"] as const) {
    if (typeof r[k] === "string" && r[k]) d[k] = r[k] as string;
  }
  if (r.sizeMode === "risk" || r.sizeMode === "usdt" || r.sizeMode === "balancePct") d.sizeMode = r.sizeMode;
  if (typeof r.sizeValue === "string" && r.sizeValue) d.sizeValue = r.sizeValue;
  if (r.exitStrategy === "split" || r.exitStrategy === "tp3") d.exitStrategy = r.exitStrategy;
  if (typeof r.signalId === "string" && r.signalId) d.signalId = r.signalId;
  const link = normalizeLink(r.signal);
  if (link) {
    d.signal = link;
    d.signalId = link.id;
  }
  return d;
}

export function saveDraft(draft: TradePlanDraft) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function loadDraft(): TradePlanDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeDraft(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
