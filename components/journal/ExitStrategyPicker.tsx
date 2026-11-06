"use client";

// EXIT-STRATEGY-v1: choose the exit strategy before confirming. Read-only (locked) once the trade exists.
import { useId } from "react";
import type { ExitStrategy } from "@/lib/journal";

export function ExitStrategyPicker({ value, onChange, disabled = false, t }: { value: ExitStrategy; onChange?: (v: ExitStrategy) => void; disabled?: boolean; t: (k: string) => string }) {
  const name = useId();
  const options: Array<[ExitStrategy, string]> = [["split", "journal.p3Split"], ["tp3", "journal.p3Tp3"]];
  return (
    <fieldset className="grid gap-2" disabled={disabled}>
      <legend className="text-xs text-text-muted">{t("journal.p3Strategy")}</legend>
      {options.map(([v, key]) => (
        <label key={v} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${value === v ? "border-gold/60 bg-gold/10" : "border-line"} ${disabled ? "opacity-80" : "cursor-pointer"}`}>
          <input type="radio" name={name} checked={value === v} onChange={() => onChange?.(v)} className="mt-1" />
          <span>{t(key)}</span>
        </label>
      ))}
      <p className="text-xs text-text-muted">{t("journal.p3SlNote")} {disabled ? t("journal.p3StrategyLock") : ""}</p>
    </fieldset>
  );
}
