// Latin digits in every language, like the Risk Calculator, so prices stay unambiguous.
export const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const signedUsd = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${usd(Math.abs(n))}`;
export const pct = (n: number) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
export const signedPct = (n: number) => `${n > 0 ? "+" : ""}${pct(n)}`;
export function price(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const digits = Math.abs(n) >= 1000 ? 2 : Math.abs(n) >= 1 ? 4 : 8;
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}
export const qty = price;
export const tone = (n: number | null | undefined) => (n === null || n === undefined || n === 0 ? "text-text" : n > 0 ? "text-bull" : "text-bear");
/** Local calendar date (not UTC) as YYYY-MM-DD. */
export function todayLocal(d = new Date()): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const plain = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? "" : String(Number(n.toFixed(8)));
