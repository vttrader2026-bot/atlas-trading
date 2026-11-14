"use client";
import type { Streaks } from "@/lib/performance";
import { Num, fill } from "./util";

export default function StreakCard({ s, t }: { s: Streaks; t: (k: string) => string }) {
  const cur = s.current.type === "win" ? fill(t("perf.currentWin"), { n: s.current.length }) : s.current.type === "loss" ? fill(t("perf.currentLoss"), { n: s.current.length }) : t("perf.currentNone");
  return (
    <section className="card p-5 sm:p-6" aria-label={t("perf.streaksTitle")}>
      <div className="text-label mb-4">{t("perf.streaksTitle")}</div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div><div className="text-xs text-text-muted">{t("perf.maxWinStreak")}</div><div className="mt-1 text-2xl"><Num cls="text-bull">{s.maxWin}</Num> <span className="text-xs text-text-muted">{t("perf.tradesUnit")}</span></div></div>
        <div><div className="text-xs text-text-muted">{t("perf.maxLossStreak")}</div><div className="mt-1 text-2xl"><Num cls="text-bear">{s.maxLoss}</Num> <span className="text-xs text-text-muted">{t("perf.tradesUnit")}</span></div></div>
        <div><div className="text-xs text-text-muted">{t("perf.currentStreak")}</div><div className={`mt-1 text-xl ${s.current.type === "win" ? "text-bull" : s.current.type === "loss" ? "text-bear" : "text-text-muted"}`}>{cur}</div></div>
      </div>
      <p className="mt-4 text-xs text-text-muted">{t("perf.streakRule")}</p>
    </section>
  );
}
