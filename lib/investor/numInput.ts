// ATLAS INVESTOR: locale-safe decimal parsing and per-field validation for the purchase/sale form.
//
// Why this exists: phone keyboards type the decimal separator of the device locale ("12,5" in French and many
// Arabic regions, "١٢٫٥" with Arabic-Indic digits). The old parser deleted every comma and called Number(), so
// "12,5" silently became 125, "0,25" became 25 and Arabic-Indic digits became NaN (form rejected).
//
// Rules (deliberately simple so nothing is ambiguous):
//  - Arabic-Indic / Persian digits and the Arabic decimal (٫) and thousands (٬) marks are normalised first.
//  - Spaces, no-break spaces, apostrophes and bidi marks are ignored (grouping like "1 234,5").
//  - A SINGLE "." or "," is ALWAYS the decimal separator ("1,234" is 1.234, never 1234).
//  - If both appear, the LAST one is the decimal separator and the other must be well-formed thousands
//    grouping ("1,234.5" and "1.234,5" are 1234.5; "1,23.4" is invalid).
//  - A repeated single separator is thousands grouping and must be groups of three ("1,234,567").
//  - Exponents, hex, "Infinity" and any other text are invalid (NaN). A leading "-" is parsed so the
//    validator can reject it with a clear message where negatives are prohibited.
//  - Nothing is rounded: the parsed value is exactly the typed digits.

import { LIMITS, Quote, r8 } from "./model";
import { calcFee } from "./fees";

const ARABIC_INDIC = /[٠-٩]/g;
const PERSIAN = /[۰-۹]/g;
const IGNORED = /[\s   ‎‏؜⁦-⁩'’]/g;

export function parseDecimal(raw: string): number {
  if (typeof raw !== "string") return NaN;
  let s = raw
    .replace(ARABIC_INDIC, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(PERSIAN, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",")
    .replace(IGNORED, "");
  if (s === "") return NaN;
  let sign = 1;
  if (s[0] === "-" || s[0] === "−") { sign = -1; s = s.slice(1); }
  else if (s[0] === "+") s = s.slice(1);
  if (!/^[\d.,]+$/.test(s)) return NaN;

  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  const grouped = (intPart: string, sep: string) => new RegExp(`^\\d{1,3}(?:\\${sep}\\d{3})+$`).test(intPart);
  let intPart: string, frac = "";

  if (dots === 0 && commas === 0) {
    intPart = s;
  } else if (dots > 0 && commas > 0) {
    const dec = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    const thou = dec === "." ? "," : ".";
    if ((dec === "." ? dots : commas) !== 1) return NaN;
    const i = s.lastIndexOf(dec);
    const left = s.slice(0, i);
    frac = s.slice(i + 1);
    if (!grouped(left, thou)) return NaN;
    intPart = left.split(thou).join("");
  } else {
    const sep = dots > 0 ? "." : ",";
    const n = dots > 0 ? dots : commas;
    if (n === 1) {
      const i = s.indexOf(sep);
      intPart = s.slice(0, i);
      frac = s.slice(i + 1);
    } else {
      if (!grouped(s, sep)) return NaN;
      intPart = s.split(sep).join("");
    }
  }
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(frac)) return NaN;
  if (intPart === "" && frac === "") return NaN;
  const n = Number(`${intPart || "0"}${frac ? "." + frac : ""}`);
  return Number.isFinite(n) ? (n === 0 ? 0 : sign * n) : NaN; // never -0
}

/** Plain decimal text for a number (never "1e-7"), so prefilled values always parse back. */
export function numText(n: number): string {
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
}

export type FieldCode = "required" | "number" | "positive" | "negative" | "asset" | "date";
export type TradeErrors = Partial<Record<"asset" | "date" | "qty" | "price" | "fee", FieldCode>>;

export type TradeInput = {
  asset: string; date: string; qtyText: string; priceText: string;
  /** Fee used by the calculation (auto fee, or the parsed manual fee). */
  fee: number;
  manual: boolean; feeText: string;
};

function positive(text: string): { n: number; code?: FieldCode } {
  if (text.trim() === "") return { n: NaN, code: "required" };
  const n = parseDecimal(text);
  if (Number.isNaN(n) || n > LIMITS.maxValue) return { n, code: "number" };
  if (n < 0) return { n, code: "negative" };
  // The server stores values rounded to 8 decimals (r8), so anything that rounds to zero is not a positive amount.
  if (r8(n) === 0) return { n, code: "positive" };
  return { n };
}

/** Per-field validation. Only genuinely invalid fields get an error; valid values never trigger one. */
export function validateTrade(i: TradeInput): TradeErrors {
  const e: TradeErrors = {};
  if (!i.asset) e.asset = "asset";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) e.date = "date";
  const q = positive(i.qtyText); if (q.code) e.qty = q.code;
  const p = positive(i.priceText); if (p.code) e.price = p.code;
  if (i.manual && i.feeText.trim() !== "") {
    const f = parseDecimal(i.feeText);
    if (Number.isNaN(f) || f > LIMITS.maxValue) e.fee = "number";
    else if (f < 0) e.fee = "negative";
  }
  return e;
}

export type TradeEval = {
  q: number; p: number; fee: number;
  /** Quantity, price and fee are all usable numbers (decides the live total). */
  numsOk: boolean;
  errors: TradeErrors;
  /** Everything needed to save (numbers + asset + date). */
  valid: boolean;
  /** Total cost (buy: qty*price+fee) or proceeds (sell: qty*price-fee); null until the numbers are usable. */
  total: number | null;
};

/** Single source of truth for the form: parses the typed text, derives the fee, validates, and totals. */
export function evaluateTrade(i: { sell: boolean; asset: string; date: string; qtyText: string; priceText: string; manual: boolean; feeText: string; quote: Quote; bnb: boolean }): TradeEval {
  // Same 8-decimal rounding the server applies on save, so the calculation here equals the stored record exactly.
  const q = r8(parseDecimal(i.qtyText)), p = r8(parseDecimal(i.priceText));
  const fee = i.manual ? (i.feeText.trim() === "" ? 0 : r8(parseDecimal(i.feeText))) : calcFee(q, p, i.quote, i.bnb);
  const numsOk = q > 0 && p > 0 && fee >= 0;
  const errors = validateTrade({ asset: i.asset, date: i.date, qtyText: i.qtyText, priceText: i.priceText, fee, manual: i.manual, feeText: i.feeText });
  const valid = Object.keys(errors).length === 0 && numsOk;
  const total = numsOk ? (i.sell ? r8(q * p - fee) : r8(q * p + fee)) : null;
  return { q, p, fee, numsOk, errors, valid, total };
}
