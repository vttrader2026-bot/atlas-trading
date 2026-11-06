"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { adminApi, fmtDate, fmtDateTime } from "@/components/admin/adminApi";
import type { MemberAction } from "@/lib/membership";

type Member = { id: string; name: string; email: string; createdAt: number; storedPlan: string; effectivePlan: string; state: string; eliteUntil: number | null; suspended: boolean };
type Pay = { id: string; plan?: string; amount: string; method: string; status: string; createdAt: number; grantedUntil?: number };

const STATE_LABEL: Record<string, string> = { free: "FREE", active: "ELITE · active", unlimited: "ELITE · no expiry", expired: "ELITE · expired", suspended: "Suspended" };
const STATE_CLASS: Record<string, string> = { active: "text-bull border-bull/40", unlimited: "text-gold border-gold/40", expired: "text-bear border-bear/40", suspended: "text-bear border-bear/40" };

export function MembersPanel() {
  const [q, setQ] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [act, setAct] = useState<null | { m: Member; action: MemberAction }>(null);
  const [days, setDays] = useState("30");
  const [until, setUntil] = useState("");
  const [history, setHistory] = useState<{ id: string; payments: Pay[] } | null>(null);
  const LIMIT = 25;

  const load = useCallback(async (query: string, off: number) => {
    setLoading(true);
    const r = await adminApi<{ members: Member[]; total: number }>(`/api/admin/members?q=${encodeURIComponent(query)}&limit=${LIMIT}&offset=${off}`);
    if (r.ok) { setMembers(r.data.members); setTotal(r.data.total); setError(null); } else setError(r.error);
    setLoading(false);
  }, []);
  useEffect(() => { void Promise.resolve().then(() => load("", 0)); }, [load]);

  async function run(): Promise<string | null> {
    if (!act) return null;
    const body: Record<string, unknown> = { action: act.action, confirm: true };
    if (act.action === "activate" || act.action === "renew") body.days = Number(days);
    if (act.action === "setExpiry") body.until = Date.parse(`${until}T23:59:59Z`);
    const r = await adminApi(`/api/admin/members/${act.m.id}`, "POST", body);
    if (!r.ok) return r.error;
    await load(q, offset);
    return null;
  }

  async function showHistory(id: string) {
    if (history?.id === id) return setHistory(null);
    const r = await adminApi<{ payments: Pay[] }>(`/api/admin/members/${id}`);
    if (r.ok) setHistory({ id, payments: r.data.payments });
    else setError(r.error);
  }

  const buttons = (m: Member): { action: MemberAction; label: string; danger?: boolean }[] => {
    const out: { action: MemberAction; label: string; danger?: boolean }[] = [];
    if (m.storedPlan === "elite") {
      if (m.state === "unlimited") out.push({ action: "setExpiry", label: "Set expiry" });
      else { out.push({ action: "renew", label: "Renew" }); out.push({ action: "setExpiry", label: "Set expiry" }); }
    }
    if (m.state === "free" || m.state === "expired") out.push({ action: "activate", label: "Activate ELITE" });
    if (m.storedPlan !== "free") out.push(m.suspended ? { action: "unsuspend", label: "Unsuspend" } : { action: "suspend", label: "Suspend", danger: true });
    if (m.storedPlan !== "free") out.push({ action: "revoke", label: "Revoke", danger: true });
    return out;
  };

  const TITLE: Record<MemberAction, string> = { activate: "Activate ELITE", renew: "Renew ELITE", setExpiry: "Set expiry date", suspend: "Suspend member", unsuspend: "Unsuspend member", revoke: "Revoke membership" };

  return (
    <section>
      <h2 className="text-lg font-semibold">Member management</h2>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); setOffset(0); void load(q, 0); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email, name or user id" aria-label="Search members" className="input flex-1" />
        <button type="submit" className="btn-secondary">Search</button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-bear">{error}</p>}
      {loading ? <p className="mt-4 text-sm text-text-muted">Loading…</p> : members.length === 0 ? <p className="mt-4 text-sm text-text-muted">No members found.</p> : (
        <div className="mt-4 space-y-3">
          {members.map((m) => (
            <div key={m.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{m.email || m.name || m.id}</div>
                  {m.name && m.email && <div className="text-xs text-text-muted">{m.name}</div>}
                  <div className="text-xs text-text-muted font-data mt-0.5 break-all">{m.id}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-full border px-2 py-0.5 font-semibold ${STATE_CLASS[m.state] ?? "text-text-muted border-line"}`}>{STATE_LABEL[m.state] ?? m.state}</span>
                    {m.storedPlan === "elite" && <span className="text-text-muted">Expires: {m.eliteUntil ? fmtDate(m.eliteUntil) : "never (no date set)"}</span>}
                    <span className="text-text-muted">Joined {fmtDate(m.createdAt)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {buttons(m).map((b) => (
                    <button key={b.action} type="button" className={`btn-secondary text-sm ${b.danger ? "text-bear" : ""}`} onClick={() => { setAct({ m, action: b.action }); setDays("30"); setUntil(""); }}>{b.label}</button>
                  ))}
                  <button type="button" className="btn-secondary text-sm" onClick={() => void showHistory(m.id)}>{history?.id === m.id ? "Hide payments" : "Payments"}</button>
                </div>
              </div>
              {history?.id === m.id && (
                <div className="mt-3 border-t border-line pt-3 text-xs space-y-1">
                  {history.payments.length === 0 ? <div className="text-text-muted">No payment requests.</div> : history.payments.map((p) => (
                    <div key={p.id} className="flex flex-wrap gap-x-3 text-text-muted">
                      <span>{fmtDateTime(p.createdAt)}</span><span>{p.method} · {p.amount}</span><span className="text-text">{p.status}</span>
                      {p.grantedUntil ? <span>until {fmtDate(p.grantedUntil)}</span> : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 flex items-center justify-between text-xs text-text-muted">
        <span>{total} member{total === 1 ? "" : "s"}</span>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary text-sm" disabled={offset === 0} onClick={() => { const o = Math.max(0, offset - LIMIT); setOffset(o); void load(q, o); }}>Previous</button>
          <button type="button" className="btn-secondary text-sm" disabled={offset + LIMIT >= total} onClick={() => { const o = offset + LIMIT; setOffset(o); void load(q, o); }}>Next</button>
        </div>
      </div>

      {act && (
        <ConfirmDialog
          title={`${TITLE[act.action]}?`}
          confirmLabel={TITLE[act.action]}
          danger={act.action === "suspend" || act.action === "revoke"}
          typeToConfirm={act.action === "revoke" ? "REVOKE" : undefined}
          onConfirm={run}
          onClose={() => setAct(null)}
        >
          <p className="font-data text-text break-all">{act.m.email || act.m.id}</p>
          {(act.action === "activate" || act.action === "renew") && (
            <>
              <p>{act.action === "renew" ? "Extends from the current end date while the membership is active, otherwise from today." : "Starts today."}</p>
              <div>
                <label htmlFor="member-days" className="text-xs">Days</label>
                <input id="member-days" value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" className="input mt-1.5 w-full font-data" />
              </div>
            </>
          )}
          {act.action === "setExpiry" && (
            <div>
              <label htmlFor="member-until" className="text-xs">Expires at the end of</label>
              <input id="member-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="input mt-1.5 w-full" />
            </div>
          )}
          {act.action === "suspend" && <p>ELITE access stops immediately. Their plan and expiry date are kept.</p>}
          {act.action === "unsuspend" && <p>Access returns only if their expiry date has not passed.</p>}
          {act.action === "revoke" && <p>The paid plan and expiry date are removed and the member goes back to FREE. This cannot be undone.</p>}
        </ConfirmDialog>
      )}
    </section>
  );
}
