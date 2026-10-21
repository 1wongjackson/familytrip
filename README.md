# FamilyTrip

**Helps a family of four settle on one day plan they all accept, without one person doing all the research.**

🎬 [Watch the 90-second intro](docs/familytrip-intro.mp4) (16:9, narrated in Singlish, with sound)

A prototype to test the riskiest bet in the product brief: **can one day plan satisfy two adults and two kids of different ages?**

Each family member answers a few questions on their own phone. Claude proposes 3 different day plans with timings, transport, food and trivia. Each stop is then checked: Google Maps for real photos and that day's opening hours, and [Transitous](https://transitous.org) for real public-transport, walking and driving times. Everyone votes love / ok / no. A single "no" rules a plan out. If no plan works for everyone, Claude makes 3 new plans using the votes and comments. When the family settles, the app records **how long it took to agree**, which is the brief's success metric.

## Run it at home

1. Install [Node.js](https://nodejs.org) 22 or newer, then in this folder:

   ```bash
   npm install
   ```

2. Copy `.env.local.example` to `.env.local` and fill in:
   - `OPENCODE_API_KEY`: your OpenCode Go key from https://opencode.ai/console. Plans use Claude Haiku 5.5, the only Claude model on Go. You can use `ANTHROPIC_API_KEY` instead.
   - `GOOGLE_MAPS_API_KEY`: in Google Cloud, enable **Places API (New)**, then create a key restricted to it. Billing must be on, but a family trip should stay inside the free monthly allowance.
   - `FAMILYTRIP_CONTACT`: an email or URL. Travel times come from Transitous, which is free and needs no key. Its [usage policy](https://transitous.org/api/) asks apps to identify themselves, and limits use to light, non-commercial, open-source projects.

   With no plan key, the app runs in **demo mode** with sample plans. With no Google key, it skips the live checks.

3. Start it so phones on your Wi-Fi can reach it:

   ```bash
   npm run home
   ```

   On Windows, if PowerShell says running scripts is disabled, use `npm.cmd run home` instead.

4. Open `http://localhost:3000` on the computer and create the trip. The share link it gives you uses your computer's Wi-Fi address. Send that link to the family, and everyone must be on the same Wi-Fi.

If phones can't connect, Windows may be blocking Node.js in the firewall. Allow it on private networks.

## Developing

```bash
npm run dev        # dev server on http://localhost:3000
npm test           # unit tests (vote rules, conflicts, prompt, schema)
npm run typecheck
npm run build
```

Data lives in `data/familytrip.db` (SQLite). Delete it to start fresh.

### Demo data

```bash
npm run seed
```

This adds four demo trips, one at each stage, with hand-written plans. It needs no API keys. Re-running replaces only the demo trips; real trips are left alone. A running app picks them up without a restart.

| Trip | Stage | Open |
| --- | --- | --- |
| Kyoto | Waiting on 2 of 4 answers | `/t/demo-kyoto` |
| Lisbon | Voting in progress, with a closed restaurant and a too-long trip flagged | `/t/demo-lisbon/plans` |
| Singapore | Round 2, everyone voted, ready to settle | `/t/demo-singapore/plans` |
| Barcelona | Settled in 47 minutes | `/t/demo-barcelona/result` |

Pick any family member when asked who you are.

### Intro video

`docs/familytrip-intro.mp4` is recorded from the running app. To re-record it after UI changes, start the app on port 3000, then:

```bash
npm run seed
npm run video
npm run seed
```

The recorder builds a 1920×1080 marketing stage, with benefit headlines beside the live app in a phone frame, and drives it in your installed Chrome (`scripts/record-intro.ts`). The narration script is in Singlish and is read by Windows' built-in speech voice (set `FAMILYTRIP_VOICE`, for example `Microsoft Zira Desktop`, to change it; Windows has no Singaporean-accent voice), and the background music is a soft pad the script synthesises itself, so there's nothing to license. The music dips automatically under the voice. The first run may ask you to install Playwright's small ffmpeg helper with `npx playwright-core install ffmpeg`. The second `seed` resets the demo trips, since the recording answers and votes in them.

## Day map

Each plan has a **🛰 Map** button. It opens a command-centre view of the day:

- A dark, simplified map (no shops or buildings), with the hotel as **HQ**, 1/2/5 km rings around it and a scale bar, so distances are easy to judge.
- Numbered stops joined by the route, with distance and travel time on each leg, and a strip showing stops, total distance, travel time, the day's time window and alerts.
- **Drag ⠿ in the itinerary rail to rearrange the day.** The route updates as you drag. When you drop, the new order is saved for everyone: times are recalculated, new legs get real travel times from Transitous, and opening hours are re-checked. The plan then shows "Rearranged by …".

Plans made before maps were added have no coordinates; make new plans to see them on the map. The basemap is [OpenFreeMap](https://openfreemap.org)'s free dark style (no key), rendered with Leaflet and MapLibre.

To try the map beside a running app without touching its data, start a second dev server with its own build folder and database on port 3002:

```bash
scripts\dev-alt.cmd
```

## What it does not do (yet)

- No live weather or traffic on the day. Opening hours and travel times are checked once, when the plans are made. Taxi times come from a road route, not live traffic. Closed stops and travel over someone's limit show as conflicts.
- No budget optimisation, booking or payment.
- It plans one day near a hotel area you give it. It doesn't choose accommodation.

## How it works

| Piece | File |
| --- | --- |
| Plan schema Claude must return | `lib/plan-schema.ts` |
| Prompt and Claude call (OpenCode Go with `claude-haiku-5-5`, or Anthropic with `claude-opus-5-5`) | `lib/generate.ts` |
| Google Places checks (photos, hours) | `lib/places.ts` |
| Transitous travel times | `lib/transitous.ts` |
| Waiting-on, conflict and agreement rules | `lib/conflicts.ts` |
| SQLite storage | `lib/db.ts` |
| API routes | `app/api/trips/**` |
| Screens | `components/TripHome.tsx`, `components/PlansVote.tsx`, `components/TripResult.tsx` |

## Credits

Travel times from [Transitous](https://transitous.org) ([data sources](https://transitous.org/sources/)), map data © OpenStreetMap contributors. Places, photos and opening hours from Google Maps. Day plans by Claude.

## License

[MIT](LICENSE)
