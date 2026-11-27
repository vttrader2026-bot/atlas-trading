"use client";
// ATLAS INVESTOR: one form for purchases and sales. Fees are calculated automatically (Binance Taker, optional BNB discount).
import { withPlanPurchase } from "@/lib/investor/dca";
import { useEffect, useState } from "react";
import { InvestorDoc, Purchase, Quote, Sale, r8 } from "@/lib/investor/model";
import { previewSale } from "@/lib/investor/calc";
import { calcFee, feeRatePct, formatRate } from "@/lib/investor/fees";
import { useLanguage } from "@/lib/i18n";
import AssetPicker from "./AssetPicker";
import { UsdtNote } from "./currency";
import { evaluateTrade, numText, type FieldCode } from "@/lib/investor/numInput";
import { fill, newId, parseNum, qty as fmtQty, signedUsd, today, tone, usd } from "./fmt";

type Run = (m: (d: InvestorDoc) => InvestorDoc) => Promise<boolean>;
export type TradeInit = { kind: "buy" | "sell"; id?: string; asset?: string; date?: string; qty?: string; price?: string; fee?: number; quote?: Quote; note?: string; planId?: string; slot?: string };

const lab = "block text-sm font-medium mb-1";
const hint = "mt-1 block text-[11px] leading-snug text-text-muted font-normal";
const QUICK = [25, 50, 75, 100] as const;

