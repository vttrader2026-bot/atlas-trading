"use client";

// VIDEO-ALERTS-v1: owner dashboard section to announce a YouTube video and notify members. The page is gated on the server
// (app/admin/layout.tsx) and every call is gated again in app/api/admin/video-alerts/*. Nothing here grants access.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { adminApi, fmtDateTime } from "@/components/admin/adminApi";
import { parseYouTubeId, thumbMedium, youtubeWatchUrl } from "@/lib/videos";
import { LIMITS, alertPayload, describePush, type VideoAlert } from "@/lib/videoAlertsShared";

type Form = { url: string; title: string; description: string; thumbnail: string; notify: boolean };
const emptyForm = (): Form => ({ url: "", title: "", description: "", thumbnail: "", notify: true });

function httpsOk(v: string): boolean {
  try { return new URL(v.trim()).protocol === "https:"; } catch { return false; }
}

export function VideoAlertsPanel() {
  const [alerts, setAlerts] = useState<VideoAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // "publish" or an alert id
  const [del, setDel] = useState<VideoAlert | null>(null);

  const load = useCallback(async () => {
    const r = await adminApi<{ alerts: VideoAlert[] }>("/api/admin/video-alerts");
    if (r.ok) { setAlerts(r.data.alerts); setError(null); } else setError(r.error);
    setLoading(false);
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const id = useMemo(() => (form.url.trim() ? parseYouTubeId(form.url) : null), [form.url]);
  const thumbOk = !form.thumbnail.trim() || httpsOk(form.thumbnail);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const thumbSrc = id ? (form.thumbnail.trim() && thumbOk ? form.thumbnail.trim() : thumbMedium(id)) : null;
  const duplicate = !!id && alerts.some((a) => a.id === id);

  function check(): string | null {
    if (!id) return "Paste a valid YouTube link (watch, youtu.be, Shorts or embed).";
    if (duplicate) return "This video already has an announcement.";
    if (!form.title.trim()) return "Add a title.";
    if (!thumbOk) return "The thumbnail must be a full https:// image link, or leave it empty to use the YouTube thumbnail.";
    return null;
  }
  function openPreview() { const e = check(); setFormError(e); if (!e) setPreview(true); }

  async function publish() {
    setBusy("publish");
    const r = await adminApi<{ alert: VideoAlert; message: string }>("/api/admin/video-alerts", "POST", { url: form.url, title: form.title, description: form.description, thumbnail: form.thumbnail, notify: form.notify });
    setBusy(null);
    if (!r.ok) { setPreview(false); setFormError(r.error); return; }
    const pushed = r.data.alert.push;
    setNotice({ text: r.data.message, ok: !form.notify || pushed?.state === "sent" });
    setPreview(false); setForm(emptyForm()); setFormError(null);
    await load();
  }
  async function patch(a: VideoAlert, body: Record<string, unknown>) {
    setBusy(a.id);
    const r = await adminApi<{ message: string; alert: VideoAlert }>(`/api/admin/video-alerts/${a.id}`, "PATCH", body);
    setBusy(null);
    if (!r.ok) { setNotice({ text: r.error, ok: false }); return; }
    setNotice({ text: r.data.message, ok: body.notify ? r.data.alert.push?.state === "sent" : true });
    await load();
  }
  async function remove(): Promise<string | null> {
    if (!del) return null;
    const r = await adminApi(`/api/admin/video-alerts/${del.id}`, "DELETE", { confirm: true });
    if (!r.ok) return r.error;
    setNotice({ text: "Announcement deleted. It is gone from every member's Video Alerts.", ok: true });
    await load();
    return null;
  }

  const sample = alertPayload({ id: id ?? "", title: form.title.trim() || "Your title", description: form.description.trim() });

  return (
    <section>
      <h2 className="text-lg font-semibold">Video Alerts</h2>
      <p className="text-sm text-text-muted">Announce a YouTube video: it appears in every member&apos;s Video Alerts and, if you leave the box ticked, goes out as a push notification to members who have notifications on. One notification per video, ever.</p>

      {notice && <p role="status" className={`mt-3 text-sm ${notice.ok ? "text-bull" : "text-bear"}`}>{notice.text}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-bear">{error}</p>}

      <form onSubmit={(e) => { e.preventDefault(); openPreview(); }} className="card mt-4 p-4 sm:p-6" aria-label="New video announcement">
        <h3 className="font-semibold">New announcement</h3>
        <div className="mt-4 grid gap-5 md:grid-cols-[1fr_16rem]">
          <div className="space-y-3">
            <div>
              <label htmlFor="va-url" className="text-xs text-text-muted">YouTube link</label>
              <input id="va-url" value={form.url} onChange={(e) => set("url", e.target.value)} dir="ltr" placeholder="https://youtu.be/…" className="input mt-1.5 w-full font-data" autoComplete="off" />
              <p className="mt-1 text-xs text-text-muted" aria-live="polite">
                {!form.url.trim() ? "The thumbnail appears as soon as the link is valid." : id ? (duplicate ? <span className="text-bear">This video already has an announcement.</span> : <>Video ID: <span className="font-data text-text">{id}</span></>) : <span className="text-bear">Not a valid YouTube link.</span>}
              </p>
            </div>
            <div>
              <label htmlFor="va-title" className="text-xs text-text-muted">Title</label>
              <input id="va-title" value={form.title} maxLength={LIMITS.title} onChange={(e) => set("title", e.target.value)} className="input mt-1.5 w-full" autoComplete="off" />
            </div>
            <div>
              <label htmlFor="va-desc" className="text-xs text-text-muted">Short description <span className="text-text-muted">({form.description.length}/{LIMITS.description})</span></label>
              <textarea id="va-desc" value={form.description} maxLength={LIMITS.description} rows={3} onChange={(e) => set("description", e.target.value)} className="input mt-1.5 w-full" />
            </div>
            <div>
              <label htmlFor="va-thumb" className="text-xs text-text-muted">Thumbnail (optional)</label>
              <input id="va-thumb" value={form.thumbnail} onChange={(e) => set("thumbnail", e.target.value)} dir="ltr" placeholder="Leave empty to use the YouTube thumbnail, or paste an https:// image link" className="input mt-1.5 w-full font-data" autoComplete="off" />
              {!thumbOk && <p className="mt-1 text-xs text-bear">Must be a full https:// image link.</p>}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.notify} onChange={(e) => set("notify", e.target.checked)} /> Send a push notification to members when I publish
            </label>
          </div>
          <div>
            <p className="text-xs text-text-muted">Thumbnail</p>
            <div className="mt-1.5 aspect-video w-full overflow-hidden rounded-lg border border-line bg-surface-raised">
              {thumbSrc ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote thumbnail, admin only
                <img src={thumbSrc} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : <div className="flex h-full items-center justify-center px-3 text-center text-xs text-text-muted">Preview appears here</div>}
            </div>
          </div>
        </div>
        {formError && <p role="alert" className="mt-4 text-sm text-bear">{formError}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="submit" className="btn-primary">Preview &amp; publish</button>
          <button type="button" className="btn-secondary" onClick={() => { setForm(emptyForm()); setFormError(null); }}>Clear</button>
        </div>
      </form>

      <h3 className="mt-8 font-semibold">Published announcements</h3>
      {loading && <p className="mt-3 text-sm text-text-muted">Loading...</p>}
      {!loading && alerts.length === 0 && !error && <p className="mt-3 text-sm text-text-muted">Nothing announced yet.</p>}
      <ul className="mt-3 space-y-3">
        {alerts.map((a) => (
          <li key={a.id} className="card flex flex-col gap-3 p-3 sm:flex-row sm:p-4" data-alert-row={a.id}>
            {/* eslint-disable-next-line @next/next/no-img-element -- remote thumbnail, admin only */}
            <img src={a.thumbnail ?? thumbMedium(a.id)} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-video w-full shrink-0 rounded-lg bg-surface-raised object-cover sm:w-44" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-medium ${a.status === "published" ? "bg-bull/15 text-bull" : "bg-surface-raised text-text-muted"}`}>{a.status === "published" ? "Published" : "Unpublished"}</span>
                <span className="text-text-muted">{fmtDateTime(a.publishedAt)}</span>
              </div>
              <p className="mt-1 font-semibold break-words">{a.title}</p>
              {a.description && <p className="text-sm text-text-muted break-words">{a.description}</p>}
              <p className={`mt-1 text-xs ${a.push?.state === "sent" ? "text-bull" : "text-text-muted"}`}>{a.push ? describePush(a.push) : "No notification sent."}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a href={youtubeWatchUrl(a.id)} target="_blank" rel="noopener noreferrer" className="btn-secondary !py-1.5 text-sm">Open video</a>
                {a.status === "published"
                  ? <button type="button" disabled={busy === a.id} onClick={() => void patch(a, { status: "unpublished" })} className="btn-secondary !py-1.5 text-sm">Unpublish</button>
                  : <button type="button" disabled={busy === a.id} onClick={() => void patch(a, { status: "published" })} className="btn-secondary !py-1.5 text-sm">Publish again</button>}
                {a.status === "published" && a.push?.state !== "sent" && (
                  <button type="button" disabled={busy === a.id} onClick={() => void patch(a, { notify: true })} className="btn-primary !py-1.5 text-sm">{busy === a.id ? "Sending..." : "Send notification"}</button>
                )}
                <button type="button" onClick={() => setDel(a)} className="btn-secondary !py-1.5 text-sm text-bear">Delete</button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-6" onClick={() => busy !== "publish" && setPreview(false)}>
          <div role="dialog" aria-modal="true" aria-label="Preview announcement" onClick={(e) => e.stopPropagation()} className="card w-full sm:max-w-lg max-h-[92vh] overflow-y-auto p-5 sm:p-6">
            <h2 className="text-lg font-bold">Preview</h2>
            <p className="mt-3 text-xs text-text-muted">Notification</p>
            <div className="mt-1.5 rounded-xl border border-line bg-surface-raised p-3 text-sm">
              <p className="font-semibold break-words">{sample.title}</p>
              <p className="mt-0.5 text-text-muted break-words">{sample.body}</p>
              <p className="mt-2 text-xs font-medium text-gold">Watch Now</p>
              <p className="mt-1 text-xs text-text-muted">Tapping it opens the YouTube video.{!form.notify && " (You switched notifications off: this will only appear in Video Alerts.)"}</p>
            </div>
            <p className="mt-4 text-xs text-text-muted">In members&apos; Video Alerts</p>
            <div className="mt-1.5 card p-3">
              {thumbSrc && (
                // eslint-disable-next-line @next/next/no-img-element -- remote thumbnail, admin only
                <img src={thumbSrc} alt="" className="aspect-video w-full rounded-lg object-cover" referrerPolicy="no-referrer" />
              )}
              <p className="mt-2 font-semibold break-words">{form.title.trim()}</p>
              {form.description.trim() && <p className="mt-1 text-sm text-text-muted break-words">{form.description.trim()}</p>}
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secondary" disabled={busy === "publish"} onClick={() => setPreview(false)}>Back to edit</button>
              <button type="button" className="btn-primary" disabled={busy === "publish"} onClick={() => void publish()}>{busy === "publish" ? "Publishing..." : form.notify ? "Publish & notify" : "Publish"}</button>
            </div>
          </div>
        </div>
      )}

      {del && (
        <ConfirmDialog title="Delete this announcement?" confirmLabel="Delete" danger onConfirm={remove} onClose={() => setDel(null)}>
          <p>&ldquo;{del.title}&rdquo; disappears from every member&apos;s Video Alerts. Notifications already sent cannot be recalled, and this video will not be notified again within 30 days. Use Unpublish to keep it.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
