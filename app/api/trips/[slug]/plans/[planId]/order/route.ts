import * as z from "zod";
import { getMembers, getPlans, getTrip, updatePlan } from "@/lib/db";
import { weekdayOf } from "@/lib/places";
import { isPermutation, permute, retime } from "@/lib/reorder";
import { departureIso, travelMinutes } from "@/lib/transitous";

const Body = z.object({
  memberId: z.number().int(),
  order: z.array(z.number().int()),
});

// Rearranges a plan's stops from the map. Allowed after the trip is settled
// too: that's fine-tuning the agreed day.
export async function POST(req: Request, ctx: RouteContext<"/api/trips/[slug]/plans/[planId]/order">) {
  const { slug, planId } = await ctx.params;
  const trip = getTrip(slug);
  if (!trip) return Response.json({ error: "Trip not found" }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid order." }, { status: 400 });
  const member = getMembers(slug).find((m) => m.id === parsed.data.memberId);
  if (!member) return Response.json({ error: "Not a member of this trip." }, { status: 403 });

  const plan = getPlans(slug).find((p) => p.id === Number(planId));
  if (!plan) return Response.json({ error: "Plan not found." }, { status: 404 });
  const { order } = parsed.data;
  if (!isPermutation(order, plan.data.stops.length)) return Response.json({ error: "Invalid order." }, { status: 400 });
  if (order.every((i, k) => i === k)) return Response.json({ ok: true });

  const dayStart = plan.data.stops[0].start;
  const weekday = weekdayOf(trip.date);
  const moved = permute(plan.data, plan.live, order, member.name);
  // First pass gives departure times for the new legs.
  let timed = retime(moved.data, moved.live, weekday, dayStart);

  const live = timed.live;
  const offset = live?.utcOffsetMinutes;
  if (live && offset != null && moved.changedLegs.length > 0) {
    const errors = new Set<string>();
    // One leg at a time, to keep the load on Transitous light.
    for (const k of moved.changedLegs) {
      const from = k === 0 ? live.hotel?.location : live.stops[k - 1]?.location;
      const to = live.stops[k]?.location;
      if (!from || !to) continue;
      const leaveAt = k === 0 ? timed.data.stops[0].start : timed.data.stops[k - 1].end;
      const minutes = await travelMinutes(from, to, timed.data.stops[k].getThere.mode, departureIso(trip.date, leaveAt, offset), errors);
      if (minutes != null) {
        live.stops[k].routeMinutes = minutes;
        timed.data.stops[k].getThere.note = "New order: travel time checked.";
      }
    }
    if (errors.size > 0) console.warn("Reorder route checks failed:", [...errors].join("; "));
    timed = retime(timed.data, live, weekday, dayStart);
  }

  updatePlan(plan.id, timed.data, timed.live);
  return Response.json({ ok: true });
}
