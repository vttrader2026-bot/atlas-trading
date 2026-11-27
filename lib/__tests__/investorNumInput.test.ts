import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { evaluateTrade, numText, parseDecimal, validateTrade } from "@/lib/investor/numInput";
import { parseNum } from "@/components/investor/fmt";
import { emptyDoc, parseDoc, purchaseCost, r8, type Quote } from "@/lib/investor/model";
import { withPlanPurchase } from "@/lib/investor/dca";
import { calcFee } from "@/lib/investor/fees";

const base = { sell: false, asset: "BTC", date: "2026-11-20", manual: false, feeText: "", quote: "USDT" as Quote, bnb: false };
const ev = (qtyText: string, priceText: string, extra: Partial<typeof base> = {}) => evaluateTrade({ ...base, ...extra, qtyText, priceText });

describe("parseDecimal: decimal point and decimal comma", () => {
  it("price 12.5 and 12,5 are both 12.5", () => {
    expect(parseDecimal("12.5")).toBe(12.5);
    expect(parseDecimal("12,5")).toBe(12.5);
  });
  it("quantity 0.25 and 0,25 are both 0.25 (the old parser returned 25 for the comma)", () => {
    expect(parseDecimal("0.25")).toBe(0.25);
    expect(parseDecimal("0,25")).toBe(0.25);
  });
  it("integers, leading/trailing separators and whitespace", () => {
    expect(parseDecimal("42")).toBe(42);
    expect(parseDecimal(" 42 ")).toBe(42);
    expect(parseDecimal(".5")).toBe(0.5);
    expect(parseDecimal(",5")).toBe(0.5);
    expect(parseDecimal("12.")).toBe(12);
    expect(parseDecimal("12,")).toBe(12);
  });
  it("does not round: full typed precision is preserved", () => {
    expect(parseDecimal("0,00000001")).toBe(1e-8);
    expect(parseDecimal("0.123456789012")).toBe(0.123456789012);
    expect(parseDecimal("67890,12345678")).toBe(67890.12345678);
  });
  it("Arabic-Indic and Persian digits with the Arabic decimal separator (iOS Arabic keyboard)", () => {
    expect(parseDecimal("١٢٫٥")).toBe(12.5);
    expect(parseDecimal("٠٫٢٥")).toBe(0.25);
    expect(parseDecimal("١٢,٥")).toBe(12.5);
    expect(parseDecimal("۱۲٫۵")).toBe(12.5);
    expect(parseDecimal("٤٢")).toBe(42);
  });
  it("thousands grouping is unambiguous: a single separator is always the decimal", () => {
    expect(parseDecimal("1,234")).toBe(1.234);
    expect(parseDecimal("1.234")).toBe(1.234);
    expect(parseDecimal("1,234.5")).toBe(1234.5);
    expect(parseDecimal("1.234,5")).toBe(1234.5);
    expect(parseDecimal("1,234,567")).toBe(1234567);
    expect(parseDecimal("1.234.567,89")).toBe(1234567.89);
    expect(parseDecimal("1 234,5")).toBe(1234.5);
    expect(parseDecimal("1 234,5")).toBe(1234.5);
    expect(parseDecimal("1 234,5")).toBe(1234.5);
    expect(parseDecimal("١٬٢٣٤٫٥")).toBe(1234.5);
  });
  it("rejects malformed or ambiguous text instead of guessing", () => {
    for (const bad of ["", "   ", "abc", "12abc", "1e3", "0x10", "Infinity", "NaN", "12.5.5", "12,5,5", "1,23.4", "1.2,3,4", "--5", "-", ".", ",", "12 5 a", "1,2345,678", "$12"])
      expect(parseDecimal(bad), JSON.stringify(bad)).toBeNaN();
  });
  it("negative numbers parse (so the validator can name the problem)", () => {
    expect(parseDecimal("-5")).toBe(-5);
    expect(parseDecimal("-0,5")).toBe(-0.5);
  });
  it("the shared parseNum used across the Investor screens delegates to it", () => {
    expect(parseNum("12,5")).toBe(12.5);
    expect(parseNum("")).toBeNaN();
  });
  it("numText never emits exponent notation, so prefilled values parse back exactly", () => {
    for (const n of [1e-7, 1e-8, 0.00000015, 123456789.12345678, 0.1, 5, 1e15]) {
      expect(numText(n)).not.toMatch(/e/i);
      expect(parseDecimal(numText(n))).toBeCloseTo(n, 12);
    }
    expect(numText(Number.NaN)).toBe("");
  });
});

describe("live total with decimal commas", () => {
  it("12,5 x 0,25 equals 12.5 x 0.25, fee included", () => {
    const dot = ev("0.25", "12.5"), comma = ev("0,25", "12,5");
    expect(comma.q).toBe(0.25);
    expect(comma.p).toBe(12.5);
    expect(comma.total).toBe(dot.total);
    expect(comma.total).toBe(r8(0.25 * 12.5 + calcFee(0.25, 12.5, "USDT", false)));
    expect(comma.valid).toBe(true);
  });
  it("updates as the user types, and shows nothing until the numbers are usable", () => {
    expect(ev("", "").total).toBeNull();
    expect(ev("0,", "").total).toBeNull();
    expect(ev("0,2", "100").total).toBe(r8(0.2 * 100 + calcFee(0.2, 100, "USDT", false)));
    expect(ev("0,25", "100,5").total).toBe(r8(0.25 * 100.5 + calcFee(0.25, 100.5, "USDT", false)));
  });
  it("the total does not wait for asset/date, but saving does", () => {
    const r = ev("0,25", "12,5", { asset: "" });
    expect(r.total).not.toBeNull();
    expect(r.valid).toBe(false);
    expect(r.errors).toEqual({ asset: "asset" });
  });
  it("sell proceeds subtract the fee; manual comma fee is honoured", () => {
    expect(ev("2", "10", { sell: true, manual: true, feeText: "0,5" }).total).toBe(19.5);
    expect(ev("2", "10", { manual: true, feeText: "0,5" }).total).toBe(20.5);
  });
  it("Arabic-Indic input calculates too", () => {
    expect(ev("٠٫٢٥", "١٢٫٥").total).toBe(ev("0.25", "12.5").total);
  });
  it("USDC and BNB discount fee paths still apply", () => {
    expect(ev("1", "1000", { quote: "USDC", bnb: true }).fee).toBe(calcFee(1, 1000, "USDC", true));
  });
});

