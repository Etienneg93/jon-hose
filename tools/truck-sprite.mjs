/* =====================================================================
   truck-sprite.mjs — bake the fire-truck sprites into clean, transparent,
   wheel-animated sheets for the truck run. pngjs-only pixel work.
     node tools/truck-sprite.mjs            # bake drive.png + board.png
     node tools/truck-sprite.mjs debug      # write _clean/_debug for tuning
   Sources (pixel-aligned 798×778 layers):
     jon-truck.png — truck body, Jon in cab, hand-slotted wheels, transparent bg
     truck.png     — legacy empty-cab render (white bg, OLD wheels); only its
                     cab region is used, spliced into the jon-truck body
     wheels.png    — the two wheels alone (rear + front in one image); the
                     baker rotates THIS layer per frame and stamps it on
     truck-broken.png — crashed-truck wreck art (transparent bg, dark-matte
                     fringe from the source matte; cleaned by cleanDarkMatte)
   Outputs: drive.png (Jon in cab, escape run), board.png (empty cab,
   overworld drive-in). Same union bbox → identical frame size + scale.
   wreck.png (single frame, crashed-truck art) is baked at the SAME
   drive/board scale so it reads as the same-size truck.
   ===================================================================== */
import { PNG } from "pngjs";
import fs from "fs";

const DIR = "sprites/firetruck/";
const MODE = process.argv[2] || "bake";

// Wheel centres in SOURCE pixels = the wheels.png blob centres (front sits
// 3px lower than rear in the art). r covers the layer disc (radius ≈ 69.5).
const WHEELS = [
  { cx: 210, cy: 665, r: 72 },   // rear (left)
  { cx: 626, cy: 668, r: 72 },   // front (right)
];
const FRAMES = 5;
// 18°/frame, 90° per loop: exactly 2 rim-octagon periods (45°) and 6 tread
// periods (15°), so both features wrap seamlessly at frame FRAMES → 0, and
// 18° < half the octagon period → coherent forward spin, no wagon-wheeling.
const STEP = (Math.PI / 2) / FRAMES;
const LOGICAL_H = 80;            // truck height in logical px
const TARGET_H = LOGICAL_H * 4;  // baked at 4x logical (crisp at high dpr, like mook)

// Cannon barrel tip in SOURCE pixels (jon-truck.png) — the baker prints the
// matching CANNON_DX/DY for js/truck.js so the spray origin tracks rescales.
const CANNON_TIP = { x: 599, y: 291 };

function loadPNG(path) {
  const png = PNG.sync.read(fs.readFileSync(path));
  return { data: png.data, W: png.width, H: png.height };
}

// White-bg removal + defringe, for legacy opaque renders. Skipped when the
// image already carries transparency (hand-exported layers).
function cleanWhiteBg(img) {
  const { data, W, H } = img;
  const I = (x, y) => (y * W + x) * 4;
  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 20) { hasAlpha = true; break; }
  if (hasAlpha) return img;

  const WT = 205;
  const isBg = (x, y) => { const i = I(x, y); return data[i] > WT && data[i + 1] > WT && data[i + 2] > WT; };
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
  return img;
}

const jon = loadPNG(DIR + "jon-truck.png");           // transparent, new wheels
const legacy = cleanWhiteBg(loadPNG(DIR + "truck.png")); // white bg, old wheels
const layer = loadPNG(DIR + "wheels.png");            // wheel layer, transparent
const { W, H } = jon;
const I = (x, y) => (y * W + x) * 4;

// ---- empty-cab body: jon body + the cab region spliced from the legacy
// render. The cab = where the two (both opaque) disagree, excluding the wheel
// discs (legacy still has the old, larger wheels there).
const inWheel = (x, y) => WHEELS.some((w) => (x - w.cx) ** 2 + (y - w.cy) ** 2 < 110 * 110);
let cb = { minX: W, minY: H, maxX: 0, maxY: 0 };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = I(x, y);
  if (jon.data[i + 3] < 128 || legacy.data[i + 3] < 128 || inWheel(x, y)) continue;
  if (Math.abs(jon.data[i] - legacy.data[i]) + Math.abs(jon.data[i + 1] - legacy.data[i + 1]) +
      Math.abs(jon.data[i + 2] - legacy.data[i + 2]) < 24) continue;
  if (x < cb.minX) cb.minX = x; if (x > cb.maxX) cb.maxX = x;
  if (y < cb.minY) cb.minY = y; if (y > cb.maxY) cb.maxY = y;
}
console.log("cab splice rect:", cb);
const empty = { data: Buffer.from(jon.data), W, H };
for (let y = cb.minY - 2; y <= cb.maxY + 2; y++) for (let x = cb.minX - 2; x <= cb.maxX + 2; x++) {
  const i = I(x, y);
  for (let k = 0; k < 4; k++) empty.data[i + k] = legacy.data[i + k];
}

