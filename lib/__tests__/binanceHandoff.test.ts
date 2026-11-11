// BINANCE-HANDOFF-v1: actual quantity / fee, manual fill outside the signal zone, one Journal trade per plan,
// older drafts, and the unchanged Elite protections.
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import type { Redis } from "@upstash/redis";
import { parseFee, planToTrade } from "@/lib/planBridge";
import { emptyDraft, normalizeDraft, type TradePlanDraft } from "@/lib/tradePlan";
import { fillOutsideSignalZone, findPlanTrade, upsertPlanTrade } from "@/lib/planJournalSync";
import { splitUnconfirmedEliteTrades } from "@/lib/eliteConfirmServer";
import type { Trade } from "@/lib/journal";
import type { SignalLink } from "@/lib/signalLink";
import { dictionaries } from "@/lib/i18n";

const link = (zone = "98 - 102", status: "open" | "closed" = "open", id = "SIG-1"): SignalLink => ({
  id, pair: "SOL/USDT", timeframe: "4H", status, hitLevels: [], syncedAt: 1,
  imported: { entryZone: zone, invalidation: "95", tp1: "110", tp2: "120", tp3: "130" },
  latest: { entryZone: zone, invalidation: "95", tp1: "110", tp2: "120", tp3: "130" },
});
const entered = (o: Partial<TradePlanDraft> = {}): TradePlanDraft => ({
  ...emptyDraft, id: "plan-1", pair: "SOL/USDT", entry: "100", invalidation: "95", tp1: "110", tp2: "120", tp3: "130",
  status: "entered", enteredAt: "2026-11-11", balance: "1000", riskPct: "1", ...o,
});
const toTrade = (d: TradePlanDraft, id = "trade-1", manualFill = false) => {
  const r = planToTrade(d, { id, today: "2026-11-11", now: 1, manualFill });
  if (!r.ok) throw new Error(r.error);
  return r.trade;
};

describe("older drafts stay compatible", () => {
  const old = { pair: "BTC/USDT", direction: "Long", timeframe: "4H", entryZone: "", invalidationText: "", entry: "100", invalidation: "95", tp1: "110", tp2: "120", tp3: "130", reasoning: "", status: "entered", enteredAt: "2026-11-01", balance: "1000", riskPct: "1" };
  it("normalizeDraft adds nothing and drops nothing", () => {
    const d = normalizeDraft(old);
    expect(d.actualQty).toBeUndefined();
    expect(d.actualFee).toBeUndefined();
    expect(d.manualFill).toBeUndefined();
    expect(d.pair).toBe("BTC/USDT");
  });
  it("an old draft still produces the same planned trade as before (planned size, no fee)", () => {
    const t = toTrade(normalizeDraft(old));
    expect([t.size, t.invested, t.fees, t.entry]).toEqual([2, 200, null, 100]);
  });
  it("the new fields survive normalization; a non-true manualFill does not", () => {
    const d = normalizeDraft({ ...old, actualQty: "3", actualFee: "0.5", manualFill: true });
    expect([d.actualQty, d.actualFee, d.manualFill]).toEqual(["3", "0.5", true]);
    expect(normalizeDraft({ ...old, manualFill: "yes" }).manualFill).toBeUndefined();
  });
});

