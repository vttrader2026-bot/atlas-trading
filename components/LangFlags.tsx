// Small inline SVG flags. Emoji flags do not render on Windows (they show as letter pairs), so these are drawn.
import { useId } from "react";

export type LangCode = "ar" | "fr" | "en";

function Art({ code }: { code: LangCode }) {
  const id = useId();
  if (code === "fr")
    return (
      <>
        <rect width="20" height="40" fill="#0055A4" />
        <rect x="20" width="20" height="40" fill="#FFFFFF" />
        <rect x="40" width="20" height="40" fill="#EF4135" />
      </>
    );
  if (code === "ar")
    return (
      <>
        <rect width="60" height="40" fill="#00A95C" />
        <rect width="60" height="6" fill="#D01C1F" />
        <rect y="34" width="60" height="6" fill="#D01C1F" />
        <circle cx="30" cy="19" r="10.5" fill="#FFC400" />
        <circle cx="30" cy="15.5" r="9.5" fill="#00A95C" />
        <path d="M30 11l1.2 3.3 3.5.1-2.8 2.1 1 3.4-2.9-2-2.9 2 1-3.4-2.8-2.1 3.5-.1z" fill="#FFC400" />
      </>
    );
  return (
    <>
      <clipPath id={`${id}s`}><path d="M0 0h60v40H0z" /></clipPath>
      <clipPath id={`${id}t`}><path d="M30 20h30v20zM30 20v20H0zM30 20H0V0zM30 20V0h30z" /></clipPath>
      <g clipPath={`url(#${id}s)`}>
        <path d="M0 0h60v40H0z" fill="#012169" />
        <path d="M0 0l60 40M60 0L0 40" stroke="#fff" strokeWidth="8" />
        <path d="M0 0l60 40M60 0L0 40" clipPath={`url(#${id}t)`} stroke="#C8102E" strokeWidth="5" />
        <path d="M30 0v40M0 20h60" stroke="#fff" strokeWidth="13" />
        <path d="M30 0v40M0 20h60" stroke="#C8102E" strokeWidth="8" />
      </g>
    </>
  );
}

export default function LangFlag({ code, className = "" }: { code: LangCode; className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-block shrink-0 overflow-hidden rounded-[3px] ring-1 ring-line ${className}`} style={{ width: 22, height: 15 }}>
      <svg viewBox="0 0 60 40" width="22" height="15" preserveAspectRatio="none" className="block">
        <Art code={code} />
      </svg>
    </span>
  );
}
