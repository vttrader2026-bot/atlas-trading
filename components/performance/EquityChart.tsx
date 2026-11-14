"use client";
import type { CurvePoint } from "@/lib/performance";
import { signedUsd, usd } from "@/components/journal/format";
import { fill } from "./util";

const W = 720, H = 280, L = 64, R = 16, T = 16, B = 34;

/** Cumulative net P&L (gold) from 0, with the drawdown from the running peak shaded in red. Time axis is always left to right. */
export default function EquityChart({ curve, t }: { curve: CurvePoint[]; t: (k: string) => string }) {
  if (!curve.length) return <p className="text-sm text-text-muted py-10 text-center">{t("perf.equityEmpty")}</p>;
  const pts = [{ n: 0, equity: 0, peak: 0, date: "", pnl: 0, pair: "", approx: false, estimated: false, drawdown: 0 }, ...curve];
  const hi = Math.max(0, ...pts.map((p) => p.peak)), lo = Math.min(0, ...pts.map((p) => p.equity));
  const span = hi - lo || 1;
  const x = (n: number) => L + (n / (pts.length - 1 || 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / span) * (H - T - B);
  const line = pts.map((p) => `${x(p.n).toFixed(1)},${y(p.equity).toFixed(1)}`).join(" ");
  const peakFwd = pts.map((p) => `${x(p.n).toFixed(1)},${y(p.peak).toFixed(1)}`).join(" ");
  const eqBack = [...pts].reverse().map((p) => `${x(p.n).toFixed(1)},${y(p.equity).toFixed(1)}`).join(" ");
  const ticks = [hi, lo < 0 ? 0 : null, lo < 0 ? lo : null].filter((v): v is number => v !== null);
  const last = curve[curve.length - 1];
  const dots = pts.length <= 80;
  return (
    <div dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img"
        aria-label={`${t("perf.equityTitle")}: ${curve.length} ${t("perf.tradesUnit")}, ${signedUsd(last.equity)}`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray={v === 0 ? "4 4" : undefined} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)" fontFamily="var(--font-jetbrains-mono), monospace">{v === 0 ? "0" : usd(v).replace(".00", "")}</text>
          </g>
        ))}
        <polygon points={`${peakFwd} ${eqBack}`} fill="var(--bear)" fillOpacity="0.2" />
        <polyline points={line} fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {dots && curve.map((p) => (
          <circle key={p.n} cx={x(p.n)} cy={y(p.equity)} r="3.2" fill={p.approx || p.estimated ? "var(--bg)" : "var(--gold)"} stroke="var(--gold)" strokeWidth="1.5" />
        ))}
        {curve.map((p) => (
          <rect key={`h${p.n}`} x={x(p.n) - 6} y={T} width="12" height={H - T - B} fill="transparent">
            <title>{`${fill(t("perf.tradeN"), { n: p.n })} · ${p.pair} · ${p.date}${p.approx || p.estimated ? " *" : ""}\n${signedUsd(p.pnl)} → ${signedUsd(p.equity)}${p.drawdown > 0 ? `\n${t("perf.equityDrawdown")}: -${usd(p.drawdown)}` : ""}`}</title>
          </rect>
        ))}
        <text x={L} y={H - 10} fontSize="11" fill="var(--text-muted)" fontFamily="var(--font-jetbrains-mono), monospace">{curve[0].date}</text>
        <text x={W - R} y={H - 10} textAnchor="end" fontSize="11" fill="var(--text-muted)" fontFamily="var(--font-jetbrains-mono), monospace">{last.date}</text>
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-text-muted">
        <span className="inline-flex items-center gap-2"><span className="inline-block h-0.5 w-5" style={{ background: "var(--gold)" }} />{t("perf.equityLine")}</span>
        <span className="inline-flex items-center gap-2"><span className="inline-block h-3 w-5 rounded-sm" style={{ background: "var(--bear)", opacity: 0.35 }} />{t("perf.equityDrawdown")}</span>
      </div>
    </div>
  );
}
