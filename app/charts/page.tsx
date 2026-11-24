import type { Metadata } from "next";
import ChartWorkspace from "@/components/charts/ChartWorkspace";

const TITLE = "ATLAS CHARTS | Atlas Trading";
const DESCRIPTION =
  "Free live Binance Spot charts: candlesticks, volume and EMA indicators for USDT pairs on 15m, 1h, 4h, 1D and 1W timeframes.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/charts" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/charts",
    siteName: "Atlas Trading",
    type: "website",
    images: [{ url: "/brand/og-200.png", width: 200, height: 200, alt: "Atlas Trading" }],
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION, images: ["/brand/og-200.png"] },
};

export default function ChartsPage() {
  return <ChartWorkspace />;
}
