import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const db = new Map<string, unknown>();
const redis = { get: async (k: string) => db.get(k) ?? null, set: async (k: string, v: unknown) => { db.set(k, v); return "OK"; } };
let currentUser: string | null = "user_a";
vi.mock("@/lib/userStore", () => ({
  requireUser: async () => (currentUser ? { userId: currentUser, redis } : NextResponse.json({ error: "Unauthorized" }, { status: 401 })),
}));

import { GET, POST } from "@/app/api/me/signals/route";
const post = (body: unknown) => POST(new Request("http://x/api/me/signals", { method: "POST", body: JSON.stringify(body) }));
const get = async () => (await GET()).json();

beforeEach(() => { db.clear(); currentUser = "user_a"; });

describe("/api/me/signals (Watch Signal)", () => {
  it("requires sign-in", async () => {
    currentUser = null;
    expect((await GET()).status).toBe(401);
    expect((await post({ op: "watch", id: "s1", pair: "BTCUSDT" })).status).toBe(401);
  });
  it("watch, persist, unwatch", async () => {
    await post({ op: "watch", id: "s1", pair: "btcusdt", status: "open", hitLevels: [] });
    await post({ op: "watch", id: "s2", pair: "ETHUSDT" });
    expect((await get()).items.map((i: { id: string }) => i.id)).toEqual(["s2", "s1"]);
    await post({ op: "unwatch", id: "s2" });
    expect((await get()).items.map((i: { id: string }) => i.id)).toEqual(["s1"]);
  });
  it("is private: one user never sees or changes another user's watched signals", async () => {
    await post({ op: "watch", id: "s1", pair: "BTCUSDT" });
    currentUser = "user_b";
    expect((await get()).items).toEqual([]);
    await post({ op: "watch", id: "s9", pair: "SOLUSDT" });
    currentUser = "user_a";
    expect((await get()).items.map((i: { id: string }) => i.id)).toEqual(["s1"]);
  });
  it("ignores a user id smuggled into the body", async () => {
    await post({ op: "watch", id: "s1", pair: "BTCUSDT", userId: "user_b" });
    expect([...db.keys()]).toEqual(["user:user_a:signals"]);
  });
  it("rejects bad requests and enforces the cap with a 409", async () => {
    expect((await post({ op: "nope" })).status).toBe(400);
    expect((await post({ op: "watch", id: "", pair: "X" })).status).toBe(400);
    for (let i = 0; i < 50; i++) expect((await post({ op: "watch", id: `s${i}`, pair: "A" })).status).toBe(200);
    expect((await post({ op: "watch", id: "over", pair: "A" })).status).toBe(409);
  });
  it("does not require Elite: free and Elite users share the same behaviour", async () => {
    // no plan lookup is involved at all
    expect((await post({ op: "watch", id: "s1", pair: "BTCUSDT" })).status).toBe(200);
  });
});
