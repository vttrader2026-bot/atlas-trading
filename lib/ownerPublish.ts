// OWNER-PUBLISH-v1: validation shared by the owner-only "Publish to Feed" buttons (browser, to decide whether to show
// the button) and by POST /api/admin/signals/quick-publish (server, the only place that is authoritative).
// Published signals use the EXISTING feed record (PublishedTrade via draftToTrade) and tiers (feedForViewer).
import type { ParseResult } from "@/lib/adminSignals";

export type PublishSource = "analyzer" | "trade-plan";

export type PublishFields = {
  pair: string;
  direction: "Long";
  timeframe: string;
  entryZone: string;
  invalidation: string;
  tp1: string;
  tp2: string;
  tp3: string;
  reasoning: string;
};

const str = (v: unknown, max: number): string | null => {
  if (v === undefined || v === null) return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return typeof v === "string" && v.length <= max ? v.trim() : null; // too long = rejected, never silently cut
};

const numbers = (s: string): number[] => (s.replace(/,/g, "").match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0);

/**
 * A usable SPOT setup: Long only; an entry (one price or a low-high zone), a stop-loss strictly below the whole entry
 * zone, and at least one target, each strictly above the entry zone and rising from TP1 to TP3. TP3-only is allowed
 * (the Trade Plan's "TP3 Only" exit strategy). Anything else is rejected, never repaired.
 */
export function validateSpotSetup(input: unknown): ParseResult<PublishFields> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Invalid setup" };
  const b = input as Record<string, unknown>;
  const pair = (str(b.pair, 30) ?? "").toUpperCase();
  if (!/^[A-Z0-9]{3,30}$/.test(pair)) return { ok: false, error: "A valid pair is required (e.g. SOLUSDT)" };
  if (b.direction !== "Long") return { ok: false, error: "Only spot (Long) setups can be published" };
  const entryZone = str(b.entryZone, 200);
  const invalidation = str(b.invalidation, 200);
  const timeframe = str(b.timeframe, 20);
  const reasoning = str(b.reasoning, 2000);
  const tps = [str(b.tp1, 50), str(b.tp2, 50), str(b.tp3, 50)];
  if (entryZone === null || invalidation === null || timeframe === null || reasoning === null || tps.some((x) => x === null)) return { ok: false, error: "A field is missing or too long" };

  const entry = numbers(entryZone);
  if (entry.length < 1 || entry.length > 2) return { ok: false, error: "Entry must be a price or a low-high zone" };
  const stop = numbers(invalidation);
  if (stop.length !== 1 || /[-−–]/.test(invalidation)) return { ok: false, error: "Stop-loss must be a single price" };
  const lo = Math.min(...entry);
  const hi = Math.max(...entry);
  if (!(stop[0] < lo)) return { ok: false, error: "Stop-loss must be below the entry zone" };

  let previous = hi;
  let provided = 0;
  for (const [i, tp] of (tps as string[]).entries()) {
    if (tp === "") continue;
    const n = numbers(tp);
    if (n.length !== 1 || /[-−–]/.test(tp)) return { ok: false, error: `TP${i + 1} must be a single price` };
    if (!(n[0] > previous)) return { ok: false, error: `TP${i + 1} must be above the entry zone and the previous target` };
    previous = n[0];
    provided++;
  }
  if (provided === 0) return { ok: false, error: "At least one target is required" };

  return { ok: true, value: { pair, direction: "Long", timeframe, entryZone, invalidation, tp1: tps[0] as string, tp2: tps[1] as string, tp3: tps[2] as string, reasoning } };
}

/** The same setup published twice within this window is refused (double click, retry after a slow response). */
export const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

export function sameSetup(a: { pair: string; tier?: unknown; entryZone: string; invalidation: string; tp1: string; tp2: string; tp3: string }, b: PublishFields & { tier: string }): boolean {
  return a.pair === b.pair && (a.tier ?? "free") === b.tier && a.entryZone === b.entryZone && a.invalidation === b.invalidation && a.tp1 === b.tp1 && a.tp2 === b.tp2 && a.tp3 === b.tp3;
}
