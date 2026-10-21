// Records the ~60s intro video by driving the app in Chrome at phone size,
// with captions laid over the page. Needs the app running and demo data:
//
//   npm run seed && npm run video      (app on http://localhost:3000)
//
// Output: docs/familytrip-intro.mp4

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ffmpeg from "@ffmpeg-installer/ffmpeg";
import { chromium, type Page } from "playwright-core";

const BASE = process.env.FAMILYTRIP_URL ?? "http://localhost:3000";
const OUT_DIR = path.join(process.cwd(), "docs");
const VIEW = { width: 430, height: 880 };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CAPTION_JS = `
window.__caption = (text, step) => {
  let el = document.getElementById("ft-caption");
  if (!el) {
    el = document.createElement("div");
    el.id = "ft-caption";
    el.style.cssText = "position:fixed;left:14px;right:14px;bottom:18px;z-index:99999;padding:14px 16px;border-radius:18px;" +
      "background:rgba(10,18,32,.86);color:#fff;font:600 17px/1.35 system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.35);" +
      "backdrop-filter:blur(8px);transition:opacity .35s;";
    document.body.appendChild(el);
  }
  el.style.opacity = text ? "1" : "0";
  el.innerHTML = (step ? '<div style="font:700 11px/1 system-ui;letter-spacing:.12em;text-transform:uppercase;color:#5eead4;margin-bottom:6px">' + step + '</div>' : '') + text;
};`;

async function caption(page: Page, text: string, step = "") {
  await page.evaluate(({ text, step }) => (window as unknown as { __caption: (t: string, s: string) => void }).__caption(text, step), { text, step });
}

async function card(page: Page, html: string, ms: number) {
  await page.setContent(`<!doctype html><html><body style="margin:0;height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;
    background:radial-gradient(40rem 30rem at -10% -10%,rgba(94,196,186,.55),transparent 60%),radial-gradient(36rem 28rem at 110% 0%,rgba(253,186,116,.6),transparent 60%),#fbf6ee;color:#1c1917">
    <div style="padding:32px;text-align:center">${html}</div></body></html>`);
  await wait(ms);
}

// Passed as a string: tsx wraps named inner functions in a helper that
// doesn't exist in the browser.
async function smoothScroll(page: Page, by: number, ms = 1200) {
  await page.evaluate(`new Promise((done) => {
    const start = window.scrollY, t0 = performance.now();
    requestAnimationFrame(function step(t) {
      const k = Math.min(1, (t - t0) / ${ms});
      window.scrollTo(0, start + ${by} * (1 - Math.cos(k * Math.PI)) / 2);
      if (k < 1) requestAnimationFrame(step); else done();
    });
  })`);
}

