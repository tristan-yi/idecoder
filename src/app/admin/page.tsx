import { redirect } from "next/navigation";
import { AdminClient } from "@/components/AdminClient";
import { getAdminInsights } from "@/lib/admin/insights";
import { isAdminEmail } from "@/lib/auth/admin";
import { getAppUser } from "@/lib/auth/user";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getAppUser();
  if (!user) redirect("/login?next=/admin");
  if (!isAdminEmail(user.email)) redirect("/");
  const initial = await getAdminInsights();
  return <AdminClient user={user} initial={initial} />;
}
