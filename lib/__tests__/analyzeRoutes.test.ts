/* eslint-disable @typescript-eslint/no-explicit-any -- route fixtures are loosely-typed JSON */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { build, HOUR } from "./helpers/candles";

const h = vi.hoisted(() => ({
  userId: "user_1" as string | null,
  usage: { allowed: true, plan: "free", remaining: 2, limit: 3 },
  peek: vi.fn(),
  consume: vi.fn(),
  getCandles: vi.fn(),
  gemini: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: h.userId }) }));
vi.mock("@/lib/plan", () => ({
  peekAnalyzeUsage: h.peek,
  consumeAnalyzeUsage: h.consume,
  analyzeLimitReachedMessage: () => "limit reached",
}));
vi.mock("@/lib/binance", () => ({ getTicker24h: async () => ({ lastPrice: "122.8" }) }));
vi.mock("@/lib/marketData", async () => {
  const actual = await vi.importActual<typeof import("@/lib/marketData")>("@/lib/marketData");
  return { ...actual, getCandles: h.getCandles };
});

import { POST as chartPOST } from "@/app/api/analyze-chart/route";
import { POST as shotPOST } from "@/app/api/analyze/route";
import { MarketDataError } from "@/lib/marketDataTypes";

const NOW = Date.now();
const SEGS = (last: [number, number][]): [number, number][] => [[100, 20], [120, 12], [110, 12], [135, 12], [122, 12], ...last];
const BOUNCE: [number, number][] = [[122.2, 1], [122.4, 1], [122.6, 1], [122.8, 1]];
const validCandles = () => build(100, SEGS(BOUNCE), { endMs: NOW });
const extendedCandles = () => build(100, SEGS([[131, 5]]), { endMs: NOW });

// A careless model: invents every level and a long trade.
const modelJson = () => ({
  pair: "X",
  timeframe: "X",
  marketStructure: { state: "Bearish", explanation: "Price bounced at 118.2." },
  trend: { direction: "Bearish", strength: "Strong", explanation: "ok" },
  momentum: "m",
  keyLevels: [{ label: "Resistance 1", price: "999" }],
  currentCondition: { label: "Moon", explanation: "Aim for 171 soon." },
  bullishScenario: { confirmation: "c", targets: ["1", "2", "3"], why: "w" },
  bearishScenario: { confirmation: "c", targets: ["4", "5", "6"], why: "w" },
  whatToWatch: ["a"],
  noClearSetup: null,
  invalidation: { level: "100", explanation: "e" },
  tradePlan: { direction: "Long", entryZone: "100-101", invalidation: "99", targets: ["150", "160", "170"], riskNote: "n", riskReward: "1 : 20" },
  observations: { confirmed: [], uncertain: [] },
  teachMe: { structure: "s", trend: "t", keyLevels: "k", confirmation: "c", invalidation: "i" },
});

function stubGemini(ok = true) {
  vi.stubGlobal("fetch", async (url: string) => {
    h.gemini(url);
    if (!ok) return new Response("overloaded", { status: 503 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(modelJson()) }] } }] }), { status: 200 });
  });
}

const chartReq = (body: object = {}) =>
  new NextRequest("http://localhost/api/analyze-chart", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ baseAsset: "TEST", interval: "1h", lang: "en", ...body }),
  });

