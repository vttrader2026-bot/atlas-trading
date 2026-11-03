export type PlanStatus = "draft" | "entered";

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
  /** Set when the user confirms they actually entered the trade. */
  enteredAt?: string;
  actualEntry?: string;
  /** Journal trade created from this plan. */
  journalId?: string;
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
    timeframe: s(r.timeframe),
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
