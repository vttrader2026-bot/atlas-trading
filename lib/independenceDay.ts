// TEMPORARY: Mauritania's 66th Independence Day (28 November 2026), shown 24-30 November 2026. Everything about it lives in this file and
// components/IndependenceDay.tsx; to remove the feature see the README (delete both files, the test, and two lines in app/layout.tsx).
//
// Mauritania uses GMT/UTC all year (no daylight saving), so "Mauritania's local date" is simply the UTC date.
// The note is shown from 24 Nov 00:00 UTC up to (not including) 1 Dec 00:00 UTC (i.e. 24 through 30 November inclusive),
// judged by the visitor's device clock at page load.
// The check runs in a tiny inline script before the first paint, so the prerendered, CDN-cached HTML stays static, nothing shifts
// when it appears, and it switches itself off on 1 December with no redeploy.

export const IDAY_START_MS = Date.UTC(2026, 10, 24); // 24 Nov 2026 00:00 UTC
export const IDAY_END_MS = Date.UTC(2026, 11, 1); // 1 Dec 2026 00:00 UTC (exclusive)

export const IDAY_ATTR = "data-mr-day";

export const isIndependenceWindow = (nowMs: number): boolean => nowMs >= IDAY_START_MS && nowMs < IDAY_END_MS;

/** Inline script (plain ES5): marks <html> only inside the window. Never throws. */
export const IDAY_SCRIPT =
  `(function(){try{var n=Date.now();if(n>=${IDAY_START_MS}&&n<${IDAY_END_MS})document.documentElement.setAttribute("${IDAY_ATTR}","1")}catch(e){}})();`;

export const IDAY_TEXT = {
  en: "Celebrating 66 years of Mauritanian independence. Happy Independence Day!",
  ar: "بمناسبة الذكرى الـ66 لعيد الاستقلال الوطني، كل عام وموريتانيا وشعبها بخير.",
  fr: "À l'occasion du 66e anniversaire de l'indépendance de la Mauritanie. Bonne fête de l'Indépendance !",
} as const;

/**
 * Hidden unless the script marked the page; the language shown follows <html lang>, which the app already keeps in step with the
 * selected language (so switching language swaps the text instantly, with no JavaScript of its own).
 */
export const IDAY_CSS =
  `.mr-day{display:none;border-top:2px solid rgba(0,140,75,.55)}` +
  `html[${IDAY_ATTR}] .mr-day{display:block}` +
  `.mr-day [data-l]{display:none}` +
  `html:not([lang="ar"]):not([lang="fr"]) .mr-day [data-l="en"],html[lang="ar"] .mr-day [data-l="ar"],html[lang="fr"] .mr-day [data-l="fr"]{display:inline}`;
