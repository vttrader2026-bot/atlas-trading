import { describe, expect, it } from "vitest";
import { journalAr, journalEn, journalFr, planAr, planEn, planFr } from "@/lib/i18nJournal";
import { feedAr, feedEn, feedFr, sigJournalAr, sigJournalEn, sigJournalFr, sigPlanAr, sigPlanEn, sigPlanFr } from "@/lib/i18nSignals";
import { CSV_COLUMNS } from "@/lib/journal";

const keys = (o: object) => Object.keys(o).sort();
describe("Journal / Trade Plan translations", () => {
  it("English, French and Arabic have identical keys", () => {
    expect(keys(journalFr)).toEqual(keys(journalEn));
    expect(keys(journalAr)).toEqual(keys(journalEn));
    expect(keys(planFr)).toEqual(keys(planEn));
    expect(keys(planAr)).toEqual(keys(planEn));
    for (const [en, fr, ar] of [[feedEn, feedFr, feedAr], [sigJournalEn, sigJournalFr, sigJournalAr], [sigPlanEn, sigPlanFr, sigPlanAr]]) {
      expect(keys(fr)).toEqual(keys(en));
      expect(keys(ar)).toEqual(keys(en));
    }
  });
  it("no empty strings", () => {
    for (const d of [journalEn, journalFr, journalAr, planEn, planFr, planAr, feedEn, feedFr, feedAr, sigJournalEn, sigJournalFr, sigJournalAr, sigPlanEn, sigPlanFr, sigPlanAr]) for (const v of Object.values(d)) expect(v.trim()).not.toBe("");
  });
  it("CSV has a column per exported field", () => expect(CSV_COLUMNS.length).toBeGreaterThanOrEqual(24));
});
