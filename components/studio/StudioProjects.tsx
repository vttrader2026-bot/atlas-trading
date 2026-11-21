"use client";
// PROJECTS-v1: "My Projects" for the Social Media Studio: save / update the open design, and reopen, rename, duplicate or delete saved
// ones. Works for all three tools through their StudioToolHandle. Data lives in the owner's own Redis hashes (see lib/studioProjects.ts).
import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { blobToThumb, shrinkDataUrl, type StudioToolHandle } from "@/components/studio/exportImage";
import type { ProjectMeta, ProjectType } from "@/lib/studioProjects";
import type { L3 } from "@/lib/studio";

const L = (en: string, ar: string, fr: string): L3 => ({ en, ar, fr });
const UI = {
  title: L("My Projects", "مشاريعي", "Mes projets"), empty: L("No saved designs yet. Save your first one above.", "لا توجد تصاميم محفوظة بعد. احفظ أول تصميم أعلاه.", "Aucune création enregistrée. Enregistrez la première ci-dessus."),
  name: L("Project name", "اسم المشروع", "Nom du projet"), untitled: L("Untitled design", "تصميم بلا عنوان", "Création sans titre"),
  save: L("Save", "حفظ", "Enregistrer"), saveNew: L("Save as new", "حفظ كنسخة جديدة", "Enregistrer comme nouveau"), newDesign: L("New design", "تصميم جديد", "Nouvelle création"),
  saving: L("Saving…", "جارٍ الحفظ…", "Enregistrement…"), saved: L("Saved", "تم الحفظ", "Enregistré"), editing: L("Editing a saved project", "تعديل مشروع محفوظ", "Modification d'un projet enregistré"),
  open: L("Open", "فتح", "Ouvrir"), rename: L("Rename", "إعادة تسمية", "Renommer"), duplicate: L("Duplicate", "تكرار", "Dupliquer"), del: L("Delete", "حذف", "Supprimer"), cancel: L("Cancel", "إلغاء", "Annuler"), ok: L("OK", "موافق", "OK"),
  confirmDel: L("Delete this project? This cannot be undone.", "حذف هذا المشروع؟ لا يمكن التراجع.", "Supprimer ce projet ? Cette action est irréversible."),
  loading: L("Loading…", "جارٍ التحميل…", "Chargement…"), modified: L("Modified", "آخر تعديل", "Modifié"), copy: L("copy", "نسخة", "copie"),
  discard: L("You have unsaved changes. Continue and discard them?", "لديك تغييرات غير محفوظة. هل تريد المتابعة وتجاهلها؟", "Vous avez des modifications non enregistrées. Continuer et les abandonner ?"),
  failed: L("Something went wrong. Please try again.", "حدث خطأ. حاول مرة أخرى.", "Une erreur s'est produite. Réessayez."),
  types: { phone: L("Phone Studio", "استوديو الهواتف", "Studio téléphones"), end: L("End Screen", "الشاشة الختامية", "Écran de fin"), thumb: L("YouTube Thumbnail", "صورة يوتيوب المصغرة", "Miniature YouTube") } as Record<ProjectType, L3>,
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

export type CurrentProject = { id: string; name: string };
type Props = {
  type: ProjectType;
  tool: () => StudioToolHandle | null;
  current: CurrentProject | null;
  onCurrent: (c: CurrentProject | null) => void;
  onOpen: (type: ProjectType, data: Record<string, unknown>, meta: CurrentProject) => void;
  onNew: () => void;
  version: number; // changes whenever a design is opened, started new or the tool is switched
};

export default function StudioProjects({ type, tool, current, onCurrent, onOpen, onNew, version }: Props) {
  const { lang } = useLanguage();
  const tr = (k: Exclude<keyof typeof UI, "types">) => UI[k][lang];
  const [list, setList] = useState<ProjectMeta[] | null>(null);
  const [name, setName] = useState(current?.name ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      setList((await api<{ projects: ProjectMeta[] }>("/api/studio/projects")).projects);
    } catch (e) {
      setList((l) => l ?? []);
      setMsg({ ok: false, text: e instanceof Error ? e.message : UI.failed[lang] });
    }
  }, [lang]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(current?.name ?? "");
  }, [current?.id, current?.name]);

  // Unsaved changes = the tool's data differs from what it was when opened, started or last saved.
  const snap = () => { try { return JSON.stringify(tool()?.getData() ?? null); } catch { return null; } };
  const baseline = useRef<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => { baseline.current = snap(); }, 150); // after the opened design has been applied
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, type]);
  const confirmDiscard = () => baseline.current === null || snap() === baseline.current || window.confirm(tr("discard"));

  const fail = (e: unknown) => setMsg({ ok: false, text: e instanceof Error ? e.message : UI.failed[lang] });

  async function save(asNew: boolean) {
    const handle = tool();
    if (!handle || busy) return;
    setBusy("save"); setMsg(null);
    try {
      const data = handle.getData();
      const saved = JSON.stringify(data);
      const spec = data.spec as { image?: unknown } | undefined;
      if (spec && typeof spec.image === "string") data.spec = { ...spec, image: await shrinkDataUrl(spec.image) };
      const thumb = await blobToThumb(await handle.makeThumb());
      const title = name.trim() || tr("untitled");
      if (current && !asNew) {
        await api(`/api/studio/projects/${current.id}`, { method: "PUT", body: JSON.stringify({ name: title, data, thumb }) });
        onCurrent({ id: current.id, name: title });
      } else {
        const { project } = await api<{ project: ProjectMeta }>("/api/studio/projects", { method: "POST", body: JSON.stringify({ type, name: current && asNew ? `${title} (${tr("copy")})` : title, data, thumb }) });
        onCurrent({ id: project.id, name: project.name });
      }
      baseline.current = saved;
      setMsg({ ok: true, text: tr("saved") });
      await reload();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function openProject(p: ProjectMeta) {
    if (busy || !confirmDiscard()) return;
    setBusy(`open-${p.id}`); setMsg(null);
    try {
      const r = await api<{ project: ProjectMeta; data: Record<string, unknown> }>(`/api/studio/projects/${p.id}`);
      onOpen(r.project.type, r.data, { id: r.project.id, name: r.project.name });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }
  async function duplicate(p: ProjectMeta) {
    if (busy) return;
    setBusy(`dup-${p.id}`); setMsg(null);
    try {
      const r = await api<{ data: Record<string, unknown> }>(`/api/studio/projects/${p.id}`);
      await api("/api/studio/projects", { method: "POST", body: JSON.stringify({ type: p.type, name: `${p.name} (${tr("copy")})`.slice(0, 80), data: r.data, thumb: p.thumb }) });
      await reload();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }
  async function rename() {
    if (!renaming || busy) return;
    const value = renaming.value.trim();
    if (!value) return;
    setBusy(`ren-${renaming.id}`); setMsg(null);
    try {
      await api(`/api/studio/projects/${renaming.id}`, { method: "PUT", body: JSON.stringify({ name: value }) });
      if (current?.id === renaming.id) onCurrent({ id: renaming.id, name: value });
      setRenaming(null);
      await reload();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }
  async function remove(p: ProjectMeta) {
    if (busy || !window.confirm(tr("confirmDel"))) return;
    setBusy(`del-${p.id}`); setMsg(null);
    try {
      await api(`/api/studio/projects/${p.id}`, { method: "DELETE" });
      if (current?.id === p.id) onCurrent(null);
      await reload();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  const fmtDate = (t: number) => new Date(t).toLocaleString(lang === "ar" ? "ar-u-nu-latn" : lang, { dateStyle: "medium", timeStyle: "short" });
  const input = "min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-text focus:border-gold/60 focus:outline-none";
  const btn = "rounded-md border border-line px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:text-text disabled:opacity-50";

  return (
    <section data-studio-projects className="mt-6 rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${input} basis-48`} dir="auto" maxLength={80} value={name} placeholder={tr("name")} aria-label={tr("name")} onChange={(e) => setName(e.target.value)} />
        <button type="button" onClick={() => save(false)} disabled={!!busy} className="btn-primary text-sm disabled:opacity-50">{busy === "save" ? tr("saving") : tr("save")}</button>
        {current && <button type="button" onClick={() => save(true)} disabled={!!busy} className={btn}>{tr("saveNew")}</button>}
        {current && <button type="button" onClick={() => { if (confirmDiscard()) onNew(); }} disabled={!!busy} className={btn}>{tr("newDesign")}</button>}
      </div>
      {current && <p className="mt-2 text-xs text-text-muted">{tr("editing")}: <span className="font-medium text-text">{current.name}</span></p>}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 text-sm ${msg.ok ? "text-bull" : "text-bear"}`}>{msg.text}</p>}

      <h2 className="mt-5 text-label text-text-muted">{tr("title")}{list ? ` (${list.length})` : ""}</h2>
      {list === null ? (
        <p className="mt-3 text-sm text-text-muted">{tr("loading")}</p>
      ) : list.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">{tr("empty")}</p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <li key={p.id} data-project={p.id} className={`overflow-hidden rounded-lg border bg-surface-raised ${current?.id === p.id ? "border-gold/60" : "border-line"}`}>
              <button type="button" onClick={() => openProject(p)} disabled={!!busy} className="block w-full bg-bg" aria-label={`${tr("open")}: ${p.name}`}>
                {p.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumb} alt="" className="mx-auto h-36 w-full object-contain" loading="lazy" />
                ) : <div className="h-36" />}
              </button>
              <div className="p-3">
                {renaming?.id === p.id ? (
                  <div className="flex gap-1.5">
                    <input autoFocus className={input} dir="auto" maxLength={80} value={renaming.value} aria-label={tr("rename")} onChange={(e) => setRenaming({ id: p.id, value: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") void rename(); if (e.key === "Escape") setRenaming(null); }} />
                    <button type="button" className={btn} onClick={() => void rename()} disabled={!!busy}>{tr("ok")}</button>
                    <button type="button" className={btn} onClick={() => setRenaming(null)}>{tr("cancel")}</button>
                  </div>
                ) : (
                  <div className="truncate text-sm font-medium" dir="auto" title={p.name}>{p.name}</div>
                )}
                <div className="mt-1 text-xs text-text-muted">{UI.types[p.type][lang]}</div>
                <div className="text-xs text-text-muted">{tr("modified")}: <span dir="ltr">{fmtDate(p.updatedAt)}</span></div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" className={btn} onClick={() => openProject(p)} disabled={!!busy}>{tr("open")}</button>
                  <button type="button" className={btn} onClick={() => setRenaming({ id: p.id, value: p.name })} disabled={!!busy}>{tr("rename")}</button>
                  <button type="button" className={btn} onClick={() => duplicate(p)} disabled={!!busy}>{tr("duplicate")}</button>
                  <button type="button" className={`${btn} hover:!text-bear`} onClick={() => remove(p)} disabled={!!busy}>{tr("del")}</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
