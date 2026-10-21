import { connection } from "next/server";
import { loadTripState } from "@/lib/state";

export async function GET(_req: Request, ctx: RouteContext<"/api/trips/[slug]">) {
  await connection();
  const { slug } = await ctx.params;
  const state = loadTripState(slug);
  if (!state) return Response.json({ error: "Trip not found" }, { status: 404 });
  return Response.json(state);
}
