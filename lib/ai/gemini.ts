import type { Adapter } from "./types";

// The key goes in a header, never in the URL, so it cannot end up in logs or error text.
export const callGemini: Adapter = async (entry, req, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const parts: Record<string, unknown>[] = [{ text: req.prompt }];
    if (req.image) parts.push({ inline_data: { mime_type: req.image.mime, data: req.image.base64 } });
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${entry.model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": entry.apiKey },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json" } }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`Gemini ${entry.model} error (${res.status}):`, (await res.text()).slice(0, 300));
      return { ok: false, kind: "unavailable", status: res.status };
    }
    const data = await res.json();
    // Newer models may return several parts (e.g. a thinking part first): use only the visible answer text.
    const answerParts: { text?: unknown; thought?: unknown }[] = data?.candidates?.[0]?.content?.parts ?? [];
    const text = answerParts
      .filter((x) => x && x.thought !== true && typeof x.text === "string")
      .map((x) => x.text as string)
      .join("");
    return text.trim() ? { ok: true, text } : { ok: false, kind: "empty" };
  } catch (err) {
    const abort = err instanceof Error && err.name === "AbortError";
    console.error(abort ? `Gemini ${entry.model} timed out` : `Gemini ${entry.model} request failed`);
    return { ok: false, kind: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
};
