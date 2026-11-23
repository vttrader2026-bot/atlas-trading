// PERFORMANCE-v1: dictionary for the Performance Center. Spread into the `perf` block of lib/i18n.tsx.
// English, French and Arabic must keep identical keys and {placeholders} (lib/__tests__/i18nPerformance.test.ts).

// Re-exports the per-language files in lib/i18n/parts/, so each language can be downloaded on its own.
export { perfEn } from "@/lib/i18n/parts/performance.en";
export { perfFr } from "@/lib/i18n/parts/performance.fr";
export { perfAr } from "@/lib/i18n/parts/performance.ar";
