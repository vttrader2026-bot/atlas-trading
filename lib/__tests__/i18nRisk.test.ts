import { describe, it, expect } from "vitest";
import { dictionaries } from "@/lib/i18n";

type Dict = Record<string, unknown>;
const risk = (l: "en" | "ar" | "fr") => dictionaries[l].risk as Dict;

describe("risk calculator i18n", () => {
  it("EN, AR and FR define the same keys, all non-empty strings", () => {
    const en = Object.keys(risk("en")).sort();
    expect(Object.keys(risk("ar")).sort()).toEqual(en);
    expect(Object.keys(risk("fr")).sort()).toEqual(en);
    for (const l of ["en", "ar", "fr"] as const) for (const v of Object.values(risk(l))) expect(typeof v === "string" && v.trim().length > 0).toBe(true);
  });
  it("keeps the keys other pages reuse (Trade Plan, Journal, Trade Feed)", () => {
    for (const k of ["balance", "riskPct", "risking", "positionSize", "units", "notional", "rewardRisk", "addTarget", "long", "short"]) expect(risk("en")).toHaveProperty(k);
  });
  it("explains fees, slippage and execution in every language", () => {
    expect(String(risk("en").disclaimer)).toMatch(/fees.*slippage.*execution/i);
    expect(String(risk("fr").disclaimer)).toMatch(/frais.*slippage/i);
    expect(String(risk("ar").disclaimer)).toMatch(/رسوم.*الانزلاق/);
  });
});
