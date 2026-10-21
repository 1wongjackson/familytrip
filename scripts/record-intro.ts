// Records the marketing intro video: a 16:9 stage with benefit headlines and
// the live app in a phone frame, a Singlish narration and a quiet music bed.
// Needs the app running with demo data, on Windows (the narration uses the
// built-in speech voices):
//
//   npm run seed && npm run video && npm run seed      (app on http://localhost:3000)
//
// Output: docs/familytrip-intro.mp4 (1920x1080). Set FAMILYTRIP_VOICE to
// change the voice (e.g. "Microsoft Zira Desktop").

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import { chromium, type Frame, type Page } from "playwright-core";

const BASE = process.env.FAMILYTRIP_URL ?? "http://localhost:3000";
const VOICE = process.env.FAMILYTRIP_VOICE ?? "Microsoft Hazel Desktop";
const OUT_DIR = path.join(process.cwd(), "docs");
const STAGE = { width: 1920, height: 1080 };
const PHONE = { width: 430, height: 880 };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The narrator's lines, in Singlish. SPOKEN spells a few words the way the
// built-in voice pronounces best.
const NARRATION = {
  hook: "Plan family holiday, sure got argument one, right?",
  problem: "One want temples, one want shopping, kids want arcade. Three days also cannot decide. Aiyo.",
  intro: "Don't worry lah. FamilyTrip settle for you.",
  create: "Key in where, which day, who's coming. Fast one.",
  join: "Everybody open the link on their own phone.",
  questions: "Answer a few quick questions. Done.",
  constraints: "Haven't answer? The app chase them for you.",
  plans: "Claude give you three plans that fit everybody.",
  clashes: "Who kena short-changed, it tell you straight.",
  stops: "Timing, transport, makan, fun facts, all inside.",
  checks: "Opening hours and travel time, all checked. Confirm plus chop.",
  map: "Want to change the order? Just drag. Timing update itself.",
  vote: "Everybody vote. One no, that plan out.",
  round2: "Cannot agree? Claude make new plans from the votes.",
  settle: "Nobody say no? One tap, settled.",
  done: "Minutes only, not three days. Shiok!",
  end: "FamilyTrip. Plan together, no more quarrel. Try it free today.",
} as const;
type Line = keyof typeof NARRATION;

const SPOKEN: Record<Line, string> = {
  ...NARRATION,
  problem: "One want temples, one want shopping, kids want arcade. Three days also cannot decide. Eye-yo.",
  clashes: "Who kuh-nah short-changed, it tell you straight.",
  stops: "Timing, transport, mah-kahn, fun facts, all inside.",
  done: "Minutes only, not three days. Shee-ok!",
};

// ---------------------------------------------------------------------------
// Audio

function run(args: string[]) {
  try {
    execFileSync(ffmpeg.path, ["-y", "-loglevel", "error", ...args], { stdio: "pipe" });
  } catch (err) {
    throw new Error(`ffmpeg failed: ${String((err as { stderr?: Buffer }).stderr ?? err).trim()}`);
  }
}

function durationSec(file: string): number {
  let out = "";
  try {
    execFileSync(ffmpeg.path, ["-i", file], { stdio: "pipe" });
  } catch (err) {
    out = String((err as { stderr?: Buffer }).stderr ?? "");
  }
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(out);
  if (!m) throw new Error(`Couldn't read duration of ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

// Windows' built-in speech synthesiser, one WAV per line.
function synthesize(dir: string): Record<Line, { file: string; seconds: number }> {
  const out = {} as Record<Line, { file: string; seconds: number }>;
  for (const [key, text] of Object.entries(SPOKEN) as [Line, string][]) {
    const file = path.join(dir, `${key}.wav`);
    const ps = [
      "Add-Type -AssemblyName System.Speech",
      "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
      `$s.SelectVoice('${VOICE.replace(/'/g, "''")}')`,
      "$s.Rate = 2",
      `$s.SetOutputToWaveFile('${file.replace(/'/g, "''")}')`,
      `$s.Speak('${text.replace(/'/g, "''")}')`,
      "$s.Dispose()",
    ].join("; ");
    execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps]);
    out[key] = { file, seconds: durationSec(file) };
  }
  return out;
}

