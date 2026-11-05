// AUTO-SL-v1: browser-side automatic stop-loss exit. Pure functions with an injected candle fetcher; no network.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { applyAutoSl, firstTouch, findAutoSlTouches, isMonitorable, monitorStart, newMonitorState, WINDOW_MS, type Candle, type CandleFetcher } from "@/lib/autoSl";
import { computeDashboard, realizedPnl, roiPct, statusOf, type Trade } from "@/lib/journal";
import { formToTrade, tradeToForm } from "@/components/journal/TradeForm";

const T0 = Date.parse("2026-11-05T10:00:00Z");
const NOW = T0 + 3 * 3_600_000;
const trade = (o: Partial<Trade> = {}): Trade => ({
  id: "t1", date: "2026-11-05", pair: "SOLUSDT", side: "Long", entry: 100, stop: 95, target: 110, exit: null, size: 2, notes: "", status: "open",
  tp1: 110, tp2: null, tp3: null, invested: 200, fees: 1, watchFrom: T0, ...o,
});
const candle = (min: number, low: number): Candle => ({ openTime: T0 + min * 60_000, low });
const ok = (n: number, from = 0, low = 99): Candle[] => Array.from({ length: n }, (_, i) => candle(from + i, low));
const fetcherOf = (rows: Candle[]): CandleFetcher => async (_s, _i, start, limit) => rows.filter((c) => c.openTime >= start).slice(0, limit);

describe("what is monitored", () => {
  it("only open spot LONG trades with a real stop below entry that were never auto-processed", () => {
    expect(isMonitorable(trade())).toBe(true);
    expect(isMonitorable(trade({ status: "closed", exit: 96 }))).toBe(false);
    expect(isMonitorable(trade({ side: "Short" }))).toBe(false);
    for (const stop of [0, 100, 101]) expect(isMonitorable(trade({ stop }))).toBe(false);
    expect(isMonitorable(trade({ pair: "BTCEUR" }))).toBe(false);
    expect(isMonitorable(trade({ size: 0 }))).toBe(false);
    expect(isMonitorable(trade({ autoSl: { detectedAt: 1, touchedAt: 1, low: 1, estimatedExit: 1 } }))).toBe(false);
  });
  it("watching starts at watchFrom; legacy records only after the end of their entry day (no pre-entry lows)", () => {
    expect(monitorStart(trade())).toBe(T0);
    const legacy = trade({ watchFrom: undefined });
    expect(monitorStart(legacy)).toBe(Date.parse("2026-11-05T00:00:00") + 86_400_000);
  });
});

describe("candle low touch", () => {
  it("a low equal to the stop counts; a low above it does not", () => {
    expect(firstTouch([candle(1, 95)], 95, T0)).toEqual({ touchedAt: T0 + 60_000, low: 95 });
    expect(firstTouch([candle(1, 95.01)], 95, T0)).toBeNull();
  });
  it("returns the FIRST touching candle and ignores candles before the watch start (the entry minute is skipped)", () => {
    const rows = [candle(-5, 50), candle(0, 50), candle(2, 94), candle(3, 90)];
    expect(firstTouch(rows, 95, T0 + 30_000)).toEqual({ touchedAt: T0 + 2 * 60_000, low: 94 }); // 10:00:30 -> the 10:00 candle may pre-date the entry
  });
  it("ignores unusable lows", () => {
    expect(firstTouch([candle(1, 0), candle(2, Number.NaN)], 95, T0)).toBeNull();
  });
});

