"use client";

import { useLanguage } from "@/lib/i18n";

// BINANCE-QR-v1
// The ORIGINAL Binance referral QR image, served untouched from /public (a plain <img>, so nothing re-encodes or resizes
// the file). It sits on a white tile that supplies the quiet zone scanners need, in light and dark themes alike.
// Pixelated rendering keeps the modules crisp at any display size. Never regenerate this image.
const CHROME = {
  alt: { en: "Binance referral QR code", ar: "رمز QR للإحالة في Binance", fr: "QR code de parrainage Binance" },
  caption: { en: "Scan with the Binance app", ar: "امسحه بتطبيق Binance", fr: "Scannez avec l'application Binance" },
};

export default function BinanceQrCode() {
  const { lang } = useLanguage();
  return (
    <figure className="m-0 flex shrink-0 flex-col items-center gap-2">
      <div className="rounded-2xl bg-white p-3 shadow-sm">
        {/* eslint-disable-next-line @next/next/no-img-element -- the QR must be shown byte-for-byte, not optimized */}
        <img
          src="/binance-referral-qr.png"
          alt={CHROME.alt[lang]}
          width={267}
          height={267}
          decoding="async"
          className="block h-auto w-44 max-w-full sm:w-48 [image-rendering:pixelated]"
        />
      </div>
      <figcaption className="text-xs text-text-muted">{CHROME.caption[lang]}</figcaption>
    </figure>
  );
}
