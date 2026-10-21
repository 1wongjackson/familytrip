// Demo trips at every stage, so each screen can be tried without API keys.
// Re-running replaces the demo trips (slugs starting "demo-") and leaves
// real trips alone.
//
//   npm run seed

import { agree, createTrip, db, getMembers, getPlans, saveAnswer, savePlans, saveVote, type NewTrip } from "../lib/db";
import { DayPlanSchema, type DayPlan, type MemberFit } from "../lib/plan-schema";
import type { Budget, OpenStatus, PlanLive, StopLive, VoteChoice } from "../lib/types";

type Mode = DayPlan["stops"][number]["getThere"]["mode"];
// [start, end, place, area, mode, minutes, why, trivia, food?]
type StopRow = [string, string, string, string, Mode, number, string, string, string?];
// name -> [fit, reason, conflict?]
type Fits = Record<string, [MemberFit["fit"], string, string?]>;

function plan(p: {
  title: string;
  pitch: string;
  style: string;
  cost: DayPlan["costBand"];
  costNote: string;
  stops: StopRow[];
  fits: Fits;
  tradeoffs: string[];
}): DayPlan {
  const [first, last] = [p.stops[0], p.stops[p.stops.length - 1]];
  const hours = (toMin(last[1]) - toMin(first[0])) / 60;
  return DayPlanSchema.parse({
    title: p.title,
    pitch: p.pitch,
    style: p.style,
    totalHours: Math.round(hours * 4) / 4,
    costBand: p.cost,
    costNote: p.costNote,
    stops: p.stops.map(([start, end, place, area, mode, minutes, why, trivia, food]) => ({
      start,
      end,
      place,
      area,
      why,
      trivia,
      food: food ?? "",
      getThere: { mode, minutes, note: "" },
    })),
    fitsMembers: Object.entries(p.fits).map(([memberName, [fit, reason, conflict]]) => ({
      memberName,
      fit,
      reason,
      conflict: conflict ?? "",
    })),
    tradeoffs: p.tradeoffs,
  });
}

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Live checks per stop: [openStatus, hoursText, real travel minutes]
function live(rows: [OpenStatus, string, number | null][]): PlanLive {
  return {
    checkedAt: Date.now(),
    stops: rows.map(([openStatus, hoursText, routeMinutes]): StopLive => ({
      found: true,
      name: "",
      address: "",
      mapsUri: "",
      photoUri: "",
      photoAttribution: "",
      rating: null,
      openStatus,
      hoursText,
      routeMinutes,
    })),
  };
}

interface AnswerRow {
  energy: number;
  mustDo: string;
  mustAvoid: string;
  food: string;
  maxTravelMinutes: number;
  budget: Budget;
}

interface Seed {
  slug: string;
  trip: NewTrip;
  answers: Record<string, AnswerRow>;
  rounds?: { plans: DayPlan[]; live?: PlanLive[]; votes: Record<string, (VoteChoice | [VoteChoice, string] | null)[]> }[];
  agreeOn?: number; // plan index in the last round
  minutesToAgree?: number;
}

// ---------------------------------------------------------------------------
// 1. Kyoto: still collecting answers (lobby, "waiting on" list).

const kyoto: Seed = {
  slug: "demo-kyoto",
  trip: {
    destination: "Kyoto",
    date: "2026-11-02",
    hotelArea: "near Kyoto Station",
    members: [
      { name: "Sam", role: "parent", age: 42 },
      { name: "Alex", role: "parent", age: 40 },
      { name: "Mia", role: "kid", age: 12 },
      { name: "Leo", role: "kid", age: 6 },
    ],
  },
  answers: {
    Sam: { energy: 4, mustDo: "Fushimi Inari shrine", mustAvoid: "", food: "", maxTravelMinutes: 40, budget: "ok" },
    Alex: {
      energy: 2,
      mustDo: "a traditional tea house",
      mustAvoid: "big crowds",
      food: "vegetarian",
      maxTravelMinutes: 30,
      budget: "tight",
    },
  },
};

// ---------------------------------------------------------------------------
// 2. Lisbon: plans out, voting in progress, with live-check conflicts.

