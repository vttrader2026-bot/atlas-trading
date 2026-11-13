"use client";
// SHARE-PHONES-v1: the Share page's visual. Reuses the existing virtual iPhone components (no new phone design): the
// homepage hero phone (Analyzer + Trade Feed) and the Atlas Investor phone. Both show clearly labelled DEMO data only.
import HeroPhone from "@/components/home/HeroPhone";
import InvestorPhone from "@/components/home/InvestorPhone";

export type PhoneCaptions = { title: string; sub: string; a: string; b: string };

export default function SharePhones({ c }: { c: PhoneCaptions }) {
  return (
    <section className="mt-8 rounded-3xl border border-line bg-gradient-to-b from-surface-raised to-surface px-4 py-8 sm:px-8" aria-labelledby="share-phones-title">
      <h2 id="share-phones-title" className="text-center font-heading text-xl sm:text-2xl font-bold tracking-tight">{c.title}</h2>
      <p className="mx-auto mt-1.5 max-w-xl text-center text-sm text-text-muted">{c.sub}</p>
      <div className="mt-8 grid grid-cols-1 gap-10 sm:grid-cols-2 sm:gap-6 place-items-center">
        <div className="w-full max-w-[270px]"><HeroPhone /><p className="mt-4 text-center text-sm font-medium">{c.a}</p></div>
        <div className="w-full max-w-[270px]"><InvestorPhone /><p className="mt-4 text-center text-sm font-medium">{c.b}</p></div>
      </div>
    </section>
  );
}
