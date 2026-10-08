import AcademyIndex from "@/components/academy/AcademyIndex";

// Metadata is static (language isn't known server-side), so it defaults to
// English — the same default the site's language provider starts with.
export const metadata = {
  title: "Academy — Atlas Trading",
  description:
    "Short, practical lessons on crypto trading basics, technical analysis, and risk management — in English, Arabic, and French.",
};

export default function AcademyPage() {
  return <AcademyIndex />;
}
