// JOURNAL-PDF-v1: the report numbers come from the Journal's own functions; the PDF itself is generated for real (jsPDF).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildJournalReport, fmtMoney, fmtPct, fmtPrice, renderJournalPdf, REPORT_COLUMNS } from "@/lib/journalPdf";
import { computeDashboard, realizedPnl, roiPct, type Trade } from "@/lib/journal";

const trade = (o: Partial<Trade> = {}): Trade => ({
  id: "t", date: "2026-11-01", pair: "SOLUSDT", side: "Long", entry: 100, stop: 95, target: 110, exit: null, size: 2, notes: "private note", status: "open",
  tp1: 110, tp2: 120, tp3: 130, invested: 200, fees: null, ...o,
});
const win = trade({ id: "w", date: "2026-11-02", pair: "BTCUSDT", entry: 100, exit: 110, status: "closed", exitDate: "2026-11-03", fees: 1 });
const loss = trade({ id: "l", date: "2026-11-03", pair: "ETHUSDT", entry: 50, size: 4, invested: 200, stop: 45, exit: 45, status: "closed", exitDate: "2026-11-04", tp1: 60, tp2: null, tp3: null, target: 60 });
const open = trade({ id: "o", date: "2026-11-04", pair: "ZROUSDT", entry: 0.0123, size: 1000, invested: 12.3, stop: 0.011, tp1: 0.014, tp2: null, tp3: null, target: 0.014 });

describe("report model", () => {
  const r = buildJournalReport([win, loss, open]);
  it("has a column for every requested field", () => {
    expect([...REPORT_COLUMNS]).toEqual(["Date", "Pair", "Status", "Entry", "Stop", "TP1", "TP2", "TP3", "Exit", "Invested", "Size", "PnL", "ROI"]);
  });
  it("lists trades newest first with entry, SL, TPs, invested and size", () => {
    expect(r.rows.map((x) => x.Pair)).toEqual(["ZROUSDT", "ETHUSDT", "BTCUSDT"]);
    expect(r.rows[2]).toMatchObject({ Date: "2026-11-02", Status: "Closed", Entry: "100", Stop: "95", TP1: "110", TP2: "120", TP3: "130", Exit: "110", Invested: "200.00", Size: "2" });
  });
  it("PnL and ROI are exactly the Journal's own numbers", () => {
    expect(realizedPnl(win)).toBe(19);
    expect(r.rows[2]).toMatchObject({ PnL: "+19.00", ROI: "+9.50%", tone: "win" });
    expect(roiPct(loss)).toBe(-10);
    expect(r.rows[1]).toMatchObject({ PnL: "-20.00", ROI: "-10.00%", tone: "loss" });
  });
  it("open trades show their status and no result yet", () => {
    expect(r.rows[0]).toMatchObject({ Status: "Open", Exit: "-", PnL: "-", ROI: "-", tone: "open" });
  });
  it("keeps sub-cent precision and leaves missing levels blank", () => {
    expect(r.rows[0]).toMatchObject({ Entry: "0.0123", Stop: "0.011", TP1: "0.014", TP2: "-", TP3: "-" });
    expect(fmtPrice(61234.5)).toBe("61234.5");
    expect(fmtPrice(0.00001234)).toBe("0.00001234");
    expect(fmtPrice(null)).toBe("-");
  });
  it("performance summary matches the dashboard", () => {
    const d = computeDashboard([win, loss, open]);
    const get = (label: string) => r.summary.find((s) => s.label === label)?.value;
    expect(get("Total trades")).toBe("3");
    expect(get("Open / Closed")).toBe("1 / 2");
    expect(get("Wins / Losses / Break-even")).toBe("1 / 1 / 0");
    expect(get("Win rate")).toBe("50.00%");
    expect(get("Net realized PnL (USDT)")).toBe(fmtMoney(d.realizedPnl, true));
    expect(get("Net realized PnL (USDT)")).toBe("-1.00");
    expect(get("Realized ROI on closed trades")).toBe(fmtPct((d.realizedPnl / 400) * 100));
    expect(get("Best trade")).toBe("BTCUSDT +19.00");
    expect(get("Worst trade")).toBe("ETHUSDT -20.00");
    expect(get("Capital in open trades (USDT)")).toBe("12.30");
    expect(get("Total fees paid (USDT)")).toBe("1.00");
  });
  it("an empty Journal still produces a valid summary and no rows", () => {
    const e = buildJournalReport([]);
    expect(e.rows).toEqual([]);
    expect(e.summary.find((s) => s.label === "Win rate")?.value).toBe("-");
    expect(e.summary.find((s) => s.label === "Total trades")?.value).toBe("0");
  });
  it("does not put free-text notes in the report", () => {
    expect(JSON.stringify(r)).not.toContain("private note");
  });
});

describe("the PDF", () => {
  it("is a real PDF with the title, summary, trades and page footer", async () => {
    const doc = await renderJournalPdf([win, loss, open], new Date("2026-11-05T12:00:00Z"));
    const raw = doc.output();
    expect(raw.startsWith("%PDF")).toBe(true);
    for (const text of ["Trading Journal Report", "Performance summary", "Trade history", "BTCUSDT", "ETHUSDT", "ZROUSDT", "Page 1 of 1", "2026-11-05 12:00 UTC"]) expect(raw).toContain(text);
    expect(doc.getNumberOfPages()).toBe(1);
  });
  it("is landscape A4 and paginates a long history with a repeated header and correct page numbers", async () => {
    const many = Array.from({ length: 90 }, (_, i) => trade({ id: `m${i}`, date: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`, pair: `COIN${i}USDT` }));
    const doc = await renderJournalPdf(many);
    expect(doc.internal.pageSize.getWidth()).toBeGreaterThan(doc.internal.pageSize.getHeight());
    const pages = doc.getNumberOfPages();
    expect(pages).toBeGreaterThan(1);
    const raw = doc.output();
    expect(raw).toContain(`Page ${pages} of ${pages}`);
    expect((raw.match(/Trading Journal Report/g) ?? []).length).toBe(pages);
  });
  it("renders an empty Journal without failing", async () => {
    const doc = await renderJournalPdf([]);
    expect(doc.output()).toContain("No trades in the Journal yet.");
  });
});

describe("wiring", () => {
  const page = readFileSync("app/journal/page.tsx", "utf8");
  it("the Journal page offers Download PDF and no longer offers Export CSV", () => {
    expect(page).toContain('t("journal.downloadPdf")');
    expect(page).not.toContain("exportCsv");
    expect(page).not.toContain("tradesToCsv");
    expect(page).toContain('import("@/lib/journalPdf")');
  });
});
