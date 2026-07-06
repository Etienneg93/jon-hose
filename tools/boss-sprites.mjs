/**
 * Bakes the Switch of Doom + Gateway Krusher 9000 CHASSIS into
 * sprites/switch/chassis.png and sprites/gatewaykrusher/chassis.png —
 * same pipeline as enemy-sprites.mjs (grid = 2px per logical unit, output
 * at 2x grid = 4x logical, 1-logical-px black outline pass).
 *
 * Baked-body + runtime-LED hybrid: blinking port LEDs and the GK's glowing
 * eyes are NOT baked — assets.js draws them as an overlay each frame. The
 * baked socket/eye-socket pixels are the "off" state. Cable tentacles stay
 * entity-drawn.
 *
 * Coordinates are copied from the procedural painters in assets.js, which
 * use feet-anchored ly-up local units; `up()` converts to the grid's y-down
 * rows. Port x positions are fractional in the painters — both this baker
 * and the runtime overlay round with Math.round so they land on the same
 * pixels.
 *
 *   node tools/boss-sprites.mjs           (bakes both)
 *   node tools/boss-sprites.mjs switch    (one)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---- grid helpers (see enemy-sprites.mjs) ---------------------------------
function makeGrid(w, h) { return { w, h, px: new Array(w * h).fill(null) }; }
function set(g, x, y, c) { if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.px[y * g.w + x] = c; }
function rect(g, x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(g, i, j, c); }
function outline(g) {
  const BLACK = "#000000";
  for (let pass = 0; pass < 2; pass++) {
    const marks = [];
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      if (g.px[y * g.w + x]) continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const c = g.px[(y + dy) * g.w + (x + dx)];
        return c && (pass === 0 ? c !== BLACK : c === BLACK);
      });
      if (n) marks.push([x, y]);
    }
    for (const [x, y] of marks) set(g, x, y, BLACK);
  }
}
function save(g, dir, name) {
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
  const out = path.join(ROOT, "sprites", dir, name);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, PNG.sync.write(png));
  console.log(`  ${path.relative(ROOT, out)}  (${png.width}x${png.height})`);
}

// Logical-unit rect (2 grid px per logical px).
const L = (g) => (x, y, w, h, c) => rect(g, x * 2, y * 2, w * 2, h * 2, c);

// ============================================================ SWITCH
// Art 56x25 logical, feet row 23 (1-px outline margin all around).
// Runtime overlay: the 8 blinking RJ45 LED fills at portX(i), ly 16.
function bakeSwitch() {
  const W = 56, H = 25, FEET = 23, CX = 28;
  const g = makeGrid(W * 2, H * 2);
  const l = L(g);
  const up = (lx, ly, w, h, c) => l(CX + lx, FEET - ly - h, w, h, c);

  const BODY = "#2a3346", DK = "#11151e", BEV = "#39455c";
  // chassis slab
  up(-24, 2, 48, 20, DK);
  up(-23, 16, 46, 6, BODY);           // port face
  up(-23, 6, 46, 4, BEV);             // bevel band
  up(-24, 0, 48, 2, "#0a0d14");       // base shadow
  up(-23, 11, 46, 1, "#1c2432");      // seam between bands
  // rack screws on the bevel band
  up(-21, 7, 1, 1, "#5a6a86"); up(20, 7, 1, 1, "#5a6a86");
  // brand plate (blank — reads as a label at a glance)
  up(-6, 7, 12, 2, "#1c2432");
  up(-5, 8, 10, 1, "#3a4560");
  // 8 RJ45 sockets, baked dark ("off"); the overlay lights them
  for (let i = 0; i < 8; i++) up(Math.round(-21 + i * 5.4), 16, 4, 4, "#0e2a1a");
  // static status LEDs
  up(-22, 10, 2, 2, "#ffd23f");
  up(20, 10, 2, 2, "#ff5a5a");
  // mounting ears + screws
  up(-26, 8, 2, 12, "#0a0d14"); up(24, 8, 2, 12, "#0a0d14");
  up(-26, 12, 1, 1, "#39455c"); up(25, 12, 1, 1, "#39455c");

  outline(g);
  save(g, "switch", "chassis.png");
}

// ======================================================= GATEWAY KRUSHER
// Art 52x63 logical, feet row 61. Runtime overlay: 3x8 blinking port LEDs
// at (gkPortX(i), 42 + row*5) and the glowing red eyes in the sockets.
function bakeGk() {
  const W = 52, H = 63, FEET = 61, CX = 26;
  const g = makeGrid(W * 2, H * 2);
  const l = L(g);
  const up = (lx, ly, w, h, c) => l(CX + lx, FEET - ly - h, w, h, c);

  const C = "#1e2535", D = "#0c0f18", FACE = "#8a7a6a", STUB = "#5a5050";
  // outer chassis + inner fill
  up(-22, 0, 44, 60, D);
  up(-20, 2, 40, 56, C);
  up(20, 2, 2, 56, "#141a28");        // right-side shade seam (inside dark rim)
  up(-20, 2, 2, 56, "#2a3346");       // left-side light seam
  up(-20, 56, 40, 3, "#39455c");      // top bevel
  up(-22, 0, 44, 2, "#0a0c14");       // base strip
  // rack ears + screws
  up(-24, 8, 2, 44, "#0a0c10"); up(22, 8, 2, 44, "#0a0c10");
  up(-24, 12, 1, 1, "#39455c"); up(23, 12, 1, 1, "#39455c");
  up(-24, 46, 1, 1, "#39455c"); up(23, 46, 1, 1, "#39455c");
  // 3 rows of port sockets near the top, baked dark ("off")
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 8; i++)
      up(Math.round(-18 + i * 4.5), 42 + row * 5, 3, 3, "#1a0808");
  // ---- the embedded face (ly 20-42) ----
  up(-11, 22, 22, 20, FACE);
  up(-11, 22, 1, 20, "#6e6055");      // face recess shade, left edge
  up(-10, 22, 20, 5, STUB);           // chin stubble band
  up(-9, 22, 2, 4, FACE); up(-5, 23, 2, 3, FACE);   // stubble flecks
  up(-1, 22, 2, 4, FACE); up(3, 23, 2, 3, FACE);
  up(6, 22, 2, 4, FACE);
  up(-7, 27, 14, 2, "#1a1010");                      // grimace
  up(-6, 28, 3, 2, "#0a0808"); up(3, 28, 3, 2, "#0a0808");  // teeth gaps
  up(-2, 29, 4, 5, "#9a8070");                       // nose
  up(-3, 29, 1, 4, "#7a6a5c");                       // nose shadow
  up(-10, 39, 8, 3, "#2a2020"); up(2, 39, 8, 3, "#2a2020"); // brow ridge
  up(-9, 33, 7, 6, "#0a0808"); up(2, 33, 7, 6, "#0a0808");  // eye sockets (glow is overlay)
  // vent slashes
  up(-18, 10, 5, 2, "#0a0c10"); up(-18, 13, 5, 1, "#0a0c10");
  up(13, 10, 5, 2, "#0a0c10"); up(13, 13, 5, 1, "#0a0c10");
  // static status LEDs
  up(-19, 5, 3, 3, "#ff3a3a"); up(16, 5, 3, 3, "#ff3a3a");
  up(-19, 18, 3, 3, "#ff3a3a"); up(16, 18, 3, 3, "#ff3a3a");

  outline(g);
  save(g, "gatewaykrusher", "chassis.png");
}

// ---------------------------------------------------------------------------
const BAKERS = { switch: bakeSwitch, gatewaykrusher: bakeGk };
const only = process.argv.slice(2);
const bad = only.filter((n) => !BAKERS[n]);
if (bad.length) {
  console.error(`Unknown type(s): ${bad.join(", ")}  (types: ${Object.keys(BAKERS).join(", ")})`);
  process.exit(1);
}
for (const [name, fn] of Object.entries(BAKERS)) {
  if (only.length && !only.includes(name)) continue;
  console.log(`Baking ${name}:`);
  fn();
}
