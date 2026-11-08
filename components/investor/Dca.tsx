"use client";
import { useState } from "react";
import { DcaPlan, Frequency, InvestorDoc } from "@/lib/investor/model";
import { planProgress } from "@/lib/investor/dca";
import type { PriceMap } from "@/lib/investor/calc";
import { CoinLogo } from "@/components/market/MarketBits";
import { useLanguage } from "@/lib/i18n";
import AssetPicker from "./AssetPicker";
import type { PurchaseDraft } from "./Ledger";
import { fill, newId, parseNum, price, today, usd } from "./fmt";

type Run = (m: (d: InvestorDoc) => InvestorDoc) => Promise<boolean>;
const lab = "block text-sm font-medium mb-1";
const hint = "mt-1 block text-[11px] leading-snug text-text-muted font-normal";

function PlanForm({ prices, run, onDone }: { prices: PriceMap; run: Run; onDone: () => void }) {
  const { t } = useLanguage();
  const [f, setF] = useState({ name: "", asset: "", budget: "", initial: "0", amount: "", freq: "monthly" as Frequency, start: today(), count: "12", ref: "" });
  const [dips, setDips] = useState<{ pct: string; amount: string }[]>([]);
  const [err, setErr] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const live = f.asset ? prices[f.asset]?.price : undefined;
  const budgetNum = parseNum(f.budget), amountNum = parseNum(f.amount), countNum = Number(f.count), refNum = parseNum(f.ref);
  const recurringTotal = amountNum > 0 && Number.isInteger(countNum) && countNum > 0 ? amountNum * countNum : 0;
  const plannedAll = (parseNum(f.initial) > 0 ? parseNum(f.initial) : 0) + recurringTotal + dips.reduce((a, d) => a + (parseNum(d.amount) > 0 ? parseNum(d.amount) : 0), 0);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const budget = parseNum(f.budget), initial = parseNum(f.initial || "0"), amount = parseNum(f.amount || "0"), count = Number(f.count || "0"), ref = parseNum(f.ref);
    const dipList = dips.map((d) => ({ dropPct: parseNum(d.pct), amount: parseNum(d.amount) }));
    const ok = f.name.trim() && f.asset && budget > 0 && initial >= 0 && amount >= 0 && Number.isInteger(count) && count >= 0 && ref > 0 && /^\d{4}-\d{2}-\d{2}$/.test(f.start) &&
      dipList.every((d) => d.dropPct > 0 && d.dropPct < 100 && d.amount > 0);
    if (!ok) return setErr(true);
    const plan: DcaPlan = { id: newId(), name: f.name.trim().slice(0, 60), asset: f.asset, budget, initial, recurring: { amount, frequency: f.freq, startDate: f.start, count }, dips: dipList, refPrice: ref, createdAt: new Date().toISOString() };
    if (await run((d) => ({ ...d, plans: [...d.plans, plan] }))) onDone();
  };
  return (
    <form onSubmit={submit} className="card p-4 space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={lab}>{t("investor.planName")}<input maxLength={60} className="input mt-1 w-full" value={f.name} onChange={set("name")} /></label>
        <div><label htmlFor="plan-asset" className={lab}>{t("investor.fAsset")}</label><AssetPicker id="plan-asset" value={f.asset} onChange={(a) => setF({ ...f, asset: a })} /></div>
        <label className={lab}>{t("investor.planBudget")}<input dir="ltr" inputMode="decimal" className="input mt-1 w-full" value={f.budget} onChange={set("budget")} /><span className={hint}>{t("investor.hBudget")}</span></label>
        <label className={lab}>{t("investor.planInitial")}<input dir="ltr" inputMode="decimal" className="input mt-1 w-full" value={f.initial} onChange={set("initial")} /><span className={hint}>{t("investor.hInitial")}</span></label>
        <label className={lab}>{t("investor.planRecurring")}<input dir="ltr" inputMode="decimal" className="input mt-1 w-full" value={f.amount} onChange={set("amount")} /><span className={hint}>{t("investor.hRecurring")}</span></label>
        <label className={lab}>{t("investor.planFreq")}
          <select className="input mt-1 w-full" value={f.freq} onChange={set("freq")}>
            <option value="weekly">{t("investor.weekly")}</option><option value="biweekly">{t("investor.biweekly")}</option><option value="monthly">{t("investor.monthly")}</option>
          </select><span className={hint}>{t("investor.hFreq")}</span></label>
        <label className={lab}>{t("investor.planStart")}<input type="date" className="input mt-1 w-full" value={f.start} onChange={set("start")} /><span className={hint}>{t("investor.hStart")}</span></label>
        <div>
          <label className={lab}>{t("investor.planCount")}<input dir="ltr" inputMode="numeric" className="input mt-1 w-full" value={f.count} onChange={set("count")} /></label>
          <span className={hint}>{t("investor.hCount")}</span>
          {recurringTotal > 0 && <span className="mt-1 block text-xs text-gold">{fill(t("investor.recurringTotal"), { amount: usd(recurringTotal), each: usd(amountNum), count: countNum })}</span>}
        </div>
        <div className="sm:col-span-2">
          <label className={lab}>{t("investor.refPrice")}<input dir="ltr" inputMode="decimal" className="input mt-1 w-full" value={f.ref} onChange={set("ref")} /></label>
          <span className={hint}>{t("investor.hRef")}</span>
          {live && <button type="button" className="mt-1 text-xs text-gold underline" onClick={() => setF({ ...f, ref: String(live) })}>{t("investor.useLive")} ({price(live)})</button>}
        </div>
      </div>
      <div>
        <div className="text-sm font-medium">{t("investor.planDips")}</div>
        <p className={hint}>{t("investor.hDips")}</p>
        {dips.map((d, i) => {
          const pctN = parseNum(d.pct);
          return (
            <div key={i} className="mt-2 flex flex-wrap items-center gap-2">
              <input dir="ltr" inputMode="decimal" aria-label={t("investor.dropPct")} placeholder={t("investor.dropPct")} className="input" style={{ width: "7rem" }} value={d.pct} onChange={(e) => setDips(dips.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} />
              <input dir="ltr" inputMode="decimal" aria-label={t("investor.dipAmount")} placeholder={t("investor.dipAmount")} className="input" style={{ width: "9rem" }} value={d.amount} onChange={(e) => setDips(dips.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
              {refNum > 0 && pctN > 0 && pctN < 100 && <span className="text-xs text-gold">{fill(t("investor.dipLevel"), { pct: pctN, price: price(refNum * (1 - pctN / 100)) })}</span>}
              <button type="button" className="text-xs text-text-muted underline" onClick={() => setDips(dips.filter((_, j) => j !== i))}>{t("investor.delete")}</button>
            </div>
          );
        })}
        {dips.length < 10 && <button type="button" className="mt-2 btn-secondary" onClick={() => setDips([...dips, { pct: "", amount: "" }])}>{t("investor.addDip")}</button>}
        {dips.length > 0 && <p className={hint}>{t("investor.hDropPct")}</p>}
      </div>
      {budgetNum > 0 && <p className={`text-sm ${plannedAll > budgetNum ? "text-gold" : "text-text-muted"}`}>{fill(t("investor.plannedVsBudget"), { planned: usd(plannedAll), budget: usd(budgetNum) })}</p>}
      <div className="flex items-center gap-3">
        {err && <span role="alert" className="text-sm text-bear">{t("investor.planErrBudget")}</span>}
        <span className="flex-1" />
        <button type="button" className="btn-secondary" onClick={onDone}>{t("investor.cancel")}</button>
        <button type="submit" className="btn-primary">{t("investor.createPlan")}</button>
      </div>
    </form>
  );
}

const STATUS_KEY = { done: "stDone", due: "stDue", upcoming: "stUpcoming", triggered: "stTriggered", waiting: "stWaiting" } as const;

function PlanCard({ plan, doc, prices, run, onRecord }: { plan: DcaPlan; doc: InvestorDoc; prices: PriceMap; run: Run; onRecord: (d: PurchaseDraft) => void }) {
  const { t } = useLanguage();
  const livePrice = prices[plan.asset]?.price ?? null;
  const pr = planProgress(plan, doc.purchases, today(), livePrice);
  const pctDone = pr.totalCount ? (pr.doneCount / pr.totalCount) * 100 : 0;
  return (
    <section className="card p-4 space-y-4">
      <div className="flex items-center gap-3">
        <CoinLogo base={plan.asset} size={30} />
        <div className="flex-1 min-w-0"><div className="font-semibold truncate">{plan.name}</div><div dir="ltr" className="font-data text-xs text-text-muted text-start">{plan.asset}</div></div>
        <button type="button" className="text-xs text-text-muted underline" onClick={() => { if (window.confirm(t("investor.deletePlanConfirm"))) run((d) => ({ ...d, plans: d.plans.filter((p) => p.id !== plan.id) })); }}>{t("investor.deletePlan")}</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        {([["planBudget", plan.budget], ["spent", pr.spent], ["remaining", pr.remaining], ["planned", pr.committed]] as const).map(([k, v]) => (
          <div key={k}><div className="text-xs text-text-muted">{t(k === "planBudget" ? "investor.planBudget" : `investor.${k}`)}</div><div dir="ltr" className={`font-data ${k === "remaining" && v < 0 ? "text-bear" : ""}`}>{usd(v)}</div></div>
        ))}
      </div>
      <div>
        <div className="h-2 w-full rounded-full bg-surface-raised overflow-hidden" dir="ltr" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pctDone)}><div className="h-full bg-gold" style={{ width: `${pctDone}%` }} /></div>
        <div className="mt-1 text-xs text-text-muted">{fill(t("investor.progress"), { done: pr.doneCount, total: pr.totalCount })}</div>
      </div>
      {pr.overCommitted && <p role="alert" className="text-sm text-gold">{t("investor.overCommitted")}</p>}
      <div>
        <h3 className="text-label text-text-muted">{t("investor.schedule")}</h3>
        <ul className="mt-1 divide-y divide-line">
          {pr.slots.map((s) => (
            <li key={s.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
              <span className="min-w-40">
                {s.kind === "initial" ? t("investor.slotInitial") : s.kind === "recurring" ? fill(t("investor.slotRecurring"), { n: s.key.slice(1) }) : fill(t("investor.slotDip"), { pct: s.dropPct ?? 0 })}
                {s.kind === "dip" && s.triggerPrice !== null && <span className="block text-[11px] text-text-muted">{fill(t("investor.triggerAt"), { price: price(s.triggerPrice) })}</span>}
              </span>
              <span dir="ltr" className="font-data text-xs text-text-muted w-24">{s.date ?? ""}</span>
              <span dir="ltr" className="font-data">{usd(s.amount)}</span>
              <span className={`tag ${s.status === "done" || s.status === "triggered" ? "tag-bull" : ""}`}>{t(`investor.${STATUS_KEY[s.status]}`)}</span>
              <span className="flex-1" />
              {s.status !== "done" && <button type="button" className="btn-secondary" onClick={() => onRecord({ asset: plan.asset, amount: s.amount, planId: plan.id, slot: s.key })}>{t("investor.record")}</button>}
            </li>
          ))}
        </ul>
      </div>
      {pr.history.length > 0 && (
        <div>
          <h3 className="text-label text-text-muted">{t("investor.planHistory")}</h3>
          <ul className="mt-1 text-sm divide-y divide-line">
            {pr.history.map((p) => <li key={p.id} className="flex gap-4 py-1.5"><span dir="ltr" className="font-data text-xs text-text-muted w-24">{p.date}</span><span dir="ltr" className="font-data">{usd(p.qty * p.price + p.fee)}</span></li>)}
          </ul>
        </div>
      )}
    </section>
  );
}

export default function Dca({ doc, prices, run, onRecord }: { doc: InvestorDoc; prices: PriceMap; run: Run; onRecord: (d: PurchaseDraft) => void }) {
  const { t } = useLanguage();
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-5">
      <p className="text-sm text-text-muted">{t("investor.dcaIntro")}</p>
      {creating ? <PlanForm prices={prices} run={run} onDone={() => setCreating(false)} /> : <button type="button" className="btn-primary" onClick={() => setCreating(true)}>{t("investor.newPlan")}</button>}
      {doc.plans.length === 0 && !creating && <p className="card p-6 text-sm text-text-muted">{t("investor.noPlans")}</p>}
      {doc.plans.map((p) => <PlanCard key={p.id} plan={p} doc={doc} prices={prices} run={run} onRecord={onRecord} />)}
    </div>
  );
}
