import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dictionaries } from "@/lib/i18n";

const TELEGRAM = "https://t.me/atlastradingcrypto";
const WHATSAPP = "https://chat.whatsapp.com/Br0OH7mHCHv6MpTmIas2Je?mode=gi_t";

type L = "en" | "ar" | "fr";
const get = (l: L, path: string): string =>
  path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], dictionaries[l]) as string;

describe("community sections", () => {
  it("homepage and Academy link to the right communities", () => {
    for (const f of ["components/home/CommunitySection.tsx", "components/academy/AcademyIndex.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src).toContain(TELEGRAM);
      expect(src).toContain(WHATSAPP);
    }
  });
  it("homepage copy describes Telegram and WhatsApp in all three languages", () => {
    for (const l of ["en", "ar", "fr"] as const) {
      const tg = get(l, "communitySection.telegramBody");
      const wa = get(l, "homeV2.community.liveBody");
      expect(tg.length).toBeGreaterThan(40);
      expect(wa).toContain("ATLAS TRADING");
      expect(tg).not.toBe(wa);
    }
    expect(get("en", "communitySection.telegramBody")).toMatch(/Sunday/);
    expect(get("fr", "communitySection.telegramBody")).toMatch(/dimanche/);
    expect(get("ar", "communitySection.telegramBody")).toMatch(/الأحد|أحد/);
  });
  it("no longer claims the weekly session is on WhatsApp", () => {
    expect(["subtitle", "liveTitle", "liveBody"].map((k) => get("en", `homeV2.community.${k}`)).join(" ")).not.toMatch(/weekly/i);
    expect(readFileSync("components/academy/AcademyIndex.tsx", "utf8")).not.toMatch(/weekly live education session on WhatsApp/);
  });
});
