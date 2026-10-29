import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

// A tiny in-memory stand-in for Upstash Redis, shared by every "user".
const db = new Map<string, unknown>();
const redis = { get: async (k: string) => db.get(k) ?? null, set: async (k: string, v: unknown) => { db.set(k, v); return "OK"; } };
let currentUser: string | null = "user_a";
const plans: Record<string, string> = {};

vi.mock("@/lib/userStore", () => ({
  requireUser: async () => (currentUser ? { userId: currentUser, redis } : NextResponse.json({ error: "Unauthorized" }, { status: 401 })),
}));
vi.mock("@/lib/plan", () => ({ getUserPlan: async (id: string) => plans[id] ?? "free" }));

import { GET, POST } from "@/app/api/me/watchlist/route";

const post = (body: unknown) => POST(new Request("http://x/api/me/watchlist", { method: "POST", body: JSON.stringify(body) }));
const get = async () => (await GET()).json();

beforeEach(() => {
  db.clear();
  for (const k of Object.keys(plans)) delete plans[k];
  currentUser = "user_a";
});

describe("/api/me/watchlist", () => {
  it("requires sign-in", async () => {
    currentUser = null;
    expect((await GET()).status).toBe(401);
    expect((await post({ op: "add", symbol: "BTC" })).status).toBe(401);
  });

  it("add / remove / persist", async () => {
    await post({ op: "add", symbol: "btc" });
    await post({ op: "add", symbol: "ETH/USDT" });
    await post({ op: "add", symbol: "BTCUSDT" });
    let body = await get();
    expect(body.items.map((i: { symbol: string }) => i.symbol)).toEqual(["BTCUSDT", "ETHUSDT"]);
    expect(body.limit).toBe(10);
    await post({ op: "remove", symbol: "BTC" });
    body = await get();
    expect(body.items.map((i: { symbol: string }) => i.symbol)).toEqual(["ETHUSDT"]);
  });

  it("free users stop at 10 with a 409 'limit' (not a crash); Elite goes to 50", async () => {
    for (let i = 0; i < 10; i++) expect((await post({ op: "add", symbol: `FREE${i}` })).status).toBe(200);
    const over = await post({ op: "add", symbol: "ELEVENTH" });
    expect(over.status).toBe(409);
    const ob = await over.json();
    expect(ob.error).toBe("limit");
    expect(ob.limit).toBe(10);
    expect(ob.items).toHaveLength(10);

    currentUser = "user_elite";
    plans.user_elite = "elite";
    for (let i = 0; i < 50; i++) expect((await post({ op: "add", symbol: `ELT${i}` })).status).toBe(200);
    expect((await post({ op: "add", symbol: "ONEMORE" })).status).toBe(409);
    expect((await get()).limit).toBe(50);
    expect((await get()).items).toHaveLength(50);
  });

  it("merge adds a browser list without duplicates and reports what did not fit", async () => {
    await post({ op: "add", symbol: "BTC" });
    const res = await post({ op: "merge", symbols: ["BTC", "ETH", "SOL", "ETH", ...Array.from({ length: 12 }, (_, i) => `M${i}`)] });
    const body = await res.json();
    expect(body.items).toHaveLength(10);
    expect(new Set(body.items.map((i: { symbol: string }) => i.symbol)).size).toBe(10);
    expect(body.dropped).toBe(5);
  });

  it("one user cannot read or change another user's list", async () => {
    await post({ op: "add", symbol: "BTC" });
    await post({ op: "seen", seen: { BTCUSDT: "breakout" } });
    currentUser = "user_b";
    expect((await get()).items).toEqual([]);
    // Trying to smuggle in someone else's id has no effect: the key comes from the session only.
    await post({ op: "add", symbol: "DOGE", userId: "user_a", key: "user:user_a:watchlist" });
    await post({ op: "remove", symbol: "BTC" });
    expect((await get()).items.map((i: { symbol: string }) => i.symbol)).toEqual(["DOGEUSDT"]);
    currentUser = "user_a";
    const a = await get();
    expect(a.items.map((i: { symbol: string }) => i.symbol)).toEqual(["BTCUSDT"]);
    expect(a.seen).toEqual({ BTCUSDT: "breakout" });
  });

  it("rejects bad requests", async () => {
    expect((await post({ op: "add", symbol: "BTC/ETH" })).status).toBe(400);
    expect((await post({ op: "nope" })).status).toBe(400);
    expect((await post({ op: "merge", symbols: "x" })).status).toBe(400);
    const bad = await POST(new Request("http://x", { method: "POST", body: "{not json" }));
    expect(bad.status).toBe(400);
  });
});
