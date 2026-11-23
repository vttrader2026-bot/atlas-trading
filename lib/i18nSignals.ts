// Dictionary entries for the connected Trade Feed -> Trade Plan -> Journal workflow.
// Spread into the `tradeFeed`, `journal` and `tradePlan` blocks of lib/i18n.tsx.
// English, French and Arabic must keep identical keys (lib/__tests__/i18nJournal.test.ts).

// Re-exports the per-language files in lib/i18n/parts/, so each language can be downloaded on its own.
export { feedEn, sigJournalEn, sigPlanEn } from "@/lib/i18n/parts/signals.en";
export { feedFr, sigJournalFr, sigPlanFr } from "@/lib/i18n/parts/signals.fr";
export { feedAr, sigJournalAr, sigPlanAr } from "@/lib/i18n/parts/signals.ar";
