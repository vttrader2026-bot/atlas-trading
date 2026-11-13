import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { QUICK_ITEMS, activeKey, showQuickNav, visibleItems } from "@/lib/quickNav";
import { isPrivatePath } from "@/lib/privateRoutes";

describe("Quick navigation routes", () => {
  it("has the 8 required destinations", () => {
    expect(QUICK_ITEMS.map((i) => i.key)).toEqual(["dashboard", "feed", "radar", "pulse", "analyzer", "plans", "journal", "investor"]);
  });
  it("every destination is a real page", () => {
    for (const i of QUICK_ITEMS) expect(existsSync(`app${i.href.split("#")[0]}/page.tsx`), i.href).toBe(true);
  });
  it("labels are existing translation keys in EN, FR and AR", () => {
    const src = readFileSync("lib/i18n.tsx", "utf8");
    for (const i of QUICK_ITEMS) { const k = i.labelKey.split(".")[1]; expect((src.match(new RegExp(`\\n    ${k}: "`, "g")) || []).length, k).toBeGreaterThanOrEqual(3); }
  });
});

describe("Quick navigation permissions", () => {
  it("signed-out visitors are never shown private destinations", () => {
    const out = visibleItems(false);
    expect(out.map((i) => i.key)).toEqual(["feed", "radar", "pulse", "analyzer", "plans"]);
    for (const i of out) expect(isPrivatePath(i.href.split("#")[0])).toBe(false);
  });
  it("signed-in users see all 8", () => expect(visibleItems(true)).toHaveLength(8));
  it("the server-side gate is unchanged (private prefixes still enforced in proxy.ts)", () => {
    expect(isPrivatePath("/journal")).toBe(true); expect(isPrivatePath("/investor")).toBe(true);
    expect(readFileSync("proxy.ts", "utf8")).toMatch(/isPrivatePath/);
  });
  it("only main platform pages get the navigation", () => {
    for (const p of ["/journal", "/trade-feed", "/radar", "/market-intelligence", "/analyzer", "/trade-plan", "/investor", "/watchlist"]) expect(showQuickNav(p), p).toBe(true);
    for (const p of ["/", "/academy", "/academy/x", "/elite", "/share", "/sign-in", "/admin", "/account", null, undefined]) expect(showQuickNav(p as string), String(p)).toBe(false);
  });
});

describe("Quick navigation active page", () => {
  it("highlights exactly one item per page", () => {
    expect(activeKey("/investor")).toBe("investor");
    expect(activeKey("/trade-feed")).toBe("feed");
    expect(activeKey("/radar")).toBe("radar");
    expect(activeKey("/market-intelligence")).toBe("pulse");
    expect(activeKey("/analyzer")).toBe("analyzer");
    expect(activeKey("/trade-plan")).toBe("plans");
    expect(activeKey("/watchlist")).toBeNull();
  });
  it("splits /journal into Dashboard and Journal by the trade-journal anchor", () => {
    expect(activeKey("/journal")).toBe("dashboard");
    expect(activeKey("/journal", "#trade-journal")).toBe("journal");
  });
  it("the anchor exists on the journal page and the layout mounts one navigation", () => {
    expect(readFileSync("app/journal/page.tsx", "utf8")).toContain('id="trade-journal"');
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect((layout.match(/<QuickNav \/>/g) || []).length).toBe(1);
    expect(layout).toContain("<QuickNavSpacer />");
  });
});
