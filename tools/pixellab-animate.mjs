/**
 * PixelLab animation generator.
 *
 * Usage:
 *   node tools/pixellab-animate.mjs [options]
 *
 * Options:
 *   --input=sprites/assman/assman-reference.png   Source sprite (PNG only)
 *   --action="walk"                                Action description (default: "walk")
 *   --description="..."                            Character description (default: Ass Man)
 *   --frames=8                                     Frames to generate, 2–20 (default: 8)
 *   --size=64                                      Output px per side, default 64
 *   --out=sprites/assman/gen                       Output directory
 *   --confirm                                      Actually spend credits (dry-run without this)
 *
 * Requires PIXELLAB_API_KEY in .env.
 * Always prints balance + estimated cost before any spend.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.pixellab.ai/v1";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) { console.error("No .env found."); process.exit(1); }
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  if (!process.env.PIXELLAB_API_KEY) {
    console.error("PIXELLAB_API_KEY not set in .env"); process.exit(1);
  }
}

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const eq = a.indexOf("=");
    const k = a.replace(/^--/, "").slice(0, eq < 0 ? undefined : eq - 2);
    const v = eq < 0 ? true : a.slice(eq + 1);
    args[a.replace(/^--/, "").split("=")[0]] = v === true ? true : v;
  }
  return args;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function apiGet(path_) {
  const res = await fetch(`${API}${path_}`, {
    headers: { Authorization: `Bearer ${process.env.PIXELLAB_API_KEY}` },
  });
  if (!res.ok) throw new Error(`GET ${path_} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost(path_, body) {
  const res = await fetch(`${API}${path_}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PIXELLAB_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path_} → ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Image helpers (pngjs)
// ---------------------------------------------------------------------------

function loadPNG(filePath) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(new PNG())
      .on("parsed", function () { resolve(this); })
      .on("error", reject);
  });
}

function savePNG(png, filePath) {
  return new Promise((resolve, reject) => {
    const buf = PNG.sync.write(png);
    fs.writeFileSync(filePath, buf);
    resolve(filePath);
  });
}

/** Nearest-neighbour resize to exact target dimensions. */
function resizeTo(src, tw, th) {
  const dst = new PNG({ width: tw, height: th });
  dst.data = Buffer.alloc(tw * th * 4);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(src.width - 1, Math.round(x * (src.width - 1) / (tw - 1 || 1)));
      const sy = Math.min(src.height - 1, Math.round(y * (src.height - 1) / (th - 1 || 1)));
      const si = (sy * src.width + sx) * 4;
      const di = (y * tw + x) * 4;
      dst.data[di]     = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
  return dst;
}

/** Flood-fill background removal. Samples corner pixels for bg color, fills with alpha=0. */
function removeBackground(png, tolerance = 30) {
  const { width, height, data } = png;

  // Sample the four corner pixels to get bg color candidates
  function pixelAt(x, y) {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  }
  function colorDist(a, b) {
    return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
  }
  function setAlpha(x, y, a) {
    data[(y * width + x) * 4 + 3] = a;
  }

  const corners = [
    pixelAt(0, 0), pixelAt(width - 1, 0),
    pixelAt(0, height - 1), pixelAt(width - 1, height - 1),
  ];
  // Use first corner as primary bg color
  const bgColor = corners[0];

  const visited = new Uint8Array(width * height);
  const queue = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];

  while (queue.length > 0) {
    const [x, y] = queue.pop();
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    const idx = y * width + x;
    if (visited[idx]) continue;
    visited[idx] = 1;
    const c = pixelAt(x, y);
    if (c[3] < 10 || colorDist(c, bgColor) > tolerance) continue;
    setAlpha(x, y, 0);
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  return png;
}

/**
 * Palette quantization — collapses color-bleeding gradients into hard pixel art colors.
 *
 * Two-pass approach:
 *   1. Build a reduced palette by clustering similar colors (within `tolerance` distance)
 *   2. Remap every pixel to its nearest palette entry
 *
 * `maxColors` caps the palette size. `tolerance` controls how aggressively nearby
 * colors are merged — 20–35 is a good range for AI-generated pixel art cleanup.
 */