describe("per-field validation", () => {
  const v = (qtyText: string, priceText: string, manual = false, feeText = "") => validateTrade({ asset: "BTC", date: "2026-11-20", qtyText, priceText, fee: 0, manual, feeText });
  it("valid comma and dot values produce no errors at all", () => {
    expect(v("0,25", "12,5")).toEqual({});
    expect(v("0.25", "12.5")).toEqual({});
    expect(v("3", "7")).toEqual({});
    expect(v("١٫٥", "٢٫٥")).toEqual({});
  });
  it("empty fields are 'required' on exactly the empty field", () => {
    expect(v("", "5")).toEqual({ qty: "required" });
    expect(v("2", "  ")).toEqual({ price: "required" });
    expect(v("", "")).toEqual({ qty: "required", price: "required" });
  });
  it("invalid text is 'number' on exactly that field", () => {
    expect(v("abc", "5")).toEqual({ qty: "number" });
    expect(v("2", "1e3")).toEqual({ price: "number" });
    expect(v("1,2,3x", "5")).toEqual({ qty: "number" });
  });
  it("zero and negative values are rejected for quantity and price", () => {
    expect(v("0", "5")).toEqual({ qty: "positive" });
    expect(v("0,00", "5")).toEqual({ qty: "positive" });
    expect(v("2", "0")).toEqual({ price: "positive" });
    expect(v("-1", "5")).toEqual({ qty: "negative" });
    expect(v("2", "-5,5")).toEqual({ price: "negative" });
  });
  it("manual fee: empty and zero are fine; negative or text are not", () => {
    expect(v("1", "1", true, "")).toEqual({});
    expect(v("1", "1", true, "0")).toEqual({});
    expect(v("1", "1", true, "0,5")).toEqual({});
    expect(v("1", "1", true, "-0,5")).toEqual({ fee: "negative" });
    expect(v("1", "1", true, "x")).toEqual({ fee: "number" });
  });
  it("auto-fee mode ignores a stale manual text", () => {
    expect(v("1", "1", false, "garbage")).toEqual({});
  });
  it("asset and date errors are separate from number errors", () => {
    expect(validateTrade({ asset: "", date: "", qtyText: "1", priceText: "1", fee: 0, manual: false, feeText: "" })).toEqual({ asset: "asset", date: "date" });
  });
});

describe("purchase submission with comma-decimal values", () => {
  it("builds the same record as dot input and the server-side document validator accepts it", () => {
    const build = (qtyText: string, priceText: string) => {
      const r = ev(qtyText, priceText);
      expect(r.valid).toBe(true);
      return { id: "p1", asset: "BTC", date: "2026-11-20", qty: r.q, price: r.p, fee: r8(r.fee), quote: "USDT" as const };
    };
    const a = build("0,25", "12,5"), b = build("0.25", "12.5");
    expect(a).toEqual(b);
    expect(a.qty).toBe(0.25);
    expect(a.price).toBe(12.5);
    const doc = { ...emptyDoc(), purchases: withPlanPurchase([], a) };
    const parsed = parseDoc(JSON.parse(JSON.stringify(doc)));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.doc.purchases).toHaveLength(1);
      expect(purchaseCost(parsed.doc.purchases[0])).toBe(r8(0.25 * 12.5 + a.fee));
    }
  });
  it("a tiny BTC-sized quantity with an 8-decimal comma is stored without rounding", () => {
    const r = ev("0,00012345", "67890,5");
    expect(r.q).toBe(0.00012345);
    expect(r.p).toBe(67890.5);
    expect(r.valid).toBe(true);
  });
  it("invalid input blocks saving", () => {
    expect(ev("abc", "12,5").valid).toBe(false);
    expect(ev("0", "12,5").valid).toBe(false);
    expect(ev("", "").valid).toBe(false);
  });
});

describe("TradeForm wiring", () => {
  const src = readFileSync("components/investor/TradeForm.tsx", "utf8");
  it("uses the shared evaluator, keeps a text input with a decimal keypad, and shows per-field errors", () => {
    expect(src).toContain("evaluateTrade(");
    expect(src).not.toContain('type="number"');
    expect(src.match(/inputMode="decimal"/g)?.length).toBe(3);
    for (const id of ["inv-err-qty", "inv-err-price", "inv-err-fee", "inv-err-asset", "inv-err-date"]) expect(src).toContain(id);
    expect(src).toContain("aria-invalid");
  });
  it("the generic message only appears when something is actually invalid", () => {
    expect(src).toContain("err && !valid && !tooMuch");
  });
  it("every language has the new field messages", () => {
    for (const l of ["en", "ar", "fr"]) {
      const t = readFileSync(`lib/i18n/parts/investor.${l}.ts`, "utf8");
      for (const k of ["errAsset", "errDate", "errRequired", "errNumber", "errPositive", "errNegative"]) expect(t, `${l}.${k}`).toContain(`${k}:`);
    }
  });
});
