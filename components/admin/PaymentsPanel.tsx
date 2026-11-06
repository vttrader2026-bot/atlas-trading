"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { adminApi, fmtDate, fmtDateTime } from "@/components/admin/adminApi";

type Req = { id: string; userId: string; member: string; plan?: string; amount: string; method: string; telegramUsername?: string; status: "pending" | "approved" | "rejected"; createdAt: number; updatedAt: number; hasProof: boolean; grantedUntil?: number; reviewedBy?: string };
const FILTERS = ["pending", "approved", "rejected", "all"] as const;
const KIND: Record<string, string> = { started: "ELITE started", extended: "ELITE extended", unlimited: "Member already has ELITE with no expiry; nothing changed" };

export function PaymentsPanel() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("pending");
  const [list, setList] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [proof, setProof] = useState<{ id: string; src: string } | null>(null);
  const [act, setAct] = useState<null | { r: Req; action: "approve" | "reject" }>(null);

  const load = useCallback(async (f: string) => {
    setLoading(true);
    const r = await adminApi<{ requests: Req[] }>(`/api/admin/payments?status=${f}`);
    if (r.ok) { setList(r.data.requests); setError(null); } else setError(r.error);
    setLoading(false);
  }, []);
  useEffect(() => { void Promise.resolve().then(() => load(filter)); }, [filter, load]);

  async function viewProof(id: string) {
    if (proof?.id === id) return setProof(null);
    const r = await adminApi<{ request: { proof: string } }>(`/api/admin/payments/${id}`);
    if (r.ok) setProof({ id, src: r.data.request.proof });
    else setError(r.error);
  }

  async function decide(): Promise<string | null> {
    if (!act) return null;
    const r = await adminApi<{ kind?: string; until?: number | null }>(`/api/admin/payments/${act.r.id}`, "POST", { action: act.action, confirm: true });
    if (!r.ok) return r.error;
    setNotice(act.action === "reject" ? "Payment rejected." : `${KIND[r.data.kind ?? ""] ?? "Approved"}${r.data.until ? ` · valid until ${fmtDate(r.data.until)}` : ""}`);
    await load(filter);
    return null;
  }

  return (
    <section>
      <h2 className="text-lg font-semibold">Payment management</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f} className={`text-sm rounded-full px-3 py-1.5 border ${filter === f ? "border-gold text-gold" : "border-line text-text-muted"}`}>
            {f === "all" ? "History (all)" : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      {notice && <p role="status" className="mt-3 text-sm text-bull">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-bear">{error}</p>}
      {loading ? <p className="mt-4 text-sm text-text-muted">Loading…</p> : list.length === 0 ? <p className="mt-4 text-sm text-text-muted">Nothing here.</p> : (
        <div className="mt-4 space-y-3">
          {list.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{r.method.toUpperCase()} — {r.amount}</div>
                  <div className="text-xs text-text-muted mt-0.5">{r.member || r.userId} · {r.telegramUsername || "no Telegram username"}</div>
                  <div className="text-xs text-text-muted mt-0.5">{fmtDateTime(r.createdAt)}{r.plan && r.plan !== "elite" ? " · old plan request (no longer offered)" : ""}</div>
                  <div className="text-xs mt-1">
                    <span className={r.status === "approved" ? "text-bull" : r.status === "rejected" ? "text-bear" : "text-gold"}>{r.status}</span>
                    {r.status !== "pending" && <span className="text-text-muted"> · {fmtDateTime(r.updatedAt)}</span>}
                    {r.grantedUntil ? <span className="text-text-muted"> · ELITE until {fmtDate(r.grantedUntil)}</span> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.hasProof && <button type="button" className="btn-secondary text-sm" onClick={() => void viewProof(r.id)}>{proof?.id === r.id ? "Hide proof" : "View proof"}</button>}
                  {r.status === "pending" && (!r.plan || r.plan === "elite") && (
                    <>
                      <button type="button" className="btn-primary text-sm" onClick={() => setAct({ r, action: "approve" })}>Approve</button>
                      <button type="button" className="btn-secondary text-sm text-bear" onClick={() => setAct({ r, action: "reject" })}>Reject</button>
                    </>
                  )}
                </div>
              </div>
              {proof?.id === r.id && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proof.src} alt="Payment proof" className="mt-3 rounded-lg border border-line max-h-96 w-auto" />
              )}
            </div>
          ))}
        </div>
      )}
      {act && (
        <ConfirmDialog
          title={act.action === "approve" ? "Approve this payment?" : "Reject this payment?"}
          confirmLabel={act.action === "approve" ? "Approve" : "Reject"}
          danger={act.action === "reject"}
          onConfirm={decide}
          onClose={() => setAct(null)}
        >
          <p className="text-text">{act.r.method.toUpperCase()} — {act.r.amount}<br /><span className="font-data text-xs break-all">{act.r.member || act.r.userId}</span></p>
          {act.action === "approve" ? <p>Gives 30 days of ELITE, added after the current end date if the membership is still active. An active ELITE member is never downgraded. A request can only be decided once.</p> : <p>The member stays as they are. A request can only be decided once.</p>}
        </ConfirmDialog>
      )}
    </section>
  );
}
