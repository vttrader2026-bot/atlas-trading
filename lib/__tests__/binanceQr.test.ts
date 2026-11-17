// BINANCE-QR-v1
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

describe("Binance referral QR", () => {
  it("is the original provided image, byte for byte", () => {
    const sha = createHash("sha256").update(readFileSync("public/binance-referral-qr.png")).digest("hex");
    expect(sha).toBe("585346ac53b18e21f110c772bbaa70589bc79c899c8af3a912f027c371066045");
  });
  it("is shown as a plain <img> (not re-encoded by next/image) with alt text, on a white quiet-zone tile, crisp when scaled", () => {
    const c = readFileSync("components/academy/BinanceQrCode.tsx", "utf8");
    expect(c).toContain('src="/binance-referral-qr.png"');
    expect(c).not.toContain("next/image");
    expect(c).toContain("bg-white");
    expect(c).toContain("[image-rendering:pixelated]");
    expect(c).toContain("alt={CHROME.alt[lang]}");
  });
  it("no QR generator is used anywhere", () => {
    const pkg = readFileSync("package.json", "utf8");
    expect(pkg).not.toMatch(/qrcode|qr-code|qrious/i);
  });
  it("the card keeps the separate clickable registration link and referral code next to the QR", () => {
    const card = readFileSync("components/academy/BinanceResourceCard.tsx", "utf8");
    expect(card).toContain("<BinanceQrCode />");
    expect(card).toContain("href={R.href}");
    const res = readFileSync("lib/binanceResource.ts", "utf8");
    expect(res).toContain('href: "https://www.binance.com/register?ref=760440372"');
    const cta = readFileSync("components/academy/ReferralCTA.tsx", "utf8");
    expect(cta).toContain('target="_blank"');
    expect(cta).toContain("noopener noreferrer sponsored");
  });
});
