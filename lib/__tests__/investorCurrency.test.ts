import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { price, signedUsd, usd } from "@/components/investor/fmt";
import {
  MAX_RATE_AGE_MS, currencyKey, effectiveCurrency, formatMoney, formatSignedMoney, formatUnitPrice, isRateUsable, loadCurrency,
  saveCurrency, type RateInfo,
} from "@/lib/investor/currency";
import { FX_CACHE_KEY, FX_FAIL_BACKOFF_SEC, FX_FRESH_MS, FX_RETAIN_SEC, FX_RETRY_MS, FX_URL, getUsdMruRate, isCacheFresh, parseRatePayload } from "@/lib/fxRate";
import { cashBalance, summarize } from "@/lib/investor/calc";
import { emptyDoc, type InvestorDoc } from "@/lib/investor/model";

const H = 3600_000;
const NOW = Date.parse("2026-11-11T12:00:00Z");
const payload = (o: Record<string, unknown> = {}) => ({
  result: "success", base_code: "USD", time_last_update_unix: (NOW - 2 * H) / 1000, rates: { USD: 1, MRU: 39.9 }, ...o,
});
class Store {
  m = new Map<string, string>();
  fail = false;
  getItem(k: string) { if (this.fail) throw new Error("blocked"); return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { if (this.fail) throw new Error("blocked"); this.m.set(k, v); }
}
const info = (o: Partial<RateInfo> = {}): RateInfo => ({ rate: 40, sourceUpdatedAt: NOW - 2 * H, fetchedAt: NOW - 2 * H, ...o });

describe("conversion (display only)", () => {
  it("USDT output is identical to the original formatters", () => {
    for (const n of [0, 1, -1, 1234.5, -0.001, 0.123456, 98765.4321]) {
      expect(formatMoney(n, "USDT", null)).toBe(usd(n));
      expect(formatSignedMoney(n, "USDT", null)).toBe(signedUsd(n));
      expect(formatUnitPrice(n, "USDT", null)).toBe(price(n));
    }
    expect(formatMoney(5, "MRU", null)).toBe(usd(5)); // no rate → never MRU
  });
  it("MRU converts values with the reference rate", () => {
    expect(formatMoney(1234.5, "MRU", 40)).toBe("MRU 49,380.00");
    expect(formatMoney(-10, "MRU", 39.9)).toBe("-MRU 399.00");
    expect(formatSignedMoney(10, "MRU", 40)).toBe("+MRU 400.00");
    expect(formatSignedMoney(-10, "MRU", 40)).toBe("-MRU 400.00");
    expect(formatSignedMoney(0, "MRU", 40)).toBe("MRU 0.00");
  });
  it("unit crypto prices are converted, with adaptive decimals for cheap coins", () => {
    expect(formatUnitPrice(60000, "MRU", 40)).toBe("MRU 2,400,000.00");
    expect(formatUnitPrice(0.1234, "MRU", 40)).toBe("MRU 4.936");
    expect(formatUnitPrice(0.00001234, "MRU", 40)).toBe("MRU 0.0004936");
  });
  it("portfolio total equals the sum of converted parts within rounding", () => {
    const parts = [1234.56, 789.12, 50.01];
    const total = parts.reduce((a, b) => a + b, 0);
    const conv = (n: number) => Number(formatMoney(n, "MRU", 39.9).replace(/[^\d.]/g, ""));
    expect(Math.abs(parts.map(conv).reduce((a, b) => a + b, 0) - conv(total))).toBeLessThan(0.05);
  });
});

describe("persistence per user", () => {
  it("defaults to USDT and round-trips the choice", () => {
    const s = new Store();
    expect(loadCurrency(s, "u1")).toBe("USDT");
    expect(saveCurrency(s, "u1", "MRU")).toBe(true);
    expect(loadCurrency(s, "u1")).toBe("MRU");
    expect(saveCurrency(s, "u1", "USDT")).toBe(true);
    expect(loadCurrency(s, "u1")).toBe("USDT");
  });
  it("uses a user-specific key: one user's choice never reaches another", () => {
    const s = new Store();
    saveCurrency(s, "alice", "MRU");
    expect(currencyKey("alice")).not.toBe(currencyKey("bob"));
    expect(loadCurrency(s, "bob")).toBe("USDT");
    expect(loadCurrency(s, "alice")).toBe("MRU");
  });
  it("garbage, missing user, or blocked storage fall back to USDT without throwing", () => {
    const s = new Store();
    s.setItem(currencyKey("u"), "EUR");
    expect(loadCurrency(s, "u")).toBe("USDT");
    expect(loadCurrency(s, null)).toBe("USDT");
    expect(loadCurrency(null, "u")).toBe("USDT");
    expect(saveCurrency(s, null, "MRU")).toBe(false);
    s.fail = true;
    expect(loadCurrency(s, "u")).toBe("USDT");
    expect(saveCurrency(s, "u", "MRU")).toBe(false);
  });
});

describe("rate validation", () => {
  it("accepts a valid open.er-api.com payload", () => {
    expect(parseRatePayload(payload(), NOW)).toEqual({ rate: 39.9, sourceUpdatedAt: NOW - 2 * H, fetchedAt: NOW });
  });
  it("falls back to time_last_update_utc when the unix field is absent", () => {
    const r = parseRatePayload(payload({ time_last_update_unix: undefined, time_last_update_utc: "Wed, 11 Nov 2026 10:00:01 +0000" }), NOW);
    expect(r?.sourceUpdatedAt).toBe(Date.parse("2026-11-11T10:00:01Z"));
  });
  it("rejects every malformed variant", () => {
    const bad: unknown[] = [
      null, "x", [], {},
      payload({ result: "error" }), payload({ result: undefined }),
      payload({ base_code: "EUR" }), payload({ base_code: undefined }),
      payload({ rates: undefined }), payload({ rates: { USD: 1 } }),
      payload({ rates: { MRU: 0 } }), payload({ rates: { MRU: -3 } }), payload({ rates: { MRU: "39.9" } }),
      payload({ rates: { MRU: NaN } }), payload({ rates: { MRU: Infinity } }),
      payload({ time_last_update_unix: undefined }), payload({ time_last_update_unix: "now" }), payload({ time_last_update_unix: 0 }),
      payload({ time_last_update_unix: undefined, time_last_update_utc: "garbage" }),
    ];
    for (const b of bad) expect(parseRatePayload(b, NOW)).toBeNull();
  });
});

describe("missing and stale rates fall back to USDT", () => {
  it("48-hour limit on the source timestamp", () => {
    expect(isRateUsable(info({ sourceUpdatedAt: NOW - 47 * H }), NOW)).toBe(true);
    expect(isRateUsable(info({ sourceUpdatedAt: NOW - MAX_RATE_AGE_MS }), NOW)).toBe(true);
    expect(isRateUsable(info({ sourceUpdatedAt: NOW - 49 * H }), NOW)).toBe(false);
    expect(isRateUsable(info({ sourceUpdatedAt: NOW + 3 * H }), NOW)).toBe(false); // implausible future timestamp
  });
  it("missing or invalid rates are never usable (there is no hardcoded fallback)", () => {
    expect(isRateUsable(null, NOW)).toBe(false);
    expect(isRateUsable(undefined, NOW)).toBe(false);
    expect(isRateUsable(info({ rate: 0 }), NOW)).toBe(false);
    expect(isRateUsable(info({ rate: NaN }), NOW)).toBe(false);
    const src = readFileSync("lib/fxRate.ts", "utf8") + readFileSync("lib/investor/currency.ts", "utf8") + readFileSync("components/investor/currency.tsx", "utf8");
    expect(src).not.toMatch(/\b(3[5-9]|4[0-9])\.\d+\b/); // no literal rate anywhere
  });
  it("MRU is shown only with a usable rate; otherwise USDT", () => {
    expect(effectiveCurrency("MRU", info(), NOW)).toBe("MRU");
    expect(effectiveCurrency("MRU", null, NOW)).toBe("USDT");
    expect(effectiveCurrency("MRU", info({ sourceUpdatedAt: NOW - 60 * H }), NOW)).toBe("USDT");
    expect(effectiveCurrency("USDT", info(), NOW)).toBe("USDT");
  });
});

describe("server rate: Redis cache (12h), upstream failure, validation", () => {
  const mkRedis = (initial?: unknown) => {
    const store = new Map<string, unknown>(initial ? [[FX_CACHE_KEY, initial]] : []);
    return {
      store,
      get: vi.fn(async (k: string) => (store.get(k) ?? null) as never),
      set: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
    };
  };
  const okFetch = (body: unknown = payload()) => vi.fn(async () => ({ ok: true, json: async () => body }) as Response);
  const failFetch = () => vi.fn(async () => { throw new Error("network"); });

  it("a cache younger than 12 hours is served without calling the upstream", async () => {
    const redis = mkRedis(info({ fetchedAt: NOW - 11 * H }));
    const f = okFetch();
    const r = await getUsdMruRate({ redis, fetchFn: f as never, now: NOW });
    expect(f).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, info: { rate: 40, stale: false } });
  });
  it("an expired cache is refreshed from open.er-api.com and stored", async () => {
    const redis = mkRedis(info({ fetchedAt: NOW - 13 * H, sourceUpdatedAt: NOW - 14 * H }));
    const f = okFetch();
    const r = await getUsdMruRate({ redis, fetchFn: f as never, now: NOW });
    expect((f.mock.calls as unknown as string[][])[0][0]).toBe(FX_URL);
    expect(FX_URL).toBe("https://open.er-api.com/v6/latest/USD");
    expect(FX_FRESH_MS).toBe(12 * H);
    expect(r).toMatchObject({ ok: true, info: { rate: 39.9, fetchedAt: NOW } });
    expect(redis.store.get(FX_CACHE_KEY)).toMatchObject({ rate: 39.9 });
  });
  it("empty cache + good upstream works; empty cache + failing upstream is unavailable (no made-up rate)", async () => {
    expect((await getUsdMruRate({ redis: mkRedis(), fetchFn: okFetch() as never, now: NOW })).ok).toBe(true);
    expect(await getUsdMruRate({ redis: mkRedis(), fetchFn: failFetch() as never, now: NOW })).toEqual({ ok: false });
  });
  it("upstream failure reuses the last valid cached rate, flagged stale", async () => {
    const redis = mkRedis(info({ fetchedAt: NOW - 20 * H, sourceUpdatedAt: NOW - 20 * H }));
    const r = await getUsdMruRate({ redis, fetchFn: failFetch() as never, now: NOW });
    expect(r).toMatchObject({ ok: true, info: { rate: 40, stale: true } });
    const http500 = vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response);
    expect(await getUsdMruRate({ redis, fetchFn: http500 as never, now: NOW })).toMatchObject({ ok: true, info: { stale: true } });
  });
  it("an invalid upstream payload is ignored and never cached over the good rate", async () => {
    const redis = mkRedis(info({ fetchedAt: NOW - 20 * H }));
    const r = await getUsdMruRate({ redis, fetchFn: okFetch(payload({ base_code: "EUR" })) as never, now: NOW });
    expect(r).toMatchObject({ ok: true, info: { rate: 40, stale: true } });
    expect(redis.set.mock.calls.some((c) => c[0] === FX_CACHE_KEY)).toBe(false); // the good rate is never overwritten
    expect(redis.store.get(FX_CACHE_KEY)).toMatchObject({ rate: 40 });
  });
  it("a cached rate whose source update is older than 48h is refused when the upstream is down", async () => {
    const redis = mkRedis(info({ fetchedAt: NOW - 13 * H, sourceUpdatedAt: NOW - 50 * H }));
    expect(await getUsdMruRate({ redis, fetchFn: failFetch() as never, now: NOW })).toEqual({ ok: false });
  });
  it("an upstream whose own timestamp is older than 48h is not served", async () => {
    const old = payload({ time_last_update_unix: (NOW - 72 * H) / 1000 });
    expect(await getUsdMruRate({ redis: mkRedis(), fetchFn: okFetch(old) as never, now: NOW })).toEqual({ ok: false });
  });
  it("a Redis outage does not block fetching", async () => {
    const redis = { get: vi.fn(async () => { throw new Error("redis down"); }), set: vi.fn(async () => { throw new Error("redis down"); }) };
    expect((await getUsdMruRate({ redis: redis as never, fetchFn: okFetch() as never, now: NOW })).ok).toBe(true);
    expect((await getUsdMruRate({ redis: null, fetchFn: okFetch() as never, now: NOW })).ok).toBe(true);
  });
  it("corrupt cache entries are ignored", async () => {
    const redis = mkRedis({ rate: "x" });
    expect((await getUsdMruRate({ redis, fetchFn: okFetch() as never, now: NOW })).ok).toBe(true);
  });
  it("the API route is signed-in only and returns {ok:false}, never a default rate, on failure", () => {
    const route = readFileSync("app/api/fx/usd-mru/route.ts", "utf8");
    expect(route).toContain("requireUser");
    expect(route).toContain("getUsdMruRate");
    expect(route).toContain("{ ok: false }");
  });
});

