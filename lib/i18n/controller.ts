// The language state machine, free of React so it can be tested on its own.
// Rules: the old language stays on screen until the new dictionary has arrived; the latest request wins;
// a failed download changes nothing (and never erases the saved preference); an already-downloaded language switches instantly.
import type { Dict, Lang } from "./types";

export type LangState = { lang: Lang; dict: Dict };

export const LANG_ORDER: Lang[] = ["en", "ar", "fr"];
export const isLang = (v: unknown): v is Lang => v === "ar" || v === "en" || v === "fr";
export const dirFor = (lang: Lang): "rtl" | "ltr" => (lang === "ar" ? "rtl" : "ltr");

export type ControllerDeps = {
  storageGet: () => string | null;
  storageSet: (value: string) => void;
  load: (lang: Lang) => Promise<Dict>;
  peek: (lang: Lang) => Dict | undefined;
  apply: (state: LangState) => void;
  warn: (lang: Lang, err: unknown) => void;
};

export function createLanguageController(deps: ControllerDeps) {
  let request = 0;
  let current: Lang = "en";

  const commit = (lang: Lang, dict: Dict) => {
    current = lang;
    deps.apply({ lang, dict });
  };

  // Every action returns a promise that settles once the request has been applied, superseded or failed (never rejects),
  // so callers and tests can wait for the real outcome instead of guessing a delay.
  function go(lang: Lang): Promise<void> {
    const id = ++request;
    const ready = deps.peek(lang);
    if (ready) {
      commit(lang, ready);
      return Promise.resolve();
    }
    return deps.load(lang).then(
      (dict) => { if (id === request) commit(lang, dict); },
      (err) => deps.warn(lang, err),
    );
  }

  return {
    current: () => current,
    /** On startup: load the saved language (and only that one). Nothing is written, so a failed load keeps the preference. */
    restore(): Promise<void> {
      let stored: string | null = null;
      try { stored = deps.storageGet(); } catch { /* storage blocked: stay on English */ }
      return isLang(stored) && stored !== "en" ? go(stored) : Promise.resolve();
    },
    setLang(next: Lang): Promise<void> {
      if (!isLang(next)) return Promise.resolve();
      try { deps.storageSet(next); } catch { /* ignore */ }
      return go(next);
    },
    toggle(): Promise<void> {
      return this.setLang(LANG_ORDER[(LANG_ORDER.indexOf(current) + 1) % LANG_ORDER.length]);
    },
  };
}