const BODIES = [
  { body: jon, out: DIR + "drive.png" },
  { body: empty, out: DIR + "board.png" },
];

function writePNG(path, w, h, buf) {
  const p = new PNG({ width: w, height: h });
  buf.copy(p.data); fs.writeFileSync(path, PNG.sync.write(p));
  console.log("wrote", path, w + "x" + h);
}

if (MODE === "debug") {
  writePNG(DIR + "_clean.png", W, H, jon.data);
  const dbg = Buffer.from(jon.data);
  for (const wl of WHEELS) for (let a = 0; a < 360; a += 2) {
    for (const rr of [wl.r, wl.r * 0.5]) {
      const x = Math.round(wl.cx + Math.cos(a * Math.PI / 180) * rr);
      const y = Math.round(wl.cy + Math.sin(a * Math.PI / 180) * rr);
      if (x >= 0 && y >= 0 && x < W && y < H) { const i = I(x, y); dbg[i] = 255; dbg[i + 1] = 0; dbg[i + 2] = 255; dbg[i + 3] = 255; }
    }
  }
  writePNG(DIR + "_debug.png", W, H, dbg);
}

// ---- bake: shared union bbox → crop → rotate wheel layer per frame → scale
function bboxOf(img) {
  let minX = img.W, minY = img.H, maxX = 0, maxY = 0;
  for (let y = 0; y < img.H; y++) for (let x = 0; x < img.W; x++)
    if (img.data[(y * img.W + x) * 4 + 3] > 20) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  return { minX, minY, maxX, maxY };
}
const boxes = BODIES.map((b) => bboxOf(b.body));
const minX = Math.min(...boxes.map((b) => b.minX)), minY = Math.min(...boxes.map((b) => b.minY));
const maxX = Math.max(...boxes.map((b) => b.maxX)), maxY = Math.max(...boxes.map((b) => b.maxY));
const CW = maxX - minX + 1, CH = maxY - minY + 1;
console.log("union bbox:", { minX, minY, maxX, maxY, w: CW, h: CH });

const scale = TARGET_H / CH, oW = Math.round(CW * scale), oH = TARGET_H;
console.log("CANNON_DX/DY for js/truck.js:", {
  dx: Math.round((CANNON_TIP.x - minX) * scale / 4 - Math.round(oW / 4) / 2),
  dy: Math.round((CANNON_TIP.y - minY) * scale / 4 - LOGICAL_H),
});

if (MODE !== "debug") {
  for (const { body, out } of BODIES) {
    const C = Buffer.alloc(CW * CH * 4);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const s = ((y + minY) * W + (x + minX)) * 4, d = (y * CW + x) * 4;
      for (let k = 0; k < 4; k++) C[d + k] = body.data[s + k];
    }
    const frames = [];
    for (let f = 0; f < FRAMES; f++) {
      const F = Buffer.from(C);
      const ang = STEP * f, ca = Math.cos(-ang), sa = Math.sin(-ang); // +ang = clockwise = driving right
      for (const w of WHEELS) {
        const kx = w.cx - minX, ky = w.cy - minY;
        for (let y = ky - w.r; y <= ky + w.r; y++) for (let x = kx - w.r; x <= kx + w.r; x++) {
          if (x < 0 || y < 0 || x >= CW || y >= CH) continue;
          const dx = x - kx, dy = y - ky;
          if (dx * dx + dy * dy > w.r * w.r) continue;
          // inverse-rotate into the wheels.png layer (uncropped source coords)
          const sx = Math.round(w.cx + ca * dx - sa * dy), sy = Math.round(w.cy + sa * dx + ca * dy);
          if (sx < 0 || sy < 0 || sx >= layer.W || sy >= layer.H) continue;
          const s = (sy * layer.W + sx) * 4;
          if (layer.data[s + 3] < 20) continue;   // outside the wheel: keep body
          const d = (y * CW + x) * 4;
          for (let k = 0; k < 4; k++) F[d + k] = layer.data[s + k];
        }
      }
      frames.push(F);
    }

    const sheet = new PNG({ width: oW * FRAMES, height: oH });
    for (let f = 0; f < FRAMES; f++) {
      const F = frames[f];
      for (let oy = 0; oy < oH; oy++) for (let ox = 0; ox < oW; ox++) {
        const sx = Math.min(CW - 1, (ox / scale) | 0), sy = Math.min(CH - 1, (oy / scale) | 0);
        const s = (sy * CW + sx) * 4, d = (oy * sheet.width + (f * oW + ox)) * 4;
        for (let k = 0; k < 4; k++) sheet.data[d + k] = F[s + k];
      }
    }
    fs.writeFileSync(out, PNG.sync.write(sheet));
    console.log(out, JSON.stringify({
      bakedFrame: [oW, oH], logicalFrame: [Math.round(oW / 4), LOGICAL_H], frames: FRAMES,
    }));
  }
}