describe("Investor calculations and data are unchanged", () => {
  const d: InvestorDoc = {
    ...emptyDoc(),
    purchases: [{ id: "p1", asset: "BTC", date: "2026-01-01", qty: 0.5, price: 60000, fee: 30 }],
    sales: [{ id: "s1", asset: "BTC", date: "2026-02-01", qty: 0.1, price: 70000, fee: 7 }],
    cash: [{ id: "c1", date: "2026-01-01", type: "deposit", amount: 40000 }],
  };
  it("USDT results are exactly the same numbers as before", () => {
    const s = summarize(d, { BTC: { price: 65000, source: "binance" } } as never);
    expect(s.invested).toBeCloseTo(0.4 * 60060, 6);
    expect(s.value).toBeCloseTo(0.4 * 65000, 6);
    expect(s.realized).toBeCloseTo(0.1 * 70000 - 7 - 0.1 * 60060, 6);
    expect(cashBalance(d)).toBeCloseTo(40000 - 30030 + (7000 - 7), 6);
  });
  it("formatting never changes the stored document", () => {
    const before = JSON.stringify(d);
    formatMoney(123, "MRU", 40); formatUnitPrice(5, "MRU", 40); formatSignedMoney(-1, "MRU", 40);
    expect(JSON.stringify(d)).toBe(before);
  });
  it("calculation, model and document-API code never reference the display currency", () => {
    for (const f of ["lib/investor/calc.ts", "lib/investor/model.ts", "lib/investor/dca.ts", "lib/investor/risk.ts", "lib/investor/performance.ts", "app/api/me/investor/route.ts", "components/investor/useInvestor.ts"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/\bMRU\b|displayCurrency|fxRate|useMoney|investor\/currency/);
    }
  });
});

