import { PadClient } from "@/components/PadClient";
import { getAppUser } from "@/lib/auth/user";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getAppUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/pad/${id}`)}`);
  return <PadClient id={id} user={user} />;
}
