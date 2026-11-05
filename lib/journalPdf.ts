// JOURNAL-PDF-v1
// "Download PDF" for the Trading Journal. Pure report model (buildJournalReport, unit-tested) + a jsPDF renderer.
// Every number comes from the Journal's own functions (lib/journal.ts), nothing is recalculated here.
// English only, like the Analyzer PDF (jsPDF's built-in fonts have no Arabic); free-text notes are left out.
// Client-only: jsPDF is loaded on demand.

import { computeDashboard, feesOf, investedOf, realizedPnl, roiPct, statusOf, type Trade } from "@/lib/journal";

const DASH = "-";

/** Prices keep their precision (sub-cent coins stay readable) without trailing noise. */
export function fmtPrice(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n <= 0) return DASH;
  const d = n >= 1000 ? 2 : n >= 1 ? 4 : 8;
  return n.toFixed(d).replace(/\.?0+$/, "");
}
export function fmtMoney(n: number | null | undefined, signed = false): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n < 0 ? "-" : signed && n > 0 ? "+" : "") + s;
}
export function fmtPct(n: number | null | undefined, signed = true): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  return (n < 0 ? "-" : signed && n > 0 ? "+" : "") + Math.abs(n).toFixed(2) + "%";
}
function fmtSize(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return DASH;
  return n >= 1000 ? n.toFixed(2) : n.toPrecision(6).replace(/\.?0+$/, "");
}

export const REPORT_COLUMNS = ["Date", "Pair", "Status", "Entry", "Stop", "TP1", "TP2", "TP3", "Exit", "Invested", "Size", "PnL", "ROI"] as const;

export type ReportRow = Record<(typeof REPORT_COLUMNS)[number], string> & { tone: "win" | "loss" | "flat" | "open" };
export type SummaryLine = { label: string; value: string };
export type JournalReport = { rows: ReportRow[]; summary: SummaryLine[]; counts: { total: number; open: number; closed: number } };

export function buildJournalReport(trades: Trade[]): JournalReport {
  // Newest first, like the Journal list.
  const sorted = [...trades].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const rows: ReportRow[] = sorted.map((t) => {
    const closed = statusOf(t) === "closed";
    const pnl = realizedPnl(t);
    return {
      Date: t.date || DASH,
      Pair: t.pair || DASH,
      Status: closed ? "Closed" : "Open",
      Entry: fmtPrice(t.entry),
      Stop: fmtPrice(t.stop),
      TP1: fmtPrice(t.tp1 ?? (t.target > 0 ? t.target : null)),
      TP2: fmtPrice(t.tp2),
      TP3: fmtPrice(t.tp3),
      Exit: closed ? fmtPrice(t.exit) : DASH,
      Invested: fmtMoney(investedOf(t)),
      Size: fmtSize(t.size),
      PnL: pnl === null ? DASH : fmtMoney(pnl, true),
      ROI: fmtPct(roiPct(t)),
      tone: pnl === null ? "open" : pnl > 0 ? "win" : pnl < 0 ? "loss" : "flat",
    };
  });

  const d = computeDashboard(trades);
  const closedTrades = trades.filter((t) => statusOf(t) === "closed");
  const closedInvested = closedTrades.reduce((s, t) => s + investedOf(t), 0);
  const totalFees = trades.reduce((s, t) => s + feesOf(t), 0);
  const openInvested = trades.filter((t) => statusOf(t) === "open").reduce((s, t) => s + investedOf(t), 0);
  const pairOf = (x: { trade: Trade } | null) => (x ? x.trade.pair : "");
  const summary: SummaryLine[] = [
    { label: "Total trades", value: String(d.total) },
    { label: "Open / Closed", value: `${d.open} / ${d.closed}` },
    { label: "Wins / Losses / Break-even", value: d.closed ? `${d.wins} / ${d.losses} / ${d.breakeven}` : DASH },
    { label: "Win rate", value: d.winRate === null ? DASH : fmtPct(d.winRate, false) },
    { label: "Net realized PnL (USDT)", value: d.closed ? fmtMoney(d.realizedPnl, true) : DASH },
    { label: "Realized ROI on closed trades", value: closedInvested > 0 && d.closed ? fmtPct((d.realizedPnl / closedInvested) * 100) : DASH },
    { label: "Average win / loss (USDT)", value: d.avgWin === null && d.avgLoss === null ? DASH : `${fmtMoney(d.avgWin, true)} / ${fmtMoney(d.avgLoss, true)}` },
    { label: "Best trade", value: d.best ? `${pairOf(d.best)} ${fmtMoney(d.best.pnl, true)}` : DASH },
    { label: "Worst trade", value: d.worst ? `${pairOf(d.worst)} ${fmtMoney(d.worst.pnl, true)}` : DASH },
    { label: "Capital in open trades (USDT)", value: fmtMoney(openInvested) },
    { label: "Total fees paid (USDT)", value: fmtMoney(totalFees) },
  ];
  return { rows, summary, counts: { total: d.total, open: d.open, closed: d.closed } };
}