describe("Investor screens", () => {
  const read = (f: string) => readFileSync(f, "utf8");
  it("every display uses the currency-aware formatters", () => {
    for (const f of ["Dashboard", "Ledger", "Performance", "Risk", "PriceBadge"]) expect(read(`components/investor/${f}.tsx`), f).toContain("useMoney()");
    expect(read("components/investor/Dca.tsx")).toContain("useMoney()"); // plan cards
    expect(read("components/investor/Performance.tsx").match(/useMoney\(\)/g)!.length).toBeGreaterThanOrEqual(2); // chart axis + tables
  });
  it("forms and price inputs stay in USDT and say so", () => {
    expect(read("components/investor/TradeForm.tsx")).not.toContain("useMoney");
    expect(read("components/investor/TradeForm.tsx")).toContain("<UsdtNote />");
    expect(read("components/investor/Ledger.tsx")).toContain("<UsdtNote />"); // cash form
    expect(read("components/investor/Dca.tsx")).toContain("<UsdtNote />"); // plan form
    expect(read("components/investor/Dashboard.tsx")).toContain("<UsdtNote />"); // manual price inputs
  });
  it("the page offers the selector with the rate, update time, and the required attribution", () => {
    expect(read("app/investor/page.tsx")).toContain("<CurrencyBar />");
    expect(read("app/investor/page.tsx")).toContain("<CurrencyProvider>");
    const bar = read("components/investor/currency.tsx");
    expect(bar).toContain("https://www.exchangerate-api.com");
    expect(bar).toContain("investor.rateLine");
    expect(bar).toContain("sourceUpdatedAt");
    const i18n = read("lib/i18nInvestor.ts");
    expect((i18n.match(/attribution: "Rates By Exchange Rate API"/g) ?? []).length).toBe(3);
    expect(i18n).toMatch(/not a Binance P2P/);
  });
  it("MRU is fetched only when chosen, and only the Investor page is wired", () => {
    expect(read("components/investor/currency.tsx")).toContain('if (choice !== "MRU") return;');
    expect(read("components/investor/currency.tsx")).toContain("/api/fx/usd-mru");
    for (const f of ["app/journal/page.tsx", "app/trade-plan/page.tsx", "app/radar/page.tsx", "app/account/page.tsx"]) expect(read(f), f).not.toMatch(/investor\/currency|useMoney|fxRate/);
  });
  it("there is no PDF or print output in Atlas Investor to convert", () => {
    for (const f of ["app/investor/page.tsx", "components/investor/Dashboard.tsx", "components/investor/Ledger.tsx", "components/investor/Performance.tsx", "components/investor/Dca.tsx", "components/investor/Risk.tsx"]) {
      expect(read(f), f).not.toMatch(/jspdf|window\.print|@media print|analysisPdf/i);
    }
  });
});

