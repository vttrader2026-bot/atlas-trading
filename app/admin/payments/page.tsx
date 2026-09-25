"use client";

import { useState } from "react";

type PaymentStatus = "pending" | "approved" | "rejected";
type PaymentRequest = {
  id: string;
  userId: string;
  amount: string;
  method: string;
  proof: string;
  telegramUsername?: string;
  status: PaymentStatus;
  createdAt: number;
  updatedAt: number;
};

export default function AdminPaymentsPage() {
  const [secret, setSecret] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actingOn, setActingOn] = useState<string | null>(null);

  async function loadRequests(currentSecret: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/payments?status=pending", {
        headers: { "x-admin-secret": currentSecret },
        cache: "no-store",
      });
      if (res.status === 401) throw new Error("Wrong admin secret.");
      if (!res.ok) throw new Error("Failed to load requests.");
      const data = await res.json();
      setRequests(data.requests ?? []);
      setUnlocked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setUnlocked(false);
    } finally {
      setLoading(false);
    }
  }

  async function act(id: string, status: "approved" | "rejected") {
    setActingOn(id);
    try {
      const res = await fetch(`/api/payments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-secret": secret },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Action failed.");
      }
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setActingOn(null);
    }
  }

  if (!unlocked) {
    return (
      <main className="max-w-sm mx-auto px-6 py-16">
        <h1 className="text-xl font-semibold mb-4">Admin — Payment Requests</h1>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Admin secret"
          className="input mb-3"
          onKeyDown={(e) => e.key === "Enter" && loadRequests(secret)}
        />
        {error && <p className="text-bear text-sm mb-3">{error}</p>}
        <button type="button" onClick={() => loadRequests(secret)} disabled={loading} className="btn-primary w-full">
          {loading ? "Checking..." : "Unlock"}
        </button>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Pending payment requests</h1>
        <button type="button" onClick={() => loadRequests(secret)} className="btn-secondary text-sm">
          Refresh
        </button>
      </div>

      {error && <p className="text-bear text-sm mb-4">{error}</p>}
      {requests.length === 0 && <p className="text-text-muted text-sm">Nothing pending.</p>}

      <div className="space-y-4">
        {requests.map((r) => (
          <div key={r.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <div className="font-medium">{r.method.toUpperCase()} — {r.amount}</div>
                <div className="text-xs text-text-muted mt-0.5">
                  {r.telegramUsername || "no Telegram username"} · {new Date(r.createdAt).toLocaleString()}
                </div>
                <div className="text-xs text-text-muted font-data mt-0.5">Clerk user: {r.userId}</div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => act(r.id, "approved")}
                  disabled={actingOn === r.id}
                  className="text-xs border border-bull/40 text-bull rounded-full px-3 py-1.5 hover:bg-bull/10"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => act(r.id, "rejected")}
                  disabled={actingOn === r.id}
                  className="text-xs border border-bear/40 text-bear rounded-full px-3 py-1.5 hover:bg-bear/10"
                >
                  Reject
                </button>
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.proof} alt="Payment proof" className="rounded-lg border border-line max-h-80 w-auto" />
          </div>
        ))}
      </div>
    </main>
  );
}
