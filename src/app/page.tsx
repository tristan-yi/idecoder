import { HomeClient } from "@/components/HomeClient";
import { getAppUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getAppUser();
  if (!user) redirect("/login");
  return <HomeClient user={user} />;
}
