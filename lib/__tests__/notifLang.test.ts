import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dictionaries } from "@/lib/i18n";
import { LANGUAGES } from "@/components/LanguageSelect";
import { defaultPrefs } from "@/lib/notificationPrefs";

const src = (f: string) => readFileSync(f, "utf8");
const g = (l: "en" | "fr" | "ar", group: "nav" | "account") => dictionaries[l][group] as unknown as Record<string, string>;

describe("language selector", () => {
  it("lists AR, FR, EN in that order with full names and flags", () => {
    expect(LANGUAGES.map((l) => l.short)).toEqual(["AR", "FR", "EN"]);
    expect(LANGUAGES.map((l) => l.name)).toEqual(["العربية", "Français", "English"]);
    const flags = src("components/LangFlags.tsx");
    for (const c of ["ar", "fr"]) expect(flags).toContain(`code === "${c}"`);
    expect(flags).not.toMatch(/\u{1F1E6}-\u{1F1FF}/u); // inline SVG, not emoji (emoji flags do not render on Windows)
  });
  it("reuses the existing language state and persistence (no new storage, no navigation)", () => {
    const sel = src("components/LanguageSelect.tsx");
    expect(sel).toContain("setLang(l.code)");
    expect(sel).not.toMatch(/localStorage|router\.|window\.location|href=/);
    expect(src("lib/i18n.tsx")).toContain('document.documentElement.dir = lang === "ar" ? "rtl" : "ltr"');
  });
  it("is accessible: labelled trigger, menu roles, current language marked, Escape and arrows, 44px rows", () => {
    const sel = src("components/LanguageSelect.tsx");
    for (const s of ['aria-haspopup="menu"', "aria-expanded={open}", 'role="menuitemradio"', "aria-checked={on}", '"Escape"', '"ArrowDown"', "min-h-11"]) expect(sel).toContain(s);
    expect(sel).toContain("bg-gold/15"); // current language highlighted
    expect(sel).not.toMatch(/\b(pl|pr|ml|mr|left|right)-\d/);
  });
  it("is in the global header on desktop and mobile, and the old EN/AR/FR button row is gone", () => {
    const nav = src("components/Nav.tsx");
    expect((nav.match(/<LanguageSelect \/>/g) ?? []).length).toBe(2); // desktop controls + mobile bar
    expect(nav).not.toContain("LangSwitcher");
  });
});

describe("notification bell", () => {
  it("opens the existing Notification Settings and sits in the desktop and mobile header for signed-in users", () => {
    expect(src("components/NotificationBell.tsx")).toContain('href="/account#notifications"');
    const nav = src("components/Nav.tsx");
    expect((nav.match(/<NotificationBell \/>/g) ?? []).length).toBe(2);
    expect(nav).toContain("{isLoaded && isSignedIn && <NotificationBell />}");
  });
  it("the settings section has the anchor and scrolls to it", () => {
    const acc = src("app/account/page.tsx");
    expect(acc).toContain('id="notifications"');
    expect(acc).toContain('window.location.hash !== "#notifications"');
  });
});

describe("account menu", () => {
  it("adds Notification settings and the three languages to Clerk's menu, replacing the plain button", () => {
    const m = src("components/AccountMenu.tsx");
    expect(m).toContain("UserButton.MenuItems");
    expect(m).toContain('href="/account#notifications"');
    expect(m).toContain("LANGUAGES.map");
    expect(m).toContain("setLang(l.code)");
    const nav = src("components/Nav.tsx");
    expect(nav).not.toMatch(/<UserButton/);
    expect((nav.match(/<AccountMenu \/>/g) ?? []).length).toBe(2);
  });
});

describe("Dashboard activation card", () => {
  const card = src("components/NotificationCard.tsx");
  it("is on the Dashboard (journal) page", () => {
    expect(src("app/journal/page.tsx")).toContain("<NotificationCard />");
  });
  it("shows only for signed-in users whose notifications are off and who have not dismissed it", () => {
    expect(card).toContain("!isSignedIn");
    expect(card).toContain("dismissedBefore()");
    expect(card).toContain("d.prefs.enabled !== true");
    expect(card).toContain("/api/me/prefs");
    expect(defaultPrefs.enabled).toBe(false);
  });
  it("is dismissible, and never requests browser permission or writes preferences itself", () => {
    expect(card).toContain("NOTIFICATION_CARD_KEY");
    expect(card).toContain("function dismiss()");
    expect(card).not.toMatch(/enablePush|requestPermission|Notification\.|method:\s*["']PUT|method:\s*["']POST/);
  });
});

describe("permission is requested only after a click, and the existing flow is intact", () => {
  it("requestPermission lives only in enablePush, which only the account toggles call", () => {
    expect(src("lib/pushClient.ts").match(/requestPermission/g)?.length).toBe(1);
    const hits = ["components", "app", "lib"].flatMap((d) => {
      const out: string[] = [];
      const walk = (p: string) => { for (const e of readdirSync(p, { withFileTypes: true })) { const f = `${p}/${e.name}`; if (e.isDirectory()) { if (e.name !== "__tests__" && e.name !== "node_modules") walk(f); } else if (/\.tsx?$/.test(e.name) && /await enablePush\(/.test(src(f))) out.push(f); } };
      walk(d);
      return out;
    });
    expect(hits).toEqual(["app/account/page.tsx"]);
    expect(src("app/account/page.tsx")).toContain("const result = await enablePush(lang)");
  });
  it("keeps preferences, categories and the Elite-only promo rule as they were", () => {
    expect(Object.keys(defaultPrefs)).toEqual(["enabled", "tradeFeed", "market", "educational", "promotional", "analyzerReset"]);
    expect(src("lib/push.ts")).toContain('if (plan === "elite") return; // never promo existing Elite members');
  });
  it("shows browser permission, device status and a choose-a-category hint", () => {
    const acc = src("app/account/page.tsx");
    for (const s of ["data-notif-status", "permissionState()", "account.pickHint", "account.promoHint", "account.deviceOn"]) expect(acc).toContain(s);
  });
});

describe("strings in EN, FR and AR", () => {
  const nav = ["notifications", "notificationSettings", "language"];
  const acc = ["promoHint", "notifyAnalyzerReset", "pickHint", "permLabel", "permGranted", "permDenied", "permDefault", "permUnsupported", "deviceOn", "deviceOff", "cardTitle", "cardBody", "cardCta", "cardDismiss"];
  it("has every new string in all three languages", () => {
    for (const l of ["en", "fr", "ar"] as const) {
      for (const k of nav) expect(g(l, "nav")[k]?.length).toBeGreaterThan(0);
      for (const k of acc) expect(g(l, "account")[k]?.length).toBeGreaterThan(0);
    }
  });
  it("French users no longer get the English reminder label", () => {
    expect(g("fr", "account").notifyAnalyzerReset).not.toBe(g("en", "account").notifyAnalyzerReset);
    expect(src("app/account/page.tsx")).not.toContain("Midnight free-analyses reset reminder");
  });
});
