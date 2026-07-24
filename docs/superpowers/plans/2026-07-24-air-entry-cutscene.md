# Air World Entry Cutscene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the banner-beat stub in `enterAirAct()` with an in-world staged cutscene — a hoodie-disguised Ass Man walks a border collie that desecrates the holy hydrant, Jon rages, the hoodie comes off, the feud is declared, and he flies off with the dog.

**Architecture:** A new `js/airentry.js` module owns a phase machine and its two scene actors, mirroring how `js/truck.js` owns the truck run. `game.js` gains a proximity trigger, an update hook placed beside the existing `this.arrival` gate, and an actor injection into the depth sort. The phase machine's timing core is pure and unit-tested in node; rendering rides existing `Assets.register` painters with procedural fallbacks.

**Tech Stack:** Vanilla JS `JH` IIFE modules, `node --test`, canvas 2D at 480×270 logical, `codex-image` skill (gpt-image-2) for sprite generation.

## Global Constraints

Copied verbatim from `docs/superpowers/specs/2026-07-24-air-entry-cutscene-design.md` and `CLAUDE.md`:

- Branch `air-act`, base `a1f1437`. No merge, no release, no version bump.
- **Playtest before commit does not apply to this plan's commits** — feature-branch commits are allowed; the branch stays held for user playtest before any merge.
- No balance, wave-data, `checkpointWave` or `WAVE_TRIGGERS` change.
- `js/config.js` is the single source of truth for tunables. No numeric literals for scene timing/geometry in `airentry.js`.
- Committed comments carry behavioural/mechanical facts only — units, coordinate conventions, gotchas, wiring. No design intent or lore in source.
- Never re-run bakers over `sprites/mook/*` or `sprites/fuse/walk0-3.png`.
- Preserve `file://` startup and the global `JH` IIFE architecture.
- Stage explicit paths. Never `git add -A`; `tmp/` is untracked user work.
- Transforms stay proportion-honest — translate and rotate are fine, non-uniform squash is the blit-height distortion bug fixed in `f145c3d`.
- Rim-is-hitbox does not apply: nothing in this scene damages.
- Art: single-image gens ONLY, UTF-8 prompt files, user verifies one at a time.

## Staging geometry (all verified against the current tree)

| Thing | x | Source |
|---|---:|---|
| Jon's arrival | 11540 | `enterAirAct()`: `JH.ZONE4_START + 40` |
| Scene trigger | 11630 | new `JH.AIRENTRY.triggerX` |
| Holy hydrant | 11740 | `JH.HYDRANTS[10]` |
| WAVE 30 rolls | 11810 | `gatedTriggerX(29, 11540)` = `min(11930, max(11810, 11710))` |

`WAVE_GATE.minWalk` is 170 and `WAVE_TRIGGERS[29]` is 11840, so the wave gate lands at **11810**, not 11840 — a 270px corridor. The scene fires at 11630, leaving ~180px of walk afterwards.

## File structure

| File | Responsibility |
|---|---|
| `js/airentry.js` **(new)** | Phase machine, actor state, actor draw. Pure timing helpers exported for tests. |
| `js/config.js` | `JH.AIRENTRY` block — every duration, offset, and speed. |
| `js/game.js` | Trigger check, update hook, depth-sort injection, `enterAirAct()` staging, dev entry. |
| `js/assets.js` | Two painters (`assmanPlain`, `collie`) + procedural fallbacks. |
| `index.html` | Script tag, after `truck.js` and before `game.js`. |
| `tests/airentry.test.js` **(new)** | Pure phase-machine tests. |
| `sprites/assman/plain_*.png` **(new)** | 4 stranger frames. |
| `sprites/dog/*.png` **(new)** | 6 collie frames. |

---

### Task 1: Stranger art — 4 frames

**Files:**
- Create: `sprites/assman/plain_idle.png`, `sprites/assman/plain_rip0.png`, `sprites/assman/plain_rip1.png`, `sprites/assman/plain_rip2.png`
- Scratch: `tmp/plain-*-prompt.txt`, `tmp/plain-*-raw.png` (untracked)

**Interfaces:**
- Consumes: nothing.
- Produces: four PNGs at the paths above. Task 4 loads them by exactly these paths. Each must be transparent-background, feet-anchored, and proportioned to blit at logical height 58 (matching `AM_POSE_H.idle`), so the reveal swap to `sprites/assman/baked/idle.png` does not jump.

**This task is user-in-the-loop.** Generate ONE image, show it, wait for the verdict, then move to the next. Do not batch.

- [ ] **Step 1: Read the pipeline**

Invoke the `codex-image` skill. Follow its postprocess exactly: 4-connected floods, two-tone checker key, slab-kill (neutral-light touching transparency), colour-bleed → LANCZOS → alpha ≥128, speck cull, halo cull.

**All four stranger frames are generated LEFT-facing** (toward Jon, who approaches from the left). The rip frames expose emerging chest lettering and can never be mirrored at draw time — the same constraint that forced generated `_l` bakes for the hero poses instead of flips.

**Gotcha, already paid for once:** gpt-image-2 follows the REFERENCE image's facing over prompt text, and `sprites/assman/ass-man.png` faces right. Do not fight it with words. Instead, mirror the reference first:

```bash
node -e "const{PNG}=require('pngjs'),fs=require('fs');const p=PNG.sync.read(fs.readFileSync('sprites/assman/ass-man.png'));const o=new PNG({width:p.width,height:p.height});for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++){const s=(y*p.width+x)<<2,d=(y*p.width+(p.width-1-x))<<2;for(let i=0;i<4;i++)o.data[d+i]=p.data[s+i];}fs.writeFileSync('tmp/assman-ref-left.png',PNG.sync.write(o));"
```

Use `tmp/assman-ref-left.png` as the reference so the model's facing-follows-reference behaviour works *for* you. The mirrored reference has backwards chest lettering — every prompt that shows lettering must state that it reads correctly left-to-right.

