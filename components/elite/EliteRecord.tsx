"use client";

// ELITE-RECORD-v1: historical signal performance on the Elite page. Real, closed Elite signals only (see lib/eliteRecord.ts).
// Open signals are never shown as results, and nothing here promises future performance.

import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import type { EliteRecord as Rec, EliteSummary, MonthReport } from "@/lib/eliteRecord";

type Payload = { records: Rec[]; monthly: MonthReport[]; summary: EliteSummary; window: { from: number; to: number; signals: number } | null };

const COPY = {
  en: {
    title: "Historical Signal Performance",
    sub: "How past Elite signals performed once they were closed. Each entry shows the published entry zone, the official closing level and the calculated signal result. This is not the profit of any member.",
    loading: "Loading historical signal performance…",
    error: "Historical signal performance could not be loaded right now.",
    empty: "No closed Elite signals to show yet. Results appear here only after a signal is closed with an official outcome. Nothing is estimated in the meantime.",
    closed: "Closed trades", wins: "Wins", losses: "Losses", rate: "Win rate", net: "Sum of signal results", open: "Open now",
    openNote: "Open positions are not counted in any result.",
    monthly: "Monthly report", month: "Month", cancelled: "Cancelled",
    recent: "Closed signals (calculated results)", pair: "Pair", entry: "Entry zone", exit: "Exit level", outcome: "Outcome", result: "Signal result", closedOn: "Closed",
    tp: "Target hit", sl: "Stop loss", cx: "Cancelled",
    window: "Covers the latest {n} signals in the feed ({from} to {to}).",
    how: "How it is calculated: signal result % = (official closing level − midpoint of the published entry zone) ÷ that midpoint, reversed for shorts. Limitations: this is a theoretical figure from published levels only. It is not the profit or loss of any member and does not reflect actual fills, entry prices inside the zone, position size, fees, slippage, partial exits or timing. Results are added up as simple percentages, not compounded. Cancelled signals are not counted as wins or losses. Only closed signals are included; open signals are never counted.",
    risk: "Historical signal performance is not a guarantee or prediction of future results. Trading spot crypto involves risk, including loss of capital.",
    wr: "of decided trades",
  },
  ar: {
    title: "الأداء التاريخي للإشارات",
    sub: "كيف كان أداء إشارات إيليت السابقة بعد إغلاقها. يعرض كل سطر نطاق الدخول المنشور ومستوى الإغلاق الرسمي ونتيجة الإشارة المحسوبة. هذه ليست أرباح أي عضو.",
    loading: "جارٍ تحميل الأداء التاريخي للإشارات…",
    error: "تعذّر تحميل الأداء التاريخي للإشارات الآن.",
    empty: "لا توجد إشارات إيليت مغلقة للعرض بعد. تظهر النتائج هنا فقط بعد إغلاق الإشارة بنتيجة رسمية. لا يتم تقدير أي شيء في الأثناء.",
    closed: "صفقات مغلقة", wins: "رابحة", losses: "خاسرة", rate: "نسبة الربح", net: "مجموع نتائج الإشارات", open: "مفتوحة الآن",
    openNote: "الصفقات المفتوحة لا تدخل في أي نتيجة.",
    monthly: "التقرير الشهري", month: "الشهر", cancelled: "ملغاة",
    recent: "الإشارات المغلقة", pair: "الزوج", entry: "نطاق الدخول", exit: "مستوى الخروج", outcome: "النتيجة", result: "نتيجة الإشارة", closedOn: "الإغلاق",
    tp: "تحقق هدف", sl: "وقف الخسارة", cx: "ملغاة",
    window: "يغطي آخر {n} إشارة في الخلاصة ({from} إلى {to}).",
    how: "طريقة الحساب: نتيجة الإشارة % = (مستوى الإغلاق الرسمي − منتصف نطاق الدخول المنشور) ÷ ذلك المنتصف، وتُعكس للبيع على المكشوف. القيود: هذا رقم نظري يعتمد على المستويات المنشورة فقط. وهو ليس ربح أو خسارة أي عضو ولا يعكس التنفيذ الفعلي أو سعر الدخول داخل النطاق أو حجم الصفقة أو الرسوم أو الانزلاق السعري أو الخروج الجزئي أو التوقيت. تُجمع النتائج كنسب بسيطة دون تركيب. الإشارات الملغاة لا تُحتسب ربحاً أو خسارة. تُحتسب الإشارات المغلقة فقط ولا تُحتسب المفتوحة أبداً.",
    risk: "الأداء التاريخي للإشارات لا يضمن ولا يتنبأ بالنتائج المستقبلية. تداول العملات الرقمية الفورية ينطوي على مخاطر الخسارة.",
    wr: "من الصفقات المحسومة",
  },
} as const;

