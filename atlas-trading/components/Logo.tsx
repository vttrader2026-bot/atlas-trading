export default function Logo({ size = "nav" }: { size?: "nav" | "large" }) {
  const markSize = size === "large" ? 40 : 22;

  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        width={markSize}
        height={markSize}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M6 26L16 6L26 26"
          stroke="var(--gold)"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="6" r="2.25" fill="var(--gold)" />
      </svg>
      <span
        className={`flex items-baseline gap-1.5 tracking-tight font-semibold ${
          size === "large" ? "text-3xl" : "text-lg"
        }`}
      >
        <span>Atlas</span>
        <span
          className={`text-gold font-medium ${
            size === "large" ? "text-lg tracking-[0.08em]" : "text-[0.7em] tracking-[0.08em]"
          }`}
        >
          TRADING
        </span>
      </span>
    </span>
  );
}
