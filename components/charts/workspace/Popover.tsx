"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** A dropdown panel that closes on outside press and Escape. The trigger is rendered by the caller. */
export default function Popover({
  open,
  onClose,
  trigger,
  children,
  align = "start",
  label,
  width = "w-64",
}: {
  open: boolean;
  onClose: () => void;
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  label: string;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
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
          className={`absolute z-40 mt-1.5 ${width} max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface shadow-xl p-3 max-h-[min(70dvh,34rem)] overflow-y-auto ${align === "end" ? "end-0" : "start-0"}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
