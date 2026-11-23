import { readFileSync } from "node:fs";

/** Source of the translation system. The dictionaries used to live in lib/i18n.tsx; they are now one file per language. */
export const i18nSource = (): string =>
  ["lib/i18n.tsx", "lib/i18n/boot.ts", "lib/i18n/en.ts", "lib/i18n/ar.ts", "lib/i18n/fr.ts"].map((p) => readFileSync(p, "utf8")).join("\n");

/** Source of one translation group (e.g. "investor", "signals"), which now lives in three per-language files under lib/i18n/parts/. */
export const i18nPartSource = (base: string): string =>
  ["en", "fr", "ar"].map((l) => readFileSync(`lib/i18n/parts/${base}.${l}.ts`, "utf8")).join("\n");
