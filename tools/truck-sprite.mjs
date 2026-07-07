/* =====================================================================
   truck-sprite.mjs — bake the fire-truck hero sprite from a Gemini frame
   (white bg + black outline) into a clean, transparent, wheel-animated
   sheet for the truck run. pngjs-only pixel work.
     node tools/truck-sprite.mjs            # bake sheet
     node tools/truck-sprite.mjs debug      # write _clean/_debug for tuning
   ===================================================================== */
import { PNG } from "pngjs";
import fs from "fs";

const DIR = "sprites/firetruck/";
const SRC = DIR + "jon-truck.png";
const MODE = process.argv[2] || "bake";

// Wheel centres + tire radius in SOURCE pixels (tuned against _debug.png).
const WHEELS = [
  { cx: 199, cy: 664, r: 86 },   // rear (left)
  { cx: 614, cy: 661, r: 86 },   // front (right)
];
const FRAMES = 5;                 // full revolution over 5 frames → always loops
const LOGICAL_H = 80;            // truck height in logical px
const TARGET_H = LOGICAL_H * 4;  // baked at 4x logical (crisp at high dpr, like mook)

const png = PNG.sync.read(fs.readFileSync(SRC));
const { width: W, height: H } = png;
const data = png.data;
const I = (x, y) => (y * W + x) * 4;

// ---- 1. border flood: near-white bg → transparent (protects interior) ----
const WT = 205;
const isBg = (x, y) => { const i = I(x, y); return data[i] > WT && data[i + 1] > WT && data[i + 2] > WT; };
{
  const seen = new Uint8Array(W * H);
  const q = [];
  for (let x = 0; x < W; x++) { q.push(x, 0, x, H - 1); }
  for (let y = 0; y < H; y++) { q.push(0, y, W - 1, y); }
  while (q.length) {
    const y = q.pop(), x = q.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const p = y * W + x; if (seen[p]) continue; seen[p] = 1;
    if (!isBg(x, y)) continue;
    data[I(x, y) + 3] = 0;
    q.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
}

// ---- 2. defringe: nibble the light (shadow-tinted) white halo on edges ----
for (let pass = 0; pass < 2; pass++) {
  const clear = [], fade = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = I(x, y); if (data[i + 3] === 0) continue;
    if (!(data[I(x + 1, y) + 3] === 0 || data[I(x - 1, y) + 3] === 0 ||
          data[I(x, y + 1) + 3] === 0 || data[I(x, y - 1) + 3] === 0)) continue;
    const mn = Math.min(data[i], data[i + 1], data[i + 2]);
    if (mn > 210) clear.push(i); else if (mn > 172) fade.push(i);
  }
  for (const i of clear) data[i + 3] = 0;
  for (const i of fade) data[i + 3] = Math.min(data[i + 3], 110);
}

// opaque bounding box
let minX = W, minY = H, maxX = 0, maxY = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
  if (data[I(x, y) + 3] > 20) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
console.log("opaque bbox:", { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 });

function writePNG(path, w, h, buf) {
  const p = new PNG({ width: w, height: h });
  buf.copy(p.data); fs.writeFileSync(path, PNG.sync.write(p));
  console.log("wrote", path, w + "x" + h);
}

if (MODE === "debug") {
  writePNG(DIR + "_clean.png", W, H, data);
  // overlay wheel circles on a copy
  const dbg = Buffer.from(data);
  for (const wl of WHEELS) for (let a = 0; a < 360; a += 2) {
    for (const rr of [wl.r, wl.r * 0.5]) {
      const x = Math.round(wl.cx + Math.cos(a * Math.PI / 180) * rr);
      const y = Math.round(wl.cy + Math.sin(a * Math.PI / 180) * rr);
      if (x >= 0 && y >= 0 && x < W && y < H) { const i = I(x, y); dbg[i] = 255; dbg[i + 1] = 0; dbg[i + 2] = 255; dbg[i + 3] = 255; }
    }
  }
  writePNG(DIR + "_debug.png", W, H, dbg);
  process.exit(0);
}
// ---- bake: crop to bbox, spin hubs across FRAMES, downscale, pack strip ----
const CW = maxX - minX + 1, CH = maxY - minY + 1;
const C = Buffer.alloc(CW * CH * 4);
for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
  const s = I(x + minX, y + minY), d = (y * CW + x) * 4;
  C[d] = data[s]; C[d + 1] = data[s + 1]; C[d + 2] = data[s + 2]; C[d + 3] = data[s + 3];
}
const cI = (x, y) => (y * CW + x) * 4;
const wheels = WHEELS.map((w) => ({ cx: w.cx - minX, cy: w.cy - minY, r: w.r }));

// Rotate only the inner hub disc (spokes/hub); the ~symmetric tire ring stays.
const frames = [];
for (let f = 0; f < FRAMES; f++) {
  const F = Buffer.from(C);
  const ang = (Math.PI * 2 / FRAMES) * f, ca = Math.cos(-ang), sa = Math.sin(-ang);
  for (const w of wheels) {
    const Ri = w.r * 0.60;
    const xa = Math.max(0, (w.cx - Ri) | 0), xb = Math.min(CW - 1, (w.cx + Ri) | 0);
    const ya = Math.max(0, (w.cy - Ri) | 0), yb = Math.min(CH - 1, (w.cy + Ri) | 0);
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const dx = x - w.cx, dy = y - w.cy;
      if (dx * dx + dy * dy > Ri * Ri) continue;
      const sx = Math.round(w.cx + ca * dx - sa * dy), sy = Math.round(w.cy + sa * dx + ca * dy);
      const d = (y * CW + x) * 4;
      if (sx < 0 || sy < 0 || sx >= CW || sy >= CH) { F[d + 3] = 0; continue; }
      const s = cI(sx, sy); F[d] = C[s]; F[d + 1] = C[s + 1]; F[d + 2] = C[s + 2]; F[d + 3] = C[s + 3];
    }
  }
  frames.push(F);
}

const scale = TARGET_H / CH, oW = Math.round(CW * scale), oH = TARGET_H;
const sheet = new PNG({ width: oW * FRAMES, height: oH });
for (let f = 0; f < FRAMES; f++) {
  const F = frames[f];
  for (let oy = 0; oy < oH; oy++) for (let ox = 0; ox < oW; ox++) {
    const sx = Math.min(CW - 1, (ox / scale) | 0), sy = Math.min(CH - 1, (oy / scale) | 0);
    const s = (sy * CW + sx) * 4, d = (oy * sheet.width + (f * oW + ox)) * 4;
    sheet.data[d] = F[s]; sheet.data[d + 1] = F[s + 1]; sheet.data[d + 2] = F[s + 2]; sheet.data[d + 3] = F[s + 3];
  }
}
fs.writeFileSync(DIR + "drive.png", PNG.sync.write(sheet));
console.log(JSON.stringify({
  bakedFrame: [oW, oH], logicalFrame: [Math.round(oW / 4), LOGICAL_H], frames: FRAMES,
}, null, 2));