// A soft synthesised pad (Cmaj7 – Am7 – Fmaj7 – G6), looped to length.
// Generated here, so there's nothing to license.
function makeMusic(dir: string, seconds: number): string {
  const chords = [
    [130.81, 164.81, 196.0, 246.94],
    [110.0, 130.81, 164.81, 196.0],
    [87.31, 110.0, 130.81, 164.81],
    [98.0, 123.47, 146.83, 164.81],
  ];
  const clips = chords.map((freqs, i) => {
    const voices = freqs.map((f, j) => `sin(2*PI*${f}*t)*(0.75+0.25*sin(2*PI*${0.13 + j * 0.05}*t))`).join("+");
    const shimmer = `0.18*sin(2*PI*${freqs[2] * 2}*t)*(0.5+0.5*sin(2*PI*0.2*t))`;
    const file = path.join(dir, `chord${i}.wav`);
    run(["-f", "lavfi", "-i", `aevalsrc='0.16*(${voices}+${shimmer})':s=44100:d=8`, "-af", "afade=t=in:d=2.5,afade=t=out:st=5.5:d=2.5,lowpass=f=1600", file]);
    return file;
  });
  const loop = path.join(dir, "loop.wav");
  run([
    ...clips.flatMap((c) => ["-i", c]),
    "-filter_complex",
    "[0][1]acrossfade=d=2[a];[a][2]acrossfade=d=2[b];[b][3]acrossfade=d=2,aecho=0.8:0.6:90|180:0.25|0.15",
    loop,
  ]);
  const music = path.join(dir, "music.wav");
  run([
    "-stream_loop",
    "-1",
    "-i",
    loop,
    "-af",
    `atrim=0:${seconds.toFixed(2)},afade=t=in:d=2,afade=t=out:st=${Math.max(0, seconds - 3).toFixed(2)}:d=3`,
    music,
  ]);
  return music;
}

// ---------------------------------------------------------------------------
// Stage: a branded 16:9 page served from the app's own origin, so the phone
// frame's iframe shares the app's storage.

const STAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: ${STAGE.width}px; height: ${STAGE.height}px; overflow: hidden; }
  body { font-family: "Segoe UI", system-ui, sans-serif; color: #1c1917;
    background: radial-gradient(70rem 50rem at -10% -15%, rgba(94,196,186,.55), transparent 60%),
                radial-gradient(60rem 45rem at 110% -5%, rgba(253,186,116,.6), transparent 60%),
                radial-gradient(60rem 40rem at 50% 120%, rgba(244,114,128,.22), transparent 65%), #fbf6ee; }
  body::before { content: ""; position: absolute; inset: 0; background-image: radial-gradient(rgba(15,76,80,.13) 1.3px, transparent 1.5px);
    background-size: 28px 28px; -webkit-mask-image: linear-gradient(to bottom, black, transparent 90%); }
  .brand { position: absolute; left: 72px; top: 56px; display: flex; align-items: center; gap: 14px; font-weight: 700; font-size: 26px; z-index: 3; }
  .logo { width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; color: #fff; font-size: 26px;
    background: linear-gradient(135deg, #0f766e, #f59e0b); box-shadow: 0 10px 24px rgba(15,118,110,.35); }
  .brand b { color: #0f766e; }
  .fade { transition: opacity .45s ease, transform .55s cubic-bezier(.2,.8,.2,1); }
  .out { opacity: 0; transform: translateY(24px); }
  #hero { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; z-index: 2; pointer-events: none; }
  #hero h1 { font-size: 104px; line-height: 1.02; margin: 0; letter-spacing: -.035em; font-weight: 800; }
  #hero p { font-size: 40px; color: #57534e; margin: 28px 0 0; }
  .grad { background: linear-gradient(90deg, #0f766e, #14b8a6 45%, #f59e0b); -webkit-background-clip: text; color: transparent; }
  #split { position: absolute; inset: 0; display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 96px; padding: 0 150px; }
  .copy { max-width: 820px; }
  #step { display: inline-block; font-size: 22px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #0f766e;
    background: rgba(255,255,255,.7); border: 1px solid rgba(15,118,110,.2); padding: 10px 18px; border-radius: 999px; }
  #head { font-size: 82px; line-height: 1.04; letter-spacing: -.03em; margin: 28px 0 0; font-weight: 800; }
  #sub { font-size: 34px; line-height: 1.4; color: #57534e; margin: 26px 0 0; }
  .phone { position: relative; width: ${PHONE.width + 28}px; height: ${PHONE.height + 28}px; border-radius: 64px; padding: 14px;
    background: #0b0f17; box-shadow: 0 50px 100px -30px rgba(15,40,50,.55), 0 0 0 2px #2a2f3a inset; }
  .phone::before { content: ""; position: absolute; top: 24px; left: 50%; transform: translateX(-50%); width: 120px; height: 30px; border-radius: 20px; background: #0b0f17; z-index: 2; }
  .phone iframe { display: block; width: ${PHONE.width}px; height: ${PHONE.height}px; border: 0; border-radius: 50px; background: #fbf6ee; }
  .slide { transition: opacity .6s ease, transform .8s cubic-bezier(.2,.8,.2,1); }
  .away { opacity: 0; transform: translateX(120px) rotate(4deg); }
</style></head><body>
  <div class="brand"><div class="logo">✈</div><span>Family<b>Trip</b></span></div>
  <div id="hero" class="fade"></div>
  <div id="split" class="fade out">
    <div class="copy fade"><div id="step"></div><h1 id="head"></h1><p id="sub"></p></div>
    <div id="phone" class="phone slide away"><iframe name="app" src="about:blank"></iframe></div>
  </div>
<script>
  const $ = (id) => document.getElementById(id);
  window.__hero = (html) => {
    $("split").classList.add("out"); $("phone").classList.add("away");
    $("hero").classList.add("out");
    setTimeout(() => { $("hero").innerHTML = html; $("hero").classList.remove("out"); }, 350);
  };
  window.__split = (step, head, sub) => {
    $("hero").classList.add("out");
    const copy = document.querySelector(".copy");
    copy.classList.add("out");
    setTimeout(() => {
      $("step").textContent = step; $("head").innerHTML = head; $("sub").innerHTML = sub;
      $("split").classList.remove("out"); $("phone").classList.remove("away"); copy.classList.remove("out");
    }, 350);
  };
</script></body></html>`;

async function hero(page: Page, html: string) {
  await page.evaluate(`window.__hero(${JSON.stringify(html)})`);
  await wait(400);
}

async function split(page: Page, step: string, head: string, sub: string) {
  await page.evaluate(`window.__split(${JSON.stringify(step)}, ${JSON.stringify(head)}, ${JSON.stringify(sub)})`);
  await wait(400);
}

// Passed as a string: tsx wraps named inner functions in a helper that
// doesn't exist in the browser.
async function smoothScroll(frame: Frame, by: number, ms = 1200) {
  await frame.evaluate(`new Promise((done) => {
    const start = window.scrollY, t0 = performance.now();
    requestAnimationFrame(function step(t) {
      const k = Math.min(1, (t - t0) / ${ms});
      window.scrollTo(0, start + ${by} * (1 - Math.cos(k * Math.PI)) / 2);
      if (k < 1) requestAnimationFrame(step); else done();
    });
  })`);
}

interface TripJson {
  members: { id: number; name: string }[];
  plans: { id: number; round: number; idx: number; data: { stops: { place: string }[] } }[];
}

async function tripJson(page: Page, slug: string): Promise<TripJson> {
  return (await (await page.request.get(`${BASE}/api/trips/${slug}`)).json()) as TripJson;
}

// ---------------------------------------------------------------------------

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const work = fs.mkdtempSync(path.join(OUT_DIR, ".rec-"));

  console.log(`Synthesising narration (${VOICE})…`);
  const voice = synthesize(work);

  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({ viewport: STAGE, deviceScaleFactor: 1, colorScheme: "light", recordVideo: { dir: work, size: STAGE } });
  await context.route(`${BASE}/__stage`, (route) => route.fulfill({ contentType: "text/html", body: STAGE_HTML }));

  const page = await context.newPage();
  const lisbon = await tripJson(page, "demo-lisbon");
  const singapore = await tripJson(page, "demo-singapore");
  const ravi = lisbon.members.find((m) => m.name === "Ravi")!.id;
  const mei = singapore.members.find((m) => m.name === "Mei")!.id;
  const mapPlan = lisbon.plans.find((p) => p.round === 1 && p.idx === 0)!;
  await context.addInitScript(
    ({ ravi, mei }) => {
      localStorage.setItem("familytrip:demo-lisbon:member", String(ravi));
      localStorage.setItem("familytrip:demo-singapore:member", String(mei));
      localStorage.removeItem("familytrip:demo-kyoto:member");
    },
    { ravi, mei },
  );

  await page.goto(`${BASE}/__stage`);
  const app = page.frame({ name: "app" })!;
  const t0 = Date.now();

  // Each line starts with its scene; the scene holds until it's spoken.
  const cues: { line: Line; at: number }[] = [];
  const say = (line: Line) => {
    cues.push({ line, at: (Date.now() - t0) / 1000 });
    const until = Date.now() + voice[line].seconds * 1000 + 250;
    return () => wait(Math.max(0, until - Date.now()));
  };
  console.log("Recording…");

  // 1. Hook, problem, promise
  await hero(page, `<div><h1>Family trip planning?</h1><p><span class="grad" style="font-weight:800">Sure got argument one.</span></p></div>`);
  await wait(300);
  await say("hook")();
  await hero(page, `<div><h1>4 people.<br>4 ideas.</h1><p>3 days of arguing. One person doing all the research.</p></div>`);
  await say("problem")();
  await hero(page, `<div><h1>Meet <span class="grad">FamilyTrip</span>.</h1><p>One day plan the whole family agrees on.</p></div>`);
  await say("intro")();

  // 2. Create
  await app.goto(BASE);
  await app.waitForSelector("text=Plan one day");
  await split(page, "Step 1 · Set up", "Where, when,<br>who's coming.", "Create a trip in under a minute.");
  let done = say("create");
  await wait(900);
  await app.getByPlaceholder("e.g. Kyoto").pressSequentially("Kyoto", { delay: 110 });
  await done();

  // 3. Everyone answers
  await app.goto(`${BASE}/t/demo-kyoto`);
  await app.waitForSelector("text=Who are you?");
  await split(page, "Step 2 · Everyone has a say", "Everyone answers<br>on their own phone.", "Energy level, must-dos, things to avoid.");
  await say("join")();
  await app.getByRole("button", { name: /^Mia/ }).click();
  await app.waitForSelector("text=what should the day fit for you");
  done = say("questions");
  await app.locator('input[type="range"]').first().fill("5");
  await app.getByPlaceholder("e.g. see a temple, go on a boat").pressSequentially("an arcade", { delay: 80 });
  await app.getByPlaceholder("e.g. long walks, crowds, museums").pressSequentially("temples all day", { delay: 70 });
  await done();
  await app.getByRole("button", { name: "Done" }).click();
  await app.waitForSelector("text=constraints");
  await split(page, "Step 2 · Everyone has a say", "No more<br>chasing replies.", "FamilyTrip nudges whoever hasn't answered.");
  await say("constraints")();

  // 4. Plans, checked against real data
  await app.goto(`${BASE}/t/demo-lisbon/plans`);
  await app.waitForSelector("text=Trams, tiles and custard tarts");
  await split(page, "Step 3 · AI-planned", 'Plans that<br>fit <span class="grad">everyone</span>.', "Three options, built by Claude around every answer.");
  await say("plans")();
  await split(page, "Step 3 · AI-planned", "No hidden<br>trade-offs.", "See who misses out, and why.");
  done = say("clashes");
  await smoothScroll(app, 330);
  await done();
  await split(page, "Step 3 · AI-planned", "Every detail<br>sorted.", "Timings, transport, food, and fun facts for the kids.");
  done = say("stops");
  await smoothScroll(app, 520, 1600);
  await done();
  await split(page, "Step 3 · Real data", "Checked against<br>the real world.", "Opening hours from Google Maps. Travel times on real public transport.");
  done = say("checks");
  await smoothScroll(app, 1400, 2200);
  await done();

  // 5. Command-centre map: drag the last stop to the top
  await app.goto(`${BASE}/t/demo-lisbon/plans/${mapPlan.id}/map`);
  const stops = mapPlan.data.stops;
  const handle = app.getByLabel(`Drag to move ${stops[stops.length - 1].place}`);
  await handle.waitFor();
  await wait(900); // let the map tiles settle
  await split(page, "Step 4 · Your day on a map", "Drag to<br>rearrange.", "Distances at a glance. Times and routes update by themselves.");
  done = say("map");
  await wait(600);
  const from = (await handle.boundingBox())!;
  const target = (await app.getByLabel(`Drag to move ${stops[0].place}`).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, target.y + 4, { steps: 40 });
  await wait(250);
  await page.mouse.up();
  await done();
  await wait(700);

  // 6. Vote
  await app.goto(`${BASE}/t/demo-lisbon/plans`);
  await app.waitForSelector("text=Trams, tiles and custard tarts");
  const lovePlan2 = app.getByRole("button", { name: "😍 Love it" }).nth(1);
  await lovePlan2.scrollIntoViewIfNeeded();
  await smoothScroll(app, -200, 600);
  await split(page, "Step 5 · Vote", "One no,<br>and it's out.", "Love it, OK, or no. Everyone gets a veto.");
  done = say("vote");
  await wait(900);
  await lovePlan2.click();
  await done();

  // 7. Round two and settle
  await app.goto(`${BASE}/t/demo-singapore/plans`);
  await app.waitForSelector("text=Settle on this?");
  await split(page, "Step 5 · Vote", "Still stuck?<br>Round two.", "New plans from everyone's votes and comments.");
  await say("round2")();
  await split(page, "Step 5 · Settle", 'One tap.<br><span class="grad">Settled.</span>', "When nobody says no, you're done.");
  await say("settle")();
  await app.getByRole("button", { name: "Yes, this is our day" }).click();
  await app.waitForURL(/\/result$/);
  await app.waitForSelector("text=Time to agree");
  await split(page, "The result", "Agreed in minutes.<br>Not days.", "Shiok!");
  done = say("done");
  await wait(600);
  await smoothScroll(app, 600, 1800);
  await done();

  // 8. Call to action
  await hero(
    page,
    `<div><h1><span class="grad">FamilyTrip</span></h1><p style="font-size:46px;color:#1c1917;font-weight:700;margin-top:20px">Plan together. No more quarrels.</p>
     <p style="font-size:28px">Free &amp; open source · github.com/1wongjackson/familytrip</p></div>`,
  );
  await say("end")();
  await wait(1500);

  const video = page.video();
  await context.close();
  await browser.close();
  const raw = await video!.path();
  // Saved so a failed mix can be retried with: npm run video -- --mix <dir>
  fs.writeFileSync(path.join(work, "cues.json"), JSON.stringify({ raw, cues: cues.map((c) => ({ file: voice[c.line].file, at: c.at })) }));
  mix(work);
  fs.rmSync(work, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Mixing

function readWav(file: string): Int16Array {
  const buf = fs.readFileSync(file);
  let p = 12;
  while (p < buf.length) {
    const id = buf.toString("ascii", p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === "data") return new Int16Array(buf.buffer.slice(buf.byteOffset + p + 8, buf.byteOffset + p + 8 + size));
    p += 8 + size + (size % 2);
  }
  throw new Error(`No audio data in ${file}`);
}

function writeWav(file: string, samples: Int16Array, rate: number) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples.byteLength, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples.byteLength, 40);
  fs.writeFileSync(file, Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)]));
}

// Lays each narration clip at its cue on one silent track the length of the
// video. (The bundled ffmpeg is too old to mix many clips without changing
// their levels.)
function buildVoiceTrack(dir: string, cues: { file: string; at: number }[], seconds: number): string {
  const RATE = 44100;
  const track = new Int16Array(Math.ceil(seconds * RATE));
  cues.forEach((c, i) => {
    const norm = path.join(dir, `norm${i}.wav`);
    run(["-i", c.file, "-ar", String(RATE), "-ac", "1", "-c:a", "pcm_s16le", norm]);
    const clip = readWav(norm);
    const start = Math.round(c.at * RATE);
    for (let k = 0; k < clip.length && start + k < track.length; k++) {
      track[start + k] = Math.max(-32768, Math.min(32767, track[start + k] + clip[k]));
    }
  });
  const out = path.join(dir, "voice.wav");
  writeWav(out, track, RATE);
  return out;
}

function mix(dir: string) {
  console.log("Mixing…");
  const { raw, cues } = JSON.parse(fs.readFileSync(path.join(dir, "cues.json"), "utf8")) as {
    raw: string;
    cues: { file: string; at: number }[];
  };
  const length = durationSec(raw);
  const music = makeMusic(dir, length);
  const voice = buildVoiceTrack(dir, cues, length);

  // The music sits low and ducks further whenever the narrator speaks. amix
  // halves each input, so the sum is doubled back up.
  const graph = [
    "[0:v]scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30[vout]",
    "[2:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=mono,volume=1.2,asplit=2[voice][key]",
    "[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=mono,volume=0.8[bed]",
    "[bed][key]sidechaincompress=threshold=0.03:ratio=6:attack=30:release=600[duck]",
    "[voice][duck]amix=inputs=2:duration=first,volume=2,alimiter=limit=0.9[aout]",
  ].join(";");

  const out = path.join(OUT_DIR, "familytrip-intro.mp4");
  run([
    ...["-i", raw, "-i", music, "-i", voice],
    ...["-filter_complex", graph, "-map", "[vout]", "-map", "[aout]"],
    ...["-c:v", "libx264", "-preset", "slow", "-crf", "22", "-pix_fmt", "yuv420p"],
    ...["-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"],
    out,
  ]);
  console.log(`Saved ${path.relative(process.cwd(), out)} (${durationSec(out).toFixed(0)}s, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
}

const mixArg = process.argv.indexOf("--mix");
if (mixArg !== -1) {
  mix(path.resolve(process.argv[mixArg + 1]));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
