// ACTIVE-SIGNAL-v1: Active Signal badges for Radar / Market Intelligence.
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { authHref, indexFromPublic, isActiveSignal, normalizeSymbol, publicActiveSignals, signalHref } from "@/lib/activeSignals";
import { feedForViewer, closeSignal, type PublishedTrade } from "@/lib/tradeFeed";

const sig = (over: Partial<PublishedTrade>): PublishedTrade => ({
  id: "s1", createdAt: 1000, pair: "BTC/USDT", direction: "Long", timeframe: "4H", entryZone: "100-110", invalidation: "90", tp1: "120", tp2: "130", tp3: "140", reasoning: "r", ...over,
});

describe("symbol matching", () => {
  it("treats BTCUSDT, BTC/USDT, btc-usdt and BTC as the same coin", () => {
    for (const s of ["BTCUSDT", "BTC/USDT", "btc-usdt", "BTC_USDT", " BTC ", "BTC"]) expect(normalizeSymbol(s)).toBe("BTC");
  });
  it("does not mangle other coins or short names", () => {
    expect(normalizeSymbol("1000PEPEUSDT")).toBe("1000PEPE");
    expect(normalizeSymbol("USDT")).toBe("USDT");
    expect(normalizeSymbol("TRXUSDT")).toBe("TRX");
    expect(normalizeSymbol("")).toBe("");
    expect(normalizeSymbol(null)).toBe("");
  });
});

describe("which setups count as active", () => {
  it("open setups are active, and TP1 / TP2 progress keeps them active", () => {
    expect(isActiveSignal(sig({}))).toBe(true);
    expect(isActiveSignal(sig({ status: "open", hitLevels: ["TP1"] }))).toBe(true);
    expect(isActiveSignal(sig({ status: "open", hitLevels: ["TP1", "TP2"] }))).toBe(true);
  });
  it("closed, stopped, finished (TP3) and cancelled setups are not active", () => {
    expect(isActiveSignal(sig({ status: "closed" }))).toBe(false);
    expect(isActiveSignal(sig({ hitLevels: ["SL"] }))).toBe(false);
    expect(isActiveSignal(sig({ hitLevels: ["TP1", "TP2", "TP3"] }))).toBe(false);
    expect(isActiveSignal(closeSignal(sig({ tier: "elite" }), "CANCELLED", "x", 5))).toBe(false);
  });
});

describe("public data", () => {
  const stored = [
    sig({ id: "free1", pair: "BTCUSDT", createdAt: 5 }),
    sig({ id: "elite1", pair: "LINK/USDT", tier: "elite", createdAt: 6, hitLevels: ["TP1"] }),
    sig({ id: "elite-old", pair: "LINKUSDT", tier: "elite", createdAt: 2 }),
    sig({ id: "closedElite", pair: "ADAUSDT", tier: "elite", status: "closed" }),
    sig({ id: "sl", pair: "SOLUSDT", hitLevels: ["SL"] }),
  ];
  it("lists each coin once with its newest active setup, ELITE included, and skips inactive ones", () => {
    const list = publicActiveSignals(stored);
    expect(list).toEqual([
      { symbol: "BTC", id: "free1" },
      { symbol: "LINK", id: "elite1" },
    ]);
  });
  it("exposes ONLY symbol and id: no entry, stop, targets, direction, tier, reasoning or timeframe", () => {
    for (const e of publicActiveSignals(stored)) expect(Object.keys(e).sort()).toEqual(["id", "symbol"]);
    const json = JSON.stringify(publicActiveSignals(stored));
    expect(json).not.toMatch(/entryZone|invalidation|tp1|tp2|tp3|direction|tier|reasoning|timeframe|hitLevels/i);
    expect(json).not.toContain("100-110");
  });
  it("ignores malformed entries", () => {
    expect(publicActiveSignals([null as never, { pair: "BTCUSDT" } as never])).toEqual([]);
    expect(indexFromPublic("nope").size).toBe(0);
    expect(indexFromPublic([{ symbol: "BTC", id: "x" }, { symbol: 1 }]).get("BTC")).toEqual({ id: "x" });
  });
  it("a FREE viewer's feed rules are untouched: open ELITE setups are still locked previews with no levels", () => {
    const { trades, locked } = feedForViewer([sig({ id: "e1", pair: "LINKUSDT", tier: "elite" })], false);
    expect(trades).toHaveLength(0);
    expect(locked[0]).not.toHaveProperty("entryZone");
    expect(locked[0]).not.toHaveProperty("direction");
  });
});

