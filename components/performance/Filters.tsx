"use client";
import type { Preset } from "./util";

type Props = {
  t: (k: string) => string;
  from: string; to: string; preset: Preset | "custom";
  onPreset: (p: Preset) => void; onFrom: (v: string) => void; onTo: (v: string) => void;
  includeEstimated: boolean; onIncludeEstimated: (v: boolean) => void;
  equityText: string; onEquity: (v: string) => void;
};

const PRESETS: { id: Preset; key: string }[] = [
  { id: "all", key: "rangeAll" }, { id: "30", key: "range30" }, { id: "90", key: "range90" }, { id: "ytd", key: "rangeYtd" },
];

export default function Filters(p: Props) {
  const { t } = p;
  return (
    <section className="card p-5 sm:p-6" aria-label={t("perf.filters")}>
      <div className="text-label mb-4">{t("perf.filters")}</div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("perf.filters")}>
        {PRESETS.map((x) => (
          <button key={x.id} type="button" onClick={() => p.onPreset(x.id)} aria-pressed={p.preset === x.id}
            className={`px-3 py-1.5 rounded-md border text-xs transition-colors ${p.preset === x.id ? "border-gold text-gold bg-surface-raised" : "border-line text-text-muted hover:text-text"}`}>
            {t(`perf.${x.key}`)}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
        <label className="block text-xs text-text-muted">{t("perf.from")}
          <input type="date" className="input mt-1 w-full" value={p.from} max={p.to || undefined} onChange={(e) => p.onFrom(e.target.value)} />
        </label>
        <label className="block text-xs text-text-muted">{t("perf.to")}
          <input type="date" className="input mt-1 w-full" value={p.to} min={p.from || undefined} onChange={(e) => p.onTo(e.target.value)} />
        </label>
        <label className="block text-xs text-text-muted lg:col-span-2">{t("perf.startingEquity")}
          <span className="flex gap-2 mt-1">
            <input type="text" inputMode="decimal" dir="ltr" className="input w-full font-data" placeholder={t("perf.startingEquityPlaceholder")} value={p.equityText} onChange={(e) => p.onEquity(e.target.value)} />
            {p.equityText && <button type="button" className="btn-secondary" onClick={() => p.onEquity("")}>{t("perf.clear")}</button>}
          </span>
          <span className="block mt-1">{t("perf.startingEquityHint")}</span>
        </label>
      </div>
      <p className="mt-2 text-xs text-text-muted">{t("perf.rangeNote")}</p>
      <label className="mt-4 flex items-start gap-3 text-sm cursor-pointer">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--gold)]" checked={p.includeEstimated} onChange={(e) => p.onIncludeEstimated(e.target.checked)} />
        <span>
          {t("perf.includeEstimated")}
          <span className="block text-xs text-text-muted">{t("perf.includeEstimatedHint")}</span>
        </span>
      </label>
    </section>
  );
}
