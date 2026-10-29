import { describe, expect, it } from "vitest";
import { buildRadarRows, type RadarRow } from "@/lib/radar";
import { DEFAULT_SORT, SORT_KEYS, defaultDir, sortRows, sortValue } from "@/lib/radarSort";
import type { Ticker24h } from "@/lib/binance";

function tk(base: string, o: Partial<Ticker24h> = {}): Ticker24h {
  return { symbol: base + "USDT", lastPrice: "100", priceChangePercent: "1", highPrice: "110", lowPrice: "90", quoteVolume: "1000", ...o };
}
const rowsOf = (ts: Ticker24h[]) => buildRadarRows(ts, 0);
const syms = (rs: RadarRow[]) => rs.map((r) => r.ticker.symbol.replace("USDT", ""));

const data = [
  tk("BBB", { lastPrice: "50", priceChangePercent: "-3", highPrice: "55", lowPrice: "40", quoteVolume: "300" }), // dist high 9.09, dist low 25
  tk("AAA", { lastPrice: "200", priceChangePercent: "5", highPrice: "200", lowPrice: "150", quoteVolume: "900" }), // dist high 0, dist low 33.3
  tk("CCC", { lastPrice: "10", priceChangePercent: "0.5", highPrice: "20", lowPrice: "10", quoteVolume: "100" }), // dist high 50, dist low 0
];

describe("sortRows — every key and direction", () => {
  const rows = rowsOf(data);
  it("volume", () => {
    expect(syms(sortRows(rows, "volume", "desc"))).toEqual(["AAA", "BBB", "CCC"]);
    expect(syms(sortRows(rows, "volume", "asc"))).toEqual(["CCC", "BBB", "AAA"]);
  });
  it("change", () => {
    expect(syms(sortRows(rows, "change", "desc"))).toEqual(["AAA", "CCC", "BBB"]);
    expect(syms(sortRows(rows, "change", "asc"))).toEqual(["BBB", "CCC", "AAA"]);
  });
  it("price", () => {
    expect(syms(sortRows(rows, "price", "desc"))).toEqual(["AAA", "BBB", "CCC"]);
    expect(syms(sortRows(rows, "price", "asc"))).toEqual(["CCC", "BBB", "AAA"]);
  });
  it("distance from 24h high (nearest / farthest)", () => {
    expect(syms(sortRows(rows, "distHigh", "asc"))).toEqual(["AAA", "BBB", "CCC"]);
    expect(syms(sortRows(rows, "distHigh", "desc"))).toEqual(["CCC", "BBB", "AAA"]);
  });
  it("distance from 24h low (nearest / farthest)", () => {
    expect(syms(sortRows(rows, "distLow", "asc"))).toEqual(["CCC", "BBB", "AAA"]);
    expect(syms(sortRows(rows, "distLow", "desc"))).toEqual(["AAA", "BBB", "CCC"]);
  });
  it("name A–Z / Z–A", () => {
    expect(syms(sortRows(rows, "name", "asc"))).toEqual(["AAA", "BBB", "CCC"]);
    expect(syms(sortRows(rows, "name", "desc"))).toEqual(["CCC", "BBB", "AAA"]);
  });
  it("covers every declared key", () => {
    for (const k of SORT_KEYS) expect(sortRows(rows, k, defaultDir(k))).toHaveLength(3);
  });
  it("percent distances are computed correctly", () => {
    const [b] = rowsOf([data[0]]);
    expect(sortValue(b, "distHigh")).toBeCloseTo(9.0909, 3);
    expect(sortValue(b, "distLow")).toBeCloseTo(25, 5);
  });
});

describe("default ordering is unchanged", () => {
  it("DEFAULT_SORT equals the previous `b.volume - a.volume` order, ties keep input order", () => {
    const ts = ["A", "B", "C", "D", "E"].map((b, i) => tk(b, { quoteVolume: String([500, 900, 500, 100, 900][i]) }));
    const rows = rowsOf(ts);
    const old = [...rows].sort((a, b) => b.volume - a.volume);
    expect(syms(sortRows(rows, DEFAULT_SORT.key, DEFAULT_SORT.dir))).toEqual(syms(old));
  });
});

describe("invalid / missing data is never treated as zero", () => {
  const bad = [
    tk("GOOD1", { lastPrice: "10", priceChangePercent: "-2", quoteVolume: "50" }),
    tk("NAN", { lastPrice: "abc", priceChangePercent: "NaN", quoteVolume: "", highPrice: "x", lowPrice: "" }),
    tk("GOOD2", { lastPrice: "20", priceChangePercent: "4", quoteVolume: "70" }),
    tk("ZERO", { lastPrice: "0", highPrice: "0", lowPrice: "0" }),
  ];
  const rows = rowsOf(bad);
  for (const key of SORT_KEYS.filter((k) => k !== "name")) {
    for (const dir of ["asc", "desc"] as const) {
      it(`${key}/${dir}: invalid rows always last`, () => {
        const out = syms(sortRows(rows, key, dir));
        const validCount = rows.filter((r) => sortValue(r, key) !== null).length;
        const lastBlock = out.slice(validCount);
        expect(lastBlock.every((s) => rows.find((r) => r.ticker.symbol === s + "USDT") && sortValue(rows.find((r) => r.ticker.symbol === s + "USDT")!, key) === null)).toBe(true);
      });
    }
  }
  it("a coin with an unparseable change is not ranked as +0%", () => {
    const out = syms(sortRows(rows, "change", "asc"));
    expect(out.indexOf("GOOD1")).toBe(0);
    expect(out.indexOf("NAN")).toBeGreaterThan(out.indexOf("GOOD2"));
  });
  it("price 0 and distance with no high/low are invalid", () => {
    const zero = rows.find((r) => r.ticker.symbol === "ZEROUSDT")!;
    expect(sortValue(zero, "price")).toBeNull();
    expect(sortValue(zero, "distHigh")).toBeNull();
    expect(sortValue(zero, "distLow")).toBeNull();
  });
  it("empty input, single row and no mutation", () => {
    expect(sortRows([], "price", "asc")).toEqual([]);
    const one = rowsOf([tk("ONE")]);
    expect(sortRows(one, "name", "desc")).toHaveLength(1);
    const copy = [...rows];
    sortRows(rows, "price", "asc");
    expect(rows).toEqual(copy);
  });
});

describe("works together with filters (screening tags untouched)", () => {
  it("filter first, then sort, keeps only matching rows and original tags", () => {
    const ts = [
      tk("UP1", { lastPrice: "99.5", highPrice: "100", priceChangePercent: "3", quoteVolume: "10" }),
      tk("UP2", { lastPrice: "99.8", highPrice: "100", priceChangePercent: "1", quoteVolume: "20" }),
      tk("FLAT", { lastPrice: "50", highPrice: "100", priceChangePercent: "-1", quoteVolume: "30" }),
    ];
    const rows = rowsOf(ts);
    const before = rows.map((r) => [...r.tags].join(","));
    const filtered = rows.filter((r) => r.tags.includes("breakout"));
    const sorted = sortRows(filtered, "change", "desc");
    expect(syms(sorted)).toEqual(["UP1", "UP2"]);
    expect(rows.map((r) => [...r.tags].join(","))).toEqual(before);
  });
  it("name sort is natural (numbers before letters, case-insensitive)", () => {
    const rows = rowsOf([tk("sol"), tk("1INCH"), tk("ADA"), tk("BTC")]);
    expect(syms(sortRows(rows, "name", "asc"))).toEqual(["1INCH", "ADA", "BTC", "sol"]);
  });
});
