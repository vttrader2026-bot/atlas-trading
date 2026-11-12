import { describe, it, expect } from "vitest";
import { searchRows, normalizeQuery } from "@/lib/radarSearch";

const row = (symbol: string) => ({ ticker: { symbol } });
const rows = ["BTCUSDT", "PEPEUSDT", "SOLUSDT", "SOLVUSDT", "ONDOUSDT", "WIFUSDT"].map(row);
const syms = (r: { ticker: { symbol: string } }[]) => r.map((x) => x.ticker.symbol);

describe("Radar search", () => {
  it("empty query returns every row", () => expect(searchRows(rows, "  ")).toHaveLength(rows.length));
  it("matches by symbol, case-insensitively, with or without /USDT", () => {
    expect(syms(searchRows(rows, "pepe"))).toEqual(["PEPEUSDT"]);
    expect(syms(searchRows(rows, "PEPE/USDT"))).toEqual(["PEPEUSDT"]);
    expect(normalizeQuery(" pepe usdt ")).toBe("PEPE");
  });
  it("matches by coin name", () => {
    expect(syms(searchRows(rows, "solana"))).toEqual(["SOLUSDT"]);
    expect(syms(searchRows(rows, "Bitcoin"))).toEqual(["BTCUSDT"]);
  });
  it("ranks exact symbol before prefix matches", () => {
    expect(syms(searchRows(rows, "sol"))[0]).toBe("SOLUSDT");
    expect(syms(searchRows(rows, "sol"))).toContain("SOLVUSDT");
  });
  it("returns an empty list when nothing matches", () => expect(searchRows(rows, "zzzz")).toEqual([]));
});
