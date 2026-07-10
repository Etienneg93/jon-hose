/**
 * Bakes the UI icon atlas into sprites/icons/<key>.png — same pipeline as
 * boss-sprites.mjs (grid = 2px per logical unit, output at 2x grid = 4x
 * logical). Icons are 12x12 logical (grid 24x24, PNG 48x48).
 *
 * Outline choice (applied to ALL icons for consistency): a single-pass
 * half-logical-px rim in #0a0e18 instead of the enemy bakers' two-pass
 * 1-logical-px black outline — the full pass eats too much of a 12px glyph.
 *
 * Consumers: JH.ICONS.keys (config.js) lists every key; Assets.icon
 * (assets.js) blits them. Keep the BAKERS key set and JH.ICONS.keys in sync.
 *
 *   node tools/icon-sprites.mjs           (bakes all)
 *   node tools/icon-sprites.mjs hp dash   (some)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---- grid helpers (see enemy-sprites.mjs / boss-sprites.mjs) --------------
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
const FIRE = "#ff8030", FIRE_HI = "#ffd23f";
const EARTH = "#c8a050", EARTH_DK = "#8a6a30", EARTH_HI = "#e8cf90";
const AIR = "#bfe8ff", AIR_DK = "#7aa8c8";
const STEEL = "#dfe8f5", STEEL_DK = "#8fa8c8";
const RED = "#ff5a5a", RED_HI = "#ff9a9a", RED_DK = "#a02030";
const GREEN = "#80ff80";
const WOOD = "#8a6b46", WOOD_HI = "#b08a5c";

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

// ---------------------------------------------------------------- stats ----
const BAKERS = {
  // Nozzle + widening jet.
  dmg(l) {
    l(1, 4, 3, 4, EARTH); l(1, 4, 3, 1, EARTH_HI);      // brass nozzle
    l(4, 5, 2, 2, WATER); l(6, 4, 3, 4, WATER); l(9, 3, 2, 6, WATER);
    l(4, 5, 7, 1, WATER_HI);                            // jet core line
  },
  // Horizontal arrow.
  range(l) {
    l(1, 5, 7, 2, STEEL); l(1, 6, 7, 1, STEEL_DK);      // shaft
    l(8, 3, 1, 6, STEEL); l(9, 4, 1, 4, STEEL); l(10, 5, 1, 2, STEEL);
  },
  water(l) { droplet(l, WATER, WATER_DK, WATER_HI); },
  // Small droplet + rising arrow.
  regen(l) {
    l(3, 4, 1, 2, WATER); l(2, 6, 3, 4, WATER); l(2, 7, 1, 1, WATER_HI);
    l(8, 2, 2, 1, GREEN); l(7, 3, 4, 1, GREEN); l(8, 4, 2, 6, GREEN);
  },
  hp(l) {
    l(2, 3, 3, 2, RED); l(7, 3, 3, 2, RED);             // lobes (cleft at top)
    l(5, 4, 2, 1, RED_DK);                              // cleft shadow
    l(2, 5, 8, 2, RED); l(3, 7, 6, 1, RED); l(4, 8, 4, 1, RED); l(5, 9, 2, 1, RED);
    l(3, 3, 1, 1, RED_HI);
  },
  // Double chevron.
  knockback(l) { chevron(l, 2, STEEL); chevron(l, 6, STEEL_DK); l(2, 2, 1, 1, "#ffffff"); },
  // Boot + wind lines.
  speed(l) {
    l(1, 4, 3, 1, STEEL_DK); l(1, 7, 2, 1, STEEL_DK);   // wind
    l(6, 2, 3, 5, EARTH); l(6, 7, 5, 2, EARTH);         // shaft + foot
    l(6, 9, 5, 1, EARTH_DK);                            // sole
    l(6, 2, 1, 4, EARTH_HI);
  },
  // Motion-streaked chevron.
  dash(l) {
    l(1, 4, 3, 1, AIR_DK); l(2, 6, 3, 1, AIR_DK); l(1, 8, 2, 1, AIR_DK);
    chevron(l, 6, "#9be8ff"); l(6, 2, 1, 1, "#ffffff");
  },
  // Leaning hollow ghost.
  dodge(l) {
    l(5, 2, 4, 1, AIR);                                 // crown (shifted right = lean)
    l(4, 3, 1, 1, AIR); l(9, 3, 1, 1, AIR);
    l(3, 4, 1, 4, AIR); l(9, 4, 1, 4, AIR);             // sides
    l(3, 8, 1, 1, AIR); l(5, 8, 1, 1, AIR); l(7, 8, 1, 1, AIR); l(9, 8, 1, 1, AIR); // scallop
    l(5, 4, 1, 1, AIR); l(7, 4, 1, 1, AIR);             // eyes
  },
  // Blood droplet with white fangs.
  vamp(l) {
    droplet(l, RED, RED_DK, RED_HI);
    l(4, 5, 1, 2, "#ffffff"); l(7, 5, 1, 2, "#ffffff");
  },

  // ------------------------------------------------------------ elements --
  el_water(l) { droplet(l, WATER, WATER_DK, WATER_HI); l(5, 5, 1, 1, WATER_HI); },
  el_fire(l) {
    l(6, 1, 1, 2, FIRE); l(3, 3, 1, 2, FIRE);           // tip + side lick
    l(5, 2, 3, 2, FIRE); l(4, 4, 5, 2, FIRE);
    l(3, 5, 6, 3, FIRE); l(4, 8, 4, 1, FIRE); l(5, 9, 2, 1, FIRE);
    l(5, 6, 2, 3, FIRE_HI); l(6, 5, 1, 1, FIRE_HI);     // hot core
  },
  el_earth(l) {
    l(4, 3, 4, 1, EARTH); l(3, 4, 6, 4, EARTH); l(4, 8, 4, 2, EARTH);
    l(4, 4, 2, 2, EARTH_HI);                            // facet
    l(7, 5, 1, 3, EARTH_DK); l(3, 7, 6, 1, EARTH_DK);   // crack + shade
  },
  el_air(l) {
    l(2, 3, 7, 1, AIR); l(9, 2, 1, 1, AIR);             // gusts w/ upturned tails
    l(1, 6, 8, 1, "#eaf6ff"); l(9, 5, 1, 1, "#eaf6ff");
    l(3, 9, 6, 1, AIR_DK); l(9, 8, 1, 1, AIR_DK);
  },

  // ------------------------------------------------------------- essence --
  // Gold cross — same read as the essence_cross pickup painter.
  essence(l) {
    l(2, 3, 8, 2, GOLD);                                // crossbar
    l(2, 4, 8, 1, GOLD_DK);
    l(5, 1, 2, 10, GOLD);                               // upright
    l(5, 1, 1, 9, GOLD_HI);                             // inner shine
  },

  // -------------------------------------------------------------- relics --
  brass_nozzle(l) {
    l(1, 5, 1, 2, "#1f6f3f");                           // hose stub
    l(2, 4, 3, 4, EARTH); l(5, 3, 3, 6, EARTH); l(8, 2, 2, 8, EARTH);
    l(2, 4, 6, 1, EARTH_HI); l(8, 2, 1, 1, EARTH_HI);   // shine
    l(9, 3, 1, 6, "#3a2a10");                           // dark mouth
  },
  spigot_key(l) {
    l(4, 1, 3, 1, GOLD); l(3, 2, 1, 2, GOLD); l(7, 2, 1, 2, GOLD); l(4, 4, 3, 1, GOLD); // bow
    l(4, 2, 1, 1, GOLD_HI);
    l(5, 5, 2, 5, GOLD);                                // shaft
    l(7, 7, 2, 1, GOLD); l(7, 9, 2, 1, GOLD);           // teeth
    l(5, 5, 1, 5, GOLD_DK);
  },
  loaded_sponge(l) {
    l(2, 3, 8, 5, GOLD); l(2, 3, 8, 1, GOLD_HI);
    l(4, 5, 1, 1, GOLD_DK); l(6, 4, 1, 1, GOLD_DK); l(7, 6, 1, 1, GOLD_DK); // pores
    l(2, 7, 8, 1, WATER_DK);                            // soaked bottom
    l(3, 9, 1, 2, WATER); l(7, 9, 1, 1, WATER);         // drips
  },
  prayer_bead(l) {
    const B = "#c86a3c", BH = "#e89a6c";
    l(5, 1, 1, 1, B); l(7, 2, 1, 1, BH); l(8, 4, 1, 1, B); l(8, 6, 1, 1, B);
    l(7, 8, 1, 1, BH); l(5, 9, 1, 1, B); l(3, 8, 1, 1, B); l(2, 6, 1, 1, BH);
    l(2, 4, 1, 1, B); l(3, 2, 1, 1, B);
    l(5, 10, 1, 1, GOLD);                               // pendant
  },
  collection_plate(l) {
    l(4, 4, 3, 3, GOLD); l(5, 5, 1, 1, GOLD_HI);        // coin
    l(1, 7, 10, 1, STEEL); l(2, 8, 8, 1, STEEL_DK);     // plate
  },
  censer(l) {
    l(6, 1, 1, 1, STEEL_DK); l(5, 2, 1, 1, STEEL_DK); l(6, 3, 1, 1, STEEL_DK); // chain
    l(8, 2, 1, 1, STEEL_DK); l(9, 1, 1, 1, STEEL_DK);   // smoke
    l(4, 4, 4, 1, GOLD_DK);                             // lid
    l(3, 5, 6, 3, GOLD); l(3, 5, 1, 2, GOLD_HI);        // body
    l(4, 6, 1, 1, GOLD_DK); l(6, 6, 1, 1, GOLD_DK);     // slits
    l(4, 8, 4, 1, GOLD_DK);                             // base
  },
  sunday_suit(l) {
    const SUIT = "#33384a", SUIT_DK = "#23273a", SHIRT = "#eaf6ff";
    l(2, 3, 8, 7, SUIT);
    l(4, 3, 1, 3, SUIT_DK); l(7, 3, 1, 3, SUIT_DK);     // lapels
    l(4, 2, 4, 1, SHIRT); l(5, 3, 2, 2, SHIRT);         // collar + shirt V
    l(5, 5, 2, 3, RED_DK); l(5, 5, 2, 1, "#c03040");    // tie + knot
    l(3, 5, 1, 1, SHIRT);                               // pocket square
  },
  punch_card(l) {
    l(2, 2, 7, 1, STEEL); l(2, 3, 8, 7, STEEL);         // card, cut corner at (9,2)
    l(2, 9, 8, 1, STEEL_DK);
    const H = "#33384a";
    l(4, 4, 1, 1, H); l(6, 4, 1, 1, H); l(4, 6, 1, 1, H); l(7, 6, 1, 1, H); l(5, 8, 1, 1, H);
  },
  dowsing_rod(l) {
    l(5, 5, 2, 6, WOOD); l(5, 5, 1, 3, WOOD_HI);        // stem
    l(4, 4, 1, 1, WOOD); l(3, 3, 1, 1, WOOD); l(2, 2, 1, 1, WOOD);   // left arm
    l(7, 4, 1, 1, WOOD); l(8, 3, 1, 1, WOOD); l(9, 2, 1, 1, WOOD);   // right arm
  },
  alarm_bell(l) {
    l(5, 1, 2, 1, GOLD_DK);                             // handle
    l(4, 2, 4, 2, GOLD); l(3, 4, 6, 3, GOLD); l(2, 7, 8, 1, GOLD);
    l(2, 8, 8, 1, GOLD_DK);                             // mouth
    l(5, 9, 2, 1, GOLD_DK);                             // clapper
    l(4, 3, 1, 3, GOLD_HI);
    l(1, 4, 1, 1, STEEL_DK); l(10, 4, 1, 1, STEEL_DK);  // ring-out ticks
  },
};

// ---------------------------------------------------------------------------
const only = process.argv.slice(2);
const bad = only.filter((n) => !BAKERS[n]);
if (bad.length) {
  console.error(`Unknown icon(s): ${bad.join(", ")}  (keys: ${Object.keys(BAKERS).join(", ")})`);
  process.exit(1);
}
console.log("Baking icons:");
for (const [name, fn] of Object.entries(BAKERS)) {
  if (only.length && !only.includes(name)) continue;
  save(icon(fn), name);
}
