// ATLAS INVESTOR V1 formatting helpers (kept separate from the Journal's).
/** Fills {placeholders}. Each value is wrapped in invisible left-to-right isolates so numbers, tickers and amounts keep their order inside Arabic sentences. */
export const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => `\u2066${String(vars[k] ?? "")}\u2069`);
export const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const signedUsd = (n: number) => `${n > 0 ? "+" : ""}${usd(n)}`;
export const pct = (n: number | null) => (n === null || !Number.isFinite(n) ? "—" : `${n.toFixed(2)}%`);
export const signedPct = (n: number | null) => (n === null || !Number.isFinite(n) ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`);
/** Adaptive decimals so cheap coins (DOGE, TRX) and BTC both read well. */
export const price = (n: number) => {
  const a = Math.abs(n);
  const d = a >= 1000 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : 8;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: d })}`;
};
export const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 8 });
export const tone = (n: number | null) => (n === null || n === 0 ? "text-text" : n > 0 ? "text-bull" : "text-bear");
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "").slice(0, 20) : Math.random().toString(36).slice(2, 12) + Date.now().toString(36));
/** Parses a user-typed number ("1,234.5" or "1234.5"). Returns NaN when invalid. */
export const parseNum = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/,/g, "")));
