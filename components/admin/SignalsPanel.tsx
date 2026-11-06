"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { adminApi, fmtDateTime } from "@/components/admin/adminApi";
import type { SignalDraft } from "@/lib/adminSignals";
import type { PublishedTrade } from "@/lib/tradeFeed";

type Published = PublishedTrade & { tier: "free" | "elite"; confirmations: number };
type Form = { id?: string; published: boolean; tier: "" | "free" | "elite"; pair: string; direction: "Long" | "Short"; timeframe: string; entryZone: string; invalidation: string; tp1: string; tp2: string; tp3: string; reasoning: string };
const EMPTY: Form = { published: false, tier: "", pair: "", direction: "Long", timeframe: "4H", entryZone: "", invalidation: "", tp1: "", tp2: "", tp3: "", reasoning: "" };

const TierBadge = ({ tier }: { tier: string }) => (
  <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border ${tier === "elite" ? "border-gold/50 text-gold" : "border-line text-text-muted"}`}>{tier === "elite" ? "ELITE" : "FREE"}</span>
);

export function SignalsPanel() {
  const [drafts, setDrafts] = useState<SignalDraft[]>([]);
  const [published, setPublished] = useState<Published[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: "publish" | "delete" | "cancel"; id: string; label: string; tier: string }>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const r = await adminApi<{ drafts: SignalDraft[]; published: Published[] }>("/api/admin/signals");
    if (r.ok) {
      setDrafts(r.data.drafts);
      setPublished(r.data.published);
      setError(null);
    } else setError(r.error);
    setLoading(false);
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form || saving) return;
    setSaving(true);
    setError(null);
    const body = { tier: form.tier || undefined, pair: form.pair, direction: form.direction, timeframe: form.timeframe, entryZone: form.entryZone, invalidation: form.invalidation, tp1: form.tp1, tp2: form.tp2, tp3: form.tp3, reasoning: form.reasoning };
    const r = form.id ? await adminApi(`/api/admin/signals/${form.id}`, "PATCH", body) : await adminApi("/api/admin/signals", "POST", body);
    setSaving(false);
    if (!r.ok) return setError(r.error);
    setForm(null);
    await load();
  }

  const field = (key: keyof Form, label: string, props: { placeholder?: string; multiline?: boolean } = {}) => (
    <div className={props.multiline ? "sm:col-span-2" : ""}>
      <label htmlFor={`sig-${key}`} className="text-xs text-text-muted">{label}</label>
      {props.multiline ? (
        <textarea id={`sig-${key}`} value={String(form![key])} onChange={(e) => setForm({ ...form!, [key]: e.target.value })} rows={3} className="input mt-1.5 w-full" />
      ) : (
        <input id={`sig-${key}`} value={String(form![key])} onChange={(e) => setForm({ ...form!, [key]: e.target.value })} placeholder={props.placeholder} dir="ltr" className="input mt-1.5 w-full font-data" />
      )}
    </div>
  );

  async function runConfirm(): Promise<string | null> {
    if (!confirm) return null;
    const r =
      confirm.kind === "publish" ? await adminApi(`/api/admin/signals/${confirm.id}/publish`, "POST", { confirm: true })
      : confirm.kind === "delete" ? await adminApi(`/api/admin/signals/${confirm.id}`, "DELETE", { confirm: true })
      : await adminApi(`/api/admin/signals/${confirm.id}/cancel`, "POST", { confirm: true, reason });
    if (!r.ok) return r.error;
    setReason("");
    await load();
    return null;
  }

  const editFrom = (s: SignalDraft | Published, isPublished: boolean): Form => ({
    id: s.id, published: isPublished, tier: (s.tier as "free" | "elite") ?? "free", pair: s.pair, direction: s.direction, timeframe: s.timeframe, entryZone: s.entryZone,
    invalidation: s.invalidation, tp1: s.tp1, tp2: s.tp2, tp3: s.tp3, reasoning: s.reasoning,
  });

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Signal management</h2>
        {!form && <button type="button" className="btn-primary" onClick={() => setForm({ ...EMPTY })}>New signal</button>}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-bear">{error}</p>}

      {form && (
        <form onSubmit={save} noValidate className="card mt-4 p-4 sm:p-5">
          <div className="text-label">{form.id ? (form.published ? "Edit published signal" : "Edit draft") : "New draft"}</div>
          <fieldset className="mt-3" disabled={form.published}>
            <legend className="text-xs text-text-muted">Visibility {form.published && "(fixed once published)"}</legend>
            <div className="mt-1.5 flex gap-4 text-sm">
              {(["free", "elite"] as const).map((t) => (
                <label key={t} className="flex items-center gap-2">
                  <input type="radio" name="tier" checked={form.tier === t} onChange={() => setForm({ ...form, tier: t })} /> {t === "elite" ? "ELITE" : "FREE"}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-3 grid sm:grid-cols-2 gap-3">
            {field("pair", "Pair", { placeholder: "SOLUSDT" })}
            <div>
              <label htmlFor="sig-direction" className="text-xs text-text-muted">Direction</label>
              <select id="sig-direction" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as "Long" | "Short" })} className="input mt-1.5 w-full">
                <option>Long</option><option>Short</option>
              </select>
            </div>
            {field("timeframe", "Timeframe")}
            {field("entryZone", "Entry zone", { placeholder: "100 - 110" })}
            {field("invalidation", "Stop-loss")}
            {field("tp1", "TP1")}
            {field("tp2", "TP2")}
            {field("tp3", "TP3")}
            {field("reasoning", "Reasoning", { multiline: true })}
          </div>
          <div className="mt-4 flex gap-3">
            <button type="submit" disabled={saving || !form.tier} className="btn-primary">{saving ? "Saving…" : form.published ? "Save changes" : "Save draft"}</button>
            <button type="button" className="btn-secondary" onClick={() => { setForm(null); setError(null); }}>Close</button>
          </div>
          {!form.tier && <p className="mt-2 text-xs text-text-muted">Choose FREE or ELITE visibility first.</p>}
        </form>
      )}

      <h3 className="mt-8 text-sm font-semibold">Drafts</h3>
      {loading ? <p className="mt-2 text-sm text-text-muted">Loading…</p> : drafts.length === 0 ? <p className="mt-2 text-sm text-text-muted">No drafts.</p> : (
        <div className="mt-2 space-y-3">
          {drafts.map((d) => (
            <div key={d.id} className="card p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium flex items-center gap-2">{d.pair} {d.direction} <TierBadge tier={d.tier} /></div>
                <div className="text-xs text-text-muted font-data mt-1">Entry {d.entryZone} · SL {d.invalidation} · TP {[d.tp1, d.tp2, d.tp3].filter(Boolean).join(" / ")}</div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary text-sm" onClick={() => setForm(editFrom(d, false))}>Edit</button>
                <button type="button" className="btn-primary text-sm" onClick={() => setConfirm({ kind: "publish", id: d.id, label: `${d.pair} ${d.direction}`, tier: d.tier })}>Publish</button>
                <button type="button" className="btn-secondary text-sm text-bear" onClick={() => setConfirm({ kind: "delete", id: d.id, label: `${d.pair} ${d.direction}`, tier: d.tier })}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 className="mt-8 text-sm font-semibold">Published</h3>
      {published.length === 0 ? <p className="mt-2 text-sm text-text-muted">Nothing published.</p> : (
        <div className="mt-2 space-y-3">
          {published.map((s) => {
            const open = s.status !== "closed" && !s.closing;
            return (
              <div key={s.id} className="card p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-medium flex items-center gap-2">{s.pair} {s.direction} <TierBadge tier={s.tier} />
                    <span className={`text-xs ${open ? "text-bull" : "text-text-muted"}`}>{open ? "Open" : s.closing ? s.closing.outcome === "CANCELLED" ? "Cancelled" : `Closed ${s.closing.outcome}` : "Closed"}</span>
                  </div>
                  <div className="text-xs text-text-muted font-data mt-1">Entry {s.entryZone} · SL {s.invalidation} · TP {[s.tp1, s.tp2, s.tp3].filter(Boolean).join(" / ")}</div>
                  <div className="text-xs text-text-muted mt-0.5">{fmtDateTime(s.createdAt)} · {s.confirmations} confirmation{s.confirmations === 1 ? "" : "s"}</div>
                </div>
                {open && (
                  <div className="flex gap-2">
                    <button type="button" className="btn-secondary text-sm" onClick={() => setForm(editFrom(s, true))}>Edit</button>
                    <button type="button" className="btn-secondary text-sm text-bear" onClick={() => setConfirm({ kind: "cancel", id: s.id, label: `${s.pair} ${s.direction}`, tier: s.tier })}>Cancel signal</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === "publish" ? `Publish ${confirm.label}?` : confirm.kind === "delete" ? `Delete draft ${confirm.label}?` : `Cancel ${confirm.label}?`}
          confirmLabel={confirm.kind === "publish" ? "Publish now" : confirm.kind === "delete" ? "Delete draft" : "Cancel signal"}
          danger={confirm.kind !== "publish"}
          onConfirm={runConfirm}
          onClose={() => { setConfirm(null); setReason(""); }}
        >
          {confirm.kind === "publish" && <p>{confirm.tier === "elite" ? "This is an ELITE signal: members on FREE will only see a locked preview until it closes." : "This is a FREE signal: every signed-in member can see all its levels."} Members are notified, and the visibility cannot be changed afterwards.</p>}
          {confirm.kind === "delete" && <p>The draft is removed permanently.</p>}
          {confirm.kind === "cancel" && (
            <>
              <p>The signal is closed as CANCELLED. Its levels stay on record{confirm.tier === "elite" ? " and become visible to FREE members, like any closed ELITE signal" : ""}. This cannot be undone.</p>
              <div>
                <label htmlFor="cancel-reason" className="text-xs">Reason (optional)</label>
                <input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="input mt-1.5 w-full" />
              </div>
            </>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
