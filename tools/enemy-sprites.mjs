/**
 * Bakes the regular-enemy roster (charger, pyro, stalker, fuse, smelt) into
 * sprites/<enemy>/*.png — same pipeline as mook-sprite.mjs / shop-props.mjs:
 * grid = 2px per logical unit, output at 2x grid = 4x logical, 1-logical-px
 * black outline pass. All face RIGHT; painters mirror.
 *
 * Not baked here: furnace (body color lerps with heat at runtime), the
 * bosses (Switch/GK want a baked-body + runtime-LED hybrid, separate pass).
 * Pyro is baked WITHOUT its flame crown — the painter keeps drawing that
 * procedurally on top (it flickers at runtime).
 *
 *   node tools/enemy-sprites.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

// Logical-unit rect on a grid (2 grid px per logical px).
const L = (g) => (x, y, w, h, c) => rect(g, x * 2, y * 2, w * 2, h * 2, c);
const SKIN = "#f1c08a", SKIND = "#c98f5a";

// ============================================================= CHARGER
// Bulky bruiser (bodyW 18, bodyH 30). Art 26x35 logical, feet row 33.
function charger(g, o, elite) {
  const l = L(g);
  const P = {
    body:   elite ? "#8d5bca" : "#7a4fb0",
    bodyHi: elite ? "#a578dd" : "#9268c8",
    bodyDk: "#523078",
    band: "#3a1f5a", belt: "#2a1740",
  };
  const bob = o.bob || 0, lean = o.lean || 0;
  const cx = 12 + lean, FEET = 33;
  const hipY = 22 + bob;
  // legs — thick
  const rl = o.legR || 0, ll = o.legL || 0;
  l(cx - 5, hipY, 10, 2, P.belt);
  l(cx - 5 + ll, hipY + 2, 4, FEET - hipY - 4, P.bodyDk);
  l(cx - 5 + ll, FEET - 2, 5, 2, "#241a30");
  l(cx + 1 + rl, hipY + 2, 4, FEET - hipY - 4, P.body);
  l(cx + 1 + rl, FEET - 2, 5, 2, "#241a30");
  // torso — wide slab
  const ty = 10 + bob;
  l(cx - 7, ty, 14, 12, P.body);
  l(cx - 7, ty, 3, 12, P.bodyDk);
  l(cx + 4, ty, 3, 11, P.bodyHi);
  l(cx - 7, ty, 14, 2, P.bodyDk);                        // collar slab
  l(cx - 7, ty + 10, 14, 2, P.belt);                     // waist band
  // shoulder pad, pushed forward when winding/charging
  const sf = o.charge ? 3 : o.wind ? 1 : 0;
  l(cx + 4 + sf, ty - 1, 4, 6, P.bodyDk);
  l(cx + 4 + sf, ty - 1, 4, 1, P.bodyHi);
  if (elite) { l(cx - 8, ty - 1, 3, 6, P.bodyDk); }      // second pad
  // arms
  l(cx - 8, ty + 3, 2, 7, P.bodyDk);
  l(cx - 8, ty + 10, 2, 2, SKIND);
  if (!o.charge) { l(cx + 6 + sf, ty + 4, 2, 6, P.bodyDk); l(cx + 6 + sf, ty + 10, 2, 2, SKIN); }
  else { l(cx + 7, ty + 2, 3, 2, P.bodyDk); l(cx + 10, ty + 2, 2, 2, SKIN); }  // fist thrust out
  // head — low, wedged into the shoulders
  const hy = 3 + bob + (o.charge ? 2 : 0);
  l(cx - 3, hy + 2, 8, 6, SKIN);
  l(cx - 3, hy + 2, 1, 6, SKIND);
  l(cx - 3, hy + 6, 8, 1, SKIND);                        // jaw
  const hot = o.wind || o.charge;
  if (hot) l(cx + 1, hy + 3, 4, 2, "#7a0000");           // red glare behind eye
  l(cx + 2, hy + 4, 2, 1, hot ? "#ff3030" : "#111");     // eye
  l(cx - 3, hy, 8, 2, P.band);                           // headband
  l(cx - 3, hy + 1, 8, 1, "#4a2a70");
}

// ============================================================= PYRO
// Ranged ember-thrower (bodyW 16). Art 24x33 logical, feet 31. Flame crown
// is NOT baked — the painter draws it flickering above the head (top ~row 5).
function pyro(g, o, elite) {
  const l = L(g);
  const P = {
    body:   elite ? "#ff9d4a" : "#ff8a3c",
    bodyHi: elite ? "#ffb870" : "#ffa55e",
    bodyDk: "#c1531a",
    pouch: "#8a3a10", lens: "#ffd23f",
  };
  const bob = o.bob || 0;
  const cx = 11, FEET = 31;
  const hipY = 22 + bob;
  const rl = o.legR || 0, ll = o.legL || 0;
  l(cx - 4, hipY, 8, 2, P.bodyDk);                       // hips
  l(cx - 4 + ll, hipY + 2, 3, FEET - hipY - 4, P.bodyDk);
  l(cx - 4 + ll, FEET - 2, 4, 2, "#7a3510");
  l(cx + 1 + rl, hipY + 2, 3, FEET - hipY - 4, P.body);
  l(cx + 1 + rl, FEET - 2, 4, 2, "#7a3510");
  // torso — flame suit with belly pouch of embers
  const ty = 13 + bob;
  l(cx - 5, ty, 10, 9, P.body);
  l(cx - 5, ty, 2, 9, P.bodyDk);
  l(cx + 3, ty, 2, 8, P.bodyHi);
  l(cx - 2, ty + 4, 5, 4, P.pouch);                      // ember pouch
  l(cx - 1, ty + 5, 1, 1, P.lens); l(cx + 1, ty + 6, 1, 1, P.lens); // embers peeking
  if (elite) { l(cx - 7, ty, 2, 4, P.bodyDk); l(cx + 5, ty, 2, 4, P.bodyDk); }
  // arms — wind pose cocks the throwing arm back with an ember in hand
  if (o.wind) {
    l(cx - 6, ty - 2, 2, 4, P.bodyDk);                   // arm swung up-back
    l(cx - 7, ty - 4, 3, 3, "#ffd23f");                  // glowing ember in hand
    l(cx + 4, ty + 2, 2, 5, P.bodyDk);                   // lead arm
    l(cx + 4, ty + 7, 2, 2, SKIN);
  } else {
    const ar = o.armR || 0, al = o.armL || 0;
    l(cx + 4 + ar, ty + 1, 2, 6, P.bodyDk);
    l(cx + 4 + ar, ty + 7, 2, 2, SKIN);
    l(cx - 6 + al, ty + 1, 2, 6, P.bodyDk);
    l(cx - 6 + al, ty + 7, 2, 2, SKIND);
  }
  // head — goggles under the (runtime) flame crown; top of head at row 5+bob
  const hy = 5 + bob;
  l(cx - 3, hy, 8, 8, SKIN);
  l(cx - 3, hy, 1, 8, SKIND);
  l(cx - 3, hy + 7, 8, 1, SKIND);
  l(cx - 3, hy + 2, 8, 3, "#3a2410");                    // goggle band
  l(cx + 1, hy + 3, 3, 2, P.lens);                       // lens toward facing
  l(cx - 2, hy + 3, 2, 2, "#8a6a20");                    // off-side lens, dim
}

// ============================================================= STALKER
// Lean blink-assassin (bodyW 14, bodyH 26). Art 20x31 logical, feet 29.
function stalker(g, o, elite) {
  const l = L(g);
  const P = {
    cloak:   elite ? "#a53a6e" : "#8a2f5a",
    cloakHi: elite ? "#c05688" : "#a44672",
    cloakDk: "#591b3a",
    grin: "#ffffff", eye: "#ff5aa0",
  };
  const bob = o.bob || 0, lean = o.lean || 0;
  const cx = 10 + lean, FEET = 29;
  const hipY = 21 + bob;
  const rl = o.legR || 0, ll = o.legL || 0;
  l(cx - 3 + ll, hipY, 2, FEET - hipY - 2, P.cloakDk);   // slim legs
  l(cx - 3 + ll, FEET - 2, 3, 2, "#2a0f1e");
  l(cx + 1 + rl, hipY, 2, FEET - hipY - 2, P.cloak);
  l(cx + 1 + rl, FEET - 2, 3, 2, "#2a0f1e");
  // cloak torso with a tattered hem
  const ty = 11 + bob;
  l(cx - 4, ty, 8, 10, P.cloak);
  l(cx - 4, ty, 2, 10, P.cloakDk);
  l(cx + 2, ty, 2, 9, P.cloakHi);
  for (let i = 0; i < 4; i++) l(cx - 4 + i * 2, ty + 10, 1, 1, P.cloak);  // hem teeth
  // arms / strike blade
  if (o.strike) {
    l(cx + 3, ty + 2, 4, 2, P.cloakDk);                  // thrust arm
    l(cx + 7, ty + 2, 5, 1, "#d8d8e8");                  // blade
  } else {
    l(cx + 3, ty + 2, 2, 5, P.cloakDk);
    l(cx - 5, ty + 2, 2, 5, P.cloakDk);
  }
  // hooded head
  const hy = 3 + bob + (o.wind ? 1 : 0);
  l(cx - 3, hy + 2, 7, 7, P.cloak);                      // hood block
  l(cx - 3, hy + 2, 2, 7, P.cloakDk);                    // hood back shade
  l(cx - 1, hy + 3, 5, 5, "#14060e");                    // deep face shadow
  l(cx + 1, hy + 4, 2, 1, P.eye);                        // glowing eye
  l(cx + 1, hy + 4, 1, 1, "#ffb0d8");                    // eye hot pixel
  if (o.wind) { l(cx - 1, hy + 6, 4, 1, P.grin); l(cx, hy + 7, 2, 1, P.grin); } // the grin = blink tell
  l(cx - 4, hy, 7, 2, P.cloak);                          // hood top
  l(cx - 5, hy + 1, 2, 3, P.cloakDk);                    // swept-back hood point
}

// ============================================================= FUSE
// Small frantic walking bomb (bodyW 14). Art 20x29 logical, feet 27.
function fuse(g, o, elite) {
  const l = L(g);
  const P = {
    body:   elite ? "#ff6a30" : "#ff4810",
    bodyHi: elite ? "#ff9a60" : "#ff7a48",
    bodyDk: "#cc2800",
    cord: "#3a2a1a", spark: "#ffd23f", sparkHot: "#ffffff",
  };
  const bob = o.bob || 0;
  const cx = 10, FEET = 27;
  // stubby legs
  const rl = o.legR || 0, ll = o.legL || 0;
  l(cx - 3 + ll, 22 + bob, 2, FEET - 24, "#8a1a00");
  l(cx - 3 + ll, FEET - 2, 3, 2, "#5a1200");
  l(cx + 1 + rl, 22 + bob, 2, FEET - 24, "#8a1a00");
  l(cx + 1 + rl, FEET - 2, 3, 2, "#5a1200");
  // round bomb body (stacked rows)
  const by = 9 + bob;
  l(cx - 4, by + 1, 9, 12, P.body);
  l(cx - 5, by + 3, 11, 8, P.body);
  l(cx - 4, by + 1, 2, 12, P.bodyDk);
  l(cx + 2, by + 2, 2, 10, P.bodyHi);
  // worried face
  l(cx + 0, by + 4, 2, 2, "#fff"); l(cx + 3, by + 4, 2, 2, "#fff");
  l(cx + 1, by + 5, 1, 1, "#111"); l(cx + 4, by + 5, 1, 1, "#111");
  l(cx + 1, by + 8, 3, 1, "#5a1200");                    // grimace
  // fuse cord + spark (two states baked: sp=0 high dim, sp=1 low bright)
  l(cx - 1, by - 2, 2, 3, P.cord);
  l(cx, by - 3, 2, 2, P.cord);
  if (o.sp) { l(cx + 1, by - 4, 2, 2, P.sparkHot); l(cx, by - 5, 1, 1, P.spark); }
  else { l(cx + 1, by - 5, 2, 2, P.spark); }
}

// ============================================================= SMELT
// Stocky bomb-lobber (heavy, waterMult 0.5). Art 28x40 logical, feet 38.
function smelt(g, o, elite) {
  const l = L(g);
  const P = {
    body:   elite ? "#6e4030" : "#5a3020",
    bodyHi: elite ? "#8a5540" : "#75452f",
    bodyDk: "#3a1a08",
    apron: "#8a6a50", apronDk: "#6a4e38",
    glow: "#ff8030", glowHot: "#ffd040",
  };
  const bob = o.bob || 0;
  const cx = 13, FEET = 38;
  const hipY = 28 + bob;
  const rl = o.legR || 0, ll = o.legL || 0;
  l(cx - 6 + ll, hipY, 5, FEET - hipY - 2, P.bodyDk);    // tree-trunk legs
  l(cx - 6 + ll, FEET - 2, 6, 2, "#241206");
  l(cx + 1 + rl, hipY, 5, FEET - hipY - 2, P.body);
  l(cx + 1 + rl, FEET - 2, 6, 2, "#241206");
  // barrel torso + forge apron
  const ty = 12 + bob;
  l(cx - 9, ty, 18, 16, P.body);
  l(cx - 9, ty, 3, 16, P.bodyDk);
  l(cx + 6, ty, 3, 15, P.bodyHi);
  l(cx - 4, ty + 3, 10, 13, P.apron);                    // apron panel
  l(cx - 4, ty + 3, 10, 1, P.apronDk);
  l(cx - 4, ty + 9, 10, 1, P.apronDk);                   // apron seam
  l(cx - 8, ty + 1, 1, 1, P.glow); l(cx + 7, ty + 2, 1, 1, P.glow);  // rivets
  if (o.wind) l(cx - 10, ty - 1, 20, 2, P.glowHot);      // glowing wind-up band
  // arms — wind hoists a glowing bomb overhead with both hands
  if (o.wind) {
    l(cx - 7, ty - 5, 3, 6, P.bodyDk);                   // both arms up
    l(cx + 4, ty - 5, 3, 6, P.bodyDk);
    l(cx - 2, ty - 9, 5, 5, P.glow);                     // the bomb
    l(cx - 1, ty - 8, 2, 2, P.glowHot);
  } else {
    l(cx - 11, ty + 2, 3, 9, P.bodyDk);                  // heavy arms
    l(cx - 11, ty + 11, 3, 3, SKIND);
    l(cx + 8, ty + 2, 3, 9, P.bodyDk);
    l(cx + 8, ty + 11, 3, 3, SKIN);
  }
  // head — squat, welding-visor band
  const hy = 4 + bob + (o.wind ? 1 : 0);
  l(cx - 3, hy + 2, 9, 7, SKIN);
  l(cx - 3, hy + 2, 1, 7, SKIND);
  l(cx - 3, hy + 8, 9, 1, SKIND);
  l(cx - 3, hy + 3, 9, 3, "#2a2015");                    // visor band
  l(cx + 2, hy + 4, 3, 1, o.wind ? P.glowHot : P.glow);  // visor slit glows
}

// ============================================================= BULWARK
// Shield trooper (bodyW 22). Art 30x39 logical, feet 37. Two sprite variants:
// carrying the shield (o.shield — big slab on the lead arm) vs. hands free
// (deployed/retrieving). Painter picks via opt.hasShield.
function bulwark(g, o, elite) {
  const l = L(g);
  const P = {
    body:   elite ? "#6e8296" : "#5a6b7a",
    bodyHi: elite ? "#8899ac" : "#77899a",
    bodyDk: "#33404c",
    strap: "#26303a",
    shield: "#cfe9ff", shieldDk: "#8fb4d8", shieldHi: "#f2fbff",
  };
  const bob = o.bob || 0;
  const cx = 13, FEET = 37;
  const hipY = 26 + bob;
  const rl = o.legR || 0, ll = o.legL || 0;
  l(cx - 5, hipY, 10, 2, P.strap);                       // hip plate
  l(cx - 5 + ll, hipY + 2, 4, FEET - hipY - 4, P.bodyDk);
  l(cx - 5 + ll, FEET - 2, 5, 2, "#1a222a");
  l(cx + 1 + rl, hipY + 2, 4, FEET - hipY - 4, P.body);
  l(cx + 1 + rl, FEET - 2, 5, 2, "#1a222a");
  // armored torso
  const ty = 12 + bob;
  l(cx - 8, ty, 16, 14, P.body);
  l(cx - 8, ty, 3, 14, P.bodyDk);
  l(cx + 5, ty, 3, 13, P.bodyHi);
  l(cx - 8, ty, 16, 2, P.bodyDk);                        // pauldron slab
  l(cx - 8, ty + 7, 16, 1, P.strap);                     // chest strap
  l(cx - 3, ty + 3, 2, 2, P.strap); l(cx + 2, ty + 3, 2, 2, P.strap); // bolts
  if (elite) { l(cx - 9, ty - 1, 3, 5, P.bodyDk); l(cx + 6, ty - 1, 3, 5, P.bodyDk); }
  // back arm always hangs
  l(cx - 9, ty + 3, 2, 8, P.bodyDk);
  l(cx - 9, ty + 11, 2, 2, SKIND);
  // lead arm: carries the shield slab, or hangs free
  if (o.shield) {
    l(cx + 6, ty + 3, 2, 5, P.bodyDk);                   // arm behind the slab
    l(cx + 8, ty - 4, 4, 22, P.shield);                  // the shield: tall slab
    l(cx + 8, ty - 4, 1, 22, P.shieldDk);
    l(cx + 11, ty - 3, 1, 20, P.shieldHi);
    l(cx + 9, ty + 2, 2, 2, P.shieldDk);                 // boss stud
    l(cx + 9, ty + 12, 2, 2, P.shieldDk);
  } else {
    l(cx + 6, ty + 3, 2, 8, P.bodyDk);
    l(cx + 6, ty + 11, 2, 2, SKIN);
  }
  // helmeted head
  const hy = 5 + bob;
  l(cx - 3, hy + 2, 8, 6, SKIN);
  l(cx - 3, hy + 2, 1, 6, SKIND);
  l(cx + 2, hy + 4, 2, 1, "#111");                       // eye
  l(cx - 4, hy, 9, 3, P.bodyDk);                         // helmet
  l(cx - 4, hy + 2, 9, 1, P.body);                       // helmet rim
}

// ============================================================= FURNACE
// Heavy golem whose body color ramps with hosed heat — baked at 4 heat
// steps (o.heat 0..1); the glowing eye stays a runtime overlay. Art 30x44
// logical, feet 41 (eye socket at ly 32..34 for the overlay to land on).
function lerpHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = (sh) => Math.round(((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * t);
  return "#" + [16, 8, 0].map((sh) => c(sh).toString(16).padStart(2, "0")).join("");
}
function furnace(g, o, elite) {
  const heat = o.heat || 0;
  const BODY0 = elite ? "#5a3a28" : "#4a3020", HOT = "#ff6820";
  const P = {
    body: lerpHex(BODY0, HOT, heat * 0.85),
    bodyHi: lerpHex(elite ? "#75503a" : "#63432e", HOT, heat * 0.85),
    // Same heat lerp as the torso body color — arms/legs are drawn from this
    // shade too, so they now glow with the torso instead of staying static.
    bodyDk: lerpHex("#2a1808", "#b83010", heat * 0.7),
    slat: lerpHex("#2a1808", "#ff8030", heat),
    slatHot: lerpHex("#3a2410", "#ffd040", heat),
    plate: "#3a2a1a",
  };
  const l = L(g);
  const bob = o.bob || 0;
  const cx = 14, FEET = 41;
  const hipY = 29 + bob;
  const rl = o.legR || 0, ll = o.legL || 0;
  l(cx - 7 + ll, hipY, 6, FEET - hipY - 2, P.bodyDk);    // pillar legs
  l(cx - 7 + ll, FEET - 2, 7, 2, "#180e04");
  l(cx + 1 + rl, hipY, 6, FEET - hipY - 2, P.body);
  l(cx + 1 + rl, FEET - 2, 7, 2, "#180e04");
  // massive torso
  const ty = 11 + bob;
  l(cx - 11, ty, 22, 18, P.body);
  l(cx - 11, ty, 3, 18, P.bodyDk);
  l(cx + 8, ty, 3, 17, P.bodyHi);
  l(cx - 11, ty, 22, 3, P.bodyDk);                       // shoulder slab
  // vent slat band — glows with heat
  l(cx - 9, ty + 11, 18, 4, P.slat);
  for (let i = 0; i < 4; i++) l(cx - 8 + i * 5, ty + 11, 2, 4, P.slatHot);
  l(cx - 6, ty + 4, 12, 2, P.plate);                     // chest plate seam
  // heavy arms
  l(cx - 13, ty + 2, 3, 11, P.bodyDk);
  l(cx - 13, ty + 13, 3, 3, P.plate);                    // slab fist
  l(cx + 10, ty + 2, 3, 11, P.bodyDk);
  l(cx + 10, ty + 13, 3, 3, P.plate);
  // squat head — eye socket left dark for the runtime glow overlay
  const hy = 2 + bob;
  l(cx - 5, hy + 2, 10, 7, P.body);
  l(cx - 5, hy + 2, 2, 7, P.bodyDk);
  l(cx - 5, hy + 8, 10, 1, P.bodyDk);
  l(cx - 5, hy + 2, 10, 2, P.plate);                     // brow slab
  l(cx + 0, hy + 5, 4, 3, "#1a0e04");                    // eye socket (overlay fills)
  if (elite) { l(cx - 2, hy - 1, 4, 3, P.plate); }       // chimney stub
}

// ---------------------------------------------------------------------------
const WALK = {
  walk0: { legR: 2, legL: -1, armR: -1, armL: 1 },
  walk1: { bob: 1 },
  walk2: { legR: -1, legL: 2, armR: 1, armL: -1 },
  walk3: { bob: 1 },
};
const ENEMIES = {
  charger: { draw: charger, grid: [52, 70], poses: {
    idle0: {}, idle1: { bob: 1 }, ...WALK,
    wind: { wind: 1, bob: 1 }, charge: { charge: 1, lean: 2, legR: 3, legL: -3 },
  } },
  pyro: { draw: pyro, grid: [48, 66], poses: {
    idle0: {}, idle1: { bob: 1 }, ...WALK, wind: { wind: 1 },
  } },
  stalker: { draw: stalker, grid: [40, 62], poses: {
    idle0: {}, idle1: { bob: 1 }, ...WALK,
    wind: { wind: 1, bob: 1 }, strike: { strike: 1, lean: 2 },
  } },
  fuse: { draw: fuse, grid: [40, 58], poses: {
    idle0: { sp: 0 }, idle1: { bob: 1, sp: 1 },
    walk0: { legR: 2, legL: -1, sp: 0 }, walk1: { bob: 1, sp: 1 },
    walk2: { legR: -1, legL: 2, sp: 0 }, walk3: { bob: 1, sp: 1 },
  } },
  smelt: { draw: smelt, grid: [56, 84], poses: {
    idle0: {}, idle1: { bob: 1 }, ...WALK, wind: { wind: 1 },
  } },
  bulwark: { draw: bulwark, grid: [60, 78], poses: {
    idle0: {}, idle1: { bob: 1 }, ...WALK,
  }, variants: [{ prefix: "", o: {} }, { prefix: "sh_", o: { shield: 1 } }] },
  furnace: { draw: furnace, grid: [60, 88], poses: {
    idle0: {}, idle1: { bob: 1 }, ...WALK,
  }, variants: [0, 1, 2, 3].map((s) => ({ prefix: "h" + s + "_", o: { heat: s / 3 } })) },
};

const only = process.argv.slice(2);   // e.g. `node tools/enemy-sprites.mjs furnace`
const VALID = Object.keys(ENEMIES);
if (!only.length) {
  console.log(`Usage: node tools/enemy-sprites.mjs <type...>  (types: ${VALID.join(", ")})`);
  process.exit(1);
}
const unknown = only.filter((n) => !VALID.includes(n));
if (unknown.length) {
  console.log(`Unknown type(s): ${unknown.join(", ")}  (valid: ${VALID.join(", ")})`);
  process.exit(1);
}
for (const [name, def] of Object.entries(ENEMIES)) {
  if (!only.includes(name)) continue;
  console.log(`Baking ${name}:`);
  const variants = def.variants || [{ prefix: "", o: {} }];
  for (const elite of [false, true]) {
    for (const v of variants) {
      for (const [pose, o] of Object.entries(def.poses)) {
        const g = makeGrid(def.grid[0], def.grid[1]);
        def.draw(g, Object.assign({}, o, v.o), elite);
        outline(g);
        save(g, name, (elite ? "elite_" : "") + v.prefix + pose + ".png");
      }
    }
  }
}
