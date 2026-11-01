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
  tradePlan: { direction: string; entryZone: string; invalidation: string; targets: string[]; riskNote: string; riskReward?: string };
  /** Engine verdict (see lib/analyzerEngine.ts). Older results without it fall back to the plan direction. */
  verdict?: "VALID_SETUP" | "WAIT_FOR_CONFIRMATION" | "NO_CLEAN_SETUP" | "VISUAL_READ_ONLY";
  verdictReasons?: { code: string; text: string }[];
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

  const isArabic = (t: string) => /[\u0600-\u06FF]/.test(t);

  /**
   * jsPDF's built-in fonts cannot shape Arabic, so Arabic lines are drawn by the browser's own text engine
   * (correct letter joining and right-to-left order) onto a canvas and placed in the PDF as images.
   * Trade-off: that text is an image, so it cannot be selected or searched.
   */
  function arabicParagraph(text: string, size: number) {
    const scale = 3;
    const family = (typeof document !== "undefined" && getComputedStyle(document.body).fontFamily) || "sans-serif";
    const px = size * scale;
    const lineH = Math.round(size * 1.55);
    const measure = document.createElement("canvas").getContext("2d");
    if (!measure) return;
    measure.font = `${px}px ${family}`;
    measure.direction = "rtl";
    const widthPx = maxWidth * scale;
    const lines: string[] = [];
    let cur = "";
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const trial = cur ? `${cur} ${word}` : word;
      if (cur && measure.measureText(trial).width > widthPx) {
        lines.push(cur);
        cur = word;
      } else cur = trial;
    }
    if (cur) lines.push(cur);
    for (const line of lines) {
      ensureSpace(lineH);
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(widthPx);
      canvas.height = Math.ceil(lineH * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.font = `${px}px ${family}`;
      ctx.direction = "rtl";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgb(40,40,40)";
      ctx.fillText(line, canvas.width, canvas.height / 2);
      doc.addImage(canvas.toDataURL("image/png"), "PNG", marginX, y - size, maxWidth, lineH);
      y += lineH;
    }
    y += 4;
  }

  function paragraph(text: string | undefined, size = 10) {
    if (!text) return;
    if (isArabic(text)) {
      arabicParagraph(text, size);
      return;
    }
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


  const VERDICT_PDF = {
    VALID_SETUP: "LONG SETUP (spot)",
    WAIT_FOR_CONFIRMATION: "WAIT - not confirmed yet, no trade plan",
    NO_CLEAN_SETUP: "NO CLEAN SETUP - no trade plan",
    VISUAL_READ_ONLY: "VISUAL READ ONLY - not verified against real candles, no trade plan",
  } as const;
  const verdict =
    result.verdict ??
    (result.noClearSetup || result.tradePlan?.direction?.toLowerCase().includes("wait") ? "NO_CLEAN_SETUP" : "VALID_SETUP");
  const planned = verdict === "VALID_SETUP";

  heading(`Atlas Trading - ${result.pair} - ${result.timeframe}`);
  paragraph(`Generated ${new Date().toLocaleString()}`, 9);
  label("Verdict");
  paragraph(VERDICT_PDF[verdict], 12);
  for (const r of result.verdictReasons ?? []) paragraph(isArabic(r.text) ? r.text : `- ${r.text}`, 9);
  if (verdict === "VISUAL_READ_ONLY") paragraph("Levels below were read from the image only and are NOT verified.", 9);
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
    label(verdict === "VISUAL_READ_ONLY" ? "Key Levels (from image, unverified)" : "Key Levels");
    for (const lvl of result.keyLevels) paragraph(`${lvl.label}: ${lvl.price}`, 10);
  }

  const isWait = !planned;
  if (isWait) {
    label(verdict === "WAIT_FOR_CONFIRMATION" ? "Why Wait" : verdict === "VISUAL_READ_ONLY" ? "Visual Read Only" : "No Clear Setup");
    paragraph(result.noClearSetup || result.currentCondition.explanation, 9);
  } else {
    if (result.bullishScenario) {
      label("Bullish Scenario");
      paragraph(`Confirmation: ${result.bullishScenario.confirmation}`, 9);
      if (result.bullishScenario.targets?.length) {
        paragraph(`Targets: ${result.bullishScenario.targets.join(", ")}`, 9);
      }
      if (result.bullishScenario.why) paragraph(`Why: ${result.bullishScenario.why}`, 9);
    }
    if (result.bearishScenario) {
      label("Downside Scenario (risk for a spot holder)");
      paragraph(`Confirmation: ${result.bearishScenario.confirmation}`, 9);
      if (result.bearishScenario.targets?.length) {
        paragraph(`Support levels below: ${result.bearishScenario.targets.join(", ")}`, 9);
      }
      if (result.bearishScenario.why) paragraph(`Why: ${result.bearishScenario.why}`, 9);
    }
  }

  if (result.observations?.confirmed?.length) {
    label(verdict === "VISUAL_READ_ONLY" ? "Read from the image (not verified)" : "Confirmed");
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

  if (planned) {
    divider();
    label("Invalidation");
    paragraph(result.invalidation.level);
    paragraph(result.invalidation.explanation, 9);
  }

  if (result.tradePlan) {
    divider();
    label("Atlas Trade Plan");
    if (planned) {
      paragraph("Direction: Long (spot)");
      paragraph(`Entry Zone: ${result.tradePlan.entryZone}`);
      paragraph(`Stop-loss / invalidation: ${result.tradePlan.invalidation}`);
      if (result.tradePlan.targets?.length) paragraph(`Targets: ${result.tradePlan.targets.join(", ")}`);
      if (result.tradePlan.riskReward && result.tradePlan.riskReward !== "N/A") {
        paragraph(`Risk / reward to TP1 (from the worst entry): ${result.tradePlan.riskReward}`);
      }
    } else {
      paragraph("No trade plan: Atlas shows no entry, stop-loss or targets for this verdict.");
    }
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
