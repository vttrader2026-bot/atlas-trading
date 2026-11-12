"use client";

// INSTALL-APP-v1: "Install Atlas" popup + menu entry. Reuses the existing PWA (manifest, service worker, icons).
//  - iPhone/iPad Safari: step-by-step Share -> Add to Home Screen -> Add.
//  - Android: the browser's own install prompt when it offered one, otherwise Chrome menu instructions.
//  - Automatic popup: homepage only, after AUTO_DELAY_MS, remembered dismissal, never when already installed.
//  - Success is only ever shown after the browser's own "appinstalled" event.
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/i18n";
import {
  AUTO_DELAY_MS, DISMISS_KEY, detectPlatform, installMode, isDismissed, shouldAutoShow, standaloneFrom,
  type Env, type Mode,
} from "@/lib/pwaInstall";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type Ctx = { available: boolean; open: () => void };
const Install = createContext<Ctx>({ available: false, open: () => {} });
export const useInstall = () => useContext(Install);

// Environment snapshot as a string so useSyncExternalStore stays stable. The server value is "not installable".
const SERVER_ENV = "other|0|0";
function readEnv(): string {
  try {
    const { platform, inApp } = detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
    const standalone = standaloneFrom(window.matchMedia("(display-mode: standalone)").matches, (navigator as Navigator & { standalone?: boolean }).standalone);
    return `${platform}|${inApp ? 1 : 0}|${standalone ? 1 : 0}`;
  } catch {
    return SERVER_ENV;
  }
}
function subscribeEnv(cb: () => void) {
  const mq = window.matchMedia?.("(display-mode: standalone)");
  mq?.addEventListener?.("change", cb);
  return () => mq?.removeEventListener?.("change", cb);
}
const parseEnv = (s: string): Env => {
  const [platform, inApp, standalone] = s.split("|");
  return { platform: platform as Env["platform"], inApp: inApp === "1", standalone: standalone === "1" };
};

const IconShare = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
    <path d="M12 15V3M8 7l4-4 4 4M7 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
);
const IconPlus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="3.5" />
    <path d="M12 8.5v7M8.5 12h7" />
  </svg>
);
const IconDots = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
    <circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" />
  </svg>
);
const IconDownload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
    <path d="M12 4v11M8 11l4 4 4-4M5 20h14" />
  </svg>
);

function Step({ n, icon, children }: { n: number; icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-raised text-gold">{icon}</span>
      <span className="min-w-0 text-sm leading-snug"><span className="me-1.5 font-data text-xs text-text-muted" dir="ltr">{n}.</span>{children}</span>
    </li>
  );
}

