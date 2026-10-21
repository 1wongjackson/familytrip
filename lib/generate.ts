import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { PlanSetSchema, type DayPlan, type PlanSet } from "./plan-schema";
import { samplePlans } from "./sample-plans";
import type { Answer, Member, StoredPlan, Trip, Vote } from "./types";

export const PLANS_PER_ROUND = 3;

export interface GenerateInput {
  trip: Trip;
  members: Member[];
  answers: Answer[];
  previousPlans: StoredPlan[]; // last round only
  previousVotes: Vote[];
}

// OpenCode Go only offers Claude Haiku 5.5 among Claude models. The base URL
// and model can be overridden to use OpenCode Zen instead.
const OPENCODE_GO_BASE_URL = "https://opencode.ai/inference/go/anthropic";
const OPENCODE_DEFAULT_MODEL = "claude-haiku-5-5";
const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5";

export type Provider = "opencode" | "anthropic" | "mock";

// OpenCode key wins, then Anthropic key; with neither (or FAMILYTRIP_MOCK=1)
// canned plans let the flow be tried offline.
export function provider(): Provider {
  if (process.env.FAMILYTRIP_MOCK === "1") return "mock";
  if (process.env.OPENCODE_API_KEY) return "opencode";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "mock";
}

export function isMockMode(): boolean {
  return provider() === "mock";
}

const SYSTEM = `You plan one day of a family trip for two parents and two kids of different ages.
Your job is to propose ${PLANS_PER_ROUND} genuinely different day plans that the whole family could accept, so they can vote and settle on one quickly.

- Every plan must respect each person's must-avoid, energy level and maximum travel time. If a plan cannot, say so in that person's "conflict" field rather than hiding it.
- Make the plans differ on purpose (for example one relaxed, one adventurous, one mixed), so the vote is a real choice.
- Include meals and snack stops suited to the youngest child and any food limits.
- You have no live weather or traffic data. Give realistic estimates for times and travel and say they are estimates in "notes". Opening hours (Google Maps) and travel times (public transit and walking routes) are checked after you answer, so pick places that are open on the trip's day of the week.
- Use real, well-known places in the destination, with the name as it appears on Google Maps. Keep "why" and "trivia" to one short sentence each.
- In "fitsMembers", include every family member by exact name, and cite their own answers in "reason".
- Refer to family members by name. Don't use he, she or other gendered words for them; you don't know their pronouns.`;

export function buildPrompt(input: GenerateInput): string {
  const { trip, members, answers, previousPlans, previousVotes } = input;
  const lines: string[] = [
    `Destination: ${trip.destination}`,
    `Date: ${trip.date}`,
    `Staying near: ${trip.hotelArea || "not decided; assume a central area"}`,
    "",
    "Family members and their answers:",
  ];
  for (const m of members) {
    const a = answers.find((x) => x.memberId === m.id);
    lines.push(`- ${m.name} (${m.role}, age ${m.age})`);
    if (!a) {
      lines.push("  (no answers)");
      continue;
    }
    lines.push(
      `  energy ${a.energy}/5; max ${a.maxTravelMinutes} min travel between stops; budget feels ${a.budget}`,
      `  must do: ${a.mustDo || "-"}`,
      `  must avoid: ${a.mustAvoid || "-"}`,
      `  food: ${a.food || "-"}`,
    );
  }

  if (previousPlans.length > 0) {
    lines.push("", "Last round's plans did not produce agreement. Votes and comments:");
    for (const p of previousPlans) {
      lines.push(`- "${p.data.title}"`);
      for (const v of previousVotes.filter((x) => x.planId === p.id)) {
        const who = members.find((m) => m.id === v.memberId)?.name ?? "?";
        lines.push(`  ${who}: ${v.choice}${v.comment ? ` ("${v.comment}")` : ""}`);
      }
      p.live?.stops.forEach((s, i) => {
        const stop = p.data.stops[i];
        if (!stop) return;
        if (s.openStatus === "closed" || s.openStatus === "outside" || s.openStatus === "partly") {
          const why = { closed: "is closed that day", outside: `isn't open at ${stop.start}`, partly: "isn't open for the whole visit" }[s.openStatus];
          lines.push(`  Google Maps: ${stop.place} ${why}${s.hoursText ? ` (${s.hoursText})` : ""}`);
        }
        if (s.routeMinutes != null && s.routeMinutes > stop.getThere.minutes + 10) {
          lines.push(`  Checked route: getting to ${stop.place} takes ${s.routeMinutes} min, not ${stop.getThere.minutes}`);
        }
      });
    }
    lines.push("", "Propose a new set that keeps what people loved and fixes what got a no.");
  }

  lines.push("", `Return exactly ${PLANS_PER_ROUND} plans.`);
  return lines.join("\n");
}

