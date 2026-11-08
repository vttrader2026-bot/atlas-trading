"use client";
import { useEffect, useState } from "react";
import { InvestorDoc, Purchase, Sale, CashEntry, purchaseCost, saleProceeds, r8 } from "@/lib/investor/model";
import { CoinLogo } from "@/components/market/MarketBits";
import { useLanguage } from "@/lib/i18n";
import TradeForm, { type TradeInit } from "./TradeForm";
import { newId, parseNum, price, qty as fmtQty, today, usd } from "./fmt";

type Run = (m: (d: InvestorDoc) => InvestorDoc) => Promise<boolean>;
export type PurchaseDraft = { asset: string; amount?: number; price?: number; planId?: string; slot?: string };
const field = "block text-sm font-medium mb-1";

function CashForm({ onCancel, run }: { onCancel: () => void; run: Run }) {
  const { t } = useLanguage();
  const [type, setType] = useState<"deposit" | "withdrawal">("deposit");
  const [date, setDate] = useState(today());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const a = parseNum(amount);
    if (!(a > 0)) return setErr(true);
    const done = await run((d) => ({ ...d, cash: [...d.cash, { id: newId(), date, type, amount: a, ...(note.trim() ? { note: note.trim() } : {}) }] }));
    if (done) onCancel();
  };
  return (
    <form onSubmit={submit} className="card p-4 space-y-3">
      <p className="text-xs text-text-muted">{t("investor.cashNote")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={field}>{t("investor.fType")}
          <select className="input mt-1 w-full" value={type} onChange={(e) => setType(e.target.value as "deposit" | "withdrawal")}>
            <option value="deposit">{t("investor.deposit")}</option><option value="withdrawal">{t("investor.withdrawal")}</option>
          </select></label>
        <label className={field}>{t("investor.fDate")}<input type="date" className="input mt-1 w-full" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className={field}>{t("investor.fAmount")}<input dir="ltr" inputMode="decimal" className="input mt-1 w-full" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        <label className={field}>{t("investor.fNote")}<input maxLength={200} className="input mt-1 w-full" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <div className="flex items-center gap-3">
        {err && <span role="alert" className="text-sm text-bear">{t("investor.invalid")}</span>}
        <span className="flex-1" />
        <button type="button" className="btn-secondary" onClick={onCancel}>{t("investor.cancel")}</button>
        <button type="submit" className="btn-primary">{t("investor.save")}</button>
      </div>
    </form>
  );
}

function Row({ children, onEdit, onDelete }: { children: React.ReactNode; onEdit?: () => void; onDelete: () => void }) {
  const { t } = useLanguage();
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
      {children}
      <span className="flex-1" />
      {onEdit && <button type="button" className="text-xs text-gold underline" onClick={onEdit}>{t("investor.editRecord")}</button>}
      <button type="button" className="text-xs text-text-muted underline" onClick={() => { if (window.confirm(t("investor.confirmDelete"))) onDelete(); }}>{t("investor.delete")}</button>
    </li>
  );
}

