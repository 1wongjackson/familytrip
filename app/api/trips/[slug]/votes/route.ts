import * as z from "zod";
import { getMembers, getPlans, getTrip, saveVote } from "@/lib/db";

const Body = z.object({
  memberId: z.number().int(),
  planId: z.number().int(),
  choice: z.enum(["love", "ok", "no"]),
  comment: z.string().trim().max(300).default(""),
});

export async function POST(req: Request, ctx: RouteContext<"/api/trips/[slug]/votes">) {
  const { slug } = await ctx.params;
  const trip = getTrip(slug);
  if (!trip) return Response.json({ error: "Trip not found" }, { status: 404 });
  if (trip.agreedPlanId) return Response.json({ error: "This trip is already settled." }, { status: 409 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid vote." }, { status: 400 });
  const { memberId, planId } = parsed.data;

  if (!getMembers(slug).some((m) => m.id === memberId)) {
    return Response.json({ error: "Not a member of this trip." }, { status: 403 });
  }
  const plans = getPlans(slug);
  const latestRound = plans.reduce((max, p) => Math.max(max, p.round), 0);
  if (!plans.some((p) => p.id === planId && p.round === latestRound)) {
    return Response.json({ error: "That plan is no longer up for a vote." }, { status: 409 });
  }

  saveVote(parsed.data);
  return Response.json({ ok: true });
}
