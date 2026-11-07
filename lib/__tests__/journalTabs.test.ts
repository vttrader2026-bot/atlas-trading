// JOURNAL-TABS-v1: Open vs Closed split uses the existing engine; partial exits stay open.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { filterAndSort, statusOf, remainingQty, type Trade } from "@/lib/journal";
import { splitCounts } from "@/components/journal/TradeViews";
import { journalAr, journalEn, journalFr } from "@/lib/i18nJournal";

const base = { date: "2026-11-01", pair: "BTCUSDT", side: "Long", entry: 100, stop: 90, target: 120, size: 10, notes: "" } as const;
const mk = (over: Partial<Trade>): Trade => ({ ...base, id: Math.random().toString(36).slice(2), exit: null, ...over }) as Trade;

const openPlain = mk({ status: "open" });
const partial = mk({ status: "open", exitStrategy: "split", exits: [{ level: "tp1", price: 110, qty: 3, date: "2026-11-02" } as never] });
const closed = mk({ status: "closed", exit: 115, exitDate: "2026-11-03" });
const trades = [openPlain, partial, closed];
const opts = { query: "", sort: "date" as const, desc: true };

describe("Open / Closed split", () => {
  it("a partially exited trade is still open and holds the rest of its position", () => {
    expect(statusOf(partial)).toBe("open");
    expect(remainingQty(partial)).toBe(7);
  });
  it("Open view shows only active trades, Closed view only fully completed ones", () => {
    const open = filterAndSort(trades, { ...opts, status: "open" });
    const done = filterAndSort(trades, { ...opts, status: "closed" });
    expect(open.map((x) => x.id).sort()).toEqual([openPlain.id, partial.id].sort());
    expect(done.map((x) => x.id)).toEqual([closed.id]);
    expect(open.length + done.length).toBe(trades.length); // nothing duplicated or lost
  });
  it("tab counts match the views", () => {
    expect(splitCounts(trades)).toEqual({ open: 2, closed: 1 });
    expect(splitCounts([])).toEqual({ open: 0, closed: 0 });
  });
});

describe("Journal page wiring", () => {
  const page = readFileSync("app/journal/page.tsx", "utf8");
  const views = readFileSync("components/journal/TradeViews.tsx", "utf8");
  it("uses the same trades array and storage (no second database)", () => {
    expect(page).toContain("<TradeViews trades={trades}");
    expect(views).not.toMatch(/localStorage|fetch\(/);
  });
  it("Manage opens the existing details panel and Close position the existing close form", () => {
    expect(page).toContain("onOpen={setSelected}");
    expect(page).toContain("startEdit(tr, true)");
  });
  it("shows the AUTO-SL state from the existing monitor rule", () => {
    expect(views).toContain("isMonitorable");
  });
});

describe("tab translations", () => {
  const keys = ["tabOpen", "tabClosed", "manageEyebrow", "reviewEyebrow", "colCurrent", "colRemaining", "colOutcome", "btnManage", "btnClosePos", "partialN", "noOpenTrades", "noClosedTrades"];
  it("exist in English, French and Arabic", () => {
    for (const d of [journalEn, journalFr, journalAr]) for (const k of keys) expect(d[k]?.trim()).toBeTruthy();
  });
});
