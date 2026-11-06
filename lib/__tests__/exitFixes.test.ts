// EXIT-STRATEGY-v1 fixes: server validation, legacy guard, realized+unrealized display, AUTO-SL price correction.
import { describe, expect, it } from "vitest";
import { applyExit, correctAutoSlExit, lockStrategyFields, partialRealizedTotal, positionOf } from "@/lib/exits";
import { applyAutoSl } from "@/lib/autoSl";
import { computeDashboard, realizedPnl, remainingQty, statusOf, type Trade } from "@/lib/journal";
import { journalEn, journalFr, journalAr } from "@/lib/i18nJournal";

const trade = (o: Partial<Trade> = {}): Trade => ({
  id: "t1", date: "2026-11-01", pair: "SOLUSDT", side: "Long", entry: 100, stop: 95, target: 110, exit: null, size: 10, notes: "", status: "open",
  tp1: 110, tp2: 120, tp3: 130, invested: 1000, fees: 5, exitStrategy: "split", ...o,
});
const ok = (r: ReturnType<typeof applyExit>): Trade => {
  if (!r.ok) throw new Error(r.error);
  return r.trade;
};
const lock = (stored: Trade[], inc: Array<Record<string, unknown>>) => lockStrategyFields(stored, inc, 5000)[0] as Record<string, unknown>;
const afterTp1 = () => ok(applyExit(trade(), { level: "TP1", price: 110, date: "2026-11-02" }));

describe("fix 1: strict server validation of partial exits", () => {
  it("quantity typed by the client is replaced by the strategy's quantity", () => {
    const out = lock([trade()], [{ ...trade(), exits: [{ level: "TP1", price: 110, qty: 10, date: "2026-11-02" }] }]);
    expect(out.exits).toEqual([{ level: "TP1", price: 110, qty: 3, date: "2026-11-02" }]);
    expect(out.status).toBe("open");
  });
  it("invalid level, price or date drops the exit and everything after it", () => {
    const bad = [
      { level: "TP2", price: 120, qty: 4, date: "2026-11-02" }, // TP1 not done yet
      { level: "TP1", price: -1, qty: 3, date: "2026-11-02" },
      { level: "TP1", price: 110, qty: 3, date: "2026-10-01" }, // before the trade
      { level: "TP1", price: 110, qty: 3, date: "nope" },
      { level: "TP1", price: "110", qty: 3, date: "2026-11-02" },
    ];
    for (const e of bad) expect(lock([trade()], [{ ...trade(), exits: [e] }]).exits).toBeUndefined();
    const out = lock([trade()], [{ ...trade(), exits: [{ level: "TP1", price: 110, qty: 3, date: "2026-11-02" }, { level: "TP1", price: 111, qty: 3, date: "2026-11-02" }, { level: "SL", price: 90, qty: 7, date: "2026-11-03" }] }]);
    expect((out.exits as unknown[]).length).toBe(1);
  });
  it("the total sold can never exceed the position", () => {
    const stored = afterTp1();
    const out = lock([stored], [{ ...stored, exits: [...stored.exits!, { level: "SL", price: 90, qty: 999, date: "2026-11-03" }] }]);
    const t = out as unknown as Trade;
    expect(t.exits!.reduce((s, e) => s + e.qty, 0)).toBeCloseTo(10);
    expect(remainingQty(t)).toBe(0);
  });
  it("status, exit and exitDate are derived from the exits, not taken from the request", () => {
    const forged = { ...trade(), status: "closed", exit: 500, exitDate: "2026-11-09" };
    expect(lock([trade()], [forged])).toMatchObject({ status: "open", exit: null, exitDate: null });
    const stored = afterTp1();
    const closing = lock([stored], [{ ...stored, status: "open", exit: null, exits: [...stored.exits!, { level: "SL", price: 90, qty: 1, date: "2026-11-04" }] }]);
    expect(closing.status).toBe("closed");
    expect(closing.exit).toBeCloseTo((110 * 3 + 90 * 7) / 10);
    expect(closing.exitDate).toBe("2026-11-04");
  });
  it("stored exits cannot be rewritten or removed, and strategy, entry, size, invested stay as stored", () => {
    const stored = afterTp1();
    expect(lock([stored], [{ ...stored, exits: [] }]).exits).toEqual(stored.exits);
    expect(lock([stored], [{ ...stored, exits: [{ ...stored.exits![0], price: 999 }] }]).exits).toEqual(stored.exits);
    expect(lock([stored], [{ ...stored, exitStrategy: "tp3", entry: 1, size: 99, invested: 5 }])).toMatchObject({ exitStrategy: "split", entry: 100, size: 10, invested: 1000 });
  });
  it("forged exitSource / autoSl are removed", () => {
    const forged = { ...trade(), exitSource: "auto-sl", autoSl: { detectedAt: 1, touchedAt: 1, low: 1, estimatedExit: 95 } };
    const out = lock([trade()], [forged]);
    expect(out.exitSource).toBeUndefined();
    expect(out.autoSl).toBeUndefined();
    const stored = afterTp1();
    const out2 = lock([stored], [{ ...stored, exitSource: "auto-sl", autoSl: forged.autoSl, exits: [...stored.exits!, { level: "SL", price: 95, qty: 7, date: "2026-11-03" }] }]);
    expect(out2.exitSource).toBeUndefined(); // record does not match the exit (qty, timestamps)
  });
  it("a genuine browser AUTO-SL closing is accepted", () => {
    const closed = applyAutoSl(afterTp1(), { touchedAt: Date.parse("2026-11-03T10:00:00Z"), low: 94 }, Date.parse("2026-11-03T10:05:00Z"))!;
    const out = lock([afterTp1()], [closed as unknown as Record<string, unknown>]);
    expect(out).toMatchObject({ status: "closed", exitSource: "auto-sl" });
    expect((out.autoSl as { estimatedExit: number }).estimatedExit).toBe(95);
  });
  it("an existing auto-sl record cannot be edited through a save", () => {
    const closed = applyAutoSl(afterTp1(), { touchedAt: Date.parse("2026-11-03T10:00:00Z"), low: 94 }, Date.parse("2026-11-03T10:05:00Z"))!;
    const out = lock([closed], [{ ...closed, autoSl: { ...closed.autoSl!, estimatedExit: 1, low: 0.5 }, exitSource: "manual" }]);
    expect(out).toMatchObject({ exitSource: "auto-sl" });
    expect(out.autoSl).toEqual(closed.autoSl);
  });
});

