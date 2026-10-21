import * as z from "zod";
import { agree } from "@/lib/db";
import { loadTripState } from "@/lib/state";

const Body = z.object({ planId: z.number().int() });

// Only the plan the votes point to can be confirmed, so one person can't
// settle the trip over someone else's "no".
export async function POST(req: Request, ctx: RouteContext<"/api/trips/[slug]/agree">) {
  const { slug } = await ctx.params;
  const state = loadTripState(slug);
  if (!state) return Response.json({ error: "Trip not found" }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  if (state.trip.agreedPlanId) return Response.json({ ok: true });
  if (state.candidatePlanId !== parsed.data.planId) {
    return Response.json({ error: "The votes don't point to that plan yet." }, { status: 409 });
  }

  agree(slug, parsed.data.planId);
  return Response.json({ ok: true });
}
