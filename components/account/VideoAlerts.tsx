"use client";

// VIDEO-ALERTS-v1: member-facing list of published video announcements (section of /account). Works for members who were
// offline when the push went out: it reads the stored announcements, not the notification. Unread = not yet in the
// member's own read list on the server.
import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";

type Alert = { id: string; title: string; description: string; thumbnail: string; url: string; publishedAt: number; read: boolean };

export default function VideoAlerts() {
  const { t, lang } = useLanguage();
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [failedSave, setFailedSave] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me/video-alerts", { cache: "no-store" });
      if (!res.ok) throw new Error("bad status");
      const d = (await res.json()) as { alerts: Alert[] };
      setAlerts(d.alerts);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function markRead(body: { ids: string[] } | { all: true }) {
    setFailedSave(false);
    const before = alerts;
    setAlerts((list) => list && list.map((a) => ("all" in body || body.ids.includes(a.id) ? { ...a, read: true } : a)));
    try {
      const res = await fetch("/api/me/video-alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error("bad status");
    } catch {
      setAlerts(before);
      setFailedSave(true);
    }
  }

  const unread = alerts ? alerts.filter((a) => !a.read).length : 0;
  const date = (ms: number) => new Date(ms).toLocaleDateString(lang === "ar" ? "ar" : lang === "fr" ? "fr-FR" : "en-GB", { year: "numeric", month: "short", day: "numeric" });

  return (
    <section id="video-alerts" data-video-alerts className="rounded-xl border border-white/10 p-6 scroll-mt-20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            {t("videoAlerts.title")}
            {alerts && unread > 0 && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-medium text-gold" data-video-alerts-unread>{t("videoAlerts.unread").replace("{n}", String(unread))}</span>}
          </h2>
          <p className="text-text-muted text-sm mt-1 max-w-xl">{t("videoAlerts.note")}</p>
        </div>
        {alerts && unread > 0 && (
          <button type="button" onClick={() => void markRead({ all: true })} className="btn-secondary !py-1.5 text-sm">{t("videoAlerts.markAll")}</button>
        )}
      </div>

      {failedSave && <p role="alert" className="mt-3 text-sm text-bear">{t("videoAlerts.saveError")}</p>}
      {failed && (
        <p role="alert" className="mt-4 text-sm text-bear">
          {t("videoAlerts.loadError")} <button type="button" onClick={() => void load()} className="underline">{t("videoAlerts.retry")}</button>
        </p>
      )}
      {!failed && alerts === null && <p className="mt-4 text-sm text-text-muted">{t("videoAlerts.loading")}</p>}
      {alerts && alerts.length === 0 && <p className="mt-4 text-sm text-text-muted">{t("videoAlerts.empty")}</p>}

      {alerts && alerts.length > 0 && (
        <ul className="mt-4 space-y-3">
          {alerts.map((a) => (
            <li key={a.id} data-video-alert={a.id} data-read={a.read} className={`card flex flex-col gap-3 p-3 sm:flex-row sm:p-4 ${a.read ? "" : "border-gold/50"}`}>
              <a href={a.url} target="_blank" rel="noopener noreferrer" onClick={() => !a.read && void markRead({ ids: [a.id] })} className="block shrink-0 sm:w-48" aria-label={`${t("videoAlerts.watch")}: ${a.title}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- remote thumbnail (YouTube or an admin-chosen https image) */}
                <img src={a.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-video w-full rounded-lg bg-surface-raised object-cover" />
              </a>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {!a.read && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-medium text-gold">{t("videoAlerts.isNew")}</span>}
                  <span className="text-xs text-text-muted">{t("videoAlerts.published").replace("{date}", date(a.publishedAt))}</span>
                </div>
                <h3 className="mt-1 font-semibold break-words">{a.title}</h3>
                {a.description && <p className="mt-1 text-sm text-text-muted break-words">{a.description}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={a.url} target="_blank" rel="noopener noreferrer" onClick={() => !a.read && void markRead({ ids: [a.id] })} className="btn-primary !py-1.5 text-sm">{t("videoAlerts.watch")}</a>
                  {!a.read && <button type="button" onClick={() => void markRead({ ids: [a.id] })} className="btn-secondary !py-1.5 text-sm">{t("videoAlerts.markRead")}</button>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
