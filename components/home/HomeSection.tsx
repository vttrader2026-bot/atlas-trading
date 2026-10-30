/** Shared section frame: eyebrow, heading, optional subtitle. */
export default function HomeSection({
  eyebrow, heading, subtitle, children, id,
}: { eyebrow: string; heading: string; subtitle?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="max-w-6xl mx-auto px-6 pb-20 sm:pb-28">
      <div className="text-label text-gold">{eyebrow}</div>
      <h2 className="mt-3 text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight max-w-2xl">{heading}</h2>
      {subtitle && <p className="mt-4 text-lg text-text-muted leading-relaxed max-w-2xl">{subtitle}</p>}
      <div className="mt-9 sm:mt-11">{children}</div>
    </section>
  );
}
