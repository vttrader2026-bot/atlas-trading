import { Noto_Sans_Arabic } from "next/font/google";

// Arabic font for the Social Media Studio images. The rest of the site has no Arabic web
// font, so it is loaded here — on the Share route only — so exported Arabic
// images look the same on every device instead of depending on system fonts.
const notoArabic = Noto_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

export const metadata = {
  title: "Social Media Studio — Atlas Trading",
  description: "Create Atlas Trading marketing images with virtual phones for TikTok, Instagram and Facebook — in English, French and Arabic.",
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return <div className={notoArabic.variable}>{children}</div>;
}
