// Live engine report — makes REAL Binance requests (not part of `npm test`).
// Run from a machine that can reach data-api.binance.vision:
//   npm run test:live -- analyzerEngine.live
// It prints, for real USDT pairs, the engine's inputs, verdict and validation
// results, and asserts every plan invariant on the live data. It has NOT been
// executed in the build sandbox (no route to Binance there).
import { describe, expect, it } from "vitest";
import { getCandles } from "@/lib/marketData";
import { ENGINE_CONFIG, analyzeCandles } from "@/lib/analyzerEngine";
import type { Interval } from "@/lib/marketDataTypes";

const CASES: [string, Interval][] = [
  ["BTC", "4h"],
  ["BTC", "1d"],
  ["ETH", "4h"],
  ["SOL", "4h"],
  ["BNB", "1d"],
];

describe("live: analyzer engine on real Binance USDT candles", () => {
  for (const [base, interval] of CASES) {
    it(`${base}/USDT ${interval}`, async () => {
      const res = await getCandles(base, interval, { limit: 250, quoteAsset: "USDT" });
      const forming = res.candles.filter((c) => c.status === "forming").length;
      const r = analyzeCandles({ candles: res.candles, interval, stale: res.stale, nowMs: Date.now() });
      const m = r.market;
      console.log(
        `\n=== ${base}/USDT ${interval} ===\n` +
          JSON.stringify(
            {
              input: { fetched: res.candles.length, formingDropped: forming, closedUsed: r.closedCandles, stale: res.stale, lastClosedOpenTime: r.lastClosedTime && new Date(r.lastClosedTime).toISOString() },
              reading: m && {
                price: m.price, atr: m.atr, trend: m.trend, structure: m.structure.state,
                swings: m.structure.labelled.map((l) => `${l.label}@${l.price}`),
                support: m.support, resistance: m.resistance,
                ema: [m.ema20, m.ema50, m.ema200], rsi14: m.rsi14, volume: m.volume,
              },
              verdict: r.verdict, reasons: r.reasons, candidate: r.candidate, watch: r.watch, plan: r.plan,
            },
            null,
            2
          )
      );
      // Closed candles only.
      expect(r.closedCandles).toBe(res.candles.length - forming);
      // Invariants on whatever the real market produced.
      if (r.verdict !== "VALID_SETUP") {
        expect(r.plan).toBeNull();
        return;
      }
      const p = r.plan!;
      const atr = m!.atr;
      const risk = p.entry.high - p.stopLoss;
      expect(p.stopLoss).toBeLessThan(p.entry.low);
      expect(p.entry.low - p.stopLoss).toBeGreaterThanOrEqual(ENGINE_CONFIG.slAtrBuffer * atr - atr * 1e-3);
      expect(p.targets[0].price).toBeGreaterThan(p.entry.high);
      expect(p.targets[1].price).toBeGreaterThan(p.targets[0].price);
      expect(p.targets[2].price).toBeGreaterThan(p.targets[1].price);
      expect(p.targets[0].rr).toBeCloseTo((p.targets[0].price - p.entry.high) / risk, 1);
      expect(p.targets[0].rr).toBeGreaterThanOrEqual(ENGINE_CONFIG.minRrTp1 - 0.01);
    }, 30_000);
  }
});
