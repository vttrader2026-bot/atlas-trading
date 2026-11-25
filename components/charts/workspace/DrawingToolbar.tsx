"use client";

import { useState, type ReactNode } from "react";
import { useLanguage } from "@/lib/i18n";
import type { Tool } from "@/lib/chartDrawings";
import Popover from "@/components/charts/workspace/Popover";
import { Icons, type IconName } from "@/components/charts/workspace/icons";

export type DrawingToolbarProps = {
  tool: Tool;
  onTool: (t: Tool) => void;
  magnet: boolean;
  onMagnet: () => void;
  locked: boolean;
  onLock: () => void;
  hidden: boolean;
  onHidden: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  canDelete: boolean;
  onDelete: () => void;
  drawingCount: number;
  onClear: () => void;
};

const TOOLS: { id: Tool; icon: IconName }[] = [
  { id: "cursor", icon: "cursor" },
  { id: "trend", icon: "trend" },
  { id: "hline", icon: "hline" },
  { id: "vline", icon: "vline" },
  { id: "rect", icon: "rect" },
  { id: "zone", icon: "zone" },
  { id: "brush", icon: "brush" },
  { id: "text", icon: "text" },
  { id: "measure", icon: "measure" },
];

/**
 * The drawing toolbar: a vertical rail at the start of the chart on desktop, and a horizontally
 * scrolling strip above the chart on phones (so it never covers the chart). Buttons are 40px square
 * (touch friendly); tooltips show on hover/focus and every button also has an aria-label and title.
 */
export default function DrawingToolbar(p: DrawingToolbarProps) {
  const { t } = useLanguage();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const base = "group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-transparent transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const cls = (active: boolean) => `${base} ${active ? "border-gold bg-gold/15 text-gold" : "text-text-muted hover:bg-gold/10 hover:text-text"}`;
  const tip = (label: string, hint?: string): ReactNode => (
    <span role="tooltip" className="pointer-events-none absolute start-full top-1/2 z-50 ms-2 hidden w-max max-w-[15rem] -translate-y-1/2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-start text-xs text-text shadow-lg group-hover:sm:block group-focus-visible:sm:block">
      <span className="block font-semibold">{label}</span>
      {hint && <span className="block text-text-muted">{hint}</span>}
    </span>
  );
  const btn = (key: string, icon: IconName, label: string, opts: { active?: boolean; onClick: () => void; hint?: string; disabled?: boolean; pressed?: boolean }) => (
    <button key={key} type="button" className={cls(!!opts.active)} aria-label={label} title={opts.hint ? `${label} — ${opts.hint}` : label} aria-pressed={opts.pressed} disabled={opts.disabled} onClick={opts.onClick}>
      {Icons[icon]}
      {tip(label, opts.hint)}
    </button>
  );
  const sep = (k: string) => <span key={k} className="mx-1 h-6 w-px shrink-0 self-center bg-line sm:mx-0 sm:my-1 sm:h-px sm:w-6" aria-hidden="true" />;

  return (
    <div
      role="toolbar"
      aria-label={t("charts.drawingTools")}
      aria-orientation="vertical"
      className="flex shrink-0 flex-row items-center gap-0.5 overflow-x-auto border-b border-line bg-surface px-1.5 py-1 sm:w-12 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-e sm:px-1 sm:py-2"
    >
      {TOOLS.map((tl) => btn(tl.id, tl.icon, t(`charts.tool.${tl.id}`), { active: p.tool === tl.id, pressed: p.tool === tl.id, hint: t(`charts.hint.${tl.id}`), onClick: () => p.onTool(tl.id) }))}
      {sep("s1")}
      {btn("zin", "zoomIn", t("charts.zoomIn"), { onClick: p.onZoomIn })}
      {btn("zout", "zoomOut", t("charts.zoomOut"), { onClick: p.onZoomOut })}
      {btn("zfit", "fit", t("charts.zoomReset"), { onClick: p.onZoomReset })}
      {sep("s2")}
      {btn("magnet", "magnet", t("charts.magnet"), { active: p.magnet, pressed: p.magnet, hint: t("charts.magnetHint"), onClick: p.onMagnet })}
      {btn("lock", p.locked ? "lock" : "unlock", p.locked ? t("charts.unlock") : t("charts.lock"), { active: p.locked, pressed: p.locked, hint: t("charts.lockHint"), onClick: p.onLock })}
      {btn("hide", p.hidden ? "eyeOff" : "eye", p.hidden ? t("charts.show") : t("charts.hide"), { active: p.hidden, pressed: p.hidden, onClick: p.onHidden })}
      {sep("s3")}
      {btn("del", "trash", t("charts.deleteDrawing"), { disabled: !p.canDelete, onClick: p.onDelete })}
      <Popover
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        label={t("charts.clearTitle")}
        width="w-60"
        trigger={
          <button
            type="button"
            className={`${base} text-text-muted hover:bg-bear/10 hover:text-bear`}
            aria-label={t("charts.clear")}
            title={t("charts.clear")}
            disabled={p.drawingCount === 0}
            onClick={() => setConfirmOpen((o) => !o)}
          >
            <span className="relative">
              {Icons.trash}
              <span className="absolute -end-1.5 -top-1.5 rounded-full bg-bear px-1 text-[9px] leading-3 text-white">{p.drawingCount > 99 ? "99+" : p.drawingCount}</span>
            </span>
            {tip(t("charts.clear"))}
          </button>
        }
      >
        <p className="text-sm font-semibold">{t("charts.clearTitle")}</p>
        <p className="mt-1 text-xs text-text-muted">{t("charts.clearBody")}</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-md bg-bear px-3 py-2 text-sm font-medium text-white"
            onClick={() => {
              setConfirmOpen(false);
              p.onClear();
            }}
          >
            {t("charts.clearConfirm")}
          </button>
          <button type="button" className="flex-1 rounded-md border border-line px-3 py-2 text-sm" onClick={() => setConfirmOpen(false)}>
            {t("charts.cancel")}
          </button>
        </div>
      </Popover>
    </div>
  );
}
