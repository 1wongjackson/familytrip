import { Suspense } from "react";
import { TripHome } from "@/components/TripHome";

export default function TripPage({ params }: PageProps<"/t/[slug]">) {
  return (
    <Suspense fallback={<p className="text-stone-500">Loading trip…</p>}>
      <Resolved params={params} />
    </Suspense>
  );
}

async function Resolved({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <TripHome slug={slug} />;
}
