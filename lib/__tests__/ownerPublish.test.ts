// OWNER-PUBLISH-v1: the REAL quick-publish route, owner route, validator and feed route; only Clerk, Upstash and push are fakes.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({
  userId: "owner-1" as string | null,
  meta: {} as Record<string, unknown>,
  lists: {} as Record<string, unknown[]>,
  hashes: {} as Record<string, Record<string, unknown>>,
  push: [] as unknown[],
  failRedis: false,
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: h.userId }),
  clerkClient: async () => ({ users: { getUser: async () => ({ privateMetadata: h.meta }) } }),
}));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    async lrange(k: string) { if (h.failRedis) throw new Error("down"); return structuredClone(h.lists[k] ?? []); }
    async lpush(k: string, v: unknown) { if (h.failRedis) throw new Error("down"); (h.lists[k] ??= []).unshift(structuredClone(v)); return 1; }
    async ltrim(k: string, a: number, b: number) { h.lists[k] = (h.lists[k] ?? []).slice(a, b + 1); return "OK"; }
    async hgetall(k: string) { return structuredClone(h.hashes[k] ?? null); }
  },
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => void) => fn() }));
vi.mock("@/lib/push", () => ({ notifyTradeSubscribers: (t: unknown) => h.push.push(t), notifyTpSlSubscribers: vi.fn(), notifyTradeClosedSubscribers: vi.fn() }));

import { POST } from "@/app/api/admin/signals/quick-publish/route";
import { GET as ownerGET } from "@/app/api/me/owner/route";
import { GET as feedGET } from "@/app/api/trade-feed/route";
import { validateSpotSetup } from "@/lib/ownerPublish";

const SETUP = { pair: "solusdt", direction: "Long", timeframe: "4H", entryZone: "100 - 102", invalidation: "95", tp1: "110", tp2: "120", tp3: "130", reasoning: "why" };
const send = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  POST(new Request("http://x/api/admin/signals/quick-publish", { method: "POST", body: JSON.stringify(body), headers: { host: "x", ...headers } }));
const ok = (o: Record<string, unknown> = {}) => ({ ...SETUP, tier: "free", source: "analyzer", confirm: true, ...o });
const feed = async () => (await feedGET(new Request("http://x/api/trade-feed"))).json();
const feedList = () => (h.lists["atlas:trade-feed"] ?? []) as Record<string, unknown>[];

beforeEach(() => {
  process.env.OWNER_CLERK_USER_ID = "owner-1";
  process.env.UPSTASH_REDIS_REST_URL = "https://fake";
  process.env.UPSTASH_REDIS_REST_TOKEN = "fake";
  h.userId = "owner-1";
  h.meta = {};
  h.lists = {};
  h.hashes = {};
  h.push = [];
  h.failRedis = false;
});

describe("quick-publish: owner only, enforced on the server", () => {
  it("a signed-in non-owner is refused (404) and nothing is stored or notified", async () => {
    h.userId = "member-9";
    h.meta = { plan: "elite", eliteUntil: Date.now() + 1e9 };
    expect((await send(ok())).status).toBe(404);
    expect(feedList()).toHaveLength(0);
    expect(h.push).toHaveLength(0);
  });
  it("a signed-out request is refused", async () => {
    h.userId = null;
    expect((await send(ok())).status).toBe(404);
    expect(feedList()).toHaveLength(0);
  });
  it("fails closed when OWNER_CLERK_USER_ID is unset", async () => {
    delete process.env.OWNER_CLERK_USER_ID;
    expect((await send(ok())).status).toBe(404);
  });
  it("a body claiming to be the owner changes nothing", async () => {
    h.userId = "member-9";
    expect((await send({ ...ok(), owner: true, userId: "owner-1", secret: "x" }, { "x-admin-secret": "x" })).status).toBe(404);
    expect(feedList()).toHaveLength(0);
  });
  it("a cross-site Origin is refused", async () => {
    expect((await send(ok(), { origin: "https://evil.example" })).status).toBe(403);
    expect(feedList()).toHaveLength(0);
  });
  it("requires the explicit confirmation flag", async () => {
    expect((await send(ok({ confirm: false }))).status).toBe(400);
    expect(feedList()).toHaveLength(0);
  });
  it("the owner probe endpoint says true only for the owner and never returns an id", async () => {
    expect(await (await ownerGET()).json()).toEqual({ owner: true });
    h.userId = "member-9";
    expect(await (await ownerGET()).json()).toEqual({ owner: false });
    h.userId = null;
    expect(await (await ownerGET()).json()).toEqual({ owner: false });
  });
});

