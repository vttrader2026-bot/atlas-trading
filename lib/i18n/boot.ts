// First-paint language handling (PERF-3). Pure and React-free so every rule can be tested on its own.
//
// Why: the pages are prerendered, CDN-cached English HTML (no cookies()/headers(), so they stay static). A visitor whose saved
// language is Arabic or French used to see English first, and Arabic also flipped from LTR to RTL after hydration.
// The tiny inline script below runs in <head>, before the first paint: it reads the saved language, sets <html lang dir>
// straight away, and marks the page "pending" so the CSS rule in globals.css keeps the body invisible (its layout space stays
// reserved, so nothing shifts) until the right dictionary has loaded. English visitors and visitors without a saved language
// never get the pending mark, so for them nothing changes.
import type { Lang } from "./types";

export const LANG_STORAGE_KEY = "atlas-trading.lang";
export const LANG_PENDING_ATTR = "data-lang-pending";
/** If the language is still not ready after this long the page is shown in English rather than staying invisible. */
export const LANG_BOOT_FAILSAFE_MS = 4000;

export const dirOf = (lang: Lang): "rtl" | "ltr" => (lang === "ar" ? "rtl" : "ltr");

/** The inline script (plain ES5, no dependencies). Never throws: blocked storage or an invalid value simply does nothing. */
export const LANG_BOOT_SCRIPT =
  `(function(){var d=document.documentElement,l;try{l=window.localStorage.getItem(${JSON.stringify(LANG_STORAGE_KEY)})}catch(e){return}` +
  `if(l!=="ar"&&l!=="fr")return;d.lang=l;d.dir=l==="ar"?"rtl":"ltr";d.setAttribute(${JSON.stringify(LANG_PENDING_ATTR)},l);` +
  `setTimeout(function(){if(!d.hasAttribute(${JSON.stringify(LANG_PENDING_ATTR)}))return;d.removeAttribute(${JSON.stringify(LANG_PENDING_ATTR)});d.lang="en";d.dir="ltr"},${LANG_BOOT_FAILSAFE_MS})})();`;

export type DocLike = {
  lang: string;
  dir: string;
  hasAttribute(name: string): boolean;
  removeAttribute(name: string): void;
};

/**
 * Keeps <html lang dir> in step with the language on screen and ends the pending state.
 * While a saved Arabic/French language is still loading the provider is still on its initial English state:
 * that must not undo what the boot script set, unless the user has chosen a language since (then their choice wins).
 */
export function syncDocumentLang(doc: DocLike, lang: Lang, userChose: boolean): void {
  if (lang === "en" && doc.hasAttribute(LANG_PENDING_ATTR) && !userChose) return;
  doc.lang = lang;
  doc.dir = dirOf(lang);
  doc.removeAttribute(LANG_PENDING_ATTR);
}

/** A download failed: if the page is still pending, show the language that is actually on screen so it is never left blank. */
export function settleLangPending(doc: DocLike, shown: Lang): void {
  if (!doc.hasAttribute(LANG_PENDING_ATTR)) return;
  doc.lang = shown;
  doc.dir = dirOf(shown);
  doc.removeAttribute(LANG_PENDING_ATTR);
}