const pct = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`);
const tone = (n: number | null) => (n === null ? "text-text-muted" : n > 0 ? "text-bull" : n < 0 ? "text-bear" : "text-text-muted");

export default function EliteRecord() {
  const { lang } = useLanguage();
  const c = COPY[lang === "ar" ? "ar" : "en"];
  const locale = lang === "ar" ? "en-GB" : lang === "fr" ? "fr" : "en";
  const [data, setData] = useState<Payload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/elite-record")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad"))))
      .then((d: Payload) => live && setData(d))
      .catch(() => live && setFailed(true));
    return () => { live = false; };
  }, []);

  const day = (ms: number) => new Date(ms).toLocaleDateString(locale, { dateStyle: "medium" });
  const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const outcomeLabel = (o: Rec["outcome"]) => (o === "SL" ? c.sl : o === "CANCELLED" ? c.cx : `${c.tp} · ${o}`);

  const s = data?.summary;
  const hasData = !!data && data.records.length > 0;

  return (
    <section className="mt-10" aria-labelledby="elite-record-title">
      <h2 id="elite-record-title" className="font-heading text-xl sm:text-2xl font-bold tracking-tight">{c.title}</h2>
      <p className="text-text-muted text-sm mt-1.5 max-w-xl leading-relaxed">{c.sub}</p>

      {!data && !failed && <p className="mt-4 text-sm text-text-muted">{c.loading}</p>}
      {failed && <p className="mt-4 text-sm text-bear">{c.error}</p>}

      {data && !hasData && (
        <div className="card p-5 mt-4">
          <p className="text-sm text-text-muted leading-relaxed">{c.empty}</p>
          {s && s.open > 0 && <p className="mt-2 text-xs text-text-muted">{c.open}: <span className="font-data">{s.open}</span>. {c.openNote}</p>}
        </div>
      )}

      {data && hasData && s && (
        <>
          <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-3"><dt className="text-label">{c.closed}</dt><dd className="mt-1 text-xl font-bold font-data">{s.closed}</dd></div>
            <div className="card p-3"><dt className="text-label">{c.wins} / {c.losses}</dt><dd className="mt-1 text-xl font-bold font-data" dir="ltr"><span className="text-bull">{s.wins}</span> / <span className="text-bear">{s.losses}</span></dd></div>
            <div className="card p-3"><dt className="text-label">{c.rate}</dt><dd className="mt-1 text-xl font-bold font-data" dir="ltr">{s.winRate === null ? "—" : `${s.winRate.toFixed(1)}%`}</dd><div className="text-[11px] text-text-muted">{c.wr}</div></div>
            <div className="card p-3"><dt className="text-label">{c.net}</dt><dd className={`mt-1 text-xl font-bold font-data ${tone(s.netPct)}`} dir="ltr">{pct(s.netPct)}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-text-muted">{c.open}: <span className="font-data">{s.open}</span>. {c.openNote}</p>

          {/* Monthly report: each bar is the real count of wins (green) and losses (red) closed that month */}
          <h3 className="mt-6 text-label">{c.monthly}</h3>
          <ul className="mt-2 space-y-2">
            {data.monthly.map((m) => {
              const max = Math.max(...data.monthly.map((x) => x.closed), 1);
              return (
                <li key={m.month} className="card p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="font-semibold text-sm">{monthLabel(m.month)}</span>
                    <span className="text-xs text-text-muted font-data" dir="ltr">
                      {c.closed}: {m.closed} · {c.wins}: {m.wins} · {c.losses}: {m.losses}
                      {m.cancelled > 0 ? ` · ${c.cancelled}: ${m.cancelled}` : ""} · <span className={tone(m.netPct)}>{pct(m.netPct)}</span>
                    </span>
                  </div>
                  <div className="mt-2 flex h-2 rounded-full bg-line overflow-hidden" dir="ltr" role="img" aria-label={`${m.wins} ${c.wins}, ${m.losses} ${c.losses}`}>
                    <div className="bg-bull" style={{ width: `${(m.wins / max) * 100}%` }} />
                    <div className="bg-bear" style={{ width: `${(m.losses / max) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>

          <h3 className="mt-6 text-label">{c.recent}</h3>
          <ul className="mt-2 space-y-2">
            {data.records.slice(0, 20).map((r) => (
              <li key={r.id} className="card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-data font-semibold" dir="ltr">{r.pair}</span>{" "}
                    <span className="text-xs text-text-muted">{r.direction} · {r.timeframe}</span>
                    <div className="text-xs text-text-muted mt-0.5">{c.closedOn} {day(r.closedAt)}</div>
                  </div>
                  <div className="text-end shrink-0">
                    <div className={`font-data font-bold ${tone(r.pct)}`} dir="ltr">{pct(r.pct)}</div>
                    <div className="text-xs text-text-muted">{outcomeLabel(r.outcome)}</div>
                  </div>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div><dt className="text-text-muted">{c.entry}</dt><dd className="font-data" dir="ltr">{r.entryZone}</dd></div>
                  <div><dt className="text-text-muted">{c.exit}</dt><dd className="font-data" dir="ltr">{r.outcome === "CANCELLED" ? "—" : r.exit}</dd></div>
                </dl>
              </li>
            ))}
          </ul>

          {data.window && (
            <p className="mt-3 text-xs text-text-muted">
              {c.window.replace("{n}", String(data.window.signals)).replace("{from}", day(data.window.from)).replace("{to}", day(data.window.to))}
            </p>
          )}
          <p className="mt-2 text-xs text-text-muted leading-relaxed">{c.how}</p>
        </>
      )}

      <p className="mt-2 text-xs text-text-muted">{c.risk}</p>
    </section>
  );
}
