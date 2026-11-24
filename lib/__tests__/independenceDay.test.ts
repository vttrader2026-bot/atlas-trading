import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { IDAY_ATTR, IDAY_CSS, IDAY_END_MS, IDAY_SCRIPT, IDAY_START_MS, IDAY_TEXT, isIndependenceWindow } from "@/lib/independenceDay";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Runs the real inline script on a fake page whose clock says `iso`. Returns whether the page got marked. */
function marked(iso: string): boolean {
  const attrs = new Map<string, string>();
  const doc = { documentElement: { setAttribute: (k: string, v: string) => void attrs.set(k, v) } };
  const RealDate = Date;
  const fixed = new RealDate(iso).getTime();
  class FakeDate extends RealDate { static now() { return fixed; } }
  vm.runInNewContext(IDAY_SCRIPT, { document: doc, Date: FakeDate });
  return attrs.has(IDAY_ATTR);
}

describe("Independence Day window (UTC = Mauritania local time)", () => {
  it("starts at 28 Nov 2026 00:00 UTC and ends before 29 Nov 2026 00:00 UTC", () => {
    expect(IDAY_START_MS).toBe(Date.parse("2026-11-28T00:00:00Z"));
    expect(IDAY_END_MS).toBe(Date.parse("2026-11-29T00:00:00Z"));
  });
  it("the inline script shows it on 28 November and not before or after", () => {
    expect(marked("2026-11-27T23:59:59.999Z")).toBe(false);
    expect(marked("2026-11-28T00:00:00.000Z")).toBe(true);
    expect(marked("2026-11-28T12:00:00Z")).toBe(true);
    expect(marked("2026-11-28T23:59:59.999Z")).toBe(true);
    expect(marked("2026-11-29T00:00:00.000Z")).toBe(false); // disappears on 29 November by itself
    expect(marked("2026-11-30T09:00:00Z")).toBe(false);
    expect(marked("2027-11-28T12:00:00Z")).toBe(false); // does not come back next year
    expect(marked("2026-01-01T00:00:00Z")).toBe(false);
  });
  it("script and helper agree, and the script is tiny plain ES5 that cannot throw", () => {
    for (const t of [IDAY_START_MS - 1, IDAY_START_MS, IDAY_END_MS - 1, IDAY_END_MS]) {
      expect(marked(new Date(t).toISOString())).toBe(isIndependenceWindow(t));
    }
    expect(IDAY_SCRIPT.length).toBeLessThan(300);
    expect(IDAY_SCRIPT).not.toMatch(/=>|`|\blet\b|\bconst\b/);
    expect(IDAY_SCRIPT).toContain("try{");
    const broken = { documentElement: { setAttribute: () => { throw new Error("x"); } } };
    expect(() => vm.runInNewContext(IDAY_SCRIPT, { document: broken, Date })).not.toThrow();
  });
});

describe("text and language switching", () => {
  it("uses the exact wording requested (English, Arabic) plus a French version", () => {
    expect(IDAY_TEXT.en).toBe("Celebrating 66 years of Mauritanian independence. Happy Independence Day!");
    expect(IDAY_TEXT.ar).toBe("بمناسبة الذكرى الـ66 لعيد الاستقلال الوطني، كل عام وموريتانيا وشعبها بخير.");
    expect(IDAY_TEXT.fr).toContain("66e anniversaire");
    expect(IDAY_TEXT.fr).toContain("Mauritanie");
  });
  it("hidden by default; shown only when the page is marked; one language at a time following <html lang>", () => {
    expect(IDAY_CSS).toContain(".mr-day{display:none");
    expect(IDAY_CSS).toContain(`html[${IDAY_ATTR}] .mr-day{display:block}`);
    expect(IDAY_CSS).toContain(".mr-day [data-l]{display:none}");
    expect(IDAY_CSS).toContain('html[lang="ar"] .mr-day [data-l="ar"]');
    expect(IDAY_CSS).toContain('html[lang="fr"] .mr-day [data-l="fr"]');
    expect(IDAY_CSS).toContain('html:not([lang="ar"]):not([lang="fr"]) .mr-day [data-l="en"]'); // English is the default/fallback
  });
});

describe("component", () => {
  const src = read("components/IndependenceDay.tsx");
  it("is a plain server component: no client JS, no hooks, no cookies/headers (the page stays static)", () => {
    expect(src).not.toMatch(/use client/);
    expect(src).not.toMatch(/\buse(State|Effect|Language|Memo)\b/);
    expect(src).not.toMatch(/next\/headers|cookies\(|headers\(/);
  });
  it("renders all three languages, the flag and the note role; Arabic is marked rtl", () => {
    expect(src).toContain('data-l="en"');
    expect(src).toContain('data-l="ar"');
    expect(src).toContain('data-l="fr"');
    expect(src).toMatch(/data-l="ar"[^>]*dir="rtl"/);
    expect(src).toContain("<svg");
    expect(src).toContain('role="note"');
    expect(src).not.toMatch(/animate|transition|fixed|modal|popup/i);
  });
});
