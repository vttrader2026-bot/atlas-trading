// PERFORMANCE-v1: private page (see lib/privateRoutes.ts). All figures come from the member's own Journal, read-only.
import type { Metadata } from "next";
import PerformanceView from "@/components/performance/PerformanceView";

export const metadata: Metadata = { title: "Performance Center | Atlas Trading", robots: { index: false, follow: false } };

export default function PerformancePage() {
  return <PerformanceView />;
}
