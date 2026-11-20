import type { Metadata } from "next";

// The route stays /market-intelligence (existing bookmarks and links keep working); the product is named Institutional Radar.
const TITLE = "Institutional Radar | Atlas Trading";
const DESCRIPTION =
  "Institutional Radar is a curated crypto research tool that helps users discover and compare digital assets connected to major institutional portfolios, indices and public market narratives. It is designed for research and discovery, not as a guarantee of investment performance.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/market-intelligence" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/market-intelligence",
    siteName: "Atlas Trading",
    type: "website",
    images: [{ url: "/brand/og-200.png", width: 200, height: 200, alt: "Atlas Trading" }],
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION, images: ["/brand/og-200.png"] },
};

export default function MarketIntelligenceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
