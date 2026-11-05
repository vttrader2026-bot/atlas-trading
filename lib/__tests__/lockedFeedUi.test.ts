// ELITE-LOCKED-v1: wiring of the Trade Feed UI (source-level; no browser here).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { feedForViewer, type PublishedTrade } from "@/lib/tradeFeed";

const read = (p: string) => readFileSync(p, "utf8");
const actions = read("components/tradefeed/SignalActions.tsx");
const locked = read("components/tradefeed/LockedSignalCard.tsx");
const page = read("app/trade-feed/page.tsx");
const sigs = read("lib/i18nSignals.ts");

describe("same buttons on FREE and ELITE cards", () => {
  it("Create Trade Plan and Confirm Trade are not tier-specific; the old local 'I Took This Trade' path is gone", () => {
    expect(actions).toContain('t("tradeFeed.actConfirm")');
    expect(actions).toContain("/trade-plan?signal=");
    expect(actions).not.toContain("actTook");
    expect(actions).not.toContain("TookDialog");
    expect(actions).not.toContain('signal.tier === "elite"');
  });
  it("the page lets everyone confirm FREE signals and only active ELITE members confirm ELITE ones", () => {
    expect(page).toContain('confirmable={trade.tier === "elite" ? canConfirm : true}');
  });
});

describe("locked preview card", () => {
  it("shows the reserved message and links Unlock to /elite, with no price", () => {
    expect(locked).toContain('t("tradeFeed.lockedMsg")');
    expect(locked).toContain('href="/elite"');
    expect(locked).toContain('t("tradeFeed.unlockElite")');
    expect(locked).not.toMatch(/\$|USD|price/i);
  });
  it("only reads preview fields (no level fields exist on its type)", () => {
    for (const f of ["entryZone", "invalidation", "tp1", "tp2", "tp3", "reasoning", "hitLevels"]) expect(locked).not.toContain(f);
  });
  it("texts exist in EN, FR and AR", () => {
    expect(sigs).toContain('lockedMsg: "This setup is reserved for ELITE members."');
    expect(sigs.match(/unlockElite:/g)?.length).toBe(3);
    expect(sigs.match(/confirmations:/g)?.length).toBe(3);
  });
});

describe("feedForViewer", () => {
  const t = (o: Partial<PublishedTrade>): PublishedTrade => ({ id: "a", createdAt: 1, pair: "BTCUSDT", direction: "Long", timeframe: "4H", entryZone: "1-2", invalidation: "0.5", tp1: "3", tp2: "4", tp3: "5", reasoning: "r", status: "open", ...o });
  it("fails closed for an unknown tier on an open signal", () => {
    const r = feedForViewer([t({ tier: "vip" as never })], false);
    expect(r.trades).toEqual([]);
    expect(r.locked).toHaveLength(1);
  });
  it("a signal with no status counts as open (locked for non-members)", () => {
    const r = feedForViewer([t({ tier: "elite", status: undefined })], false);
    expect(r.locked).toHaveLength(1);
  });
});
