import { Suspense } from "react";
import { PlanMap } from "@/components/PlanMap";

export default function MapPage({ params }: PageProps<"/t/[slug]/plans/[planId]/map">) {
  return (
    <Suspense fallback={<p className="text-stone-500">Loading map…</p>}>
      <Resolved params={params} />
    </Suspense>
  );
}

async function Resolved({ params }: { params: Promise<{ slug: string; planId: string }> }) {
  const { slug, planId } = await params;
  return <PlanMap slug={slug} planId={Number(planId)} />;
}
