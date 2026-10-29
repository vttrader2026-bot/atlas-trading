import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyOp, normalizeState, type WatchState } from "@/lib/watchlist";
import { watchlistLimit } from "@/lib/watchlistConfig";

// Browser store with a fake localStorage and a fake server that behaves like
// /api/me/watchlist (one list per signed-in user, shared by "devices").
const local = new Map<string, string>();
const accounts = new Map<string, WatchState>();
const planOf: Record<string, string> = {};
let calls = 0;
let serverDown = false;
let session = "user_a";

function installGlobals() {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => local.get(k) ?? null,
      setItem: (k: string, v: string) => void local.set(k, v),
      removeItem: (k: string) => void local.delete(k),
    },
  });
  vi.stubGlobal("fetch", async (_url: string, init?: { method?: string; body?: string }) => {
    calls += 1;
    if (serverDown) throw new Error("offline");
    const id = session;
    const plan = planOf[id] ?? "free";
    const limit = watchlistLimit(plan);
    const cur = normalizeState(accounts.get(id));
    const reply = (status: number, body: object) => ({ status, ok: status < 400, json: async () => body });
    if (!init || init.method === "GET" || !init.method) return reply(200, { ...cur, plan, limit });
    const r = applyOp(cur, JSON.parse(init.body ?? "{}"), limit);
    if (!r.ok) return reply(r.error === "limit" ? 409 : 400, { error: r.error, ...cur, plan, limit });
    accounts.set(id, r.state);
    return reply(200, { ...r.state, plan, limit, dropped: r.dropped });
  });
}

async function fresh() {
  vi.resetModules();
  installGlobals();
  return await import("@/lib/watchlistStore");
}
const settle = () => new Promise((r) => setTimeout(r, 20));
const syms = (s: { items: { symbol: string }[] }) => s.items.map((i) => i.symbol);

beforeEach(() => {
  local.clear(); accounts.clear(); calls = 0; serverDown = false; session = "user_a";
  for (const k of Object.keys(planOf)) delete planOf[k];
});

describe("signed out (browser storage)", () => {
  it("adds, removes, persists across a reload, and stops at the free limit", async () => {
    let st = await fresh();
    st.attach(null);
    for (let i = 0; i < 10; i++) expect(st.addSymbol(`C${i}X`).ok).toBe(true);
    const over = st.addSymbol("EXTRAX");
    expect(over).toMatchObject({ ok: false, reason: "limit", limit: 10 });
    st.removeSymbol("C0X");
    expect(st.getState().items).toHaveLength(9);
    expect(calls).toBe(0); // signed-out use never talks to the server

    st = await fresh(); // "refresh the page"
    st.attach(null);
    expect(syms(st.getState())).toHaveLength(9);
    expect(syms(st.getState())).not.toContain("C0XUSDT");
  });
});

describe("signed in (account storage)", () => {
  it("saves to the account and a second device sees it", async () => {
    let dev1 = await fresh();
    dev1.attach("user_a");
    await settle();
    dev1.addSymbol("BTC");
    dev1.addSymbol("sol");
    await settle();
    expect(syms(accounts.get("user_a")!)).toEqual(["BTCUSDT", "SOLUSDT"]);

    const dev2 = await fresh(); // other device: empty browser storage, same account
    dev2.attach("user_a");
    await settle();
    expect(syms(dev2.getState())).toEqual(["BTCUSDT", "SOLUSDT"]);
    dev2.removeSymbol("BTC");
    await settle();
    await dev1.refresh(true); // dev1 picks the change up
    expect(syms(dev1.getState())).toEqual(["SOLUSDT"]);
  });

  it("merges the browser list into the account on sign-in, without duplicates, then clears it", async () => {
    accounts.set("user_a", { items: [{ symbol: "ETHUSDT", addedAt: 1 }], seen: {} });
    const st = await fresh();
    st.attach(null);
    st.addSymbol("BTC");
    st.addSymbol("ETH");
    st.attach("user_a");
    await settle();
    expect(syms(st.getState()).sort()).toEqual(["BTCUSDT", "ETHUSDT"]);
    expect(syms(accounts.get("user_a")!).sort()).toEqual(["BTCUSDT", "ETHUSDT"]);
    expect(local.size).toBe(0);
  });

  it("uses the Elite limit from the server and shows the free limit as a result, not an error", async () => {
    planOf.user_elite = "elite";
    session = "user_elite";
    const st = await fresh();
    st.attach("user_elite");
    await settle();
    expect(st.getState().limit).toBe(50);
    for (let i = 0; i < 50; i++) expect(st.addSymbol(`E${i}X`).ok).toBe(true);
    await settle();
    expect(st.addSymbol("OVERX")).toMatchObject({ ok: false, reason: "limit", limit: 50 });

    session = "user_free";
    const free = await fresh();
    free.attach("user_free");
    await settle();
    for (let i = 0; i < 10; i++) free.addSymbol(`F${i}X`);
    expect(free.addSymbol("OVERX")).toMatchObject({ ok: false, reason: "limit", limit: 10, plan: "free" });
    await settle(); // let queued saves finish before the next test changes the session
  });

  it("rolls back and flags a sync error when the server is down, keeping data otherwise", async () => {
    const st = await fresh();
    st.attach("user_a");
    await settle();
    st.addSymbol("BTC");
    await settle();
    serverDown = true;
    st.addSymbol("ETH");
    await settle();
    expect(syms(st.getState())).toEqual(["BTCUSDT"]);
    expect(st.getState().syncError).toBe(true);
  });

  it("two accounts on one device never see each other's list", async () => {
    const st = await fresh();
    st.attach("user_a");
    await settle();
    st.addSymbol("BTC");
    await settle();
    session = "user_b";
    st.attach("user_b");
    await settle();
    expect(syms(st.getState())).toEqual([]);
  });
});
