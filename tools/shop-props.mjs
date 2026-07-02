/**
 * Bakes the street-shop stall props (counter, chalkboard, fuel can, no-refunds
 * sign) into sprites/shopkeeper/*.png as deterministic pixel art.
 *
 * Props are baked BLANK: all signage copy is layered at runtime by the
 * "shopkeeper" painter in js/assets.js (crisper text, and the chalkboard
 * special is driven by JH.SHOP_SIGN so mechanics can rewrite it). Keep the
 * geometry here in sync with the text anchor offsets in that painter.
 * Re-run after editing layout:
 *
 *   node tools/shop-props.mjs
 *
 * Units: the master grid is 2 px per logical unit; output PNGs are saved at
 * 2× grid = 4× logical (per CLAUDE.md sizing rule).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "sprites", "shopkeeper");

// ---------------------------------------------------------------------------
// Grid canvas helpers
// ---------------------------------------------------------------------------

function makeGrid(w, h) {
  return { w, h, px: new Array(w * h).fill(null) };
}

function set(g, x, y, color) {
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return;
  g.px[y * g.w + x] = color;
}

function rect(g, x, y, w, h, color) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(g, i, j, color);
}

// Latin cross, 6 wide × 7 tall, centered on cx.
function cross(g, cx, y, color) {
  rect(g, cx - 1, y, 2, 7, color);
  rect(g, cx - 3, y + 2, 6, 2, color);
}

// 2-grid-px (1 logical px) black outline where transparent touches opaque.
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
  const SCALE = 2; // grid -> output (output = 4× logical)
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

// ---------------------------------------------------------------------------
// Palette (reference image + js/config.js JH.PAL hues)
// ---------------------------------------------------------------------------

const P = {
  wood: "#5a3b22", woodHi: "#7a5230", woodDk: "#3a2412",
  plaqueBg: "#2a1a0a", goldDk: "#caa015",
  red: "#c83030", white: "#f4f0e6",
  regBody: "#4a505c", regDk: "#2e333d", screenBg: "#14181f",
  cyan: "#6cd3ff", gold: "#ffd23f",
  slate: "#101418",
  canBody: "#1f6f3f", canDk: "#164f2c", canLabel: "#123d22",
  cap: "#3a3f4a", capDk: "#23272e",
  card: "#b08a5a", cardDk: "#8a6a40", ink: "#241a10",
};

// ---------------------------------------------------------------------------
// Props. All sized in grid units (2 = 1 logical px); 4-grid-px margin all
// round for the outline pass. Ground line = bottom edge minus margin.
// ---------------------------------------------------------------------------

// Counter: body 48×26 logical + register + awning strip. The top-right corner
// of the counter body stays clear — the shopkeeper's arm rests on it in-game.
// Plaques are blank; the painter layers "THE SHOPKEEPER" / "BUSINESS IS
// DIVINE" onto them.
function counter() {
  const g = makeGrid(112, 96); // 56×48 logical
  const M = 4, W = 104, GROUND = 92;
  const bodyTop = GROUND - 52; // body 26 logical tall
  // Body
  rect(g, M, bodyTop, W - 8, 52, P.wood);           // face (x 4..100)
  rect(g, M, bodyTop, W - 8, 6, P.woodHi);          // top lip
  rect(g, M, bodyTop + 6, W - 8, 2, P.woodDk);      // lip shadow
  rect(g, M, GROUND - 4, W - 8, 4, P.woodDk);       // base plank
  // Main plaque (blank)
  rect(g, 14, bodyTop + 10, 80, 18, P.goldDk);
  rect(g, 16, bodyTop + 12, 76, 14, P.plaqueBg);
  // Lower plank (blank)
  rect(g, 12, bodyTop + 32, 84, 12, P.woodDk);
  rect(g, 13, bodyTop + 33, 82, 10, P.plaqueBg);
  // Register on the LEFT of the countertop
  const regTop = bodyTop - 24;
  rect(g, 16, regTop, 34, 24, P.regBody);
  rect(g, 16, regTop + 20, 34, 4, P.regDk);          // base
  rect(g, 20, regTop + 4, 26, 12, P.screenBg);       // screen bezel
  rect(g, 22, regTop + 6, 9, 8, P.gold);             // yellow pane
  rect(g, 33, regTop + 6, 11, 8, P.cyan);            // cyan pane
  // Awning strip above the register
  rect(g, 8, regTop - 14, 52, 10, P.red);
  rect(g, 8, regTop - 4, 52, 4, P.white);
  outline(g);
  save(g, "counter.png");
}

// Chalkboard menu on a post. Board is blank slate — the painter layers the
// JH.SHOP_SIGN copy (and its chalk cross) at runtime.
function chalkboard() {
  const g = makeGrid(80, 104); // 40×52 logical
  const M = 4, GROUND = 100;
  // Post + foot
  rect(g, 36, GROUND - 34, 8, 34, P.woodDk);
  rect(g, 28, GROUND - 4, 24, 4, P.woodDk);
  // Board frame + slate (board 36×32 logical)
  rect(g, M, M, 72, 64, P.wood);
  rect(g, M, M, 72, 3, P.woodHi);
  rect(g, 8, 8, 64, 56, P.slate);
  outline(g);
  save(g, "chalkboard.png");
}

// Hose-fuel canister. Label band is blank; painter layers "HOSE FUEL".
function fuelcan() {
  const g = makeGrid(32, 48); // 16×24 logical
  const M = 4, GROUND = 44;
  rect(g, M, 12, 24, GROUND - 12, P.canBody);
  rect(g, M, GROUND - 4, 24, 4, P.canDk);
  rect(g, M, 12, 24, 2, P.canDk);                    // shoulder
  rect(g, M, 20, 24, 14, P.canLabel);                // label band
  rect(g, 10, 6, 12, 6, P.cap);
  rect(g, 14, 4, 4, 2, P.capDk);                     // nozzle
  outline(g);
  save(g, "fuelcan.png");
}

// Cardboard "NO REFUNDS. JUST HOSE." sign. Copy is layered by the painter;
// the cross stays baked (static sign, fixed layout).
function norefunds() {
  const g = makeGrid(44, 52); // 22×26 logical
  const M = 4, GROUND = 48;
  rect(g, M, M, 36, GROUND - M, P.card);
  rect(g, M, M, 36, 2, P.cardDk);
  rect(g, M, GROUND - 2, 36, 2, P.cardDk);
  rect(g, M, M, 2, GROUND - M, P.cardDk);
  rect(g, 38, M, 2, GROUND - M, P.cardDk);
  cross(g, 22, 38, P.ink);
  outline(g);
  save(g, "norefunds.png");
}

console.log("Baking shop props:");
counter();
chalkboard();
fuelcan();
norefunds();
