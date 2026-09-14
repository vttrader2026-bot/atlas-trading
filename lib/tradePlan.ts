export type TradePlanDraft = {
  pair: string;
  direction: "Long" | "Short" | "Wait";
  entryZone: string;
  invalidationText: string;
  entry: string; // best-effort numeric parse of entryZone, editable
  invalidation: string; // best-effort numeric parse of invalidationText, editable
  tp1: string;
  tp2: string;
  tp3: string;
  reasoning: string;
};

const STORAGE_KEY = "atlas-trading.tradeplan.v1";

export const emptyDraft: TradePlanDraft = {
  pair: "",
  direction: "Long",
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

export function saveDraft(draft: TradePlanDraft) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function loadDraft(): TradePlanDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TradePlanDraft) : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