- [ ] **Step 2: Write the `plain_idle` prompt file**

Write `tmp/plain-idle-prompt.txt` (UTF-8):

```text
Call the built-in image_gen tool (gpt-image-2) directly to create exactly one image.
Use the reference image at tmp/assman-ref-left.png — the EXACT character (short tousled salt-and-pepper dark hair, trimmed stubble). Keep his EXACT head-to-body proportions (small head, ~1/7 of body height) and pixel-art rendering IDENTICAL. Same camera distance — do not zoom in. He must FACE VIEWER-LEFT, the same direction as the reference.
Prompt: The same man standing at ease FACING VIEWER-LEFT in a BAD DISGUISE over his superhero costume: a baggy grey hooded sweatshirt zipped up over the navy suit, hood down, cheap black sunglasses on. The disguise is obviously failing — GOLD SUPERHERO BOOTS still on his feet below plain grey sweatpants, and a corner of the navy cape hanging out below the hem of the hoodie behind him. Relaxed standing pose, weight on one leg, one hand holding a slack dog leash. No chest lettering visible — the hoodie covers it completely. Retro PIXEL ART matching the reference: hard pixel edges, dark outline, no anti-aliasing, flat lighting, no drop shadow, no ground. Whole body inside frame with margin, feet at the bottom edge. TRANSPARENT background (PNG alpha), no checkerboard.
Save it to: tmp/plain-idle-raw.png
```

- [ ] **Step 3: Generate, postprocess, and show the user**

Run the generation, postprocess, normalize to feet-anchored with the same proportions as `sprites/assman/baked/idle.png`, and present it. **Wait for approval before Step 4.** If rejected, revise the prompt and regenerate — do not proceed on an unapproved frame.

- [ ] **Step 4: Repeat for the three rip frames**

Same loop, one at a time. Prompt bodies (everything else in the file is identical to Step 2, only the `Prompt:` line and `Save it to:` change):

`tmp/plain-rip0-prompt.txt`:
```text
Prompt: The same man FACING VIEWER-LEFT in the grey hoodie and sunglasses, BOTH HANDS gripping the front hem of the hoodie at chest height, elbows out, beginning to tear it open. Head tilted slightly down, jaw set. The hoodie is still intact — no costume visible through it yet. GOLD SUPERHERO BOOTS on his feet, navy cape corner below the hem behind him. Retro PIXEL ART matching the reference: hard pixel edges, dark outline, no anti-aliasing, flat lighting, no drop shadow, no ground. Whole body inside frame with margin, feet at the bottom edge. TRANSPARENT background (PNG alpha), no checkerboard.
Save it to: tmp/plain-rip0-raw.png
```

`tmp/plain-rip1-prompt.txt`:
```text
Prompt: The same man FACING VIEWER-LEFT, TEARING the grey hoodie open down the middle, hands pulling apart to either side, fabric splitting with ragged torn edges. Through the widening gap the NAVY SUPERHERO SUIT is revealed with GOLD LETTERS partly visible across the chest — the tear reveals roughly half the lettering. The visible letters must read correctly left-to-right as normal English text, NOT mirrored or reversed, even though the body faces left. Sunglasses starting to slip. GOLD BOOTS on his feet. Retro PIXEL ART matching the reference: hard pixel edges, dark outline, no anti-aliasing, flat lighting, no drop shadow, no ground. Whole body inside frame with margin, feet at the bottom edge. TRANSPARENT background (PNG alpha), no checkerboard.
Save it to: tmp/plain-rip1-raw.png
```

`tmp/plain-rip2-prompt.txt`:
```text
Prompt: The same man FACING VIEWER-LEFT at the peak of the reveal — arms thrown WIDE to both sides, the shredded grey hoodie flying off his shoulders in torn scraps, sunglasses gone. The full NAVY SUPERHERO SUIT is exposed with GOLD letters reading "ASS MAN" across the chest, gold belt, gold gloves, gold boots, navy cape flaring behind him. The chest lettering must read correctly left-to-right as normal English text, NOT mirrored or reversed, even though the body faces left. Chest out, heroic. Retro PIXEL ART matching the reference: hard pixel edges, dark outline, no anti-aliasing, flat lighting, no drop shadow, no ground. Whole body inside frame with margin, feet at the bottom edge. TRANSPARENT background (PNG alpha), no checkerboard.
Save it to: tmp/plain-rip2-raw.png
```

**Verify the lettering on `rip1`/`rip2` reads forwards before accepting either frame.** A mirrored "ИAM 22A" is the failure mode the mirrored reference invites, and these frames can never be flipped at draw time to correct it.

- [ ] **Step 5: Verify the frame set holds together**

Build a contact sheet of all four plus `sprites/assman/baked/idle.png` at their real draw height (58 logical px), left to right. Confirm the head size, body proportion, and palette hold across the set and into the baked idle. Show it to the user.

Expected: no visible jump in head size or body mass between `plain_rip2` and `baked/idle.png` — that transition happens on screen.

- [ ] **Step 6: Commit**

```bash
git add sprites/assman/plain_idle.png sprites/assman/plain_rip0.png sprites/assman/plain_rip1.png sprites/assman/plain_rip2.png
git commit -m "art(air-act): Ass Man civilian disguise + hoodie rip frames"
```

---

### Task 2: Collie art — 6 frames

**Files:**
- Create: `sprites/dog/idle.png`, `sprites/dog/trot0.png`, `sprites/dog/trot1.png`, `sprites/dog/trot2.png`, `sprites/dog/trot3.png`, `sprites/dog/lift.png`
- Scratch: `tmp/collie-*-prompt.txt`, `tmp/collie-*-raw.png` (untracked)

**Interfaces:**
- Consumes: nothing.
- Produces: six PNGs at the paths above. Task 4 loads them by exactly these paths and blits them at logical height 18, feet-anchored.

