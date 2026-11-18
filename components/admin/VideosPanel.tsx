"use client";

// VIDEO-ADMIN-v1: browser-based video manager. The page is gated on the server (app/admin/layout.tsx) and every call below is
// gated again on the server (app/api/admin/videos/*). Nothing here grants access; the checks in this form are conveniences.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { adminApi } from "@/components/admin/adminApi";
import VideoPlayer from "@/components/videos/VideoPlayer";
import { CATEGORY_LABELS, CATEGORY_ORDER, parseYouTubeId, pick, thumbMedium, type Lang, type StoredVideo, type VideoCategory, type VideoStatus } from "@/lib/videos";

type Form = {
  url: string; titleEn: string; descriptionEn: string; titleAr: string; descriptionAr: string; titleFr: string; descriptionFr: string;
  category: VideoCategory | ""; date: string; status: VideoStatus;
};
const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = (): Form => ({ url: "", titleEn: "", descriptionEn: "", titleAr: "", descriptionAr: "", titleFr: "", descriptionFr: "", category: "tutorials", date: today(), status: "published" });
const toForm = (v: StoredVideo): Form => ({
  url: `https://youtu.be/${v.id}`, titleEn: v.title.en, descriptionEn: v.description.en, titleAr: v.title.ar ?? "", descriptionAr: v.description.ar ?? "",
  titleFr: v.title.fr ?? "", descriptionFr: v.description.fr ?? "", category: v.category ?? "", date: v.date ?? "", status: v.status,
});

function Thumb({ id, className = "" }: { id: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote YouTube still, admin only
    <img src={thumbMedium(id)} alt="" loading="lazy" className={`aspect-video w-full rounded-lg bg-surface-raised object-cover ${className}`} />
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs text-text-muted">{label}</label>
      {children}
    </div>
  );
}

