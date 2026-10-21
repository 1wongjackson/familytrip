import type { DayPlan } from "./plan-schema";

export type Role = "parent" | "kid";
export type Budget = "tight" | "ok" | "flexible";
export type VoteChoice = "love" | "ok" | "no";

export interface Trip {
  slug: string;
  destination: string;
  date: string;
  hotelArea: string;
  createdAt: number;
  agreedPlanId: number | null;
  agreedAt: number | null;
}

export interface Member {
  id: number;
  name: string;
  role: Role;
  age: number;
}

export interface Answer {
  memberId: number;
  energy: number; // 1 (take it easy) .. 5 (go all day)
  mustDo: string;
  mustAvoid: string;
  food: string;
  maxTravelMinutes: number;
  budget: Budget;
  submittedAt: number;
}

// "outside": open that day, but not at the planned time.
export type OpenStatus = "open" | "closed" | "outside" | "partly" | "unknown";

// What Google Maps (place, hours) and Transitous (travel) say about one stop. Index-aligned with DayPlan.stops.
export interface StopLive {
  found: boolean;
  name: string;
  address: string;
  mapsUri: string;
  photoUri: string;
  photoAttribution: string;
  rating: number | null;
  openStatus: OpenStatus;
  hoursText: string;
  routeMinutes: number | null; // real travel time from the previous stop (or hotel)
}

export interface PlanLive {
  checkedAt: number;
  stops: StopLive[];
}

export interface StoredPlan {
  id: number;
  round: number;
  idx: number;
  data: DayPlan;
  live: PlanLive | null;
}

export interface Vote {
  memberId: number;
  planId: number;
  choice: VoteChoice;
  comment: string;
}

export interface PlanConflict {
  memberName: string;
  kind: "vetoed" | "constraint" | "closed" | "travel";
  detail: string;
}

export interface TripState {
  trip: Trip;
  members: Member[];
  answers: Answer[];
  plans: StoredPlan[];
  votes: Vote[];
  currentRound: number;
  generating: boolean;
  waitingOnAnswers: string[];
  waitingOnVotes: string[];
  conflicts: Record<number, PlanConflict[]>;
  candidatePlanId: number | null;
  mock: boolean;
  liveChecks: boolean; // Google Maps key configured
}