**Also user-in-the-loop, one frame at a time.**

- [ ] **Step 1: Generate `idle` first — it becomes the reference for the rest**

Write `tmp/collie-idle-prompt.txt`:

```text
Call the built-in image_gen tool (gpt-image-2) directly to create exactly one image.
Prompt: A BORDER COLLIE dog standing in profile facing viewer-right, side view. Classic black-and-white markings: black back, ears and face patches, white blaze down the muzzle, white chest, white legs and tail tip. Medium coat, pointed ears up and alert, feathered tail hanging low. Standing squarely on all four legs, head level. A slack red collar. Retro PIXEL ART in a 16-bit beat-em-up style: hard pixel edges, dark outline around the silhouette, no anti-aliasing, flat lighting, no drop shadow, no ground. Whole animal inside frame with margin, paws at the bottom edge. TRANSPARENT background (PNG alpha), no checkerboard.
Save it to: tmp/collie-idle-raw.png
```

Generate, postprocess, present. **Wait for approval.**

- [ ] **Step 2: Generate the four trot frames against the approved idle**

Each prompt file adds the reference line so the markings stay consistent:

```text
Use the reference image at sprites/dog/idle.png — the EXACT same border collie (identical black-and-white markings, ear shape, tail, red collar). Keep the EXACT body proportions and pixel-art rendering IDENTICAL. Same camera distance and side-view angle — do not zoom in.
```

Then per frame:

- `trot0` — `Prompt: The same border collie mid-trot, CONTACT pose: front-left leg reaching forward and just touching down, rear-right leg pushing off behind, body level, tail streaming back, head forward.`
- `trot1` — `Prompt: The same border collie mid-trot, PASSING pose: legs gathered under the body, front-right leg swinging through under the chest, body at the top of its bounce, tail up.`
- `trot2` — `Prompt: The same border collie mid-trot, opposite CONTACT pose: front-right leg reaching forward and just touching down, rear-left leg pushing off behind, body level, tail streaming back.`
- `trot3` — `Prompt: The same border collie mid-trot, opposite PASSING pose: legs gathered under the body, front-left leg swinging through under the chest, body at the top of its bounce, tail up.`

Each ends with the same rendering clause and `Save it to: tmp/collie-trotN-raw.png`. Show each to the user before generating the next.

- [ ] **Step 3: Generate `lift`**

```text
Prompt: The same border collie stopped and cocking its REAR LEG UP and outward to the side in the unmistakable dog-peeing pose, body tilted slightly, tail raised, head turned forward with a pleased expression. Side view facing viewer-right.
```

- [ ] **Step 4: Verify the trot cycle animates**

Assemble `trot0-3` into a looping GIF at the real draw height (18 logical px) and show the user. Expected: a readable four-beat trot with no popping in body mass or marking placement between frames.

- [ ] **Step 5: Commit**

```bash
git add sprites/dog/idle.png sprites/dog/trot0.png sprites/dog/trot1.png sprites/dog/trot2.png sprites/dog/trot3.png sprites/dog/lift.png
git commit -m "art(air-act): border collie idle, four-frame trot, leg-lift"
```

---

### Task 3: Config block + pure phase machine

**Files:**
- Modify: `js/config.js` (append a new block near the other set-piece blocks)
- Create: `js/airentry.js`
- Create: `tests/airentry.test.js`
- Modify: `index.html:136` (script tag)

**Interfaces:**
- Consumes: `JH.AIRENTRY` from config.
- Produces, relied on by Tasks 4-6:
  - `JH.AirEntry.ORDER` — `string[]`, the phase names in order, ending `"release"`.
  - `JH.AirEntry.totalDur(C)` → `number` (seconds); `C` is a `JH.AIRENTRY`-shaped object.
  - `JH.AirEntry.phaseAt(C, t)` → `string`, one of `ORDER`.
  - `JH.AirEntry.enter(game)`, `.update(dt, game)`, `.skip(game)` — Tasks 5/6.
  - `JH.AirEntry.actors(game)` → array of `{x, y, draw(ctx, cam)}` — Task 5.
  - Scene state lives at `game.airEntry`; the once-per-run flag at `game.airEntryPlayed`.

- [ ] **Step 1: Write the failing test**

Create `tests/airentry.test.js`:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");

global.window = global.window || {};
require("../js/config.js");
require("../js/airentry.js");
const JH = global.window.JH;
const AirEntry = JH.AirEntry;
const C = JH.AIRENTRY;

test("phase order ends in release", () => {
  assert.strictEqual(AirEntry.ORDER[AirEntry.ORDER.length - 1], "release");
  assert.deepStrictEqual(AirEntry.ORDER,
    ["notice", "desecrate", "rage", "reveal", "feud", "depart", "release"]);
});

test("totalDur is the sum of every scripted phase, derived from config", () => {
  const expected = AirEntry.ORDER.slice(0, -1)
    .reduce((sum, k) => sum + C.phases[k], 0);
  assert.strictEqual(AirEntry.totalDur(C), expected);
});

test("phaseAt walks the phases in order and lands on release", () => {
  assert.strictEqual(AirEntry.phaseAt(C, 0), "notice");
  let acc = 0;
  for (const k of AirEntry.ORDER.slice(0, -1)) {
    // Sample the middle of each phase so the assertion never sits on a boundary.
    assert.strictEqual(AirEntry.phaseAt(C, acc + C.phases[k] / 2), k);
    acc += C.phases[k];
  }
  assert.strictEqual(AirEntry.phaseAt(C, AirEntry.totalDur(C)), "release");
  assert.strictEqual(AirEntry.phaseAt(C, AirEntry.totalDur(C) + 99), "release");
});

