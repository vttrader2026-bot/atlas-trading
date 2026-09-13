import type { Metadata } from "next";
import { Inter, Sora, JetBrains_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import TickerStrip from "@/components/TickerStrip";
import Footer from "@/components/Footer";
import { LanguageProvider } from "@/lib/i18n";
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

export const metadata: Metadata = {
  title: "Atlas Trading — crypto chart analyzer, journal & risk tools",
  description:
    "Read a chart, size a position, log the trade. A free crypto trading toolkit for every USDT pair on Binance.",
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
        <LanguageProvider>
          <Nav />
          <TickerStrip />
          {children}
          <Footer />
        </LanguageProvider>
      </body>
    </html>
  );
}
