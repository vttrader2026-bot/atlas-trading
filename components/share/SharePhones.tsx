"use client";
// SHARE-PHONES-v2: the Share page's visual. Reuses the existing virtual iPhone components unchanged (no new phone design):
// the homepage hero phone (Analyzer + Trade Feed) and the Atlas Investor phone. Both show clearly labelled DEMO data only.
import HeroPhone from "@/components/home/HeroPhone";
import InvestorPhone from "@/components/home/InvestorPhone";

export type PhoneCaptions = { title: string; sub: string; a: string; b: string };

export default function SharePhones({ c }: { c: PhoneCaptions }) {
  return (
    <section className="relative mt-8 overflow-hidden" aria-labelledby="share-phones-title">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-3xl" />
      <h2 id="share-phones-title" className="relative text-center font-heading text-2xl sm:text-3xl font-bold tracking-tight">{c.title}</h2>
      <p className="relative mx-auto mt-2 max-w-xl text-center text-sm text-text-muted">{c.sub}</p>
      {/* mobile: stacked · tablet: side by side · desktop: larger, second phone staggered lower */}
      <div className="relative mt-10 flex flex-col items-center gap-12 sm:flex-row sm:items-start sm:justify-center sm:gap-8 lg:gap-16">
        <figure className="w-full max-w-[300px] sm:max-w-[280px] lg:max-w-[340px]">
          <HeroPhone />
          <figcaption className="mt-5 text-center text-sm font-medium">{c.a}</figcaption>
        </figure>
        <figure className="w-full max-w-[300px] sm:mt-14 sm:max-w-[280px] lg:mt-20 lg:max-w-[340px]">
          <InvestorPhone />
          <figcaption className="mt-5 text-center text-sm font-medium">{c.b}</figcaption>
        </figure>
      </div>
    </section>
  );
}
