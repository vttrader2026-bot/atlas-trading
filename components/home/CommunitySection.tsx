"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n";
import { lessons } from "@/lib/academy-content";
import { IconAcademy } from "@/components/icons";
import { IconTelegram, IconWhatsapp } from "@/components/home/brandIcons";

export default function CommunitySection() {
  const { t, lang } = useLanguage();
  const ready = lessons.filter((l) => l.ready).length;
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="grid gap-4">
        <div className="home-tile home-rise rounded-2xl border border-line bg-surface p-6" style={{ ["--hover" as string]: "#26A5E4" }}>
          <div className="flex items-start gap-5">
            <IconTelegram className="w-14 h-14 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-lg font-semibold">{t("communitySection.telegram")}</div>
              <p className="mt-1 text-base text-text-muted leading-snug">{t("communitySection.telegramBody")}</p>
            </div>
          </div>
          <a href="https://t.me/atlastradingcrypto" target="_blank" rel="noopener noreferrer" className="btn-primary mt-5 inline-flex items-center gap-1.5">
            {t("communitySection.telegramCta")} <span aria-hidden className="rtl:rotate-180">{"→"}</span>
          </a>
        </div>

        <div className="home-tile home-rise rounded-2xl border border-line bg-surface p-6" style={{ animationDelay: "80ms" }}>
          <div className="flex items-start gap-5">
            <IconWhatsapp className="w-14 h-14 shrink-0" />
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold border border-gold/40 rounded-full px-2.5 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-gold" />{t("homeV2.community.liveTitle")}
              </span>
              <div className="mt-2 text-lg font-semibold">{t("communitySection.whatsapp")}</div>
              <p className="mt-1 text-base text-text-muted leading-snug">{t("homeV2.community.liveBody")}</p>
            </div>
          </div>
          <a href="https://chat.whatsapp.com/Br0OH7mHCHv6MpTmIas2Je?mode=gi_t" target="_blank" rel="noopener noreferrer" className="btn-secondary mt-5 inline-flex items-center gap-1.5">
            {t("communitySection.whatsappCta")} <span aria-hidden className="rtl:rotate-180">{"→"}</span>
          </a>
        </div>
      </div>

      <div className="card card-accent p-7 sm:p-9 flex flex-col home-rise" style={{ animationDelay: "120ms" }}>
        <span className="w-11 h-11 rounded-xl border border-line flex items-center justify-center text-gold bg-gold/5"><IconAcademy className="w-6 h-6" /></span>
        <h3 className="mt-5 font-heading text-2xl sm:text-3xl font-bold tracking-tight">{t("homeV2.community.academyTitle")}</h3>
        <p className="mt-3 text-base text-text-muted leading-relaxed max-w-md">{t("homeV2.community.academyBody")}</p>
        <div className="mt-6 flex items-baseline gap-3">
          <span className="font-data text-5xl font-bold text-gold">{ready}</span>
          <span className="text-base text-text-muted">{t("homeV2.products.lessons").replace("{n}", "").trim()}</span>
        </div>
        <div className="mt-auto pt-8 flex flex-wrap items-center gap-3">
          <Link href="/academy" className="btn-primary inline-flex items-center gap-2">{t("homeV2.community.academyCta")} <span aria-hidden className="rtl:rotate-180">{"→"}</span></Link>
          <a href={`/academy/atlas-crypto-course-${lang}.pdf`} download className="btn-secondary inline-flex items-center gap-2">{t("homeV2.community.pdf")}</a>
        </div>
      </div>
    </div>
  );
}
