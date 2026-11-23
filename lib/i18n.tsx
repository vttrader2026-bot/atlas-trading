"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getLoadedDict, loadDict, makeT, englishDict, preloadLanguages } from "@/lib/i18n/loader";
import { createLanguageController, type LangState } from "@/lib/i18n/controller";
import type { Lang } from "@/lib/i18n/types";

export type { Lang } from "@/lib/i18n/types";
export { preloadLanguages };

type LanguageContextValue = {
  lang: Lang;
  /** Cycles en → ar → fr → en. Kept for any existing callers. */
  toggleLang: () => void;
  /** Sets the language directly — used by the 3-way selector in Nav. The old language stays on screen until the new one is loaded. */
  setLang: (lang: Lang) => void;
  t: (path: string) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = "atlas-trading.lang";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Always start at "en" so the server-rendered HTML and the client's first render match exactly.
  // The language and its dictionary are one state object, so text, lang and dir always change together.
  const [state, setState] = useState<LangState>({ lang: "en", dict: englishDict });
  const [c] = useState(() =>
    createLanguageController({
      storageGet: () => window.localStorage.getItem(STORAGE_KEY),
      storageSet: (v) => window.localStorage.setItem(STORAGE_KEY, v),
      load: loadDict,
      peek: getLoadedDict,
      apply: setState,
      warn: (lang, err) => console.warn("language: could not load", lang, err), // safe fallback: the current language stays on screen
    }),
  );

  useEffect(() => {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === "ar" ? "rtl" : "ltr";
  }, [state.lang]);

  // Restore the saved language after mount (client-only). Only that language is downloaded.
  useEffect(() => { void c.restore(); }, [c]);

  const setLang = useCallback((next: Lang) => { void c.setLang(next); }, [c]);
  const toggleLang = useCallback(() => { void c.toggle(); }, [c]);
  const t = useMemo(() => makeT(state.dict, state.lang), [state]);
  const value = useMemo(() => ({ lang: state.lang, toggleLang, setLang, t }), [state.lang, toggleLang, setLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

/** Renders its children in a fixed language, independent of the site's language (used by the Social Media Studio canvas). */
export function LanguageOverride({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const parent = useLanguage();
  const [, bump] = useState(0);
  const dict = getLoadedDict(lang);
  useEffect(() => {
    if (getLoadedDict(lang)) return;
    let alive = true;
    loadDict(lang).then(() => { if (alive) bump((n) => n + 1); }).catch((err) => console.warn("language: could not load", lang, err));
    return () => { alive = false; };
  }, [lang]);
  const t = useMemo(() => (dict ? makeT(dict, lang) : parent.t), [dict, lang, parent.t]);
  const value = useMemo(() => ({ ...parent, lang, t }), [parent, lang, t]);
  // While the language is still downloading the content is hidden (never shown in the wrong language).
  return (
    <LanguageContext.Provider value={value}>
      {dict ? children : <div style={{ display: "contents", visibility: "hidden" }}>{children}</div>}
    </LanguageContext.Provider>
  );
}
