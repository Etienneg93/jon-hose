// Curate FX frames from the local itch.io packs (sprites/effects/, gitignored)
// into tracked sprites/fx/<key>/1..N.png. Re-pick a variant by changing its
// source dir below and rerunning:  node tools/curate-fx.mjs
// If a new pick has a different frame count, update JH.FX in js/config.js.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const FIRE_FLOOR = "sprites/effects/Pixel Fire Asset Pack Floored";
const FIRE_FREE  = "sprites/effects/Pixel Fire Asset Pack Colored";

const PICKS = {
  "fire-small": { dir: `${FIRE_FLOOR}/fire asset red floored/Group 4 - 3`, match: /_\d+\.png$/ },
  "fire-big":   { dir: `${FIRE_FLOOR}/fire asset red floored/Group 6 - 2`, match: /_\d+\.png$/ },
  "fire-jon":   { dir: `${FIRE_FREE}/fire asset red/Group 4 - 3`,          match: /_\d+\.png$/ },
  "boom-small": { dir: "sprites/effects/Explosions/explosion-1-a/Sprites", match: /\.png$/ },
  "boom-mid":   { dir: "sprites/effects/Explosions/explosion-2-b/Sprites", match: /\.png$/ },
  "boom-big":   { dir: "sprites/effects/Explosions/explosion-1-d/Sprites", match: /\.png$/ },
  "portal":     { dir: "sprites/effects", match: /^portal-spritesheetblue\d+\.png$/ },
};

// Numeric-aware sort so frame 10 follows 9, not 1.
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });

for (const [key, pick] of Object.entries(PICKS)) {
  const src = path.join(ROOT, pick.dir);
  const files = fs.readdirSync(src).filter((f) => pick.match.test(f)).sort(natural);
  if (!files.length) { console.error(`${key}: NO MATCHES in ${pick.dir}`); process.exitCode = 1; continue; }
  const out = path.join(ROOT, "sprites", "fx", key);
  fs.rmSync(out, { recursive: true, force: true });   // drop stale frames from a prior pick
  fs.mkdirSync(out, { recursive: true });
  files.forEach((f, i) => fs.copyFileSync(path.join(src, f), path.join(out, `${i + 1}.png`)));
  console.log(`${key}: ${files.length} frames <- ${pick.dir}`);
}
