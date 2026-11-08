"use client";
// ATLAS INVESTOR V1: loads and saves the user's private investor document.
// The server is the source of truth. Nothing is cached in the browser (privacy on shared devices).
import { useCallback, useEffect, useRef, useState } from "react";
import { emptyDoc, InvestorDoc } from "@/lib/investor/model";

export type CommitResult = { ok: true } | { ok: false; error: "conflict" | "oversell" | "invalid" | "busy" | "save"; detail?: { held?: number; asset?: string } };
export type LoadState = "loading" | "ready" | "error" | "unauth";

export function useInvestor() {
  const [doc, setDoc] = useState<InvestorDoc>(emptyDoc());
  const [state, setState] = useState<LoadState>("loading");
  const [saving, setSaving] = useState(false);
  const ref = useRef(doc);
  const busy = useRef(false);
  const apply = (d: InvestorDoc) => { ref.current = d; setDoc(d); };

  useEffect(() => {
    let alive = true;
    fetch("/api/me/investor", { cache: "no-store" })
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 401) return setState("unauth");
        if (!r.ok) return setState("error");
        apply((await r.json()).doc);
        setState("ready");
      })
      .catch(() => alive && setState("error"));
    return () => { alive = false; };
  }, []);

  /** Applies a change and saves it. The screen only changes once the server has accepted it. */
  const commit = useCallback(async (mutate: (d: InvestorDoc) => InvestorDoc): Promise<CommitResult> => {
    if (busy.current) return { ok: false, error: "busy" };
    busy.current = true;
    setSaving(true);
    try {
      const cur = ref.current;
      const res = await fetch("/api/me/investor", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseRevision: cur.revision, doc: mutate(cur) }) });
      const body = await res.json().catch(() => ({}));
      if (res.ok) { apply(body.doc); return { ok: true }; }
      if (res.status === 409 && body.doc) { apply(body.doc); return { ok: false, error: "conflict" }; }
      if (res.status === 422) return { ok: false, error: "oversell", detail: body.issue };
      if (res.status === 400) return { ok: false, error: "invalid" };
      return { ok: false, error: "save" };
    } catch {
      return { ok: false, error: "save" };
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }, []);

  return { doc, state, saving, commit };
}
