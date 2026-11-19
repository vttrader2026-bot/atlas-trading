"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useLanguage } from "@/lib/i18n";
import { saveDraft } from "@/lib/tradePlan";
import { enablePush, disablePush, thisDeviceSubscribed, permissionState, type PermissionState } from "@/lib/pushClient";
import { defaultPrefs, type NotificationPrefs } from "@/lib/notificationPrefs";
import type { SavedPlan } from "@/lib/savedPlans";
import { isActivePlan } from "@/lib/tradePlansAtomic";
import { PLAN_LIMITS } from "@/lib/entitlementConfig";
import OwnerStudioLink from "@/components/account/OwnerStudioLink";
import VideoAlerts from "@/components/account/VideoAlerts";

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={"flex items-center gap-3 text-sm " + (disabled ? "opacity-50" : "")}>
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export default function AccountPage() {
  const { t, lang } = useLanguage();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs>(defaultPrefs);
  const [prefsMsg, setPrefsMsg] = useState<string | null>(null);
  const [plans, setPlans] = useState<SavedPlan[] | null>(null);
  const [plansFailed, setPlansFailed] = useState(false);
  // PHASE-3B: the active-plan limit comes from the server (null = unknown); the tab filters the list.
  const [planLimit, setPlanLimit] = useState<number | null>(null);
  const [planTab, setPlanTab] = useState<"active" | "entered" | "archived">("active");
  const [planMsg, setPlanMsg] = useState<string | null>(null);
  const [deviceOn, setDeviceOn] = useState<boolean | null>(null);
  const [perm, setPerm] = useState<PermissionState | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    fetch("/api/me/prefs", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad status"))))
      .then((data) => {
        if (!cancelled && data.prefs) setPrefs(data.prefs);
      })
      .catch(() => {});
    fetch("/api/me/plans", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("bad status"))))
      .then((data) => {
        if (!cancelled) {
          setPlans(Array.isArray(data.plans) ? data.plans : []);
          setPlanLimit(typeof data.limit === "number" ? data.limit : null);
        }
      })
      .catch(() => {
        if (!cancelled) setPlansFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) return;
    let cancelled = false;
    thisDeviceSubscribed().then((on) => {
      if (cancelled) return;
      setDeviceOn(on);
      setPerm(permissionState());
    });
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  // Opened from the header bell, the account menu or the Dashboard card (/account#notifications).
  useEffect(() => {
    if (!isSignedIn || window.location.hash !== "#notifications") return;
    const id = window.setTimeout(() => document.getElementById("notifications")?.scrollIntoView({ block: "start" }), 150);
    return () => window.clearTimeout(id);
  }, [isSignedIn]);

  // Deep link to the Video Alerts section (/account#video-alerts).
  useEffect(() => {
    if (!isSignedIn || window.location.hash !== "#video-alerts") return;
    const id = window.setTimeout(() => document.getElementById("video-alerts")?.scrollIntoView({ block: "start" }), 400);
    return () => window.clearTimeout(id);
  }, [isSignedIn]);

  async function toggleMaster(on: boolean) {
    setPrefsMsg(null);
    if (on) {
      const result = await enablePush(lang);
      setPerm(permissionState());
      if (result !== "ok") {
        setPrefsMsg(
          t(
            result === "denied"
              ? "account.pushDenied"
              : result === "unsupported"
                ? "account.pushUnsupported"
                : "account.pushError",
          ),
        );
        return;
      }
      setDeviceOn(true);
    } else {
      await disablePush();
      setDeviceOn(false);
    }
    await updatePref({ enabled: on });
  }

  async function sendTest() {
    setPrefsMsg(null);
    try {
      const res = await fetch("/api/me/push/test", { method: "POST" });
      const data = res.ok ? await res.json() : null;
      setPrefsMsg(data && data.delivered > 0 ? t("account.pushTestSent") : t("account.pushTestError"));
    } catch {
      setPrefsMsg(t("account.pushTestError"));
    }
  }

  async function updatePref(patch: Partial<NotificationPrefs>) {
    const previous = prefs;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setPrefsMsg(null);
    try {
      const res = await fetch("/api/me/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefs: next }),
      });
      if (!res.ok) throw new Error("bad status");
      setPrefsMsg(t("account.saved"));
    } catch {
      setPrefs(previous);
      setPrefsMsg(t("account.saveError"));
    }
  }

  function openPlan(plan: SavedPlan) {
    saveDraft({
      pair: plan.pair,
      direction: plan.direction,
      timeframe: plan.timeframe,
      entryZone: plan.entryZone,
      invalidationText: plan.invalidationText,
      entry: plan.entry,
      invalidation: plan.invalidation,
      tp1: plan.tp1,
      tp2: plan.tp2,
      tp3: plan.tp3,
      reasoning: plan.reasoning,
    });
    router.push("/trade-plan");
  }

  async function removePlan(id: string) {
    try {
      const res = await fetch("/api/me/plans", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) setPlans((prev) => (prev ? prev.filter((p) => p.id !== id) : prev));
    } catch {
      /* ignore: the plan simply stays in the list */
    }
  }

  // PHASE-3B: Entered / Archived / Restore. The server decides; a refused Restore (limit) or an unverified membership is explained.
  async function changePlan(id: string, action: "entered" | "archived" | "restore") {
    setPlanMsg(null);
    try {
      const res = await fetch("/api/me/plans", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
      if (res.ok) {
        const data = await res.json();
        if (data.plan) setPlans((prev) => (prev ? prev.map((p) => (p.id === id ? data.plan : p)) : prev));
      } else if (res.status === 409) setPlanMsg(limitText(planLimit));
      else if (res.status === 503) setPlanMsg(t("planLimits.unverified"));
      else setPlanMsg(t("planLimits.actionError"));
    } catch {
      setPlanMsg(t("planLimits.actionError"));
    }
  }
  const limitText = (limit: number | null) =>
    t("planLimits.limitReached").replace("{limit}", String(limit ?? "")) + (limit !== null && limit < PLAN_LIMITS.elite.activeTradePlans ? " " + t("planLimits.limitElite").replace("{n}", String(PLAN_LIMITS.elite.activeTradePlans)) : "");
  const activeCount = plans ? plans.filter(isActivePlan).length : 0;
  const tabOf = (p: SavedPlan) => (p.status === "entered" ? "entered" : p.status === "archived" ? "archived" : "active");
  const shownPlans = plans?.filter((p) => tabOf(p) === planTab);

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{t("account.title")}</h1>
      <p className="text-text-muted text-sm mt-1 max-w-xl">{t("account.subtitle")}</p>

      {!isLoaded && <p className="mt-8 text-text-muted text-sm">{t("account.loading")}</p>}

      {isLoaded && !isSignedIn && (
        <div className="mt-8 rounded-xl border border-white/10 p-6">
          <p className="text-sm text-text-muted max-w-md">{t("account.signInPrompt")}</p>
          <div className="mt-4 flex gap-3">
            <Link href="/sign-in" className="px-4 py-2 rounded-md border border-line text-sm hover:border-text-muted transition-colors">
              {t("account.signIn")}
            </Link>
            <Link href="/sign-up" className="px-4 py-2 rounded-md border border-line text-sm text-text-muted hover:text-text hover:border-text-muted transition-colors">
              {t("account.signUp")}
            </Link>
          </div>
        </div>
      )}

      {isLoaded && isSignedIn && (
        <div className="mt-8 space-y-8">
          <OwnerStudioLink />
          <section id="notifications" className="rounded-xl border border-white/10 p-6 scroll-mt-20">
            <h2 className="text-lg font-semibold">{t("account.notificationsTitle")}</h2>
            <p className="text-text-muted text-sm mt-1 max-w-xl">{t("account.notificationsNote")}</p>
            {perm && (
              <p className="mt-3 text-xs flex flex-wrap items-center gap-x-2 gap-y-1" data-notif-status={perm}>
                <span className="text-text-muted">{t("account.permLabel")}:</span>
                <span className={perm === "granted" ? "text-bull font-medium" : perm === "denied" ? "text-bear font-medium" : "font-medium"}>
                  {t(`account.perm${perm === "granted" ? "Granted" : perm === "denied" ? "Denied" : perm === "default" ? "Default" : "Unsupported"}`)}
                </span>
                {deviceOn !== null && <span className="text-text-muted">· {deviceOn ? t("account.deviceOn") : t("account.deviceOff")}</span>}
              </p>
            )}
            {perm === "denied" && <p className="mt-1 text-xs text-text-muted max-w-xl">{t("account.pushDenied")}</p>}
            <div className="mt-4 space-y-3">
              <Toggle
                label={t("account.notifyEnabled")}
                checked={prefs.enabled}
                onChange={toggleMaster}
              />
              <div className="ps-7 space-y-3">
                <Toggle
                  label={t("account.notifyTradeFeed")}
                  checked={prefs.tradeFeed}
                  disabled={!prefs.enabled}
                  onChange={(v) => updatePref({ tradeFeed: v })}
                />
                <Toggle
                  label={t("account.notifyMarket")}
                  checked={prefs.market}
                  disabled={!prefs.enabled}
                  onChange={(v) => updatePref({ market: v })}
                />
                <Toggle
                  label={t("account.notifyEducational")}
                  checked={prefs.educational}
                  disabled={!prefs.enabled}
                  onChange={(v) => updatePref({ educational: v })}
                />
                <Toggle
                  label={t("account.notifyPromo")}
                  hint={t("account.promoHint")}
                  checked={prefs.promotional}
                  disabled={!prefs.enabled}
                  onChange={(v) => updatePref({ promotional: v })}
                />
                <Toggle
                  label={t("account.notifyAnalyzerReset")}
                  checked={prefs.analyzerReset}
                  disabled={!prefs.enabled}
                  onChange={(v) => updatePref({ analyzerReset: v })}
                />
              </div>
            </div>
            {prefs.enabled && !(prefs.tradeFeed || prefs.market || prefs.educational || prefs.promotional || prefs.analyzerReset) && (
              <p role="status" className="mt-3 text-xs text-gold max-w-xl">{t("account.pickHint")}</p>
            )}
            {prefs.enabled && deviceOn === false && (
              <button
                type="button"
                onClick={() => toggleMaster(true)}
                className="mt-3 me-2 text-xs px-3 py-1 rounded-full border border-line hover:border-text-muted transition-colors"
              >
                {t("account.pushEnableDevice")}
              </button>
            )}
            {prefs.enabled && deviceOn && (
              <button
                type="button"
                onClick={sendTest}
                className="mt-3 text-xs px-3 py-1 rounded-full border border-line hover:border-text-muted transition-colors"
              >
                {t("account.pushTest")}
              </button>
            )}
            {prefsMsg && <p className="mt-3 text-xs text-text-muted">{prefsMsg}</p>}
          </section>
          <VideoAlerts />

          <section>
            <h2 className="text-lg font-semibold">{t("account.plansTitle")}</h2>
            {plans !== null && (
              <div className="mt-2 flex flex-wrap items-center gap-2" data-plan-limits>
                <span className="text-xs text-text-muted font-data">
                  {planLimit === null ? t("planLimits.activeCountUnknown").replace("{n}", String(activeCount)) : t("planLimits.activeCount").replace("{n}", String(activeCount)).replace("{limit}", String(planLimit))}
                </span>
                <span className="flex-1" />
                {(["active", "entered", "archived"] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={planTab === k} onClick={() => setPlanTab(k)} className={`text-xs px-3 py-1 rounded-full border transition-colors ${planTab === k ? "border-gold/50 text-gold" : "border-line text-text-muted hover:text-text"}`}>
                    {t(`planLimits.tab${k === "active" ? "Active" : k === "entered" ? "Entered" : "Archived"}`)}
                  </button>
                ))}
              </div>
            )}
            {planLimit !== null && activeCount > planLimit && <p className="mt-2 text-xs text-text-muted">{t("planLimits.overLimit")}</p>}
            {planLimit !== null && activeCount >= planLimit && <p className="mt-2 text-xs text-gold">{limitText(planLimit)}</p>}
            {planMsg && <p role="status" className="mt-2 text-xs text-bear">{planMsg}</p>}
            <div className="mt-3 space-y-3">
              {plansFailed && <p className="text-bear text-sm">{t("account.plansError")}</p>}
              {!plansFailed && plans === null && (
                <p className="text-text-muted text-sm">{t("account.loading")}</p>
              )}
              {plans !== null && plans.length === 0 && (
                <p className="text-text-muted text-sm">{t("account.plansEmpty")}</p>
              )}
              {plans !== null && plans.length > 0 && shownPlans?.length === 0 && <p className="text-text-muted text-sm">{t("planLimits.emptyTab")}</p>}
              {shownPlans?.map((plan) => (
                <article key={plan.id} className="rounded-xl border border-white/10 p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-data">{plan.pair}</span>
                      <span className="text-xs text-text-muted">
                        {plan.direction === "Long"
                          ? t("risk.long")
                          : plan.direction === "Short"
                            ? t("risk.short")
                            : t("tradePlan.wait")}
                      </span>
                      {plan.timeframe && (
                        <span className="text-xs text-text-muted font-data">{plan.timeframe}</span>
                      )}
                      {plan.status === "entered" && <span className="tag tag-bull">{t("planLimits.chipEntered")}</span>}
                      {plan.status === "archived" && <span className="tag">{t("planLimits.chipArchived")}</span>}
                    </div>
                    {plan.entryZone && (
                      <p className="text-xs text-text-muted mt-1 truncate">
                        {t("tradePlan.entry")}: <span className="font-data">{plan.entryZone}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                    {isActivePlan(plan) && (
                      <button type="button" onClick={() => changePlan(plan.id, "entered")} className="text-xs px-3 py-1 rounded-full border border-line hover:border-text-muted transition-colors">
                        {t("planLimits.markEntered")}
                      </button>
                    )}
                    {plan.status !== "archived" && (
                      <button type="button" onClick={() => changePlan(plan.id, "archived")} className="text-xs px-3 py-1 rounded-full border border-line hover:border-text-muted transition-colors">
                        {t("planLimits.archive")}
                      </button>
                    )}
                    {!isActivePlan(plan) && (
                      <button type="button" onClick={() => changePlan(plan.id, "restore")} className="text-xs px-3 py-1 rounded-full border border-line hover:border-text-muted transition-colors">
                        {t("planLimits.restore")}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openPlan(plan)}
                      className="text-xs px-3 py-1 rounded-full border border-line hover:border-text-muted transition-colors"
                    >
                      {t("account.plansLoad")}
                    </button>
                    <button
                      type="button"
                      onClick={() => removePlan(plan.id)}
                      className="text-xs text-bear border border-bear/40 rounded-full px-3 py-1 hover:bg-bear/10"
                    >
                      {t("account.plansDelete")}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
