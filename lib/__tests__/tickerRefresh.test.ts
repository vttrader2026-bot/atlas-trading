import { describe, it, expect, vi } from "vitest";
import { startTickerRefresh, TICKER_REFRESH_MS, type RefreshEnv } from "@/lib/tickerRefresh";

function fakeEnv() {
  let visible = true;
  let tick: (() => void) | null = null;
  let vis: (() => void) | null = null;
  let cleared = false, removed = false;
  let ms = 0;
  const env: RefreshEnv = {
    setInterval: (fn, m) => { tick = fn; ms = m; return 1; },
    clearInterval: () => { cleared = true; },
    isVisible: () => visible,
    onVisibilityChange: (fn) => { vis = fn; return () => { removed = true; }; },
  };
  return {
    env,
    setVisible: (v: boolean) => { visible = v; },
    tick: () => tick?.(), fireVisibility: () => vis?.(),
    get ms() { return ms; }, get cleared() { return cleared; }, get removed() { return removed; },
  };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("Trade Feed price refresh", () => {
  it("fetches immediately, then on a 15 second interval", async () => {
    const e = fakeEnv();
    const fetchTicker = vi.fn(async (s: string) => ({ s, p: 1 }));
    const onUpdate = vi.fn();
    startTickerRefresh({ symbols: ["PEPEUSDT", "BTCUSDT"], fetchTicker, onUpdate, env: e.env });
    await flush();
    expect(e.ms).toBe(TICKER_REFRESH_MS);
    expect(TICKER_REFRESH_MS).toBe(15_000);
    expect(fetchTicker).toHaveBeenCalledTimes(2);
    e.tick(); await flush();
    expect(fetchTicker).toHaveBeenCalledTimes(4);
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });
  it("delivers the new PEPE price on each refresh (not frozen)", async () => {
    const e = fakeEnv();
    let price = 0.00000712;
    const seen: number[] = [];
    startTickerRefresh({ symbols: ["PEPEUSDT"], fetchTicker: async () => ({ p: price }), onUpdate: (f) => seen.push(f.PEPEUSDT.p), env: e.env });
    await flush();
    price = 0.00000688; e.tick(); await flush();
    expect(seen).toEqual([0.00000712, 0.00000688]);
  });
  it("does not poll while the tab is hidden, and refreshes when it becomes visible", async () => {
    const e = fakeEnv();
    const fetchTicker = vi.fn(async () => ({ p: 1 }));
    startTickerRefresh({ symbols: ["PEPEUSDT"], fetchTicker, onUpdate: () => {}, env: e.env });
    await flush();
    e.setVisible(false); e.tick(); e.fireVisibility(); await flush();
    expect(fetchTicker).toHaveBeenCalledTimes(1);
    e.setVisible(true); e.fireVisibility(); await flush();
    expect(fetchTicker).toHaveBeenCalledTimes(2);
  });
  it("a failed refresh omits that symbol (caller keeps its last good price); other symbols still update", async () => {
    const e = fakeEnv();
    let fail = false;
    const updates: Record<string, { p: number }>[] = [];
    startTickerRefresh({
      symbols: ["PEPEUSDT", "BTCUSDT"],
      fetchTicker: async (s) => { if (fail && s === "PEPEUSDT") throw new Error("down"); return { p: 1 }; },
      onUpdate: (f) => updates.push(f), env: e.env,
    });
    await flush();
    fail = true; e.tick(); await flush();
    expect(Object.keys(updates[1])).toEqual(["BTCUSDT"]);
    // merging as the page does keeps PEPE's last good value
    const merged = updates.reduce((acc, u) => ({ ...acc, ...u }), {} as Record<string, { p: number }>);
    expect(merged.PEPEUSDT).toEqual({ p: 1 });
  });
  it("stop cleans up the interval and listener and ignores late responses", async () => {
    const e = fakeEnv();
    const onUpdate = vi.fn();
    const stop = startTickerRefresh({ symbols: ["PEPEUSDT"], fetchTicker: async () => ({ p: 1 }), onUpdate, env: e.env });
    stop();
    await flush();
    expect(e.cleared && e.removed).toBe(true);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
