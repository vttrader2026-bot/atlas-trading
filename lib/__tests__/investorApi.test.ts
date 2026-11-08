// INVESTOR-v1: the API is private, validated, optimistic-concurrency safe, and separate from the Trading Journal.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { NextResponse } from "next/server";

const h = vi.hoisted(() => ({ user: null as string | null, store: new Map<string, unknown>() }));
vi.mock("@/lib/userStore", () => ({
  requireUser: async () =>
    h.user
      ? { userId: h.user, redis: { get: async (k: string) => h.store.get(k) ?? null, set: async (k: string, v: unknown) => void h.store.set(k, v) } }
      : NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
}));

import { GET, PUT } from "@/app/api/me/investor/route";

const doc = (o: Record<string, unknown> = {}) => ({ revision: 0, purchases: [], sales: [], cash: [], plans: [], manualPrices: {}, ...o });
const buy = { id: "a", asset: "ADA", date: "2025-01-01", qty: 10, price: 1, fee: 0 };
const put = (body: unknown) => PUT(new Request("http://x/api/me/investor", { method: "PUT", body: JSON.stringify(body) }));

beforeEach(() => { h.user = "u1"; h.store.clear(); });

describe("/api/me/investor", () => {
  it("401 when logged out, for both verbs, and touches no data", async () => {
    h.user = null;
    expect((await GET()).status).toBe(401);
    expect((await put({ baseRevision: 0, doc: doc() })).status).toBe(401);
    expect(h.store.size).toBe(0);
  });
  it("returns an empty doc for a new user, no-store", async () => {
    const r = await GET();
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect((await r.json()).doc.revision).toBe(0);
  });
  it("saves, bumps revision, and stores under a key separate from the journal", async () => {
    const r = await put({ baseRevision: 0, doc: doc({ purchases: [buy] }) });
    expect(r.status).toBe(200);
    expect((await r.json()).doc.revision).toBe(1);
    expect([...h.store.keys()]).toEqual(["user:u1:investor"]);
    expect(h.store.has("user:u1:journal")).toBe(false);
  });
  it("each user only sees their own records", async () => {
    await put({ baseRevision: 0, doc: doc({ purchases: [buy] }) });
    h.user = "u2";
    expect((await (await GET()).json()).doc.purchases).toEqual([]);
  });
  it("refuses a stale save with 409 and returns the newer data instead of overwriting", async () => {
    await put({ baseRevision: 0, doc: doc({ purchases: [buy] }) });
    const r = await put({ baseRevision: 0, doc: doc() });
    expect(r.status).toBe(409);
    expect((await r.json()).doc.purchases).toHaveLength(1);
  });
  it("rejects unsupported coins, missing baseRevision and overselling", async () => {
    expect((await put({ baseRevision: 0, doc: doc({ purchases: [{ ...buy, asset: "SHIB" }] }) })).status).toBe(400);
    expect((await put({ doc: doc() })).status).toBe(400);
    const oversell = doc({ purchases: [buy], sales: [{ id: "s", asset: "ADA", date: "2025-02-01", qty: 11, price: 2, fee: 0 }] });
    expect((await put({ baseRevision: 0, doc: oversell })).status).toBe(422);
    expect(h.store.size).toBe(0);
  });
  it("accepts a partial sale", async () => {
    const ok = doc({ purchases: [buy], sales: [{ id: "s", asset: "ADA", date: "2025-02-01", qty: 4, price: 2, fee: 0.1 }] });
    expect((await put({ baseRevision: 0, doc: ok })).status).toBe(200);
  });
});

describe("separation from the Trading Journal", () => {
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]));
  const files = [...walk("lib/investor"), "app/api/me/investor/route.ts", ...(() => { try { return walk("components/investor"); } catch { return []; } })(), ...(() => { try { return walk("app/investor"); } catch { return []; } })()];
  it("no investor file imports journal code, and none talks to an exchange for trading", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/from ["'](@\/|\.\.?\/)[^"']*(lib\/journal|components\/journal|journalStore|\/journal)["']/);
      expect(src, f).not.toMatch(/api\/v3\/order|apiKey|X-MBX-APIKEY|secretKey/i);
    }
  });
});
