"use client";

// ADMIN-v1: owner dashboard shell. The page is already gated on the server (app/admin/layout.tsx); every API call
// below is gated again on the server (lib/adminAuth.ts). Nothing here grants access.
import { useState } from "react";
import { SignalsPanel } from "@/components/admin/SignalsPanel";
import { MembersPanel } from "@/components/admin/MembersPanel";
import { PaymentsPanel } from "@/components/admin/PaymentsPanel";

type Tab = "signals" | "members" | "payments";
const TABS: { id: Tab; label: string }[] = [
  { id: "signals", label: "Signals" },
  { id: "members", label: "Members" },
  { id: "payments", label: "Payments" },
];

export function AdminDashboard({ initialTab }: { initialTab: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="text-label">Owner only</div>
      <h1 className="mt-1 text-2xl font-bold">Admin dashboard</h1>
      <div role="tablist" aria-label="Admin sections" className="mt-5 flex gap-2 border-b border-line">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === t.id ? "border-gold text-gold" : "border-transparent text-text-muted hover:text-text"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === "signals" && <SignalsPanel />}
        {tab === "members" && <MembersPanel />}
        {tab === "payments" && <PaymentsPanel />}
      </div>
    </main>
  );
}
