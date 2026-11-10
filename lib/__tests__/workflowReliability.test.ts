// Workflow reliability: analyses are saved once per real result from both Analyzer paths,
// the Workflow page refreshes on sync events, and "Live Chart" opens Radar.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { loadHistory, recordAnalysis } from "@/lib/analysisHistory";
import { JOURNAL_UPDATED_EVENT } from "@/lib/journalSync";
import { DRAFT_EVENT, JOURNAL_EVENT } from "@/lib/signalSync";

const KEY = "atlas-trading.analysisHistory.v1";
let store: Record<string, string>;
beforeEach(() => {
  store = {};
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v; },
    },
  });
  vi.stubGlobal("crypto", { randomUUID: () => Math.random().toString(36).slice(2) });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const good = (over: Record<string, unknown> = {}) => ({
  pair: "BTC/USDT", timeframe: "4H",
  marketStructure: { state: "Uptrend", explanation: "x" },
  currentCondition: { label: "Pullback", explanation: "y" },
  tradePlan: { direction: "Long", entryZone: "1", invalidation: "2", targets: [] },
  ...over,
});

describe("recordAnalysis", () => {
  it("saves a successful analysis in the existing storage format", () => {
    expect(recordAnalysis(good())).toBe(true);
    const h = loadHistory();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ pair: "BTC/USDT", timeframe: "4H", marketStructure: "Uptrend", currentCondition: "Pullback", tradeDirection: "Long" });
    expect(typeof h[0].id).toBe("string");
    expect(Date.parse(h[0].date)).not.toBeNaN();
    expect(Object.keys(h[0]).sort()).toEqual(["currentCondition", "date", "id", "marketStructure", "pair", "timeframe", "tradeDirection"]);
  });
  it("saves nothing for failed, empty or malformed responses", () => {
    for (const bad of [null, undefined, "x", 5, {}, { error: "limit reached" }, good({ pair: "" }), good({ marketStructure: null }), good({ tradePlan: undefined })]) {
      expect(recordAnalysis(bad)).toBe(false);
    }
    expect(store[KEY]).toBeUndefined();
  });
  it("does not save the same result twice when a handler fires twice", () => {
    expect(recordAnalysis(good())).toBe(true);
    expect(recordAnalysis(good())).toBe(false);
    expect(loadHistory()).toHaveLength(1);
  });
  it("saves a different analysis, and the same one again after the duplicate window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-10T10:00:00Z"));
    expect(recordAnalysis(good())).toBe(true);
    expect(recordAnalysis(good({ pair: "ETH/USDT" }))).toBe(true);
    vi.setSystemTime(new Date("2026-11-10T10:05:00Z"));
    expect(recordAnalysis(good({ pair: "ETH/USDT" }))).toBe(true);
    expect(loadHistory().map((e) => e.pair)).toEqual(["ETH/USDT", "ETH/USDT", "BTC/USDT"]);
  });
  it("keeps the 10-entry cap and survives blocked storage", () => {
    vi.useFakeTimers();
    for (let i = 0; i < 12; i++) {
      vi.setSystemTime(new Date(Date.UTC(2026, 10, 10, 10, i * 5)));
      recordAnalysis(good({ pair: `C${i}/USDT` }));
    }
    expect(loadHistory()).toHaveLength(10);
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => { throw new Error("quota"); } } });
    expect(recordAnalysis(good())).toBe(false);
  });
  it("tolerates missing optional fields", () => {
    expect(recordAnalysis(good({ timeframe: undefined, currentCondition: undefined }))).toBe(true);
    expect(loadHistory()[0]).toMatchObject({ timeframe: "", currentCondition: "" });
  });
});

describe("wiring", () => {
  const analyzer = readFileSync("app/analyzer/page.tsx", "utf8");
  const panel = readFileSync("components/charts/AnalysisPanel.tsx", "utf8");
  const page = readFileSync("app/workflow/page.tsx", "utf8");

  it("both Analyzer paths save only on success", () => {
    expect(analyzer).toContain("recordAnalysis(data)");
    expect(analyzer.indexOf("recordAnalysis(data)")).toBeGreaterThan(analyzer.indexOf("if (!isValidAnalysis)"));
    expect((analyzer.match(/recordAnalysis\(/g) ?? []).length).toBe(1);
    expect(panel).toContain("recordAnalysis(data)");
    expect(panel.indexOf("recordAnalysis(data)")).toBeGreaterThan(panel.indexOf("if (!res.ok)"));
    expect((panel.match(/recordAnalysis\(/g) ?? []).length).toBe(1);
  });
  it("addHistoryEntry is still the only writer of the history key", () => {
    expect(readFileSync("lib/analysisHistory.ts", "utf8").match(/setItem\(/g)).toHaveLength(1);
  });
  it("the sync events keep their names", () => {
    expect(JOURNAL_UPDATED_EVENT).toBe("atlas-journal-updated");
    expect(JOURNAL_EVENT).toBe("atlas-journal-updated");
    expect(DRAFT_EVENT).toBe("atlas-plan-updated");
  });
  it("Workflow refreshes on journal sync, plan sync and storage changes, and cleans up", () => {
    for (const ev of ["JOURNAL_UPDATED_EVENT", "DRAFT_EVENT", '"storage"']) {
      expect(page).toContain(`window.addEventListener(${ev}, readLocal)`);
      expect(page).toContain(`window.removeEventListener(${ev}, readLocal)`);
    }
    expect(page).toContain("if (!isSignedIn) return;"); // visitors never subscribe or load personal data
    expect(page).toContain("loadTrades()");
    expect(page).toContain("loadHistory().length");
    expect(page).toContain("loadDraft() !== null");
  });
  it("Live Chart opens Radar; AI Analyzer still opens the Analyzer", () => {
    expect(page).toContain('{ href: "/radar", label: t("workflow.tools.liveChart") }');
    expect(page).toContain('{ href: "/analyzer", label: t("nav.analyzer") }');
    expect(page).not.toContain('{ href: "/analyzer", label: t("workflow.tools.liveChart") }');
  });
});
