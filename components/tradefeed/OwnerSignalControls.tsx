"use client";

// FEED-ADMIN-v1: owner-only management of one signal, on /trade-feed. Four separate actions that reuse the owner APIs:
//   Edit          PATCH  /api/admin/signals/{id}
//   Update status POST   /api/admin/signals/{id}/status
//   Cancel        POST   /api/admin/signals/{id}/cancel   (keeps the signal and its history)
//   Delete        DELETE /api/admin/signals/{id}          (published: true; removes it permanently)
// This component is only SHOWN to the owner; every route re-checks the owner on the server.
import { useState } from "react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { adminApi } from "@/components/admin/adminApi";
import { useLanguage } from "@/lib/i18n";
import type { PublishedTrade } from "@/lib/tradeFeed";

type Kind = "edit" | "status" | "cancel" | "delete";
type Form = { pair: string; timeframe: string; entryZone: string; invalidation: string; tp1: string; tp2: string; tp3: string; reasoning: string };
const toForm = (t: PublishedTrade): Form => ({ pair: t.pair, timeframe: t.timeframe, entryZone: t.entryZone, invalidation: t.invalidation, tp1: t.tp1, tp2: t.tp2, tp3: t.tp3, reasoning: t.reasoning });
const btn = "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium leading-tight transition-colors";
const icon = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, className: "shrink-0" } as const;
const IconEdit = () => <svg {...icon}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>;
const IconStatus = () => <svg {...icon}><path d="M20 6 9 17l-5-5" /></svg>;
const IconCancel = () => <svg {...icon}><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></svg>;
const IconDelete = () => <svg {...icon}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></svg>;