describe("actual quantity and fee", () => {
  it("quantity and fee are carried; invested = actual price x actual quantity", () => {
    const t = toTrade(entered({ actualEntry: "101.5", actualQty: "3", actualFee: "0.45" }));
    expect(t.entry).toBe(101.5);
    expect(t.size).toBe(3);
    expect(t.invested).toBe(304.5);
    expect(t.fees).toBe(0.45);
  });
  it("uses the entry price when no actual price was typed", () => {
    const t = toTrade(entered({ actualQty: "2.5" }));
    expect([t.size, t.invested]).toEqual([2.5, 250]);
  });
  it("removes floating-point noise (0.1 x 3)", () => {
    const t = toTrade(entered({ entry: "0.1", invalidation: "0.09", tp1: "0.11", tp2: "0.12", tp3: "0.13", actualQty: "3" }));
    expect(t.invested).toBe(0.3);
  });
  it("fee only: planned size, real fee", () => {
    const t = toTrade(entered({ actualFee: "1.2" }));
    expect([t.size, t.invested, t.fees]).toEqual([2, 200, 1.2]);
  });
  it("a zero fee is a valid fee; text that is not a number is not", () => {
    expect(toTrade(entered({ actualFee: "0" })).fees).toBe(0);
    expect(toTrade(entered({ actualFee: "0.00" })).fees).toBe(0);
    expect(parseFee("0")).toBe(0);
    expect(parseFee("1,5")).toBe(15);
    expect(parseFee("x")).toBeNull();
  });
  it.each([["abc"], ["0"], ["-2"]])("invalid quantity %j is an error, not ignored", (q) => {
    expect(planToTrade(entered({ actualQty: q }), { id: "x", today: "2026-11-11" })).toEqual({ ok: false, error: "qty" });
  });
  it.each([["abc"], ["-1"]])("invalid fee %j is an error, not ignored", (f) => {
    expect(planToTrade(entered({ actualFee: f }), { id: "x", today: "2026-11-11" })).toEqual({ ok: false, error: "fee" });
  });
  it("a real fill larger than the plan's balance limit is still recorded (it already happened)", () => {
    const d = entered({ sizeMode: "usdt", sizeValue: "5000" });
    expect(planToTrade(d, { id: "x", today: "2026-11-11" }).ok).toBe(false); // the plan itself is still limited
    const t = toTrade({ ...d, actualQty: "10" });
    expect([t.size, t.invested]).toEqual([10, 1000]);
  });
  it("a stop that is not below the entry still blocks it", () => {
    expect(planToTrade(entered({ invalidation: "105", actualQty: "1" }), { id: "x", today: "2026-11-11" }).ok).toBe(false);
  });
});

describe("manual fill outside the signal entry zone", () => {
  it.each([["105"], ["97.99"]])("a fill at %s is outside the 98 - 102 zone", (px) => {
    expect(fillOutsideSignalZone(entered({ signal: link(), actualEntry: px }))).toBe(true);
  });
  it.each([["100"], ["98"], ["102"]])("a fill at %s (boundaries included) is inside", (px) => {
    expect(fillOutsideSignalZone(entered({ signal: link(), actualEntry: px }))).toBe(false);
  });
  it("no actual price: the planned entry is checked", () => {
    expect(fillOutsideSignalZone(entered({ signal: link("110 - 112") }))).toBe(true);
  });
  it("plans with no signal, a closed signal, an unreadable zone or an earlier manual fill use the existing paths", () => {
    expect(fillOutsideSignalZone(entered({ actualEntry: "500" }))).toBe(false);
    expect(fillOutsideSignalZone(entered({ signal: link("98 - 102", "closed"), actualEntry: "500" }))).toBe(false);
    expect(fillOutsideSignalZone(entered({ signal: link("see chart"), actualEntry: "500" }))).toBe(false);
    expect(fillOutsideSignalZone(entered({ signal: link(), actualEntry: "500", manualFill: true }))).toBe(false);
  });
  it("the manual trade is flagged and carries NO official signal link", () => {
    const d = entered({ signal: link(), signalId: "SIG-1", actualEntry: "105" });
    const t = toTrade(d, "m1", true);
    expect(t.manualFill).toBe(true);
    expect(t.signal).toBeUndefined();
    expect(t.signalId).toBeUndefined();
    expect(t.source).toBe("plan");
    expect(t.planId).toBe("plan-1");
    expect(t.entry).toBe(105);
  });
  it("the normal path keeps the signal link and never sets manualFill", () => {
    const t = toTrade(entered({ signal: link(), actualEntry: "100" }));
    expect(t.signalId).toBe("SIG-1");
    expect(t.signal?.id).toBe("SIG-1");
    expect(t.manualFill).toBeUndefined();
  });
});