describe("quick-publish: audience", () => {
  it("has no default audience: missing or unknown tier is rejected", async () => {
    for (const tier of [undefined, "", "vip", "ELITE", 1, null]) expect((await send(ok({ tier }))).status).toBe(400);
    expect(feedList()).toHaveLength(0);
  });
  it("FREE: stored in the existing feed record, visible to FREE and ELITE members, notified once", async () => {
    const res = await send(ok({ tier: "free" }));
    expect(res.status).toBe(201);
    expect(feedList()[0]).toMatchObject({ pair: "SOLUSDT", direction: "Long", tier: "free", status: "open", entryZone: "100 - 102", invalidation: "95", tp1: "110" });
    h.userId = "m1"; h.meta = {};
    expect((await feed()).trades).toHaveLength(1);
    h.meta = { plan: "elite", eliteUntil: Date.now() + 1e9 };
    expect((await feed()).trades).toHaveLength(1);
    expect(h.push).toHaveLength(1);
  });
  it("ELITE: full levels only for active ELITE members; FREE and expired members get a locked preview with no levels", async () => {
    expect((await send(ok({ tier: "elite" }))).status).toBe(201);
    expect(feedList()[0].tier).toBe("elite");
    for (const meta of [{}, { plan: "free" }, { plan: "elite", eliteUntil: Date.now() - 1000 }]) {
      h.userId = "m1"; h.meta = meta;
      const raw = JSON.stringify(await feed());
      expect(raw).not.toContain("100 - 102");
      expect(raw).not.toContain("\"tp3\":\"130\"");
      expect(raw).toContain("locked");
    }
    h.meta = { plan: "elite", eliteUntil: Date.now() + 1e9 };
    expect((await feed()).trades[0]).toMatchObject({ pair: "SOLUSDT", tier: "elite", tp3: "130" });
  });
  it("the response and the stored record carry no private data (no user id, no source, no secret)", async () => {
    const body = await (await send(ok())).json();
    expect(Object.keys(body).sort()).toEqual(["id", "ok", "tier"]);
    expect(JSON.stringify(feedList()[0])).not.toMatch(/owner-1|analyzer|source|confirm/);
  });
});

describe("quick-publish: server-side setup validation", () => {
  const bad: Array<[string, Record<string, unknown>]> = [
    ["Short", { direction: "Short" }],
    ["Wait", { direction: "Wait" }],
    ["no entry", { entryZone: "" }],
    ["entry with text only", { entryZone: "market" }],
    ["no stop", { invalidation: "" }],
    ["stop above entry", { invalidation: "105" }],
    ["stop equal to entry low", { invalidation: "100" }],
    ["no targets", { tp1: "", tp2: "", tp3: "" }],
    ["target below entry", { tp1: "101" }],
    ["targets not rising", { tp1: "120", tp2: "110" }],
    ["zero price", { tp3: "0" }],
    ["negative-looking stop", { invalidation: "-5" }],
    ["bad pair", { pair: "SOL/USDT" }],
    ["overlong reasoning", { reasoning: "x".repeat(2001) }],
  ];
  for (const [name, patch] of bad) {
    it(`rejects: ${name}`, async () => {
      expect((await send(ok(patch))).status).toBe(400);
      expect(feedList()).toHaveLength(0);
      expect(h.push).toHaveLength(0);
    });
  }
  it("accepts a TP3-only plan and a single-price entry", async () => {
    expect((await send(ok({ entryZone: "100", tp1: "", tp2: "", tp3: "130" }))).status).toBe(201);
  });
  it("unknown source is rejected", async () => {
    expect((await send(ok({ source: "bot" }))).status).toBe(400);
  });
  it("a double click does not publish the same setup twice, but another audience or setup is fine", async () => {
    expect((await send(ok())).status).toBe(201);
    expect((await send(ok())).status).toBe(409);
    expect((await send(ok({ tier: "elite" }))).status).toBe(201);
    expect((await send(ok({ tp3: "135" }))).status).toBe(201);
    expect(feedList()).toHaveLength(3);
  });
  it("a storage failure reports an error and notifies nobody", async () => {
    h.failRedis = true;
    expect((await send(ok())).status).toBe(500);
    expect(h.push).toHaveLength(0);
  });
});

describe("validateSpotSetup (also used by the browser to hide the button)", () => {
  it("normalises the pair and keeps the levels as written", () => {
    const r = validateSpotSetup(SETUP);
    expect(r.ok && r.value).toMatchObject({ pair: "SOLUSDT", direction: "Long", entryZone: "100 - 102" });
  });
  it("rejects non-objects", () => {
    for (const v of [null, undefined, "x", 5, []]) expect(validateSpotSetup(v).ok).toBe(false);
  });
  it("accepts thousands separators", () => {
    expect(validateSpotSetup({ ...SETUP, pair: "BTCUSDT", entryZone: "67,000 – 67,500", invalidation: "65,000", tp1: "69,000", tp2: "70,000", tp3: "72,000" }).ok).toBe(true);
  });
});

describe("wiring", () => {
  const read = (f: string) => readFileSync(f, "utf8");
  it("the legacy admin-secret publish path is closed and the page no longer stores or sends an admin secret", () => {
    expect(read("app/trade-plan/page.tsx")).not.toMatch(/adminSecret|ADMIN_KEY|api\/trade-feed/);
    expect(read("app/trade-plan/page.tsx")).toContain("<PublishToFeedButton");
  });
  it("the Analyzer button lives only after the no-plan early return, so it never renders without a VALID_SETUP engine plan", () => {
    const s = read("components/analyzer/TradePlanPanel.tsx");
    expect(s.indexOf("<PublishToFeedButton")).toBeGreaterThan(s.indexOf("if (!plan) {"));
    expect(s).toContain('const plan = verdict === "VALID_SETUP" ? engine?.plan ?? null : null;');
  });
  it("both analyzers render TradePlanPanel through the shared AnalysisResult", () => {
    expect(read("components/analyzer/AnalysisResult.tsx")).toContain("<TradePlanPanel");
    expect(read("components/charts/AnalysisPanel.tsx")).toContain("<AnalysisResult");
    expect(read("app/analyzer/page.tsx")).toContain("<AnalysisResult");
  });
  it("the button is hidden unless the owner check passes and the dialog has no preselected audience", () => {
    const s = read("components/feed/PublishToFeedButton.tsx");
    expect(s).toContain("if (!owner || !checked.ok) return null;");
    expect(s).toContain("useState<Tier | null>(null)");
    expect(s).toContain("disabled={!tier || busy}");
  });
});
