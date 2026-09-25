"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";

type Method = "usdt" | "bankily" | "masrivi" | "sedad";
type PaymentStatus = "pending" | "approved" | "rejected";
type PaymentRequest = {
  id: string;
  status: PaymentStatus;
  amount: string;
  method: string;
  createdAt: number;
  updatedAt: number;
};

const METHOD_DETAILS: Record<
  Method,
  {
    title: string;
    badgeColor: string;
    badgeLabel: string;
    rows: { label: string; value: string }[];
    note?: string;
  }
> = {
  usdt: {
    title: "USDT — TRC20 Network",
    badgeColor: "#F7931A",
    badgeLabel: "₮",
    rows: [
      { label: "Wallet Address", value: "TDci1YykFVMF6UfLEB5BdX161rBHwjhdsf" },
      { label: "Network", value: "TRC20 — do not send on any other network" },
    ],
    note: "Double-check this address against your Binance app before sending.",
  },
  bankily: {
    title: "Bankily",
    badgeColor: "#2B8FE0",
    badgeLabel: "B",
    rows: [{ label: "Account Number", value: "33848396" }],
  },
  masrivi: {
    title: "Masrivi",
    badgeColor: "#35C48A",
    badgeLabel: "M",
    rows: [{ label: "Account Number", value: "33848396" }],
  },
  sedad: {
    title: "Sedad",
    badgeColor: "#9B6DFF",
    badgeLabel: "S",
    rows: [{ label: "Account Number", value: "33554452" }],
  },
};

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.82;

/** Downscale + re-encode an uploaded image client-side before base64. */
function fileToCompressedBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read image"));
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const scale = MAX_DIMENSION / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable, ignore */
        }
      }}
      className={
        "shrink-0 text-xs px-2.5 py-1.5 rounded-md border transition-colors " +
        (copied ? "text-bull border-bull" : "border-line bg-surface-raised hover:border-gold")
      }
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

/** Renders the Pending / Approved / Rejected step indicator based on real status. */
function StatusTracker({ status }: { status: PaymentStatus | null }) {
  const step = status ?? "pending";
  const isRejected = step === "rejected";

  const pillClass = (active: boolean, rejected = false) =>
    "border rounded-full px-3 py-1 " +
    (rejected
      ? "border-bear text-bear"
      : active
      ? "border-gold text-gold"
      : "border-line text-text-muted");

  return (
    <div className="flex gap-2 mt-5 text-xs">
      <span className={pillClass(step === "pending")}>Pending</span>
      {isRejected ? (
        <span className={pillClass(true, true)}>Rejected</span>
      ) : (
        <span className={pillClass(step === "approved")}>→ Approved</span>
      )}
    </div>
  );
}