describe("Elite protections are unchanged", () => {
  const fakeRedis = (feed: unknown[], confirmed: Record<string, { tradeId: string }>) =>
    ({ lrange: async () => feed, hgetall: async () => confirmed }) as unknown as Redis;
  const eliteFeed = [{ id: "SIG-1", tier: "elite" }];

  it("a trade still linked to an unconfirmed ELITE signal is refused by the server catch-all", async () => {
    const linked = toTrade(entered({ signal: link(), actualEntry: "105" }), "t-linked");
    const r = await splitUnconfirmedEliteTrades(fakeRedis(eliteFeed, {}), "u1", [linked as unknown as Record<string, unknown>]);
    expect(r.rejected).toEqual(["t-linked"]);
  });
  it("the manual-fill trade has no link, so it is the member's own record and is kept", async () => {
    const manual = toTrade(entered({ signal: link(), actualEntry: "105" }), "t-manual", true);
    const r = await splitUnconfirmedEliteTrades(fakeRedis(eliteFeed, {}), "u1", [manual as unknown as Record<string, unknown>]);
    expect(r.rejected).toEqual([]);
    expect(r.kept).toHaveLength(1);
  });
  it("a confirmed trade is kept, a different trade for the same signal is not", async () => {
    const ok = toTrade(entered({ signal: link() }), "t-ok");
    const dup = toTrade(entered({ signal: link() }), "t-dup");
    const r = await splitUnconfirmedEliteTrades(fakeRedis(eliteFeed, { "SIG-1": { tradeId: "t-ok" } }), "u1", [ok, dup] as unknown as Array<Record<string, unknown>>);
    expect(r.kept.map((t) => t.id)).toEqual(["t-ok"]);
    expect(r.rejected).toEqual(["t-dup"]);
  });
  it("server files are untouched by this feature: no manual-fill bypass exists there", () => {
    for (const f of ["lib/eliteConfirmServer.ts", "app/api/me/confirm-trade/route.ts", "app/api/me/journal/route.ts"]) {
      expect(readFileSync(join(process.cwd(), f), "utf8")).not.toMatch(/manualFill|BINANCE-HANDOFF/);
    }
  });
});