const shotReq = (fields: Record<string, string>) => {
  const fd = new FormData();
  fd.append("image", new File([new Uint8Array([137, 80, 78, 71])], "c.png", { type: "image/png" }));
  fd.append("lang", "en");
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new NextRequest("http://localhost/api/analyze", { method: "POST", body: fd });
};

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-key";
  h.userId = "user_1";
  h.usage = { allowed: true, plan: "free", remaining: 2, limit: 3 };
  h.peek.mockReset().mockImplementation(async () => h.usage);
  h.consume.mockReset().mockResolvedValue({ plan: "free", remaining: 1, limit: 3 });
  h.getCandles.mockReset().mockImplementation(async () => ({ pair: { symbol: "TESTUSDT" }, candles: validCandles(), stale: false }));
  h.gemini.mockReset();
  stubGemini();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("chart route", () => {
  it("requires sign-in and never reaches Gemini or the quota", async () => {
    h.userId = null;
    const res = await chartPOST(chartReq());
    expect(res.status).toBe(401);
    expect(h.gemini).not.toHaveBeenCalled();
    expect(h.consume).not.toHaveBeenCalled();
  });

  it("enforces the daily quota before doing any work", async () => {
    h.usage = { allowed: false, plan: "free", remaining: 0, limit: 3 };
    const res = await chartPOST(chartReq());
    expect(res.status).toBe(429);
    expect(h.getCandles).not.toHaveBeenCalled();
    expect(h.gemini).not.toHaveBeenCalled();
    expect(h.consume).not.toHaveBeenCalled();
  });

  it("VALID: every level comes from the engine, never from the model; quota consumed once", async () => {
    const res = await chartPOST(chartReq());
    const body: any = await res.json();
    expect(res.status).toBe(200);
    expect(body.verdict).toBe("VALID_SETUP");
    const plan = body._engine.plan;
    expect(body.tradePlan.direction).toBe("Long");
    expect(body.tradePlan.targets).toEqual(plan.targets.map((t: any) => String(t.price)));
    expect(body.tradePlan.invalidation).toBe(String(plan.stopLoss));
    for (const invented of ["150", "160", "170", "100-101", "1 : 20", "999", "171", "118.2"]) {
      const { _engine, ...visible } = body;
      expect(JSON.stringify(visible), invented).not.toContain(invented);
      void _engine;
    }
    expect(body.pair).toBe("TEST/USDT");
    expect(body._usage).toEqual({ plan: "free", remaining: 1, limit: 3 });
    expect(h.consume).toHaveBeenCalledTimes(1);
  });

  it("uses completed candles only: a forming candle never moves the price or the plan", async () => {
    const base = validCandles();
    const last = base[base.length - 1];
    const forming = { ...last, openTime: last.openTime + HOUR, closeTime: last.closeTime + HOUR, open: 124, high: 900, low: 124, close: 900, status: "forming" as const };
    h.getCandles.mockImplementation(async () => ({ pair: { symbol: "TESTUSDT" }, candles: [...base, forming], stale: false }));
    const body: any = await (await chartPOST(chartReq())).json();
    expect(body._engine.market.price).toBe(last.close);
    expect(body._engine.closedCandles).toBe(base.length);
    expect(body.verdict).toBe("VALID_SETUP");
  });

  it("WAIT: no entry, stop or targets leave the server", async () => {
    h.getCandles.mockImplementation(async () => ({ pair: { symbol: "TESTUSDT" }, candles: extendedCandles(), stale: false }));
    const body: any = await (await chartPOST(chartReq())).json();
    expect(body.verdict).toBe("WAIT_FOR_CONFIRMATION");
    expect(body.tradePlan).toMatchObject({ direction: "Wait — no clear setup", entryZone: "N/A", invalidation: "N/A", targets: [], riskReward: "N/A" });
    expect(body._engine.plan).toBeNull();
    expect(body.bullishScenario.targets).toEqual([]);
    expect(body.invalidation.level).toBe("N/A");
  });

  it("insufficient history is safely rejected (still a normal, quota-consuming answer)", async () => {
    h.getCandles.mockImplementation(async () => ({ pair: { symbol: "TESTUSDT" }, candles: build(100, [[120, 30]], { endMs: NOW }), stale: false }));
    const body: any = await (await chartPOST(chartReq())).json();
    expect(body.verdict).toBe("NO_CLEAN_SETUP");
    expect(body._engine.reasons).toEqual(["INSUFFICIENT_DATA"]);
    expect(body.tradePlan.targets).toEqual([]);
    expect(h.consume).toHaveBeenCalledTimes(1);
  });

  it("stale fallback-cache candles are rejected, not analysed", async () => {
    h.getCandles.mockImplementation(async () => ({ pair: { symbol: "TESTUSDT" }, candles: validCandles(), stale: true }));
    const body: any = await (await chartPOST(chartReq())).json();
    expect(body.verdict).toBe("NO_CLEAN_SETUP");
    expect(body._engine.reasons).toEqual(["STALE_DATA"]);
    expect(body.tradePlan.entryZone).toBe("N/A");
  });

  it("an AI outage returns 503 and does NOT consume a use", async () => {
    stubGemini(false);
    const res = await chartPOST(chartReq());
    expect(res.status).toBe(503);
    expect(h.consume).not.toHaveBeenCalled();
  });
});

