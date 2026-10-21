import { describe, expect, it } from "vitest";
import { agreementCandidate, planConflicts, roundPlans, waitingOnAnswers, waitingOnVotes } from "./conflicts";
import { buildPrompt } from "./generate";
import { DayPlanSchema, PlanSetSchema } from "./plan-schema";
import { samplePlans } from "./sample-plans";
import type { Answer, Member, StoredPlan, Trip, Vote, VoteChoice } from "./types";

const members: Member[] = [
  { id: 1, name: "Sam", role: "parent", age: 42 },
  { id: 2, name: "Alex", role: "parent", age: 40 },
  { id: 3, name: "Mia", role: "kid", age: 12 },
  { id: 4, name: "Leo", role: "kid", age: 6 },
];

const trip: Trip = { slug: "t1", destination: "Kyoto", date: "2026-11-02", hotelArea: "Gion", createdAt: 0, agreedPlanId: null, agreedAt: null };

function answer(memberId: number, extra: Partial<Answer> = {}): Answer {
  return { memberId, energy: 3, mustDo: "", mustAvoid: "", food: "", maxTravelMinutes: 30, budget: "ok", submittedAt: 0, ...extra };
}

const allAnswers = members.map((m) => answer(m.id, m.id === 4 ? { energy: 2, mustAvoid: "long walks" } : {}));

const plans: StoredPlan[] = samplePlans({ trip, members, answers: allAnswers, previousPlans: [], previousVotes: [] }).map(
  (data, idx) => ({ id: 10 + idx, round: 1, idx, data, live: null }),
);

// votes[memberIndex][planIndex]
function votesFrom(grid: VoteChoice[][]): Vote[] {
  return grid.flatMap((row, mi) => row.map((choice, pi) => ({ memberId: members[mi].id, planId: plans[pi].id, choice, comment: "" })));
}

describe("waiting on", () => {
  it("lists members who haven't answered", () => {
    expect(waitingOnAnswers(members, [answer(1), answer(3)])).toEqual(["Alex", "Leo"]);
    expect(waitingOnAnswers(members, allAnswers)).toEqual([]);
  });

  it("counts a member as voted only after voting on every plan", () => {
    const partial: Vote[] = [
      ...plans.map((p) => ({ memberId: 1, planId: p.id, choice: "ok" as const, comment: "" })),
      { memberId: 2, planId: plans[0].id, choice: "love", comment: "" },
    ];
    expect(waitingOnVotes(members, plans, partial)).toEqual(["Alex", "Mia", "Leo"]);
  });

  it("waits on nobody when there are no plans", () => {
    expect(waitingOnVotes(members, [], [])).toEqual([]);
  });
});

describe("planConflicts", () => {
  it("flags no votes with the comment, and constraint conflicts Claude reported", () => {
    const votes: Vote[] = [{ memberId: 3, planId: plans[1].id, choice: "no", comment: "Too much walking" }];
    const conflicts = planConflicts(plans[1], members, votes);
    expect(conflicts).toContainEqual({ memberName: "Mia", kind: "vetoed", detail: "Too much walking" });
    expect(conflicts).toContainEqual({ memberName: "Leo", kind: "constraint", detail: 'May clash with "long walks".' });
  });

  it("is empty for a plan nobody objects to", () => {
    expect(planConflicts(plans[0], members, [])).toEqual([]);
  });
});

describe("agreementCandidate", () => {
  it("is null until everyone has voted", () => {
    const votes = votesFrom([
      ["love", "ok", "ok"],
      ["love", "ok", "ok"],
      ["love", "ok", "ok"],
    ]);
    expect(agreementCandidate(members, plans, votes)).toBeNull();
  });

  it("picks the unvetoed plan with the most love", () => {
    const votes = votesFrom([
      ["ok", "love", "love"],
      ["love", "love", "ok"],
      ["ok", "love", "love"],
      ["ok", "no", "ok"],
    ]);
    // Plan 1 has the most love but Leo vetoed it; plan 2 beats plan 0 on love.
    expect(agreementCandidate(members, plans, votes)).toBe(plans[2].id);
  });

  it("breaks love ties on ok votes", () => {
    const votes = votesFrom([
      ["love", "love", "no"],
      ["ok", "ok", "love"],
      ["ok", "no", "love"],
      ["ok", "ok", "love"],
    ]);
    expect(agreementCandidate(members, plans, votes)).toBe(plans[0].id);
  });

  it("is null when every plan has a no", () => {
    const votes = votesFrom([
      ["no", "love", "love"],
      ["love", "no", "love"],
      ["love", "love", "no"],
      ["ok", "ok", "ok"],
    ]);
    expect(agreementCandidate(members, plans, votes)).toBeNull();
  });

  it("is null on an exact tie", () => {
    const votes = votesFrom([
      ["love", "love", "no"],
      ["ok", "ok", "ok"],
      ["ok", "ok", "ok"],
      ["ok", "ok", "ok"],
    ]);
    expect(agreementCandidate(members, plans, votes)).toBeNull();
  });
});

describe("plans", () => {
  it("sample plans match the schema Claude must return", () => {
    expect(() => PlanSetSchema.parse({ plans: plans.map((p) => p.data), notes: "estimates" })).not.toThrow();
    for (const p of plans) expect(p.data.fitsMembers.map((f) => f.memberName)).toEqual(members.map((m) => m.name));
  });

  it("rejects a plan missing required fields", () => {
    const broken: Partial<StoredPlan["data"]> = { ...plans[0].data };
    delete broken.stops;
    expect(DayPlanSchema.safeParse(broken).success).toBe(false);
  });

  it("roundPlans returns only that round, in order", () => {
    const mixed: StoredPlan[] = [{ ...plans[1], round: 2 }, ...plans];
    expect(roundPlans(mixed, 1).map((p) => p.id)).toEqual(plans.map((p) => p.id));
  });
});

describe("buildPrompt", () => {
  it("includes every member's answers", () => {
    const prompt = buildPrompt({ trip, members, answers: allAnswers, previousPlans: [], previousVotes: [] });
    expect(prompt).toContain("Leo (kid, age 6)");
    expect(prompt).toContain("must avoid: long walks");
    expect(prompt).toContain("Staying near: Gion");
    expect(prompt).not.toContain("Last round");
  });

  it("feeds back last round's votes and comments", () => {
    const votes: Vote[] = [{ memberId: 4, planId: plans[1].id, choice: "no", comment: "too tiring" }];
    const prompt = buildPrompt({ trip, members, answers: allAnswers, previousPlans: plans, previousVotes: votes });
    expect(prompt).toContain("Last round");
    expect(prompt).toContain('Leo: no ("too tiring")');
  });
});
