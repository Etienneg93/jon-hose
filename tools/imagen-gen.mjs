/**
 * Sprite generation harness — Imagen 4 (text-only) or Gemini Flash Image (with reference).
 *
 * Usage:
 *   node tools/imagen-gen.mjs [options]
 *
 * Options:
 *   --char=assman       Character key (default: assman)
 *   --state=idle        Animation state (default: idle)
 *   --count=2           Images to generate, 1–4 (default: 2)
 *   --ref               Pass the character's reference JPG to the model (Gemini mode)
 *   --model=gemini      Force Gemini Flash Image model (default: auto — gemini when --ref, imagen otherwise)
 *   --model=imagen      Force Imagen 4 (text-only, ignores --ref)
 *
 * Examples:
 *   node tools/imagen-gen.mjs --char=assman --state=idle --ref --count=2
 *   node tools/imagen-gen.mjs --char=assman --state=walk --ref --count=1
 *
 * Requires GOOGLE_API_KEY in .env (project root).
 * Output PNGs land in sprites/<char>/gen/.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Env + args
// ---------------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) {
    console.error("No .env file found. Create .env with:\n  GOOGLE_API_KEY=your_key_here");
    process.exit(1);
  }
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const [k, v] = a.replace(/^--/, "").split("=");
    args[k] = v ?? true;
  }
  return args;
}

// ---------------------------------------------------------------------------
// Character / state prompt library
// ---------------------------------------------------------------------------

const PIXEL_ART_RULES = `
Low-res pixel art, hard edges, no anti-aliasing, no gradients.
Thick 2-pixel black outline around entire subject, hard pixel edges, no anti-aliasing, no soft shadows, flat lighting, clean separation from background.
Only transparent-looking foreground — no drop shadows, no glow effects baked into the bg.
Solid magenta (#FF00FF) background, no gradients near edges, background color must not appear inside the subject.
Limited color palette (16–32 colors max).
`.trim();

const CHARACTER_PROMPTS = {
  assman: {
    refImage: "sprites/assman/ass-man.jpg",
    refDescription: `The reference image shows the character "Ass Man": a costumed superhero
in a dark navy-blue full-body suit with a prominent gold belt, gold gloves, and gold boots.
He wears a long flowing dark cape. His chest logo is clearly visible.
Replicate these exact costume colors and design faithfully.`,
    base: `Pixel art game sprite of a costumed superhero character called "Ass Man".
Dark navy-blue bodysuit. Gold belt, gold gloves, gold boots.
Long flowing dark cape. Chest logo visible. Confident powerful build.`,
    states: {
      idle: `Standing idle pose. Weight slightly on one foot. Cape hanging naturally at his back.
Arms relaxed at sides. Facing right.`,
      walk: `4-frame walk cycle as a horizontal sprite sheet, all frames in a single image.
Frame 1 (leftmost): contact — lead foot strikes ground, opposite arm forward.
Frame 2: down — body at lowest point, weight on front foot.
Frame 3: passing — feet level, body rising.
Frame 4: up — opposite foot leads, body at highest. Cape lags 1 frame behind body.
All 4 frames same height, evenly spaced horizontally, no gaps between frames.`,
      attack_wind: `Wind-up punch pose. Dominant fist drawn back behind shoulder.
Opposite arm extended forward for balance. Cape swept forward by momentum. Facing right.`,
      attack_hit: `Punch release pose. Fist fully extended forward at chest height.
Cape streams back behind him. Body leaning into the punch. Facing right.`,
      hurt: `Hit-recoil pose. Body leaning backward, head tilted back.
Arms raised defensively in front of face. Cape displaced upward. Facing right.`,
    },
  },

  jon: {
    refImage: "sprites/john-hose-idle.png",
    refDescription: `The reference shows Jon Hose: a fireman-type hero in a yellow fireman jacket,
dark pants, carrying a large water backpack tank on his back. He holds a hose nozzle.`,
    base: `Pixel art game sprite of Jon Hose, a fireman hero who fights with a water hose.
Yellow fireman jacket. Dark pants. Large water backpack tank on back. Hose nozzle in hand.`,
    states: {
      idle: `Standing idle. One hand on hip, hose hanging loosely at side. Facing right.`,
      spray: `Spraying pose. Leaning forward, hose extended and aimed right.
Water stream effect coming from nozzle tip. Facing right.`,
    },
  },

  // Church of the Holy Hose — static prop assets
  church: {
    refImage: "",
    refDescription: "",
    base: `2D pixel-art game prop for a gothic cathedral scene. Single object, flat lighting, no baked drop shadows.
Must read clearly at very small display sizes (the game canvas is 480×270, nearest-neighbour upscaled).
Single object centered with clear empty margin for easy cutout.`,
    states: {
      altar: `A small sacred stone altar of the Church of the Holy Hose: a carved dark-stone pedestal crowned with a brass fire-hydrant relic, a coiled fire-hose draped over it like holy vestment cloth, faint cyan holy-water glow rising from it.
Dark stone #11141f, brass-gold accents #ffd23f, cyan light #6cd3ff.
Crisp hard-edged pixels, no anti-aliasing, no gradients, limited palette, no text, no drop shadow, must read clearly at very low resolution.`,
    },
  },
};

// ---------------------------------------------------------------------------
// Imagen 4 (text-only)
// ---------------------------------------------------------------------------

async function generateImagen({ prompt, count, aspectRatio }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${process.env.GOOGLE_API_KEY}`;
  const body = {
    instances: [{ prompt }],
    parameters: { sampleCount: count, aspectRatio, outputMimeType: "image/png" },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Imagen API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (!json.predictions?.length) {
    console.error("Safety block or empty response:", JSON.stringify(json, null, 2));
    throw new Error("No images returned");
  }
  return json.predictions.map((p) => p.bytesBase64Encoded);
}

// ---------------------------------------------------------------------------
// Gemini Flash Image (multimodal — reference image as character guide)
// ---------------------------------------------------------------------------

async function generateGemini({ prompt, refImagePath, count }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${process.env.GOOGLE_API_KEY}`;

  const parts = [];

  if (refImagePath && fs.existsSync(refImagePath)) {
    const imgBytes = fs.readFileSync(refImagePath).toString("base64");
    const mimeType = refImagePath.endsWith(".jpg") || refImagePath.endsWith(".jpeg")
      ? "image/jpeg" : "image/png";
    parts.push({ inlineData: { mimeType, data: imgBytes } });
    // Explicitly separate "look at this" from "now draw something new"
    parts.push({
      text: `This is the CHARACTER REFERENCE IMAGE. Study the costume design, colors, and proportions carefully. Do NOT reproduce or copy this image. Instead, use it only to understand what the character looks like.\n\nNow create a BRAND NEW image:\n\n${prompt}`,
    });
    console.log(`  Using reference: ${path.relative(ROOT, refImagePath)}`);
  } else {
    parts.push({ text: prompt });
  }

  const results = [];
  for (let i = 0; i < count; i++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      }),
    });
    if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const imagePart = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.mimeType?.startsWith("image/"));
    if (!imagePart) {
      console.error("No image in response:", JSON.stringify(json, null, 2));
      throw new Error("Gemini returned no image");
    }
    results.push(imagePart.inlineData.data);
    process.stdout.write(`  Generated ${i + 1}/${count}\r`);
  }
  console.log();
  return results;
}

// ---------------------------------------------------------------------------
// Imagen 4 with SUBJECT reference (character consistency across new poses)
// ---------------------------------------------------------------------------

async function generateImagenWithSubject({ prompt, refImagePath, subjectDescription, count, aspectRatio }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${process.env.GOOGLE_API_KEY}`;

  const instance = { prompt };

  if (refImagePath && fs.existsSync(refImagePath)) {
    const imgBytes = fs.readFileSync(refImagePath).toString("base64");
    const mimeType = refImagePath.endsWith(".jpg") || refImagePath.endsWith(".jpeg")
      ? "image/jpeg" : "image/png";
    instance.referenceImages = [{
      referenceType: "REFERENCE_TYPE_SUBJECT",
      referenceId: 1,
      referenceImage: { bytesBase64Encoded: imgBytes, mimeType },
      subjectImageConfig: { subjectDescription },
    }];
    console.log(`  Imagen SUBJECT ref: ${path.relative(ROOT, refImagePath)}`);
  }

  const body = {
    instances: [instance],
    parameters: { sampleCount: count, aspectRatio, outputMimeType: "image/png" },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Imagen API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (!json.predictions?.length) {
    console.error("Safety block or empty response:", JSON.stringify(json, null, 2));
    throw new Error("No images returned");
  }
  return json.predictions.map((p) => p.bytesBase64Encoded);
}

// ---------------------------------------------------------------------------
// Save output
// ---------------------------------------------------------------------------

async function saveImages(base64Images, outDir, prefix) {
  fs.mkdirSync(outDir, { recursive: true });
  for (let i = 0; i < base64Images.length; i++) {
    const outPath = path.join(outDir, `${prefix}_${i + 1}.png`);
    fs.writeFileSync(outPath, Buffer.from(base64Images[i], "base64"));
    console.log(`  Saved: ${path.relative(ROOT, outPath)}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  loadEnv();
  const args = parseArgs();

  const charKey = args.char || "assman";
  const stateKey = args.state || "idle";
  const count = Math.min(4, parseInt(args.count || "2", 10));
  const useRef = !!args.ref;
  const forceModel = args.model; // "gemini" | "imagen" | undefined

  const charDef = CHARACTER_PROMPTS[charKey];
  if (!charDef) {
    console.error(`Unknown character: ${charKey}. Available: ${Object.keys(CHARACTER_PROMPTS).join(", ")}`);
    process.exit(1);
  }
  const stateDef = charDef.states[stateKey];
  if (!stateDef) {
    console.error(`Unknown state: ${stateKey}. Available: ${Object.keys(charDef.states).join(", ")}`);
    process.exit(1);
  }

  // model selection:
  //   --model=gemini         → Gemini Flash Image (multimodal reference)
  //   --model=imagen-subject → Imagen 4 with SUBJECT reference mode
  //   --model=imagen         → Imagen 4 text-only
  //   default with --ref     → try imagen-subject first (best for character consistency)
  //   default without --ref  → imagen text-only
  const model = forceModel || (useRef ? "imagen-subject" : "imagen");
  const aspectRatio = stateKey === "walk" ? "4:3" : "1:1";

  const prompt = [PIXEL_ART_RULES, charDef.base, stateDef].join("\n\n");

  console.log(`\nGenerating ${count}× ${charKey}/${stateKey} [${model}${useRef ? " +ref" : ""}]...`);

  let images;
  const refPath = useRef ? path.join(ROOT, charDef.refImage) : null;

  if (model === "gemini") {
    images = await generateGemini({ prompt, refImagePath: refPath, count });
  } else if (model === "imagen-subject") {
    images = await generateImagenWithSubject({
      prompt,
      refImagePath: refPath,
      subjectDescription: charDef.refDescription,
      count,
      aspectRatio,
    });
  } else {
    images = await generateImagen({ prompt, count, aspectRatio });
  }

  const outDir = path.join(ROOT, "sprites", charKey, "gen");
  const prefix = `${charKey}_${stateKey}_${model.replace("-", "")}${useRef ? "_ref" : ""}`;
  await saveImages(images, outDir, prefix);

  console.log(`\nDone. Open sprites/${charKey}/gen/ to evaluate.`);
  console.log("Flags to try next: --ref (pass reference image), --state=walk, --count=4");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