describe("cache freshness vs retention", () => {
  const mk = (initial?: unknown) => {
    const store = new Map<string, unknown>(initial ? [[FX_CACHE_KEY, initial]] : []);
    const ttl = new Map<string, number | undefined>();
    return {
      store, ttl,
      get: vi.fn(async (k: string) => (store.get(k) ?? null) as never),
      set: vi.fn(async (k: string, v: unknown, o?: { ex: number }) => { store.set(k, v); ttl.set(k, o?.ex); }),
    };
  };
  const ok = (body: unknown) => vi.fn(async () => ({ ok: true, json: async () => body }) as Response);
  const down = () => vi.fn(async () => { throw new Error("network"); });

  it("retention is 72 hours, separate from the 12-hour freshness (and covers the 48-hour limit)", async () => {
    expect(FX_FRESH_MS).toBe(12 * H);
    expect(FX_RETAIN_SEC).toBe(72 * 3600);
    expect(FX_RETAIN_SEC * 1000).toBeGreaterThanOrEqual(MAX_RATE_AGE_MS);
    const redis = mk();
    await getUsdMruRate({ redis, fetchFn: ok(payload()) as never, now: NOW });
    expect(redis.ttl.get(FX_CACHE_KEY)).toBe(72 * 3600);
  });

  it("cache expiry: fresh just under 12h, refreshed at 12h", () => {
    const c = { ...info(), fetchedAt: NOW - 12 * H + 1000 };
    expect(isCacheFresh(c, NOW)).toBe(true);
    expect(isCacheFresh({ ...c, fetchedAt: NOW - 12 * H }, NOW)).toBe(false);
    expect(isCacheFresh({ ...c, fetchedAt: NOW + 5000 }, NOW)).toBe(false); // clock oddity → ask again
  });

  it("follows the provider's schedule: refreshes after the announced next update, but not more than every 15 min", () => {
    const c = { ...info({ fetchedAt: NOW - 2 * H }), nextUpdateAt: NOW - 60_000 };
    expect(isCacheFresh(c, NOW)).toBe(false); // provider should have published; look again
    expect(isCacheFresh({ ...c, fetchedAt: NOW - FX_RETRY_MS + 1000 }, NOW)).toBe(true); // just looked, provider not out yet
    expect(isCacheFresh({ ...c, nextUpdateAt: NOW + H }, NOW)).toBe(true); // next update still in the future
  });

  it("stores the provider's next-update time and asks again once it has passed", async () => {
    const body = payload({ time_next_update_unix: (NOW + 3 * H) / 1000 });
    const redis = mk();
    await getUsdMruRate({ redis, fetchFn: ok(body) as never, now: NOW });
    expect(redis.store.get(FX_CACHE_KEY)).toMatchObject({ nextUpdateAt: NOW + 3 * H });
    const f = ok(payload({ time_last_update_unix: (NOW + 3 * H) / 1000 }));
    await getUsdMruRate({ redis, fetchFn: f as never, now: NOW + 2 * H }); // before the schedule: served from cache
    expect(f).not.toHaveBeenCalled();
    await getUsdMruRate({ redis, fetchFn: f as never, now: NOW + 3 * H + 20 * 60_000 }); // after it: refreshed
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("upstream failure after 12 hours: the retained rate is reused (stale) until its source is 48h old", async () => {
    const redis = mk({ ...info({ fetchedAt: NOW - 13 * H, sourceUpdatedAt: NOW - 14 * H }) });
    const r = await getUsdMruRate({ redis, fetchFn: down() as never, now: NOW });
    expect(r).toMatchObject({ ok: true, info: { rate: 40, stale: true } });
    expect(redis.store.get(FX_CACHE_KEY)).toMatchObject({ rate: 40 }); // untouched
  });

  it("stale fallback boundaries: 47h usable, 48h usable, 49h refused — even though 72h retention still holds it", async () => {
    for (const [hours, usable] of [[47, true], [48, true], [49, false], [71, false]] as const) {
      const redis = mk({ ...info({ fetchedAt: NOW - hours * H, sourceUpdatedAt: NOW - hours * H }) });
      const r = await getUsdMruRate({ redis, fetchFn: down() as never, now: NOW });
      expect(r.ok, `${hours}h`).toBe(usable);
    }
  });

  it("never overwrites a valid cached rate with invalid upstream data", async () => {
    const good = info({ fetchedAt: NOW - 20 * H, sourceUpdatedAt: NOW - 20 * H });
    const bad: unknown[] = [payload({ result: "error" }), payload({ base_code: "EUR" }), payload({ rates: { MRU: 0 } }), payload({ time_last_update_unix: undefined }), "oops", null];
    for (const b of bad) {
      const redis = mk(good);
      const r = await getUsdMruRate({ redis, fetchFn: ok(b) as never, now: NOW });
      expect(r).toMatchObject({ ok: true, info: { rate: 40, stale: true } });
      expect(redis.store.get(FX_CACHE_KEY)).toEqual(good);
    }
    const http500 = vi.fn(async () => ({ ok: false, json: async () => ({}) }) as Response);
    const redis = mk(good);
    await getUsdMruRate({ redis, fetchFn: http500 as never, now: NOW });
    expect(redis.store.get(FX_CACHE_KEY)).toEqual(good);
  });

  it("never replaces a rate with older provider data", async () => {
    const cached = info({ fetchedAt: NOW - 13 * H, sourceUpdatedAt: NOW - 3 * H });
    const redis = mk(cached);
    const older = payload({ time_last_update_unix: (NOW - 30 * H) / 1000, rates: { MRU: 12 } });
    const r = await getUsdMruRate({ redis, fetchFn: ok(older) as never, now: NOW });
    expect(r).toMatchObject({ ok: true, info: { rate: 40 } });
    expect(redis.store.get(FX_CACHE_KEY)).toMatchObject({ rate: 40, sourceUpdatedAt: NOW - 3 * H });
  });

  it("after a failed call the provider is not hammered (short back-off marker), and the retained rate still serves", async () => {
    const redis = mk({ ...info({ fetchedAt: NOW - 13 * H, sourceUpdatedAt: NOW - 14 * H }) });
    const f = down();
    await getUsdMruRate({ redis, fetchFn: f as never, now: NOW });
    expect(redis.ttl.get("fx:usd-mru:attempt")).toBe(FX_FAIL_BACKOFF_SEC);
    const r = await getUsdMruRate({ redis, fetchFn: f as never, now: NOW + 1000 });
    expect(f).toHaveBeenCalledTimes(1); // second request did not call the provider again
    expect(r).toMatchObject({ ok: true, info: { stale: true } });
  });

  it("the response shape is unchanged (no internal fields leak to the page)", async () => {
    const redis = mk();
    const r = await getUsdMruRate({ redis, fetchFn: ok(payload({ time_next_update_unix: (NOW + H) / 1000 })) as never, now: NOW });
    expect(r.ok && Object.keys(r.info).sort()).toEqual(["fetchedAt", "rate", "sourceUpdatedAt", "stale"]);
  });
});
