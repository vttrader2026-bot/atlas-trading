import { describe, expect, it } from "vitest";
import { journalAr, journalEn, journalFr, planAr, planEn, planFr } from "@/lib/i18nJournal";
import { CSV_COLUMNS } from "@/lib/journal";

const keys = (o: object) => Object.keys(o).sort();
describe("Journal / Trade Plan translations", () => {
  it("English, French and Arabic have identical keys", () => {
    expect(keys(journalFr)).toEqual(keys(journalEn));
    expect(keys(journalAr)).toEqual(keys(journalEn));
    expect(keys(planFr)).toEqual(keys(planEn));
    expect(keys(planAr)).toEqual(keys(planEn));
  });
  it("no empty strings", () => {
    for (const d of [journalEn, journalFr, journalAr, planEn, planFr, planAr]) for (const v of Object.values(d)) expect(v.trim()).not.toBe("");
  });
  it("CSV has a column per exported field", () => expect(CSV_COLUMNS.length).toBeGreaterThanOrEqual(24));
});
