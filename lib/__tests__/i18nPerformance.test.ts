import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { perfAr, perfEn, perfFr } from "@/lib/i18nPerformance";

const keys = (o: object) => Object.keys(o).sort();
describe("Performance Center translations", () => {
  it("English, French and Arabic have identical keys", () => {
    expect(keys(perfFr)).toEqual(keys(perfEn));
    expect(keys(perfAr)).toEqual(keys(perfEn));
  });
  it("no empty strings, and placeholders match across languages", () => {
    for (const [k, v] of Object.entries(perfEn)) {
      for (const d of [perfEn, perfFr, perfAr]) expect(d[k].trim(), k).not.toBe("");
      const ph = (s: string) => (s.match(/\{\w+\}/g) || []).sort().join();
      expect(ph(perfFr[k]), k).toBe(ph(v));
      expect(ph(perfAr[k]), k).toBe(ph(v));
    }
  });
  it("every key the UI uses exists", () => {
    const used = new Set<string>();
    for (const f of ["app/performance/page.tsx", ...["PerformanceView", "Filters", "MetricTiles", "EquityChart", "StreakCard", "GroupTable"].map((n) => `components/performance/${n}.tsx`)])
      for (const m of readFileSync(f, "utf8").matchAll(/\bt\(\s*["'`]perf\.(\w+)["'`]/g)) used.add(m[1]);
    for (const k of used) expect(perfEn[k], k).toBeDefined();
  });
  it("is wired into all three dictionaries and the nav", () => {
    const s = readFileSync("lib/i18n.tsx", "utf8");
    for (const n of ["perfEn", "perfAr", "perfFr"]) expect(s).toContain(`...${n}`);
    expect((s.match(/\n    performance: "/g) || []).length).toBe(3);
  });
});
