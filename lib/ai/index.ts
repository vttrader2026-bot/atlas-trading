// AI-PROVIDERS-v1: the one entry point the Analyzer routes use. Free providers only, tried in order.
// Nothing here touches the usage counter: the route consumes a use only after runAnalysis() returns ok.
import { buildChain } from "./config";
import { callCompat } from "./compat";
import { callGemini } from "./gemini";
import type { Adapter, AnalysisRequest, ChainEntry, RunResult } from "./types";

export type { AnalysisRequest, RunResult } from "./types";

/** Total time for all providers together; the routes allow 30 s and also load candles first. */
export const TOTAL_BUDGET_MS = 22_000;
const PER_ATTEMPT_CAP_MS = 15_000;
const MIN_ATTEMPT_MS = 3_000;

const adapterFor = (e: ChainEntry): Adapter => (e.provider === "gemini" ? callGemini : callCompat);

/** Accepts bare JSON or JSON inside a ```json fence, and requires the object shape the website renders. */
export function parseAnalysisJson(text: string): Record<string, unknown> | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const v = JSON.parse(cleaned);
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const o = v as Record<string, unknown>;
    return o.marketStructure && typeof o.marketStructure === "object" && o.tradePlan && typeof o.tradePlan === "object" ? o : null;
  } catch {
    return null;
  }
}

/** True when at least one free provider is configured for this kind of request. */
export function providersConfigured(needsImage: boolean, env: Record<string, string | undefined> = process.env): boolean {
  return buildChain(env, { needsImage }).length > 0;
}

export async function runAnalysis(
  req: AnalysisRequest,
  env: Record<string, string | undefined> = process.env,
  now: () => number = Date.now,
): Promise<RunResult> {
  const chain = buildChain(env, { needsImage: !!req.image });
  const deadline = now() + TOTAL_BUDGET_MS;
  let sawEmpty = false;
  let sawInvalid = false;

  for (const entry of chain) {
    const left = deadline - now();
    if (left < MIN_ATTEMPT_MS) break;
    const out = await adapterFor(entry)(entry, req, Math.min(PER_ATTEMPT_CAP_MS, left));
    if (!out.ok) {
      if (out.kind === "empty") sawEmpty = true;
      continue; // quota, overload, timeout, empty: try the next free entry
    }
    const parsed = parseAnalysisJson(out.text);
    if (parsed) return { ok: true, parsed, provider: entry.provider, model: entry.model };
    console.error(`analyzer: ${entry.provider}/${entry.model} returned unusable JSON`);
    sawInvalid = true;
  }
  return { ok: false, kind: sawInvalid ? "invalid" : sawEmpty ? "empty" : "unavailable" };
}
