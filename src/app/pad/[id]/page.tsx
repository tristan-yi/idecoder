import { PadClient } from "@/components/PadClient";

export default async function PadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PadClient id={id} />;
}
