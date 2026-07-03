/* =====================================================================
   build.mjs — produces a deployable ./dist with CACHE-BUSTED assets.

   Why: static hosts (GitHub/Cloudflare Pages) + browsers cache JS/CSS, so
   after you push an update friends can keep running the OLD code. This
   stamps a version (the git short-SHA in CI, else a timestamp) onto every
   <script>/<link> URL — e.g. js/game.js?v=ab12cd34 — so a new build always
   forces a fresh download. It also injects <meta name="build"> which the
   title screen shows as a tiny "build <id>" tag, and which js/loader.js
   reads at runtime to stamp the same ?v= onto every IMAGE URL (sprites
   aren't referenced from index.html, so they can't be rewritten here).

   Source files are left untouched, so local dev (open index.html or
   `npm run dev`) keeps working with plain, un-versioned URLs.

   Usage:  node tools/build.mjs   (or: npm run build)  ->  ./dist
   ===================================================================== */
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const ROOT = process.cwd();
const DIST = path.join(ROOT, "dist");

function version() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 8);
  try { return execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(); }
  catch { return Date.now().toString(36); }
}
const V = version();

// Fresh dist/
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// Copy the static payload.
cpSync(path.join(ROOT, "styles.css"), path.join(DIST, "styles.css"));
for (const dir of ["js", "audio", "sprites"]) {
  cpSync(path.join(ROOT, dir), path.join(DIST, dir), { recursive: true });
}

// Stamp index.html: inject build meta + version every js/css URL.
const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
let html = readFileSync(path.join(ROOT, "index.html"), "utf8");
html = html.replace("</head>", `  <meta name="build" content="${V}">\n  <meta name="ver" content="${pkg.version}">\n</head>`);
html = html.replace(/(href|src)="(js\/[^"]+\.js|styles\.css)"/g,
  (_, attr, url) => `${attr}="${url}?v=${V}"`);
writeFileSync(path.join(DIST, "index.html"), html);

console.log(`Built dist/ at version ${V}`);
