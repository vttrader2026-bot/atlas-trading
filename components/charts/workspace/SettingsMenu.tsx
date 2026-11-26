"use client";

import { useState, type ReactNode } from "react";
import { useLanguage } from "@/lib/i18n";
import { COLOR_PRESETS, COLOR_PRESET_IDS, CROSSHAIR_STYLES, DEFAULT_SETTINGS, GRID_MODES, type ChartSettings } from "@/lib/chartSettings";
import Popover from "@/components/charts/workspace/Popover";
import { Icons } from "@/components/charts/workspace/icons";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-1 text-xs text-text-muted">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/** Appearance settings. Every control maps to a real chart option (see lib/chartSettings). */
export default function SettingsMenu({ settings, onChange, onReset, btnClass }: { settings: ChartSettings; onChange: (patch: Partial<ChartSettings>) => void; onReset: () => void; btnClass: string }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const chip = (active: boolean) => `rounded-md border px-2.5 py-1.5 text-xs transition-colors ${active ? "border-gold bg-gold/15 text-gold" : "border-line text-text-muted hover:text-text"}`;
  const seg = <T extends string>(value: T, current: T, label: string, set: (v: T) => void) => (
    <button key={value} type="button" aria-pressed={value === current} className={chip(value === current)} onClick={() => set(value)}>
      {label}
    </button>
  );
  const toggle = (label: string, on: boolean, set: (v: boolean) => void) => (
    <button type="button" aria-pressed={on} className="flex w-full items-center justify-between gap-3 rounded px-1 py-1.5 text-sm hover:bg-gold/10" onClick={() => set(!on)}>
      <span>{label}</span>
      <span className={`h-4 w-8 shrink-0 rounded-full border border-line p-0.5 transition-colors ${on ? "bg-gold/70" : "bg-surface-raised"}`} aria-hidden="true">
        <span className={`block h-3 w-3 rounded-full bg-text transition-transform ${on ? "translate-x-4 rtl:-translate-x-4" : ""}`} />
      </span>
    </button>
  );
  const gridLabel: Record<(typeof GRID_MODES)[number], string> = { both: t("charts.set.gridBoth"), horz: t("charts.set.gridHorz"), vert: t("charts.set.gridVert"), none: t("charts.set.gridNone") };
  const presetLabel = { atlas: t("charts.set.colorAtlas"), classic: t("charts.set.colorClassic"), colorblind: t("charts.set.colorBlind") };
  const styleLabel = { dashed: t("charts.set.dashed"), solid: t("charts.set.solid"), dotted: t("charts.set.dotted") };
  const changed = JSON.stringify(settings) !== JSON.stringify(DEFAULT_SETTINGS);

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      align="end"
      width="w-72"
      label={t("charts.set.title")}
      trigger={
        <button type="button" className={btnClass} aria-haspopup="dialog" aria-expanded={open} aria-label={t("charts.settings")} title={t("charts.settings")} onClick={() => setOpen((o) => !o)}>
          {Icons.settings}
        </button>
      }
    >
      <div className="max-h-[70dvh] overflow-y-auto pe-1">
        <Row label={t("charts.set.candleStyle")}>
          {seg("solid", settings.candleStyle, t("charts.set.styleSolid"), (v) => onChange({ candleStyle: v }))}
          {seg("hollow", settings.candleStyle, t("charts.set.styleHollow"), (v) => onChange({ candleStyle: v }))}
        </Row>
        <Row label={t("charts.set.colors")}>
          {COLOR_PRESET_IDS.map((id) => (
            <button key={id} type="button" aria-pressed={settings.colors === id} className={`${chip(settings.colors === id)} inline-flex items-center gap-1.5`} onClick={() => onChange({ colors: id })}>
              <span className="inline-flex" aria-hidden="true">
                <span className="h-3 w-3 rounded-s-sm" style={{ background: COLOR_PRESETS[id].up ?? "var(--bull)" }} />
                <span className="h-3 w-3 rounded-e-sm" style={{ background: COLOR_PRESETS[id].down ?? "var(--bear)" }} />
              </span>
              {presetLabel[id]}
            </button>
          ))}
        </Row>
        <Row label={t("charts.set.grid")}>{GRID_MODES.map((g) => seg(g, settings.grid, gridLabel[g], (v) => onChange({ grid: v })))}</Row>
        <Row label={t("charts.set.background")}>
          {seg("surface", settings.background, t("charts.set.bgSurface"), (v) => onChange({ background: v }))}
          {seg("base", settings.background, t("charts.set.bgBase"), (v) => onChange({ background: v }))}
        </Row>
        <Row label={t("charts.set.crosshairMode")}>
          {seg("normal", settings.crosshairMode, t("charts.set.crosshairNormal"), (v) => onChange({ crosshairMode: v }))}
          {seg("magnet", settings.crosshairMode, t("charts.set.crosshairMagnet"), (v) => onChange({ crosshairMode: v }))}
        </Row>
        <Row label={t("charts.set.crosshairStyle")}>{CROSSHAIR_STYLES.map((s) => seg(s, settings.crosshairStyle, styleLabel[s], (v) => onChange({ crosshairStyle: v })))}</Row>
        <div className="mt-1 border-t border-line pt-2">
          {toggle(t("charts.set.crosshair"), settings.crosshair, (v) => onChange({ crosshair: v }))}
          {toggle(t("charts.set.priceScale"), settings.priceScale, (v) => onChange({ priceScale: v }))}
          {toggle(t("charts.set.timeScale"), settings.timeScale, (v) => onChange({ timeScale: v }))}
          {toggle(t("charts.set.volume"), settings.volume, (v) => onChange({ volume: v, volumeChosen: true }))}
        </div>
        <button type="button" disabled={!changed} className="mt-3 w-full rounded-md border border-line px-3 py-2 text-sm text-text-muted hover:text-text disabled:opacity-50" onClick={onReset}>
          {t("charts.set.reset")}
        </button>
      </div>
    </Popover>
  );
}