export function InstallProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const pathname = usePathname();
  const isHome = pathname === "/";
  const envKey = useSyncExternalStore(subscribeEnv, readEnv, () => SERVER_ENV);
  const env = useMemo(() => parseEnv(envKey), [envKey]);
  const [canNative, setCanNative] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<"auto" | "menu">("auto");
  const deferred = useRef<InstallPromptEvent | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const mode: Mode = installed ? "none" : installMode(env, canNative);
  const latest = useRef({ env, mode });
  useEffect(() => {
    latest.current = { env, mode };
  });

  // The browser's own install prompt (Chrome/Android and desktop Chromium). We hold it until the member asks.
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      deferred.current = e as InstallPromptEvent;
      setCanNative(true);
    };
    // The only place success is ever recorded: the browser says the app was installed.
    const onInstalled = () => {
      deferred.current = null;
      setCanNative(false);
      setWaiting(false);
      setInstalled(true);
      try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* storage unavailable */ }
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Automatic popup: homepage only, after a short delay.
  useEffect(() => {
    if (!isHome) return;
    const id = window.setTimeout(() => {
      let raw: string | null = null;
      try { raw = window.localStorage.getItem(DISMISS_KEY); } catch { /* storage unavailable: treat as not dismissed */ }
      const { env: e, mode: m } = latest.current;
      if (shouldAutoShow({ env: e, mode: m, dismissed: isDismissed(raw, Date.now()), isHome: true })) {
        setSource("auto");
        setOpen(true);
      }
    }, AUTO_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [isHome]);

  const close = useCallback((remember: boolean) => {
    setOpen(false);
    if (remember) {
      try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* storage unavailable */ }
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(source === "auto");
    window.addEventListener("keydown", onKey);
    if (source === "menu") dialog.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, source, close]);

  const ctx = useMemo<Ctx>(() => ({ available: mode !== "none", open: () => { setSource("menu"); setOpen(true); } }), [mode]);

  async function installNative() {
    const ev = deferred.current;
    if (!ev) return;
    deferred.current = null;
    setCanNative(false);
    setWaiting(true);
    try {
      await ev.prompt();
      const choice = await ev.userChoice;
      // "accepted" only means the member agreed in the browser dialog. We wait for "appinstalled" before saying anything more.
      if (choice.outcome !== "accepted") {
        setWaiting(false);
        close(true);
      }
    } catch {
      setWaiting(false);
    }
  }

  const iosOther = env.platform === "ios-other";
  return (
    <Install.Provider value={ctx}>
      {children}
      {open && (mode !== "none" || installed) && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:end-4 sm:bottom-4 sm:w-[24rem] sm:p-0">
          <div
            ref={dialog}
            role="dialog"
            aria-modal="false"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="install-sheet pointer-events-auto relative card border-gold/30 p-5 shadow-2xl outline-none"
          >
            <button
              type="button"
              onClick={() => close(source === "auto")}
              aria-label={t("homeApp.installClose")}
              className="absolute end-2 top-2 flex h-10 w-10 items-center justify-center rounded-lg text-text-muted transition-colors hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
            >
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 3l12 12M15 3L3 15" strokeLinecap="round" /></svg>
            </button>

            <div className="flex items-center gap-3 pe-9">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/icon-192.png" alt="" width={52} height={52} className="rounded-2xl border border-line" />
              <div className="min-w-0">
                <h2 id={titleId} className="font-heading text-base font-bold leading-snug">{t("homeApp.installTitle")}</h2>
                <p className="mt-0.5 text-xs leading-snug text-text-muted">{t("homeApp.installSubtitle")}</p>
              </div>
            </div>

            {installed ? (
              <p role="status" className="mt-4 text-sm text-bull">{t("homeApp.installed")}</p>
            ) : (
              <>
                {mode === "ios" && (
                  <>
                    <ol className="mt-4 space-y-3">
                      <Step n={1} icon={<IconShare />}>{t("homeApp.iosStep1")}</Step>
                      <Step n={2} icon={<IconPlus />}>{t("homeApp.iosStep2")}</Step>
                      <Step n={3} icon={<span className="font-data text-[11px] font-semibold">{t("homeApp.addWord")}</span>}>{t("homeApp.iosStep3")}</Step>
                    </ol>
                    <p className="mt-3 text-xs text-text-muted">{t("homeApp.iosNote")}</p>
                    {iosOther && <p className="mt-2 text-xs text-gold">{t("homeApp.iosOtherBrowser")}</p>}
                  </>
                )}
                {mode === "native" && <p className="mt-4 text-sm leading-snug text-text-muted">{t("homeApp.nativeBody")}</p>}
                {mode === "android-manual" && (
                  <ol className="mt-4 space-y-3">
                    <Step n={1} icon={<IconDots />}>{t("homeApp.androidStep1")}</Step>
                    <Step n={2} icon={<IconDownload />}>{t("homeApp.androidStep2")}</Step>
                    <Step n={3} icon={<IconPlus />}>{t("homeApp.androidStep3")}</Step>
                  </ol>
                )}
                {mode === "open-browser" && <p className="mt-4 text-sm leading-snug text-text-muted">{t("homeApp.inAppNote")}</p>}
                {waiting && <p role="status" className="mt-3 text-xs text-text-muted">{t("homeApp.waiting")}</p>}

                <div className="mt-4 flex flex-wrap gap-2">
                  {mode === "native" && (
                    <button type="button" onClick={installNative} disabled={waiting} className="btn-primary flex-1 sm:flex-none disabled:opacity-60">{t("homeApp.installAction")}</button>
                  )}
                  <button type="button" onClick={() => close(source === "auto")} className="btn-secondary flex-1 sm:flex-none">{t("homeApp.notNow")}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Install.Provider>
  );
}

/** Permanent "Install Atlas" entry for menus and the footer. Renders nothing when there is nothing to install or Atlas is already installed. */
export function InstallMenuButton({ className = "", onAfter, asListItem = false }: { className?: string; onAfter?: () => void; asListItem?: boolean }) {
  const { t } = useLanguage();
  const { available, open } = useInstall();
  if (!available) return null;
  const btn = (
    <button type="button" className={className} onClick={() => { open(); onAfter?.(); }}>
      {t("homeApp.menuInstall")}
    </button>
  );
  return asListItem ? <li>{btn}</li> : btn;
}
