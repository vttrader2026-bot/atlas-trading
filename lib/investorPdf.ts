// INVESTOR-PDF-v1: downloadable report of the signed-in user's OWN Atlas Investor data. Generated in the browser from the
// same InvestorDoc + summarize() numbers the dashboard shows, so nothing is sent anywhere and nothing is re-estimated.
// A figure that is unknown (no price) is printed as "-", never guessed. Free-text notes are left out (the built-in PDF
// font cannot print every script). English only for the same reason.
import type { InvestorDoc } from "@/lib/investor/model";
import { purchaseCost, saleProceeds } from "@/lib/investor/model";
import type { Summary } from "@/lib/investor/calc";
import { assetOf } from "@/lib/investor/assets";

export type PdfFmt = { currency: string; money: (n: number) => string; signed: (n: number) => string; price: (n: number) => string };
export type PdfLine = { label: string; value: string };
export type InvestorReport = {
  summary: PdfLine[];
  notes: string[];
  allocation: { asset: string; value: string; share: string }[];
  holdings: Record<"Asset" | "Qty" | "Avg cost" | "Cost basis" | "Price" | "Value" | "P/L" | "ROI" | "Share", string>[];
  transactions: Record<"Date" | "Type" | "Asset" | "Qty" | "Price" | "Fee" | "Total", string>[];
  cash: Record<"Date" | "Type" | "Amount", string>[];
};

const DASH = "-";
const pct = (n: number | null | undefined, signed = false) => (n === null || n === undefined || !Number.isFinite(n) ? DASH : `${signed && n > 0 ? "+" : ""}${n.toFixed(2)}%`);
const qtyStr = (n: number) => String(Math.round(n * 1e8) / 1e8);

export function buildInvestorReport(doc: InvestorDoc, s: Summary, f: PdfFmt): InvestorReport {
  const priced = s.holdings.filter((h) => h.value !== null);
  // Only unknown (holdings exist but none has a price) prints "-"; an empty portfolio is a real zero.
  const unknown = s.holdings.length > 0 && priced.length === 0;
  const notes: string[] = [`Amounts are shown in ${f.currency}. Prices come from Binance spot or from prices you entered manually.`];
  if (s.missingPrices.length) notes.push(`No price available for ${s.missingPrices.join(", ")}: their value, profit/loss and ROI are not included in the totals.`);
  if (s.usesManualPrices) notes.push("Some values use prices you entered manually, not live Binance prices.");
  if (s.ledgerIssue) notes.push(`Your records contain a sale of more than you held (${s.ledgerIssue.asset} on ${s.ledgerIssue.date}). Figures may be incomplete until it is corrected.`);
  notes.push("Atlas Investor is a record of purchases you made yourself. It is not financial advice and does not connect to any exchange account.");

  const tx = [
    ...doc.purchases.map((p) => ({ date: p.date, id: p.id, row: { Date: p.date, Type: "Buy", Asset: p.asset, Qty: qtyStr(p.qty), Price: f.price(p.price), Fee: f.money(p.fee), Total: f.money(purchaseCost(p)) } })),
    ...doc.sales.map((x) => ({ date: x.date, id: x.id, row: { Date: x.date, Type: "Sell", Asset: x.asset, Qty: qtyStr(x.qty), Price: f.price(x.price), Fee: f.money(x.fee), Total: f.money(saleProceeds(x)) } })),
  ].sort((a, b) => (a.date === b.date ? (a.id < b.id ? 1 : -1) : a.date < b.date ? 1 : -1));

  return {
    summary: [
      { label: "Total invested (cost of current holdings)", value: f.money(s.invested) },
      { label: "Current portfolio value", value: unknown ? DASH : f.money(s.value) },
      { label: "Unrealized profit / loss", value: unknown ? DASH : f.signed(s.unrealized) },
      { label: "ROI (priced holdings)", value: pct(s.roiPct, true) },
      { label: "Realized profit / loss", value: f.signed(s.realized) },
      { label: "Cash balance", value: f.money(s.cash) },
      { label: "Total bought (all purchases)", value: f.money(s.totalBought) },
    ],
    notes,
    allocation: priced.map((h) => ({ asset: h.asset, value: f.money(h.value as number), share: pct(h.allocationPct) })),
    holdings: s.holdings.map((h) => ({
      Asset: `${h.asset} ${assetOf(h.asset)?.name ?? ""}`.trim(), Qty: qtyStr(h.qty), "Avg cost": h.qty > 0 ? f.price(h.costBasis / h.qty) : DASH, "Cost basis": f.money(h.costBasis),
      Price: h.price ? f.price(h.price.price) : DASH, Value: h.value === null ? DASH : f.money(h.value), "P/L": h.unrealized === null ? DASH : f.signed(h.unrealized), ROI: pct(h.roiPct, true), Share: pct(h.allocationPct),
    })),
    transactions: tx.map((t) => t.row),
    cash: [...doc.cash].sort((a, b) => (a.date < b.date ? 1 : -1)).map((c) => ({ Date: c.date, Type: c.type === "deposit" ? "Deposit" : "Withdrawal", Amount: f.money(c.amount) })),
  };
}

