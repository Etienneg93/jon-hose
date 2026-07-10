/**
 * Builds a labeled contact sheet of every sprites/icons/bene_*.png at 2x, so
 * the whole benediction icon set can be eyeballed at once during iteration.
 * Not part of the game's asset pipeline — dev tool only, output goes to the
 * OS temp dir (never committed).
 *
 *   node tools/icon-contact-sheet.mjs
 */

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ICONS_DIR = path.join(ROOT, "sprites", "icons");

const files = fs.readdirSync(ICONS_DIR)
  .filter((f) => f.startsWith("bene_") && f.endsWith(".png"))
  .sort();

if (!files.length) {
  console.error("No sprites/icons/bene_*.png found — run tools/bene-icon-sprites.mjs first.");
  process.exit(1);
}

const COLS = 6;
const SCALE = 2;               // extra scale on top of the source (already 4x logical)
const CELL_ICON = 48 * SCALE;  // source PNGs are 48x48
const GUTTER = 3;
const LABEL_H = 10;            // room for a text label under each icon
const CELL_W = CELL_ICON + GUTTER;
const CELL_H = CELL_ICON + LABEL_H + GUTTER;
const rows = Math.ceil(files.length / COLS);

const sheet = new PNG({ width: COLS * CELL_W + GUTTER, height: rows * CELL_H + GUTTER });
// dark panel background so icon rims read the same as in-game.
for (let i = 0; i < sheet.width * sheet.height; i++) {
  sheet.data[i * 4] = 0x12; sheet.data[i * 4 + 1] = 0x16; sheet.data[i * 4 + 2] = 0x22; sheet.data[i * 4 + 3] = 255;
}

// Tiny 3x5 bitmap font, just enough for lowercase ids + underscores.
const FONT = {
  a: "010,101,111,101,101", b: "110,101,110,101,110", c: "011,100,100,100,011",
  d: "110,101,101,101,110", e: "111,100,110,100,111", f: "111,100,110,100,100",
  g: "011,100,101,101,011", h: "101,101,111,101,101", i: "111,010,010,010,111",
  j: "001,001,001,101,010", k: "101,101,110,101,101", l: "100,100,100,100,111",
  m: "101,111,111,101,101", n: "101,111,111,111,101", o: "010,101,101,101,010",
  p: "110,101,110,100,100", q: "010,101,101,111,011", r: "110,101,110,101,101",
  s: "011,100,010,001,110", t: "111,010,010,010,010", u: "101,101,101,101,011",
  v: "101,101,101,101,010", w: "101,101,111,111,101", x: "101,101,010,101,101",
  y: "101,101,010,010,010", z: "111,001,010,100,111", _: "000,000,000,000,111",
  "0": "010,101,101,101,010", "1": "010,110,010,010,111", "2": "110,001,010,100,111",
  "3": "110,001,010,001,110", "4": "101,101,111,001,001", "5": "111,100,110,001,110",
  "6": "011,100,110,101,010", "7": "111,001,010,010,010", "8": "010,101,010,101,010",
  "9": "010,101,011,001,010",
};
function drawChar(x0, y0, ch, color) {
  const rows5 = FONT[ch];
  if (!rows5) return;
  const rowsArr = rows5.split(",");
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) {
    if (rowsArr[y][x] !== "1") continue;
    const px = x0 + x, py = y0 + y;
    if (px < 0 || py < 0 || px >= sheet.width || py >= sheet.height) continue;
    const idx = (py * sheet.width + px) * 4;
    sheet.data[idx] = color[0]; sheet.data[idx + 1] = color[1]; sheet.data[idx + 2] = color[2]; sheet.data[idx + 3] = 255;
  }
}
function drawLabel(x0, y0, text, maxW) {
  const color = [0xdf, 0xe8, 0xf5];
  let x = x0;
  for (const ch of text) {
    if (x + 3 > x0 + maxW) break;
    drawChar(x, y0, ch, color);
    x += 4;
  }
}

files.forEach((file, i) => {
  const col = i % COLS, row = Math.floor(i / COLS);
  const ox = GUTTER + col * CELL_W, oy = GUTTER + row * CELL_H;
  const src = PNG.sync.read(fs.readFileSync(path.join(ICONS_DIR, file)));
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    const sIdx = (y * src.width + x) * 4;
    const a = src.data[sIdx + 3];
    if (!a) continue;
    for (let dj = 0; dj < SCALE; dj++) for (let di = 0; di < SCALE; di++) {
      const px = ox + x * SCALE + di, py = oy + y * SCALE + dj;
      if (px >= sheet.width || py >= sheet.height) continue;
      const dIdx = (py * sheet.width + px) * 4;
      sheet.data[dIdx] = src.data[sIdx]; sheet.data[dIdx + 1] = src.data[sIdx + 1];
      sheet.data[dIdx + 2] = src.data[sIdx + 2]; sheet.data[dIdx + 3] = 255;
    }
  }
  const id = file.replace(/^bene_/, "").replace(/\.png$/, "");
  drawLabel(ox, oy + CELL_ICON + 1, id, CELL_ICON);
});

const outPath = path.join(os.tmpdir(), "bene_sheet.png");
fs.writeFileSync(outPath, PNG.sync.write(sheet));
console.log(outPath);
