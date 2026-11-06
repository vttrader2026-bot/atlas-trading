// EXIT-STRATEGY-v1: risk settings / assessment, exit strategy, partial exits, realized vs unrealized, server lock.
import { describe, expect, it } from "vitest";
import { allowedLevels, applyExit, lockStrategyFields, plannedExitQty, positionOf } from "@/lib/exits";
import { realizedPnl, roiPct, statusOf, unrealizedPnl, unrealizedRoiPct, type ExitStrategy, type Trade } from "@/lib/journal";
import { buildJournalReport } from "@/lib/journalPdf";

const trade = (o: Partial<Trade> = {}): Trade => ({
  id: "t1", date: "2026-11-01", pair: "SOLUSDT", side: "Long", entry: 100, stop: 95, target: 110, exit: null, size: 10, notes: "", status: "open",
  tp1: 110, tp2: 120, tp3: 130, invested: 1000, fees: 5, exitStrategy: "split", ...o,
});
const ok = (r: ReturnType<typeof applyExit>): Trade => {
  if (!r.ok) throw new Error(r.error);
  return r.trade;
};

describe("exit strategy rules", () => {
  it("split: TP1 30%, TP2 40%, TP3 the remaining 30%; SL the whole remainder", () => {
    let t = trade();
    expect(allowedLevels(t)).toEqual(["TP1", "SL"]);
    expect(plannedExitQty(t, "TP1")).toBeCloseTo(3);
    t = ok(applyExit(t, { level: "TP1", price: 110, date: "2026-11-02" }));
    expect(allowedLevels(t)).toEqual(["TP2", "SL"]);
    expect(plannedExitQty(t, "TP2")).toBeCloseTo(4);
    expect(plannedExitQty(t, "SL")).toBeCloseTo(7);
    t = ok(applyExit(t, { level: "TP2", price: 120, date: "2026-11-03" }));
    expect(plannedExitQty(t, "TP3")).toBeCloseTo(3);
    expect(allowedLevels(t)).toEqual(["TP3", "SL"]);
  });
  it("TP3 only: nothing is sold at TP1 / TP2, 100% at TP3", () => {
    const t = trade({ exitStrategy: "tp3" as ExitStrategy });
    expect(allowedLevels(t)).toEqual(["TP3", "SL"]);
    expect(applyExit(t, { level: "TP1", price: 110, date: "2026-11-02" })).toEqual({ ok: false, error: "level" });
    const closed = ok(applyExit(t, { level: "TP3", price: 130, date: "2026-11-05" }));
    expect(closed.exits).toEqual([{ level: "TP3", price: 130, qty: 10, date: "2026-11-05" }]);
    expect(statusOf(closed)).toBe("closed");
  });
  it("SL closes 100% of what is left, after a partial exit too", () => {
    const t1 = ok(applyExit(trade(), { level: "TP1", price: 110, date: "2026-11-02" }));
    const t2 = ok(applyExit(t1, { level: "SL", price: 95, date: "2026-11-03" }));
    expect(t2.exits?.map((e) => [e.level, e.qty])).toEqual([["TP1", 3], ["SL", 7]]);
    expect(statusOf(t2)).toBe("closed");
    expect(allowedLevels(t2)).toEqual([]);
  });
  it("rejects bad input and exits on a closed trade; a legacy trade has no strategy to apply", () => {
    const t = trade();
    expect(applyExit(t, { level: "TP1", price: 0, date: "2026-11-02" })).toEqual({ ok: false, error: "price" });
    expect(applyExit(t, { level: "TP1", price: 110, date: "2026-10-01" })).toEqual({ ok: false, error: "date" });
    expect(applyExit(t, { level: "TP2", price: 120, date: "2026-11-02" })).toEqual({ ok: false, error: "level" });
    const closed = ok(applyExit(t, { level: "SL", price: 95, date: "2026-11-02" }));
    expect(applyExit(closed, { level: "SL", price: 95, date: "2026-11-02" })).toEqual({ ok: false, error: "closed" });
    const legacy = trade({ exitStrategy: undefined });
    expect(applyExit(legacy, { level: "SL", price: 95, date: "2026-11-02" })).toEqual({ ok: false, error: "noStrategy" });
    expect(allowedLevels(legacy)).toEqual([]);
  });
});

