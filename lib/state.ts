import { agreementCandidate, planConflicts, roundPlans, waitingOnAnswers, waitingOnVotes } from "./conflicts";
import { getAnswers, getMembers, getPlans, getTrip, getVotes, isGenerating } from "./db";
import { isMockMode } from "./generate";
import { liveChecksEnabled } from "./places";
import type { PlanConflict, TripState } from "./types";

export function loadTripState(slug: string): TripState | null {
  const tripRow = getTrip(slug);
  if (!tripRow) return null;
  const { generatingSince, ...trip } = tripRow;

  const members = getMembers(slug);
  const answers = getAnswers(slug);
  const plans = getPlans(slug);
  const votes = getVotes(slug);
  const currentRound = plans.reduce((max, p) => Math.max(max, p.round), 0);
  const current = roundPlans(plans, currentRound);

  const conflicts: Record<number, PlanConflict[]> = {};
  for (const p of current) conflicts[p.id] = planConflicts(p, members, votes, answers);

  return {
    trip,
    members,
    answers,
    plans,
    votes,
    currentRound,
    generating: isGenerating(generatingSince),
    waitingOnAnswers: waitingOnAnswers(members, answers),
    waitingOnVotes: waitingOnVotes(members, current, votes),
    conflicts,
    candidatePlanId: agreementCandidate(members, current, votes),
    mock: isMockMode(),
    liveChecks: liveChecksEnabled(),
  };
}
