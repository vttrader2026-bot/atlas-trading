import { describe, it, expect } from "vitest";
import { dictionaries } from "@/lib/i18n";

type Dict = Record<string, unknown>;
const faq = (l: "en" | "ar" | "fr") => (dictionaries[l].home as { faq: Dict }).faq;

describe("home FAQ i18n", () => {
  it("EN, AR and FR have a heading and four non-empty Q&A pairs", () => {
    for (const l of ["en", "ar", "fr"] as const) {
      const f = faq(l);
      expect(Object.keys(f).sort()).toEqual(["a1", "a2", "a3", "a4", "heading", "q1", "q2", "q3", "q4"]);
      for (const v of Object.values(f)) expect(typeof v === "string" && v.trim().length > 0).toBe(true);
    }
  });
  it("answers stay consistent with the product: 3 free analyses/day, Elite 20/day", () => {
    for (const l of ["en", "ar", "fr"] as const) {
      expect(String(faq(l).a2)).toMatch(/\b3\b/);
      expect(String(faq(l).a4)).toMatch(/\b3\b/);
      expect(String(faq(l).a4)).toMatch(/\b20\b/);
    }
  });
});
