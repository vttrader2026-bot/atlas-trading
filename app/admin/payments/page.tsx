// ADMIN-v1: the old secret-based payments page now lives in the owner dashboard.
import { redirect } from "next/navigation";

export default function AdminPaymentsRedirect() {
  redirect("/admin?tab=payments");
}
