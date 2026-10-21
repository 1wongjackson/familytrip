import * as z from "zod";
import { getMembers, getTrip, saveAnswer } from "@/lib/db";

const Body = z.object({
  memberId: z.number().int(),
  energy: z.number().int().min(1).max(5),
  mustDo: z.string().trim().max(300).default(""),
  mustAvoid: z.string().trim().max(300).default(""),
  food: z.string().trim().max(300).default(""),
  maxTravelMinutes: z.number().int().min(5).max(180),
  budget: z.enum(["tight", "ok", "flexible"]),
});

export async function POST(req: Request, ctx: RouteContext<"/api/trips/[slug]/answers">) {
  const { slug } = await ctx.params;
  const trip = getTrip(slug);
  if (!trip) return Response.json({ error: "Trip not found" }, { status: 404 });
  if (trip.agreedPlanId) return Response.json({ error: "This trip is already settled." }, { status: 409 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Some answers are missing." }, { status: 400 });
  if (!getMembers(slug).some((m) => m.id === parsed.data.memberId)) {
    return Response.json({ error: "Not a member of this trip." }, { status: 403 });
  }

  saveAnswer(parsed.data);
  return Response.json({ ok: true });
}