describe("fix 2: no exit strategy on existing legacy trades", () => {
  const legacy = { id: "old", date: "2026-10-01", pair: "BTCUSDT", side: "Long", entry: 100, stop: 90, target: 120, exit: null, size: 1, notes: "", status: "open" };
  it("strategy and exits sent for a stored legacy trade are stripped", () => {
    const out = lockStrategyFields([legacy], [{ ...legacy, exitStrategy: "split", exits: [{ level: "TP1", price: 110, qty: 1, date: "2026-11-01" }], notes: "mine" }])[0];
    expect(out.exitStrategy).toBeUndefined();
    expect(out.exits).toBeUndefined();
    expect(out.notes).toBe("mine");
  });
  it("legacy trades keep editing normally (entry, exit, status)", () => {
    const out = lockStrategyFields([legacy], [{ ...legacy, entry: 101, exit: 110, status: "closed", exitDate: "2026-11-01" }])[0];
    expect(out).toMatchObject({ entry: 101, exit: 110, status: "closed" });
  });
  it("a brand new trade may still start with a strategy", () => {
    expect(lockStrategyFields([legacy], [{ ...legacy, id: "fresh", exitStrategy: "tp3" }])[0].exitStrategy).toBe("tp3");
  });
  it("applyExit refuses a trade without a strategy", () => {
    expect(applyExit(trade({ exitStrategy: undefined }), { level: "TP1", price: 110, date: "2026-11-02" })).toEqual({ ok: false, error: "noStrategy" });
  });
});

describe("fix 3: realized + unrealized PnL on partly exited open trades", () => {
  it("shows both, and the total", () => {
    const p = positionOf(afterTp1(), 105);
    expect(p.realizedPnl).toBeCloseTo(25); // 3 x 10 - 5 fees
    expect(p.unrealizedPnl).toBeCloseTo(35); // 7 x 5
    expect(p.totalPnl).toBeCloseTo(60);
  });
  it("without a live price the realized part is still known and unrealized is null (never guessed)", () => {
    const p = positionOf(afterTp1(), null);
    expect(p.realizedPnl).toBeCloseTo(25);
    expect(p.unrealizedPnl).toBeNull();
    expect(p.totalPnl).toBeNull();
  });
  it("partialRealizedTotal sums only open strategy trades with exits, separate from the dashboard", () => {
    const untouched = trade({ id: "t2" });
    const legacy = trade({ id: "t3", exitStrategy: undefined });
    expect(partialRealizedTotal([untouched, legacy])).toBeNull();
    expect(partialRealizedTotal([afterTp1(), untouched, legacy])).toBeCloseTo(25);
    const dash = computeDashboard([afterTp1()]);
    expect(JSON.stringify(dash)).not.toContain("25.0000001"); // dashboard realized is unchanged logic
    expect(realizedPnl(afterTp1())).toBeNull();
  });
  it("closed trades are not counted as partial", () => {
    const closed = ok(applyExit(afterTp1(), { level: "SL", price: 95, date: "2026-11-03" }));
    expect(partialRealizedTotal([closed])).toBeNull();
  });
});

