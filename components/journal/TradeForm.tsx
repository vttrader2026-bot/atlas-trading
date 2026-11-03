"use client";

import { useId, useState } from "react";
import { Trade, TradeIssueField, validateTrade } from "@/lib/journal";
import { parseInput } from "@/lib/riskCalc";
import { plain, todayLocal } from "./format";

type F = {
  pair: string; date: string; entry: string; stop: string; tp1: string; tp2: string; tp3: string;
  invested: string; size: string; fees: string; status: "open" | "closed"; exit: string; exitDate: string;
  strategy: string; entryReason: string; notes: string; lessons: string; markPrice: string;
};

export function tradeToForm(t: Trade | null): F {
  if (!t) {
    return { pair: "", date: todayLocal(), entry: "", stop: "", tp1: "", tp2: "", tp3: "", invested: "", size: "", fees: "", status: "open", exit: "", exitDate: "", strategy: "", entryReason: "", notes: "", lessons: "", markPrice: "" };
  }
  const closed = t.status === "closed" || (t.status === undefined && t.exit !== null);
  return {
    pair: t.pair, date: t.date, entry: plain(t.entry), stop: t.stop ? plain(t.stop) : "",
    tp1: plain(t.tp1 ?? (t.target || null)), tp2: plain(t.tp2), tp3: plain(t.tp3),
    invested: plain(t.invested ?? (t.entry && t.size ? t.entry * t.size : null)), size: plain(t.size), fees: plain(t.fees),
    status: closed ? "closed" : "open", exit: plain(t.exit), exitDate: t.exitDate ?? "",
    strategy: t.strategy ?? "", entryReason: t.entryReason ?? "", notes: t.notes ?? "", lessons: t.lessons ?? "", markPrice: plain(t.markPrice),
  };
}

const optNum = (s: string): number | null => (s.trim() === "" ? null : parseInput(s));
const reqNum = (s: string): number => parseInput(s) ?? 0;

/** Form -> Trade. Unknown/legacy fields of `base` are preserved. Invalid text becomes NaN-free values the validator rejects. */
export function formToTrade(f: F, base: Trade | null, id: string): Trade {
  const bad = (s: string) => s.trim() !== "" && parseInput(s) === null;
  const closed = f.status === "closed";
  const tp1 = optNum(f.tp1);
  return {
    ...(base ?? {}),
    id,
    date: f.date,
    pair: f.pair.replace(/[\/\s-]/g, "").toUpperCase(),
    side: base?.side ?? "Long",
    entry: reqNum(f.entry),
    stop: reqNum(f.stop),
    target: tp1 ?? 0,
    exit: closed ? optNum(f.exit) : null,
    size: reqNum(f.size),
    notes: f.notes,
    status: f.status,
    exitDate: closed ? f.exitDate || null : null,
    tp1, tp2: optNum(f.tp2), tp3: optNum(f.tp3),
    invested: bad(f.invested) ? -1 : optNum(f.invested),
    fees: bad(f.fees) ? -1 : optNum(f.fees),
    strategy: f.strategy, entryReason: f.entryReason, lessons: f.lessons,
    markPrice: optNum(f.markPrice),
    source: base?.source ?? "manual",
    updatedAt: Date.now(),
  };
}

const ISSUE_KEY: Record<string, string> = {
  pair: "journal.errPair", date: "journal.errDate", entry: "journal.errEntry", stop: "journal.errStop",
  quantity: "journal.errQuantity", invested: "journal.errInvested", tp: "journal.errTp", tpOrder: "journal.errTpOrder",
  fees: "journal.errFees", exitRequired: "journal.errExitRequired", exitDate: "journal.errExitDate", exitBeforeEntry: "journal.errExitBeforeEntry",
};

