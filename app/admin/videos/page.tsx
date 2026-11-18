import { AdminDashboard } from "@/components/admin/AdminDashboard";

// VIDEO-ADMIN-v1: direct link to the Videos tab. Gated by app/admin/layout.tsx (owner only, everyone else gets a 404).
export default function AdminVideosPage() {
  return <AdminDashboard initialTab="videos" />;
}