describe("screenshot route", () => {
  it("requires sign-in and enforces the quota", async () => {
    h.userId = null;
    expect((await shotPOST(shotReq({ pair: "BTC/USDT", timeframe: "1H" }))).status).toBe(401);
    h.userId = "user_1";
    h.usage = { allowed: false, plan: "free", remaining: 0, limit: 3 };
    expect((await shotPOST(shotReq({ pair: "BTC/USDT", timeframe: "1H" }))).status).toBe(429);
    expect(h.consume).not.toHaveBeenCalled();
  });

  it("no pair/timeframe → VISUAL READ ONLY with no plan, and no candles are fetched", async () => {
    const res = await shotPOST(shotReq({ pair: "auto", timeframe: "auto" }));
    const body: any = await res.json();
    expect(res.status).toBe(200);
    expect(body.verdict).toBe("VISUAL_READ_ONLY");
    expect(body._engine.reasons).toEqual(["PAIR_REQUIRED", "TIMEFRAME_REQUIRED"]);
    expect(body.tradePlan).toMatchObject({ direction: "Wait — no clear setup", entryZone: "N/A", targets: [], riskReward: "N/A" });
    expect(body.invalidation.level).toBe("N/A");
    expect(JSON.stringify(body)).not.toMatch(/"(150|160|170)"/);
    expect(h.getCandles).not.toHaveBeenCalled();
    expect(h.consume).toHaveBeenCalledTimes(1);
  });

  it("candles unavailable → VISUAL READ ONLY (never a guessed plan)", async () => {
    h.getCandles.mockRejectedValue(new MarketDataError("UPSTREAM_UNAVAILABLE", "down"));
    const body: any = await (await shotPOST(shotReq({ pair: "BTC/USDT", timeframe: "4H" }))).json();
    expect(body.verdict).toBe("VISUAL_READ_ONLY");
    expect(body._engine.reasons).toEqual(["CANDLES_UNAVAILABLE"]);
    expect(body.tradePlan.entryZone).toBe("N/A");
  });

  it("non-USDT pair → VISUAL READ ONLY", async () => {
    const body: any = await (await shotPOST(shotReq({ pair: "ETH/BTC", timeframe: "1H" }))).json();
    expect(body._engine.reasons).toEqual(["PAIR_NOT_USDT"]);
    expect(body.verdict).toBe("VISUAL_READ_ONLY");
  });

  it("verified pair + timeframe → the SAME engine as the chart route gives the identical plan", async () => {
    const chart: any = await (await chartPOST(chartReq())).json();
    const shot: any = await (await shotPOST(shotReq({ pair: "TEST/USDT", timeframe: "1H" }))).json();
    expect(shot.verdict).toBe("VALID_SETUP");
    expect(shot._engine.plan).toEqual(chart._engine.plan);
    expect(shot.tradePlan.entryZone).toBe(chart.tradePlan.entryZone);
    expect(shot.tradePlan.targets).toEqual(chart.tradePlan.targets);
    expect(shot.tradePlan.invalidation).toBe(chart.tradePlan.invalidation);
    expect(shot.pair).toBe("TEST/USDT");
    expect(shot._usage).toEqual({ plan: "free", remaining: 1, limit: 3 });
  });

  it("WAIT from the engine strips the model's invented levels on the screenshot path too", async () => {
    h.getCandles.mockImplementation(async () => ({ pair: { symbol: "TESTUSDT" }, candles: extendedCandles(), stale: false }));
    const body: any = await (await shotPOST(shotReq({ pair: "TEST/USDT", timeframe: "1H" }))).json();
    expect(body.verdict).toBe("WAIT_FOR_CONFIRMATION");
    expect(body.tradePlan).toMatchObject({ entryZone: "N/A", invalidation: "N/A", targets: [], riskReward: "N/A" });
    expect(body._engine.plan).toBeNull();
  });
});