// ---- wreck: truck-broken.png → wreck.png (single frame, SAME scale as
// drive/board so the wreck reads as the same truck, not renormalized).
// The source came off a black matte: stray opaque near-black specks in
// empty space + a thin near-black crust ring on the silhouette edge.
function cleanDarkMatte(img) {
  const { data, W, H } = img;
  const I = (x, y) => (y * W + x) * 4;
  // (a) drop small connected opaque components (specks) — keeps the truck.
  const seen = new Uint8Array(W * H);
  for (let y0 = 0; y0 < H; y0++) for (let x0 = 0; x0 < W; x0++) {
    const p0 = y0 * W + x0;
    if (seen[p0] || data[p0 * 4 + 3] < 20) continue;
    const comp = []; const q = [x0, y0]; seen[p0] = 1;
    while (q.length) {
      const y = q.pop(), x = q.pop(); comp.push(x, y);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const np = ny * W + nx;
        if (seen[np] || data[np * 4 + 3] < 20) continue;
        seen[np] = 1; q.push(nx, ny);
      }
    }
    if (comp.length / 2 < 60)
      for (let i = 0; i < comp.length; i += 2) data[I(comp[i], comp[i + 1]) + 3] = 0;
  }
  // (b) two-pass crust defringe: clear near-black EDGE pixels that are thin
  // (≤2 opaque orthogonal neighbours). Protects the tire mass, eats the ring.
  for (let pass = 0; pass < 2; pass++) {
    const clear = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = I(x, y); if (data[i + 3] < 20) continue;
      const nbs = [I(x + 1, y), I(x - 1, y), I(x, y + 1), I(x, y - 1)];
      const opaqueN = nbs.filter((n) => data[n + 3] >= 20).length;
      if (opaqueN === 4) continue;                       // interior pixel
      const mx = Math.max(data[i], data[i + 1], data[i + 2]);
      if (mx < 26 && opaqueN <= 2) clear.push(i);
    }
    for (const i of clear) data[i + 3] = 0;
  }
}

const wreckSrc = loadPNG(DIR + "truck-broken.png");
cleanDarkMatte(wreckSrc);
if (MODE === "debug") writePNG(DIR + "_wreck_clean.png", wreckSrc.W, wreckSrc.H, wreckSrc.data);
// wreck.png bake is gated with the BODIES loop above: debug mode only wants
// the cleaned-source preview, not a baked output.
if (MODE !== "debug") {
  const wb = bboxOf(wreckSrc);
  const wW = wb.maxX - wb.minX + 1, wH = wb.maxY - wb.minY + 1;
  const woW = Math.round(wW * scale), woH = Math.round(wH * scale);
  const wreckSheet = new PNG({ width: woW, height: woH });
  for (let oy = 0; oy < woH; oy++) for (let ox = 0; ox < woW; ox++) {
    const sx = Math.min(wW - 1, (ox / scale) | 0) + wb.minX;
    const sy = Math.min(wH - 1, (oy / scale) | 0) + wb.minY;
    const s = (sy * wreckSrc.W + sx) * 4, d = (oy * woW + ox) * 4;
    for (let k = 0; k < 4; k++) wreckSheet.data[d + k] = wreckSrc.data[s + k];
  }
  fs.writeFileSync(DIR + "wreck.png", PNG.sync.write(wreckSheet));
  console.log(DIR + "wreck.png", JSON.stringify({
    bakedFrame: [woW, woH], logicalFrame: [Math.round(woW / 4), Math.round(woH / 4)],
  }));
}
