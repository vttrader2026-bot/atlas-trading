import { describe, it, expect } from "vitest";
import { closeSignal, type PublishedTrade } from "@/lib/tradeFeed";
import { eliteRecords, monthlyReport, openEliteCount, resultPct, summarize } from "@/lib/eliteRecord";

const base = (id: string, over: Partial<PublishedTrade> = {}): PublishedTrade => ({
  id, createdAt: Date.UTC(2026, 9, 1), pair: "SOL/USDT", direction: "Long", timeframe: "4h",
  entryZone: "100 - 102", invalidation: "96", tp1: "106", tp2: "110", tp3: "115", reasoning: "secret", tier: "elite", status: "open", hitLevels: [], ...over,
});
const closed = (id: string, outcome: "TP1" | "TP2" | "TP3" | "SL" | "CANCELLED", at: number, over: Partial<PublishedTrade> = {}) =>
  closeSignal(base(id, over), outcome, "r", at);

describe("Elite track record", () => {
  const oct = Date.UTC(2026, 9, 10), nov = Date.UTC(2026, 10, 5);
  const stored = [
    closed("a", "TP2", oct), closed("b", "SL", oct + 1000), closed("c", "CANCELLED", oct + 2000),
    closed("d", "TP1", nov), base("open1"), base("free1", { tier: "free", status: "closed" }),
  ];

  it("only includes closed, verified Elite signals; open and free are excluded", () => {
    const r = eliteRecords(stored);
    expect(r.map((x) => x.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(openEliteCount(stored)).toBe(1);
    expect(JSON.stringify(r)).not.toContain("secret");
  });
  it("computes % from published levels (entry midpoint 101 to exit)", () => {
    expect(resultPct({ entryZone: "100 - 102", direction: "Long" }, "110")).toBe(8.91);
    expect(resultPct({ entryZone: "100 - 102", direction: "Long" }, "96")).toBe(-4.95);
    expect(resultPct({ entryZone: "100 - 102", direction: "Short" }, "96")).toBe(4.95);
    expect(resultPct({ entryZone: "n/a", direction: "Long" }, "96")).toBeNull();
  });
  it("cancelled trades are never wins or losses", () => {
    const s = summarize(eliteRecords(stored), 1);
    expect(s).toMatchObject({ closed: 3, wins: 2, losses: 1, cancelled: 1, open: 1 });
    expect(s.winRate).toBe(66.67);
  });
  it("monthly report groups by close month, newest first", () => {
    const m = monthlyReport(eliteRecords(stored));
    expect(m.map((x) => x.month)).toEqual(["2026-11", "2026-10"]);
    expect(m[1]).toMatchObject({ wins: 1, losses: 1, cancelled: 1, closed: 2 });
  });
  it("no data gives a null win rate, not an invented one", () => {
    expect(summarize([], 0)).toMatchObject({ closed: 0, winRate: null, netPct: 0 });
  });
  it("a signal without a verified closing record is not included", () => {
    expect(eliteRecords([base("x", { status: "closed", hitLevels: ["SL"] })])).toEqual([]);
  });
});

import { readFileSync } from "node:fs";
describe("Elite performance wording", () => {
  const src = readFileSync("components/elite/EliteRecord.tsx", "utf8");
  it("is labelled Historical Signal Performance, never verified member profits", () => {
    expect(src).toContain('title: "Historical Signal Performance"');
    expect(src).not.toMatch(/Verified track record/i);
    expect(src).not.toMatch(/verified (member )?profit/i);
  });
  it("discloses the midpoint calculation, limitations and that it is not member profit (EN and AR)", () => {
    expect(src).toMatch(/midpoint of the published entry zone/);
    expect(src).toMatch(/not the profit or loss of any member/);
    expect(src).toMatch(/actual fills/);
    expect(src).toMatch(/fees, slippage/);
    expect(src).toMatch(/not a guarantee or prediction/);
    expect(src).toMatch(/ليس ربح أو خسارة أي عضو/);
  });
});
