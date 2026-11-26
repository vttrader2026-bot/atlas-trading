"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** A dropdown panel that closes on outside press and Escape. The trigger is rendered by the caller. */
export default function Popover({
  open,
  onClose,
  trigger,
  children,
  align = "start",
  label,
  width = "w-64",
  fixed = false,
}: {
  open: boolean;
  onClose: () => void;
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  label: string;
  width?: string;
  /** Place the panel with `position: fixed` beside the trigger, so a scrolling/clipping parent (the drawing rail) can't cut it off. */
  fixed?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !fixed || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const panelW = 248;
    const rtl = document.documentElement.dir === "rtl";
    const phone = window.innerWidth < 640; // the strip is horizontal on phones: open below it
    const left = phone ? Math.min(Math.max(8, r.left), window.innerWidth - panelW - 8) : rtl ? Math.max(8, r.left - panelW - 6) : Math.min(r.right + 6, window.innerWidth - panelW - 8);
    const top = phone ? r.bottom + 6 : Math.min(Math.max(8, r.top), window.innerHeight - 190);
    setPos({ left, top });
  }, [open, fixed]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  return (
    <div ref={ref} className="relative">
      {trigger}
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className={`${fixed ? "fixed" : `absolute mt-1.5 ${align === "end" ? "end-0" : "start-0"}`} z-40 ${width} max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface shadow-xl p-3 max-h-[min(70dvh,34rem)] overflow-y-auto`}
          style={fixed ? { left: pos?.left ?? -9999, top: pos?.top ?? 0 } : undefined}
        >
          {children}
        </div>
      )}
    </div>
  );
}
