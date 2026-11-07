// AI-PROVIDERS-v1: free-only provider chain. No network: fetch is stubbed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { buildChain, DEFAULT_GEMINI_FALLBACK, DEFAULT_GEMINI_PRIMARY } from "@/lib/ai/config";
import { parseAnalysisJson, runAnalysis } from "@/lib/ai";

const quiet = () => {};
const GOOD = JSON.stringify({ marketStructure: { state: "Bullish" }, tradePlan: { direction: "Wait" } });
const geminiOk = (text = GOOD) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
const compatOk = (text = GOOD) => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 });

describe("chain configuration is free-only", () => {
  it("defaults to Gemini Flash then Flash-Lite and nothing else", () => {
    const c = buildChain({ GEMINI_API_KEY: "k", GROQ_API_KEY: "g", GROQ_MODEL: "m", OPENROUTER_API_KEY: "o", OPENROUTER_MODEL: "x:free" }, { needsImage: true }, quiet);
    expect(c.map((e) => e.model)).toEqual([DEFAULT_GEMINI_PRIMARY, DEFAULT_GEMINI_FALLBACK]);
    expect(c.every((e) => e.provider === "gemini")).toBe(true);
  });
  it("ignores a non-free or unknown Gemini model set through env", () => {
    const warn = vi.fn();
    const c = buildChain({ GEMINI_API_KEY: "k", GEMINI_MODEL_PRIMARY: "gemini-2.5-pro", GEMINI_MODEL_FALLBACK: "gemini-flash-latest" }, { needsImage: false }, warn);
    expect(c.map((e) => e.model)).toEqual([DEFAULT_GEMINI_PRIMARY, DEFAULT_GEMINI_FALLBACK]);
    expect(warn).toHaveBeenCalled();
  });
  it("never creates an OpenAI (or any unknown) provider", () => {
    const warn = vi.fn();
    const c = buildChain({ ANALYZER_PROVIDERS: "openai,gemini", OPENAI_API_KEY: "sk", GEMINI_API_KEY: "k" }, { needsImage: false }, warn);
    expect(c.every((e) => e.provider === "gemini")).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("openai"));
  });
  it("Groq and OpenRouter need to be listed, keyed and given a model explicitly", () => {
    const env = { ANALYZER_PROVIDERS: "gemini,groq,openrouter", GEMINI_API_KEY: "k", GROQ_API_KEY: "g", OPENROUTER_API_KEY: "o" };
    expect(buildChain(env, { needsImage: false }, quiet).map((e) => e.provider)).toEqual(["gemini", "gemini"]);
    const full = { ...env, GROQ_MODEL: "some/model", OPENROUTER_MODEL: "vendor/model:free" };
    expect(buildChain(full, { needsImage: false }, quiet).map((e) => e.provider)).toEqual(["gemini", "gemini", "groq", "openrouter"]);
  });
  it("OpenRouter models that are not ':free' are rejected", () => {
    const c = buildChain({ ANALYZER_PROVIDERS: "openrouter", OPENROUTER_API_KEY: "o", OPENROUTER_MODEL: "vendor/paid-model" }, { needsImage: false }, quiet);
    expect(c).toEqual([]);
  });
  it("screenshots only go to providers marked as image-capable", () => {
    const env = { ANALYZER_PROVIDERS: "groq,openrouter", GROQ_API_KEY: "g", GROQ_MODEL: "m", OPENROUTER_API_KEY: "o", OPENROUTER_MODEL: "v/m:free" };
    expect(buildChain(env, { needsImage: true }, quiet)).toEqual([]);
    expect(buildChain({ ...env, GROQ_SUPPORTS_IMAGES: "true" }, { needsImage: true }, quiet).map((e) => e.provider)).toEqual(["groq"]);
    expect(buildChain(env, { needsImage: false }, quiet)).toHaveLength(2);
  });
  it("no Gemini key means no chain", () => {
    expect(buildChain({}, { needsImage: false }, quiet)).toEqual([]);
  });
});

describe("source never references a paid provider", () => {
  it("lib/ai and both routes contain no OpenAI endpoint or key", () => {
    const files = [...readdirSync("lib/ai").map((f) => `lib/ai/${f}`), "app/api/analyze/route.ts", "app/api/analyze-chart/route.ts"];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/api\.openai\.com|OPENAI_API_KEY/);
    }
  });
});

