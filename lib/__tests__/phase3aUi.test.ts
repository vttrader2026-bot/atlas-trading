// EXIT-STRATEGY-v1: wiring of the screens (source-level; no browser here).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

describe("screens", () => {
  it("Confirm Trade asks for the exit strategy and sends it", () => {
    const d = read("components/tradefeed/ConfirmTradeDialog.tsx");
    expect(d).toContain("ExitStrategyPicker");
    expect(d).toContain("exitStrategy: strategy");
  });
  it("Trade Plan offers the strategy, locks it once sent", () => {
    expect(read("app/trade-plan/page.tsx")).toMatch(/<ExitStrategyPicker[\s\S]*?disabled=\{sent\}/);
    expect(read("app/trade-plan/page.tsx")).toContain("exitStrategy");
  });
  it("Journal: strategy trades get the exits panel and cannot be closed by hand or have entry / size edited", () => {
    expect(read("components/journal/TradeDetails.tsx")).toContain("trade.exitStrategy && <ExitsPanel");
    const f = read("components/journal/TradeForm.tsx");
    expect(f).toContain("base?.exitStrategy");
    expect(f).toContain("LOCKED_FIELDS");
    expect(read("components/journal/ExitsPanel.tsx")).toContain("journal.p3Estimates");
  });
  it("signal publishing and the bot's routes are not touched by the exit strategy", () => {
    expect(read("app/api/trade-feed/route.ts")).not.toMatch(/exitStrategy/);
    expect(read("app/api/trade-feed/close/route.ts")).not.toMatch(/exitStrategy/);
  });
});
