"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { INDICATORS, canToggle, type IndicatorId } from "@/lib/chartIndicators";
import Popover from "@/components/charts/workspace/Popover";
import { Icons } from "@/components/charts/workspace/icons";

/**
 * The Indicators menu. It renders from lib/chartIndicators: active entries toggle
 * real series; "soon" entries are shown disabled. Phase 3 adds series for those and
 * flips their status, with no change needed here.
 */
export default function IndicatorsMenu({ enabled, onToggle, btnClass }: { enabled: Record<IndicatorId, boolean>; onToggle: (id: IndicatorId) => void; btnClass: string }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const count = INDICATORS.filter((i) => i.status === "active" && enabled[i.id]).length;
  const groups: { key: "overlay" | "pane"; label: string }[] = [
    { key: "overlay", label: t("charts.ind.overlays") },
    { key: "pane", label: t("charts.ind.panes") },
  ];
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      label={t("charts.ind.title")}
      trigger={
        <button type="button" className={btnClass} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {Icons.indicators}
          <span>{t("charts.indicators")}</span>
          {count > 0 && <span className="rounded bg-gold/20 px-1.5 text-[11px] text-gold">{count}</span>}
        </button>
      }
    >
      {groups.map((g) => (
        <div key={g.key} className="mb-2 last:mb-0">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{g.label}</p>
          <ul>
            {INDICATORS.filter((i) => i.group === g.key).map((i) => {
              const on = enabled[i.id];
              const usable = canToggle(i.id);
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    disabled={!usable}
                    aria-pressed={usable ? on : undefined}
                    onClick={() => onToggle(i.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded px-2 py-2 text-sm text-start ${usable ? "hover:bg-gold/10" : "opacity-60 cursor-not-allowed"}`}
                  >
                    <span>{i.label}</span>
                    {usable ? (
                      <span className={`h-4 w-8 rounded-full border border-line p-0.5 transition-colors ${on ? "bg-gold/70" : "bg-surface-raised"}`} aria-hidden="true">
                        <span className={`block h-3 w-3 rounded-full bg-text transition-transform ${on ? "translate-x-4 rtl:-translate-x-4" : ""}`} />
                      </span>
                    ) : (
                      <span className="rounded border border-line px-1.5 text-[10px] text-text-muted">{t("charts.ind.soon")}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p className="mt-2 border-t border-line pt-2 text-xs text-text-muted">{t("charts.ind.note")}</p>
    </Popover>
  );
}