// ───────────────────────── rendering ─────────────────────────

// Column widths in points; they add up to the usable width of an A4 landscape page with 36pt margins (770).
const COL_W = [58, 62, 44, 62, 62, 56, 56, 56, 62, 62, 62, 66, 62];
const GOLD: [number, number, number] = [166, 124, 29];
const INK: [number, number, number] = [24, 24, 28];
const MUTED: [number, number, number] = [110, 110, 118];
const TONE: Record<ReportRow["tone"], [number, number, number]> = { win: [22, 128, 78], loss: [190, 40, 50], flat: INK, open: MUTED };

export async function renderJournalPdf(trades: Trade[], generatedAt = new Date()) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const report = buildJournalReport(trades);
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const mx = 36;
  const stamp = generatedAt.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  let y = 0;

  const header = (first: boolean) => {
    doc.setFillColor(...INK);
    doc.rect(0, 0, W, first ? 64 : 34, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(first ? 20 : 12);
    doc.text("ATLAS Trading - Trading Journal Report", mx, first ? 32 : 22);
    if (first) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(200, 200, 205);
      doc.text(`Generated ${stamp}   |   ${report.counts.total} trades (${report.counts.open} open, ${report.counts.closed} closed)`, mx, 50);
    }
    y = first ? 88 : 54;
  };

  const tableHead = () => {
    doc.setFillColor(238, 238, 241);
    doc.rect(mx, y - 11, W - mx * 2, 17, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    let x = mx;
    REPORT_COLUMNS.forEach((c, i) => {
      const right = i >= 3;
      doc.text(c.toUpperCase(), right ? x + COL_W[i] - 4 : x + 4, y, { align: right ? "right" : "left" });
      x += COL_W[i];
    });
    y += 14;
  };

  header(true);

  // Performance summary
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...GOLD);
  doc.text("Performance summary", mx, y);
  y += 14;
  const colCount = 3;
  const cellW = (W - mx * 2) / colCount;
  const perCol = Math.ceil(report.summary.length / colCount);
  report.summary.forEach((line, i) => {
    const cx = mx + Math.floor(i / perCol) * cellW;
    const cy = y + (i % perCol) * 15;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(line.label, cx, cy);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    doc.text(line.value, cx + cellW - 16, cy, { align: "right" });
  });
  y += perCol * 15 + 18;

  // Trade history
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...GOLD);
  doc.text("Trade history", mx, y);
  y += 18;
  tableHead();

  report.rows.forEach((row, ri) => {
    if (y > H - 46) {
      doc.addPage();
      header(false);
      tableHead();
    }
    if (ri % 2 === 1) {
      doc.setFillColor(249, 249, 251);
      doc.rect(mx, y - 9, W - mx * 2, 15, "F");
    }
    doc.setFontSize(8);
    let x = mx;
    REPORT_COLUMNS.forEach((c, i) => {
      const right = i >= 3;
      const coloured = c === "PnL" || c === "ROI";
      doc.setFont("helvetica", c === "Pair" || coloured ? "bold" : "normal");
      doc.setTextColor(...(coloured ? TONE[row.tone] : c === "Status" ? (row.Status === "Open" ? GOLD : MUTED) : INK));
      doc.text(row[c], right ? x + COL_W[i] - 4 : x + 4, y, { align: right ? "right" : "left" });
      x += COL_W[i];
    });
    y += 15;
  });

  if (report.rows.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text("No trades in the Journal yet.", mx, y + 6);
  }

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text("Atlas Trading - for personal record keeping only. Not financial advice. PnL is net of the fees entered.", mx, H - 20);
    doc.text(`Page ${p} of ${pages}`, W - mx, H - 20, { align: "right" });
  }
  return doc;
}

export async function downloadJournalPdf(trades: Trade[]): Promise<void> {
  const doc = await renderJournalPdf(trades);
  doc.save(`atlas-trading-journal-${new Date().toISOString().slice(0, 10)}.pdf`);
}