export default function OwnerSignalControls({ trade, onUpdated, onDeleted, onNotice }: {
  trade: PublishedTrade;
  onUpdated: (t: PublishedTrade) => void;
  onDeleted: (id: string) => void;
  onNotice: (text: string) => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState<Kind | null>(null);
  const [form, setForm] = useState<Form>(() => toForm(trade));
  const [outcome, setOutcome] = useState("");
  const [reason, setReason] = useState("");
  const closed = trade.status === "closed" || !!trade.closing;
  const free = (trade.tier ?? "free") === "free";
  const hit = trade.hitLevels ?? [];
  const levels = ([["TP1", trade.tp1], ["TP2", trade.tp2], ["TP3", trade.tp3]] as const).filter(([k, v]) => v && !hit.includes(k));
  const fill = (s: string, vars: Record<string, string>) => Object.entries(vars).reduce((a, [k, v]) => a.replace(`{${k}}`, v), s);
  // Delete is the last button: when an odd number of buttons is shown it spans both columns so the grid stays even.
  const shown = (closed ? 0 : hit.length === 0 ? 3 : 2) + 1;
  const base = `/api/admin/signals/${encodeURIComponent(trade.id)}`;
  const close = () => setOpen(null);
  const run = async (key: string, call: () => ReturnType<typeof adminApi<{ trade?: PublishedTrade }>>, after?: (d: { trade?: PublishedTrade }) => void): Promise<string | null> => {
    const r = await call();
    if (!r.ok) return r.error || t("feedAdmin.errGeneric");
    after?.(r.data);
    onNotice(t(`feedAdmin.${key}`));
    return null;
  };
  const merge = (d: { trade?: PublishedTrade }) => d.trade && onUpdated({ ...trade, ...d.trade, tier: trade.tier, confirmations: trade.confirmations });

  const input = (key: keyof Form, label: string, multiline = false) => (
    <div key={key}>
      <label htmlFor={`own-${trade.id}-${key}`} className="text-xs text-text-muted">{label}</label>
      {multiline ? (
        <textarea id={`own-${trade.id}-${key}`} rows={3} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="input mt-1 w-full" />
      ) : (
        <input id={`own-${trade.id}-${key}`} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} dir="ltr" className="input mt-1 w-full font-data" />
      )}
    </div>
  );

  return (
    <>
      <div className="grid w-full grid-cols-2 gap-2" data-owner-controls>
        {!closed && hit.length === 0 && <button type="button" onClick={() => { setForm(toForm(trade)); setOpen("edit"); }} className={`${btn} border-line text-text-muted hover:text-text hover:bg-surface-raised`}><IconEdit />{t("feedAdmin.edit")}</button>}
        {!closed && <button type="button" onClick={() => { setOutcome(levels[0]?.[0] ?? "SL"); setReason(""); setOpen("status"); }} className={`${btn} border-gold/40 text-gold hover:bg-gold/10`}><IconStatus />{t("feedAdmin.status")}</button>}
        {!closed && <button type="button" onClick={() => { setReason(""); setOpen("cancel"); }} className={`${btn} border-line text-text-muted hover:text-text hover:bg-surface-raised`}><IconCancel />{t("feedAdmin.cancel")}</button>}
        <button type="button" onClick={() => setOpen("delete")} className={`${btn} border-bear/50 bg-bear/10 text-bear hover:bg-bear/20 ${shown % 2 === 0 ? "" : "col-span-2"}`}><IconDelete />{t("feedAdmin.delete")}</button>
      </div>

      {open === "edit" && (
        <ConfirmDialog title={t("feedAdmin.editTitle")} confirmLabel={t("feedAdmin.editSave")} onClose={close}
          onConfirm={() => run("edited", () => adminApi(base, "PATCH", { ...form, direction: trade.direction, tier: trade.tier ?? "free" }), merge)}>
          <p>{t("feedAdmin.editNote")}</p>
          <div className="grid grid-cols-2 gap-3">{input("pair", t("feedAdmin.pair"))}{input("timeframe", t("feedAdmin.timeframe"))}</div>
          {input("entryZone", t("feedAdmin.entry"))}{input("invalidation", t("feedAdmin.stop"))}
          <div className="grid grid-cols-3 gap-3">{input("tp1", t("feedAdmin.tp1"))}{input("tp2", t("feedAdmin.tp2"))}{input("tp3", t("feedAdmin.tp3"))}</div>
          {input("reasoning", t("feedAdmin.reasoning"), true)}
        </ConfirmDialog>
      )}

      {open === "status" && (
        <ConfirmDialog title={t("feedAdmin.statusTitle")} confirmLabel={t("feedAdmin.statusSave")} onClose={close}
          onConfirm={() => run("statusDone", () => adminApi(`${base}/status`, "POST", { confirm: true, outcome, reason }), merge)}>
          <p>{t("feedAdmin.statusNote")}</p>
          <p>{t(free ? "feedAdmin.statusFreeNote" : "feedAdmin.statusEliteNote")}</p>
          <div>
            <label htmlFor={`own-${trade.id}-outcome`} className="text-xs text-text-muted">{t("feedAdmin.outcome")}</label>
            <select id={`own-${trade.id}-outcome`} value={outcome} onChange={(e) => setOutcome(e.target.value)} className="input mt-1 w-full">
              {levels.map(([k]) => <option key={k} value={k}>{fill(t("feedAdmin.outTp"), { level: k })}</option>)}
              <option value="SL">{t("feedAdmin.outSl")}</option>
            </select>
          </div>
          <div>
            <label htmlFor={`own-${trade.id}-note`} className="text-xs text-text-muted">{t("feedAdmin.note")}</label>
            <input id={`own-${trade.id}-note`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="input mt-1 w-full" />
          </div>
        </ConfirmDialog>
      )}

      {open === "cancel" && (
        <ConfirmDialog title={t("feedAdmin.cancelTitle")} confirmLabel={t("feedAdmin.cancelConfirm")} onClose={close}
          onConfirm={() => run("cancelled", () => adminApi(`${base}/cancel`, "POST", { confirm: true, reason }), merge)}>
          <p>{t("feedAdmin.cancelNote")}</p>
          <div>
            <label htmlFor={`own-${trade.id}-reason`} className="text-xs text-text-muted">{t("feedAdmin.reason")}</label>
            <input id={`own-${trade.id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className="input mt-1 w-full" />
          </div>
        </ConfirmDialog>
      )}

      {open === "delete" && (
        <ConfirmDialog title={t("feedAdmin.deleteTitle")} confirmLabel={t("feedAdmin.deleteConfirm")} danger typeToConfirm="DELETE" onClose={close}
          onConfirm={() => run("deleted", () => adminApi(base, "DELETE", { confirm: true, published: true }), () => onDeleted(trade.id))}>
          <p>{trade.pair} · {trade.direction}</p>
          <p>{t("feedAdmin.deleteNote")}</p>
        </ConfirmDialog>
      )}
    </>
  );
}