describe("scanning", () => {
  it("finds a touch and reports nothing when the stop was not reached", async () => {
    const hit = await findAutoSlTouches([trade()], fetcherOf([...ok(10), candle(10, 94.5), ...ok(5, 11)]), NOW, newMonitorState());
    expect(hit.get("t1")).toEqual({ touchedAt: T0 + 10 * 60_000, low: 94.5 });
    expect((await findAutoSlTouches([trade()], fetcherOf(ok(30)), NOW, newMonitorState())).size).toBe(0);
  });
  it("pages through more than 1000 candles", async () => {
    const rows = [...ok(1000), ...ok(500, 1000), candle(1500, 90)];
    const f = vi.fn(fetcherOf(rows));
    const hit = await findAutoSlTouches([trade({ watchFrom: T0 })], f, T0 + 2000 * 60_000, newMonitorState());
    expect(hit.get("t1")?.touchedAt).toBe(T0 + 1500 * 60_000);
    expect(f.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
  it("does not rescan already-checked candles on the next loop, and still catches a later touch", async () => {
    const st = newMonitorState();
    const rows = ok(20);
    const f = vi.fn(fetcherOf(rows));
    await findAutoSlTouches([trade()], f, NOW, st);
    rows.push(candle(25, 90));
    await findAutoSlTouches([trade()], f, NOW, st).then((h) => expect(h.get("t1")?.low).toBe(90));
    expect(f.mock.calls[1][2]).toBeGreaterThan(T0); // second call started from the cursor, not from the entry
  });
  it("a check already running for a trade is not started twice", async () => {
    const st = newMonitorState();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: CandleFetcher = vi.fn(async () => { await gate; return [candle(1, 90)]; });
    const first = findAutoSlTouches([trade()], slow, NOW, st);
    const second = await findAutoSlTouches([trade()], slow, NOW, st);
    release();
    expect(second.size).toBe(0);
    expect((await first).size).toBe(1);
    expect(slow).toHaveBeenCalledTimes(1);
  });
  it("one failing pair neither throws nor blocks the others", async () => {
    const f: CandleFetcher = async (sym) => { if (sym === "BADUSDT") throw new Error("down"); return [candle(1, 90)]; };
    const hits = await findAutoSlTouches([trade({ id: "a", pair: "BADUSDT" }), trade({ id: "b" })], f, NOW, newMonitorState());
    expect([...hits.keys()]).toEqual(["b"]);
  });
  it("trades older than the 1-minute window are covered by hourly candles", async () => {
    const old = trade({ watchFrom: T0 });
    const now = T0 + WINDOW_MS + 5 * 86_400_000;
    const f: CandleFetcher = async (_s, interval) => (interval === "1h" ? [{ openTime: T0 + 3_600_000, low: 90 }] : []);
    expect((await findAutoSlTouches([old], f, now, newMonitorState())).get("t1")).toEqual({ touchedAt: T0 + 3_600_000, low: 90 });
  });
  it("NEVER reacts to the official signal: a trade whose linked signal hit SL or closed stays untouched without a candle touch", async () => {
    const linked = trade({ signalId: "s1", signal: { id: "s1", pair: "SOL/USDT", timeframe: "4H", imported: {} as never, latest: {} as never, status: "closed", hitLevels: ["SL"], syncedAt: 1 } });
    const f = vi.fn(fetcherOf(ok(30, 0, 120)));
    expect((await findAutoSlTouches([linked], f, NOW, newMonitorState())).size).toBe(0);
    expect(applyAutoSl(linked, { touchedAt: T0 + 60_000, low: 120 }, NOW)?.exit).toBe(95); // closure needs a touch passed in; the signal state alone never closes it
    expect(readFileSync("lib/autoSl.ts", "utf8")).not.toMatch(/\.signal\b|hitLevels|signalId/);
  });
});

describe("closing", () => {
  const touch = { touchedAt: T0 + 10 * 60_000, low: 94.5 };
  it("closes at the trade's own stop as an estimate, with source, detection time and estimated exit recorded", () => {
    const c = applyAutoSl(trade(), touch, NOW)!;
    expect(c).toMatchObject({ status: "closed", exit: 95, exitDate: "2026-11-05", exitSource: "auto-sl", updatedAt: NOW });
    expect(c.autoSl).toEqual({ detectedAt: NOW, touchedAt: touch.touchedAt, low: 94.5, estimatedExit: 95 });
    expect(statusOf(c)).toBe("closed");
  });
  it("realized PnL and ROI use the Journal's own maths: (95-100)*2 - fees, over the invested amount", () => {
    const c = applyAutoSl(trade(), touch, NOW)!;
    expect(realizedPnl(c)).toBe(-11);
    expect(roiPct(c)).toBeCloseTo(-5.5, 10);
    const d = computeDashboard([c]);
    expect(d).toMatchObject({ closed: 1, open: 0, losses: 1, wins: 0 });
    expect(d.realizedPnl).toBe(-11);
  });
  it("is idempotent: a second application, a hand-closed trade or an edited trade is never changed", () => {
    const c = applyAutoSl(trade(), touch, NOW)!;
    expect(applyAutoSl(c, touch, NOW + 1)).toBeNull();
    expect(applyAutoSl(trade({ status: "closed", exit: 98 }), touch, NOW)).toBeNull();
    expect(applyAutoSl(trade({ stop: 0 }), touch, NOW)).toBeNull();
  });
  it("a touch from before the watch start is refused; the exit date never precedes the entry date", () => {
    expect(applyAutoSl(trade(), { touchedAt: T0 - 3_600_000, low: 90 }, NOW)).toBeNull();
    expect(applyAutoSl(trade({ date: "2026-11-06", watchFrom: T0 }), touch, NOW)?.exitDate).toBe("2026-11-06");
  });
  it("other fields of the record are preserved", () => {
    const c = applyAutoSl(trade({ notes: "keep", strategy: "s", planId: "p" }), touch, NOW)!;
    expect(c).toMatchObject({ notes: "keep", strategy: "s", planId: "p", entry: 100, stop: 95, size: 2, invested: 200, fees: 1, tp1: 110 });
  });
});

describe("editing an auto-closed trade", () => {
  const auto = applyAutoSl(trade(), { touchedAt: T0 + 60_000, low: 94 }, NOW)!;
  it("saving it unchanged keeps it an estimated automatic exit", () => {
    expect(formToTrade(tradeToForm(auto), auto, auto.id)).toMatchObject({ exitSource: "auto-sl", exit: 95 });
  });
  it("entering the real exit price turns it into a manual exit (no longer labelled estimated); the record stays", () => {
    const f = { ...tradeToForm(auto), exit: "93.8" };
    const out = formToTrade(f, auto, auto.id);
    expect(out).toMatchObject({ exitSource: "manual", exit: 93.8 });
    expect(out.autoSl).toBeDefined();
  });
  it("reopening drops the label but the record keeps it from being auto-closed again", () => {
    const out = formToTrade({ ...tradeToForm(auto), status: "open" }, auto, auto.id);
    expect(out.exitSource).toBeUndefined();
    expect(out.autoSl).toBeDefined();
    expect(isMonitorable(out)).toBe(false);
  });
});

describe("when watching starts", () => {
  it("a new trade starting today is watched from now; a back-dated one is not; changing the stop restarts watching", () => {
    const today = tradeToForm(null);
    const f = { ...today, pair: "SOLUSDT", entry: "100", stop: "95", size: "2", invested: "200" };
    expect(typeof formToTrade(f, null, "n1").watchFrom).toBe("number");
    expect(formToTrade({ ...f, date: "2020-01-01" }, null, "n2").watchFrom).toBeUndefined();
    const base = trade({ watchFrom: 123 });
    expect(formToTrade({ ...tradeToForm(base), notes: "x" }, base, base.id).watchFrom).toBe(123);
    expect(formToTrade({ ...tradeToForm(base), stop: "96" }, base, base.id).watchFrom).toBeGreaterThan(123);
  });
});

describe("wiring and labels", () => {
  it("the Journal page runs the check inside its existing price loop and persists through saveTrades", () => {
    const page = readFileSync("app/journal/page.tsx", "utf8");
    expect(page).toContain("await checkAutoSl()");
    expect(page).toContain("findAutoSlTouches");
    expect(page).toMatch(/applyAutoSl\(x, hit, now\)/);
    expect(page).toMatch(/persist\(next\)/);
  });
  it("automatic exits are labelled estimated in the list, the details and the PDF", () => {
    expect(readFileSync("components/journal/History.tsx", "utf8")).toContain('exitSource === "auto-sl"');
    expect(readFileSync("components/journal/TradeDetails.tsx", "utf8")).toContain('t("journal.autoSlNote")');
    expect(readFileSync("lib/journalPdf.ts", "utf8")).toContain("Estimated automatic stop-loss exit, not an actual fill");
  });
  it("no server, bot or signal code was touched for this: nothing outside the Journal triggers a close", () => {
    expect(readFileSync("app/api/trade-feed/route.ts", "utf8")).not.toContain("autoSl");
    expect(readFileSync("app/api/me/journal/route.ts", "utf8")).not.toContain("autoSl");
  });
});
