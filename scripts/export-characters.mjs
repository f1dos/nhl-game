// Run against npm run dev. Uses the same Playwright setup as screenshots-3d.mjs.
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_PATH ?? "playwright",
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
});
try {
  const page = await browser.newPage();
  // Give ES modules a same-origin document without starting a match or ModelLab.
  await page.route("**/bake.html", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html>" }),
  );
  await page.goto((process.argv[2] ?? "http://localhost:5173") + "/bake.html");
  for (const role of ["skater", "goalie"]) {
    const data = await page.evaluate(
      async (goalie) =>
        (await import("/scripts/bake-character.ts")).bakeCharacter(goalie),
      role === "goalie",
    );
    await writeFile(
      new URL(
        "../public/models/hockey/" + role + "-match.glb",
        import.meta.url,
      ),
      Buffer.from(data, "base64"),
    );
  }
} finally {
  await browser.close();
}
