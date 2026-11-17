"use client";

// OWNER-PUBLISH-v1: owner-only "Publish to Feed". The button is only SHOWN to the owner (display); the server route
// (POST /api/admin/signals/quick-publish) re-checks the owner, the setup and the audience on every request.
import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { useIsOwner } from "@/lib/useIsOwner";
import { validateSpotSetup, type PublishSource } from "@/lib/ownerPublish";

type Tier = "free" | "elite";

const checkedReason = (tpl: string, reason: string) => tpl.replace("{reason}", reason);

export default function PublishToFeedButton({ setup, source, className = "btn-secondary", disabled = false, showWhenInvalid = false }: { setup: Record<string, unknown>; source: PublishSource; className?: string; disabled?: boolean; showWhenInvalid?: boolean }) {
  const { t } = useLanguage();
  const owner = useIsOwner();
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<Tier | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const checked = validateSpotSetup(setup);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && !busy && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, busy]);

  // Hidden for everyone but the owner. A setup the server would refuse is hidden too, unless the caller (the Trade Plan) asks
  // to keep the button visible for the owner: then it is shown disabled with the reason, never silently removed.
  if (!owner) return null;
  if (!checked.ok) {
    if (!showWhenInvalid) return null;
    return (
      <div className="flex flex-col gap-1">
        <button type="button" disabled data-publish-invalid className={`${className} opacity-60 cursor-not-allowed`}>{t("tradePlan.publishToFeed")}</button>
        <p role="status" className="max-w-xs text-xs text-text-muted">{checkedReason(t("pubFeed.errInvalid"), checked.error)}</p>
      </div>
    );
  }
  const v = checked.value;
  const label = (x: Tier) => t(x === "free" ? "pubFeed.free" : "pubFeed.elite");
  const fill = (s: string, vars: Record<string, string>) => Object.entries(vars).reduce((a, [k, val]) => a.replace(`{${k}}`, val), s);

  async function confirm() {
    if (!tier || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/signals/quick-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v, tier, source, confirm: true }),
      });
      if (res.ok) {
        setMsg({ ok: true, text: fill(t("pubFeed.done"), { tier: label(tier) }) });
        setOpen(false);
      } else {
        const d = await res.json().catch(() => ({}));
        const text = res.status === 409 ? t("pubFeed.errDuplicate") : res.status === 400 && typeof d?.error === "string" ? fill(t("pubFeed.errInvalid"), { reason: d.error }) : res.status === 404 || res.status === 403 ? t("pubFeed.errAuth") : t("pubFeed.errGeneric");
        setMsg({ ok: false, text });
      }
    } catch {
      setMsg({ ok: false, text: t("pubFeed.errGeneric") });
    } finally {
      setBusy(false);
    }
  }

  const option = (x: Tier) => (
    <label key={x} className={`block cursor-pointer rounded-xl border p-3 ${tier === x ? "border-gold bg-gold/10" : "border-line"}`}>
      <input type="radio" name="pubfeed-tier" className="sr-only" checked={tier === x} onChange={() => setTier(x)} />
      <span className="font-semibold">{label(x)}</span>
      <span className="mt-0.5 block text-xs text-text-muted">{t(x === "free" ? "pubFeed.freeNote" : "pubFeed.eliteNote")}</span>
    </label>
  );

  return (
    <>
      <button type="button" disabled={disabled} onClick={() => { setTier(null); setMsg(null); setOpen(true); }} className={className}>
        {t("tradePlan.publishToFeed")}
      </button>
      {msg && <p role="status" className={`mt-2 text-sm ${msg.ok ? "text-bull" : "text-bear"}`}>{msg.text}</p>}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-6" onClick={() => !busy && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label={t("pubFeed.title")} onClick={(e) => e.stopPropagation()} className="card w-full sm:max-w-md max-h-[92vh] overflow-y-auto p-5 sm:p-6 rounded-b-none sm:rounded-b-[inherit]">
            <div className="text-label">{v.pair}{v.timeframe ? ` · ${v.timeframe}` : ""}</div>
            <h2 className="mt-1 text-xl font-bold">{t("pubFeed.title")}</h2>
            <p className="mt-1 text-sm text-text-muted">{t("pubFeed.body")}</p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm" dir="ltr">
              <dt className="text-text-muted">{t("pubFeed.entry")}</dt><dd className="font-data">{v.entryZone}</dd>
              <dt className="text-text-muted">{t("pubFeed.stop")}</dt><dd className="font-data">{v.invalidation}</dd>
              <dt className="text-text-muted">{t("pubFeed.targets")}</dt><dd className="font-data">{[v.tp1, v.tp2, v.tp3].filter(Boolean).join(" · ")}</dd>
            </dl>
            <div className="mt-4 text-label">{t("pubFeed.audience")}</div>
            <div className="mt-2 grid gap-2" role="radiogroup" aria-label={t("pubFeed.audience")}>{option("free")}{option("elite")}</div>
            <p className="mt-3 text-sm font-semibold" aria-live="polite">{tier ? fill(t("pubFeed.selected"), { tier: label(tier) }) : <span className="text-text-muted font-normal">{t("pubFeed.choose")}</span>}</p>
            {msg && !msg.ok && <p role="alert" className="mt-2 text-sm text-bear">{msg.text}</p>}
            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" disabled={!tier || busy} onClick={confirm} className="btn-primary disabled:opacity-60">{busy ? t("pubFeed.publishing") : tier ? fill(t("pubFeed.confirm"), { tier: label(tier) }) : t("tradePlan.publishToFeed")}</button>
              <button type="button" disabled={busy} onClick={() => setOpen(false)} className="btn-secondary">{t("pubFeed.cancel")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
