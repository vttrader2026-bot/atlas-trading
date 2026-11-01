import { describe, expect, it } from "vitest";
import { dictionaries } from "@/lib/i18n";
import { REASON_TEXT } from "@/lib/analyzerEngineApply";

type Dict = { [k: string]: string | Dict };
const flat = (d: Dict, prefix = ""): Record<string, string> =>
  Object.entries(d).reduce((acc, [k, v]) => (typeof v === "string" ? { ...acc, [`${prefix}${k}`]: v } : { ...acc, ...flat(v, `${prefix}${k}.`) }), {});

describe("analyzer translations", () => {
  const en = flat(dictionaries.en.analyzerV2 as Dict);
  const ar = flat(dictionaries.ar.analyzerV2 as Dict);
  const fr = flat(dictionaries.fr.analyzerV2 as Dict);

  it("EN, AR and FR have identical analyzerV2 keys, none empty", () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    for (const d of [en, ar, fr]) for (const v of Object.values(d)) expect(v.trim().length).toBeGreaterThan(0);
  });

  it("placeholders match across languages", () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of Object.keys(en)) {
      expect(ph(ar[k])).toBe(ph(en[k]));
      expect(ph(fr[k])).toBe(ph(en[k]));
    }
  });

  it("every engine reason code has a user-facing 'what needs to happen' text (or the generic fallback)", () => {
    for (const code of Object.keys(REASON_TEXT)) {
      const hasOwn = `need.${code}` in en;
      // plan-validation rejections intentionally share need.generic
      const planRejection = ["ENTRY_INVERTED", "ENTRY_NOT_IN_ZONE", "SL_NOT_BELOW_ZONE", "SL_BUFFER_TOO_SMALL", "TARGET_BELOW_ENTRY", "TARGETS_NOT_ORDERED", "RR_TOO_LOW", "RISK_TOO_WIDE"].includes(code);
      expect(hasOwn || planRejection).toBe(true);
    }
  });
});