export default function Ledger({ doc, run, draft, clearDraft, livePrice }: { doc: InvestorDoc; run: Run; draft: PurchaseDraft | null; clearDraft: () => void; livePrice: (asset: string) => number | null }) {
  const { t } = useLanguage();
  const [form, setForm] = useState<TradeInit | null>(null);
  const [cash, setCash] = useState(false);
  const blank = (kind: "buy"): TradeInit => ({ kind });

  useEffect(() => {
    if (!draft) return;
    const p = draft.price ?? livePrice(draft.asset) ?? undefined;
    const q = p && draft.amount ? String(r8(draft.amount / p)) : "";
    // Prefill from the DCA planner. Opening a form from an external action is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm({ kind: "buy", asset: draft.asset, price: p ? String(p) : "", qty: q, planId: draft.planId, slot: draft.slot });
    setCash(false);
    clearDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const sorted = <T extends { date: string }>(l: T[]) => [...l].sort((a, b) => b.date.localeCompare(a.date));
  const toForm = (kind: "buy" | "sell", x: Purchase | Sale): TradeInit => ({ kind, id: x.id, asset: x.asset, date: x.date, qty: String(x.qty), price: String(x.price), fee: x.fee, quote: x.quote, note: x.note, planId: (x as Purchase).planId, slot: (x as Purchase).slot });
  const open = (f: TradeInit | null, c = false) => { setForm(f); setCash(c); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => open(blank("buy"))}>{t("investor.addPurchase")}</button>
        <button type="button" className="btn-secondary" onClick={() => open(null, true)}>{t("investor.addCash")}</button>
      </div>
      {form && <TradeForm key={form.id ?? form.kind + (form.asset ?? "") + (form.slot ?? "")} init={form} doc={doc} run={run} onClose={() => setForm(null)} />}
      {cash && <CashForm onCancel={() => setCash(false)} run={run} />}

      <section className="card p-4">
        <h2 className="text-label text-text-muted">{t("investor.purchases")}</h2>
        {doc.purchases.length === 0 ? <p className="mt-2 text-sm text-text-muted">{t("investor.noRecords")}</p> : (
          <ul className="mt-1 divide-y divide-line">
            {sorted(doc.purchases).map((p) => (
              <Row key={p.id} onEdit={() => open(toForm("buy", p))} onDelete={() => run((d) => ({ ...d, purchases: d.purchases.filter((x) => x.id !== p.id) }))}>
                <span dir="ltr" className="font-data text-xs text-text-muted w-24">{p.date}</span>
                <span className="flex items-center gap-2 w-28"><CoinLogo base={p.asset} size={20} /><span className="font-data">{p.asset}</span></span>
                <span dir="ltr" className="font-data">{fmtQty(p.qty)} × {price(p.price)}</span>
                <span dir="ltr" className="font-data text-text-muted">{t("investor.totalCost")} {usd(purchaseCost(p))}</span>
                {p.planId && <span className="tag">DCA</span>}
              </Row>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <h2 className="text-label text-text-muted">{t("investor.sales")}</h2>
        <p className="mt-1 text-xs text-text-muted">{t("investor.salesHint")}</p>
        {doc.sales.length === 0 ? <p className="mt-2 text-sm text-text-muted">{t("investor.noRecords")}</p> : (
          <ul className="mt-1 divide-y divide-line">
            {sorted(doc.sales).map((s) => (
              <Row key={s.id} onEdit={() => open(toForm("sell", s))} onDelete={() => run((d) => ({ ...d, sales: d.sales.filter((x) => x.id !== s.id) }))}>
                <span dir="ltr" className="font-data text-xs text-text-muted w-24">{s.date}</span>
                <span className="flex items-center gap-2 w-28"><CoinLogo base={s.asset} size={20} /><span className="font-data">{s.asset}</span></span>
                <span dir="ltr" className="font-data">{fmtQty(s.qty)} × {price(s.price)}</span>
                <span dir="ltr" className="font-data text-text-muted">{t("investor.proceeds")} {usd(saleProceeds(s))}</span>
              </Row>
            ))}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <h2 className="text-label text-text-muted">{t("investor.cashLedger")}</h2>
        {doc.cash.length === 0 ? <p className="mt-2 text-sm text-text-muted">{t("investor.noRecords")}</p> : (
          <ul className="mt-1 divide-y divide-line">
            {sorted<CashEntry>(doc.cash).map((c) => (
              <Row key={c.id} onDelete={() => run((d) => ({ ...d, cash: d.cash.filter((x) => x.id !== c.id) }))}>
                <span dir="ltr" className="font-data text-xs text-text-muted w-24">{c.date}</span>
                <span className="w-28">{c.type === "deposit" ? t("investor.deposit") : t("investor.withdrawal")}</span>
                <span dir="ltr" className={`font-data ${c.type === "deposit" ? "text-bull" : "text-bear"}`}>{c.type === "deposit" ? "+" : "-"}{usd(c.amount)}</span>
                {c.note && <span className="text-text-muted text-xs">{c.note}</span>}
              </Row>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
