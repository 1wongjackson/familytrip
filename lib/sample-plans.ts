import type { DayPlan, MemberFit } from "./plan-schema";
import type { GenerateInput } from "./generate";

// Canned plans for mock mode. Destination-agnostic on purpose: they exist to
// exercise the vote flow, not to be good advice.

function fits(input: GenerateInput, pick: (energy: number) => MemberFit["fit"], vetoName?: string): MemberFit[] {
  return input.members.map((m) => {
    const a = input.answers.find((x) => x.memberId === m.id);
    const energy = a?.energy ?? 3;
    return {
      memberName: m.name,
      fit: pick(energy),
      reason: `Energy ${energy}/5${a?.mustDo ? `; includes "${a.mustDo}"` : ""}.`,
      conflict: m.name === vetoName && a?.mustAvoid ? `May clash with "${a.mustAvoid}".` : "",
    };
  });
}

export function samplePlans(input: GenerateInput): DayPlan[] {
  const where = input.trip.destination;
  const round = input.previousPlans.length > 0 ? " (round 2)" : "";
  const youngest = [...input.members].sort((a, b) => a.age - b.age)[0]?.name;

  return [
    {
      title: `Slow morning, park afternoon${round}`,
      pitch: `An easy day in ${where} with long lunches and space for the kids to run.`,
      style: "relaxed",
      totalHours: 7,
      costBand: "$",
      costNote: "Mostly free sights; one sit-down lunch.",
      stops: [
        { start: "09:30", end: "10:30", place: "Hotel breakfast café", area: "Near hotel", why: "No rush to get going.", trivia: "Breakfast is the most-skipped meal on holiday.", food: "Breakfast", getThere: { mode: "walk", minutes: 5, note: "Round the corner from the hotel." } },
        { start: "11:00", end: "13:00", place: `${where} old town walk`, area: "Old town", why: "Short, flat and full of things to look at.", trivia: "Old towns often follow the line of their medieval walls.", food: "", getThere: { mode: "metro", minutes: 15, note: "Two stops on the main line." } },
        { start: "13:00", end: "14:30", place: "Family noodle house", area: "Old town", why: "Fast service and a kids' menu.", trivia: "Long noodles are a symbol of long life in many cultures.", food: "Lunch: noodles and dumplings", getThere: { mode: "walk", minutes: 5, note: "Off the main square." } },
        { start: "15:00", end: "16:30", place: "City park and playground", area: "Park district", why: "Downtime before dinner.", trivia: "Some city parks are bigger than the old town itself.", food: "Ice cream stand", getThere: { mode: "bus", minutes: 20, note: "Direct bus from the square." } },
      ],
      fitsMembers: fits(input, (e) => (e <= 3 ? "great" : "ok")),
      tradeoffs: ["Favours the lower-energy members; the most active person may want more."],
    },
    {
      title: `Big day out${round}`,
      pitch: `Pack in ${where}'s headline sights with a hike to a viewpoint.`,
      style: "adventurous",
      totalHours: 10,
      costBand: "$$$",
      costNote: "Two paid attractions and a cable car.",
      stops: [
        { start: "08:00", end: "08:45", place: "Bakery near hotel", area: "Near hotel", why: "Quick start for a long day.", trivia: "Bakers start work around 3am.", food: "Pastries to go", getThere: { mode: "walk", minutes: 5, note: "Opposite the hotel." } },
        { start: "09:15", end: "12:00", place: `${where} science museum`, area: "Museum quarter", why: "Hands-on exhibits for all ages.", trivia: "Many science museums let you touch a real meteorite.", food: "", getThere: { mode: "metro", minutes: 20, note: "Change once." } },
        { start: "12:00", end: "13:00", place: "Museum food court", area: "Museum quarter", why: "Lots of choice, no queue.", trivia: "Food courts started in shopping malls in the 1970s.", food: "Lunch: food court", getThere: { mode: "walk", minutes: 2, note: "Inside the museum." } },
        { start: "13:45", end: "17:00", place: "Viewpoint hike and cable car", area: "Hills", why: "The best view in the city.", trivia: "Cable cars are pulled by a cable; they have no engine on board.", food: "Snacks at the top", getThere: { mode: "taxi", minutes: 35, note: "Book a taxi from the museum." } },
        { start: "18:00", end: "19:30", place: "Night market", area: "Centre", why: "Street food and lights.", trivia: "Night markets started where it was too hot to shop by day.", food: "Dinner: street food", getThere: { mode: "metro", minutes: 25, note: "Direct line from the cable car base." } },
      ],
      fitsMembers: fits(input, (e) => (e >= 4 ? "great" : "stretch"), youngest),
      tradeoffs: ["Long travel legs; the youngest may tire by late afternoon."],
    },
    {
      title: `Half and half${round}`,
      pitch: "A busy morning, then a choice: rest at the hotel or a short boat trip.",
      style: "mixed",
      totalHours: 8,
      costBand: "$$",
      costNote: "One paid attraction; the boat trip is optional.",
      stops: [
        { start: "09:00", end: "11:30", place: `${where} aquarium`, area: "Waterfront", why: "Something for every age.", trivia: "Octopuses have three hearts.", food: "", getThere: { mode: "tram", minutes: 15, note: "Tram along the waterfront." } },
        { start: "12:00", end: "13:15", place: "Harbour fish café", area: "Waterfront", why: "Sea views and simple food.", trivia: "Fish and chips were sold in newspaper for over 100 years.", food: "Lunch: fish and chips or veggie wraps", getThere: { mode: "walk", minutes: 8, note: "Along the promenade." } },
        { start: "13:30", end: "15:00", place: "Hotel pool break", area: "Near hotel", why: "Recharge before the evening.", trivia: "Many hotel pools are heated with waste heat from laundry.", food: "", getThere: { mode: "tram", minutes: 15, note: "Same tram back." } },
        { start: "16:00", end: "17:30", place: "Harbour boat trip", area: "Waterfront", why: "Sit down and still see the sights.", trivia: "Some harbour ferries have run on the same route for a century.", food: "Snacks on board", getThere: { mode: "tram", minutes: 15, note: "Back to the pier." } },
      ],
      fitsMembers: fits(input, () => "ok"),
      tradeoffs: ["Nobody's ideal day, but nobody's worst."],
    },
  ];
}
