// Visual review of the 3D match: model close-ups and broadcast frames.
// Usage: node scripts/screenshots-3d.mjs [baseUrl] [outDir]
// Needs Playwright with Chromium installed (not a project dependency):
//   npm i -g playwright && npx playwright install chromium
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? "playwright");
const base = process.argv[2] ?? "http://localhost:5173";
const out = process.argv[3] ?? "docs/screenshots";
fs.mkdirSync(out, { recursive: true });

const shots = [
  ["model-front", "?demo=models&view=front"],
  ["model-side", "?demo=models&view=side"],
  ["model-back", "?demo=models&view=back"],
  ["goalie-butterfly", "?demo=models&view=goalie"],
  ["faceoff", "?demo=models&view=faceoff"],
  ["goal-celebration", "?demo=models&view=celebrate"],
  ["lineup", "?demo=models&view=lineup"],
];

// PW_CHANNEL=chrome|msedge uses an installed browser (real GPU); otherwise
// Playwright's Chromium with software GL.
const channel = process.env.PW_CHANNEL;
const browser = await chromium.launch(
  channel
    ? { channel, args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization"] }
    : { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] },
);
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("console", (m) => m.type() === "error" && console.log("console", m.text()));
for (const [name, query] of shots) {
  await page.goto(base + "/" + query, { waitUntil: "load" });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  console.log("shot", name);
}
// Broadcast demo: general view, then wait for play and measure fps.
const extra = process.env.BROADCAST_SHOTS?.split(",") ?? [];
await page.goto(base + "/?demo=broadcast", { waitUntil: "load" });
await page.waitForSelector(".bw-play", { timeout: 60000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: path.join(out, "broadcast-intro.png") });
await page.click(".bw-play");
await page.waitForTimeout(7000);
await page.screenshot({ path: path.join(out, "broadcast-wide.png") });
// Wait for the first goal (the score text changes) and grab the replay/celebration.
const goal = await page
  .waitForFunction(() => [...document.querySelectorAll(".bw-bug-team strong")].some((e) => Number(e.textContent) > 0), null, { timeout: 150000 })
  .then(() => true)
  .catch(() => false);
if (goal) {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, "broadcast-goal.png") });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, "broadcast-replay.png") });
}
const fps = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let n = 0;
      const t0 = performance.now();
      const loop = () => {
        n++;
        if (performance.now() - t0 < 5000) requestAnimationFrame(loop);
        else resolve((n * 1000) / (performance.now() - t0));
      };
      requestAnimationFrame(loop);
    }),
);
console.log("broadcast fps (headless, software GL)", fps.toFixed(1));
for (const label of extra) {
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(out, `broadcast-${label}.png`) });
}
await browser.close();
