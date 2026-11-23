// Loads translation dictionaries one language at a time.
// English is bundled (the server-rendered HTML is English, and it is the fallback for any missing key).
// Arabic and French are separate chunks, downloaded only when that language is saved or selected.
import { en } from "./en";
import type { Dict, Lang } from "./types";

const cache: Partial<Record<Lang, Dict>> = { en };
const inflight: Partial<Record<Lang, Promise<Dict>>> = {};

export const englishDict: Dict = en;

/** The dictionary if it is already in memory, otherwise undefined. */
export function getLoadedDict(lang: Lang): Dict | undefined {
  return cache[lang];
}

/** Puts a dictionary in memory without downloading it (tests, and tooling that already has all three). */
export function registerDict(lang: Lang, dict: Dict): void {
  cache[lang] = dict;
}

const importers: Record<Exclude<Lang, "en">, () => Promise<Dict>> = {
  ar: () => import("./ar").then((m) => m.default),
  fr: () => import("./fr").then((m) => m.default),
};

/** Resolves with the dictionary. A failed download is not cached, so the next call retries. */
export function loadDict(lang: Lang): Promise<Dict> {
  const hit = cache[lang];
  if (hit) return Promise.resolve(hit);
  const pending = inflight[lang];
  if (pending) return pending;
  const p = importers[lang as Exclude<Lang, "en">]()
    .then((d) => {
      cache[lang] = d;
      return d;
    })
    .finally(() => {
      delete inflight[lang];
    });
  inflight[lang] = p;
  return p;
}

/** Starts downloading every language that is not in memory yet. Errors are ignored: the switch itself retries. */
export function preloadLanguages(): void {
  for (const l of ["ar", "fr"] as const) if (!cache[l]) loadDict(l).catch(() => {});
}

/** Finds a string by dotted path. Undefined when the key is missing or points at a group instead of text. */
export function lookup(dict: Dict, path: string): string | undefined {
  let node: string | Dict = dict;
  for (const part of path.split(".")) {
    if (typeof node === "string") return undefined;
    const next: string | Dict | undefined = node[part];
    if (next === undefined) return undefined;
    node = next;
  }
  return typeof node === "string" ? node : undefined;
}

/** Translator for one language: its own text, then English, then the key itself (the old behaviour for a missing key). */
export function makeT(dict: Dict, lang: Lang): (path: string) => string {
  return (path) => lookup(dict, path) ?? (lang !== "en" ? lookup(englishDict, path) : undefined) ?? path;
}