export function VideosPanel() {
  const [videos, setVideos] = useState<StoredVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null } | null>(null); // id null = adding
  const [form, setForm] = useState<Form>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [preview, setPreview] = useState<StoredVideo | null>(null);
  const [pvLang, setPvLang] = useState<Lang>("en");
  const [del, setDel] = useState<StoredVideo | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<VideoCategory | "all">("all");
  const [st, setSt] = useState<VideoStatus | "all">("all");

  const load = useCallback(async () => {
    const r = await adminApi<{ videos: StoredVideo[] }>("/api/admin/videos");
    if (r.ok) { setVideos(r.data.videos); setError(null); } else setError(r.error);
    setLoading(false);
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const detectedId = useMemo(() => (form.url.trim() ? parseYouTubeId(form.url) : null), [form.url]);
  const filtering = q.trim() !== "" || cat !== "all" || st !== "all";
  const shown = videos.filter((v) => {
    if (cat !== "all" && v.category !== cat) return false;
    if (st !== "all" && v.status !== st) return false;
    const n = q.trim().toLowerCase();
    return !n || [v.id, v.title.en, v.title.ar, v.title.fr].some((t) => t?.toLowerCase().includes(n));
  });

  function openAdd() { setEditing({ id: null }); setForm(emptyForm()); setFormError(null); setNotice(null); }
  function openEdit(v: StoredVideo) { setEditing({ id: v.id }); setForm(toForm(v)); setFormError(null); setNotice(null); window.scrollTo({ top: 0, behavior: "smooth" }); }
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !editing) return;
    setFormError(null);
    if (editing.id === null && !detectedId) return setFormError("Paste a valid YouTube link (watch, youtu.be, Shorts or embed).");
    if (!form.titleEn.trim()) return setFormError("Add an English title.");
    setSaving(true);
    const { url, ...fields } = form;
    const r = editing.id === null
      ? await adminApi("/api/admin/videos", "POST", { url, ...fields })
      : await adminApi(`/api/admin/videos/${editing.id}`, "PATCH", fields);
    setSaving(false);
    if (!r.ok) return setFormError(r.error);
    setNotice(editing.id === null ? (form.status === "published" ? "Video published. It is live on /videos now." : "Draft saved. Only you can see it.") : "Changes saved.");
    setEditing(null);
    await load();
  }

  async function setStatus(v: StoredVideo, status: VideoStatus) {
    const r = await adminApi(`/api/admin/videos/${v.id}`, "PATCH", { status });
    if (!r.ok) return setError(r.error);
    setError(null);
    setNotice(status === "published" ? "Published. It is live on /videos now." : "Unpublished. It is hidden from the public site.");
    await load();
  }
  async function move(v: StoredVideo, direction: "up" | "down") {
    const r = await adminApi("/api/admin/videos/reorder", "POST", { id: v.id, direction });
    if (!r.ok) return setError(r.error);
    setError(null);
    await load();
  }
  async function remove(): Promise<string | null> {
    if (!del) return null;
    const r = await adminApi(`/api/admin/videos/${del.id}`, "DELETE", { confirm: true });
    if (!r.ok) return r.error;
    setNotice("Video deleted.");
    await load();
    return null;
  }

  const addingNew = editing?.id === null;
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Video library</h2>
          <p className="text-sm text-text-muted">Videos stay on YouTube; paste a link, fill in the text, publish. Live on <span className="font-data">/videos</span> straight away.</p>
        </div>
        {!editing && <button type="button" onClick={openAdd} className="btn-primary">+ Add video</button>}
      </div>

      {notice && <p role="status" className="mt-3 text-sm text-bull">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-bear">{error}</p>}

      {editing && (
        <form onSubmit={save} className="card mt-4 p-4 sm:p-6" aria-label={addingNew ? "Add video" : "Edit video"}>
          <h3 className="font-semibold">{addingNew ? "Add video" : "Edit video"}</h3>
          <div className="mt-4 grid gap-5 md:grid-cols-[1fr_16rem]">
            <div className="space-y-3">
              <Field id="vid-url" label="YouTube link (watch, youtu.be, Shorts or embed)">
                <input id="vid-url" value={form.url} onChange={(e) => set("url", e.target.value)} readOnly={!addingNew} dir="ltr" placeholder="https://youtu.be/…" className="input mt-1.5 w-full font-data" autoComplete="off" autoFocus={addingNew} />
              </Field>
              <p className="text-xs text-text-muted" aria-live="polite">
                {!form.url.trim() ? "The thumbnail and video ID appear as soon as the link is valid."
                  : detectedId ? <>Video ID: <span className="font-data text-text">{detectedId}</span></> : <span className="text-bear">Not a valid YouTube link.</span>}
                {!addingNew && " The YouTube link can't be changed; delete and re-add to use another video."}
              </p>
            </div>
            <div>{detectedId ? <Thumb id={detectedId} /> : <div className="aspect-video w-full rounded-lg border border-dashed border-line" aria-hidden />}</div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {([["En", "English", "ltr"], ["Ar", "Arabic", "rtl"], ["Fr", "French", "ltr"]] as const).map(([k, label, dir]) => (
              <fieldset key={k} className="space-y-2 rounded-xl border border-line p-3">
                <legend className="px-1 text-sm font-medium">{label}{k === "En" ? " *" : ""}</legend>
                <Field id={`vid-title-${k}`} label="Title">
                  <input id={`vid-title-${k}`} dir={dir} maxLength={120} value={form[`title${k}` as keyof Form] as string} onChange={(e) => set(`title${k}` as keyof Form, e.target.value as never)} className="input mt-1 w-full" />
                </Field>
                <Field id={`vid-desc-${k}`} label="Description">
                  <textarea id={`vid-desc-${k}`} dir={dir} rows={3} maxLength={800} value={form[`description${k}` as keyof Form] as string} onChange={(e) => set(`description${k}` as keyof Form, e.target.value as never)} className="input mt-1 w-full" />
                </Field>
              </fieldset>
            ))}
          </div>
          <p className="mt-2 text-xs text-text-muted">Only English is required. A missing Arabic or French text falls back to English.</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Field id="vid-cat" label="Category">
              <select id="vid-cat" value={form.category} onChange={(e) => set("category", e.target.value as VideoCategory | "")} className="input mt-1.5 w-full">
                <option value="">No category</option>
                {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c].en}</option>)}
              </select>
            </Field>
            <Field id="vid-date" label="Publication date">
              <input id="vid-date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className="input mt-1.5 w-full" />
            </Field>
            <Field id="vid-status" label="Status">
              <select id="vid-status" value={form.status} onChange={(e) => set("status", e.target.value as VideoStatus)} className="input mt-1.5 w-full">
                <option value="published">Published (visible on the site)</option>
                <option value="draft">Draft (only you)</option>
              </select>
            </Field>
          </div>

          {formError && <p role="alert" className="mt-4 text-sm text-bear">{formError}</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving…" : addingNew ? (form.status === "published" ? "Publish video" : "Save draft") : "Save changes"}
            </button>
            <button type="button" disabled={saving} onClick={() => setEditing(null)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or video ID" aria-label="Search videos" className="input w-full sm:w-64" />
        <select value={cat} onChange={(e) => setCat(e.target.value as VideoCategory | "all")} aria-label="Filter by category" className="input w-auto">
          <option value="all">All categories</option>
          {CATEGORY_ORDER.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c].en}</option>)}
        </select>
        <select value={st} onChange={(e) => setSt(e.target.value as VideoStatus | "all")} aria-label="Filter by status" className="input w-auto">
          <option value="all">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
      </div>
      {filtering && videos.length > 1 && <p className="mt-2 text-xs text-text-muted">Clear the search and filters to change the order.</p>}

      {loading ? <p className="mt-4 text-sm text-text-muted">Loading…</p> : videos.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">No videos yet. Press “Add video”.</p>
      ) : shown.length === 0 ? <p className="mt-4 text-sm text-text-muted">No videos match.</p> : (
        <ul className="mt-4 space-y-3">
          {shown.map((v) => {
            const i = videos.findIndex((x) => x.id === v.id);
            return (
              <li key={v.id} className="card p-3 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="w-full shrink-0 sm:w-44"><Thumb id={v.id} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`rounded-full border px-2 py-0.5 ${v.status === "published" ? "border-bull/50 text-bull" : "border-line text-text-muted"}`}>{v.status === "published" ? "Published" : "Draft"}</span>
                      {v.category && <span className="text-text-muted">{CATEGORY_LABELS[v.category].en}</span>}
                      {v.date && <span className="text-text-muted">{v.date}</span>}
                      <span className="font-data text-text-muted">{v.id}</span>
                    </div>
                    <h3 className="mt-1 font-medium leading-snug">{v.title.en}</h3>
                    {v.description.en && <p className="mt-0.5 line-clamp-2 text-sm text-text-muted">{v.description.en}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => { setPreview(v); setPvLang("en"); }} className="btn-secondary !px-3 !py-1.5 text-sm">Preview</button>
                      <button type="button" onClick={() => openEdit(v)} className="btn-secondary !px-3 !py-1.5 text-sm">Edit</button>
                      {v.status === "published"
                        ? <button type="button" onClick={() => setStatus(v, "draft")} className="btn-secondary !px-3 !py-1.5 text-sm">Unpublish</button>
                        : <button type="button" onClick={() => setStatus(v, "published")} className="btn-primary !px-3 !py-1.5 text-sm">Publish</button>}
                      <button type="button" disabled={filtering || i <= 0} onClick={() => move(v, "up")} aria-label={`Move “${v.title.en}” up`} className="btn-secondary !px-3 !py-1.5 text-sm">↑</button>
                      <button type="button" disabled={filtering || i < 0 || i >= videos.length - 1} onClick={() => move(v, "down")} aria-label={`Move “${v.title.en}” down`} className="btn-secondary !px-3 !py-1.5 text-sm">↓</button>
                      <button type="button" onClick={() => setDel(v)} className="btn-secondary !px-3 !py-1.5 text-sm border-bear/50 text-bear">Delete</button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6" onClick={() => setPreview(null)}>
          <div role="dialog" aria-modal="true" aria-label="Video preview" onClick={(e) => e.stopPropagation()} className="card max-h-[92vh] w-full overflow-y-auto p-4 sm:max-w-2xl sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex gap-1" role="group" aria-label="Preview language">
                {(["en", "ar", "fr"] as const).map((l) => (
                  <button key={l} type="button" aria-pressed={pvLang === l} onClick={() => setPvLang(l)} className={`rounded-full border px-3 py-1 text-xs uppercase ${pvLang === l ? "border-gold text-gold" : "border-line text-text-muted"}`}>{l}</button>
                ))}
              </div>
              <button type="button" onClick={() => setPreview(null)} className="btn-secondary !px-3 !py-1.5 text-sm">Close</button>
            </div>
            <div className="mt-4"><VideoPlayer id={preview.id} title={pick(preview.title, pvLang)} /></div>
            <div dir={pvLang === "ar" ? "rtl" : "ltr"} className="mt-4">
              <div className="text-label text-gold">{preview.category ? CATEGORY_LABELS[preview.category][pvLang] : ""}</div>
              <h3 className="mt-1 text-xl font-semibold leading-snug">{pick(preview.title, pvLang)}</h3>
              {pick(preview.description, pvLang) && <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text-muted">{pick(preview.description, pvLang)}</p>}
            </div>
            <p className="mt-4 text-xs text-text-muted">{preview.status === "published" ? "This video is live on the public site." : "Draft: visitors cannot see this video yet."}</p>
          </div>
        </div>
      )}

      {del && (
        <ConfirmDialog title="Delete this video?" confirmLabel="Delete video" danger onConfirm={remove} onClose={() => setDel(null)}>
          <p>“{del.title.en}” will be removed from the library and its page on the website will stop working. The video itself stays on YouTube.</p>
          <p>This can’t be undone.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
