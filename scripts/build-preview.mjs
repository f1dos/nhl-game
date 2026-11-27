// Builds single-file previews with the 3D arena inlined (the regular build
// loads it lazily, which a file:// page cannot do):
//   dist/downloads/NHL-Manager-27-preview.html          full game
//   dist/downloads/NHL-Manager-27-broadcast-demo.html   live match broadcast
import fs from "node:fs";
import path from "node:path";
import { build } from "vite";

const root = process.cwd();
const out = path.join(root, "dist-preview");
await build({
  root,
  base: "./",
  logLevel: "warn",
  build: {
    outDir: out,
    assetsInlineLimit: file => file.endsWith("player-faces.webp") || /\.(glb|wav)$/i.test(file) || undefined,
    emptyOutDir: true,
    chunkSizeWarningLimit: 6000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
let html = fs.readFileSync(path.join(out, "index.html"), "utf8");
html = html.replace(/<script[^>]+src="([^"]+)"[^>]*><\/script>/g, (_, src) =>
  '<script type="module">' +
  fs.readFileSync(path.join(out, src), "utf8").replace(/<\/script/gi, "<\\/script") +
  "</script>",
);
html = html.replace(/<link[^>]+href="([^"]+\.css)"[^>]*>/g, (_, src) =>
  "<style>" + fs.readFileSync(path.join(out, src), "utf8") + "</style>",
);
const downloads = path.join(root, "dist", "downloads");
fs.mkdirSync(downloads, { recursive: true });
fs.writeFileSync(path.join(downloads, "NHL-Manager-27-preview.html"), html);
fs.writeFileSync(
  path.join(downloads, "NHL-Manager-27-broadcast-demo.html"),
  html.replace("<head>", '<head><script>window.__NHL_DEMO__="broadcast"</script>'),
);
fs.writeFileSync(path.join(downloads,"NHL-Manager-27-model-lab.html"), html.replace("<head>", '<head><script>window.__NHL_DEMO__="models"</script>'));
fs.rmSync(out, { recursive: true, force: true });
console.log("Built single-file previews in dist/downloads.");