const lisbon: Seed = {
  slug: "demo-lisbon",
  trip: {
    destination: "Lisbon",
    date: "2026-11-14",
    hotelArea: "Baixa",
    members: [
      { name: "Priya", role: "parent", age: 39 },
      { name: "Tom", role: "parent", age: 41 },
      { name: "Asha", role: "kid", age: 9 },
      { name: "Ravi", role: "kid", age: 4 },
    ],
  },
  answers: {
    Priya: { energy: 3, mustDo: "custard tarts in Belém", mustAvoid: "steep hills on foot", food: "", maxTravelMinutes: 35, budget: "ok" },
    Tom: { energy: 4, mustDo: "the castle", mustAvoid: "", food: "no pork", maxTravelMinutes: 40, budget: "ok" },
    Asha: { energy: 5, mustDo: "sharks and big fish", mustAvoid: "museums", food: "", maxTravelMinutes: 40, budget: "ok" },
    Ravi: { energy: 2, mustDo: "a tram ride", mustAvoid: "long walks", food: "plain food", maxTravelMinutes: 25, budget: "ok" },
  },
  rounds: [
    {
      plans: [
        plan({
          title: "Trams, tiles and custard tarts",
          pitch: "A gentle Belém morning, a market lunch, and the famous yellow tram.",
          style: "relaxed",
          cost: "$",
          costNote: "Monastery tickets, tram fares and a market lunch.",
          stops: [
            [
              "09:30",
              "10:30",
              "Pastéis de Belém",
              "Belém",
              "tram",
              25,
              "Lisbon's best-known custard tarts, and the queue moves fast.",
              "The recipe has been kept secret since 1837.",
              "Custard tarts and fresh orange juice",
            ],
            [
              "10:45",
              "12:15",
              "Jerónimos Monastery",
              "Belém",
              "walk",
              3,
              "Shady cloisters that are calm in the morning.",
              "It took about a century to finish building.",
              "",
            ],
            [
              "12:45",
              "14:00",
              "Time Out Market",
              "Cais do Sodré",
              "train",
              12,
              "Lots of stalls, so everyone picks their own lunch.",
              "The market hall opened in 1892.",
              "Lunch: pick-your-own from food stalls",
            ],
            [
              "14:45",
              "16:00",
              "Tram 28",
              "Graça",
              "tram",
              20,
              "Sit down and see the old city from the window.",
              "Some of the yellow trams date from the 1930s.",
              "",
            ],
          ],
          fits: {
            Priya: ["great", "Starts with custard tarts in Belém, and the hills are done by tram."],
            Tom: ["ok", "Plenty to see, but no castle.", "The castle, Tom's must-do, isn't in this plan."],
            Asha: [
              "stretch",
              "Lots of variety, but a monastery counts as a museum to Asha.",
              "No sharks, and the monastery is museum-like.",
            ],
            Ravi: ["great", "Includes the tram ride Ravi asked for, with short walks."],
          },
          tradeoffs: ["Best for Priya and Ravi; Asha gets the least out of it."],
        }),
        plan({
          title: "Oceanarium and the river",
          pitch: "Sharks in the morning, then a cable car along the river.",
          style: "mixed",
          cost: "$$",
          costNote: "Oceanarium and cable car tickets.",
          stops: [
            [
              "10:00",
              "12:30",
              "Oceanário de Lisboa",
              "Parque das Nações",
              "metro",
              25,
              "One of Europe's biggest aquariums, with sharks and rays.",
              "The main tank holds as much water as four Olympic pools.",
              "",
            ],
            [
              "12:45",
              "13:45",
              "Centro Vasco da Gama",
              "Parque das Nações",
              "walk",
              8,
              "Indoor food court with simple options.",
              "The centre is named after the explorer, and so is the bridge outside.",
              "Lunch: grilled chicken, rice and fruit",
            ],
            [
              "14:15",
              "15:15",
              "Telecabine Lisboa",
              "Parque das Nações",
              "walk",
              10,
              "A slow cable car over the river front.",
              "The ride is about a kilometre long.",
              "",
            ],
            [
              "15:30",
              "16:30",
              "Jardim Garcia de Orta",
              "Parque das Nações",
              "walk",
              5,
              "Flat gardens where Ravi can run around.",
              "The garden has plants from former Portuguese trading routes.",
              "Ice cream by the river",
            ],
          ],
          fits: {
            Priya: ["ok", "Flat all day, but no custard tarts in Belém.", "Belém, Priya's must-do, is on the other side of the city."],
            Tom: ["ok", "Good day out, but no castle."],
            Asha: ["great", "Sharks and big fish, Asha's must-do."],
            Ravi: ["great", "Flat, with a garden to play in."],
          },
          tradeoffs: ["Great for the kids; the parents each miss their must-do."],
        }),
        plan({
          title: "Castle hill adventure",
          pitch: "Up to the castle by taxi, views over the river, then lunch in Mouraria.",
          style: "adventurous",
          cost: "$$",
          costNote: "Castle tickets and two taxis.",
          stops: [
            [
              "09:30",
              "11:30",
              "Castelo de São Jorge",
              "Alfama",
              "taxi",
              15,
              "Ramparts, peacocks and the best view in Lisbon.",
              "People have lived on this hill for over 2,500 years.",
              "",
            ],
            [
              "11:45",
              "12:30",
              "Miradouro de Santa Luzia",
              "Alfama",
              "walk",
              10,
              "A tiled viewpoint, downhill from the castle.",
              "The blue and white tiles are called azulejos.",
              "",
            ],
            [
              "12:45",
              "14:00",
              "Zé da Mouraria",
              "Mouraria",
              "walk",
              12,
              "Big shared plates of home cooking.",
              "Mouraria is said to be where fado music began.",
              "Lunch: grilled fish and rice, no pork",
            ],
            [
              "14:45",
              "16:30",
              "LX Factory",
              "Alcântara",
              "taxi",
              20,
              "Old factory full of shops and a huge bookshop.",
              "The bookshop has a bicycle hanging from the ceiling.",
              "",
            ],
          ],
          fits: {
            Priya: ["stretch", "The castle hill is steep, even with taxis.", "Some steep walking around Alfama."],
            Tom: ["great", "The castle, Tom's must-do, first thing."],
            Asha: ["ok", "Exciting, but no sharks."],
            Ravi: ["stretch", "Cobbled hills are hard for Ravi.", "Walking between the castle and Mouraria is long for Ravi."],
          },
          tradeoffs: ["Tom's favourite; hardest on Ravi's legs."],
        }),
      ],
      live: [
        live([
          ["open", "Saturday: 8:00 AM – 9:00 PM", 22],
          ["open", "Saturday: 9:30 AM – 6:00 PM", 4],
          ["open", "Saturday: 10:00 AM – 12:00 AM", 14],
          ["unknown", "", 18],
        ]),
        live([
          ["open", "Saturday: 10:00 AM – 7:00 PM", 34],
          ["open", "Saturday: 9:00 AM – 12:00 AM", 7],
          ["open", "Saturday: 11:00 AM – 7:00 PM", 9],
          ["open", "Saturday: Open 24 hours", 6],
        ]),
        live([
          ["open", "Saturday: 9:00 AM – 9:00 PM", 16],
          ["open", "Saturday: Open 24 hours", 11],
          ["closed", "Saturday: Closed", 9],
          ["open", "Saturday: 9:00 AM – 12:00 AM", 21],
        ]),
      ],
      votes: {
        Priya: ["love", ["ok", "Fine if we take taxis everywhere"], ["no", "Too many hills for Ravi"]],
        Tom: ["ok", "love", "love"],
        Asha: [["no", "Boring, no sharks"], null, null],
        Ravi: [null, null, null],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 3. Singapore: round 1 had a "no" on every plan, round 2 is ready to settle.

const singapore: Seed = {
  slug: "demo-singapore",
  trip: {
    destination: "Singapore",
    date: "2026-12-05",
    hotelArea: "Marina Bay",
    members: [
      { name: "Mei", role: "parent", age: 44 },
      { name: "Daniel", role: "parent", age: 45 },
      { name: "Lucas", role: "kid", age: 14 },
      { name: "Chloe", role: "kid", age: 7 },
    ],
  },
  answers: {
    Mei: { energy: 2, mustDo: "hawker food", mustAvoid: "midday heat outdoors", food: "", maxTravelMinutes: 30, budget: "tight" },
    Daniel: { energy: 3, mustDo: "Gardens by the Bay", mustAvoid: "", food: "", maxTravelMinutes: 40, budget: "ok" },
    Lucas: {
      energy: 5,
      mustDo: "something not for little kids",
      mustAvoid: "zoos",
      food: "spicy is fine",
      maxTravelMinutes: 45,
      budget: "ok",
    },
    Chloe: { energy: 3, mustDo: "animals", mustAvoid: "long train rides", food: "no spicy food", maxTravelMinutes: 30, budget: "ok" },
  },
  rounds: [
    {
      plans: [
        plan({
          title: "Zoo and River Wonders",
          pitch: "A morning with orangutans, then pandas and manatees.",
          style: "relaxed",
          cost: "$$$",
          costNote: "Two park tickets per person.",
          stops: [
            [
              "08:30",
              "12:00",
              "Singapore Zoo",
              "Mandai",
              "taxi",
              25,
              "Open enclosures and shady paths, best before the heat.",
              "Orangutans here roam free in the trees above the paths.",
              "",
            ],
            [
              "12:00",
              "13:00",
              "Ah Meng Kitchen",
              "Mandai",
              "walk",
              2,
              "Air-conditioned local food inside the zoo.",
              "It's named after the zoo's most famous orangutan.",
              "Lunch: chicken rice and noodles",
            ],
            [
              "13:15",
              "15:00",
              "River Wonders",
              "Mandai",
              "walk",
              5,
              "Giant pandas and manatees, mostly indoors.",
              "Manatees are related to elephants.",
              "",
            ],
          ],
          fits: {
            Mei: ["ok", "Mostly shaded, but pricey for a tight budget."],
            Daniel: ["ok", "A good day, but no Gardens by the Bay."],
            Lucas: ["stretch", "Lucas asked to avoid zoos.", "A zoo is the one thing Lucas asked to avoid."],
            Chloe: ["great", "Animals all day, Chloe's must-do."],
          },
          tradeoffs: ["Chloe's dream day, Lucas's least favourite."],
        }),
        plan({
          title: "Sentosa all day",
          pitch: "Rides at Universal Studios, then the beach at sunset.",
          style: "adventurous",
          cost: "$$$",
          costNote: "Theme park tickets are the big cost.",
          stops: [
            [
              "10:00",
              "15:00",
              "Universal Studios Singapore",
              "Sentosa",
              "taxi",
              20,
              "Big rides for Lucas, gentle ones for Chloe.",
              "The park has one of the tallest duelling roller coasters in the world.",
              "Lunch inside the park",
            ],
            [
              "15:30",
              "17:30",
              "Siloso Beach",
              "Sentosa",
              "other",
              10,
              "Paddle and cool down after the park.",
              "Sentosa means 'peace and tranquillity' in Malay.",
              "Shaved ice by the beach",
            ],
          ],
          fits: {
            Mei: ["stretch", "Long outdoor queues in the heat, and expensive.", "Lots of midday heat outdoors, and over a tight budget."],
            Daniel: ["ok", "Fun, but no Gardens by the Bay."],
            Lucas: ["great", "Proper rides, not for little kids."],
            Chloe: ["ok", "Some gentle rides, but no animals."],
          },
          tradeoffs: ["Lucas's favourite; hard on Mei and the budget."],
        }),
        plan({
          title: "Gardens and hawkers",
          pitch: "Cool domes in the morning, a hawker lunch, then art.",
          style: "mixed",
          cost: "$",
          costNote: "Dome tickets and a cheap hawker lunch.",
          stops: [
            [
              "09:00",
              "11:00",
              "Gardens by the Bay",
              "Marina Bay",
              "walk",
              15,
              "Air-conditioned domes and the giant Supertrees.",
              "The Cloud Forest has one of the world's tallest indoor waterfalls.",
              "",
            ],
            [
              "11:30",
              "12:30",
              "Lau Pa Sat",
              "Downtown",
              "metro",
              12,
              "A Victorian market hall full of hawker stalls.",
              "The cast-iron frame was shipped from Scotland.",
              "Lunch: satay, noodles and fresh juice",
            ],
            [
              "13:00",
              "15:00",
              "ArtScience Museum",
              "Marina Bay",
              "metro",
              10,
              "Interactive digital art rooms that kids can play in.",
              "The building is shaped like a lotus flower.",
              "",
            ],
          ],
          fits: {
            Mei: ["great", "Hawker food and mostly indoors."],
            Daniel: ["great", "Gardens by the Bay first thing."],
            Lucas: ["ok", "Cool digital art, but tame."],
            Chloe: ["stretch", "No animals.", "No animals, Chloe's must-do."],
          },
          tradeoffs: ["Best for the parents; Chloe misses out."],
        }),
      ],
      votes: {
        Mei: ["ok", ["no", "Too expensive and too hot"], "love"],
        Daniel: ["ok", "ok", "love"],
        Lucas: [["no", "Zoos are for little kids"], "love", "ok"],
        Chloe: ["love", "ok", ["no", "Boring, no animals"]],
      },
    },
    {
      plans: [
        plan({
          title: "Gardens by day, Night Safari after dark",
          pitch: "Cool domes and hawker lunch, a pool break, then animals at night.",
          style: "relaxed",
          cost: "$$",
          costNote: "Dome and Night Safari tickets, cheap lunch.",
          stops: [
            [
              "10:00",
              "11:30",
              "Gardens by the Bay",
              "Marina Bay",
              "walk",
              15,
              "Air-conditioned domes before the heat.",
              "The Supertrees collect rainwater and solar power.",
              "",
            ],
            [
              "12:00",
              "13:00",
              "Maxwell Food Centre",
              "Chinatown",
              "taxi",
              12,
              "Famous hawker stalls with mild and spicy options.",
              "Some stalls here have served the same dish for decades.",
              "Lunch: chicken rice for Chloe, laksa for Lucas",
            ],
            [
              "13:30",
              "16:30",
              "Hotel pool break",
              "Marina Bay",
              "taxi",
              12,
              "Rest through the hottest part of the day.",
              "Singapore is just one degree north of the equator.",
              "",
            ],
            [
              "19:00",
              "21:30",
              "Night Safari",
              "Mandai",
              "taxi",
              30,
              "The world's first night zoo: animals at their most awake.",
              "Many animals here are nocturnal, so they're busiest after dark.",
              "Snacks at the safari",
            ],
          ],
          fits: {
            Mei: ["great", "Hawker lunch and no midday heat."],
            Daniel: ["great", "Gardens by the Bay in the morning."],
            Lucas: ["ok", "Night Safari feels grown-up, and there's spicy laksa."],
            Chloe: ["great", "Animals at night, with a rest first."],
          },
          tradeoffs: ["A late night for Chloe."],
        }),
        plan({
          title: "Science and snow",
          pitch: "Hands-on science, real snow, and a mall lunch.",
          style: "mixed",
          cost: "$$",
          costNote: "Science Centre and Snow City tickets.",
          stops: [
            [
              "09:30",
              "12:30",
              "Science Centre Singapore",
              "Jurong East",
              "metro",
              35,
              "Hundreds of hands-on exhibits.",
              "It has a tornado machine you can walk into.",
              "",
            ],
            [
              "12:45",
              "13:45",
              "Snow City",
              "Jurong East",
              "walk",
              3,
              "Real snow, indoors, in the tropics.",
              "The hall stays at minus five degrees.",
              "",
            ],
            [
              "14:00",
              "15:00",
              "JEM",
              "Jurong East",
              "walk",
              6,
              "Air-conditioned food court.",
              "JEM stands for Jurong East Mall.",
              "Lunch: food court",
            ],
          ],
          fits: {
            Mei: ["ok", "Indoors, but a long way from the hotel."],
            Daniel: ["ok", "Good fun, no Gardens by the Bay."],
            Lucas: ["great", "Science and snow, nothing babyish."],
            Chloe: ["stretch", "A long train ride each way.", "35 minutes on the train, over Chloe's limit."],
          },
          tradeoffs: ["Far from the hotel."],
        }),
        plan({
          title: "Sentosa on a budget",
          pitch: "The aquarium, a food street lunch and a free beach.",
          style: "adventurous",
          cost: "$$",
          costNote: "Aquarium tickets; the beach is free.",
          stops: [
            [
              "10:00",
              "12:00",
              "S.E.A. Aquarium",
              "Sentosa",
              "other",
              20,
              "Huge tanks with sharks and manta rays.",
              "Its main viewing panel is one of the largest in the world.",
              "",
            ],
            [
              "12:00",
              "13:00",
              "Malaysian Food Street",
              "Sentosa",
              "walk",
              5,
              "Indoor street food, mild and spicy.",
              "It's styled like an old Malaysian street.",
              "Lunch: satay and noodles",
            ],
            [
              "13:30",
              "16:00",
              "Palawan Beach",
              "Sentosa",
              "other",
              10,
              "Calm water and a bridge to a tiny island.",
              "The island is said to be the southernmost point of continental Asia.",
              "",
            ],
          ],
          fits: {
            Mei: ["ok", "Cheaper than Universal, but a hot afternoon on the beach."],
            Daniel: ["great", "Easy day with something for everyone."],
            Lucas: ["great", "Sharks and manta rays."],
            Chloe: ["ok", "Fish count as animals."],
          },
          tradeoffs: ["Afternoon heat on the beach."],
        }),
      ],
      votes: {
        Mei: ["love", "ok", "ok"],
        Daniel: ["love", "ok", "love"],
        Lucas: ["ok", "love", "love"],
        Chloe: ["love", ["no", "Too long on the train"], "ok"],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// 4. Barcelona: settled (result page, time to agree).

const barcelona: Seed = {
  slug: "demo-barcelona",
  trip: {
    destination: "Barcelona",
    date: "2026-10-10",
    hotelArea: "Eixample",
    members: [
      { name: "Elena", role: "parent", age: 38 },
      { name: "Marco", role: "parent", age: 40 },
      { name: "Sofia", role: "kid", age: 11 },
      { name: "Luca", role: "kid", age: 5 },
    ],
  },
  answers: {
    Elena: { energy: 3, mustDo: "the beach", mustAvoid: "lots of travel", food: "", maxTravelMinutes: 30, budget: "ok" },
    Marco: { energy: 4, mustDo: "Sagrada Família", mustAvoid: "", food: "", maxTravelMinutes: 40, budget: "flexible" },
    Sofia: { energy: 4, mustDo: "the aquarium", mustAvoid: "", food: "vegetarian", maxTravelMinutes: 40, budget: "ok" },
    Luca: { energy: 2, mustDo: "sand and paddling", mustAvoid: "queues", food: "", maxTravelMinutes: 30, budget: "ok" },
  },
  rounds: [
    {
      plans: [
        plan({
          title: "Gaudí morning",
          pitch: "Sagrada Família first thing, then a market lunch.",
          style: "mixed",
          cost: "$$$",
          costNote: "Sagrada Família and Sant Pau tickets.",
          stops: [
            [
              "09:00",
              "10:30",
              "Sagrada Família",
              "Eixample",
              "walk",
              15,
              "Gaudí's masterpiece, quietest at opening.",
              "Building started in 1882 and still isn't finished.",
              "",
            ],
            [
              "11:00",
              "12:00",
              "Hospital de Sant Pau",
              "Eixample",
              "walk",
              15,
              "Colourful tiled pavilions and gardens.",
              "It was a working hospital until 2009.",
              "",
            ],
            [
              "12:45",
              "13:45",
              "La Boqueria",
              "La Rambla",
              "metro",
              20,
              "Market stalls with fruit and tapas.",
              "There has been a market here since 1217.",
              "Lunch: tapas, fruit cups and vegetarian empanadas",
            ],
          ],
          fits: {
            Elena: ["ok", "Short travel, but no beach.", "The beach, Elena's must-do, isn't included."],
            Marco: ["great", "Sagrada Família first thing."],
            Sofia: ["ok", "Interesting, but no aquarium."],
            Luca: ["stretch", "Queues and no sand.", "Queues at Sagrada Família, which Luca wanted to avoid."],
          },
          tradeoffs: ["Marco's favourite; Luca would be bored."],
        }),
        plan({
          title: "Beach and aquarium",
          pitch: "Sharks in the morning, paella by the sea, then sandcastles.",
          style: "relaxed",
          cost: "$$",
          costNote: "Aquarium tickets and a sit-down lunch.",
          stops: [
            [
              "10:00",
              "12:00",
              "L'Aquàrium de Barcelona",
              "Port Vell",
              "metro",
              20,
              "An 80-metre shark tunnel.",
              "It's one of the biggest Mediterranean aquariums in Europe.",
              "",
            ],
            [
              "12:30",
              "13:45",
              "Can Solé",
              "Barceloneta",
              "walk",
              15,
              "Classic seafood paella near the beach.",
              "The restaurant opened in 1903.",
              "Lunch: vegetable paella for Sofia, seafood for the rest",
            ],
            [
              "14:00",
              "16:30",
              "Barceloneta Beach",
              "Barceloneta",
              "walk",
              5,
              "Sand and calm water for paddling.",
              "The beach was rebuilt for the 1992 Olympics.",
              "Ice cream on the promenade",
            ],
          ],
          fits: {
            Elena: ["great", "The beach, with short hops between stops."],
            Marco: ["ok", "Lovely day, but no Sagrada Família."],
            Sofia: ["great", "The aquarium, Sofia's must-do."],
            Luca: ["great", "Sand and paddling, no long queues."],
          },
          tradeoffs: ["Marco skips Sagrada Família; the plan suggests a quick look from outside on the way."],
        }),
        plan({
          title: "Park Güell and the cable car",
          pitch: "Gaudí's mosaic park, then a cable car up Montjuïc.",
          style: "adventurous",
          cost: "$$",
          costNote: "Park and cable car tickets.",
          stops: [
            [
              "09:30",
              "11:30",
              "Park Güell",
              "Gràcia",
              "bus",
              30,
              "Mosaic dragon and views over the city.",
              "The famous lizard is covered in broken tiles.",
              "",
            ],
            [
              "12:45",
              "13:45",
              "Telefèric de Montjuïc",
              "Montjuïc",
              "metro",
              35,
              "A cable car ride up to the castle.",
              "Montjuïc means 'Jewish mountain' in old Catalan.",
              "",
            ],
            [
              "14:00",
              "16:00",
              "Poble Espanyol",
              "Montjuïc",
              "walk",
              10,
              "A whole village of Spanish architecture.",
              "It was built for the 1929 International Exhibition.",
              "Lunch: tapas in the main square",
            ],
          ],
          fits: {
            Elena: ["stretch", "Lots of travel across the city.", "Over an hour of travel, which Elena wanted to avoid."],
            Marco: ["ok", "Gaudí, though not Sagrada Família."],
            Sofia: ["ok", "Fun, but no aquarium."],
            Luca: ["ok", "The mosaic dragon, but no sand."],
          },
          tradeoffs: ["The most travel of the three."],
        }),
      ],
      votes: {
        Elena: ["ok", "love", ["no", "Too much travel"]],
        Marco: ["love", "love", "ok"],
        Sofia: ["ok", "love", "ok"],
        Luca: [["no", "Too much standing in queues"], "love", "ok"],
      },
    },
  ],
  agreeOn: 1,
  minutesToAgree: 47,
};

// ---------------------------------------------------------------------------

function removeTrip(slug: string) {
  const conn = db();
  conn.transaction(() => {
    conn.prepare("DELETE FROM votes WHERE plan_id IN (SELECT id FROM plans WHERE trip_slug = ?)").run(slug);
    conn.prepare("DELETE FROM plans WHERE trip_slug = ?").run(slug);
    conn.prepare("DELETE FROM answers WHERE member_id IN (SELECT id FROM members WHERE trip_slug = ?)").run(slug);
    conn.prepare("DELETE FROM members WHERE trip_slug = ?").run(slug);
    conn.prepare("DELETE FROM trips WHERE slug = ?").run(slug);
  })();
}

function seed(s: Seed) {
  removeTrip(s.slug);
  createTrip(s.trip, s.slug);
  const members = getMembers(s.slug);
  const id = (name: string) => {
    const m = members.find((x) => x.name === name);
    if (!m) throw new Error(`${s.slug}: no member called ${name}`);
    return m.id;
  };

  for (const [name, a] of Object.entries(s.answers)) saveAnswer({ memberId: id(name), ...a });

  s.rounds?.forEach((round, r) => {
    // Live checks carry the matched place name, as a real Google lookup would.
    const liveChecks = round.live?.map((l, i) => ({ ...l, stops: l.stops.map((st, j) => ({ ...st, name: round.plans[i].stops[j].place })) }));
    savePlans(s.slug, r + 1, round.plans, liveChecks ?? null);
    const stored = getPlans(s.slug).filter((p) => p.round === r + 1);
    for (const [name, choices] of Object.entries(round.votes)) {
      choices.forEach((c, i) => {
        if (!c) return;
        const [choice, comment] = Array.isArray(c) ? c : [c, ""];
        saveVote({ memberId: id(name), planId: stored[i].id, choice, comment });
      });
    }
  });

  if (s.agreeOn != null && s.rounds) {
    const last = getPlans(s.slug).filter((p) => p.round === s.rounds!.length);
    agree(s.slug, last[s.agreeOn].id);
    // Backdate the trip so "time to agree" shows a realistic figure.
    db()
      .prepare("UPDATE trips SET created_at = agreed_at - ? WHERE slug = ?")
      .run((s.minutesToAgree ?? 30) * 60_000, s.slug);
  }
}

const seeds = [kyoto, lisbon, singapore, barcelona];
for (const s of seeds) seed(s);

console.log("Seeded demo trips:");
for (const s of seeds) console.log(`  ${s.trip.destination.padEnd(10)} /t/${s.slug}`);
