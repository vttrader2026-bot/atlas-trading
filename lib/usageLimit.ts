const STORAGE_KEY = "atlas-trading.analyzeUsage.v1";
export const DAILY_ANALYZE_LIMIT = 2;

type UsageRecord = { date: string; count: number };

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function readRecord(): UsageRecord {
  if (typeof window === "undefined") return { date: todayKey(), count: 0 };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { date: todayKey(), count: 0 };
    const parsed: UsageRecord = JSON.parse(raw);
    if (parsed.date !== todayKey()) return { date: todayKey(), count: 0 };
    return parsed;
  } catch {
    return { date: todayKey(), count: 0 };
  }
}

/** How many analyses are left today on this browser. */
export function getRemainingUses(): number {
  if (typeof window === "undefined") return DAILY_ANALYZE_LIMIT;
  return Math.max(0, DAILY_ANALYZE_LIMIT - readRecord().count);
}

/** Records one attempt (call right before starting the analyze request). */
export function recordUse(): number {
  if (typeof window === "undefined") return DAILY_ANALYZE_LIMIT;
  const record = readRecord();
  record.count += 1;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  return Math.max(0, DAILY_ANALYZE_LIMIT - record.count);
}