function quantizePalette(png, { maxColors = 32, tolerance = 28 } = {}) {
  const { width, height, data } = png;
  const out = new PNG({ width, height });
  out.data = Buffer.alloc(data.length);

  // Collect all opaque pixel colors
  const palette = []; // [{r,g,b, count}]

  function colorDist(r1, g1, b1, r2, g2, b2) {
    return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
  }

  function nearestPaletteIdx(r, g, b) {
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const d = colorDist(r, g, b, palette[i].r, palette[i].g, palette[i].b);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  // Pass 1: build palette by merging colors within tolerance
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue; // skip transparent
    const r = data[i], g = data[i + 1], b = data[i + 2];
    let merged = false;
    for (const entry of palette) {
      if (colorDist(r, g, b, entry.r, entry.g, entry.b) <= tolerance) {
        // Blend toward new color weighted by count
        entry.r = Math.round((entry.r * entry.count + r) / (entry.count + 1));
        entry.g = Math.round((entry.g * entry.count + g) / (entry.count + 1));
        entry.b = Math.round((entry.b * entry.count + b) / (entry.count + 1));
        entry.count++;
        merged = true;
        break;
      }
    }
    if (!merged) palette.push({ r, g, b, count: 1 });
  }

  // If still too many colors, merge the closest pairs until under maxColors
  while (palette.length > maxColors) {
    let minDist = Infinity, mi = 0, mj = 1;
    for (let i = 0; i < palette.length; i++) {
      for (let j = i + 1; j < palette.length; j++) {
        const d = colorDist(palette[i].r, palette[i].g, palette[i].b,
                            palette[j].r, palette[j].g, palette[j].b);
        if (d < minDist) { minDist = d; mi = i; mj = j; }
      }
    }
    const a = palette[mi], b_ = palette[mj];
    const total = a.count + b_.count;
    a.r = Math.round((a.r * a.count + b_.r * b_.count) / total);
    a.g = Math.round((a.g * a.count + b_.g * b_.count) / total);
    a.b = Math.round((a.b * a.count + b_.b * b_.count) / total);
    a.count = total;
    palette.splice(mj, 1);
  }

  // Pass 2: remap every pixel to nearest palette entry
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) {
      out.data[i + 3] = 0; // preserve transparency
      continue;
    }
    const idx = nearestPaletteIdx(data[i], data[i + 1], data[i + 2]);
    out.data[i]     = palette[idx].r;
    out.data[i + 1] = palette[idx].g;
    out.data[i + 2] = palette[idx].b;
    out.data[i + 3] = 255;
  }

  return { png: out, paletteSize: palette.length };
}

/** Encode PNG to base64 string. */
function pngToBase64(png) {
  return PNG.sync.write(png).toString("base64");
}

