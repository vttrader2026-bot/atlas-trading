import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Nav from "@/components/Nav";
import JournalSync from "@/components/JournalSync";
import Footer from "@/components/Footer";
import QuickNav, { QuickNavSpacer } from "@/components/QuickNav";
import LazyGlobals from "@/components/LazyGlobals";
import RegisterServiceWorker from "@/components/RegisterServiceWorker";
import { InstallProvider } from "@/components/InstallApp";
import { LanguageProvider } from "@/lib/i18n";
import { LANG_BOOT_SCRIPT } from "@/lib/i18n/boot";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

// Self-hosted (app/fonts, see README there): the build must not depend on Google Fonts being reachable. Same families, variable
// weight ranges, subsets and CSS variable names as the former Google Fonts setup.
const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  adjustFontFallback: "Arial",
  variable: "--font-sans",
});

const sora = localFont({
  src: "./fonts/sora-latin-wght-normal.woff2",
  weight: "100 800",
  style: "normal",
  display: "swap",
  adjustFontFallback: "Arial",
  variable: "--font-heading-family",
  preload: false,
});

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  weight: "100 800",
  style: "normal",
  display: "swap",
  adjustFontFallback: "Arial",
  variable: "--font-jetbrains-mono",
  preload: false,
});

const SITE_URL = "https://www.atlastrading.app";
const SITE_TITLE = "Atlas Trading | Crypto Market Intelligence & Trading Tools";
const SITE_DESCRIPTION =
  "Analyze crypto charts with AI, discover market opportunities, track institutional indexes, and manage risk — all in one trading workspace.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Atlas Trading",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/brand/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: "Atlas Trading",
    type: "website",
    images: [
      {
        url: "/brand/og-200.png",
        width: 200,
        height: 200,
        alt: "Atlas Trading",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/brand/og-200.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0d12" },
    { media: "(prefers-color-scheme: light)", color: "#f5f7fb" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the boot script below may already have set lang/dir for a saved Arabic/French (before first paint).
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* PERF-3: runs before the first paint; sets lang/dir from the saved language and holds the page back until it is loaded. */}
        <script dangerouslySetInnerHTML={{ __html: LANG_BOOT_SCRIPT }} />
      </head>
      <body
        className={`${inter.variable} ${sora.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up" signInFallbackRedirectUrl="/workflow" signUpFallbackRedirectUrl="/workflow">
        <LanguageProvider>
          <RegisterServiceWorker />
          <InstallProvider>
            <Nav />
            <JournalSync />
            <div className="lg:flex">
              <QuickNav />
              <div className="min-w-0 flex-1">{children}</div>
            </div>
            <Footer />
            <QuickNavSpacer />
            <LazyGlobals />
          </InstallProvider>
        </LanguageProvider>
      </ClerkProvider>
      </body>
    </html>
  );
}
