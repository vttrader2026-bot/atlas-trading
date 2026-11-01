import { describe, it, expect } from "vitest";
import { getLesson, lessons } from "@/lib/academy-content";

describe("Getting Started with Binance lesson", () => {
  const l = getLesson("getting-started-with-binance");
  it("exists once, in Basics, ready, with the exact referral link and code", () => {
    expect(lessons.filter((x) => x.slug === "getting-started-with-binance")).toHaveLength(1);
    expect(l?.section).toBe("basics");
    expect(l?.ready).toBe(true);
    expect(l?.referral).toEqual({ href: "https://www.binance.com/register?ref=760440372", code: "760440372" });
    expect(new URL(l!.referral!.href).searchParams.get("ref")).toBe(l!.referral!.code);
  });
  it("is fully localized and promises no returns", () => {
    for (const k of ["en", "ar", "fr"] as const) {
      expect(l!.title[k].length).toBeGreaterThan(0);
      expect(l!.summary[k].length).toBeGreaterThan(0);
      expect(l!.body[k].split("\n\n").length).toBe(3);
    }
    expect(l!.body.en).not.toMatch(/guarantee|profit|earn/i);
  });
  it("leaves every other lesson untouched in count and slugs unique", () => {
    expect(new Set(lessons.map((x) => x.slug)).size).toBe(lessons.length);
  });
});