/** Decode base64 PNG from API response. */
function base64ToPNG(b64) {
  return PNG.sync.read(Buffer.from(b64, "base64"));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const DEFAULT_DESCRIPTION =
  `Pixel art superhero. Blue textured bodysuit, blue cape. Yellow gloves, yellow boots,
yellow briefs with belt. Chest reads "ASS MAN". Muscular build. Dark hair with gray,
matching stubble. Slight grin.`.trim();

async function main() {
  loadEnv();
  const args = parseArgs();

  const inputPath   = path.join(ROOT, args.input || "sprites/assman/ass-man.png");
  const action      = args.action      || "walk";
  const description = args.description || DEFAULT_DESCRIPTION;
  const nFrames     = Math.min(20, Math.max(2, parseInt(args.frames || "8", 10)));
  // PixelLab basic endpoint is hard-fixed at 64×64. Characters are scaled to fill
  // that canvas proportionally, then upscaled in-game via Assets.draw scale option.
  const targetW = 64;
  const targetH = 64;
  const maxColors   = parseInt(args.colors || "32", 10);
  const tolerance   = parseInt(args.tolerance || "28", 10);
  const outDir      = path.join(ROOT, args.out || "sprites/assman/gen");
  const dryRun      = !args.confirm;
  const skipQuantize = !!args["no-quantize"];

  // ── Balance check ──────────────────────────────────────────────────────
  const balance = await apiGet("/balance");
  console.log(`\nPixelLab balance: $${balance.usd.toFixed(4)} USD`);
  if (balance.usd === 0 && dryRun) {
    console.log("Balance is $0 — run with --confirm only after verifying free credits on the dashboard.");
  }

  // ── Load + process reference image ─────────────────────────────────────
  if (!fs.existsSync(inputPath)) {
    console.error(`\nInput file not found: ${path.relative(ROOT, inputPath)}`);
    console.error("Save your reference PNG there and retry.");
    process.exit(1);
  }

  console.log(`\nLoading: ${path.relative(ROOT, inputPath)}`);

  // JPG doesn't support transparency — convert via pngjs by writing then re-reading
  // If the source already has a transparent bg (exported from Aseprite), flood-fill is skipped
  let png;
  if (inputPath.endsWith(".jpg") || inputPath.endsWith(".jpeg")) {
    // pngjs can't read JPEG — encode workaround: treat the file as an opaque image
    // and remove the background by flood-fill (works well when bg is a solid color)
    console.log("  JPG source — will remove background by flood-fill");
    // Read raw JPEG bytes and create a PNG via Node canvas... pngjs can't decode JPEG.
    // Falling back: ask user to export as PNG from Aseprite for best results.
    console.error("\n  JPG files can't be decoded by pngjs (PNG-only library).");
    console.error("  Please export from Aseprite as PNG: File → Export As → assman-reference.png");
    console.error("  Then re-run with --input=sprites/assman/assman-reference.png\n");
    process.exit(1);
  }

  png = await loadPNG(inputPath);
  console.log(`  Size: ${png.width}×${png.height}px`);

  // Check if already transparent (exported from Aseprite with bg removed)
  const hasAlpha = Array.from({ length: Math.min(100, png.width * png.height) }, (_, i) => {
    const idx = i * 4;
    return png.data[idx + 3] < 128;
  }).some(Boolean);

  if (!hasAlpha) {
    console.log("  No transparency detected — removing background by flood-fill...");
    png = removeBackground(png);
  } else {
    console.log("  Transparency detected — skipping background removal (already clean).");
  }

  // Scale to fill 64px on the longest dimension, then pad to 64×64 (API is fixed square)
  const scale = 64 / Math.max(png.width, png.height);
  const scaledW = Math.round(png.width * scale);
  const scaledH = Math.round(png.height * scale);
  console.log(`  Scaling to ${scaledW}×${scaledH}px, padding to 64×64...`);
  const scaledPng = resizeTo(png, scaledW, scaledH);
  // Centre on 64×64 transparent canvas
  const padded = new PNG({ width: 64, height: 64 });
  padded.data = Buffer.alloc(64 * 64 * 4);
  const ox = Math.floor((64 - scaledW) / 2);
  const oy = Math.floor((64 - scaledH) / 2);
  for (let y = 0; y < scaledH; y++) {
    for (let x = 0; x < scaledW; x++) {
      const si = (y * scaledW + x) * 4;
      const di = ((y + oy) * 64 + (x + ox)) * 4;
      padded.data[di]     = scaledPng.data[si];
      padded.data[di + 1] = scaledPng.data[si + 1];
      padded.data[di + 2] = scaledPng.data[si + 2];
      padded.data[di + 3] = scaledPng.data[si + 3];
    }
  }
  png = padded;

  // Save processed reference for inspection before spending credits
  fs.mkdirSync(outDir, { recursive: true });
  const processedPath = path.join(outDir, "reference-processed.png");
  await savePNG(png, processedPath);
  console.log(`  Saved processed reference: ${path.relative(ROOT, processedPath)}`);

  const refBase64 = pngToBase64(png);

  // ── Dry-run summary ────────────────────────────────────────────────────
  console.log(`
── Animation request ──────────────────────────────
  Action:      ${action}
  Frames:      ${nFrames}
  Output size: 64×64px (API fixed; upscale in-game via scale option)
  Description: ${description.slice(0, 60)}...
───────────────────────────────────────────────────`);

  if (dryRun) {
    console.log("\nDRY RUN — no credits spent. Add --confirm to generate.\n");
    return;
  }

  // ── API call ───────────────────────────────────────────────────────────
  console.log("\nCalling PixelLab animate-with-text...");

  const body = {
    reference_image: { type: "base64", base64: refBase64 },
    description,
    action,
    image_size: { width: targetW, height: targetH },
    n_frames: nFrames,
    view: "side",
    direction: "east",
  };

  const result = await apiPost("/animate-with-text", body);

  console.log(`  Cost: $${result.usage?.usd ?? "?"} USD`);
  console.log(`  Frames received: ${result.images?.length ?? 0}`);

  if (!result.images?.length) {
    console.error("No frames returned:", JSON.stringify(result, null, 2));
    process.exit(1);
  }

  // ── Save frames ────────────────────────────────────────────────────────
  const label = action.replace(/\s+/g, "-");
  for (let i = 0; i < result.images.length; i++) {
    let framePng = base64ToPNG(result.images[i].base64 ?? result.images[i]);

    if (!skipQuantize) {
      const { png: qPng, paletteSize } = quantizePalette(framePng, { maxColors, tolerance });
      framePng = qPng;
      if (i === 0) console.log(`  Palette reduced to ${paletteSize} colors (tolerance=${tolerance})`);
    }

    const framePath = path.join(outDir, `${label}-${String(i).padStart(2, "0")}.png`);
    await savePNG(framePng, framePath);
    console.log(`  Saved: ${path.relative(ROOT, framePath)}`);
  }

  const newBalance = await apiGet("/balance");
  console.log(`\nDone. Remaining balance: $${newBalance.usd.toFixed(4)} USD`);
}

main().catch((e) => { console.error("\n" + e.message); process.exit(1); });
