"use client";

// ADMIN-v1: every sensitive admin action goes through this dialog. `typeToConfirm` makes the owner type a word first.
import { useEffect, useState } from "react";

export function ConfirmDialog({
  title, children, confirmLabel, danger, typeToConfirm, onConfirm, onClose,
}: {
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  typeToConfirm?: string;
  onConfirm: () => Promise<string | null>; // returns an error message, or null when done
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [busy, onClose]);
  const locked = !!typeToConfirm && typed.trim() !== typeToConfirm;
  async function go() {
    if (busy || locked) return;
    setBusy(true);
    setError(null);
    const err = await onConfirm();
    setBusy(false);
    if (err) setError(err);
    else onClose();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-6" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="card w-full sm:max-w-md max-h-[92vh] overflow-y-auto p-5 sm:p-6">
        <h2 className="text-lg font-bold">{title}</h2>
        <div className="mt-2 text-sm text-text-muted space-y-3">{children}</div>
        {typeToConfirm && (
          <div className="mt-4">
            <label htmlFor="admin-confirm-typed" className="text-xs text-text-muted">Type <span className="font-data text-text">{typeToConfirm}</span> to confirm</label>
            <input id="admin-confirm-typed" value={typed} onChange={(e) => setTyped(e.target.value)} className="input mt-1.5 w-full font-data" autoComplete="off" />
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-bear">{error}</p>}
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={go} disabled={busy || locked} className={danger ? "btn-secondary border-bear/50 text-bear" : "btn-primary"}>
            {busy ? "Working…" : confirmLabel}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
}
