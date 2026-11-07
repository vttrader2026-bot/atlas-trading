// AI-PROVIDERS-v1: provider-neutral contract for the Analyzer. Routes never talk to a vendor directly.
export type AnalysisImage = { mime: string; base64: string };

export type AnalysisRequest = {
  prompt: string;
  image?: AnalysisImage;
};

export type AdapterResult = { ok: true; text: string } | { ok: false; kind: "unavailable" | "empty"; status?: number };

/** One concrete model on one provider. Every entry in a chain is free-tier by construction (see config.ts). */
export type ChainEntry = {
  provider: "gemini" | "groq" | "openrouter";
  model: string;
  apiKey: string;
  /** OpenAI-compatible base URL (Groq / OpenRouter only). */
  baseUrl?: string;
  supportsImages: boolean;
};

export type Adapter = (entry: ChainEntry, req: AnalysisRequest, timeoutMs: number) => Promise<AdapterResult>;

export type RunResult =
  | { ok: true; parsed: Record<string, unknown>; provider: ChainEntry["provider"]; model: string }
  /** unavailable = every free provider failed or is out of quota; empty/invalid = answers came back but were unusable. */
  | { ok: false; kind: "unavailable" | "empty" | "invalid" };
