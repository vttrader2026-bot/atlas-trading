// PERFORMANCE-v1: small UI helpers (no data access).
export const fill = (s: string, v: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));

export type Preset = "all" | "30" | "90" | "ytd";
const p2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/** Inclusive date range for a preset, ending today (local). "all" has no bounds. */
export function rangeFor(preset: Preset, now = new Date()): { from: string; to: string } {
  if (preset === "all") return { from: "", to: "" };
  if (preset === "ytd") return { from: `${now.getFullYear()}-01-01`, to: ymd(now) };
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (Number(preset) - 1));
  return { from: ymd(start), to: ymd(now) };
}

/** Parses the optional starting equity text: a positive number, else null. */
export function parseEquity(text: string): number | null {
  const n = Number(text.trim().replace(/,/g, "."));
  return text.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
}

export function Num({ children, cls = "" }: { children: React.ReactNode; cls?: string }) {
  return <span dir="ltr" className={`font-data ${cls}`} style={{ unicodeBidi: "isolate", display: "inline-block" }}>{children}</span>;
}
