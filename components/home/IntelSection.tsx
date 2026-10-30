"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { miT } from "@/lib/marketIntelI18n";
import { GROUP_STYLE } from "@/lib/marketGroups";
import { CATEGORY_KEYS, CATEGORY_META, type AssetCategory } from "@/lib/marketIntelAssets";
import type { RankedAsset } from "@/lib/marketIntelCompute";
import { ChangePill, CoinLogo } from "@/components/market/MarketBits";

/** Real research categories (from the tracked registry) with real counts from the live ranking. */
export default function IntelSection({ assets, failed }: { assets: RankedAsset[] | null; failed: boolean }) {
  const { t, lang } = useLanguage();
  const count = (c: AssetCategory) => (assets ? assets.filter((a) => a.categories.includes(c)).length : null);
  const top = assets ? assets.slice(0, 5) : null;
  const short = (c: string) => miT(lang, `category.${c}Short`);

  return (
    <div className="grid lg:grid-cols-[1fr_1.05fr] gap-8 lg:gap-12 items-start">
      <div>
        <p className="text-base text-text-muted leading-relaxed max-w-lg">{t("homeV2.intel.body")}</p>
        <div className="mt-7 grid sm:grid-cols-2 gap-3">
          {CATEGORY_KEYS.map((c, i) => {
            const n = count(c);
            const official = CATEGORY_META[c].kind === "official";
            return (
              <Link
                key={c}
                href="/market-intelligence"
                className="home-tile home-rise rounded-xl border border-line bg-surface p-5 relative overflow-hidden"
                style={{ animationDelay: `${i * 70}ms`, "--c": GROUP_STYLE[c].color } as React.CSSProperties}
              >
                <span aria-hidden className="absolute inset-y-0 start-0 w-1" style={{ background: GROUP_STYLE[c].color }} />
                <div className="font-heading text-lg font-bold leading-tight">{miT(lang, `category.${c}`)}</div>
                <div className="mt-1.5 text-sm text-text-muted">{official ? t("homeV2.intel.official") : t("homeV2.intel.narrative")}</div>
                <div className="mt-4 font-data text-2xl font-bold" style={{ color: GROUP_STYLE[c].color }}>
                  {n === null ? "—" : t("homeV2.intel.assets").replace("{n}", String(n))}
                </div>
              </Link>
            );
          })}
        </div>
        <Link href="/market-intelligence" className="btn-primary mt-7 inline-flex items-center gap-2">
          {t("intelSection.cta")} <span aria-hidden className="rtl:rotate-180">{"→"}</span>
        </Link>
      </div>

      <div className="panel overflow-hidden home-rise" style={{ animationDelay: "0.15s" }}>
        <div className="flex items-center justify-between px-5 h-12 border-b border-line">
          <span className="text-label">{t("homeV2.intel.topTitle")}</span>
          <span className="text-xs text-text-muted">{t("homeV2.intel.perf7d")}</span>
        </div>
        {top === null ? (
          <div className="px-5 py-10 text-center text-sm text-text-muted">{failed ? t("homeV2.intel.unavailable") : t("marketOverview.loading")}</div>
        ) : (
          <ul className="divide-y divide-line">
            {top.map((a, i) => (
              <li key={a.symbol} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <span className="flex items-center gap-3 min-w-0">
                  <span className="font-data text-sm text-text-muted w-5">{i + 1}</span>
                  <CoinLogo base={a.symbol} size={34} />
                  <span className="min-w-0">
                    <span className="block font-data font-semibold text-base leading-tight">{a.symbol}</span>
                    <span className="flex flex-wrap gap-1.5 mt-1">
                      {a.categories.map((c) => (
                        <span key={c} className="grp-chip" style={{ "--c": GROUP_STYLE[c].color } as React.CSSProperties}>{short(c)}</span>
                      ))}
                    </span>
                  </span>
                </span>
                <ChangePill value={a.perf7dPct} digits={1} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
