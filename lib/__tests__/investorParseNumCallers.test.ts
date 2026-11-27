// Compatibility audit of EVERY parseNum caller after the decimal-comma parser change (see lib/investor/numInput.ts).
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { numText, parseDecimal, evaluateTrade } from "@/lib/investor/numInput";
import { parseNum, price as fmtPrice, qty as fmtQty, usd } from "@/components/investor/fmt";
import { emptyDoc, parseDoc, r8, type InvestorDoc } from "@/lib/investor/model";

const read = (p: string) => readFileSync(p, "utf8");
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? (n === "node_modules" || n === ".next" || n === "__tests__" ? [] : walk(p)) : /\.(ts|tsx)$/.test(n) ? [p] : []; });

describe("the audited list of parseNum callers is complete", () => {
  it("only these files call parseNum (a new caller must be audited and added here)", () => {
    const files = [...walk("app"), ...walk("components"), ...walk("lib")].filter((f) => /\bparseNum\(/.test(read(f)) && !f.endsWith("components/investor/fmt.ts"));
    expect(files.map((f) => f.replace(/\\/g, "/")).sort()).toEqual([
      "components/investor/Dashboard.tsx",
      "components/investor/Dca.tsx",
      "components/investor/Ledger.tsx",
      "components/investor/Risk.tsx",
      "components/investor/TradeForm.tsx",
    ]);
  });
});

describe("the interpretation of ambiguous formats is fixed and consistent for every caller", () => {
  const table: [string, number][] = [["12,5", 12.5], ["12.5", 12.5], ["1.234,5", 1234.5], ["1,234.5", 1234.5], ["1,234", 1.234]];
  it("documented table", () => { for (const [s, n] of table) expect(parseDecimal(s), s).toBe(n); });
  it("every caller sees exactly the same result because they all go through parseNum", () => {
    for (const [s, n] of table) expect(parseNum(s), s).toBe(n);
    for (const f of ["Dashboard", "Dca", "Ledger", "Risk", "TradeForm"]) {
      const src = read(`components/investor/${f}.tsx`);
      expect(src, f).not.toMatch(/Number\(\s*[a-z.]*(v|amount|price|ref|budget|initial|custom|qtyText|priceText|feeText)\b/);
      expect(src, f).not.toMatch(/parseFloat\(/);
      expect(src, f).not.toMatch(/replace\(\/,/);
    }
  });
});

describe("formatted display values are never fed to the parser", () => {
  it("demonstration: display strings are lossy or ambiguous, which is why inputs are prefilled with numText", () => {
    expect(parseNum(usd(1234.5))).toBeNaN(); // "$1,234.50"
    expect(parseNum(fmtQty(1234))).toBe(1.234); // "1,234" would silently become 1.234
    expect(parseNum(fmtPrice(1234.5))).toBeNaN();
  });
  it("prefilled input text always parses back to the same number, even for tiny prices", () => {
    for (const n of [1e-7, 0.00000123, 0.000012, 1, 12.5, 1234.5, 67890.12345678, 1234567.1]) expect(parseNum(numText(n))).toBeCloseTo(n, 12);
  });
  it("no parseNum argument is a formatted value, and no input is prefilled with a formatted string or String(number)", () => {
    for (const f of ["Dashboard", "Dca", "Ledger", "Risk", "TradeForm"]) {
      const src = read(`components/investor/${f}.tsx`);
      for (const m of src.matchAll(/parseNum\(([^()]*(?:\([^()]*\))?[^()]*)\)/g)) expect(m[1], `${f}: parseNum(${m[1]})`).not.toMatch(/\b(usd|fmtPrice|price|fmtQty|qty|signedUsd|pct|toLocaleString|toFixed)\(/);
    }
    expect(read("components/investor/Dashboard.tsx")).toContain("numText(current.price)");
    expect(read("components/investor/Dca.tsx")).toContain("ref: numText(live)");
    expect(read("components/investor/Ledger.tsx")).toContain("numText(");
    expect(read("app/investor/page.tsx")).toContain("numText(sell.price)");
    expect(read("components/investor/Dashboard.tsx")).not.toContain("String(current.price)");
    expect(read("components/investor/Dca.tsx")).not.toContain("String(live)");
  });
});

describe("Dashboard manual price", () => {
  const ok = (v: string) => parseNum(v) > 0; // predicate in ManualPriceRow.save
  it("accepts dot and comma, rejects empty/zero/negative/text", () => {
    expect(parseNum("0,00001234")).toBe(0.00001234);
    expect(parseNum("67890,5")).toBe(67890.5);
    expect(ok("")).toBe(false); expect(ok("0")).toBe(false); expect(ok("-1")).toBe(false); expect(ok("abc")).toBe(false);
  });
  it("an existing tiny manual price re-opens editable (no exponent text)", () => { expect(ok(numText(1e-7))).toBe(true); });
  it("predicate is unchanged in source", () => { expect(read("components/investor/Dashboard.tsx")).toContain("if (!(n > 0)) return setErr(true);"); });
});

describe("Risk calculator custom shock", () => {
  const accepted = (s: string) => { const c = parseNum(s); return Number.isFinite(c) && c >= -100 && c <= 1000 ? c : null; }; // same bounds as Risk.tsx
  it("keeps every form that worked before: negatives, plus sign, decimals, Unicode minus", () => {
    expect(accepted("-20")).toBe(-20);
    expect(accepted("+10")).toBe(10);
    expect(accepted("-12,5")).toBe(-12.5);
    expect(accepted("-12.5")).toBe(-12.5);
    expect(accepted("−30")).toBe(-30);
    expect(accepted("50")).toBe(50);
  });
  it("still ignores empty, text, and out-of-range values", () => {
    expect(accepted("")).toBeNull(); expect(accepted("abc")).toBeNull(); expect(accepted("-101")).toBeNull(); expect(accepted("1000,5")).toBeNull();
  });
  it("bounds are unchanged in source", () => { expect(read("components/investor/Risk.tsx")).toContain("Number.isFinite(c) && c >= -100 && c <= 1000"); });
});

describe("DCA plan form", () => {
  it("budget, initial, amount, reference price and dip values accept comma decimals", () => {
    expect(parseNum("1500,50")).toBe(1500.5);
    expect(parseNum("0")).toBe(0);
    expect(parseNum("0,5")).toBe(0.5);
    expect(parseNum("12,5")).toBe(12.5); // dip drop % (must be >0 and <100)
  });
  it("same validation predicates as before", () => {
    const src = read("components/investor/Dca.tsx");
    expect(src).toContain("budget > 0 && initial >= 0 && amount >= 0");
    expect(src).toContain("d.dropPct > 0 && d.dropPct < 100 && d.amount > 0");
    expect(src).toContain("ref > 0");
  });
  it("-0 never slips through as a negative zero", () => { expect(Object.is(parseNum("-0"), 0)).toBe(true); expect(Object.is(parseNum("-0,0"), 0)).toBe(true); });
  it("integer count is still a plain Number() (not a parseNum caller): documented, unchanged", () => { expect(read("components/investor/Dca.tsx")).toContain("countNum = Number(f.count)"); });
});

describe("Ledger cash form", () => {
  it("deposit amounts accept comma decimals and keep the > 0 rule", () => {
    expect(parseNum("250,75")).toBe(250.75);
    expect(parseNum("0") > 0).toBe(false);
    expect(read("components/investor/Ledger.tsx")).toContain("if (!(a > 0)) return setErr(true);");
  });
  it("edit/prefill from a saved record round-trips through numText", () => {
    for (const x of [{ qty: 0.00000012, price: 67890.5 }, { qty: 12, price: 0.000001 }]) {
      expect(parseNum(numText(x.qty))).toBe(x.qty);
      expect(parseNum(numText(x.price))).toBe(x.price);
    }
  });
});

describe("client value == submitted value == server-saved value", () => {
  const roundTrip = (doc: InvestorDoc) => { const r = parseDoc(JSON.parse(JSON.stringify(doc))); if (!r.ok) throw new Error(r.error); return r.doc; };
  const base = { sell: false, asset: "BTC", date: "2026-11-20", manual: false, feeText: "", quote: "USDT" as const, bnb: false };
  it("comma and dot inputs end up as identical stored numbers, and the client total equals the stored cost", () => {
    for (const [q, p] of [["0,25", "12,5"], ["0.25", "12.5"], ["0,123456789", "1234,567891234"], ["١٫٥", "٢٫٥"], ["3", "7"]]) {
      const e = evaluateTrade({ ...base, qtyText: q, priceText: p });
      expect(e.valid, `${q} ${p}`).toBe(true);
      const rec = { id: "p1", asset: "BTC", date: "2026-11-20", qty: e.q, price: e.p, fee: r8(e.fee), quote: "USDT" as const };
      const saved = roundTrip({ ...emptyDoc(), purchases: [rec] }).purchases[0];
      expect(saved.qty).toBe(e.q);
      expect(saved.price).toBe(e.p);
      expect(saved.fee).toBe(r8(e.fee));
      expect(r8(saved.qty * saved.price + saved.fee)).toBe(e.total);
    }
  });
  it("more than 8 decimals: the client rounds exactly like the server, so nothing differs after saving", () => {
    const e = evaluateTrade({ ...base, qtyText: "0,123456789", priceText: "10" });
    expect(e.q).toBe(0.12345679);
    expect(roundTrip({ ...emptyDoc(), purchases: [{ id: "a", asset: "BTC", date: "2026-11-20", qty: 0.123456789, price: 10, fee: 0 }] }).purchases[0].qty).toBe(e.q);
  });
  it("amounts the server would reject are flagged on the field instead of failing later", () => {
    expect(evaluateTrade({ ...base, qtyText: "0,000000004", priceText: "10" }).errors).toEqual({ qty: "positive" });
    expect(evaluateTrade({ ...base, qtyText: "1", priceText: "1000000000001" }).errors).toEqual({ price: "number" });
    expect(evaluateTrade({ ...base, qtyText: "1", priceText: "1", manual: true, feeText: "2000000000000" }).errors).toEqual({ fee: "number" });
    expect(evaluateTrade({ ...base, qtyText: "1", priceText: "1000000000000" }).valid).toBe(true);
  });
  it("sale, cash, plan and manual price comma values survive the server validator unchanged", () => {
    const doc = roundTrip({
      ...emptyDoc(),
      sales: [{ id: "s1", asset: "BTC", date: "2026-11-20", qty: parseNum("0,5"), price: parseNum("100,25"), fee: parseNum("0,05") }],
      cash: [{ id: "c1", date: "2026-11-20", type: "deposit", amount: parseNum("250,75") }],
      plans: [{ id: "d1", name: "x", asset: "BTC", budget: parseNum("1500,5"), initial: parseNum("0"), recurring: { amount: parseNum("100,5"), frequency: "monthly", startDate: "2026-11-20", count: 12 }, dips: [{ dropPct: parseNum("12,5"), amount: parseNum("50,25") }], refPrice: parseNum("67890,5"), createdAt: "2026-11-20T00:00:00.000Z" }],
      manualPrices: { ETH: { price: parseNum("0,00001234"), at: "2026-11-20T00:00:00.000Z" } },
    });
    expect(doc.sales[0]).toMatchObject({ qty: 0.5, price: 100.25, fee: 0.05 });
    expect(doc.cash[0].amount).toBe(250.75);
    expect(doc.plans[0]).toMatchObject({ budget: 1500.5, refPrice: 67890.5, recurring: { amount: 100.5 }, dips: [{ dropPct: 12.5, amount: 50.25 }] });
    expect(doc.manualPrices.ETH.price).toBe(0.00001234);
  });
  it("the server API route never parses text: it receives JSON numbers only", () => {
    const src = read("app/api/me/investor/route.ts") + read("lib/investor/model.ts");
    expect(src).not.toMatch(/parseNum|parseFloat|parseDecimal/);
  });
});