test("every phase duration is positive", () => {
  for (const k of AirEntry.ORDER.slice(0, -1))
    assert.ok(C.phases[k] > 0, k + " must have a positive duration");
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tests/airentry.test.js`
Expected: FAIL — `Cannot find module '../js/airentry.js'`.

- [ ] **Step 3: Add the config block**

In `js/config.js`, after the `JH.WAVE_GATE` line (currently `js/config.js:490`), insert:

```js
  // Air World entry cutscene (airentry.js). Staged on existing geometry:
  // HYDRANTS[10] (x 11740) is the hydrant the dog uses; Jon arrives at
  // ZONE4_START+40 = 11540 and WAVE 30 gates at 11810 (gatedTriggerX with
  // WAVE_GATE.minWalk 170), so the scripted beat sits inside a 270px corridor.
  // Actor x offsets are relative to the hydrant; +x is right (toward wave 30).
  JH.AIRENTRY = {
    triggerX: 11630,          // player x that starts the scene
    strangerDX: -34,          // stranger x, relative to the hydrant
    dogStartDX: -20,          // collie x at scene start
    dogLiftDX: -7,            // collie x once it reaches the hydrant
    actorY: JH.DEPTH_MAX - 12, // both actors share the hydrant's depth row
    phases: {                 // seconds; sum is the full scripted length
      notice: 1.2, desecrate: 2.4, rage: 1.4,
      reveal: 1.8, feud: 2.6, depart: 1.6,
    },
    dogTrotSpeed: 26,         // px/s while walking to the hydrant
    dogFrameStep: 0.12,       // s per trot frame
    ripFrameStep: 0.30,       // s per rip frame (3 frames over `reveal`)
    leashSag: 7,              // px of slack at the leash curve's midpoint
    riseSpeed: 150,           // px/s upward during depart
    soarSpeed: 210,           // px/s rightward once airborne
    departRiseFrac: 0.45,     // fraction of `depart` spent rising before soaring
    dogCarryDX: -6,           // collie offset from the carrier's centre while held
    dogCarryDY: -22,          // …and above his feet
    flashDur: 0.18,           // rage red flash + reveal white flash
  };
```

- [ ] **Step 4: Write the minimal module**

Create `js/airentry.js`:

```js
/* =====================================================================
   airentry.js — JH.AirEntry: the Air World arrival set-piece.
   A scripted in-world beat dispatched from game.js during state "play":
   while `game.airEntry` is non-null it owns play input/logic (same idiom
   as game.arrival). It holds its own two actors and never touches the
   Player/enemy/wave systems. All tunables come from JH.AIRENTRY.
   Coordinate model: world x/y like every other actor; actor x offsets in
   config are relative to the hydrant, +x toward the next wave trigger.
   ===================================================================== */
(function (root) {
  "use strict";
  const JH = root.JH;

  // Scripted phases in order. Everything before "release" consumes time from
  // JH.AIRENTRY.phases; "release" is the terminal state and has no duration.
  const ORDER = ["notice", "desecrate", "rage", "reveal", "feud", "depart", "release"];

  const AirEntry = {
    ORDER,

    // Total scripted seconds (every phase except the terminal "release").
    totalDur(C) {
      let sum = 0;
      for (let i = 0; i < ORDER.length - 1; i++) sum += C.phases[ORDER[i]];
      return sum;
    },

    // Phase name at elapsed time t. Clamps to "release" past the end.
    phaseAt(C, t) {
      let acc = 0;
      for (let i = 0; i < ORDER.length - 1; i++) {
        acc += C.phases[ORDER[i]];
        if (t < acc) return ORDER[i];
      }
      return "release";
    },
  };

  root.JH = root.JH || {};
  root.JH.AirEntry = AirEntry;
  if (typeof module !== "undefined" && module.exports) module.exports = AirEntry;
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/airentry.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 6: Add the script tag**

In `index.html`, insert after line 136 (`<script src="js/truck.js"></script>`) and before `game.js`:

```html
  <script src="js/airentry.js"></script>
```

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all previously passing tests still pass, plus the 4 new ones. Report counts only — do not paste the log.

- [ ] **Step 8: Commit**

```bash
git add js/config.js js/airentry.js tests/airentry.test.js index.html
git commit -m "feat(air-act): air entry phase machine + JH.AIRENTRY tunables"
```

---

### Task 4: Asset painters for both actors

**Files:**
- Modify: `js/assets.js` (append after the `windhazard` painter, currently ending `js/assets.js:1147`)
- Test: `tests/airentry.test.js` (append)

**Interfaces:**
- Consumes: the PNG paths from Tasks 1-2.
- Produces:
  - Painter key `"assmanPlain"` — `opt.state` ∈ `{"idle", "rip"}`, `opt.frame` selects the rip frame `0..2`. Drawn via `JH.Assets.draw(ctx, "assmanPlain", x, y, facing, opt)`. **Art is LEFT-facing native**: `facing: -1` draws unmirrored, `facing: 1` mirrors. Rip frames never mirror at any `facing`.
  - Painter key `"collie"` — `opt.state` ∈ `{"idle", "trot", "lift"}`, `opt.frame` selects the trot frame `0..3`. **Art is RIGHT-facing native** (repo default): `facing: -1` mirrors.
  - `JH.Assets.airEntryReady()` → `boolean`, true once `plain_idle` has decoded. Task 5 does not gate on this; it exists so a headless check can distinguish real art from fallback.

- [ ] **Step 1: Write the failing test**

Append to `tests/airentry.test.js`:

```js
test("assmanPlain and collie painters are registered", () => {
  // assets.js builds an offscreen canvas at eval time — same document stub
  // pattern as tests/air.test.js and tests/juice.test.js.
  global.window.JH.Loader = { img: () => ({}) };
  global.document = global.document || {
    createElement: () => ({
      width: 0, height: 0,
      getContext: () => ({
        save() {}, restore() {}, translate() {}, scale() {}, drawImage() {},
        fillRect() {}, clearRect() {}, setTransform() {},
        getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      }),
    }),
    getElementById: () => ({ style: {} }),
  };
  require("../js/assets.js");
  assert.ok(typeof global.window.JH.Assets.airEntryReady === "function");
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test tests/airentry.test.js`
Expected: FAIL — `airEntryReady` is not a function.

- [ ] **Step 3: Add the painters**

In `js/assets.js`, after the `windhazard` `Assets.register` block, insert:

```js
  // ================= AIR ENTRY CUTSCENE ACTORS ========================
  // Ass Man in civilian disguise + his border collie (airentry.js). Plain
  // Assets.register (not registerBaked — neither is an Enemy, no elite
  // variant, no pose function). PLAIN_H matches AM_POSE_H.idle so the
  // reveal's swap to the baked idle does not jump. Frames can land one at a
  // time during art generation, so every path falls back to its first frame
  // and then to a procedural body.
  const PLAIN_H = 58, DOG_H = 18;
  const _plainImgs = {
    idle: JH.Loader.img("sprites/assman/plain_idle.png"),
    rip0: JH.Loader.img("sprites/assman/plain_rip0.png"),
    rip1: JH.Loader.img("sprites/assman/plain_rip1.png"),
    rip2: JH.Loader.img("sprites/assman/plain_rip2.png"),
  };
  const _dogImgs = {
    idle:  JH.Loader.img("sprites/dog/idle.png"),
    trot0: JH.Loader.img("sprites/dog/trot0.png"),
    trot1: JH.Loader.img("sprites/dog/trot1.png"),
    trot2: JH.Loader.img("sprites/dog/trot2.png"),
    trot3: JH.Loader.img("sprites/dog/trot3.png"),
    lift:  JH.Loader.img("sprites/dog/lift.png"),
  };
  const _usable = (im) => !!(im && im.complete && im.naturalWidth);
  Assets.airEntryReady = () => _usable(_plainImgs.idle);

  // Feet-anchored blit at a fixed logical height, honest aspect (width
  // follows the source ratio — never stretched; see the f145c3d blit bug).
  // `mirror` is explicit: the two actor sets have opposite native facings.
  const _sceneBlit = (ctx, img, x, y, mirror, drawH) => {
    const scale = drawH / img.naturalHeight;
    const dw = Math.round(img.naturalWidth * scale);
    ctx.save();
    ctx.translate(x, y);
    if (mirror) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -Math.round(dw / 2), -drawH, dw, drawH);
    ctx.restore();
  };

  // plain_* art is generated LEFT-facing (toward Jon, where the rip plays),
  // so facing -1 draws unmirrored and facing +1 mirrors — inverted from the
  // usual right-native convention. Rip frames NEVER mirror: their emerging
  // chest lettering cannot be flipped (same constraint that forced generated
  // _l bakes for the hero poses). The hoodie covers the lettering on idle,
  // so idle mirrors freely for the oblivious look-away.
  Assets.register("assmanPlain", (p, opt, ctx, x, y, facing) => {
    const rip = opt.state === "rip";
    const key = rip ? "rip" + Math.max(0, Math.min(2, opt.frame | 0)) : "idle";
    const img = _usable(_plainImgs[key]) ? _plainImgs[key] : _plainImgs.idle;
    if (_usable(img) && ctx) { _sceneBlit(ctx, img, x, y, !rip && facing > 0, PLAIN_H); return; }
    // Procedural fallback: grey hoodie over navy legs, gold boots.
    p(-8, 0, 7, 5, "#d9a520"); p(1, 0, 7, 5, "#d9a520");   // gold boots
    p(-7, 5, 14, 16, "#3a4a6a");                            // sweatpants
    p(-9, 21, 18, 22, "#8a8f96");                           // hoodie
    p(-9, 21, 18, 3, "#6d727a");
    p(-4, 43, 9, 9, PAL.skin);                              // head
    p(-4, 47, 9, 2, "#15181d");                             // sunglasses
  });

  Assets.register("collie", (p, opt, ctx, x, y, facing) => {
    const key = opt.state === "lift" ? "lift"
              : opt.state === "trot" ? "trot" + Math.max(0, Math.min(3, opt.frame | 0))
              : "idle";
    const img = _usable(_dogImgs[key]) ? _dogImgs[key] : _dogImgs.idle;
    // Collie art is RIGHT-facing native (the repo default): mirror on facing -1.
    if (_usable(img) && ctx) { _sceneBlit(ctx, img, x, y, facing < 0, DOG_H); return; }
    // Procedural fallback: black-and-white body, white blaze, up ears.
    p(-7, 0, 2, 5, "#f2f2f2"); p(-3, 0, 2, 5, "#f2f2f2");   // front legs
    p(2, 0, 2, 5, "#f2f2f2");  p(5, 0, 2, 5, "#f2f2f2");    // rear legs
    p(-7, 5, 14, 7, "#1b1b1f");                             // body
    p(-7, 5, 6, 4, "#f2f2f2");                              // white chest
    p(7, 7, 4, 3, "#1b1b1f");                               // tail
    p(-10, 10, 5, 6, "#1b1b1f");                            // head
    p(-10, 10, 2, 5, "#f2f2f2");                            // blaze
    p(-8, 15, 2, 3, "#1b1b1f");                             // ear
  });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/airentry.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: no regressions. Report counts only.

- [ ] **Step 6: Commit**

```bash
git add js/assets.js tests/airentry.test.js
git commit -m "feat(air-act): civilian + collie painters with procedural fallbacks"
```

---

### Task 5: Scene actors, motion, and game.js wiring

**Files:**
- Modify: `js/airentry.js` (add `enter`/`update`/`skip`/`actors`/`_finish`)
- Modify: `js/game.js` — `enterAirAct()` at `js/game.js:1126`, the play-update gate at `js/game.js:2270`, the depth sort at `js/game.js:3006`
- Test: `tests/airentry.test.js` (append)

**Interfaces:**
- Consumes: `phaseAt`/`totalDur`/`ORDER` (Task 3), painters `"assmanPlain"` and `"collie"` (Task 4).
- Produces:
  - `game.airEntry` — `null` when inactive, else `{t, phase, hydrantX, stranger, dog, flashT, revealed}`.
  - `game.airEntryPlayed` — `boolean`, set true on finish; blocks replay.
  - `AirEntry.actors(game)` → `[]` when inactive.
  - Actor `facing` is semantic ("which way is he looking"), never a mirror flag — the painters own the mirror decision per Task 4, because the two art sets have opposite native facings.

- [ ] **Step 1: Write the failing tests**

Append to `tests/airentry.test.js`:

```js
// Minimal game stub: the module only touches these fields.
function makeGame() {
  return {
    airEntry: null, airEntryPlayed: false,
    waveIndex: 28, checkpointWave: 29, waveActive: false, sigils: [],
    player: { x: C.triggerX, y: 51, z: 0, facing: 1 },
    input: { _buf: {}, buffered(a) { return !!this._buf[a]; }, consume(a) { this._buf[a] = false; } },
  };
}

test("enter() stages both actors and arms the scene", () => {
  const g = makeGame();
  AirEntry.enter(g);
  assert.ok(g.airEntry, "scene state exists");
  assert.strictEqual(g.airEntry.phase, "notice");
  assert.strictEqual(AirEntry.actors(g).length, 2);
});

test("enter() is idempotent once the scene has played", () => {
  const g = makeGame();
  g.airEntryPlayed = true;
  AirEntry.enter(g);
  assert.strictEqual(g.airEntry, null, "a replayed run must not re-arm");
});

test("running to the end releases control and marks the run", () => {
  const g = makeGame();
  AirEntry.enter(g);
  const steps = Math.ceil(AirEntry.totalDur(C) / (1 / 60)) + 2;
  for (let i = 0; i < steps; i++) AirEntry.update(1 / 60, g);
  assert.strictEqual(g.airEntry, null, "scene cleared");
  assert.strictEqual(g.airEntryPlayed, true);
  assert.strictEqual(AirEntry.actors(g).length, 0);
});

test("skip() from any phase lands in the same end state", () => {
  for (const phase of AirEntry.ORDER.slice(0, -1)) {
    const g = makeGame();
    AirEntry.enter(g);
    // Advance to the middle of `phase`, then skip.
    let acc = 0;
    for (const k of AirEntry.ORDER.slice(0, -1)) {
      if (k === phase) break;
      acc += C.phases[k];
    }
    g.airEntry.t = acc + C.phases[phase] / 2;
    AirEntry.skip(g);
    assert.strictEqual(g.airEntry, null, "skipped from " + phase);
    assert.strictEqual(g.airEntryPlayed, true);
  }
});

test("a buffered confirm during the scene skips it", () => {
  const g = makeGame();
  AirEntry.enter(g);
  g.input._buf.confirm = true;
  AirEntry.update(1 / 60, g);
  assert.strictEqual(g.airEntry, null);
});

test("depart soars in the direction he faces, carrying the dog", () => {
  const g = makeGame();
  AirEntry.enter(g);
  // Park time inside `depart`, past the rise fraction so he is soaring.
  const before = AirEntry.ORDER.slice(0, -1)
    .filter((k) => k !== "depart")
    .reduce((sum, k) => sum + C.phases[k], 0);
  g.airEntry.t = before + C.phases.depart * (C.departRiseFrac + 0.01);
  const x0 = g.airEntry.stranger.x;
  AirEntry.update(1 / 60, g);
  const st = g.airEntry.stranger, dog = g.airEntry.dog;
  assert.strictEqual(st.state, "soar");
  assert.strictEqual(st.facing, 1, "facing must match travel direction");
  assert.ok(st.x > x0, "soars downrange");
  assert.strictEqual(dog.held, true);
  assert.strictEqual(dog.x, st.x + C.dogCarryDX, "dog rides the carrier");
});

test("the scene never mutates wave state", () => {
  const g = makeGame();
  const before = { waveIndex: g.waveIndex, checkpointWave: g.checkpointWave,
                   waveActive: g.waveActive, sigils: g.sigils.length };
  AirEntry.enter(g);
  const steps = Math.ceil(AirEntry.totalDur(C) / (1 / 60)) + 2;
  for (let i = 0; i < steps; i++) AirEntry.update(1 / 60, g);
  assert.strictEqual(g.waveIndex, before.waveIndex);
  assert.strictEqual(g.checkpointWave, before.checkpointWave);
  assert.strictEqual(g.waveActive, before.waveActive);
  assert.strictEqual(g.sigils.length, before.sigils);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/airentry.test.js`
Expected: FAIL — `AirEntry.enter is not a function`.

- [ ] **Step 3: Implement the scene body**

In `js/airentry.js`, add these members to the `AirEntry` object (after `phaseAt`):

```js
    // Arm the scene. No-op if it already played this run — death/respawn and
    // Church returns re-enter the area and must not replay it.
    enter(game) {
      if (game.airEntryPlayed || game.airEntry) return;
      const C = JH.AIRENTRY;
      const hydrantX = JH.HYDRANTS[JH.HYDRANTS.length - 1].x;
      const self = this;
      const stranger = {
        x: hydrantX + C.strangerDX, y: C.actorY, facing: -1,
        state: "idle", frame: 0, z: 0,
        draw(ctx, cam) {
          JH.Assets.draw(ctx, self._strangerKey(game), this.x - cam,
            JH.Geo.feetScreenY(this.y, this.z), this.facing,
            { state: this.state, frame: this.frame });
        },
      };
      const dog = {
        x: hydrantX + C.dogStartDX, y: C.actorY, facing: 1,
        state: "idle", frame: 0, z: 0, held: false,
        draw(ctx, cam) {
          JH.Assets.draw(ctx, "collie", this.x - cam,
            JH.Geo.feetScreenY(this.y, this.z), this.facing,
            { state: this.state, frame: this.frame });
        },
      };
      game.airEntry = {
        t: 0, phase: "notice", hydrantX,
        stranger, dog, flashT: 0, revealed: false,
      };
    },

    // "assmanPlain" until the rip completes, then the baked hero art.
    _strangerKey(game) {
      const sc = game.airEntry;
      return (sc && sc.revealed) ? "assman" : "assmanPlain";
    },

    actors(game) {
      const sc = game.airEntry;
      return sc ? [sc.stranger, sc.dog] : [];
    },

    // Jump straight to the end state. Reachable from any phase.
    skip(game) {
      if (game.airEntry) this._finish(game);
    },

    _finish(game) {
      game.airEntry = null;
      game.airEntryPlayed = true;
    },

    update(dt, game) {
      const sc = game.airEntry;
      if (!sc) return;
      const C = JH.AIRENTRY;

      // Confirm skips the whole beat; consume it so it can't leak into play.
      if (game.input && game.input.buffered("confirm")) {
        game.input.consume("confirm");
        this.skip(game);
        return;
      }

      sc.t += dt;
      sc.phase = this.phaseAt(C, sc.t);
      if (sc.flashT > 0) sc.flashT = Math.max(0, sc.flashT - dt);
      const el = this._phaseElapsed(C, sc.t, sc.phase);
      const st = sc.stranger, dog = sc.dog;

      if (sc.phase === "desecrate") {
        // Trot to the hydrant, then lift. Motion is translation only.
        const targetX = sc.hydrantX + C.dogLiftDX;
        if (dog.x < targetX) {
          dog.x = Math.min(targetX, dog.x + C.dogTrotSpeed * dt);
          dog.state = "trot";
          dog.frame = Math.floor(el / C.dogFrameStep) & 3;
        } else {
          dog.state = "lift";
        }
        st.facing = 1;   // looking away down the street — oblivious
      } else if (sc.phase === "rage") {
        dog.state = "idle";
        if (game.player) game.player.facing = 1;
        if (el < dt) sc.flashT = C.flashDur;     // one red flash on entry
      } else if (sc.phase === "reveal") {
        st.facing = -1;
        st.state = "rip";
        st.frame = Math.min(2, Math.floor(el / C.ripFrameStep));
        if (st.frame >= 2 && !sc.revealed) { sc.revealed = true; sc.flashT = C.flashDur; }
      } else if (sc.phase === "feud") {
        st.state = "idle";
      } else if (sc.phase === "depart") {
        const riseT = C.phases.depart * C.departRiseFrac;
        if (el < riseT) {
          // Still holding Jon's eye as he lifts off — facing stays left.
          st.state = "riseup";
          st.z += C.riseSpeed * dt;
        } else {
          // Turns downrange before soaring: facing must match travel or he
          // flies backwards.
          st.state = "soar";
          st.facing = 1;
          st.z += C.riseSpeed * 0.35 * dt;
          st.x += C.soarSpeed * dt;
        }
        // Carried under the free arm — riseup leaves the left arm down and
        // soar tucks it to the chest, so the offset reads as held in both.
        dog.held = true;
        dog.state = "idle";
        dog.x = st.x + C.dogCarryDX;
        dog.z = st.z - C.dogCarryDY;
      }

      if (sc.phase === "release") this._finish(game);
    },

    // Seconds elapsed inside the current phase.
    _phaseElapsed(C, t, phase) {
      let acc = 0;
      for (let i = 0; i < ORDER.length - 1; i++) {
        if (ORDER[i] === phase) return t - acc;
        acc += C.phases[ORDER[i]];
      }
      return 0;
    },
```

Note the depart branch draws the stranger with the **baked** `"assman"` painter (via `_strangerKey`), which already accepts `riseup`/`soar` as `opt.state`.

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/airentry.test.js`
Expected: PASS, 12 tests.

- [ ] **Step 5: Stage the trigger in `enterAirAct()`**

In `js/game.js`, replace the three stub comment lines at `js/game.js:1123-1125`:

```js
    // Air World arrival (post-Gate Crash). Banner-beat stub of the Ass Man
    // entry cutscene (bookends pass replaces it): Jon steps onto the cloudline
    // street, vendor at the act boundary, free-walk to WAVE 30.
```

with:

```js
    // Air World arrival (post-Gate Crash): Jon steps onto the cloudline
    // street, walks into the Ass Man entry beat (airentry.js, armed by the
    // JH.AIRENTRY.triggerX proximity check in update()), then free-walks to
    // WAVE 30 past the vendor at the act boundary.
```

Then, inside `enterAirAct()`, immediately before the `this.banner(...)` call, add:

```js
      this.airEntry = null; this.airEntryPlayed = false;   // arrival re-arms the entry beat
```

- [ ] **Step 6: Add the update hook and trigger check**

In `js/game.js`, at the play-update gate (`js/game.js:2270`), the current line is:

```js
      if (this.arrival) { this.updateArrival(dt); return; }
```

Replace it with:

```js
      if (this.arrival) { this.updateArrival(dt); return; }

      // Air entry beat: owns play input/logic while it runs (same idiom as
      // `arrival` above). Armed once per run by walking past triggerX.
      if (!this.airEntry && !this.airEntryPlayed && JH.AirEntry &&
          JH.Background && JH.Background.airOn &&
          this.player.x >= JH.AIRENTRY.triggerX) {
        JH.AirEntry.enter(this);
      }
      if (this.airEntry) { JH.AirEntry.update(dt, this); return; }
```

- [ ] **Step 7: Inject the actors into the depth sort**

In `js/game.js`, the depth-sort block currently at `js/game.js:3006-3011` reads:

```js
        const actors = this.enemies.slice();
        // Jon rides in the cab during the departure beat — don't double-draw him.
        if (!(this.truckBoard && this.truckBoard.departing)) actors.push(this.player);
        if (this.shopNpc) actors.push(this.shopNpc);
        if (this.deepdiveTV) actors.push(this.deepdiveTV);
```

Add one line after the `deepdiveTV` push:

```js
        if (this.airEntry) for (const a of JH.AirEntry.actors(this)) actors.push(a);
```

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: no regressions plus the new tests. Report counts only.

- [ ] **Step 9: Commit**

```bash
git add js/airentry.js js/game.js tests/airentry.test.js
git commit -m "feat(air-act): stage the entry beat and wire it into play"
```

---

### Task 6: Dev entry + headless verification

**Files:**
- Modify: `js/game.js` — dev menu count at `js/game.js:249` and `js/game.js:3287`, key handler at `js/game.js:255-260`, row draw after `js/game.js:3406`, new `devGotoAirEntry()` beside `devGotoTruck()` at `js/game.js:534`
- Scratch: `tmp/airentry-verify.mjs`, `tmp/airentry-*.png` (untracked)

**Interfaces:**
- Consumes: `enterAirAct()`, `JH.AirEntry` (Tasks 3-5).
- Produces: `Game.devGotoAirEntry()` — warps into the Air World with the player parked just short of `triggerX`, so one right-hold starts the scene.

- [ ] **Step 1: Add the dev action**

In `js/game.js`, after `devGotoTruck()` (ends `js/game.js:537`), add:

```js
    // Jump to the Air World arrival with Jon parked just short of the entry
    // beat's trigger, so a single right-hold starts the scene.
    devGotoAirEntry() {
      if (!this.player) this.startGame();
      this.deepdiving = false;
      this.enterAirAct();
      this.player.x = JH.AIRENTRY.triggerX - 24;
      JH.Camera.snapTo(this.player);
      this.devMenu = false;
    },
```

- [ ] **Step 2: Widen the dev menu**

Two `count` sites must move from `+ 5` to `+ 6`.

`js/game.js:249`:
```js
        const count = JH.LEVEL1.waves.length + 5;  // +cutscene +range +wall boss +post-firewall +truck escape
```
becomes:
```js
        const count = JH.LEVEL1.waves.length + 6;  // +cutscene +range +wall boss +post-firewall +truck escape +air entry
```

`js/game.js:3287`:
```js
      const count = waves.length + 5;          // +cutscene +range +firewall +post-firewall +truck
```
becomes:
```js
      const count = waves.length + 6;          // +cutscene +range +firewall +post-firewall +truck +air entry
```

Then in the Enter handler (`js/game.js:255-260`), add one branch before the final `else`:

```js
          else if (this.devCursor === JH.LEVEL1.waves.length + 5) this.devGotoAirEntry();
```

- [ ] **Step 3: Draw the row**

In `js/game.js`, after the TRUCK ESCAPE row block (ends `js/game.js:3406`), add:

```js
      // Air World entry beat (arrival cutscene, parked short of the trigger)
      const aeRy = rowY(waves.length + 5);
      if (aeRy !== null) {
        const aeSel = this.devCursor === waves.length + 5;
        if (aeSel) { ctx.fillStyle = "rgba(160,220,255,0.18)"; ctx.fillRect(PX + 3, aeRy, W - 6, ROW - 1); }
        ctx.fillStyle = aeSel ? "#a0dcff" : "#667788";
        ctx.font = (aeSel ? "bold " : "") + "6px monospace"; ctx.textAlign = "left";
        ctx.fillText("★  AIR ENTRY", PX + 8, aeRy + ROW - 3);
        ctx.fillStyle = aeSel ? "#a0dcff" : "#445566"; ctx.textAlign = "right";
        ctx.fillText("DEV", PX + W - 6, aeRy + ROW - 3);
      }
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: no regressions. Report counts only.

- [ ] **Step 5: Headless verification**

Invoke the `headless-playtest` skill. Its harness pattern and input gotchas are load-bearing — hold keys ~120ms, server on port 8123, playwright msedge.

Write `tmp/airentry-verify.mjs` asserting, against live game state:

1. `devGotoAirEntry()` then hold Right → `game.airEntry` becomes non-null.
2. While `game.airEntry` is set, holding Right does not change `game.player.x` (control is locked).
3. `game.airEntry.phase` passes through every entry in `JH.AirEntry.ORDER` in order.
4. After release, `game.airEntry` is `null`, `game.airEntryPlayed` is `true`, and Right moves Jon again.
5. Continuing right rolls WAVE 30: `game.waveIndex === 29` and `game.waveActive === true`.
6. A confirm press mid-scene reaches the same end state as running it out.
7. Zero `pageerror` events for the whole run.

Capture one screenshot per phase to `tmp/airentry-<phase>.png`.

Expected: 7/7 checks green, 7 screenshots, zero pageerrors.

- [ ] **Step 6: Show the user the captures**

Present the per-phase screenshots. This is the first time the scene is visible — expect timing notes.

- [ ] **Step 7: Commit**

```bash
git add js/game.js
git commit -m "dev(air-act): AIR ENTRY dev-menu warp for the arrival beat"
```

---

## Done criteria

- The scene plays once on Air World arrival, is skippable, and does not replay after death or a Church return.
- WAVE 30 still rolls at x 11810; `waveIndex`, `checkpointWave`, `waveActive`, `sigils` untouched by the scene.
- Full suite green; zero pageerrors headlessly.
- Branch `air-act` **HELD FOR USER PLAYTEST** — no merge, no release.

## Deliberately not in this plan

- K-9 Unit relic (the dog leaves with Ass Man; deputization is the outro's job).
- Assvengers tease.
- Baked Ass Man portrait for the outro.
- Gasbag production art.
- Rewriting `2026-07-20-ass-man-fight-design.md` to as-built.
