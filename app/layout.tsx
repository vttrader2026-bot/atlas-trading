import type { Metadata, Viewport } from "next";
import { Inter, Sora, JetBrains_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import JournalSync from "@/components/JournalSync";
import TickerStrip from "@/components/TickerStrip";
import Footer from "@/components/Footer";
import RegisterServiceWorker from "@/components/RegisterServiceWorker";
import { LanguageProvider } from "@/lib/i18n";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-heading-family",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const SITE_URL = "https://www.atlastrading.app";
const SITE_TITLE = "Atlas Trading — Read the Chart. Plan the Trade.";
const SITE_DESCRIPTION =
  "Free AI chart analysis, market radar and risk tools for every Binance USDT pair. No account needed.";

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
    <html lang="en">
      <body
        className={`${inter.variable} ${sora.variable} ${jetbrainsMono.variable} antialiased`}
      >
        <ClerkProvider signInUrl="/sign-in" signUpUrl="/sign-up">
        <LanguageProvider>
          <RegisterServiceWorker />
          <Nav />
          <JournalSync />
          <TickerStrip />
          {children}
          <Footer />
        </LanguageProvider>
      </ClerkProvider>
      </body>
    </html>
  );
}
