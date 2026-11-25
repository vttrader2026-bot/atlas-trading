import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCandles } from "@/lib/chartCandlesApi";
import { Slot } from "@/components/charts/hooks/chartCore";
import { EMA_COLORS, EMA_DEFS } from "@/lib/chartIndicators";

const candle = { openTime: 1, closeTime: 2, open: 1, high: 2, low: 1, close: 1.5, volume: 1, quoteVolume: 1, status: "closed" };
afterEach(() => vi.unstubAllGlobals());

describe("fetchCandles (extracted from ChartWorkspace)", () => {
  it("requests /api/chart/klines with base symbol, USDT quote, interval (incl. 1M) and the history limit", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candles: [candle], stale: true }) });
    vi.stubGlobal("fetch", fn);
    const r = await fetchCandles("BTCUSDT", "1M");
    expect(r).toEqual({ candles: [candle], stale: true });
    const url = new URL(fn.mock.calls[0][0], "http://x");
    expect(url.pathname).toBe("/api/chart/klines");
    expect(Object.fromEntries(url.searchParams)).toEqual({ symbol: "BTC", quote: "USDT", interval: "1M", limit: "500" });
  });
  it("maps failures to codes without fabricating candles", async () => {
    await expect(fetchCandles("bad", "1h")).rejects.toMatchObject({ code: "UNSUPPORTED_PAIR" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(fetchCandles("BTCUSDT", "1h")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "UPSTREAM_UNAVAILABLE" }) }));
    await expect(fetchCandles("BTCUSDT", "1h")).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error("x"); } }));
    await expect(fetchCandles("BTCUSDT", "1h")).rejects.toMatchObject({ code: "UNKNOWN_ERROR" });
  });
});

describe("shared chart core pieces", () => {
  it("Slot reads like a ref and writes through set()", () => {
    const s = new Slot<number | null>(null);
    expect(s.current).toBeNull();
    s.set(5);
    expect(s.current).toBe(5);
  });
  it("EMA overlay definitions: 20/50/200 with a color per period", () => {
    expect(EMA_DEFS.map((e) => e.period)).toEqual([20, 50, 200]);
    for (const e of EMA_DEFS) expect(e.period in EMA_COLORS).toBe(true);
  });
});