async function memberId(page: Page, slug: string, name: string): Promise<number> {
  const res = await page.request.get(`${BASE}/api/trips/${slug}`);
  const state = (await res.json()) as { members: { id: number; name: string }[] };
  return state.members.find((m) => m.name === name)!.id;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const rawDir = fs.mkdtempSync(path.join(OUT_DIR, ".rec-"));

  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: 2,
    colorScheme: "light",
    recordVideo: { dir: rawDir, size: { width: VIEW.width * 2, height: VIEW.height * 2 } },
  });
  await context.addInitScript(CAPTION_JS);
  const page = await context.newPage();

  // Who each scene's phone belongs to.
  const mia = await memberId(page, "demo-kyoto", "Mia");
  const ravi = await memberId(page, "demo-lisbon", "Ravi");
  const mei = await memberId(page, "demo-singapore", "Mei");
  await context.addInitScript(
    ({ mia, ravi, mei }) => {
      localStorage.setItem("familytrip:demo-lisbon:member", String(ravi));
      localStorage.setItem("familytrip:demo-singapore:member", String(mei));
      if (!sessionStorage.getItem("ft-kyoto-set")) {
        localStorage.removeItem("familytrip:demo-kyoto:member");
        sessionStorage.setItem("ft-kyoto-set", "1");
      }
      void mia;
    },
    { mia, ravi, mei },
  );

  // 1. Title and problem
  await card(
    page,
    `<div style="display:inline-grid;place-items:center;width:84px;height:84px;border-radius:24px;background:linear-gradient(135deg,#0f766e,#f59e0b);color:#fff;font-size:44px;box-shadow:0 12px 30px rgba(15,118,110,.35)">✈</div>
     <h1 style="font-size:44px;margin:22px 0 8px;letter-spacing:-.02em">FamilyTrip</h1>
     <p style="font-size:21px;color:#57534e;margin:0">One day plan the whole family accepts.</p>`,
    3500,
  );
  await card(
    page,
    `<p style="font-size:15px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#0f766e;margin:0 0 14px">The problem</p>
     <p style="font-size:27px;font-weight:700;line-height:1.3;margin:0">Two parents, two kids,<br>four different ideas.</p>
     <p style="font-size:19px;color:#57534e;line-height:1.5;margin:18px 0 0">One person does all the research.<br>Agreeing takes about <b>3 days</b>.</p>`,
    4500,
  );

  // 2. Home
  await page.goto(BASE);
  await page.waitForSelector("text=Plan one day");
  await caption(page, "Create a trip: where, when, and who's coming.", "Step 1");
  await wait(1500);
  await page.getByPlaceholder("e.g. Kyoto").pressSequentially("Kyoto", { delay: 90 });
  await wait(2200);

  // 3. Everyone answers on their own phone
  await page.goto(`${BASE}/t/demo-kyoto`);
  await page.waitForSelector("text=Who are you?");
  await caption(page, "Everyone opens the link on their own phone and picks their name.", "Step 2");
  await wait(2500);
  await page.getByRole("button", { name: /^Mia/ }).click();
  await page.waitForSelector("text=what should the day fit for you");
  await caption(page, "A few quick questions: energy, must-dos, things to avoid, food and travel limits.", "Step 2");
  await page.locator('input[type="range"]').first().fill("5");
  await page.getByPlaceholder("e.g. see a temple, go on a boat").pressSequentially("an arcade", { delay: 80 });
  await page.getByPlaceholder("e.g. long walks, crowds, museums").pressSequentially("temples all day", { delay: 70 });
  await wait(1200);
  await page.getByRole("button", { name: "Done" }).click();
  await page.waitForSelector("text=constraints");
  await caption(page, "Answers become constraints. The app nudges whoever hasn't answered yet.", "Step 2");
  await wait(3500);

  // 4. Three plans, checked against real data
  await page.goto(`${BASE}/t/demo-lisbon/plans`);
  await page.waitForSelector("text=Trams, tiles and custard tarts");
  await caption(page, "Claude proposes 3 genuinely different day plans that fit everyone's answers.", "Step 3");
  await wait(2500);
  await smoothScroll(page, 330);
  await caption(page, "Clashes are out in the open: who misses out, and why.", "Step 3");
  await wait(2500);
  await smoothScroll(page, 520, 1600);
  await caption(page, "Every stop has timings, transport, food and a fun fact for the kids.", "Step 3");
  await wait(2800);
  await smoothScroll(page, 1500, 2200);
  await caption(page, "Opening hours are checked on Google Maps, and travel times on real public transport.", "Step 3");
  await wait(3000);

  // 5. Vote
  await page.evaluate(() => window.scrollTo(0, 0));
  const lovePlan2 = page.getByRole("button", { name: "😍 Love it" }).nth(1);
  await lovePlan2.scrollIntoViewIfNeeded();
  await smoothScroll(page, -200, 600);
  await caption(page, "Everyone votes: love it, OK, or no. A single no rules a plan out.", "Step 4");
  await wait(1200);
  await lovePlan2.click();
  await wait(2500);

  // 6. Settle
  await page.goto(`${BASE}/t/demo-singapore/plans`);
  await page.waitForSelector("text=Settle on this?");
  await caption(page, "No plan worked in round 1, so Claude made 3 new ones from the votes and comments.", "Step 5");
  await wait(3200);
  await caption(page, "Now nobody says no. One tap settles it.", "Step 5");
  await wait(1800);
  await page.getByRole("button", { name: "Yes, this is our day" }).click();
  await page.waitForURL(/\/result$/);
  await page.waitForSelector("text=Time to agree");
  await caption(page, "Agreed in minutes, not days.", "Done");
  await wait(3500);
  await smoothScroll(page, 600, 1800);
  await wait(1500);

  // 7. End card
  await card(
    page,
    `<p style="font-size:30px;font-weight:800;line-height:1.25;margin:0;letter-spacing:-.01em">Answer.<br>Vote.<br><span style="background:linear-gradient(90deg,#0f766e,#f59e0b);-webkit-background-clip:text;color:transparent">Settle.</span></p>
     <p style="font-size:18px;color:#57534e;margin:24px 0 0">FamilyTrip</p>
     <p style="font-size:15px;color:#78716c;margin:6px 0 0">github.com/1wongjackson/familytrip</p>`,
    4000,
  );

  const video = page.video();
  await context.close();
  await browser.close();
  const raw = await video!.path();

  const out = path.join(OUT_DIR, "familytrip-intro.mp4");
  execFileSync(ffmpeg.path, [
    "-y",
    "-loglevel",
    "error",
    "-i",
    raw,
    "-vf",
    "scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30",
    "-c:v",
    "libx264",
    "-preset",
    "slow",
    "-crf",
    "24",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-an",
    out,
  ]);
  fs.rmSync(rawDir, { recursive: true, force: true });
  console.log(`Saved ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
