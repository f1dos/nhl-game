import fs from "node:fs";
import path from "node:path";
import { zipSync } from "fflate";
const root = process.cwd();
const dist = path.join(root, "dist");
fs.mkdirSync(path.join(dist, "downloads"), { recursive: true });
let html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
html = html.replace(
  /<script[^>]+src="([^"]+)"[^>]*><\/script>/g,
  (_, src) =>
    '<script type="module">' +
    fs
      .readFileSync(path.join(dist, src.replace(/^\//, "")), "utf8")
      .replace(/<\/script/gi, "<\\/script") +
    "</script>",
);
html = html.replace(
  /<link[^>]+href="([^"]+\.css)"[^>]*>/g,
  (_, src) =>
    "<style>" +
    fs.readFileSync(path.join(dist, src.replace(/^\//, "")), "utf8") +
    "</style>",
);
fs.writeFileSync(path.join(dist, "downloads", "NHL-Manager-27.html"), html);
const files = {};
function collect(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), {
    withFileTypes: true,
  })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) collect(rel);
    else
      files["nhl-manager-27/" + rel] = new Uint8Array(
        fs.readFileSync(path.join(root, rel)),
      );
  }
}
for (const dir of ["src", "tests", "scripts"]) collect(dir);
for (const file of [
  "README.md",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "index.html",
  ".gitignore",
])
  files["nhl-manager-27/" + file] = new Uint8Array(
    fs.readFileSync(path.join(root, file)),
  );
fs.writeFileSync(
  path.join(dist, "downloads", "nhl-manager-27-source.zip"),
  zipSync(files, { level: 6 }),
);
fs.copyFileSync(
  path.join(root, "README.md"),
  path.join(dist, "downloads", "README.md"),
);
console.log("Packaged standalone HTML and source ZIP.");
