// Extra dictionary entries for the upgraded Journal and Trade Plan. They are spread into the existing
// `journal` and `tradePlan` blocks of lib/i18n.tsx (new entries win over same-named legacy ones).
// English, French and Arabic must keep identical keys (enforced by lib/__tests__/i18nJournal.test.ts).

// Re-exports the per-language files in lib/i18n/parts/, so each language can be downloaded on its own.
export { journalEn, planEn } from "@/lib/i18n/parts/journal.en";
export { journalFr, planFr } from "@/lib/i18n/parts/journal.fr";
export { journalAr, planAr } from "@/lib/i18n/parts/journal.ar";
