/**
 * Standalone palette quantizer — cleans up AI color bleeding on any PNG.
 *
 * Uses median-cut quantization in Oklab (perceptual) space: it allocates the
 * limited palette where the image actually varies, so shading ramps (the
 * shadow→highlight steps that carry pixel-art detail) survive while the
 * near-duplicate anti-alias noise collapses. Distances are perceptual, so a
 * light/dark step is weighted like the eye sees it rather than as raw RGB.
 *
 * Usage:
 *   node tools/quantize.mjs --input=sprites/assman/gen/walk-00.png
 *   node tools/quantize.mjs --input=sprites/assman/gen/walk-00.png --colors=24
 *   node tools/quantize.mjs --input=... --colors=16 --bias=0.3
 *
 * Saves a *-quantized.png alongside the input file.
 * Use --colors=N to cap palette size (default 32). Lower = flatter, fewer
 * shades; higher = more detail retained. Typical pixel-art range: 16–48.
 *
 * Use --bias=N (0..1, default 0.5) to trade off area vs color coverage:
 *   1   = weight by pixel count — smooth ramps in big regions, but a dominant
 *         color (e.g. a blue costume) eats most of the palette.
 *   0.5 = balanced (default).
 *   0   = weight by color span only — spreads the palette across the whole
 *         gamut, so small distinct colors (white eyes, near-black hair) survive
 *         instead of being merged into the dominant color's ramp.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const eq = a.indexOf("=");
    const key = a.replace(/^--/, "").split("=")[0];
    args[key] = eq < 0 ? true : a.slice(eq + 1);
  }
  return args;
}

// ---------------------------------------------------------------------------
// sRGB <-> Oklab (https://bottosson.github.io/posts/oklab/)
// ---------------------------------------------------------------------------

function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c) {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

function rgbToOklab(r, g, b) {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_, // L
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_, // a
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_, // b
  ];
}

function oklabToRgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}

// ---------------------------------------------------------------------------
// Median-cut quantization (in Oklab)
// ---------------------------------------------------------------------------

// Build palette from a list of { lab, count } histogram entries.
// `bias` (0..1) is the exponent applied to pixel counts: each entry's weight is
// count**bias. At 1 the result is classic population-weighted median-cut; at 0
// every distinct color counts equally, so the palette covers the full gamut and
// rare-but-important colors survive instead of merging into the dominant ramp.
function medianCut(entries, maxColors, bias) {
  for (const e of entries) e.w = e.count ** bias;

  function makeBox(items) {
    let weight = 0;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const e of items) {
      weight += e.w;
      for (let c = 0; c < 3; c++) {
        if (e.lab[c] < min[c]) min[c] = e.lab[c];
        if (e.lab[c] > max[c]) max[c] = e.lab[c];
      }
    }
    const range = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    const axis = range[0] >= range[1] && range[0] >= range[2] ? 0 : range[1] >= range[2] ? 1 : 2;
    return { items, weight, axis, span: range[axis] };
  }

  function split(box) {
    const { items, axis, weight } = box;
    items.sort((p, q) => p.lab[axis] - q.lab[axis]);
    // Split at the weighted median so both halves carry ~equal weight.
    let acc = 0, cut = 1;
    for (let i = 0; i < items.length; i++) {
      acc += items[i].w;
      if (acc >= weight / 2) { cut = Math.max(1, Math.min(items.length - 1, i + 1)); break; }
    }
    return [makeBox(items.slice(0, cut)), makeBox(items.slice(cut))];
  }

  let boxes = [makeBox(entries)];
  while (boxes.length < maxColors) {
    // Split the box with the largest weight-scaled color span. With low bias the
    // weight term flattens out and selection follows color span — boxes holding
    // a wide light→dark range get split first, isolating whites and near-blacks.
    let idx = -1, best = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.items.length < 2 || b.span <= 0) continue;
      const score = b.span * b.weight;
      if (score > best) { best = score; idx = i; }
    }
    if (idx < 0) break;
    const [b1, b2] = split(boxes[idx]);
    boxes.splice(idx, 1, b1, b2);
  }

  // Average each box (weighted, in Oklab) to its representative color.
  return boxes.map((box) => {
    let L = 0, a = 0, b = 0, n = 0;
    for (const e of box.items) {
      L += e.lab[0] * e.w;
      a += e.lab[1] * e.w;
      b += e.lab[2] * e.w;
      n += e.w;
    }
    const [r, g, bb] = oklabToRgb(L / n, a / n, b / n);
    return { lab: [L / n, a / n, b / n], rgb: [r, g, bb] };
  });
}

function labDist(p, q) {
  return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
}

function quantizePalette(png, { maxColors = 32, bias = 0.5 } = {}) {
  const { width, height, data } = png;
  const out = new PNG({ width, height });
  out.data = Buffer.alloc(data.length);

  // Histogram of unique opaque colors → keeps median-cut fast on big sheets.
  const hist = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let e = hist.get(key);
    if (e) { e.count++; }
    else hist.set(key, { lab: rgbToOklab(data[i], data[i + 1], data[i + 2]), count: 1 });
  }

  const entries = [...hist.values()];
  const palette = entries.length <= maxColors
    ? entries.map((e) => ({ lab: e.lab, rgb: oklabToRgb(e.lab[0], e.lab[1], e.lab[2]) }))
    : medianCut(entries, maxColors, bias);

  // Remap every visible pixel to its nearest palette color, caching by RGB.
  // Original alpha is preserved so soft edges aren't hardened.
  const cache = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 10) { out.data[i + 3] = 0; continue; }
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    let rgb = cache.get(key);
    if (!rgb) {
      const lab = rgbToOklab(data[i], data[i + 1], data[i + 2]);
      let best = 0, bestD = Infinity;
      for (let p = 0; p < palette.length; p++) {
        const d = labDist(lab, palette[p].lab);
        if (d < bestD) { bestD = d; best = p; }
      }
      rgb = palette[best].rgb;
      cache.set(key, rgb);
    }
    out.data[i] = rgb[0];
    out.data[i + 1] = rgb[1];
    out.data[i + 2] = rgb[2];
    out.data[i + 3] = data[i + 3];
  }

  return { png: out, paletteSize: palette.length, uniqueIn: hist.size };
}

async function main() {
  const args = parseArgs();
  if (!args.input) {
    console.error("Usage: node tools/quantize.mjs --input=path/to/sprite.png [--colors=32] [--bias=0.5]");
    process.exit(1);
  }

  const inputPath = path.join(ROOT, args.input);
  const maxColors = parseInt(args.colors || "32", 10);
  const bias = Math.max(0, Math.min(1, parseFloat(args.bias ?? "0.5")));

  if (!fs.existsSync(inputPath)) {
    console.error(`File not found: ${args.input}`);
    process.exit(1);
  }
  if (args.tolerance) {
    console.warn("  (note: --tolerance is ignored; palette size is controlled by --colors)");
  }

  console.log(`\nQuantizing: ${args.input}`);
  console.log(`  Max colors: ${maxColors}, bias: ${bias}`);

  const png = await new Promise((resolve, reject) =>
    fs.createReadStream(inputPath).pipe(new PNG())
      .on("parsed", function () { resolve(this); })
      .on("error", reject)
  );
  console.log(`  Input size: ${png.width}×${png.height}px`);

  const { png: out, paletteSize, uniqueIn } = quantizePalette(png, { maxColors, bias });
  console.log(`  Palette: ${uniqueIn} unique colors → ${paletteSize}`);

  const ext = path.extname(inputPath);
  const outPath = inputPath.replace(ext, `-quantized${ext}`);
  fs.writeFileSync(outPath, PNG.sync.write(out));
  console.log(`  Saved: ${path.relative(ROOT, outPath)}\n`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
