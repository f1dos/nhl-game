// Frame-rate check of the 3D broadcast (?demo=broadcast) during live play.
// Usage: PW_CHANNEL=chrome node scripts/fps-3d.mjs [baseUrl] [query]
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH ?? "playwright");
const base = process.argv[2] ?? "http://localhost:5173";
const query = process.argv[3] ?? "?demo=broadcast";
const browser = await chromium.launch({
  channel: process.env.PW_CHANNEL,
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--ignore-gpu-blocklist", "--enable-gpu", ...(process.env.SOFTWARE_GL ? ["--use-angle=swiftshader","--enable-unsafe-swiftshader"] : [])],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(base + "/" + query, { waitUntil: "load" });
await page.waitForSelector(".bw-play", { timeout: 60000 });
const gpu = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown";
});
await page.locator(".bw-play").evaluate(button=>button.click());
await page.waitForTimeout(4000);
const sampleCount = Math.max(30,Number(process.env.FPS_SAMPLES) || 300);
const measure = () =>
  page.evaluate(
    target =>
      new Promise((resolve) => {
        const times = [];
        let last = performance.now();
        const loop = (t) => {
          times.push(t - last);
          last = t;
          if (times.length < target) requestAnimationFrame(loop);
          else {
            const sorted = [...times].sort((a, b) => a - b);
            const avg = times.reduce((a, b) => a + b, 0) / times.length;
            resolve({ fps: +(1000 / avg).toFixed(1), p95ms: +sorted[Math.floor(times.length * 0.95)].toFixed(1) });
          }
        };
        requestAnimationFrame(loop);
      }), sampleCount,
  );
const live = await measure();
if (process.env.MATCH_SCREENSHOT) await page.screenshot({path:process.env.MATCH_SCREENSHOT});
const state = await page.evaluate(() => window.__arena3d);
console.log(JSON.stringify({ gpu, query, sampleCount, resolution:"1920x1080", live, state }));
await browser.close();
