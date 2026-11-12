// INSTALL-APP-v1: platform detection, install modes, automatic-popup rules, dismissal memory and wiring.
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { AUTO_DELAY_MS, DISMISS_DAYS, detectPlatform, installMode, isDismissed, shouldAutoShow, standaloneFrom, type Env } from "@/lib/pwaInstall";
import { homeAppAr, homeAppEn, homeAppFr } from "@/lib/i18nHomeApp";

const UA = {
  iosSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  iosChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.0.0 Mobile/15E148 Safari/604.1",
  iosInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 320.0",
  ipadDesktopUa: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  androidWebView: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36",
  androidFacebook: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/450.0]",
  desktopChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
};
const env = (o: Partial<Env> = {}): Env => ({ platform: "ios-safari", inApp: false, standalone: false, ...o });

describe("platform detection", () => {
  it("iPhone Safari", () => expect(detectPlatform(UA.iosSafari)).toEqual({ platform: "ios-safari", inApp: false }));
  it("iPhone Chrome is iOS but not Safari", () => expect(detectPlatform(UA.iosChrome).platform).toBe("ios-other"));
  it("an in-app browser on iPhone is not Safari", () => expect(detectPlatform(UA.iosInstagram)).toEqual({ platform: "ios-other", inApp: true }));
  it("iPadOS (Mac user agent + touch) is iOS Safari; a real Mac (no touch) is not", () => {
    expect(detectPlatform(UA.ipadDesktopUa, 5).platform).toBe("ios-safari");
    expect(detectPlatform(UA.macSafari, 0).platform).toBe("other");
  });
  it("Android Chrome, WebView and in-app browsers", () => {
    expect(detectPlatform(UA.androidChrome)).toEqual({ platform: "android", inApp: false });
    expect(detectPlatform(UA.androidWebView).inApp).toBe(true);
    expect(detectPlatform(UA.androidFacebook).inApp).toBe(true);
  });
  it("desktop is other", () => expect(detectPlatform(UA.desktopChrome)).toEqual({ platform: "other", inApp: false }));
});

describe("installed (standalone) detection", () => {
  it("display-mode standalone OR iOS navigator.standalone", () => {
    expect(standaloneFrom(true, undefined)).toBe(true);
    expect(standaloneFrom(false, true)).toBe(true);
    expect(standaloneFrom(false, false)).toBe(false);
    expect(standaloneFrom(false, "yes")).toBe(false);
  });
});

describe("install mode", () => {
  it("installed users get nothing, whatever else is true", () => {
    expect(installMode(env({ standalone: true }), true)).toBe("none");
    expect(installMode(env({ platform: "android", standalone: true }), true)).toBe("none");
  });
  it("iPhone/iPad: step-by-step", () => {
    expect(installMode(env(), false)).toBe("ios");
    expect(installMode(env({ platform: "ios-other" }), false)).toBe("ios");
  });
  it("Android: native prompt when the browser offered one, otherwise manual instructions", () => {
    expect(installMode(env({ platform: "android" }), true)).toBe("native");
    expect(installMode(env({ platform: "android" }), false)).toBe("android-manual");
  });
  it("desktop only when the browser offers a native prompt", () => {
    expect(installMode(env({ platform: "other" }), true)).toBe("native");
    expect(installMode(env({ platform: "other" }), false)).toBe("none");
  });
  it("in-app browsers are told to open Safari/Chrome first", () => {
    expect(installMode(env({ platform: "android", inApp: true }), true)).toBe("open-browser");
    expect(installMode(env({ platform: "ios-other", inApp: true }), false)).toBe("open-browser");
    expect(installMode(env({ platform: "other", inApp: true }), false)).toBe("none");
  });
});

describe("dismissal memory", () => {
  const now = Date.parse("2026-11-11T12:00:00Z");
  const day = 86_400_000;
  it("remembered for DISMISS_DAYS, then the popup may return", () => {
    expect(isDismissed(String(now - 1 * day), now)).toBe(true);
    expect(isDismissed(String(now - (DISMISS_DAYS - 1) * day), now)).toBe(true);
    expect(isDismissed(String(now - DISMISS_DAYS * day), now)).toBe(false);
  });
  it("missing, unreadable or future values never block the popup", () => {
    for (const v of [null, undefined, "", "abc", String(now + day)]) expect(isDismissed(v, now)).toBe(false);
  });
});

