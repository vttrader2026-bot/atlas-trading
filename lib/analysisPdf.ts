// Shared PDF export for an Analyzer result. Used by the Analyzer page
// (screenshot path) and the chart panel's "Analyze with Atlas AI" result, so
// both produce the same document. Client-only (jsPDF is loaded on demand).

type Scenario = { confirmation: string; targets: string[]; why: string } | null;

export type AnalysisPdfData = {
  pair: string;
  timeframe: string;
  marketStructure: { state: string; explanation: string };
  trend: { direction: string; strength: string; explanation: string };
  momentum: string;
  keyLevels: { label: string; price: string }[];
  currentCondition: { label: string; explanation: string };
  bullishScenario: Scenario;
  bearishScenario: Scenario;
  whatToWatch: string[];
  noClearSetup: string | null;
  invalidation: { level: string; explanation: string };
  tradePlan: { direction: string; entryZone: string; invalidation: string; targets: string[]; riskNote: string };
  observations?: { confirmed: string[]; uncertain: string[] };
};

export async function downloadAnalysisPdf(result: AnalysisPdfData) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const marginX = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - marginX * 2;
  let y = 56;

  function ensureSpace(lineHeight: number) {
    if (y + lineHeight > pageHeight - 48) {
      doc.addPage();
      y = 56;
    }
  }

  function heading(text: string, size = 16) {
    ensureSpace(size + 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(size);
    doc.setTextColor(20, 20, 20);
    doc.text(text, marginX, y);
    y += size + 8;
  }

  function label(text: string) {
    ensureSpace(14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text(text.toUpperCase(), marginX, y);
    y += 14;
  }

  function paragraph(text: string | undefined, size = 10) {
    if (!text) return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    doc.setTextColor(40, 40, 40);
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    for (const line of lines) {
      ensureSpace(size + 4);
      doc.text(line, marginX, y);
      y += size + 4;
    }
    y += 4;
  }

  function divider() {
    ensureSpace(14);
    doc.setDrawColor(220, 220, 220);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 14;
  }

  heading(`Atlas Trading - ${result.pair} - ${result.timeframe}`);
  paragraph(`Generated ${new Date().toLocaleString()}`, 9);
  divider();

  label("Market Structure");
  paragraph(result.marketStructure.state);
  paragraph(result.marketStructure.explanation, 9);

  label("Trend");
  paragraph(`${result.trend.direction} - ${result.trend.strength}`);
  paragraph(result.trend.explanation, 9);

  label("Current Condition");
  paragraph(result.currentCondition.label);
  paragraph(result.currentCondition.explanation, 9);

  if (result.momentum) {
    label("Momentum");
    paragraph(result.momentum, 9);
  }

  if (result.keyLevels?.length) {
    label("Key Levels");
    for (const lvl of result.keyLevels) paragraph(`${lvl.label}: ${lvl.price}`, 10);
  }

  const isWait = !!result.noClearSetup || result.tradePlan?.direction?.toLowerCase().includes("wait");
  if (isWait) {
    label("No Clear Setup");
    paragraph(result.noClearSetup || result.currentCondition.explanation, 9);
  } else {
    if (result.bullishScenario) {
      label("Bullish Scenario");
      paragraph(`Confirmation: ${result.bullishScenario.confirmation}`, 9);
      if (result.bullishScenario.targets?.length) {
        paragraph(`Targets: ${result.bullishScenario.targets.join(", ")}`, 9);
      }
      paragraph(`Why: ${result.bullishScenario.why}`, 9);
    }
    if (result.bearishScenario) {
      label("Bearish Scenario");
      paragraph(`Confirmation: ${result.bearishScenario.confirmation}`, 9);
      if (result.bearishScenario.targets?.length) {
        paragraph(`Targets: ${result.bearishScenario.targets.join(", ")}`, 9);
      }
      paragraph(`Why: ${result.bearishScenario.why}`, 9);
    }
  }

  if (result.observations?.confirmed?.length) {
    label("Confirmed");
    for (const item of result.observations.confirmed) paragraph(`- ${item}`, 9);
  }
  if (result.observations?.uncertain?.length) {
    label("Uncertain");
    for (const item of result.observations.uncertain) paragraph(`- ${item}`, 9);
  }

  if (result.whatToWatch?.length) {
    label("What To Watch");
    for (const item of result.whatToWatch) paragraph(`- ${item}`, 9);
  }

  divider();
  label("Invalidation");
  paragraph(result.invalidation.level);
  paragraph(result.invalidation.explanation, 9);

  if (result.tradePlan) {
    divider();
    label("Atlas Trade Plan");
    paragraph(`Direction: ${result.tradePlan.direction}`);
    paragraph(`Entry Zone: ${result.tradePlan.entryZone}`);
    paragraph(`Invalidation: ${result.tradePlan.invalidation}`);
    if (result.tradePlan.targets?.length) paragraph(`Targets: ${result.tradePlan.targets.join(", ")}`);
    paragraph(result.tradePlan.riskNote, 9);
  }

  divider();
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text("Not financial advice. Generated by Atlas Trading.", marginX, y);

  const safePair = result.pair.replace(/[^a-z0-9]/gi, "") || "chart";
  const safeTf = (result.timeframe || "chart").replace(/[^a-z0-9]/gi, "");
  doc.save(`atlas-${safePair}-${safeTf}.pdf`);
}
// ACADEMY-PDF-0030
