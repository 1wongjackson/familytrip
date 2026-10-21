import { roundPlans } from "@/lib/conflicts";
import { getAnswers, getMembers, getPlans, getTrip, getVotes, savePlans, tryLockGeneration, unlockGeneration } from "@/lib/db";
import { GenerationError, generatePlans } from "@/lib/generate";
import { enrichPlans } from "@/lib/places";

// Generation can take a minute or two with thinking on.
export const maxDuration = 300;

export async function POST(_req: Request, ctx: RouteContext<"/api/trips/[slug]/plans">) {
  const { slug } = await ctx.params;
  const tripRow = getTrip(slug);
  if (!tripRow) return Response.json({ error: "Trip not found" }, { status: 404 });
  if (tripRow.agreedPlanId) return Response.json({ error: "This trip is already settled." }, { status: 409 });

  const members = getMembers(slug);
  const answers = getAnswers(slug);
  if (answers.length < members.length) {
    return Response.json({ error: "Everyone needs to answer first." }, { status: 409 });
  }

  if (!tryLockGeneration(slug)) {
    return Response.json({ error: "Plans are already being made on another phone." }, { status: 409 });
  }

  try {
    const plans = getPlans(slug);
    const lastRound = plans.reduce((max, p) => Math.max(max, p.round), 0);
    const newPlans = await generatePlans({
      trip: tripRow,
      members,
      answers,
      previousPlans: roundPlans(plans, lastRound),
      previousVotes: getVotes(slug),
    });
    // Live checks are best-effort: plans are still saved if Google fails.
    const live = await enrichPlans(newPlans, tripRow).catch((err) => {
      console.error("Google Maps checks failed", err);
      return null;
    });
    savePlans(slug, lastRound + 1, newPlans, live);
    return Response.json({ ok: true, round: lastRound + 1 });
  } catch (err) {
    if (err instanceof GenerationError) return Response.json({ error: err.message }, { status: 502 });
    console.error("Plan generation failed", err);
    return Response.json({ error: "Something went wrong making plans." }, { status: 500 });
  } finally {
    unlockGeneration(slug);
  }
}
