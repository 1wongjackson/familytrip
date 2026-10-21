import { Suspense } from "react";
import { TripResult } from "@/components/TripResult";

export default function ResultPage({ params }: PageProps<"/t/[slug]/result">) {
  return (
    <Suspense fallback={<p className="text-stone-500">Loading…</p>}>
      <Resolved params={params} />
    </Suspense>
  );
}

async function Resolved({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <TripResult slug={slug} />;
}
