import { ReviewClient } from "@/components/review/ReviewClient";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReviewClient id={id} />;
}