describe("runAnalysis fallback behaviour", () => {
  const env = { GEMINI_API_KEY: "KEY", ANALYZER_PROVIDERS: "gemini,groq", GROQ_API_KEY: "g", GROQ_MODEL: "free/model", GROQ_SUPPORTS_IMAGES: "true" };
  const urls: string[] = [];
  beforeEach(() => {
    urls.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllGlobals());
  const stub = (fn: (url: string, init: RequestInit) => Response | Promise<Response>) =>
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      urls.push(url);
      return fn(url, init);
    });

  it("uses Gemini Flash first and keeps the key out of the URL", async () => {
    let header = "";
    stub((_u, init) => {
      header = (init.headers as Record<string, string>)["x-goog-api-key"];
      return geminiOk();
    });
    const r = await runAnalysis({ prompt: "p" }, env);
    expect(r.ok && r.model).toBe(DEFAULT_GEMINI_PRIMARY);
    expect(urls).toHaveLength(1);
    expect(urls[0]).not.toContain("KEY");
    expect(header).toBe("KEY");
  });
  it("falls back to Flash-Lite when Flash is out of quota", async () => {
    stub((u) => (u.includes(`${DEFAULT_GEMINI_PRIMARY}:`) ? new Response("quota", { status: 429 }) : geminiOk()));
    const r = await runAnalysis({ prompt: "p" }, env);
    expect(r.ok && r.model).toBe(DEFAULT_GEMINI_FALLBACK);
  });
  it("then falls back to the optional free provider, sending the image in the OpenAI-compatible format", async () => {
    let body = "";
    stub((u, init) => {
      if (u.includes("groq.com")) {
        body = String(init.body);
        return compatOk("```json\n" + GOOD + "\n```");
      }
      return new Response("busy", { status: 503 });
    });
    const r = await runAnalysis({ prompt: "p", image: { mime: "image/png", base64: "AAAA" } }, env);
    expect(r.ok && r.provider).toBe("groq");
    expect(body).toContain("data:image/png;base64,AAAA");
    expect(urls.some((u) => u.includes("openai.com"))).toBe(false);
  });
  it("when every free provider fails, returns 'unavailable' (never calls anything else)", async () => {
    stub(() => new Response("busy", { status: 503 }));
    const r = await runAnalysis({ prompt: "p" }, env);
    expect(r).toEqual({ ok: false, kind: "unavailable" });
    expect(urls).toHaveLength(3); // Flash, Flash-Lite, Groq
    expect(urls.every((u) => /googleapis\.com|groq\.com/.test(u))).toBe(true);
  });
  it("unusable JSON from one provider moves on to the next", async () => {
    stub((u) => (u.includes(`${DEFAULT_GEMINI_PRIMARY}:`) ? geminiOk("not json") : geminiOk()));
    const r = await runAnalysis({ prompt: "p" }, env);
    expect(r.ok && r.model).toBe(DEFAULT_GEMINI_FALLBACK);
  });
  it("reports 'invalid' / 'empty' when only unusable answers came back", async () => {
    stub(() => geminiOk("[1,2]"));
    expect(await runAnalysis({ prompt: "p" }, env)).toEqual({ ok: false, kind: "invalid" });
    stub(() => new Response(JSON.stringify({ candidates: [] }), { status: 200 }));
    expect(await runAnalysis({ prompt: "p" }, { GEMINI_API_KEY: "k" })).toEqual({ ok: false, kind: "empty" });
  });
  it("stops trying once the total time budget is spent", async () => {
    stub(() => new Response("busy", { status: 503 }));
    let t = 0;
    const r = await runAnalysis({ prompt: "p" }, env, () => (t += 12_000));
    expect(r.ok).toBe(false);
    expect(urls.length).toBeLessThan(3);
  });
  it("does nothing without a configured provider", async () => {
    stub(() => geminiOk());
    expect(await runAnalysis({ prompt: "p" }, {})).toEqual({ ok: false, kind: "unavailable" });
    expect(urls).toHaveLength(0);
  });
});

describe("parseAnalysisJson", () => {
  it("accepts bare or fenced JSON with the required shape and rejects everything else", () => {
    expect(parseAnalysisJson(GOOD)).not.toBeNull();
    expect(parseAnalysisJson("```json\n" + GOOD + "\n```")).not.toBeNull();
    expect(parseAnalysisJson("{}")).toBeNull();
    expect(parseAnalysisJson("nope")).toBeNull();
    expect(parseAnalysisJson("null")).toBeNull();
  });
});