export class GenerationError extends Error {}

// Pulls the plan set out of a text reply, in case a proxy drops the
// structured-output setting and the model wraps the JSON in prose or fences.
export function parsePlanSetText(text: string): PlanSet | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const result = PlanSetSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function toGenerationError(err: unknown, who: string): never {
  if (err instanceof Anthropic.AuthenticationError) throw new GenerationError(`The ${who} API key was rejected.`);
  if (err instanceof Anthropic.PermissionDeniedError) throw new GenerationError(`Your ${who} plan doesn't allow this model.`);
  if (err instanceof Anthropic.RateLimitError) throw new GenerationError(`${who} usage limit reached. Try again later.`);
  if (err instanceof Anthropic.APIError) throw new GenerationError(`${who} request failed (${err.status ?? "network"}).`);
  throw err;
}

async function viaOpenCode(input: GenerateInput, sessionId: string): Promise<PlanSet> {
  const key = process.env.OPENCODE_API_KEY!;
  // OpenCode's docs don't name the auth header for this endpoint, so send the
  // key both ways. Go asks for an app-specific user agent and a stable
  // session id per conversation.
  const client = new Anthropic({
    apiKey: key,
    authToken: key,
    baseURL: process.env.OPENCODE_BASE_URL || OPENCODE_GO_BASE_URL,
    defaultHeaders: { "User-Agent": "familytrip/0.1", "x-opencode-session": sessionId },
  });

  // Streamed so a long answer (thinking plus three plans) can't hit the
  // request timeout. Haiku defaults to medium effort; high spent the whole
  // budget thinking in testing.
  let response;
  try {
    response = await client.messages
      .stream({
        model: process.env.FAMILYTRIP_MODEL || OPENCODE_DEFAULT_MODEL,
        max_tokens: 64000,
        thinking: { type: "adaptive" },
        output_config: {
          effort: (process.env.FAMILYTRIP_EFFORT as "low" | "medium" | "high" | undefined) || "medium",
          format: zodOutputFormat(PlanSetSchema),
        },
        system: SYSTEM,
        messages: [{ role: "user", content: buildPrompt(input) }],
      })
      .finalMessage();
  } catch (err) {
    toGenerationError(err, "OpenCode");
  }
  console.info("OpenCode plans:", response.model, response.stop_reason, JSON.stringify(response.usage));

  if (response.stop_reason === "refusal") throw new GenerationError("The model declined to plan this trip.");
  if (response.stop_reason === "max_tokens") throw new GenerationError("The plans came back cut off. Try again.");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const parsed = parsePlanSetText(text);
  if (!parsed) throw new GenerationError("The model's answer wasn't a usable set of plans. Try again.");
  return parsed;
}

async function viaAnthropic(input: GenerateInput): Promise<PlanSet> {
  const client = new Anthropic();
  let response;
  try {
    // Server-side fallback reroutes the request if a safety classifier declines it.
    response = await client.beta.messages.parse({
      model: process.env.FAMILYTRIP_MODEL || ANTHROPIC_DEFAULT_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: betaZodOutputFormat(PlanSetSchema) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: buildPrompt(input) }],
    });
  } catch (err) {
    toGenerationError(err, "Anthropic");
  }

  if (response.stop_reason === "refusal") throw new GenerationError("Claude declined to plan this trip.");
  if (response.stop_reason === "max_tokens") throw new GenerationError("The plans came back cut off. Try again.");
  if (!response.parsed_output) throw new GenerationError("Claude returned no usable plans.");
  return response.parsed_output;
}

export async function generatePlans(input: GenerateInput): Promise<DayPlan[]> {
  const p = provider();
  if (p === "mock") return samplePlans(input);
  const set = p === "opencode" ? await viaOpenCode(input, `familytrip-${input.trip.slug}`) : await viaAnthropic(input);
  if (set.plans.length === 0) throw new GenerationError("No plans came back. Try again.");
  return set.plans.slice(0, PLANS_PER_ROUND);
}
