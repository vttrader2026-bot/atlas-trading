// AI-PROVIDERS-v1: which providers may run, in order. FREE ONLY.
//
// Rules enforced here (and tested):
//  * Gemini models must be on FREE_GEMINI_MODELS (models Google lists as "Free of charge"); anything else
//    set through env is ignored, so an alias or typo can never move the Analyzer onto a paid model.
//  * OpenRouter is used only with a model id ending in ":free".
//  * Groq is used only when a model is named explicitly in GROQ_MODEL (no default).
//  * Groq / OpenRouter are OFF unless listed in ANALYZER_PROVIDERS. Default is "gemini".
//  * There is no OpenAI (or any other paid) provider: unknown names in ANALYZER_PROVIDERS are ignored.
import type { ChainEntry } from "./types";

/** Pinned free-tier Gemini models (Google's pricing page lists these as "Free of charge"). Update when Google changes them. */
export const FREE_GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
] as const;

export const DEFAULT_GEMINI_PRIMARY = "gemini-2.5-flash";
export const DEFAULT_GEMINI_FALLBACK = "gemini-2.5-flash-lite";

export const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

type Env = Record<string, string | undefined>;

const isFreeGemini = (m: string) => (FREE_GEMINI_MODELS as readonly string[]).includes(m);
const flag = (v: string | undefined) => v?.trim().toLowerCase() === "true";

function geminiModel(requested: string | undefined, fallback: string, warn: (m: string) => void): string {
  const m = requested?.trim();
  if (!m) return fallback;
  if (isFreeGemini(m)) return m;
  warn(`analyzer: ignoring non-free Gemini model "${m}"; using ${fallback}`);
  return fallback;
}

export function buildChain(env: Env, opts: { needsImage: boolean }, warn: (m: string) => void = console.error): ChainEntry[] {
  const wanted = (env.ANALYZER_PROVIDERS ?? "gemini")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const known = new Set(["gemini", "groq", "openrouter"]);
  for (const w of wanted) if (!known.has(w)) warn(`analyzer: ignoring unknown provider "${w}"`);

  const chain: ChainEntry[] = [];

  if (wanted.includes("gemini") && env.GEMINI_API_KEY) {
    const primary = geminiModel(env.GEMINI_MODEL_PRIMARY, DEFAULT_GEMINI_PRIMARY, warn);
    const fallback = geminiModel(env.GEMINI_MODEL_FALLBACK, DEFAULT_GEMINI_FALLBACK, warn);
    for (const model of primary === fallback ? [primary] : [primary, fallback]) {
      chain.push({ provider: "gemini", model, apiKey: env.GEMINI_API_KEY, supportsImages: true });
    }
  }

  if (wanted.includes("groq") && env.GROQ_API_KEY && env.GROQ_MODEL?.trim()) {
    chain.push({
      provider: "groq",
      model: env.GROQ_MODEL.trim(),
      apiKey: env.GROQ_API_KEY,
      baseUrl: GROQ_BASE_URL,
      supportsImages: flag(env.GROQ_SUPPORTS_IMAGES),
    });
  }

  if (wanted.includes("openrouter") && env.OPENROUTER_API_KEY && env.OPENROUTER_MODEL?.trim()) {
    const model = env.OPENROUTER_MODEL.trim();
    if (model.endsWith(":free")) {
      chain.push({
        provider: "openrouter",
        model,
        apiKey: env.OPENROUTER_API_KEY,
        baseUrl: OPENROUTER_BASE_URL,
        supportsImages: flag(env.OPENROUTER_SUPPORTS_IMAGES),
      });
    } else {
      warn(`analyzer: ignoring OpenRouter model "${model}" because it is not a ":free" model`);
    }
  }

  // A screenshot can only go to models that are known to read images.
  return opts.needsImage ? chain.filter((c) => c.supportsImages) : chain;
}
