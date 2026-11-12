import { describe, it, expect } from "vitest";
import { formatPrice, priceDecimals } from "@/lib/binance";
import { deriveState, stopBreached } from "@/lib/tradeFeedView";
import type { PublishedTrade } from "@/lib/tradeFeed";

const pepe = (over: Partial<PublishedTrade> = {}): PublishedTrade =>
  ({
    id: "p1", createdAt: 1, pair: "PEPE/USDT", direction: "Long", timeframe: "4h",
    entryZone: "0.00000720 - 0.00000735", invalidation: "0.00000690",
    tp1: "0.00000780", tp2: "0.00000820", tp3: "0.00000880",
    reasoning: "", status: "open", hitLevels: [], tier: "free", ...over,
  }) as PublishedTrade;

describe("formatPrice on micro-priced coins (PEPE)", () => {
  it("shows enough decimals to tell PEPE moves apart", () => {
    expect(formatPrice(0.00000712)).not.toBe(formatPrice(0.00000689));
    expect(formatPrice(0.00000712)).toBe("0.000007120");
  });
  it("keeps the previous output for normal prices", () => {
    expect(formatPrice(0.5)).toBe("0.500000");
    expect(formatPrice(12.3456)).toBe("12.3456");
    expect(formatPrice(65000.5)).toBe("65,000.50");
  });
  it("never goes past 10 decimals and still marks invalid prices", () => {
    expect(priceDecimals(1e-12)).toBe(10);
    expect(formatPrice(0)).toBe("—");
    expect(formatPrice("abc")).toBe("—");
  });
});

describe("PEPE stop loss status", () => {
  it("flags an open long whose live price fell to its stop", () => {
    expect(stopBreached(pepe(), 0.0000069)).toBe(true);
    expect(stopBreached(pepe(), 0.00000685)).toBe(true);
  });
  it("does not flag above the stop, without a price, or for shorts", () => {
    expect(stopBreached(pepe(), 0.0000072)).toBe(false);
    expect(stopBreached(pepe(), null)).toBe(false);
    expect(stopBreached(pepe({ direction: "Short" }), 0.0000060)).toBe(false);
  });
  it("official SL status wins and the flag is not raised once stopped/closed", () => {
    const stopped = pepe({ status: "closed", hitLevels: ["SL"] });
    expect(deriveState(stopped, 0.0000072).state).toBe("stopped");
    expect(stopBreached(stopped, 0.0000060)).toBe(false);
    expect(deriveState(pepe({ hitLevels: ["SL"] }), 0.0000090).state).toBe("stopped");
  });
  it("breach flag does not alter the official state of an open trade", () => {
    expect(deriveState(pepe(), 0.0000068).state).toBe("active");
  });
});
