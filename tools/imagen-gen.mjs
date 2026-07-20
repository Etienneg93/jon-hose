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
 * Output PNGs land in generated-art/<char>/gen/ (gitignored — local only).
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

  slayer: {
    refImage: "",
    refDescription: "",
    base: `Pixel art game sprite of "The Slayer": a lean menacing brawler in dark leather.
Dark leather jacket #3a2010 with straps, flame-tipped collar and shoulders (ember accents #ff6010).
Holds a glowing white cue-ball. About 58px tall, confident cocky stance.`,
    states: {
      idle: `Standing idle, weight on back foot, smirking, cue-ball loose in hand. Facing right.`,
      walk: `4-frame walk cycle as a horizontal sprite sheet, all frames in one image, evenly spaced, no gaps between frames.
Frame 1 (leftmost): contact — lead foot strikes ground, opposite arm forward.
Frame 2: down — body at lowest point. Frame 3: passing — feet level, rising.
Frame 4: up — opposite foot leads, body highest. All same height. Facing right.`,
      throw_wind: `Wind-up throw pose: flaming cue-ball drawn back behind the shoulder, body coiled, opposite arm forward for balance. Facing right.`,
      throw_release: `Throw release: throwing arm fully extended forward at chest height, the flaming cue-ball leaving the hand, body leaning into the throw. Facing right.`,
      hurt: `Hit-recoil pose: body leaning back, head tilted back, arm raised defensively. Facing right.`,
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

  // ===================== STREET / FIRE-WORLD ENEMIES =====================
  // Small pixel-art grunt characters. Match the palette + silhouette of the
  // procedural painters in js/assets.js. Bake ONLY the flat solid character:
  // NO glow, halo, aura, particles, sparks, fire bloom, heat shimmer, or
  // emitted light — those runtime effects are layered on in code and are much
  // easier to add than to scrub out of a baked sprite. Full-body, feet visible,
  // single idle pose facing RIGHT, front-3/4 view, chunky readable proportions
  // (these render tiny — ~24–36 logical px tall).
  mook: {
    refImage: "", refDescription: "",
    base: `Pixel art game sprite of a "Mook": a basic short stocky street-thug enemy.
Muted brick-red shirt/hoodie torso #a04848 with darker #6e2f2f trim and dark trousers.
Tan skin face #f1c08a, dark knit beanie, small dark eyes, scrappy and low-rent. Short chunky build.`,
    states: { idle: `Standing idle, arms loose at sides, slight menacing hunch. Full body, feet visible. Facing right.` },
  },

  plunger: {
    refImage: "tmp/plunger-ref.png",
    refDescription: `The reference image shows the "Plunger Fiend": a small goblin-like imp whose
head IS a dark rust-red rubber plunger cup, worn like a dome helmet with the brim shading its face;
a tan wooden handle sticks up from the dome at a slight backward angle. Under the brim: two glowing
yellow eyes and a sly grin. Rust-red rubbery body, darker red shading, small gold/amber claws on
hands and bare feet. Hunched, sneaky posture. Replicate this exact character faithfully.`,
    base: `Pixel art game sprite of the "Plunger Fiend": a goblin imp with a dark rust-red rubber
plunger cup for a head (tan wooden handle sticking up-backward from the dome), glowing yellow eyes
under the cup brim, sly grin, rust-red rubbery body, gold claws on hands and bare feet.`,
    states: {
      walksheet: `6-frame walk cycle as a horizontal sprite sheet: exactly 6 full-body copies of the
SAME character side by side in one image, evenly spaced, equal-width columns, no gaps, no borders,
no labels. All frames the same height with feet on one shared ground line. Walking toward the LEFT,
sneaky hunched creep. Frame 1: contact — left foot planted forward, right arm swung forward.
Frame 2: down — body at its lowest, weight settling on the front foot. Frame 3: passing — feet
together under the body, body rising. Frame 4: opposite contact — right foot planted forward,
left arm swung forward. Frame 5: down — lowest again on the other side. Frame 6: passing — feet
together, rising. The wooden handle tilts subtly with the body's bob; eyes stay locked ahead.`,
    },
  },

  charger: {
    refImage: "", refDescription: "",
    base: `Pixel art game sprite of a "Charger": a bull-rush brute enemy that hunches forward to ram.
Purple tunic/padded-armor torso #7a4fb0 with darker #523078 trim, dark trousers.
Tan skin face #f1c08a, angry white eyes, broad forward shoulders, heavier than a basic thug.`,
    states: { idle: `Aggressive forward-leaning stance, shoulders lowered ready to charge, fists down. Full body, feet visible. Facing right.` },
  },

  pyro: {
    refImage: "", refDescription: "",
    base: `Pixel art game sprite of a "Pyro": a lean arsonist enemy that lobs fire.
Orange jacket torso #ff8a3c with darker #c1531a trim, dark trousers, tan skin face #f1c08a.
A small STYLIZED static flame-tuft as its hair/crown, painted in flat yellow #ffd23f and orange #ff8a3c shapes (a design element, NOT a glow — no particles, no light bloom).`,
    states: { idle: `Standing idle, one throwing arm slightly raised, wiry and twitchy. Full body, feet visible. Facing right.` },
  },

  bulwark: {
    refImage: "", refDescription: "",
    base: `Pixel art game sprite of a "Bulwark": a heavy armored shield-tank enemy shown WITHOUT any shield (the shield is a separate deployable prop, so hands are empty).
Steel blue-grey plated armor torso #5a6b7a with dark #33404c trim, tan skin face #f1c08a, single visible eye.
Big, broad, sturdy tank build — the tallest and widest of the grunts.`,
    states: { idle: `Standing guard, feet planted wide, empty hands at sides, immovable. Full body, feet visible. Facing right.` },
  },

  stalker: {
    refImage: "", refDescription: "",
    base: `Pixel art game sprite of a "Stalker": a lithe teleporting assassin enemy.
Dark magenta-pink cloak/bodysuit torso #8a2f5a with darker #591b3a trim, tan skin face #f1c08a, a single glinting white eye.
Slender, sleek, sinister, slightly crouched.`,
    states: { idle: `Low predatory idle crouch, arms ready, coiled to blink-strike. Full body, feet visible. Facing right.` },
  },

  smelt: {
    refImage: "", refDescription: "",
    base: `Pixel art game sprite of a "Smelt": a heavy slow fire-forge worker enemy.
Dark brown leather-and-iron apron torso #5a3020 with darker #3a1a08 trim, tan skin face #f1c08a.
Big burly blacksmith build, thick heavy arms. Flat solid colors — NO glowing bands, NO embers, NO fire.`,
    states: { idle: `Heavy hunched idle, thick arms hanging, slow and lumbering. Full body, feet visible. Facing right.` },
  },

  fuse: {
    refImage: "", refDescription: "",
    base: `Pixel art game sprite of a "Fuse": a small fast twitchy walking-bomb enemy.
Bright red-orange rounded body #ff4810 with darker #cc2800 trim, tiny arms and legs, tan skin face #f1c08a, wide nervous eyes.
A short unlit fuse-wick sticking up from its head (flat, no spark, no glow, no fire). Smallest of the enemies.`,
    states: { idle: `Jittery idle, small arms up, about to scurry. Full body, feet visible. Facing right.` },
  },

  furnace: {
    refImage: "", refDescription: "",
    base: `Pixel art game sprite of a "Furnace": a bulky boiler-golem enemy in its COLD, DORMANT state.
Blocky iron-golem body dark iron-brown #4a3020 with darker #2a1808 trim, a row of horizontal vent-slats across its chest (dark, closed, unlit), tan skin face #f1c08a.
Heavy blocky build — the biggest grunt. Flat, dark, dormant — NO glowing eyes, NO hot vents, NO fire, NO heat glow (all added in code).`,
    states: { idle: `Standing dormant idle, heavy and blocky, arms at sides. Full body, feet visible. Facing right.` },
  },

  // Street shop stall — static props composed around the shopkeeper sprite
  // (character drawn separately; his arm rests on the counter's top-right
  // corner, so that corner must stay clear).
  shop: {
    refImage: "",
    refDescription: "",
    base: `2D pixel-art game prop for a night-time street market stall. Single solid object, flat even lighting, no baked drop shadows, no ground, no background scenery.
NO glow, NO light rays, NO particles — just the plain solid object.
Must read clearly at very small display sizes (the game canvas is 480×270, nearest-neighbour upscaled).
Single object centered with clear empty margin for easy cutout.`,
    states: {
      counter: `A chunky wooden sales counter for a street shop stall, front view.
Dark brown wood #5a3b22 with lighter #7a5230 trim planks.
On its front face: a dark plaque panel with engraved gold #ffd23f capital letters "THE SHOPKEEPER", and below it a second narrower plank with painted gold text "BUSINESS IS DIVINE".
On the countertop, toward the LEFT side: a small grey cash-register terminal with a glowing screen (yellow + pale cyan rectangles), and directly above the register a short red-and-white striped awning strip #c83030 / #ffffff.
The RIGHT third of the countertop is EMPTY flat wood — a character's arm will rest on the top-right corner.
Counter slightly wider than tall.`,

      chalkboard: `A standing street chalkboard menu sign mounted on a short dark wooden post.
Dark wood frame #5a3b22, near-black slate board #101418.
Chalk hand-writing on the board: top line in white "TODAY'S SPECIAL:", middle lines in pale green #6cff9a "DISCOUNTED HOLY HOSE FUEL", lower lines in pale cyan #6cd3ff "50% OFF FOR CHURCH MEMBERS", and a small pale cyan Christian cross symbol at the bottom center of the board.
Board roughly square, sitting on the post; whole object taller than wide.`,

      fuelcan: `A squat metal aerosol canister of hose fuel standing upright.
Dark green body #1f6f3f with a darker green label band, pale stencil text "HOSE FUEL" in two stacked lines on the label, dark grey cap and small nozzle on top.
Simple cylinder, taller than wide.`,

      norefunds: `A small hand-made cardboard sign standing upright.
Brown cardboard #b08a5a with darker worn edges, hand-painted near-black text in two stacked lines: "NO REFUNDS." and "JUST HOSE.", with a small black Christian cross painted below the text.
Roughly square, slightly taller than wide.`,
    },
  },

  // Church of the Holy Hose — static prop assets.
  // IMPORTANT: bake only the flat solid object. NO emitted glow, halo, rim-
  // light, aura, light rays, sparkles, particles, water jets, shimmer, or
  // motion effects — those are added at runtime in code, and are far easier to
  // layer on than to scrub out of a baked sprite. "Lit"/element states differ
  // only by LOCAL material color (a brighter/tinted relic), not by emitted light.
  church: {
    refImage: "",
    refDescription: "",
    base: `2D pixel-art game prop for a gothic cathedral scene. Single solid object, flat even lighting, no baked drop shadows.
NO glow, NO halo, NO rim-light, NO aura, NO light rays, NO sparkles/particles, NO shimmer, NO emitted light of any kind — just the plain solid object as if unlit.
Must read clearly at very small display sizes (the game canvas is 480×270, nearest-neighbour upscaled).
Single object centered with clear empty margin for easy cutout.`,
    states: {
      altar: `A small sacred stone altar of the Church of the Holy Hose: a carved dark-stone pedestal crowned with a brass fire-hydrant relic, a coiled fire-hose draped over it like holy vestment cloth.
Dark stone #11141f, brass-gold accents #ffd23f, cyan hose #6cd3ff. Flat solid colors only — NO glow, aura, or rising light.
Crisp hard-edged pixels, no anti-aliasing, no gradients, limited palette, no text, no drop shadow, must read clearly at very low resolution.`,

      shrine_dim: `A tall narrow gothic stone shrine niche of the Church of the Holy Hose, UNLIT and dormant.
A slender arched stone alcove housing a small coiled fire-hose relic inside, cold and dark.
Cold grey-blue stone #1c2233, dark grey coiled hose relic. Flat solid colors only — NO glow, NO light.
Tall vertical proportions, roughly twice as tall as wide.
Crisp hard-edged pixels, no anti-aliasing, no gradients, limited palette, no text, no drop shadow, must read clearly at very low resolution.`,

      shrine_lit: `A tall narrow gothic stone shrine niche of the Church of the Holy Hose, in its ACTIVATED state — shown ONLY by the relic's material color, not by any emitted light.
The SAME slender arched stone alcove as the dim version, but the coiled fire-hose relic inside is painted in bright solid cyan instead of dark grey.
Stone #1c2233, bright cyan relic #6cd3ff / #d6f6ff as flat fill. NO glow, NO halo, NO rim-light, NO rays — just the relic recolored bright cyan.
Tall vertical proportions, roughly twice as tall as wide.
Crisp hard-edged pixels, no anti-aliasing, no gradients, limited palette, no text, no drop shadow, must read clearly at very low resolution.`,

      portal: `A tall upright doorway-shaped rift that returns to the street.
A simple vertical rounded-top slab of solid green energy with a clean hard pixel edge, flat fill, like a plain green portal surface. NO wisps, NO shimmer, NO glow, NO particles, NO luminous bloom.
Solid green fill #6cff9a with a slightly darker green edge band #1f6f3f. No stone frame. Tall vertical proportions, roughly twice as tall as wide.
Crisp hard-edged pixels, no anti-aliasing, no gradients, limited palette, no text, no drop shadow, must read clearly at very low resolution.`,

      station_dmg: `A small blessing-station of the Church of the Holy Hose for "Anointed Pressure" (increased spray damage).
A short dark-stone pedestal crowned with an upright brass fire-hose nozzle relic, pointing up. Plain and static.
Dark stone pedestal #11141f, brass-gold nozzle #ffd23f, a small red-orange band #ff5a2a as a painted accent on the nozzle. NO jet, NO spray, NO aura, NO glow, NO particles.
Crisp hard-edged pixels, no anti-aliasing, no gradients, limited palette, no text, no drop shadow, must read clearly at very low resolution.`,

      station_water: `A small blessing-station of the Church of the Holy Hose for "Deep Reservoir" (increased max water).
A short dark-stone pedestal crowned with a brass basin/font relic holding still cyan water. Same pedestal style as the other stations. Plain and static.
Dark stone pedestal #11141f, brass-gold rim #ffd23f, flat cyan water #6cd3ff filling the basin. NO overflow, NO glow, NO sparkle, NO particles.
Crisp hard-edged pixels, no anti-aliasing, no gradients, limited palette, no text, no drop shadow, must read clearly at very low resolution.`,

      station_hp: `A small blessing-station of the Church of the Holy Hose for "Blessed Vigor" (increased max health).
A short dark-stone pedestal crowned with a solid green holy cross-and-heart relic. Same pedestal style as the other stations. Plain and static.
Dark stone pedestal #11141f, gold trim #ffd23f, flat solid green heart/cross relic #6cff9a. NO glow, NO halo, NO rays, NO sparkle, NO particles.
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
  const aspectRatio = stateKey === "walk" ? "4:3" : stateKey === "walksheet" ? "16:9" : "1:1";

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

  // Output lands in the gitignored generated-art/ tree — local reference only.
  const outDir = path.join(ROOT, "generated-art", charKey, "gen");
  const prefix = `${charKey}_${stateKey}_${model.replace("-", "")}${useRef ? "_ref" : ""}`;
  await saveImages(images, outDir, prefix);

  console.log(`\nDone. Open sprites/${charKey}/gen/ to evaluate.`);
  console.log("Flags to try next: --ref (pass reference image), --state=walk, --count=4");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
