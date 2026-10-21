import type { Answer, Member, PlanConflict, StoredPlan, Vote } from "./types";

// Pure rules for who we're waiting on, what conflicts, and which plan the
// family could settle on. No I/O, so they're unit-tested directly.

export function waitingOnAnswers(members: Member[], answers: Answer[]): string[] {
  const answered = new Set(answers.map((a) => a.memberId));
  return members.filter((m) => !answered.has(m.id)).map((m) => m.name);
}

export function roundPlans(plans: StoredPlan[], round: number): StoredPlan[] {
  return plans.filter((p) => p.round === round).sort((a, b) => a.idx - b.idx);
}

// A member has voted once they've voted on every plan in the round.
export function waitingOnVotes(members: Member[], plans: StoredPlan[], votes: Vote[]): string[] {
  if (plans.length === 0) return [];
  return members
    .filter((m) => plans.some((p) => !votes.some((v) => v.memberId === m.id && v.planId === p.id)))
    .map((m) => m.name);
}

export function planConflicts(plan: StoredPlan, members: Member[], votes: Vote[], answers: Answer[] = []): PlanConflict[] {
  const conflicts: PlanConflict[] = [];
  for (const v of votes) {
    if (v.planId !== plan.id || v.choice !== "no") continue;
    const member = members.find((m) => m.id === v.memberId);
    if (!member) continue;
    conflicts.push({ memberName: member.name, kind: "vetoed", detail: v.comment || "Voted no" });
  }
  for (const fit of plan.data.fitsMembers) {
    if (fit.conflict.trim()) {
      conflicts.push({ memberName: fit.memberName, kind: "constraint", detail: fit.conflict.trim() });
    }
  }

  // Facts checked against Google Maps (hours) and Transitous (travel).
  plan.live?.stops.forEach((live, i) => {
    const stop = plan.data.stops[i];
    if (!stop) return;
    if (live.openStatus === "closed") {
      conflicts.push({ memberName: "Everyone", kind: "closed", detail: `${stop.place} is closed that day${live.hoursText ? ` (${live.hoursText})` : ""}` });
    } else if (live.openStatus === "outside") {
      conflicts.push({ memberName: "Everyone", kind: "closed", detail: `${stop.place} isn't open at ${stop.start}${live.hoursText ? ` (${live.hoursText})` : ""}` });
    } else if (live.openStatus === "partly") {
      conflicts.push({ memberName: "Everyone", kind: "closed", detail: `${stop.place} isn't open for the whole visit${live.hoursText ? ` (${live.hoursText})` : ""}` });
    }
    if (live.routeMinutes == null) return;
    const over = members.filter((m) => {
      const a = answers.find((x) => x.memberId === m.id);
      return a && live.routeMinutes! > a.maxTravelMinutes;
    });
    if (over.length > 0) {
      conflicts.push({
        memberName: over.map((m) => m.name).join(", "),
        kind: "travel",
        detail: `Getting to ${stop.place} really takes ${live.routeMinutes} min, over their limit`,
      });
    }
  });
  return conflicts;
}

// Once everyone has voted: the plan nobody vetoed with the most "love" votes,
// then the most "ok" votes. Null when every plan has a veto, or on a tie.
export function agreementCandidate(members: Member[], plans: StoredPlan[], votes: Vote[]): number | null {
  if (plans.length === 0 || waitingOnVotes(members, plans, votes).length > 0) return null;

  const scored = plans
    .map((p) => {
      const pv = votes.filter((v) => v.planId === p.id);
      return {
        id: p.id,
        no: pv.filter((v) => v.choice === "no").length,
        love: pv.filter((v) => v.choice === "love").length,
        ok: pv.filter((v) => v.choice === "ok").length,
      };
    })
    .filter((s) => s.no === 0)
    .sort((a, b) => b.love - a.love || b.ok - a.ok);

  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0].love === scored[1].love && scored[0].ok === scored[1].ok) return null;
  return scored[0].id;
}
