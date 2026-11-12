"use client";

import { Suspense, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import EliteRecord from "@/components/elite/EliteRecord";

type Method = "usdt" | "bankily" | "masrivi" | "sedad";
/** ATLAS ELITE is the only paid plan. */
const ELITE_PRICE = { usd: "14.99", mru: "600" };
type RowKey = "wallet" | "network" | "account";

const ROW_LABELS: Record<RowKey, [string, string]> = {
  wallet: ["Wallet Address", "عنوان المحفظة"],
  network: ["Network", "الشبكة"],
  account: ["Account Number", "رقم الحساب"],
};

const METHOD_DETAILS: Record<
  Method,
  {
    titleEn: string;
    titleAr?: string;
    badgeColor?: string;
    badgeLabel?: string;
    logo?: string;
    rows: { key: RowKey; value: string }[];
    noteEn?: string;
    noteAr?: string;
  }
> = {
  usdt: {
    titleEn: "USDT — TRC20 Network",
    titleAr: "USDT — شبكة TRC20",
    badgeColor: "#F7931A",
    badgeLabel: "₮",
    rows: [
      { key: "wallet", value: "TDci1YykFVMF6UfLEB5BdX161rBHwjhdsf" },
      { key: "network", value: "TRC20 — do not send on any other network" },
    ],
    noteEn: "Double-check this address against your Binance app before sending.",
    noteAr: "تحقق من هذا العنوان في تطبيق Binance قبل الإرسال.",
  },
  bankily: {
    titleEn: "Bankily",
    logo: "/logos/bankily.png",
    rows: [{ key: "account", value: "33848396" }],
  },
  masrivi: {
    titleEn: "Masrivi",
    logo: "/logos/masrivi.png",
    rows: [{ key: "account", value: "33848396" }],
  },
  sedad: {
    titleEn: "Sedad",
    logo: "/logos/sedad.png",
    rows: [{ key: "account", value: "33554452" }],
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

function CopyButton({ value, isAr }: { value: string; isAr: boolean }) {
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
      {copied ? (isAr ? "تم النسخ!" : "Copied!") : isAr ? "نسخ" : "Copy"}
    </button>
  );
}

export default function ElitePage() {
  return (
    <Suspense fallback={null}>
      <ElitePageInner />
    </Suspense>
  );
}

function ElitePageInner() {
  const { lang, t } = useLanguage();
  const isAr = lang === "ar";
  /** Inline (en, ar) pair helper — this page isn't wired into lib/i18n.tsx yet, so strings live here for now. */
  const s = (en: string, ar: string) => (isAr ? ar : en);
  const { isSignedIn, isLoaded } = useUser();

  const [method, setMethod] = useState<Method>("usdt");
  const [amount, setAmount] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"success" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit() {
    if (!amount.trim() || !telegramUsername.trim() || !file) {
      setResult("error");
      setErrorMsg(s("Please fill in amount, Telegram username, and upload a screenshot.", "يرجى إدخال المبلغ واسم مستخدم تيليجرام ورفع صورة الدفع."));
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const proof = await fileToCompressedBase64(file);
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "elite", amount, method, proof, telegramUsername }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || s("Submission failed", "فشل الإرسال"));
      }
      setResult("success");
      setAmount("");
      setTelegramUsername("");
      setFile(null);
    } catch (err) {
      setResult("error");
      setErrorMsg(err instanceof Error ? err.message : s("Something went wrong. Please try again.", "حدث خطأ ما. حاول مرة أخرى."));
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
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-3">
        {t("eliteSection.heading")}
      </h1>
      <p className="text-text-muted text-sm mt-1.5 max-w-md">{t("eliteSection.subtitle")}</p>
      <p className="text-text-muted text-xs mt-1.5 max-w-md">
        {s("Manual verification, no recurring card charges.", "تحقق يدوي، بدون رسوم بطاقة متكررة.")}
      </p>

      <div className="grid sm:grid-cols-2 gap-3 mt-6">
        <div className="card p-4">
          <div className="text-label">{s("Free", "مجاني")}</div>
          <div className="text-xl font-bold mt-1">$0</div>
          <ul className="mt-2.5 text-sm text-text-muted space-y-1.5 list-disc list-inside">
            <li>{s("Public trade feed", "خلاصة الصفقات العامة")}</li>
            <li>{s("Market Radar + charts", "رادار السوق + الرسوم البيانية")}</li>
            <li>{s("AI Analyzer — 3/day", "المحلل بالذكاء الاصطناعي — 3/يوم")}</li>
            <li>{s("Trade Plan, Risk calculator, Journal", "خطة الصفقة، حاسبة المخاطر، السجل")}</li>
            <li>{s("Watchlist — 10 coins", "قائمة المراقبة — 10 عملات")}</li>
          </ul>
        </div>
        <div className="card card-accent p-4 text-left ring-1 ring-gold">
          <div className="text-label text-gold">Atlas Elite</div>
          <div className="text-xl font-bold mt-1">
            ${ELITE_PRICE.usd}<span className="text-sm text-text-muted font-normal">{t("eliteSection.perMonth")}</span>
          </div>
          <div className="text-xs text-text-muted mt-0.5">≈ {ELITE_PRICE.mru} MRU</div>
          <div className="mt-3 space-y-4">
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gold">{t("eliteSection.g1")}</div>
              <ul className="mt-1.5 text-sm text-text-muted space-y-1.5 list-disc list-inside marker:text-gold">
                <li>{t("eliteSection.f1")}</li>
                <li>{t("eliteSection.f2")}</li>
              </ul>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gold">{t("eliteSection.g2")}</div>
              <ul className="mt-1.5 text-sm text-text-muted space-y-1.5 list-disc list-inside marker:text-gold">
                <li>{t("eliteSection.f3")}</li>
                <li>{t("eliteSection.f4")}</li>
                <li>{t("eliteSection.f5")}</li>
              </ul>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gold">{t("eliteSection.g3")}</div>
              <ul className="mt-1.5 text-sm text-text-muted space-y-1.5 list-disc list-inside marker:text-gold">
                <li>{t("eliteSection.f6")}</li>
                <li>{t("eliteSection.f7")}</li>
              </ul>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-gold">{t("eliteSection.g4")}</div>
              <ul className="mt-1.5 text-sm text-text-muted space-y-1.5 list-disc list-inside marker:text-gold">
                <li>{t("eliteSection.f8")}</li>
                <li>{t("eliteSection.f9")}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <EliteRecord />

      {/* Membership details */}
      <section className="card p-4 mt-8" aria-label={s("Membership details", "تفاصيل العضوية")}>
        <h2 className="font-heading text-lg font-bold">{s("Membership details", "تفاصيل العضوية")}</h2>
        <ul className="mt-2 text-sm text-text-muted space-y-1.5 list-disc list-inside marker:text-gold">
          <li>{s(`$${ELITE_PRICE.usd} per month (about ${ELITE_PRICE.mru} MRU).`, `${ELITE_PRICE.usd}$ شهرياً (حوالي ${ELITE_PRICE.mru} أوقية).`)}</li>
          <li>{s("Pay with USDT, Bankily, Masrivi or Sedad, then upload your payment screenshot.", "ادفع عبر USDT أو بنكيلي أو مصريفي أو سداد، ثم ارفع لقطة شاشة الدفع.")}</li>
          <li>{s("Payments are checked manually; Elite is activated once your payment is verified.", "تتم مراجعة الدفعات يدوياً، ويُفعّل إيليت بعد التحقق من دفعتك.")}</li>
          <li>{s("No recurring card charges.", "بدون رسوم بطاقة متكررة.")}</li>
        </ul>
        <a href="#subscribe" className="btn-primary mt-4 inline-flex">{s("Subscribe to Elite", "اشترك في إيليت")}</a>
      </section>

      <div id="subscribe" className="scroll-mt-20" />
      {!isLoaded ? null : !isSignedIn ? (
        <div className="card p-5 mt-6 text-center">
          <p className="text-sm text-text-muted">{s("Sign in to submit a payment request.", "سجّل الدخول لإرسال طلب دفع.")}</p>
          <Link href="/sign-in" className="btn-primary mt-3 inline-flex">
            {s("Sign in", "تسجيل الدخول")}
          </Link>
        </div>
      ) : (
        <>
          <label className="text-label block mt-6 mb-2">{s("Choose a payment method", "اختر طريقة الدفع")}</label>
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
                    {m.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.logo}
                        alt={m.titleEn}
                        className="w-8 h-8 rounded-lg object-contain bg-white p-0.5 shrink-0"
                      />
                    ) : (
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
                        style={{ backgroundColor: m.badgeColor }}
                      >
                        {m.badgeLabel}
                      </span>
                    )}
                    <span className="font-medium text-sm">
                      {key === "usdt" ? "USDT (TRC20)" : m.titleEn}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="card p-5 mt-4">
            <div className="font-medium mb-3">{isAr && detail.titleAr ? detail.titleAr : detail.titleEn}</div>
            {detail.rows.map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-3 py-2.5 border-b border-line last:border-b-0">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-text-muted">
                    {isAr ? ROW_LABELS[row.key][1] : ROW_LABELS[row.key][0]}
                  </div>
                  <div className="font-data text-sm break-all">{row.value}</div>
                </div>
                <CopyButton value={row.value} isAr={isAr} />
              </div>
            ))}
            {(detail.noteEn || detail.noteAr) && (
              <p className="text-[11px] text-bear mt-3">
                ⚠ {isAr && detail.noteAr ? detail.noteAr : detail.noteEn}
              </p>
            )}
          </div>

          <div className="card p-5 mt-4">
            <div className="font-medium mb-1">{s("Submit your payment", "أرسل دفعتك")}</div>
            <p className="text-xs text-text-muted mb-3">
              Atlas Elite — ${ELITE_PRICE.usd} ≈ {ELITE_PRICE.mru} MRU {s("per month", "شهريًا")}
            </p>
            <div className="mb-3">
              <label className="text-label block mb-1.5">{s("Amount sent", "المبلغ المُرسل")}</label>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={s(`e.g. ${ELITE_PRICE.usd} USDT or ${ELITE_PRICE.mru} MRU`, `مثال: ${ELITE_PRICE.usd} USDT أو ${ELITE_PRICE.mru} أوقية`)}
                className="input"
              />
            </div>
            <div className="mb-3">
              <label className="text-label block mb-1.5">{s("Telegram username", "اسم مستخدم تيليجرام")}</label>
              <input
                type="text"
                value={telegramUsername}
                onChange={(e) => setTelegramUsername(e.target.value)}
                placeholder="@yourusername"
                className="input"
              />
            </div>
            <div className="mb-3">
              <label className="text-label block mb-1.5">{s("Payment screenshot", "لقطة شاشة للدفع")}</label>
              <label className="block border border-dashed border-line rounded-lg p-4 text-center text-sm text-text-muted cursor-pointer hover:border-gold transition-colors">
                {file ? file.name : s("Tap to upload a screenshot of your payment", "اضغط لرفع لقطة شاشة لعملية الدفع")}
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
                {s(
                  "Submitted — status: pending. We'll review it and update your account once verified.",
                  "تم الإرسال — الحالة: قيد الانتظار. سنراجعها ونحدّث حسابك بعد التحقق."
                )}
              </p>
            )}

            <button type="button" onClick={handleSubmit} disabled={submitting} className="btn-primary w-full">
              {submitting ? s("Submitting...", "جارٍ الإرسال...") : s("Submit for verification", "إرسال للتحقق")}
            </button>
          </div>

          <div className="flex gap-2 mt-5 text-xs text-text-muted">
            <span className="border border-gold text-gold rounded-full px-3 py-1">{s("Pending", "قيد الانتظار")}</span>
            <span className="border border-line rounded-full px-3 py-1">→ {s("Approved", "مقبول")}</span>
            <span className="border border-line rounded-full px-3 py-1">{s("or Rejected", "أو مرفوض")}</span>
          </div>
        </>
      )}
    </main>
  );
}
