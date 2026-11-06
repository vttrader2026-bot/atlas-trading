import { AdminDashboard } from "@/components/admin/AdminDashboard";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  return <AdminDashboard initialTab={tab === "members" || tab === "payments" ? tab : "signals"} />;
}
