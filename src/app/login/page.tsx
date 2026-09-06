import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { getAppUser, safeNextPath } from "@/lib/auth/user";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(next);
  const user = await getAppUser();
  if (user) redirect(nextPath);
  return <LoginForm nextPath={nextPath} />;
}