export default function TradeForm({
  initial, base, onSave, onCancel, t, title,
}: {
  initial: F; base: Trade | null; onSave: (t: Trade) => void; onCancel: () => void; t: (k: string) => string; title: string;
}) {
  const [f, setF] = useState<F>(initial);
  const [issues, setIssues] = useState<TradeIssueField[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const idBase = useId();

  function set<K extends keyof F>(k: K, v: F[K]) {
    setF((p) => {
      const n = { ...p, [k]: v };
      const entry = parseInput(n.entry);
      // Keep invested <-> quantity linked through the entry price.
      if (k === "invested" && entry) { const inv = parseInput(String(v)); n.size = inv ? plain(inv / entry) : ""; }
      else if (k === "size" && entry) { const q = parseInput(String(v)); n.invested = q ? plain(q * entry) : ""; }
      else if (k === "entry" && entry) {
        const inv = parseInput(n.invested), q = parseInput(n.size);
        if (inv) n.size = plain(inv / entry); else if (q) n.invested = plain(q * entry);
      }
      return n;
    });
    if (submitted) setIssues([]);
  }

  const live = (() => {
    const tr = formToTrade(f, base, base?.id ?? "x");
    return validateTrade(tr);
  })();
  const shown = submitted ? live : [];
  const err = (field: string) => shown.find((i) => i.field === field);
  const errText = (field: string) => { const e = err(field); return e ? t(ISSUE_KEY[e.code]) : undefined; };
  const numBad = (s: string) => s.trim() !== "" && parseInput(s) === null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const tr = formToTrade(f, base, base?.id ?? crypto.randomUUID());
    const found = validateTrade(tr);
    setIssues(found);
    if (found.length === 0 && !["entry", "stop", "tp1", "tp2", "tp3", "size", "exit", "markPrice"].some((k) => numBad(f[k as keyof F] as string))) onSave(tr);
  }

  const field = (k: keyof F, label: string, o: { ph?: string; hint?: string; num?: boolean; type?: string; req?: boolean } = {}) => {
    const id = `${idBase}-${k}`;
    const msg = errText(k === "size" ? "size" : k) ?? (o.num && numBad(f[k] as string) ? t("risk.errNumber") : undefined);
    return (
      <div>
        <label htmlFor={id} className="text-xs text-text-muted">{label}</label>
        <input
          id={id}
          type={o.type}
          value={f[k] as string}
          onChange={(e) => set(k, (k === "pair" ? e.target.value.toUpperCase() : e.target.value) as never)}
          placeholder={o.ph}
          inputMode={o.num ? "decimal" : undefined}
          dir={o.num || o.type === "date" || k === "pair" ? "ltr" : undefined}
          aria-invalid={msg ? true : undefined}
          className={`input mt-1.5 w-full ${o.num ? "font-data" : ""} ${msg ? "!border-bear" : ""}`}
        />
        {msg ? <p className="mt-1 text-xs text-bear">{msg}</p> : o.hint ? <p className="mt-1 text-xs text-text-muted">{o.hint}</p> : null}
      </div>
    );
  };
  const area = (k: "strategy" | "entryReason" | "notes" | "lessons", label: string, ph: string) => (
    <div>
      <label htmlFor={`${idBase}-${k}`} className="text-xs text-text-muted">{label}</label>
      <textarea id={`${idBase}-${k}`} rows={2} value={f[k]} onChange={(e) => set(k, e.target.value)} placeholder={ph} className="input mt-1.5 w-full resize-none" />
    </div>
  );

  return (
    <form onSubmit={submit} noValidate className="card card-accent p-5 sm:p-6 mt-6">
      <div className="text-label mb-4">{title}</div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {field("pair", t("journal.fPair"), { ph: t("journal.phPair") })}
        {field("date", t("journal.fEntryDate"), { type: "date" })}
        {field("entry", t("journal.fEntryPrice"), { num: true })}
        {field("stop", t("journal.fStop"), { num: true })}
        {field("invested", t("journal.fInvested"), { num: true, hint: t("journal.hintInvested") })}
        {field("size", t("journal.fQuantity"), { num: true })}
        {field("fees", t("journal.fFees"), { num: true, hint: t("journal.hintFees") })}
        <div>
          <div className="text-xs text-text-muted">{t("journal.statusLabel")}</div>
          <div role="radiogroup" aria-label={t("journal.statusLabel")} className="mt-1.5 flex rounded-md border border-line overflow-hidden w-fit">
            {(["open", "closed"] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={f.status === s} onClick={() => set("status", s)}
                className={`px-4 py-2 text-sm transition-colors ${f.status === s ? "bg-surface-raised text-text" : "text-text-muted hover:text-text"}`}>
                {s === "open" ? t("journal.statusOpen") : t("journal.statusClosed")}
              </button>
            ))}
          </div>
        </div>
        {field("markPrice", t("journal.fMark"), { num: true, hint: t("journal.hintMark") })}
      </div>

      <div className="mt-5 text-xs text-text-muted">{t("journal.tpHeading")}</div>
      <div className="mt-1 grid sm:grid-cols-3 gap-4">
        {field("tp1", "TP1", { num: true })}
        {field("tp2", "TP2", { num: true })}
        {field("tp3", "TP3", { num: true })}
      </div>

      {f.status === "closed" && (
        <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {field("exit", t("journal.fExitPrice"), { num: true, hint: t("journal.hintExit") })}
          {field("exitDate", t("journal.fExitDate"), { type: "date" })}
        </div>
      )}

      <div className="mt-5 grid sm:grid-cols-2 gap-4">
        {area("strategy", t("journal.fStrategy"), t("journal.phStrategy"))}
        {area("entryReason", t("journal.fEntryReason"), t("journal.phEntryReason"))}
        {area("notes", t("journal.fNotes"), t("journal.phNotes"))}
        {area("lessons", t("journal.fLessons"), t("journal.phLessons"))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="submit" className="btn-primary">{base ? t("journal.saveChanges") : t("journal.save")}</button>
        <button type="button" onClick={onCancel} className="btn-secondary">{t("journal.cancel")}</button>
      </div>
      {issues.length > 0 && <p className="mt-3 text-sm text-bear" role="alert">{t(ISSUE_KEY[issues[0].code])}</p>}
    </form>
  );
}