describe("fix 4: correcting the estimated AUTO-SL exit price", () => {
  const auto = () => applyAutoSl(afterTp1(), { touchedAt: Date.parse("2026-11-03T10:00:00Z"), low: 94 }, Date.parse("2026-11-03T10:05:00Z"))!;
  it("only the last SL exit changes; previous exits are untouched; PnL recalculated; no longer estimated", () => {
    const before = auto();
    expect(realizedPnl(before)).toBeCloseTo(30 - 35 - 5);
    const r = correctAutoSlExit(before, 93, 9999);
    if (!r.ok) throw new Error(r.error);
    const t = r.trade;
    expect(t.exits![0]).toEqual(before.exits![0]);
    expect(t.exits![1]).toMatchObject({ level: "SL", price: 93, qty: 7, date: before.exits![1].date });
    expect(t.exit).toBeCloseTo((110 * 3 + 93 * 7) / 10);
    expect(realizedPnl(t)).toBeCloseTo(30 - 49 - 5);
    expect(t.exitSource).toBe("manual");
    expect(t.autoSl).toMatchObject({ correctedAt: 9999, correctedPrice: 93 });
    expect(statusOf(t)).toBe("closed");
  });
  it("rejects bad prices and trades that are not automatic exits", () => {
    expect(correctAutoSlExit(auto(), 0)).toEqual({ ok: false, error: "price" });
    expect(correctAutoSlExit(auto(), NaN)).toEqual({ ok: false, error: "price" });
    expect(correctAutoSlExit(afterTp1(), 90)).toEqual({ ok: false, error: "notAuto" });
  });
  it("the server accepts the correction once and ignores a rewrite of earlier exits", () => {
    const stored = auto();
    const corrected = { ...stored, exits: [stored.exits![0], { ...stored.exits![1], price: 93 }] };
    const out = lock([stored], [corrected as unknown as Record<string, unknown>]);
    expect(out).toMatchObject({ exitSource: "manual" });
    expect((out.exits as Trade["exits"])![1].price).toBe(93);
    expect(out.exit as number).toBeCloseTo((110 * 3 + 93 * 7) / 10);
    expect(out.autoSl).toMatchObject({ correctedPrice: 93, correctedAt: 5000 });
    const tamper = { ...stored, exits: [{ ...stored.exits![0], price: 999 }, { ...stored.exits![1], price: 93 }] };
    expect((lock([stored], [tamper as unknown as Record<string, unknown>]).exits as Trade["exits"])![0].price).toBe(110);
  });
  it("the server refuses to change qty or date during a correction", () => {
    const stored = auto();
    const bad = { ...stored, exits: [stored.exits![0], { ...stored.exits![1], price: 93, qty: 1 }] };
    const out = lock([stored], [bad as unknown as Record<string, unknown>]);
    expect(out.exits).toEqual(stored.exits);
    expect(out.exitSource).toBe("auto-sl");
  });
});

describe("fix 5: AUTO-SL remaining quantity and legacy compatibility", () => {
  it("AUTO-SL after a partial exit closes only the remaining quantity and keeps earlier realized PnL", () => {
    const t = applyAutoSl(afterTp1(), { touchedAt: Date.parse("2026-11-03T10:00:00Z"), low: 94 }, Date.parse("2026-11-03T10:05:00Z"))!;
    expect(t.exits!.map((e) => [e.level, e.qty])).toEqual([["TP1", 3], ["SL", 7]]);
    expect(t.autoSl!.qty).toBe(7);
  });
  it("a legacy trade is still closed whole at the stop", () => {
    const legacy = trade({ exitStrategy: undefined });
    const t = applyAutoSl(legacy, { touchedAt: Date.parse("2026-11-03T10:00:00Z"), low: 94 }, Date.parse("2026-11-03T10:05:00Z"))!;
    expect(t).toMatchObject({ status: "closed", exit: 95, exitSource: "auto-sl" });
    expect(t.exits).toBeUndefined();
  });
});

describe("translations for the new UI keys exist in EN, FR and AR", () => {
  const keys = ["autoSlNoteExits", "autoSlCorrectLabel", "autoSlCorrectBtn", "autoSlCorrected", "partialRealized", "pnlRealizedShort", "pnlUnrealizedShort"];
  for (const [name, d] of [["en", journalEn], ["fr", journalFr], ["ar", journalAr]] as const) {
    it(name, () => {
      for (const k of keys) expect(d[k]).toBeTruthy();
    });
  }
});
