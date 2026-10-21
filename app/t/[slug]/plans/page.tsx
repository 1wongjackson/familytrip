import { Suspense } from "react";
import { PlansVote } from "@/components/PlansVote";

export default function PlansPage({ params }: PageProps<"/t/[slug]/plans">) {
  return (
    <Suspense fallback={<p className="text-stone-500">Loading plans…</p>}>
      <Resolved params={params} />
    </Suspense>
  );
}

async function Resolved({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PlansVote slug={slug} />;
}
