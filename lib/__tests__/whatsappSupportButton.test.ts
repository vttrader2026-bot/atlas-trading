// WHATSAPP-SUPPORT-v1
import { execSync } from "node:child_process";
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { WHATSAPP_SUPPORT_URL, WHATSAPP_SUPPORT_NUMBER } from "@/lib/whatsappSupport";

const read = (p: string) => readFileSync(p, "utf8");
const layout = read("app/layout.tsx");
const footer = read("components/Footer.tsx");
const button = read("components/WhatsAppSupportButton.tsx");
const i18n = read("lib/i18n.tsx");

describe("WhatsApp Support entry point", () => {
  it("links to the private support number with the prefilled message, not the community group", () => {
    expect(WHATSAPP_SUPPORT_NUMBER).toBe("22233554452");
    expect(WHATSAPP_SUPPORT_URL).toBe("https://wa.me/22233554452?text=Hello%20ATLAS%20Support%2C%20I%20need%20help.");
    expect(WHATSAPP_SUPPORT_URL).not.toContain("chat.whatsapp.com");
  });
  it("the floating button is mounted exactly once, globally, and on no individual page", () => {
    expect(layout.match(/<WhatsAppSupportButton \/>/g)?.length).toBe(1);
    
    const users = execSync("grep -rl WhatsAppSupportButton app components --include=*.tsx || true", { encoding: "utf8" }).split("\n").filter(Boolean).map((s) => s.replace(/\\/g, "/")).sort();
    expect(users).toEqual(["app/layout.tsx", "components/WhatsAppSupportButton.tsx"]);
  });
  it("button: opens a new tab safely, has an aria-label, icon-only on phones and a label from sm up, clear of the mobile bar", () => {
    expect(button).toContain("WHATSAPP_SUPPORT_URL");
    expect(button).toContain('target="_blank"');
    expect(button).toContain('rel="noopener noreferrer"');
    expect(button).toContain('aria-label={t("footer.whatsappAria")}');
    expect(button).toMatch(/hidden[^"]*sm:inline/);
    expect(button).toContain("showQuickNav(pathname)");
    expect(button).toContain("hover:scale-105");
  });
  it("footer adds a WhatsApp Support link with the same URL and keeps the community links", () => {
    expect(footer).toContain("href={WHATSAPP_SUPPORT_URL}");
    expect(footer).toContain('t("footer.whatsappSupport")');
    expect(footer).toContain("https://chat.whatsapp.com/Br0OH7mHCHv6MpTmIas2Je?mode=gi_t");
    expect(footer).toContain("https://t.me/atlastradingcrypto");
  });
  it("EN, AR and FR all have the three new strings", () => {
    for (const k of ["whatsappSupport", "chatWithUs", "whatsappAria"]) expect(i18n.match(new RegExp(`\\n    ${k}: "`, "g"))?.length).toBe(3);
  });
  it("the entrance animation is disabled for reduced motion and the button hides under the install card", () => {
    const css = read("app/globals.css");
    expect(css).toContain(".wa-fab { animation: waFabIn");
    expect(css).toMatch(/prefers-reduced-motion[^}]*?\.wa-fab \{ animation: none/);
    expect(css).toContain("body:has(.install-sheet) .wa-fab");
  });
});