describe("automatic popup rules", () => {
  const ok = { dismissed: false, isHome: true };
  it("shows on the homepage for iPhone Safari and Android", () => {
    expect(shouldAutoShow({ ...ok, env: env(), mode: "ios" })).toBe(true);
    expect(shouldAutoShow({ ...ok, env: env({ platform: "android" }), mode: "native" })).toBe(true);
    expect(shouldAutoShow({ ...ok, env: env({ platform: "android" }), mode: "android-manual" })).toBe(true);
  });
  it("never on other pages, after a dismissal, or when installed", () => {
    expect(shouldAutoShow({ ...ok, isHome: false, env: env(), mode: "ios" })).toBe(false);
    expect(shouldAutoShow({ ...ok, dismissed: true, env: env(), mode: "ios" })).toBe(false);
    expect(shouldAutoShow({ ...ok, env: env({ standalone: true }), mode: "none" })).toBe(false);
  });
  it("not for iOS Chrome, in-app browsers or desktop (they use the manual menu item)", () => {
    expect(shouldAutoShow({ ...ok, env: env({ platform: "ios-other" }), mode: "ios" })).toBe(false);
    expect(shouldAutoShow({ ...ok, env: env({ platform: "android", inApp: true }), mode: "open-browser" })).toBe(false);
    expect(shouldAutoShow({ ...ok, env: env({ platform: "other" }), mode: "native" })).toBe(false);
  });
  it("appears after a short delay, not immediately", () => {
    expect(AUTO_DELAY_MS).toBe(8000);
  });
});

describe("wiring and honesty", () => {
  const src = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
  const app = src("components/InstallApp.tsx");
  it("success is only recorded from the browser's appinstalled event", () => {
    expect(app.match(/setInstalled\(true\)/g)).toHaveLength(1);
    expect(app.indexOf("setInstalled(true)")).toBeGreaterThan(app.indexOf("const onInstalled"));
    expect(app.indexOf("setInstalled(true)")).toBeLessThan(app.indexOf('addEventListener("beforeinstallprompt"'));
    expect(app).toContain('addEventListener("appinstalled", onInstalled)');
  });
  it("uses the native prompt only after a member action (the Install button), not on load", () => {
    expect(app.match(/\.prompt\(\)/g)).toHaveLength(1);
    expect(app.indexOf(".prompt()")).toBeGreaterThan(app.indexOf("async function installNative"));
  });
  it("has a labeled close button and Escape to close; the popup is a dialog", () => {
    expect(app).toContain("homeApp.installClose");
    expect(app).toContain('e.key === "Escape"');
    expect(app).toContain('role="dialog"');
  });
  it("the provider wraps the app, and Install Atlas is in the mobile menu and the footer", () => {
    expect(src("app/layout.tsx")).toContain("<InstallProvider>");
    expect(src("components/Nav.tsx")).toContain("<InstallMenuButton");
    expect(src("components/Footer.tsx")).toContain("<InstallMenuButton");
  });
  it("reuses the existing PWA: manifest and service worker are untouched by this feature", () => {
    for (const f of ["app/manifest.ts", "public/sw.js", "components/RegisterServiceWorker.tsx"]) expect(src(f)).not.toMatch(/INSTALL-APP|InstallApp|homeApp/);
  });
  it("EN, FR and AR have the same keys, no empty strings, matching placeholders", () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(homeAppFr)).toEqual(keys(homeAppEn));
    expect(keys(homeAppAr)).toEqual(keys(homeAppEn));
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const k of keys(homeAppEn)) {
      for (const d of [homeAppEn, homeAppFr, homeAppAr]) expect(d[k].trim(), k).not.toBe("");
      expect(ph(homeAppFr[k]), k).toBe(ph(homeAppEn[k]));
      expect(ph(homeAppAr[k]), k).toBe(ph(homeAppEn[k]));
    }
    const i18n = src("lib/i18n.tsx");
    for (const v of ["homeAppEn", "homeAppFr", "homeAppAr"]) expect(i18n).toContain(`homeApp: { ...${v} }`);
  });
  it("every homeApp key the UI uses exists", () => {
    const used = new Set([...(app + src("components/home/InvestorPhone.tsx")).matchAll(/homeApp\.(\w+)/g)].map((m) => m[1]));
    for (const k of used) expect(homeAppEn, k).toHaveProperty(k);
  });
});
