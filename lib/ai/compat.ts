import type { Adapter } from "./types";

// OpenAI-compatible chat completions, used ONLY for the optional free Groq / OpenRouter entries
// (the base URL comes from config.ts; no paid provider is ever configured).
export const callCompat: Adapter = async (entry, req, timeoutMs) => {
  if (!entry.baseUrl) return { ok: false, kind: "unavailable" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const content: Record<string, unknown>[] = [{ type: "text", text: req.prompt }];
    if (req.image) content.push({ type: "image_url", image_url: { url: `data:${req.image.mime};base64,${req.image.base64}` } });
    const res = await fetch(`${entry.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${entry.apiKey}` },
      body: JSON.stringify({ model: entry.model, messages: [{ role: "user", content }], response_format: { type: "json_object" } }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`${entry.provider} ${entry.model} error (${res.status}):`, (await res.text()).slice(0, 300));
      return { ok: false, kind: "unavailable", status: res.status };
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" && text.trim() ? { ok: true, text } : { ok: false, kind: "empty" };
  } catch (err) {
    const abort = err instanceof Error && err.name === "AbortError";
    console.error(abort ? `${entry.provider} timed out` : `${entry.provider} request failed`);
    return { ok: false, kind: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
};