describe("registration / sign-in redirect", () => {
  it("deep link and auth links keep the exact signal id", () => {
    expect(signalHref("abc-123")).toBe("/trade-feed?signal=abc-123");
    for (const kind of ["sign-in", "sign-up"] as const) {
      const href = authHref(kind, "abc-123");
      const u = new URL(href, "https://x.test");
      expect(u.pathname).toBe(`/${kind}`);
      expect(u.searchParams.get("redirect_url")).toBe("/trade-feed?signal=abc-123");
    }
    expect(authHref("sign-in", null)).toBe("/sign-in");
  });
  it("odd ids cannot break out of the redirect value", () => {
    const u = new URL(authHref("sign-up", "a&redirect_url=https://evil.test"), "https://x.test");
    expect(u.searchParams.get("redirect_url")).toBe("/trade-feed?signal=a%26redirect_url%3Dhttps%3A%2F%2Fevil.test");
  });
});

const h = vi.hoisted(() => ({ stored: [] as unknown[], fail: false }));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async lrange() {
      if (h.fail) throw new Error("down");
      return h.stored;
    }
  },
}));

describe("public API route", () => {
  it("answers a logged-out request with only { symbol, id }", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://r.test";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t";
    h.stored = [sig({ id: "e1", pair: "LINKUSDT", tier: "elite" }), sig({ id: "c", pair: "ADAUSDT", status: "closed" })];
    const { GET } = await import("@/app/api/active-signals/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signals: [{ symbol: "LINK", id: "e1" }] });
    expect(res.headers.get("cache-control")).toContain("s-maxage");
  });
  it("fails quietly (no badges) when the store is down or unconfigured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/active-signals/route");
    h.fail = true;
    expect(await (await GET()).json()).toEqual({ signals: [] });
    h.fail = false;
    delete process.env.UPSTASH_REDIS_REST_URL;
    expect(await (await GET()).json()).toEqual({ signals: [] });
  });
  it("needs no sign-in: the route never touches Clerk or the viewer's plan", () => {
    const src = readFileSync("app/api/active-signals/route.ts", "utf8");
    expect(src).not.toMatch(/clerk|getUserPlan|auth\(/i);
  });
});

describe("wiring", () => {
  const radar = readFileSync("app/radar/page.tsx", "utf8");
  const mi = readFileSync("app/market-intelligence/page.tsx", "utf8");
  const feed = readFileSync("app/trade-feed/page.tsx", "utf8");
  const hook = readFileSync("lib/useActiveSignals.ts", "utf8");
  it("Radar and Market Intelligence show the badge on desktop and mobile rows", () => {
    expect((radar.match(/<ActiveSignalBadge/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((mi.match(/<ActiveSignalBadge/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it("uses the public endpoint once, cached, with no sign-in condition (visitors see badges)", () => {
    expect(hook).toContain('"/api/active-signals"');
    expect(hook).toContain("TTL_MS");
    expect(hook).toContain("inflight");
    expect(hook).not.toMatch(/useAuth|isSignedIn/);
  });
  it("the logged-out Trade Feed prompt keeps the signal id for sign-in and sign-up", () => {
    expect(feed).toContain('authHref("sign-in", focusId)');
    expect(feed).toContain('authHref("sign-up", focusId)');
    expect(feed).toContain("tradeFeed.signalSignInPrompt");
  });
  it("Trade Feed highlights the linked setup", () => {
    expect(feed).toContain('get("signal")');
    expect(feed).toContain("id={`signal-${trade.id}`}");
    expect(feed).toContain("id={`signal-${item.id}`}");
  });
});
