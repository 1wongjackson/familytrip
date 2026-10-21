import * as z from "zod";

// Shape Claude must return. Kept free of min/max constraints so it stays
// within what structured outputs accept; counts are checked after parsing.

export const TRANSPORT_MODES = ["walk", "metro", "bus", "tram", "train", "taxi", "car", "ferry", "other"] as const;

export const StopSchema = z.object({
  start: z.string().describe("24h local time, e.g. 09:30"),
  end: z.string().describe("24h local time"),
  place: z.string(),
  area: z.string().describe("Neighbourhood or district"),
  why: z.string().describe("One sentence: why this stop suits this family"),
  trivia: z.string().describe("One short fun fact a kid would enjoy"),
  food: z.string().describe("What and where they eat here, or empty string if this is not a meal or snack stop"),
  getThere: z.object({
    mode: z.enum(TRANSPORT_MODES),
    minutes: z.number().int(),
    note: z.string().describe("Route hint from the previous stop (the hotel for the first stop)"),
  }),
});

export const MemberFitSchema = z.object({
  memberName: z.string(),
  fit: z.enum(["great", "ok", "stretch"]),
  reason: z.string().describe("How the plan meets this person's answers, citing them"),
  conflict: z.string().describe("Anything in the plan that goes against this person's answers, or empty string"),
});

export const DayPlanSchema = z.object({
  title: z.string(),
  pitch: z.string().describe("One line a family member would read aloud"),
  style: z.string().describe("e.g. relaxed, adventurous, mixed"),
  totalHours: z.number(),
  costBand: z.enum(["$", "$$", "$$$"]),
  costNote: z.string(),
  stops: z.array(StopSchema),
  fitsMembers: z.array(MemberFitSchema),
  tradeoffs: z.array(z.string()).describe("Where this plan favours one family member over another"),
});

export const PlanSetSchema = z.object({
  plans: z.array(DayPlanSchema),
  notes: z.string().describe("Anything the family should know, e.g. timings are estimates"),
});

export type Stop = z.infer<typeof StopSchema>;
export type MemberFit = z.infer<typeof MemberFitSchema>;
export type DayPlan = z.infer<typeof DayPlanSchema>;
export type PlanSet = z.infer<typeof PlanSetSchema>;
