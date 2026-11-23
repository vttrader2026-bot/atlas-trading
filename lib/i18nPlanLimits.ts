// PHASE-3B: copy for Trade Plan limits and the Entered / Archived actions. {n} and {limit} are filled in by the page; the limit
// itself always comes from lib/entitlementConfig.ts through the server, never from this file.

// Re-exports the per-language files in lib/i18n/parts/, so each language can be downloaded on its own.
export { planLimitsEn } from "@/lib/i18n/parts/planLimits.en";
export { planLimitsFr } from "@/lib/i18n/parts/planLimits.fr";
export { planLimitsAr } from "@/lib/i18n/parts/planLimits.ar";
