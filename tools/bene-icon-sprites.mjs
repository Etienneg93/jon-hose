/**
 * Bakes benediction icons into sprites/icons/bene_<id>.png — same pipeline as
 * tools/icon-sprites.mjs (12x12 logical grid, 2 grid px per logical px,
 * half-px rim outline, 48x48 output). Standalone by convention (helpers
 * copied verbatim, not imported) — never touches the other bakers' files.
 *
 * Consumers: JH.ICONS.keys (config.js) lists every "bene_<id>" key;
 * Assets.icon (assets.js) blits them. Keep this BAKERS key set and
 * JH.ICONS.keys in sync with js/benedictions.js DEFS.
 *
 *   node tools/bene-icon-sprites.mjs             (bakes all 24)
 *   node tools/bene-icon-sprites.mjs split_stream (some, id without prefix)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---- grid helpers (copied verbatim from tools/icon-sprites.mjs) -----------
function makeGrid(w, h) { return { w, h, px: new Array(w * h).fill(null) }; }
function set(g, x, y, c) { if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.px[y * g.w + x] = c; }
function rect(g, x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(g, i, j, c); }
// Single-pass rim: every empty grid px 4-adjacent to a filled one goes dark.
function outline(g) {
  const RIM = "#0a0e18";
  const marks = [];
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (g.px[y * g.w + x]) continue;
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const xx = x + dx, yy = y + dy;
      return xx >= 0 && yy >= 0 && xx < g.w && yy < g.h && g.px[yy * g.w + xx];
    });
    if (n) marks.push([x, y]);
  }
  for (const [x, y] of marks) set(g, x, y, RIM);
}
function save(g, name) {
  const SCALE = 2;
  const png = new PNG({ width: g.w * SCALE, height: g.h * SCALE });
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const c = g.px[y * g.w + x];
    if (!c) continue;
    const r = parseInt(c.slice(1, 3), 16), gg = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
    for (let j = 0; j < SCALE; j++) for (let i = 0; i < SCALE; i++) {
      const idx = ((y * SCALE + j) * png.width + x * SCALE + i) * 4;
      png.data[idx] = r; png.data[idx + 1] = gg; png.data[idx + 2] = b; png.data[idx + 3] = 255;
    }
  }
  const out = path.join(ROOT, "sprites", "icons", name + ".png");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, PNG.sync.write(png));
  console.log(`  ${path.relative(ROOT, out)}  (${png.width}x${png.height})`);
}

// Logical-unit rect (2 grid px per logical px) on a 12x12-logical icon grid.
const SIZE = 12;
function icon(drawFn) {
  const g = makeGrid(SIZE * 2, SIZE * 2);
  const l = (x, y, w, h, c) => rect(g, x * 2, y * 2, w * 2, h * 2, c);
  drawFn(l, g);
  outline(g);
  return g;
}

// ---- palette (mirrors JH.PAL / SIGIL_COLORS so UI + icons stay in sync) ---
const GOLD = "#ffd23f", GOLD_DK = "#caa015", GOLD_HI = "#fff7c2";
const WATER = "#6cd3ff", WATER_DK = "#2a93d8", WATER_HI = "#d6f6ff";
const FIRE = "#ff8030", FIRE_HI = "#ffd23f", FIRE_DK = "#c1531a";
const EARTH = "#c8a050", EARTH_DK = "#8a6a30", EARTH_HI = "#e8cf90";
const AIR = "#bfe8ff", AIR_DK = "#7aa8c8";
const AIR_HI = "#eaf6ff"; // wispy-white air highlight (matches el_air's literal)

// Shared droplet (classic teardrop, tip at top). base = body color.
function droplet(l, base, dk, hi) {
  l(5, 1, 2, 2, base);
  l(4, 3, 4, 2, base);
  l(3, 5, 6, 4, base);
  l(4, 9, 4, 1, base);
  l(8, 5, 1, 4, dk);        // right shade
  l(4, 6, 1, 2, hi);        // sheen
}

// 2px-thick chevron pointing right, apex at (x+3, 5..6).
function chevron(l, x, c) {
  for (let i = 0; i < 4; i++) { l(x + i, 2 + i, 1, 2, c); l(x + i, 8 - i, 1, 2, c); }
}

// Concentric ring band: every px with distance in [rIn, rOut] of (cx,cy).
function ring(l, cx, cy, rIn, rOut, c, angMin, angMax) {
  for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) {
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
    if (d < rIn || d > rOut) continue;
    if (angMin !== undefined) {
      const a = Math.atan2(dy, dx);
      if (a < angMin || a > angMax) continue;
    }
    l(x, y, 1, 1, c);
  }
}

// ---------------------------------------------------------------- glyphs ---
const BAKERS = {
  // ---- Water — control & sustain ----
  // Split Stream — a stream that forks into a Y.
  bene_split_stream: icon((l) => {
    l(5, 1, 2, 5, WATER);              // trunk
    l(4, 5, 2, 2, WATER_DK);           // fork joint
    l(3, 6, 2, 4, WATER); l(2, 9, 2, 2, WATER_HI);   // left branch + tip
    l(7, 6, 2, 4, WATER); l(8, 9, 2, 2, WATER_HI);   // right branch + tip
  }),
  // Baptismal Wake — ripple ring above a footprint (dash leaves a wet mark).
  bene_baptismal_wake: icon((l) => {
    ring(l, 5.5, 3.0, 1.8, 2.8, WATER);          // thick ripple ring, stays connected
    l(5, 2, 2, 2, WATER_HI);                     // splash droplet at ring center
    l(4, 7, 4, 1, WATER);                        // toe (narrow ball of foot)
    l(3, 8, 6, 3, WATER_DK); l(3, 8, 6, 1, WATER); // sole widens into the heel
  }),
  // Overflow — a cup filled past the brim, spilling.
  bene_overflow: icon((l) => {
    l(3, 4, 6, 6, WATER_DK);      // cup vessel
    l(3, 4, 6, 1, WATER_HI);      // rim
    l(2, 3, 8, 1, WATER);         // liquid brimming over the rim
    l(1, 2, 2, 1, WATER_HI);      // spill arcing off the left
    l(0, 4, 1, 2, WATER_HI);      // falling drop
  }),
  // Baptize — droplet crowned with a halo ring.
  bene_baptize: icon((l) => {
    droplet(l, WATER, WATER_DK, WATER_HI);
    ring(l, 5.5, 1.2, 2.0, 2.6, WATER_HI);
  }),
  // Absolution — a heart glowing inside the droplet.
  bene_absolution: icon((l) => {
    droplet(l, WATER, WATER_DK, WATER_HI);
    l(4, 5, 1, 1, WATER_HI); l(6, 5, 1, 1, WATER_HI);   // heart lobes
    l(4, 6, 3, 2, WATER_HI);                             // heart body
    l(5, 8, 1, 1, WATER_HI);                             // heart point
  }),

  // ---- Fire — damage & risk ----
  // Scalding Faith — a fire-hot droplet trailing steam wisps.
  bene_scalding_faith: icon((l) => {
    droplet(l, FIRE, FIRE_DK, FIRE_HI);
    l(3, 0, 1, 2, "#ffe9c2"); l(8, 0, 1, 2, "#ffe9c2");  // steam wisps
  }),
  // Backdraft — a flame-swirl double chevron (dash idiom, fire palette).
  bene_backdraft: icon((l) => {
    chevron(l, 2, FIRE);
    chevron(l, 6, FIRE_DK);
    l(2, 2, 1, 1, FIRE_HI);      // hot tip
    l(6, 5, 1, 2, FIRE_HI);      // mid-flick
  }),
  // Trial by Fire — a burning target ring, bullseye lit.
  bene_trial_by_fire: icon((l) => {
    ring(l, 5.5, 5.5, 4.2, 5.0, FIRE_DK);
    ring(l, 5.5, 5.5, 2.4, 3.0, FIRE);
    l(5, 5, 2, 2, FIRE_HI);
    l(5, 0, 2, 1, FIRE); l(5, 10, 2, 1, FIRE); l(0, 5, 1, 2, FIRE); l(10, 5, 1, 2, FIRE);
  }),
  // Ash Walk — a charred boot standing on a bed of glowing embers.
  bene_ash_walk: icon((l) => {
    l(4, 2, 3, 5, FIRE_DK);                          // boot shaft
    l(4, 7, 6, 2, FIRE_DK);                          // foot
    l(4, 7, 3, 1, FIRE);                              // ankle glow
    l(1, 9, 10, 1, "#3a1a08");                        // scorched ground
    l(1, 9, 2, 1, FIRE_HI); l(5, 9, 1, 1, FIRE); l(9, 9, 2, 1, FIRE_HI); // embers underfoot
  }),

  // ---- Earth — force & interrupts ----
  // Aftershock — a plus-shaped impact burst over a cracked wall.
  bene_aftershock: icon((l) => {
    l(1, 8, 10, 3, EARTH_DK); l(1, 8, 10, 1, EARTH);   // wall
    l(4, 9, 1, 2, EARTH_DK); l(7, 8, 1, 3, EARTH_DK);   // crack seams (dk-on-dk gap read via rim)
    l(5, 1, 2, 5, EARTH_HI);      // vertical burst ray
    l(2, 3, 7, 2, EARTH_HI);      // horizontal burst ray
    l(3, 2, 1, 1, EARTH); l(8, 2, 1, 1, EARTH); l(3, 6, 1, 1, EARTH); l(8, 6, 1, 1, EARTH);
  }),
  // Sure Grip — a gauntlet fist with a thumb bump (reads apart from a cup/box).
  bene_sure_grip: icon((l) => {
    l(3, 5, 6, 4, EARTH); l(3, 5, 6, 1, EARTH_HI);      // fist body + knuckle sheen
    l(4, 6, 1, 3, EARTH_DK); l(6, 6, 1, 3, EARTH_DK); l(8, 6, 1, 3, EARTH_DK); // finger seams
    l(1, 7, 2, 3, EARTH); l(1, 7, 2, 1, EARTH_HI);      // thumb bump on the side
    l(4, 9, 4, 2, EARTH_DK);                             // wrist cuff
  }),
  // Bedrock Vigor — a heart built of stacked earth strata.
  bene_bedrock: icon((l) => {
    l(3, 3, 2, 2, EARTH); l(3, 3, 2, 1, EARTH_HI);
    l(7, 3, 2, 2, EARTH); l(7, 3, 2, 1, EARTH_HI);      // twin lobes
    l(3, 5, 6, 2, EARTH_DK);                             // middle strata band
    l(4, 7, 4, 2, EARTH);                                // lower strata band
    l(5, 9, 2, 1, EARTH_DK);                             // point
  }),
  // Landslide — a round tumbling boulder with a motion trail.
  bene_landslide: icon((l) => {
    ring(l, 6.3, 5.0, 0, 3.4, EARTH);        // boulder disk (true circle, shifted right for trail room)
    ring(l, 7.4, 6.0, 0, 2.0, EARTH_DK);     // shaded lower-right
    ring(l, 5.2, 3.7, 0, 1.1, EARTH_HI);     // highlight facet upper-left
    l(0, 9, 2, 1, EARTH_DK); l(2, 10, 2, 1, EARTH_DK); l(1, 8, 1, 1, EARTH_HI); // tumble trail
  }),

  // ---- Air — tempo ----
  // Gale Stride — a winged boot.
  bene_gale_stride: icon((l) => {
    l(5, 4, 3, 5, AIR); l(5, 4, 1, 4, AIR_HI);          // boot shaft + shine
    l(5, 9, 4, 2, AIR); l(5, 9, 4, 1, AIR_DK);          // foot + sole
    l(2, 5, 3, 1, AIR_DK); l(1, 6, 3, 1, AIR_HI); l(2, 7, 3, 1, AIR_DK); // wing feathers
  }),
  // Slipstream Draft — a double swirl trail (dash idiom, air palette).
  bene_slipstream: icon((l) => {
    chevron(l, 2, AIR);
    chevron(l, 6, AIR_DK);
    l(2, 2, 1, 1, AIR_HI); l(6, 2, 1, 1, AIR_HI);
  }),
  // Tailwind Tithe — a coin trailing gust lines.
  bene_tailwind: icon((l) => {
    l(4, 3, 4, 6, AIR);
    l(4, 3, 1, 1, AIR_DK); l(7, 3, 1, 1, AIR_DK); l(4, 8, 1, 1, AIR_DK); l(7, 8, 1, 1, AIR_DK); // round shave
    l(5, 4, 2, 1, AIR_HI);          // shine band
    l(9, 4, 2, 1, AIR_DK); l(10, 6, 2, 1, AIR); l(9, 8, 2, 1, AIR_DK);  // gust lines
  }),
  // Eye of the Storm — full cyclone rings around a calm bright center.
  bene_eye_of_storm: icon((l) => {
    ring(l, 5.5, 5.5, 3.6, 4.6, AIR_DK);   // outer ring, full + thick enough to stay solid
    ring(l, 5.5, 5.5, 1.8, 2.6, AIR);      // mid ring
    l(4, 4, 4, 4, AIR_HI);                 // calm bright center
    l(9, 2, 1, 1, AIR_DK);                 // detached fleck = spin/motion cue
  }),

  // ---- Duos — two-tone ----
  // Steam Sermon (water+fire) — steam cloud over an open book.
  bene_steam_sermon: icon((l) => {
    l(3, 2, 6, 2, WATER_HI); l(2, 3, 3, 2, WATER); l(7, 3, 3, 2, WATER);  // cloud
    l(2, 8, 4, 3, FIRE); l(6, 8, 4, 3, FIRE_HI);    // open book halves
    l(5, 7, 2, 4, GOLD_DK);                          // spine
  }),
  // Mudslide (water+earth) — a brown/blue wave, water cresting over mud.
  bene_mudslide: icon((l) => {
    l(1, 5, 10, 2, WATER); l(1, 4, 4, 1, WATER_HI);     // crest + foam
    l(1, 7, 10, 3, EARTH_DK);                            // mud body
    l(2, 7, 3, 1, EARTH); l(7, 7, 3, 1, EARTH);          // mud flecks
  }),
  // Firestorm (fire+air) — a flame tornado, hot at the base, airy at the tip.
  bene_firestorm: icon((l) => {
    l(3, 9, 6, 2, FIRE_DK);        // base
    l(4, 7, 4, 2, FIRE);           // narrowing
    l(5, 5, 2, 2, FIRE_HI);        // hot core transition
    l(5, 3, 2, 2, AIR);            // upper funnel
    l(5, 1, 2, 2, AIR_HI);         // wispy top
    l(2, 7, 1, 1, FIRE); l(9, 3, 1, 1, AIR);
  }),

  // ---- Legendaries — element + gold ----
  // Pressure Sermon (water) — a bursting gauge, needle pegged full.
  bene_pressure_sermon: icon((l) => {
    ring(l, 5.5, 6.5, 0, 3.6, WATER_DK);     // gauge body disk
    ring(l, 5.5, 6.5, 0, 2.6, WATER);        // face
    l(5, 3, 2, 4, GOLD);                     // needle pegged full
    l(5, 2, 2, 1, GOLD_HI);                  // needle tip, poking past the rim
    l(2, 3, 1, 1, GOLD); l(9, 3, 1, 1, GOLD); // burst ticks
    l(5, 7, 2, 1, WATER_HI);                 // pivot
  }),
  // Bushfire (fire) — a spreading row of flames, gold embers between.
  bene_bushfire: icon((l) => {
    l(1, 7, 2, 4, FIRE_DK); l(1, 7, 2, 1, FIRE);
    l(4, 5, 3, 6, FIRE); l(4, 5, 3, 1, FIRE_HI);
    l(8, 7, 3, 4, FIRE_DK); l(8, 7, 3, 1, FIRE);
    l(3, 4, 1, 1, GOLD); l(7, 4, 1, 1, GOLD);
  }),
  // Standing Stone (earth) — a monolith with a gold crown notch.
  bene_standing_stone: icon((l) => {
    l(4, 2, 4, 9, EARTH); l(5, 2, 2, 9, EARTH_HI);   // slab + face light
    l(3, 10, 6, 1, EARTH_DK);                        // base
    l(5, 1, 2, 1, GOLD);                             // crown notch
  }),
  // Whirlwind Walk (air) — a tapering cyclone funnel over two planted boots, gold-capped.
  bene_whirlwind_walk: icon((l) => {
    l(2, 9, 3, 2, AIR_DK); l(2, 9, 2, 1, AIR_HI);         // left boot + sole hi
    l(7, 9, 3, 2, AIR_DK); l(7, 9, 2, 1, AIR_HI);         // right boot, gap = stance
    ring(l, 5.5, 6.0, 2.6, 3.4, AIR);                     // lower funnel ring (wide)
    ring(l, 5.5, 3.8, 1.4, 2.0, AIR_DK);                  // upper funnel ring (narrow, tapered)
    l(5, 1, 2, 2, GOLD); l(5, 0, 2, 1, GOLD_HI);          // gold-capped tip
  }),
};

// ---------------------------------------------------------------------------
const only = process.argv.slice(2).map((n) => (n.startsWith("bene_") ? n : "bene_" + n));
const bad = only.filter((n) => !BAKERS[n]);
if (bad.length) {
  console.error(`Unknown icon(s): ${bad.join(", ")}  (keys: ${Object.keys(BAKERS).join(", ")})`);
  process.exit(1);
}
console.log("Baking benediction icons:");
for (const [name, g] of Object.entries(BAKERS)) {
  if (only.length && !only.includes(name)) continue;
  save(g, name);
}
