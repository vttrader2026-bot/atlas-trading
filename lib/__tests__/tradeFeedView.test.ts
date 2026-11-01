import { describe, expect, it } from "vitest";
import { buildRail, deriveState, parsePrice, parseZone } from "@/lib/tradeFeedView";
import type { PublishedTrade } from "@/lib/tradeFeed";

const base: PublishedTrade = { id: "1", createdAt: 0, pair: "BTC/USDT", direction: "Long", timeframe: "4H", entryZone: "100 - 102", invalidation: "95", tp1: "110", tp2: "118", tp3: "130", reasoning: "" };

describe("price parsing", () => {
  it("reads published strings without changing them", () => {
    expect(parsePrice("$1,234.50")).toBe(1234.5);
    expect(parsePrice("0.00012")).toBe(0.00012);
    expect(parsePrice("N/A")).toBeNull();
    expect(parsePrice("")).toBeNull();
    expect(parseZone("102 - 100")).toEqual({ low: 100, high: 102 });
    expect(parseZone("1,000-1,010")).toEqual({ low: 1000, high: 1010 });
    expect(parseZone("101")).toEqual({ low: 101, high: 101 });
    expect(parseZone("around 100 to 102 or 104")).toBeNull();
  });
});

describe("card state", () => {
  it("closed trades: stop-loss, completed with the last TP, or plain closed", () => {
    expect(deriveState({ ...base, status: "closed", hitLevels: ["TP1", "SL"] }, 90).state).toBe("stopped");
    expect(deriveState({ ...base, status: "closed", hitLevels: ["TP1", "TP2", "TP3"] }, 135)).toEqual({ state: "completed", lastTp: "TP3" });
    expect(deriveState({ ...base, status: "closed", hitLevels: [] }, 100).state).toBe("closed");
  });
  it("open trade with a hit target shows tpHit regardless of live price", () => {
    expect(deriveState({ ...base, hitLevels: ["TP1"] }, 50)).toEqual({ state: "tpHit", lastTp: "TP1" });
  });
  it("open long with no hits: live price vs the entry zone; never guesses without data", () => {
    expect(deriveState(base, 108).state).toBe("waiting");
    expect(deriveState(base, 101).state).toBe("inZone");
    expect(deriveState(base, 97).state).toBe("active"); // below the zone: may already be filled, so no claim
    expect(deriveState(base, null).state).toBe("active");
    expect(deriveState({ ...base, entryZone: "market" }, 108).state).toBe("active");
    expect(deriveState({ ...base, direction: "Short" }, 108).state).toBe("active");
    expect(deriveState({ ...base, status: undefined }, 108).state).toBe("waiting"); // legacy trades default to open
  });
});

describe("price map", () => {
  it("positions are ordered and only built for a coherent long", () => {
    const r = buildRail(base, 106)!;
    expect(r.sl).toBeLessThan(r.zone.from);
    expect(r.zone.from).toBeLessThan(r.zone.to);
    expect(r.zone.to).toBeLessThan(r.tps[0]);
    expect(r.tps[0]).toBeLessThan(r.tps[1]);
    expect(r.tps[1]).toBeLessThan(r.tps[2]);
    expect(r.live!.outside).toBeNull();
    expect(buildRail({ ...base, invalidation: "105" }, 106)).toBeNull(); // SL inside the zone
    expect(buildRail({ ...base, tp2: "105" }, 106)).toBeNull(); // targets not ascending
    expect(buildRail({ ...base, tp3: "" }, 106)).toBeNull();
  });
  it("a live price outside the map is clamped and flagged, not drawn at a fake position", () => {
    expect(buildRail(base, 10)!.live).toEqual({ pos: 0, outside: "below" });
    expect(buildRail(base, 500)!.live).toEqual({ pos: 100, outside: "above" });
    expect(buildRail(base, null)!.live).toBeNull();
  });
});
