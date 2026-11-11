"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { MAX_DRAFTS, MAX_NAME, draftTitle, sortDrafts, type DraftStore } from "@/lib/tradeDrafts";

export type DraftsError = "save" | "read" | "limit" | null;

/** "My drafts": every saved Trade Plan draft with open / rename / delete, plus loading, empty and error states. */
export default function DraftsPanel({
  store, loading, error, onNew, onOpen, onRename, onDelete, onDismissError,
}: {
  store: DraftStore | null;
  loading: boolean;
  error: DraftsError;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onDismissError: () => void;
}) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const drafts = store ? sortDrafts(store.drafts) : [];

  const errText =
    error === "save" ? t("tradePlan.drafts.errSave")
    : error === "read" ? t("tradePlan.drafts.errRead")
    : error === "limit" ? t("tradePlan.drafts.errLimit").replace("{n}", String(MAX_DRAFTS))
    : null;

  return (
    <section className="mt-6 card p-4 sm:p-5" aria-label={t("tradePlan.drafts.title")} aria-busy={loading}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-label text-text-muted">{t("tradePlan.drafts.title")}</h2>
        <span className="flex-1" />
        <button type="button" className="btn-secondary" onClick={onNew} disabled={loading}>{t("tradePlan.drafts.new")}</button>
      </div>

      {errText && (
        <div role="alert" className="mt-3 flex items-start gap-3 rounded-lg border border-bear/40 bg-bear/10 p-3 text-sm">
          <span className="flex-1">{errText}</span>
          <button type="button" className="text-xs underline" onClick={onDismissError}>{t("tradePlan.drafts.dismiss")}</button>
        </div>
      )}

      {loading ? (
        <p className="mt-3 text-sm text-text-muted" role="status">{t("tradePlan.drafts.loading")}</p>
      ) : drafts.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">{t("tradePlan.drafts.empty")}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {drafts.map((d) => {
            const active = d.id === store?.activeId;
            const title = draftTitle(d) || t("tradePlan.drafts.untitled");
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 text-sm" aria-current={active || undefined}>
                {editing === d.id ? (
                  <form
                    className="flex flex-1 flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      onRename(d.id, name);
                      setEditing(null);
                    }}
                  >
                    <input
                      autoFocus
                      className="input min-w-0 flex-1"
                      maxLength={MAX_NAME}
                      value={name}
                      placeholder={t("tradePlan.drafts.namePlaceholder")}
                      aria-label={t("tradePlan.drafts.rename")}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => e.key === "Escape" && setEditing(null)}
                    />
                    <button type="submit" className="btn-primary">{t("tradePlan.drafts.saveName")}</button>
                    <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>{t("tradePlan.drafts.cancel")}</button>
                  </form>
                ) : (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium break-words" dir="auto">{title}</span>
                      <span className="ms-2 text-xs text-text-muted">
                        <span dir="ltr">{d.plan.pair || "—"}</span>
                        {" · "}
                        {d.plan.status === "entered" ? t("tradePlan.enteredChip") : t("tradePlan.draftChip")}
                        {" · "}
                        <span dir="ltr">{new Date(d.updatedAt).toLocaleString()}</span>
                      </span>
                    </span>
                    {active ? (
                      <span className="tag tag-bull">{t("tradePlan.drafts.current")}</span>
                    ) : (
                      <button type="button" className="text-xs text-gold underline" onClick={() => onOpen(d.id)}>{t("tradePlan.drafts.open")}</button>
                    )}
                    <button type="button" className="text-xs text-gold underline" onClick={() => { setName(d.name); setEditing(d.id); }}>{t("tradePlan.drafts.rename")}</button>
                    <button
                      type="button"
                      className="text-xs text-text-muted underline"
                      onClick={() => { if (window.confirm(t("tradePlan.drafts.confirmDelete"))) onDelete(d.id); }}
                    >
                      {t("tradePlan.drafts.delete")}
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
