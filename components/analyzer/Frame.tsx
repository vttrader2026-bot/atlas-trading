import type { ReactNode } from "react";

/** Section frame shared by every block of the Analyzer result: gold eyebrow, heading, optional aside. */
export default function Frame({
  eyebrow,
  title,
  aside,
  children,
  className = "",
}: {
  eyebrow?: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 @md:p-7 ${className}`}>
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          {eyebrow && <div className="text-label text-gold">{eyebrow}</div>}
          <h3 className={`${eyebrow ? "mt-1" : ""} text-xl @md:text-2xl font-semibold tracking-tight`}>{title}</h3>
        </div>
        {aside}
      </header>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** A number/price that always reads left-to-right (also inside Arabic RTL text). */
export function Num({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span dir="ltr" className={`font-data tabular-nums ${className}`} style={{ unicodeBidi: "isolate" }}>
      {children}
    </span>
  );
}

export function TfChip({ tf }: { tf: string }) {
  if (!tf) return null;
  return (
    <span className="font-data text-xs px-2 py-0.5 rounded-md border border-line text-text-muted bg-bg/40">{tf}</span>
  );
}
