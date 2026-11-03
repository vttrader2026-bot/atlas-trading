import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Trade } from "@/lib/journal";

const tr = (id: string, date: string, extra: Partial<Trade> = {}): Trade => ({ id, date, pair: "BTCUSDT", side: "Long", entry: 100, stop: 90, target: 120, exit: null, size: 1, notes: "", ...extra });

let store: Record<string, string>;
let server: { trades: Trade[] };
let puts: Trade[][];
let online: boolean;
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };

beforeEach(() => {
  vi.resetModules();
  store = {};
  puts = [];
  online = true;
  server = { trades: [] };
  const ls = { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: string) => void (store[k] = v), removeItem: (k: string) => void delete store[k] };
  vi.stubGlobal("window", { localStorage: ls, dispatchEvent: () => true });
  vi.stubGlobal("Event", class { constructor(public type: string) {} });
  vi.stubGlobal("fetch", async (_u: string, init?: { method?: string; body?: string }) => {
    if (!online) throw new Error("offline");
    if (init?.method === "PUT") { const b = JSON.parse(init.body as string); server = { trades: b.trades }; puts.push(b.trades); return { ok: true, json: async () => ({}) }; }
    return { ok: true, json: async () => server };
  });
});
afterEach(() => vi.unstubAllGlobals());

const local = () => JSON.parse(store["atlas-trading.journal.v1"] ?? "[]") as Trade[];
async function sync(user: string) {
  const m = await import("@/lib/journalSync");
  const stop = m.startJournalSync(user);
  await flush();
  return { stop };
}

describe("journal sync", () => {
  it("mergeById keeps both sides, local wins, newest first", async () => {
    const { mergeById } = await import("@/lib/journalSync");
    const r = mergeById([tr("a", "2026-01-01", { notes: "local" })], [tr("a", "2026-01-01", { notes: "server" }), tr("b", "2026-02-01")]);
    expect(r.map((x) => x.id)).toEqual(["b", "a"]);
    expect(r.find((x) => x.id === "a")?.notes).toBe("local");
  });
  it("first sign-in merges device and account records without losing any, and uploads the result", async () => {
    store["atlas-trading.journal.v1"] = JSON.stringify([tr("l1", "2026-03-01"), tr("l2", "2026-01-01")]);
    server.trades = [tr("s1", "2026-02-01")];
    const { stop } = await sync("u1");
    expect(local().map((x) => x.id).sort()).toEqual(["l1", "l2", "s1"]);
    expect(server.trades.map((x) => x.id).sort()).toEqual(["l1", "l2", "s1"]);
    expect(store["atlas-trading.journal.syncedFor"]).toBe("u1");
    stop();
  });
  it("legacy records (old shape) survive sync unchanged and are pushed intact", async () => {
    const legacy = { id: "old", date: "2025-12-01", pair: "ETHUSDT", side: "Long", entry: 10, stop: 9, target: 12, exit: 11, size: 5, notes: "n" };
    store["atlas-trading.journal.v1"] = JSON.stringify([legacy]);
    const { stop } = await sync("u1");
    expect(server.trades[0]).toMatchObject(legacy);
    expect(local()[0]).toMatchObject(legacy);
    stop();
  });
  it("same account, nothing unsent: the account copy is the truth (edits/deletes from another device propagate)", async () => {
    store["atlas-trading.journal.v1"] = JSON.stringify([tr("a", "2026-01-01"), tr("gone", "2026-01-02")]);
    store["atlas-trading.journal.syncedFor"] = "u1";
    server.trades = [tr("a", "2026-01-01", { notes: "edited elsewhere" })];
    const { stop } = await sync("u1");
    expect(local()).toHaveLength(1);
    expect(local()[0].notes).toBe("edited elsewhere");
    stop();
  });
  it("unsent local changes are never overwritten by the account copy", async () => {
    store["atlas-trading.journal.v1"] = JSON.stringify([tr("a", "2026-01-01"), tr("new", "2026-04-01")]);
    store["atlas-trading.journal.syncedFor"] = "u1";
    store["atlas-trading.journal.dirty"] = "1";
    server.trades = [tr("a", "2026-01-01")];
    const { stop } = await sync("u1");
    expect(local().map((x) => x.id).sort()).toEqual(["a", "new"]);
    expect(server.trades.map((x) => x.id).sort()).toEqual(["a", "new"]);
    expect(store["atlas-trading.journal.dirty"]).toBeUndefined();
    stop();
  });
  it("another account's data replaces the local copy", async () => {
    store["atlas-trading.journal.v1"] = JSON.stringify([tr("mine", "2026-01-01")]);
    store["atlas-trading.journal.syncedFor"] = "u1";
    server.trades = [tr("theirs", "2026-01-01")];
    const { stop } = await sync("u2");
    expect(local().map((x) => x.id)).toEqual(["theirs"]);
    stop();
  });
  it("offline: local data untouched and nothing marked synced", async () => {
    store["atlas-trading.journal.v1"] = JSON.stringify([tr("a", "2026-01-01")]);
    online = false;
    const { stop } = await sync("u1");
    expect(local().map((x) => x.id)).toEqual(["a"]);
    expect(store["atlas-trading.journal.syncedFor"]).toBeUndefined();
    stop();
  });
  it("saving while signed in queues a debounced push and marks dirty until it lands", async () => {
    vi.useFakeTimers();
    const { startJournalSync } = await import("@/lib/journalSync");
    const { saveTrades } = await import("@/lib/journal");
    const stop = startJournalSync("u1");
    await vi.advanceTimersByTimeAsync(0);
    saveTrades([tr("x", "2026-05-01", { tp1: 120, fees: 1 })]);
    expect(store["atlas-trading.journal.dirty"]).toBe("1");
    await vi.advanceTimersByTimeAsync(900);
    expect(puts.at(-1)?.[0]).toMatchObject({ id: "x", tp1: 120, fees: 1 });
    expect(store["atlas-trading.journal.dirty"]).toBeUndefined();
    stop();
    vi.useRealTimers();
  });
  it("signed-out users never touch the network", async () => {
    const { saveTrades } = await import("@/lib/journal");
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    saveTrades([tr("x", "2026-05-01")]);
    await flush();
    expect(spy).not.toHaveBeenCalled();
    expect(local()[0].id).toBe("x");
  });
});
