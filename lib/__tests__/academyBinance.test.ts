import { describe, it, expect } from "vitest";
import { BINANCE_RESOURCE as R } from "@/lib/binanceResource";
import { lessons } from "@/lib/academy-content";

describe("Getting Started with Binance resource card", () => {
  it("keeps the exact referral link and code", () => {
    expect(R.href).toBe("https://www.binance.com/register?ref=760440372");
    expect(R.code).toBe("760440372");
    expect(new URL(R.href).searchParams.get("ref")).toBe(R.code);
  });
  it("is fully localized and promises no returns", () => {
    for (const k of ["en", "ar", "fr"] as const) {
      for (const f of ["title", "eyebrow", "intro", "registration", "security", "registrationLabel", "securityLabel"] as const) {
        expect(R[f][k].length).toBeGreaterThan(0);
      }
    }
    expect(`${R.intro.en} ${R.registration.en} ${R.security.en}`).not.toMatch(/guarantee|profit|earn/i);
  });
  it("is a standalone resource, not one of the lessons", () => {
    expect(lessons.some((l) => /binance/i.test(l.slug))).toBe(false);
  });
});