describe("partial exits: remaining position, realized and unrealized", () => {
  const afterTp1 = () => ok(applyExit(trade(), { level: "TP1", price: 110, date: "2026-11-02" }));
  it("nothing sold yet: nothing is realized", () => {
    const p = positionOf(trade(), 105);
    expect(p).toMatchObject({ soldQty: 0, remainingQty: 10, realizedPnl: 0, realizedRoiPct: null, unrealizedPnl: 50 });
  });
  it("after TP1: realized is the sold part only (fees counted once), unrealized is the rest at the live price", () => {
    const p = positionOf(afterTp1(), 105);
    expect(p.soldQty).toBeCloseTo(3);
    expect(p.remainingQty).toBeCloseTo(7);
    expect(p.realizedPnl).toBeCloseTo(25); // 3 x 10 - 5 fees
    expect(p.realizedRoiPct).toBeCloseTo((25 / 300) * 100);
    expect(p.unrealizedPnl).toBeCloseTo(35); // 7 x 5
    expect(p.unrealizedRoiPct).toBeCloseTo(5); // 35 / 700
    expect(p.totalPnl).toBeCloseTo(60);
    expect(p.totalRoiPct).toBeCloseTo(6);
  });
  it("without a live price the unrealized part is unknown, never guessed", () => {
    const p = positionOf(afterTp1(), null);
    expect(p.unrealizedPnl).toBeNull();
    expect(p.totalPnl).toBeNull();
    expect(p.realizedPnl).toBeCloseTo(25);
  });
  it("the Journal's own unrealized figures use only the part still held", () => {
    const t = afterTp1();
    expect(unrealizedPnl(t, 105)).toBeCloseTo(35);
    expect(unrealizedRoiPct(t, 105)).toBeCloseTo(5);
    expect(realizedPnl(t)).toBeNull(); // still open: the Journal does not call it a result
  });
  it("fully closed: ordinary closed trade whose result equals the sum of the exits", () => {
    let t = afterTp1();
    t = ok(applyExit(t, { level: "TP2", price: 120, date: "2026-11-03" }));
    t = ok(applyExit(t, { level: "TP3", price: 130, date: "2026-11-04" }));
    expect(statusOf(t)).toBe("closed");
    expect(t.exit).toBeCloseTo(120);
    expect(t.exitDate).toBe("2026-11-04");
    expect(realizedPnl(t)).toBeCloseTo(195); // 30 + 80 + 90 - 5
    expect(roiPct(t)).toBeCloseTo(19.5);
    expect(positionOf(t, null)).toMatchObject({ remainingQty: 0, unrealizedPnl: 0 });
    expect(positionOf(t, null).realizedPnl).toBeCloseTo(195);
    // the PDF / history see it as a normal closed trade
    expect(buildJournalReport([t]).rows[0]).toMatchObject({ Status: "Closed", PnL: "+195.00", ROI: "+19.50%" });
  });
  it("a stop-out after TP1 is a real, recorded result", () => {
    const t = ok(applyExit(afterTp1(), { level: "SL", price: 95, date: "2026-11-03" }));
    expect(realizedPnl(t)).toBeCloseTo(-10); // 30 - 35 - 5
  });
});

describe("existing Journal records are unchanged", () => {
  it("a trade without strategy or exits keeps the old maths", () => {
    const old = trade({ exitStrategy: undefined, size: 2, invested: 200, fees: 1, exit: null });
    expect(unrealizedPnl(old, 110)).toBe(19); // (110-100) x 2 - 1
    const closed = trade({ exitStrategy: undefined, size: 2, invested: 200, fees: 1, exit: 110, status: "closed", exitDate: "2026-11-02" });
    expect(realizedPnl(closed)).toBe(19);
    expect(roiPct(closed)).toBe(9.5);
  });
});

describe("server lock on Journal saves", () => {
  const stored = [{ id: "t1", entry: 100, size: 10, invested: 1000, exitStrategy: "split", exits: [{ level: "TP1", price: 110, qty: 3, date: "2026-11-02" }] }];
  it("strategy, entry, size and invested cannot be rewritten by a save", () => {
    const [t] = lockStrategyFields(stored, [{ id: "t1", entry: 1, size: 99, invested: 5, exitStrategy: "tp3", notes: "mine", exits: stored[0].exits }]);
    expect(t).toMatchObject({ entry: 100, size: 10, invested: 1000, exitStrategy: "split", notes: "mine" });
  });
  it("exits can be added but not rewritten or removed", () => {
    const added = [...stored[0].exits, { level: "TP2", price: 120, qty: 4, date: "2026-11-03" }];
    expect(lockStrategyFields(stored, [{ id: "t1", exits: added }])[0].exits).toEqual(added);
    expect(lockStrategyFields(stored, [{ id: "t1", exits: [] }])[0].exits).toEqual(stored[0].exits);
    expect(lockStrategyFields(stored, [{ id: "t1", exits: [{ level: "TP1", price: 999, qty: 3, date: "2026-11-02" }] }])[0].exits).toEqual(stored[0].exits);
  });
  it("new trades and trades without a stored strategy pass through untouched", () => {
    const fresh = { id: "new", entry: 5, exitStrategy: "split" };
    expect(lockStrategyFields(stored, [fresh])[0]).toMatchObject({ ...fresh, status: "open", exit: null });
    const legacy = [{ id: "old", entry: 1, size: 1 }];
    expect(lockStrategyFields(legacy, [{ id: "old", entry: 2, size: 3 }])[0]).toEqual({ id: "old", entry: 2, size: 3 });
    expect(lockStrategyFields(null, [fresh])[0]).toMatchObject(fresh);
  });
});
