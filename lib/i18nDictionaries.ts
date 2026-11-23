// All three dictionaries loaded together. For tests and tooling only: app code must use useLanguage(), which loads one language at a time.
import { en } from "@/lib/i18n/en";
import { ar } from "@/lib/i18n/ar";
import { fr } from "@/lib/i18n/fr";
import type { Dict, Lang } from "@/lib/i18n/types";

export const dictionaries: Record<Lang, Dict> = { en, ar, fr };