export default function TradeForm({ init, doc, run, onClose }: { init: TradeInit; doc: InvestorDoc; run: Run; onClose: () => void }) {
  const { t } = useLanguage();
  const bnb = doc.bnbDiscount;
  const [asset, setAsset] = useState(init.asset ?? "");
  const [date, setDate] = useState(init.date ?? today());
  const [qtyText, setQtyText] = useState(init.qty ?? "");
  const [priceText, setPriceText] = useState(init.price ?? "");
  const [quote, setQuote] = useState<Quote>(init.quote ?? "USDT");
  const [note, setNote] = useState(init.note ?? "");
  const auto = calcFee(parseNum(qtyText), parseNum(priceText), quote, bnb);
  // A record whose saved fee differs from the automatic one (older entries) keeps its own fee until the user switches back.
  const [manual, setManual] = useState(() => init.fee !== undefined && Math.abs(init.fee - calcFee(parseNum(init.qty ?? ""), parseNum(init.price ?? ""), init.quote ?? "USDT", bnb)) > 1e-6);
  const [feeText, setFeeText] = useState(init.fee !== undefined ? numText(init.fee) : "");
  const [err, setErr] = useState(false);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const sell = init.kind === "sell";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The numbers alone decide the total/fee preview; asset and date only gate saving.
  const { q, p, fee, numsOk, errors, valid, total } = evaluateTrade({ sell, asset, date, qtyText, priceText, manual, feeText, quote, bnb });
  // Per-field messages: after a save attempt, or immediately for text that is not a number at all.
  const msgKey: Record<FieldCode, string> = { asset: "investor.errAsset", date: "investor.errDate", required: "investor.errRequired", number: "investor.errNumber", positive: "investor.errPositive", negative: "investor.errNegative" };
  const fieldErr = (k: keyof typeof errors, text?: string) => {
    const c = errors[k];
    if (!c) return null;
    return tried || (text !== undefined && text.trim() !== "" && c === "number") ? t(msgKey[c]) : null;
  };
  const eAsset = fieldErr("asset"), eDate = fieldErr("date"), eQty = fieldErr("qty", qtyText), ePrice = fieldErr("price", priceText), eFee = fieldErr("fee", feeText);
  const errLine = (id: string, m: string | null) => (m ? <span id={id} role="alert" className="mt-1 block text-[11px] leading-snug text-bear">{m}</span> : null);
  const others = { purchases: doc.purchases, sales: doc.sales.filter((s) => s.id !== init.id) };
  const pv = sell && asset && valid ? previewSale(others, asset, date, q, p, fee) : null;
  const heldNow = sell && asset ? previewSale(others, asset, date, 0, 0, 0).held : 0;
  const tooMuch = !!pv?.exceeds;

  const setPct = (pct: number) => setQtyText(numText(pct === 100 ? heldNow : r8((heldNow * pct) / 100)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || tooMuch) { setTried(true); return setErr(true); }
    setErr(false);
    setSaving(true);
    const base = { id: init.id ?? newId(), asset, date, qty: q, price: p, fee: r8(fee), quote, ...(note.trim() ? { note: note.trim() } : {}) };
    const done = await run((d) => {
      if (sell) return { ...d, sales: upsert(d.sales, base as Sale) };
      // DCA: one plan slot = one purchase (see withPlanPurchase).
      return { ...d, purchases: withPlanPurchase(d.purchases, { ...base, ...(init.planId ? { planId: init.planId } : {}), ...(init.slot ? { slot: init.slot } : {}) } as Purchase) };
    });
    setSaving(false);
    if (done) onClose();
  };

  return (
    <form onSubmit={submit} className="card p-4 space-y-4" aria-label={sell ? t("investor.addSale") : t("investor.addPurchase")}>
      <h2 className="text-lg font-semibold">{sell ? (asset ? fill(t("investor.sellTitle"), { asset }) : t("investor.addSale")) : t("investor.addPurchase")}</h2>
      <UsdtNote />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="inv-asset" className={lab}>{t("investor.fAsset")}</label>
          <AssetPicker id="inv-asset" value={asset} onChange={setAsset} />
          {errLine("inv-err-asset", eAsset)}
          {sell && asset && <span className={hint}>{heldNow > 0 ? fill(t("investor.sellHeld"), { qty: fmtQty(heldNow), asset }) : fill(t("investor.sellNoHeld"), { asset })}</span>}
        </div>
        <label className={lab}>{t("investor.fDate")}
          <input type="date" className="input mt-1 w-full aria-invalid:border-bear" aria-invalid={!!eDate} aria-describedby={eDate ? "inv-err-date" : undefined} value={date} onChange={(e) => setDate(e.target.value)} />
          <span className={hint}>{t("investor.hDate")}</span>
          {errLine("inv-err-date", eDate)}
        </label>
        <div>
          <label className={lab}>{t("investor.fQty")}
            <input dir="ltr" inputMode="decimal" autoComplete="off" autoCorrect="off" spellCheck={false} className="input mt-1 w-full aria-invalid:border-bear" aria-invalid={!!eQty} aria-describedby={eQty ? "inv-err-qty" : undefined} value={qtyText} onChange={(e) => setQtyText(e.target.value)} />
          </label>
          <span className={hint}>{sell ? t("investor.hSellQty") : t("investor.hQty")}</span>
          {errLine("inv-err-qty", eQty)}
          {sell && asset && heldNow > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label={t("investor.quick")}>
              <span className="text-[11px] text-text-muted">{t("investor.quick")}</span>
              {QUICK.map((pct) => (
                <button key={pct} type="button" className="btn-secondary !px-3 !py-1 text-xs" onClick={() => setPct(pct)}>{pct}%</button>
              ))}
            </div>
          )}
        </div>
        <label className={lab}>{t("investor.fPrice")}
          <input dir="ltr" inputMode="decimal" autoComplete="off" autoCorrect="off" spellCheck={false} className="input mt-1 w-full aria-invalid:border-bear" aria-invalid={!!ePrice} aria-describedby={ePrice ? "inv-err-price" : undefined} value={priceText} onChange={(e) => setPriceText(e.target.value)} />
          <span className={hint}>{sell ? t("investor.hPriceSell") : t("investor.hPriceBuy")}</span>
          {errLine("inv-err-price", ePrice)}
        </label>
      </div>

      <div className="rounded-lg border border-line p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div role="group" aria-label={t("investor.quote")} className="flex items-center gap-1">
            <span className="text-xs text-text-muted me-1">{t("investor.quote")}</span>
            {(["USDT", "USDC"] as const).map((c) => (
              <button key={c} type="button" aria-pressed={quote === c} onClick={() => setQuote(c)}
                className={`px-3 py-1 rounded-md text-xs border ${quote === c ? "border-gold text-gold" : "border-line text-text-muted"}`}>{c}</button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" role="switch" checked={bnb} onChange={() => run((d) => ({ ...d, bnbDiscount: !d.bnbDiscount }))} className="h-4 w-4 accent-[var(--gold)]" />
            {t("investor.bnbSwitch")}
          </label>
        </div>
        <p className="text-[11px] leading-snug text-text-muted">{t("investor.bnbHint")}</p>
        <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
          <span>{manual ? t("investor.fFee") : t("investor.feeAuto")}:</span>
          <b dir="ltr" className="font-data">{numsOk ? usd(fee) : "—"}</b>
          {!manual && <span className="text-xs text-text-muted">{fill(t("investor.feeRate"), { rate: formatRate(feeRatePct(quote, bnb)) })}</span>}
        </div>
        <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
          <input type="checkbox" checked={manual} onChange={(e) => { setManual(e.target.checked); if (e.target.checked && !feeText) setFeeText(auto ? numText(auto) : ""); }} />
          {t("investor.feeManual")}
        </label>
        {manual && (
          <div>
            <input dir="ltr" inputMode="decimal" autoComplete="off" autoCorrect="off" spellCheck={false} aria-label={t("investor.fFee")} aria-invalid={!!eFee} aria-describedby={eFee ? "inv-err-fee" : undefined} className="input aria-invalid:border-bear" style={{ width: "10rem" }} value={feeText} onChange={(e) => setFeeText(e.target.value)} />
            {errLine("inv-err-fee", eFee)}
            <span className={hint}>{t("investor.feeManualHint")}</span>
          </div>
        )}
      </div>

      <label className={lab}>{t("investor.fNote")}
        <input maxLength={200} className="input mt-1 w-full" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      <div className="rounded-lg bg-surface-raised p-3 text-sm space-y-1" aria-live="polite">
        <div className="flex justify-between gap-4"><span>{sell ? t("investor.proceeds") : t("investor.totalCost")}</span><b dir="ltr" className="font-data">{total === null ? "—" : usd(total)}</b></div>
        {sell && (
          <>
            <div className="flex justify-between gap-4"><span className="text-text-muted">{t("investor.costSold")}</span><span dir="ltr" className="font-data">{pv ? usd(pv.removedCost) : "—"}</span></div>
            <div className="flex justify-between gap-4"><span className="font-medium">{t("investor.realizedSale")}</span><b dir="ltr" className={`font-data ${tone(pv?.realized ?? null)}`}>{pv ? signedUsd(pv.realized) : "—"}</b></div>
          </>
        )}
      </div>

      {tooMuch && pv && <p role="alert" className="text-sm text-bear">{fill(t("investor.sellTooMuch"), { qty: fmtQty(pv.held), asset })}</p>}
      {err && !valid && !tooMuch && <p role="alert" className="text-sm text-bear">{t("investor.invalid")}</p>}
      <div className="flex justify-end gap-3">
        <button type="button" className="btn-secondary" onClick={onClose}>{t("investor.cancel")}</button>
        <button type="submit" className="btn-primary" disabled={saving}>{t("investor.save")}</button>
      </div>
    </form>
  );
}

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
}
