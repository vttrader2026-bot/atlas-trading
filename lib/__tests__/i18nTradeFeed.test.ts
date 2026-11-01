import { describe, it, expect } from "vitest";
import { dictionaries } from "@/lib/i18n";

type Dict = Record<string, unknown>;

describe("tradeFeed i18n parity", () => {
  const en = dictionaries.en.tradeFeed as Dict;
  const ar = dictionaries.ar.tradeFeed as Dict;
  const fr = dictionaries.fr.tradeFeed as Dict;
  it("EN, AR and FR define the same keys", () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  });
  it("every value is a non-empty string", () => {
    for (const d of [en, ar, fr]) for (const v of Object.values(d)) expect(typeof v === "string" && v.length > 0).toBe(true);
  });
});
