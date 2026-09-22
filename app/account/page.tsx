"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useLanguage } from "@/lib/i18n";
import { saveDraft } from "@/lib/tradePlan";
import { enablePush, disablePush, thisDeviceSubscribed } from "@/lib/pushClient";
import { defaultPrefs, type NotificationPrefs } from "@/lib/notificationPrefs";
import type { SavedPlan } from "@/lib/savedPlans";

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
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
      <span>{label}</span>
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
  const [deviceOn, setDeviceOn] = useState<boolean | null>(null);

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
        if (!cancelled) setPlans(Array.isArray(data.plans) ? data.plans : []);
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
      if (!cancelled) setDeviceOn(on);
    });
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);
  
  async function toggleMaster(on: boolean) {
    setPrefsMsg(null);
    if (on) {
      const result = await enablePush(lang);
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
          <section className="rounded-xl border border-white/10 p-6">
            <h2 className="text-lg font-semibold">{t("account.notificationsTitle")}</h2>
            <p className="text-text-muted text-sm mt-1 max-w-xl">{t("account.notificationsNote")}</p>
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
              </div>
            </div>
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

          <section>
            <h2 className="text-lg font-semibold">{t("account.plansTitle")}</h2>
            <div className="mt-3 space-y-3">
              {plansFailed && <p className="text-bear text-sm">{t("account.plansError")}</p>}
              {!plansFailed && plans === null && (
                <p className="text-text-muted text-sm">{t("account.loading")}</p>
              )}
              {plans !== null && plans.length === 0 && (
                <p className="text-text-muted text-sm">{t("account.plansEmpty")}</p>
              )}
              {plans?.map((plan) => (
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
                    </div>
                    {plan.entryZone && (
                      <p className="text-xs text-text-muted mt-1 truncate">
                        {t("tradePlan.entry")}: <span className="font-data">{plan.entryZone}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
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