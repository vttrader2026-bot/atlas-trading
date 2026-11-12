// INSTALL-APP-v1: pure helpers for the "Install Atlas" popup. No DOM access here: callers pass what they read.
// The PWA itself (manifest, service worker, icons) already exists and is unchanged.

export type Platform = "ios-safari" | "ios-other" | "android" | "other";
export type Mode = "ios" | "native" | "android-manual" | "open-browser" | "none";
export type Env = { platform: Platform; inApp: boolean; standalone: boolean };

/** Shown this long after the homepage loads, never immediately. */
export const AUTO_DELAY_MS = 8000;
/** After a dismissal the automatic popup stays away this many days. */
export const DISMISS_DAYS = 14;
export const DISMISS_KEY = "atlas.install.dismissedAt";

const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|musical_ly|BytedanceWebview|Twitter|LinkedInApp|; wv\)/i;
const IOS_OTHER_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo|YaBrowser/;

/** iPhone, iPad (incl. iPadOS, which reports a Mac user agent but has touch) and Android. Anything else is "other". */
export function detectPlatform(ua: string, maxTouchPoints = 0): { platform: Platform; inApp: boolean } {
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  const inApp = IN_APP.test(ua);
  if (ios) {
    const safari = /Safari\//.test(ua) && !IOS_OTHER_BROWSER.test(ua) && !inApp;
    return { platform: safari ? "ios-safari" : "ios-other", inApp };
  }
  if (/Android/.test(ua)) return { platform: "android", inApp };
  return { platform: "other", inApp };
}

/** Installed (opened from the Home Screen / app window): display-mode standalone, or iOS's navigator.standalone. */
export const standaloneFrom = (displayModeStandalone: boolean, navigatorStandalone: unknown): boolean =>
  displayModeStandalone || navigatorStandalone === true;

/** Stored value is the dismissal time in ms. Unreadable or future values never block the popup. */
export function isDismissed(raw: string | null | undefined, now: number, days = DISMISS_DAYS): boolean {
  if (!raw) return false;
  const at = Number(raw);
  if (!Number.isFinite(at) || at > now) return false;
  return now - at < days * 86_400_000;
}

/** What the popup can offer right now. "none" = nothing to offer (installed, or no way to install from here). */
export function installMode(env: Env, canNative: boolean): Mode {
  if (env.standalone) return "none";
  if (env.inApp) return env.platform === "other" ? "none" : "open-browser";
  if (env.platform === "ios-safari" || env.platform === "ios-other") return "ios";
  if (canNative) return "native";
  if (env.platform === "android") return "android-manual";
  return "none";
}

/**
 * Automatic popup: homepage only, iPhone/iPad Safari or Android, not installed, not recently dismissed, and not inside
 * an in-app browser. The manual "Install Atlas" menu item does not use this.
 */
export function shouldAutoShow(a: { env: Env; mode: Mode; dismissed: boolean; isHome: boolean }): boolean {
  if (!a.isHome || a.dismissed || a.env.standalone || a.env.inApp) return false;
  if (a.mode === "ios") return a.env.platform === "ios-safari";
  if (a.mode === "native" || a.mode === "android-manual") return a.env.platform === "android";
  return false;
}