describe("one Journal trade per plan", () => {
  const base = (): Trade[] => [toTrade(entered({ actualEntry: "100" }), "j1"), { ...toTrade(entered({ id: "other" }), "j2"), planId: "other" }];

  it("a plan with no trade yet creates exactly one", () => {
    const r = upsertPlanTrade([], toTrade(entered()), entered());
    expect(r.ok && r.action).toBe("created");
    expect(r.ok && r.trades).toHaveLength(1);
  });
  it("sending the same plan again updates its trade by planId: no duplicate, other plans untouched", () => {
    const trades = base();
    const r = upsertPlanTrade(trades, toTrade(entered({ actualFee: "2" }), "new-id"), entered());
    expect(r.ok && r.action).toBe("updated");
    if (!r.ok) throw new Error("x");
    expect(r.trades).toHaveLength(2);
    expect(r.trades.filter((t) => t.planId === "plan-1")).toHaveLength(1);
    expect(r.trade.id).toBe("j1");
    expect(r.trade.fees).toBe(2);
    expect(r.trades.find((t) => t.id === "j2")).toBe(trades[1]);
  });
  it("matches by the draft's journalId when planId is missing", () => {
    const trades: Trade[] = [{ ...toTrade(entered(), "j9"), planId: undefined }];
    expect(findPlanTrade(trades, { id: "zzz", journalId: "j9" })?.id).toBe("j9");
    const r = upsertPlanTrade(trades, toTrade(entered({ actualFee: "1" })), { id: "zzz", journalId: "j9" });
    expect(r.ok && r.trades).toHaveLength(1);
  });
  it("stop, targets, fee and notes move; entry, quantity and invested are locked (as on the server) and reported", () => {
    const r = upsertPlanTrade(base(), toTrade(entered({ actualEntry: "103", actualQty: "4", invalidation: "96", tp3: "140", actualFee: "1.5" })), entered());
    if (!r.ok) throw new Error("x");
    expect([r.trade.stop, r.trade.tp3, r.trade.fees]).toEqual([96, 140, 1.5]);
    expect([r.trade.entry, r.trade.size, r.trade.invested]).toEqual([100, 2, 200]);
    expect(r.locked).toEqual(["entry", "size", "invested"]);
  });
  it("an unchanged resend reports nothing locked", () => {
    const r = upsertPlanTrade(base(), toTrade(entered({ actualEntry: "100" })), entered());
    expect(r.ok && r.locked).toEqual([]);
  });
  it("a changed stop restarts the Journal's stop watch from now (never closes a trade retroactively)", () => {
    const r = upsertPlanTrade(base(), toTrade(entered({ invalidation: "96" })), entered(), 5000);
    expect(r.ok && r.trade.watchFrom).toBe(5000);
  });
  it("a trade with recorded exits or a closed trade keeps its stop and targets", () => {
    const settled: Trade[] = [{ ...toTrade(entered(), "j1"), exits: [{ level: "TP1", price: 110, qty: 1, date: "2026-11-12" }] }];
    const r = upsertPlanTrade(settled, toTrade(entered({ invalidation: "90", tp3: "150" })), entered());
    if (!r.ok) throw new Error("x");
    expect([r.trade.stop, r.trade.tp3]).toEqual([95, 130]);
    expect(r.trade.exits).toHaveLength(1);
    const closed: Trade[] = [{ ...toTrade(entered(), "j1"), status: "closed", exit: 110, exitDate: "2026-11-12" }];
    const c = upsertPlanTrade(closed, toTrade(entered({ invalidation: "90" })), entered());
    expect(c.ok && c.trade.stop).toBe(95);
    expect(c.ok && c.trade.status).toBe("closed");
  });
  it("an update that would make the trade invalid is refused, nothing changes", () => {
    const next = { ...toTrade(entered()), stop: 150 };
    expect(upsertPlanTrade(base(), next, entered())).toEqual({ ok: false, error: "invalid" });
  });
});

describe("wiring and wording", () => {
  const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
  it("the Trade Plan page, Trade Feed card and Journal details use the one reusable link", () => {
    expect(src("app/trade-plan/page.tsx")).toContain("<BinanceSpotLink");
    expect(src("components/tradefeed/SignalActions.tsx")).toContain("<BinanceSpotLink");
    expect(src("components/journal/TradeDetails.tsx")).toContain("<BinanceSpotLink");
  });
  it("the confirmation form has the quantity and fee fields and the manual-fill choice", () => {
    const page = src("app/trade-plan/page.tsx");
    for (const s of ["tradePlan.actualQty", "tradePlan.actualFee", "tradePlan.manualRecord", "recordManualFill", "updateJournalTrade"]) expect(page).toContain(s);
  });
  it("every new string exists in EN, FR and AR (the warning says user-reported, not Binance-verified)", () => {
    const keys = ["tradePlan.openBinance", "tradePlan.binanceNotice", "tradePlan.binanceInvalid", "tradePlan.binanceUnsupported", "tradePlan.actualQty", "tradePlan.actualFee", "tradePlan.errQty", "tradePlan.errFee", "tradePlan.updateJournal", "tradePlan.updateOk", "tradePlan.lockedNote", "tradePlan.manualWarn", "tradePlan.manualRecord", "tradePlan.manualCancel", "tradePlan.manualOk", "journal.manualFill"];
    const get = (lang: "en" | "fr" | "ar", path: string) => path.split(".").reduce<unknown>((n, k) => (n as Record<string, unknown> | undefined)?.[k], dictionaries[lang]);
    for (const lang of ["en", "fr", "ar"] as const) for (const k of keys) expect(get(lang, k), `${lang} ${k}`).toBeTruthy();
    expect(get("en", "tradePlan.manualWarn")).toMatch(/user-reported/i);
    expect(get("en", "tradePlan.manualWarn")).toMatch(/not verified by Binance/i);
    expect(get("en", "tradePlan.binanceNotice")).toMatch(/never places orders/i);
  });
});
