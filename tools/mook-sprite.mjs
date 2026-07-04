/**
 * Bakes the Mook enemy into sprites/mook/*.png as deterministic pixel art —
 * same pipeline as shop-props.mjs (grid = 2px per logical unit, output saved
 * at 2x grid = 4x logical, 1-logical-px black outline pass).
 *
 * Poses: idle0/idle1 (breath), walk0..3 (contact-pass-contact-pass), wind
 * (punch telegraph). Each also baked as an elite_ variant (bulked shoulders,
 * brighter jacket, blood-red beanie). All face RIGHT; the painter mirrors.
 *
 *   node tools/mook-sprite.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "sprites", "mook");
fs.mkdirSync(OUT_DIR, { recursive: true });

// ---- grid helpers (see shop-props.mjs) ------------------------------------
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
  const out = path.join(OUT_DIR, name);
  fs.writeFileSync(out, PNG.sync.write(png));
  console.log(`  ${path.relative(ROOT, out)}  (${png.width}x${png.height})`);
}

// ---- palettes ---------------------------------------------------------------
// Regular: JH.PAL mook hues. Elite: brighter jacket, blood beanie, gold tooth.
function pal(elite) {
  return {
    jacket:   elite ? "#b85a5a" : "#a04848",
    jacketHi: elite ? "#cf7070" : "#b85e5e",
    jacketDk: elite ? "#7e3535" : "#6e2f2f",
    beanie:   elite ? "#7a2020" : "#23252a",
    beanieHi: elite ? "#963030" : "#33363d",
    skin: "#f1c08a", skinDk: "#c98f5a",
    eye: "#1a1a1a", brow: "#4a3020",
    denim: "#2c3040", denimHi: "#3a4054", denimDk: "#20242f",
    boot: "#1c1e24", bootHi: "#2c2f38",
    belt: "#15151c", buckle: elite ? "#ffd23f" : "#8a8f9a",
    tee: "#d8d2c4",
  };
}

// ---- the mook ---------------------------------------------------------------
// Logical canvas 24x33 (grid 48x66). Feet baseline at logical row 31.
// All coords in LOGICAL units via l() helpers; pose params shift limbs.
//   bob:   0/1 px body drop (walk passing frames + idle breath)
//   legR / legL: forward offset of right(front)/leg  (+ = toward facing)
//   armR / armL: forward offset of arms
//   wind:  punch telegraph (right arm cocked up/back, lean forward)
function drawMook(g, o, elite) {
  const P = pal(elite);
  const L = (x, y, w, h, c) => rect(g, x * 2, y * 2, w * 2, h * 2, c);
  const bob = o.bob || 0;
  const lean = o.wind ? 1 : 0;
  const cx = 11 + lean;                 // torso center column
  const FEET = 31;

  // ---- legs (rows 22..31): hip block, two legs, boots
  const hipY = 22 + bob;
  L(cx - 4, hipY, 8, 2, P.denim);                        // hips
  L(cx - 4, hipY, 8, 1, P.belt);                         // belt
  L(cx - 1, hipY, 1, 1, P.buckle);                       // buckle
  // right leg (front, draws over)  |  left leg (back)
  const rl = o.legR || 0, ll = o.legL || 0;
  L(cx - 4 + ll, hipY + 2, 3, FEET - hipY - 4, P.denimDk);   // back leg
  L(cx - 4 + ll, FEET - 2 + (o.backUp ? -1 : 0), 4, 2, P.boot);
  L(cx + 1 + rl, hipY + 2, 3, FEET - hipY - 4, P.denim);     // front leg
  L(cx + 1 + rl, hipY + 2, 1, FEET - hipY - 4, P.denimHi);   // front-leg light edge
  L(cx + 1 + rl, FEET - 2, 4, 2, P.boot);                // both boots 4 wide,
  L(cx + 1 + rl, FEET - 2, 4, 1, P.bootHi);              // 1px toe past the shin

  // ---- torso (rows 12..22): open jacket over a tee
  const ty = 12 + bob;
  L(cx - 5, ty, 10, 10, P.jacket);                       // jacket body
  L(cx - 5, ty, 2, 10, P.jacketDk);                      // back-side shade
  L(cx + 3, ty, 2, 9, P.jacketHi);                       // front light edge
  L(cx - 1, ty + 1, 2, 9, P.tee);                        // open zip: tee strip
  L(cx - 5, ty, 10, 1, P.jacketDk);                      // collar
  L(cx - 5, ty + 9, 10, 1, P.jacketDk);                  // hem
  if (elite) {                                           // bulked shoulder pads
    L(cx - 7, ty, 2, 4, P.jacketDk);
    L(cx + 5, ty, 2, 4, P.jacketDk);
  }

  // ---- arms: dark sleeves so they read against the jacket body
  if (o.wind) {
    // Punch telegraph: fist cocked high above the shoulder, clearly detached
    L(cx + 4, ty, 2, 2, P.jacketDk);                     // shoulder joint
    L(cx + 5, ty - 3, 2, 3, P.jacketDk);                 // raised forearm
    L(cx + 5, ty - 6, 3, 3, P.skin);                     // big fist above head line
    L(cx - 6, ty + 2, 2, 6, P.jacketDk);                 // back arm braced
    L(cx - 6, ty + 8, 2, 2, P.skinDk);
  } else {
    const ar = o.armR || 0, al = o.armL || 0;
    L(cx + 4 + ar, ty + 1, 2, 6, P.jacketDk);            // front sleeve
    L(cx + 4 + ar, ty + 7, 2, 2, P.skin);                // fist
    L(cx - 6 + al, ty + 1, 2, 6, P.jacketDk);            // back sleeve
    L(cx - 6 + al, ty + 7, 2, 2, P.skinDk);              // back fist
  }

  // ---- head (rows 4..12): beanie + mug
  const hy = 4 + bob + (o.wind ? 1 : 0);
  L(cx - 3, hy + 3, 8, 5, P.skin);                       // face block
  L(cx - 3, hy + 3, 1, 5, P.skinDk);                     // back-of-head shade
  L(cx - 3, hy + 7, 8, 1, P.skinDk);                     // jaw stubble
  L(cx + 2, hy + 4, 1, 1, o.wind ? "#c22" : P.eye);      // eye (red when winding)
  L(cx + 1, hy + 4 - (o.wind ? 1 : 0), 2, 1, P.brow);    // brow (angry when winding)
  L(cx + 4, hy + 5, 1, 1, P.skinDk);                     // nose nub
  L(cx - 3, hy, 8, 3, P.beanie);                         // beanie
  L(cx - 3, hy + 2, 8, 1, P.beanieHi);                   // fold
  L(cx - 2, hy + 3, 6, 1, P.beanie);                     // brim shadow line
}

const POSES = {
  idle0: { bob: 0 },
  idle1: { bob: 1 },                                      // breath
  walk0: { legR: 2, legL: -1, armR: -1, armL: 1 },        // contact: right fwd
  walk1: { bob: 1, legR: 0, legL: 0 },                    // pass
  walk2: { legR: -1, legL: 2, armR: 1, armL: -1, backUp: 1 }, // contact: left fwd
  walk3: { bob: 1, legR: 0, legL: 0 },                    // pass
  wind:  { wind: 1 },
};

console.log("Baking mook sprites:");
for (const elite of [false, true]) {
  for (const [name, pose] of Object.entries(POSES)) {
    const g = makeGrid(48, 66);
    drawMook(g, pose, elite);
    outline(g);
    save(g, (elite ? "elite_" : "") + name + ".png");
  }
}