export default function ElitePage() {
  const { t } = useLanguage();
  const { isSignedIn, isLoaded } = useUser();

  const [method, setMethod] = useState<Method>("usdt");
  const [amount, setAmount] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [latestRequest, setLatestRequest] = useState<PaymentRequest | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch("/api/payments/me", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setLatestRequest(data.request ?? null);
    } catch {
      /* non-fatal - the tracker just stays on its last known state */
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSignedIn) {
      fetchStatus();
    }
  }, [isSignedIn, fetchStatus]);

  // Poll every 15s while a request is pending, so approval reflects without a manual refresh.
  useEffect(() => {
    if (!isSignedIn || latestRequest?.status !== "pending") return;
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, [isSignedIn, latestRequest?.status, fetchStatus]);

  async function handleSubmit() {
    if (!amount.trim() || !telegramUsername.trim() || !file) {
      setResult("error");
      setErrorMsg("Please fill in amount, Telegram username, and upload a screenshot.");
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const proof = await fileToCompressedBase64(file);
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, method, proof, telegramUsername }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Submission failed");
      }
      setResult("success");
      setAmount("");
      setTelegramUsername("");
      setFile(null);
      fetchStatus();
    } catch (err) {
      setResult("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const detail = METHOD_DETAILS[method];

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <span className="badge inline-flex items-center gap-1.5 text-[11px] tracking-wide uppercase text-gold border border-gold/35 bg-gold/8 px-2.5 py-1 rounded-full">
        ⚜ Atlas Elite
      </span>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-3">Upgrade to Atlas Elite</h1>
      <p className="text-text-muted text-sm mt-1.5 max-w-md">
        Private spot signals, full trade management, and priority access — $14.99/month. Manual verification, no
        recurring card charges.
      </p>

      <div className="grid sm:grid-cols-2 gap-3 mt-6">
        <div className="card p-4">
          <div className="text-label">Free</div>
          <div className="text-xl font-bold mt-1">$0</div>
          <ul className="mt-2.5 text-sm text-text-muted space-y-1.5 list-disc list-inside">
            <li>Public trade feed</li>
            <li>Public Telegram group</li>
            <li>Public WhatsApp group</li>
            <li>Market Radar</li>
            <li>AI Analyzer — 2/day</li>
            <li>Trade Plan, Risk calculator, Journal</li>
          </ul>
        </div>
        <div className="card card-accent p-4">
          <div className="text-label text-gold">Atlas Elite</div>
          <div className="text-xl font-bold mt-1">
            $14.99<span className="text-sm text-text-muted font-normal">/mo</span>
          </div>
          <ul className="mt-2.5 text-sm text-text-muted space-y-1.5 list-disc list-inside marker:text-gold">
            <li>Everything in Free</li>
            <li>AI Analyzer — 20/day</li>
            <li>Private spot signals, earlier access</li>
            <li>TP1/TP2/TP3 + stop-loss updates</li>
            <li>Full trade management</li>
            <li>Private Telegram group, Atlas Bot alerts</li>
          </ul>
        </div>
      </div>

      {!isLoaded ? null : !isSignedIn ? (
        <div className="card p-5 mt-6 text-center">
          <p className="text-sm text-text-muted">Sign in to submit an Atlas Elite payment request.</p>
          <Link href="/sign-in" className="btn-primary mt-3 inline-flex">
            Sign in
          </Link>
        </div>
      ) : (
        <>
          <label className="text-label block mt-6 mb-2">Choose a payment method</label>
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(METHOD_DETAILS) as Method[]).map((key) => {
              const m = METHOD_DETAILS[key];
              const active = method === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMethod(key)}
                  className={
                    "text-left rounded-2xl border p-4 transition-colors " +
                    (active ? "border-gold bg-gold/6" : "border-line bg-surface hover:border-text-muted")
                  }
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
                      style={{ backgroundColor: m.badgeColor }}
                    >
                      {m.badgeLabel}
                    </span>
                    <span className="font-medium text-sm">{key === "usdt" ? "USDT (TRC20)" : m.title}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="card p-5 mt-4">
            <div className="font-medium mb-3">{detail.title}</div>
            {detail.rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 py-2.5 border-b border-line last:border-b-0">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-text-muted">{row.label}</div>
                  <div className="font-data text-sm break-all">{row.value}</div>
                </div>
                <CopyButton value={row.value} />
              </div>
            ))}
            {detail.note && <p className="text-[11px] text-bear mt-3">⚠ {detail.note}</p>}
          </div>

          <div className="card p-5 mt-4">
            <div className="font-medium mb-3">Submit your payment</div>
            <div className="mb-3">
              <label className="text-label block mb-1.5">Amount sent</label>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 14.99 USDT"
                className="input"
              />
            </div>
            <div className="mb-3">
              <label className="text-label block mb-1.5">Telegram username</label>
              <input
                type="text"
                value={telegramUsername}
                onChange={(e) => setTelegramUsername(e.target.value)}
                placeholder="@yourusername"
                className="input"
              />
            </div>
            <div className="mb-3">
              <label className="text-label block mb-1.5">Payment screenshot</label>
              <label className="block border border-dashed border-line rounded-lg p-4 text-center text-sm text-text-muted cursor-pointer hover:border-gold transition-colors">
                {file ? file.name : "Tap to upload a screenshot of your payment"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            {result === "error" && <p className="text-bear text-sm mb-3">{errorMsg}</p>}
            {result === "success" && (
              <p className="text-bull text-sm mb-3">
                Submitted — status: pending. We'll review it and update your account once verified.
              </p>
            )}

            <button type="button" onClick={handleSubmit} disabled={submitting} className="btn-primary w-full">
              {submitting ? "Submitting..." : "Submit for verification"}
            </button>
          </div>

          {latestRequest?.status === "approved" && (
            <p className="text-bull text-sm mt-4">🎉 Your payment was approved — you're on Atlas Elite.</p>
          )}
          {latestRequest?.status === "rejected" && (
            <p className="text-bear text-sm mt-4">
              Your last payment request was rejected. Please contact support or submit a new one.
            </p>
          )}

          <StatusTracker status={latestRequest?.status ?? null} />
        </>
      )}
    </main>
  );
}