const INK: [number, number, number] = [18, 20, 28];
const MUTED: [number, number, number] = [110, 114, 126];
const GOLD: [number, number, number] = [196, 140, 30];

export async function renderInvestorPdf(doc: InvestorDoc, s: Summary, f: PdfFmt, generatedAt = new Date()) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const r = buildInvestorReport(doc, s, f);
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), mx = 40;
  const stamp = generatedAt.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  let y = 0;

  const header = () => {
    pdf.setFillColor(...INK); pdf.rect(0, 0, W, y === 0 ? 70 : 34, "F");
    pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold");
    if (y === 0) { pdf.setFontSize(20); pdf.text("ATLAS Investor - Portfolio Report", mx, 34); pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(200, 200, 205); pdf.text(`Generated ${stamp}   |   Currency: ${f.currency}`, mx, 54); y = 96; }
    else { pdf.setFontSize(11); pdf.text("ATLAS Investor - Portfolio Report", mx, 22); y = 56; }
  };
  const need = (h: number) => { if (y + h > H - 40) { pdf.addPage(); y = 1; header(); } };
  const title = (t: string) => { need(40); pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.setTextColor(...GOLD); pdf.text(t.toUpperCase(), mx, y); y += 16; };
  const table = (cols: string[], rows: string[][], widths: number[]) => {
    const head = () => { pdf.setFillColor(238, 238, 241); pdf.rect(mx, y - 10, W - mx * 2, 16, "F"); pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5); pdf.setTextColor(...INK); let x = mx; cols.forEach((c, i) => { pdf.text(c.toUpperCase(), i === 0 ? x + 3 : x + widths[i] - 3, y, { align: i === 0 ? "left" : "right" }); x += widths[i]; }); y += 14; };
    need(40); head();
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8);
    rows.forEach((row, ri) => {
      if (y + 14 > H - 40) { pdf.addPage(); y = 1; header(); head(); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); }
      if (ri % 2) { pdf.setFillColor(248, 248, 250); pdf.rect(mx, y - 9, W - mx * 2, 13, "F"); }
      pdf.setTextColor(...INK); let x = mx;
      row.forEach((c, i) => { pdf.text(c, i === 0 ? x + 3 : x + widths[i] - 3, y, { align: i === 0 ? "left" : "right", maxWidth: widths[i] - 6 }); x += widths[i]; });
      y += 13;
    });
    y += 12;
  };

  header();
  title("Portfolio summary");
  r.summary.forEach((l, i) => { need(18); if (i % 2 === 0) { pdf.setFillColor(248, 248, 250); pdf.rect(mx, y - 11, W - mx * 2, 17, "F"); } pdf.setFont("helvetica", "normal"); pdf.setFontSize(9.5); pdf.setTextColor(...INK); pdf.text(l.label, mx + 4, y); pdf.setFont("helvetica", "bold"); pdf.text(l.value, W - mx - 4, y, { align: "right" }); y += 17; });
  y += 10;

  title("Asset allocation");
  if (r.allocation.length) table(["Asset", "Value", "Share"], r.allocation.map((a) => [a.asset, a.value, a.share]), [220, 150, 105]);
  else { pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(...MUTED); pdf.text("No priced holdings to show.", mx, y); y += 22; }

  title("Individual holdings");
  if (r.holdings.length) table(["Asset", "Qty", "Avg cost", "Cost basis", "Price", "Value", "P/L", "ROI"], r.holdings.map((h) => [h.Asset, h.Qty, h["Avg cost"], h["Cost basis"], h.Price, h.Value, h["P/L"], h.ROI]), [95, 55, 58, 62, 58, 62, 62, 43]);
  else { pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(...MUTED); pdf.text("No current holdings.", mx, y); y += 22; }

  title("Transaction history");
  if (r.transactions.length) table(["Date", "Type", "Asset", "Qty", "Price", "Fee", "Total"], r.transactions.map((t) => [t.Date, t.Type, t.Asset, t.Qty, t.Price, t.Fee, t.Total]), [70, 45, 50, 80, 85, 60, 85]);
  else { pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(...MUTED); pdf.text("No transactions recorded.", mx, y); y += 22; }

  if (r.cash.length) { title("Cash ledger"); table(["Date", "Type", "Amount"], r.cash.map((c) => [c.Date, c.Type, c.Amount]), [120, 150, 205]); }

  need(20 + r.notes.length * 12); title("Notes");
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(...MUTED);
  r.notes.forEach((n) => { const lines = pdf.splitTextToSize(n, W - mx * 2) as string[]; need(lines.length * 11 + 4); pdf.text(lines, mx, y); y += lines.length * 11 + 3; });

  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) { pdf.setPage(p); pdf.setFontSize(7.5); pdf.setTextColor(...MUTED); pdf.text("Atlas Trading - private record of your own Atlas Investor data.", mx, H - 20); pdf.text(`Page ${p} of ${pages}`, W - mx, H - 20, { align: "right" }); }
  return pdf;
}

export async function downloadInvestorPdf(doc: InvestorDoc, s: Summary, f: PdfFmt): Promise<void> {
  const pdf = await renderInvestorPdf(doc, s, f);
  pdf.save(`atlas-investor-${new Date().toISOString().slice(0, 10)}.pdf`);
}
