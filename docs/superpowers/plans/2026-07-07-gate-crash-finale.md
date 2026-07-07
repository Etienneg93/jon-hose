# Gate Crash Finale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Firewall's instant despawn with an authored finale — growing explosion → whiteout → cloud-walkway reveal → the truck crashes the Air World gate → the player walks Jon in.

**Architecture:** Everything lives in `js/truck.js`'s existing phase machine (`boss` grows five new phases: `detonate → whiteout → reveal → crash → walk`); pure math goes in `js/truckrun.balance.js`; every number goes in a new `JH.TRUCKRUN.finale` block in `js/config.js`. One new baked sprite (`wreck.png`) via `tools/truck-sprite.mjs`.

**Tech Stack:** Vanilla JS canvas game (no build step), `node --test`, pngjs baker tools, headless verification via the project's `headless-playtest` skill (playwright-core + msedge).

**Spec:** `docs/superpowers/specs/2026-07-07-gate-crash-finale-design.md`

## Global Constraints

- **Playtest gate:** `js/truck.js` and `js/assets.js` changes stay **UNCOMMITTED** (they carry earlier in-flight, playtest-held edits — the truck sprite swap). Never `git add` those two files, and never `git add -A` / `git add .`. Committable per task: `js/config.js`, `js/truckrun.balance.js`, `tests/truckrun.test.js`, `tools/truck-sprite.mjs`, `sprites/firetruck/*.png`, docs.
- **Do not touch** `js/game.js` or `js/world.js` (they hold unrelated uncommitted playtest-held work).
- All tunables live in `js/config.js` (`JH.TRUCKRUN.finale`); no gameplay literals in `js/truck.js`.
- Tests derive expectations from config values, never repeat the literals.
- Never run bakers over `sprites/mook/*` or `sprites/fuse/walk*.png` (hand-cleaned; irrelevant here but absolute).
- No jump, no melee — never add such mechanics or inputs.
- `JH.VIEW_W/H` = 480×270 **logical** px; baked art is 4× logical (draw at natural/4).
- The dev server is `npm run dev` (port 5173) and dies between sessions — restart it before any headless run. Headless runs go through the **`headless-playtest` project skill** (msedge channel; hold keys ~120ms — bare `keyboard.press()` edges get lost).
- Before claiming anything works, verify it (run the command / the headless script and read the output).

---

### Task 1: `JH.TRUCKRUN.finale` config block + finale math helpers

**Files:**
- Modify: `js/config.js` (inside the `JH.TRUCKRUN = { … }` object, lines ~608-676 — insert before the closing `};`)
- Modify: `js/truckrun.balance.js` (add four functions to the `TruckBalance` object)
- Test: `tests/truckrun.test.js` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces (later tasks rely on these exact names):
  - `JH.TRUCKRUN.finale` — see block below (`F` in signatures).
  - `TruckBalance.finaleWhite(F, phase, t)` → number 0..1 (full-screen white alpha; `phase` is the scene phase string, `t` seconds into that phase).
  - `TruckBalance.boomInterval(F, prog)` → seconds between detonation booms at progress `prog` (clamped 0..1).
  - `TruckBalance.boomScale(F, prog)` → FX scale at progress `prog` (clamped 0..1).
  - `TruckBalance.throwArc(F, groundY, t)` → `{ x, y, rot, done }` — Jon's blast-throw position in screen px at `t` seconds (primary arc then one bounce hop); `groundY` is the walkway ground line.
  - `TruckBalance.gateReached(F, x)` → boolean (`x >= F.gate.enterX`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/truckrun.test.js` (the file already loads `CFG = global.window.JH.TRUCKRUN` and `TB = require("../js/truckrun.balance.js")`):

```js
// ---- Gate Crash finale (spec: docs/superpowers/specs/2026-07-07-gate-crash-finale-design.md)
const F = CFG.finale;

test("finale config block is present and shaped", () => {
  assert.ok(F, "JH.TRUCKRUN.finale exists");
  assert.ok(F.gate.x > F.throw.landX, "gate sits beyond Jon's landing");
  assert.ok(F.gate.enterX < F.gate.x, "enter threshold is before the arch centre");
  assert.ok(F.whiteRamp > 0 && F.whiteHold > 0 && F.whiteFade > 0);
  assert.ok(F.boomIntEnd < F.boomIntStart, "boom cadence accelerates");
});

test("finaleWhite: 0 in detonate, ramps to 1 in whiteout, fades in reveal, 0 after", () => {
  assert.strictEqual(TB.finaleWhite(F, "detonate", 1), 0);
  assert.strictEqual(TB.finaleWhite(F, "whiteout", 0), 0);
  assert.strictEqual(TB.finaleWhite(F, "whiteout", F.whiteRamp), 1);
  assert.strictEqual(TB.finaleWhite(F, "whiteout", F.whiteRamp + F.whiteHold), 1);
  assert.strictEqual(TB.finaleWhite(F, "reveal", 0), 1);
  assert.strictEqual(TB.finaleWhite(F, "reveal", F.whiteFade / 2), 0.5);
  assert.strictEqual(TB.finaleWhite(F, "reveal", F.whiteFade), 0);
  assert.strictEqual(TB.finaleWhite(F, "crash", 1), 0);
  assert.strictEqual(TB.finaleWhite(F, "walk", 1), 0);
});

test("boomInterval / boomScale: ramp with progress, clamped", () => {
  assert.strictEqual(TB.boomInterval(F, 0), F.boomIntStart);
  assert.strictEqual(TB.boomInterval(F, 1), F.boomIntEnd);
  const mid = TB.boomInterval(F, 0.5);
  assert.ok(mid < F.boomIntStart && mid > F.boomIntEnd);
  assert.strictEqual(TB.boomInterval(F, 2), F.boomIntEnd, "clamps above 1");
  assert.strictEqual(TB.boomInterval(F, -1), F.boomIntStart, "clamps below 0");
  assert.strictEqual(TB.boomScale(F, 0), F.boomScaleStart);
  assert.strictEqual(TB.boomScale(F, 1), F.boomScaleEnd);
});

test("throwArc: launches at start, flies above ground, lands + bounces to rest, spins stop at touchdown", () => {
  const groundY = 200;
  const a0 = TB.throwArc(F, groundY, 0);
  assert.strictEqual(a0.x, F.throw.startX);
  assert.strictEqual(Math.round(a0.y), Math.round(groundY + F.throw.startY));
  assert.strictEqual(a0.done, false);
  const mid = TB.throwArc(F, groundY, F.throw.dur / 2);
  assert.ok(mid.y < groundY, "airborne above the ground line mid-flight");
  assert.ok(mid.x > F.throw.startX && mid.x < F.throw.landX);
  const land = TB.throwArc(F, groundY, F.throw.dur);
  assert.strictEqual(land.x, F.throw.landX);
  assert.ok(Math.abs(land.rot - F.throw.spins * Math.PI * 2) < 1e-9, "rotation completes at touchdown");
  const end = TB.throwArc(F, groundY, F.throw.dur + F.throw.bounceDur);
  assert.strictEqual(end.x, F.throw.landX + F.throw.bounceDX);
  assert.strictEqual(Math.round(end.y), groundY);
  assert.strictEqual(end.done, true);
});

test("gateReached: threshold predicate", () => {
  assert.strictEqual(TB.gateReached(F, F.gate.enterX - 1), false);
  assert.strictEqual(TB.gateReached(F, F.gate.enterX), true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/truckrun.test.js`
Expected: the five new tests FAIL (`F` undefined / `TB.finaleWhite is not a function`); the pre-existing tests still pass.

- [ ] **Step 3: Add the config block**

In `js/config.js`, inside `JH.TRUCKRUN = { … }`, insert after the `cleanBonusTiers` line (before the closing `};`):

```js
    // Gate Crash finale — the authored beat after the Firewall breaks:
    // detonate (growing booms) → whiteout → reveal (cloud walkway) → crash
    // (the empty truck rams the Air World gate) → walk (Jon enters on foot).
    // Screen px / seconds. Spec: docs/superpowers/specs/2026-07-07-gate-crash-finale-design.md
    finale: {
      detonateT: 1.8,                          // s of growing chassis booms
      boomIntStart: 0.30, boomIntEnd: 0.10,    // boom cadence ramp (s between)
      boomScaleStart: 0.5, boomScaleEnd: 1.1,  // boom FX scale ramp
      scrollEase: 0.8,                         // s for road scroll to ease to 0
      whiteRamp: 0.5,                          // s white overlay 0→1
      whiteHold: 0.4,                          // s at full white (restage behind it)
      whiteFade: 1.2,                          // s white 1→0 onto the walkway
      truckStartX: 140,                        // runaway truck screen-x at reveal
      truckSpeed: 200,                         // px/s toward the gate
      gate: { x: 430, enterX: 412, crashPad: 60 }, // arch centre / walk-in x / nose-impact offset
      throw: {                                 // Jon's blast-throw arc
        startX: -16, startY: -30, landX: 110, apex: 70, dur: 1.1,
        spins: 2, bounceDX: 16, bounceH: 12, bounceDur: 0.35,
      },
      standDelay: 0.5,                         // s after the crash before Jon stirs
      standDur: 0.6,                           // s from stir to standing
      walkSpeed: 90,                           // px/s Jon walks the walkway
      walkMinX: 24,                            // left clamp on the walkway
      enterFade: 0.6,                          // s blue-white fade entering the gate
    },
```

- [ ] **Step 4: Add the pure helpers**

In `js/truckrun.balance.js`, add to the `TruckBalance` object (after `gapExists`, before the closing `};`):

```js
    // ---- Gate Crash finale helpers (all numbers from cfg.finale = F) ----

    // Full-screen white alpha across the finale. phase = the scene phase
    // string; t = seconds into that phase. Ramps up during "whiteout"
    // (holding at 1 past the ramp), fades down during "reveal", else 0.
    finaleWhite(F, phase, t) {
      if (phase === "whiteout") return Math.min(1, t / F.whiteRamp);
      if (phase === "reveal") return Math.max(0, 1 - t / F.whiteFade);
      return 0;
    },

    // Detonation boom cadence/scale, linear in progress (clamped 0..1).
    boomInterval(F, prog) {
      const k = Math.max(0, Math.min(1, prog));
      return F.boomIntStart + (F.boomIntEnd - F.boomIntStart) * k;
    },
    boomScale(F, prog) {
      const k = Math.max(0, Math.min(1, prog));
      return F.boomScaleStart + (F.boomScaleEnd - F.boomScaleStart) * k;
    },

    // Jon's blast-throw: a primary ballistic arc (startX/startY-above-ground
    // → landX on the ground line) then one small bounce hop. Screen coords;
    // groundY is the walkway ground line (caller passes feetScreenY of the
    // walk depth). rot spins `spins` full turns over the primary arc, then
    // holds. Returns { x, y, rot, done }.
    throwArc(F, groundY, t) {
      const T = F.throw;
      const k = Math.min(1, t / T.dur);
      if (k < 1) {
        const y0 = groundY + T.startY;
        return {
          x: T.startX + (T.landX - T.startX) * k,
          y: y0 + (groundY - y0) * k - T.apex * 4 * k * (1 - k),
          rot: T.spins * Math.PI * 2 * k,
          done: false,
        };
      }
      const kb = Math.min(1, (t - T.dur) / T.bounceDur);
      return {
        x: T.landX + T.bounceDX * kb,
        y: groundY - T.bounceH * 4 * kb * (1 - kb),
        rot: T.spins * Math.PI * 2,
        done: kb >= 1,
      };
    },

    // Has Jon walked into the gate mouth?
    gateReached(F, x) { return x >= F.gate.enterX; },
```

- [ ] **Step 5: Run the tests**

Run: `node --test tests/truckrun.test.js`
Expected: ALL tests pass (10 pre-existing + 5 new).

Run: `npm test`
Expected: full suite green (~229 tests) — confirms the config edit broke nothing else.

- [ ] **Step 6: Commit**

```bash
git add js/config.js js/truckrun.balance.js tests/truckrun.test.js
git commit -m "feat(truck): Gate Crash finale config block + pure finale math (TDD)"
```

---

### Task 2: Bake the wreck sprite + register the `truckWreck` painter

**Files:**
- Modify: `tools/truck-sprite.mjs` (append a wreck-bake section; extend the header comment)
- Create (baked output): `sprites/firetruck/wreck.png`
- Modify: `js/assets.js` (register `truckWreck` after the `truckBoard` registration, ~line 611) — **DO NOT COMMIT js/assets.js**

**Interfaces:**
- Consumes: `sprites/firetruck/truck-broken.png` (798×778, transparent bg, dark-matte fringe — user-supplied wreck art), the baker's existing `scale` constant (the drive/board union-bbox scale, computed at ~line 146).
- Produces: `sprites/firetruck/wreck.png` (single frame, 4× logical, same px-per-source-px scale as drive/board so the wreck reads as the same truck); `Assets.draw(ctx, "truckWreck", x, y, 1, {})` — draws centered-bottom at natural/4 logical px.

- [ ] **Step 1: Add the dark-matte cleaner + wreck bake to the baker**

In `tools/truck-sprite.mjs`: update the header comment's Sources/Outputs lists to mention `truck-broken.png → wreck.png`. Then append at the END of the file (after the existing `BODIES` bake loop):

```js
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
```

NOTE: the debug branch at ~line 119 currently ends in `process.exit(0)` BEFORE this new code. Move that `process.exit(0)` — the debug block must fall through far enough to also write `_wreck_clean.png`, OR simplest: delete the `process.exit(0)` line and wrap the existing BODIES bake loop (from `function bboxOf` usage down to its final `console.log`) in `if (MODE !== "debug") { … }`. Pick whichever keeps the diff smallest, but `node tools/truck-sprite.mjs debug` must write `_clean.png`, `_debug.png`, AND `_wreck_clean.png` without baking, and plain `node tools/truck-sprite.mjs` must bake `drive.png`, `board.png`, AND `wreck.png`. CAREFUL: `bboxOf` and `scale` are defined in the bake path — the wreck section needs `scale`, so if you gate the BODIES loop, keep the union-bbox/scale computation OUTSIDE the gate.

- [ ] **Step 2: Run the baker**

Run: `node tools/truck-sprite.mjs`
Expected output includes the existing `drive.png` / `board.png` lines PLUS a `sprites/firetruck/wreck.png {"bakedFrame":[W,H],…}` line. The wreck's logicalFrame should be in the same ballpark as the truck (114×80) — the wreck art includes ground debris so a somewhat wider/shorter frame is fine; anything wildly off (e.g. 20px or 400px tall) means the bbox or scale is wrong.

Also run: `node tools/truck-sprite.mjs debug`
Expected: writes `_clean.png`, `_debug.png`, `_wreck_clean.png`.

- [ ] **Step 3: Visually verify the bake**

Use the Read tool on `sprites/firetruck/wreck.png` (it renders as an image). Check: transparent background, no dark crust ring around the silhouette, no stray specks floating in empty space, tires/dark body mass intact (the defringe must NOT have eaten the tire edges). If the crust survives, lower the defringe luma threshold is NOT the fix — raise the pass count to 3 first; if specks survive, raise the component-size floor (60) to 120. Re-run and re-check.

- [ ] **Step 4: Register the `truckWreck` painter**

In `js/assets.js`, directly after the `truckBoard` registration block (ends ~line 611), add:

```js
  // Crashed-truck wreck (Gate Crash finale): single frame, baked at 4x by
  // tools/truck-sprite.mjs at the SAME scale as drive/board. Centered-bottom.
  const _truckWreckImg = JH.Loader.img("sprites/firetruck/wreck.png");
  Assets.register("truckWreck", (p, opt, ctx, x, y, facing) => {
    const img = _truckWreckImg;
    if (!img || !img.complete || !img.naturalWidth) return;
    const dw = Math.round(img.naturalWidth / 4), dh = Math.round(img.naturalHeight / 4);
    ctx.save();
    ctx.translate(x, y);
    if (facing < 0) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -Math.round(dw / 2), -dh, dw, dh);
    ctx.restore();
  });
```

- [ ] **Step 5: Sanity-check the suite**

Run: `npm test`
Expected: green (assets.js isn't under test, but this catches syntax slips in shared files).

- [ ] **Step 6: Commit (tool + sprites ONLY — assets.js stays uncommitted)**

```bash
git add tools/truck-sprite.mjs sprites/firetruck/wreck.png sprites/firetruck/truck-broken.png sprites/firetruck/truck-nowheels.png sprites/firetruck/truck-wheels.png sprites/firetruck/board.png sprites/firetruck/jon-truck-nowheels.png sprites/firetruck/wheels.png sprites/firetruck/drive.png sprites/firetruck/jon-truck.png
git commit -m "feat(art): bake the crashed-truck wreck (dark-matte defringe) + commit pending truck sprite sources"
git status --short
```

Expected `git status` after: `js/assets.js`, `js/truck.js`, `js/game.js`, `js/world.js` still modified-uncommitted; no firetruck sprites listed. (`_clean.png`/`_debug.png`/`_wreck_clean.png`/`_drive4x.png` are debug artifacts — if git lists them, they're missing from `.gitignore`; add a `sprites/firetruck/_*` line to `.gitignore` and include that in the commit.)

---

### Task 3: Finale phase machine + walkway tableau render in `js/truck.js`

**Files:**
- Modify: `js/truck.js` — **DO NOT COMMIT** (playtest-held file; it already carries uncommitted sprite-swap edits. Just edit and leave dirty.)

**Interfaces:**
- Consumes (Task 1): `JH.TRUCKRUN.finale`, `JH.TruckBalance.finaleWhite / boomInterval / boomScale / throwArc / gateReached`. (Task 2): `truckBoard` and `truckWreck` painters; existing `jon` painter (`state: "idle" | "walk" | "death"`, walk `frame` cycles %5, death `frame` clamps 0..7 where 7 = flat on the ground), `A.drawFx(ctx, key, x, y, t, {scale, loop:false})` one-shots (`boom-mid` ≈0.75s, `boom-big` ≈0.86s), `A.shadow(ctx, x, y, r)`, `JH.Geo.feetScreenY(depth, 0)`, `JH.AudioFX.play(name)` with names `blast`, `whack`, `upgrade`.
- Produces: `sc.finale` scene state (shape below) and phases `detonate | whiteout | reveal | crash | walk`, ending in the existing `_finish(game)` → `game.afterTruckRun()`. The `arrive` phase and `ARRIVE_T` are deleted.

`sc.finale` shape (single source of truth for the tableau):
```js
{ t,                 // seconds into the CURRENT finale phase (reset on each transition)
  nextBoom, booms: [{x, y, born, kind, scale}],   // born = sc.t timestamp
  staged,            // walkway tableau initialized (behind the full white)
  truckX, crashed, gateOpen,
  jon: null | { state: "air"|"down"|"stand"|"walk", x, y, rot },
  jonT,              // seconds since the throw started (drives throwArc)
  standT, enterT, walkFrame, walkDist, facing }
```

- [ ] **Step 1: Replace the arrive phase with the finale constants + kill hook**

In `js/truck.js`:

1a. Delete the `const ARRIVE_T = 2.0;` line (~line 18) and add below `INTRO_T`:

```js
  // Gate Crash finale phases (after the Firewall breaks). The road sim is
  // fully off during these; JH.TRUCKRUN.finale carries every number.
  const FINALE_PHASES = { detonate: 1, whiteout: 1, reveal: 1, crash: 1, walk: 1 };
```

1b. In `update()`, delete the whole `else if (sc.phase === "arrive") { … }` branch and insert, right after the `if (sc.bannerT > 0) sc.bannerT -= dt;` line:

```js
      // ---- Gate Crash finale: its own update; road sim + input are off.
      if (FINALE_PHASES[sc.phase]) { this._updateFinale(dt, game, C); return; }
```

(The comment on the phase-machine block above it should now read `intro → run → boss (Firewall) → finale (Gate Crash)`.)

1c. Replace `_breakFirewall` entirely:

```js
    // The kill: the Firewall doesn't despawn — it detonates. Essence banks
    // immediately (the truck never drives past the kill point), input locks,
    // and the finale chain starts: detonate → whiteout → reveal → crash → walk.
    _breakFirewall() {
      const sc = this.scene, C = JH.TRUCKRUN, fw = sc.firewall;
      fw.dying = true; fw.surge = null; fw.slamState = null; fw.wsState = "closed";
      sc.essence += C.firewall.essence;
      if (JH.Church && JH.Church.addEssence) JH.Church.addEssence(C.firewall.essence);
      sc.firewallDone = true;
      sc.shakeT = 0.5;
      sc.phase = "detonate";
      sc.finale = {
        t: 0, nextBoom: 0, booms: [], staged: false,
        truckX: 0, crashed: false, gateOpen: false,
        jon: null, jonT: 0, standT: 0, enterT: 0,
        walkFrame: 0, walkDist: 0, facing: 1,
      };
      this._flash("FIREWALL DOWN!", 2.0);
      if (JH.AudioFX && JH.AudioFX.play) JH.AudioFX.play("blast");
    },
```

- [ ] **Step 2: Add the finale update machine**

Add these methods after `_breakFirewall` (before the `// ---- essence pickups` section):

```js
    // ---- Gate Crash finale update -----------------------------------------
    _walkGroundY() { return JH.Geo.feetScreenY(JH.DEPTH_MAX * 0.5, 0); },

    _updateFinale(dt, game, C) {
      const sc = this.scene, F = C.finale, fin = sc.finale, TB = JH.TruckBalance;
      fin.t += dt;
      if (sc.shakeT > 0) sc.shakeT -= dt;

      if (sc.phase === "detonate") {
        // Road scroll eases to a stop while the chassis cooks off.
        sc.speedMult = Math.max(0, 1 - fin.t / F.scrollEase);
        sc.scrollX += C.scrollSpeed * sc.speedMult * dt;
        JH.Camera.x = Math.min(JH.LEVEL_LEN - JH.VIEW_W, sc.camX0 + sc.scrollX * 0.12);
        const prog = fin.t / F.detonateT;
        if ((fin.nextBoom -= dt) <= 0) {
          fin.nextBoom = TB.boomInterval(F, prog);
          fin.booms.push({
            x: sc.firewall.screenX + Math.random() * 70,
            y: JH.Geo.feetScreenY(JH.DEPTH_MAX, 0) - Math.random() * 150,
            born: sc.t, kind: "boom-mid", scale: TB.boomScale(F, prog),
          });
          sc.shakeT = Math.max(sc.shakeT, 0.15 + 0.3 * prog);
          if (JH.AudioFX && JH.AudioFX.play) JH.AudioFX.play("blast");
        }
        if (fin.t >= F.detonateT) {
          sc.phase = "whiteout"; fin.t = 0;
          fin.booms.push({
            x: sc.firewall.screenX + 30, y: this._walkGroundY() - 60,
            born: sc.t, kind: "boom-big", scale: 1.6,
          });
          sc.shakeT = 0.6;
          if (JH.AudioFX && JH.AudioFX.play) JH.AudioFX.play("blast");
        }
      } else if (sc.phase === "whiteout") {
        if (!fin.staged && fin.t >= F.whiteRamp) this._stageWalkway(C);
        if (fin.t >= F.whiteRamp + F.whiteHold) { sc.phase = "reveal"; fin.t = 0; }
      } else if (sc.phase === "reveal") {
        this._advanceWalkwayActors(dt, C);
      } else if (sc.phase === "crash") {
        this._advanceWalkwayActors(dt, C);   // Jon may still be bouncing in
        if (fin.jon.state === "down" && fin.t >= F.standDelay) {
          fin.standT += dt;
          if (fin.standT >= F.standDur) {
            fin.jon.state = "stand";
            sc.phase = "walk"; fin.t = 0;
            this._flash("WALK ON →", 3.0);
          }
        }
      } else if (sc.phase === "walk") {
        this._walkJon(dt, game, C);
        if (!this.scene) return;             // _finish() tears the scene down
      }

      fin.booms = fin.booms.filter((b) => sc.t - b.born < 0.9);
    },

    // Restaged behind the full white: the road becomes the walkway tableau.
    _stageWalkway(C) {
      const sc = this.scene, F = C.finale, fin = sc.finale;
      fin.staged = true;
      sc.hazards = []; sc.firePatches = []; sc.embers = []; sc.spray = [];
      sc.pickups = []; sc.washFx = null; sc.firewall = null;
      fin.truckX = F.truckStartX;
      fin.jon = { state: "air", x: F.throw.startX, y: 0, rot: 0 };
      fin.jonT = 0;
    },

    // Reveal/crash actors: Jon's blast-throw arc + the runaway truck.
    _advanceWalkwayActors(dt, C) {
      const sc = this.scene, F = C.finale, fin = sc.finale, TB = JH.TruckBalance;
      if (fin.jon.state === "air") {
        fin.jonT += dt;
        const a = TB.throwArc(F, this._walkGroundY(), fin.jonT);
        fin.jon.x = a.x; fin.jon.y = a.y; fin.jon.rot = a.rot;
        if (a.done) {
          fin.jon.state = "down"; fin.jon.rot = 0;
          if (JH.AudioFX && JH.AudioFX.play) JH.AudioFX.play("whack");
        }
      }
      if (!fin.crashed) {
        fin.truckX += F.truckSpeed * dt;
        if (fin.truckX >= F.gate.x - F.gate.crashPad) {
          fin.crashed = true; fin.gateOpen = true;
          sc.phase = "crash"; fin.t = 0; fin.standT = 0;
          const gy = this._walkGroundY();
          for (let i = 0; i < 3; i++) fin.booms.push({
            x: F.gate.x - F.gate.crashPad + 10 + Math.random() * 40,
            y: gy - 20 - Math.random() * 60,
            born: sc.t + i * 0.08, kind: "boom-big", scale: 1 + Math.random() * 0.4,
          });
          sc.shakeT = 0.6;
          if (JH.AudioFX && JH.AudioFX.play) JH.AudioFX.play("blast");
        }
      }
    },

    // Player-controlled walk to the gate; contact with the gate mouth enters.
    _walkJon(dt, game, C) {
      const sc = this.scene, F = C.finale, fin = sc.finale, In = JH.Input;
      if (fin.enterT > 0) {
        fin.enterT += dt;
        if (fin.enterT >= F.enterFade) this._finish(game);
        return;
      }
      const mx = (In.held("right") ? 1 : 0) - (In.held("left") ? 1 : 0);
      if (mx !== 0) {
        fin.jon.x = Math.max(F.walkMinX, fin.jon.x + mx * F.walkSpeed * dt);
        fin.facing = mx;
        fin.walkDist += Math.abs(mx) * F.walkSpeed * dt;
        fin.walkFrame = Math.floor(fin.walkDist / 8);
        fin.jon.state = "walk";
      } else fin.jon.state = "stand";
      if (JH.TruckBalance.gateReached(F, fin.jon.x)) {
        fin.enterT = 0.0001;
        if (JH.AudioFX && JH.AudioFX.play) JH.AudioFX.play("upgrade");
      }
    },
```

- [ ] **Step 3: Wire the render — fork, booms, white overlay, HUD gating**

In `renderScene(ctx, game)`:

3a. Right after the shake block (the `ctx.translate` for `sc.shakeT`), add the walkway fork:

```js
      // ---- Gate Crash walkway phases render their own tableau.
      if (sc.phase === "reveal" || sc.phase === "crash" || sc.phase === "walk") {
        this._renderWalkway(ctx, sc, C);
        // Enter-the-gate fade (blue-white) rides on top of the tableau.
        if (sc.finale.enterT > 0) {
          const k = Math.min(1, sc.finale.enterT / C.finale.enterFade);
          ctx.fillStyle = "rgba(214,235,255," + k + ")";
          ctx.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H);
        }
        // White-in: the whiteout keeps fading as the reveal starts.
        const wA = JH.TruckBalance.finaleWhite(C.finale, sc.phase, sc.finale.t);
        if (wA > 0) { ctx.fillStyle = "rgba(255,255,255," + wA + ")"; ctx.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H); }
        if (sc.bannerT > 0 && sc.banner) {
          ctx.fillStyle = "#fff"; ctx.font = "bold 16px monospace"; ctx.textAlign = "center";
          ctx.fillText(sc.banner, JH.VIEW_W / 2, 40); ctx.textAlign = "left";
        }
        return;
      }
```

3b. In the Firewall render block, skip the boss HP bar while it's dying: wrap the HP-bar lines (from `const bw = 160 …` through the `ctx.textAlign = "left";` that follows them) in `if (!fw.dying) { … }`.

3c. After the Firewall block's closing brace (before the `// Essence crosses` comment), add the detonation booms:

```js
      // Gate Crash detonation booms — one-shot FX strips at screen points.
      if (sc.finale) for (const b of sc.finale.booms)
        if (sc.t - b.born >= 0)
          A.drawFx(ctx, b.kind, b.x, b.y, sc.t - b.born, { scale: b.scale, loop: false });
```

3d. Gate the HP/water bars (truck HUD hides from the whiteout on). Replace the two `this._bar(…)` lines with:

```js
      // HP + water bars (honest, visible) — hidden once the whiteout begins.
      if (sc.phase !== "whiteout") {
        this._bar(ctx, 8, 8, 90, t.hp / C.truckHp, "#e74c3c", "HP");
        this._bar(ctx, 8, 20, 90, t.water / C.tank, "#4aa3ff", "H2O");
      }
```

3e. At the END of `renderScene` (after the banner block), add the whiteout overlay:

```js
      // Full-screen white — the explosion whiteout (road phases only; the
      // walkway fork above handles its own white-in).
      if (sc.finale) {
        const wA = JH.TruckBalance.finaleWhite(C.finale, sc.phase, sc.finale.t);
        if (wA > 0) { ctx.fillStyle = "rgba(255,255,255," + wA + ")"; ctx.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H); }
      }
```

- [ ] **Step 4: Add the walkway tableau renderer**

Add `_renderWalkway` as a new method after `renderScene` (before `_bar`):

```js
    // ---- the Gate Crash tableau: pale Air World sky, cloud-lined walkway,
    // Firewall rubble (left), the Air World gate (right). One 480px screen;
    // everything anchors to the walk ground line (former truck lane).
    _renderWalkway(ctx, sc, C) {
      const F = C.finale, fin = sc.finale, A = JH.Assets, P = JH.PAL;
      const W = JH.VIEW_W, H = JH.VIEW_H, gy = this._walkGroundY();

      // Sky — soft dawn gradient + sun glow. Deliberately NOT the fire world.
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#8fb8e8"); sky.addColorStop(0.55, "#cfe0f2"); sky.addColorStop(1, "#f2ead8");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      const sun = ctx.createRadialGradient(W * 0.78, 40, 4, W * 0.78, 40, 90);
      sun.addColorStop(0, "rgba(255,244,214,0.9)"); sun.addColorStop(1, "rgba(255,244,214,0)");
      ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);

      // Distant cloud banks, drifting slowly.
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      for (let i = 0; i < 5; i++) {
        const cx = ((i * 113 + sc.t * 3) % (W + 120)) - 60, cy = 60 + (i % 3) * 26;
        ctx.beginPath(); ctx.ellipse(cx, cy, 46, 10, 0, 0, Math.PI * 2); ctx.fill();
      }

      // The walkway: a bright cloud deck where the road was; haze below.
      ctx.fillStyle = "#b8cbe0"; ctx.fillRect(0, gy + 18, W, H - gy - 18);
      ctx.fillStyle = "#eef3fa"; ctx.fillRect(0, gy - 26, W, 44);
      ctx.fillStyle = "rgba(160,180,205,0.5)"; ctx.fillRect(0, gy + 14, W, 4);

      // Cloud puffs lining both edges (deterministic per index, gentle bob).
      for (let i = 0; i < 16; i++) {
        const px = (i * 63 + 17) % (W + 40) - 20;
        const top = i % 2 === 0;
        const py = (top ? gy - 26 : gy + 20) + Math.sin(sc.t * 0.8 + i * 1.7) * 1.5;
        const r = 10 + (i * 7) % 9;
        ctx.fillStyle = top ? "rgba(255,255,255,0.92)" : "rgba(244,248,255,0.95)";
        ctx.beginPath();
        ctx.ellipse(px, py, r, r * 0.55, 0, 0, Math.PI * 2);
        ctx.ellipse(px + r * 0.7, py + 2, r * 0.7, r * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Firewall rubble — charred chassis chunks (wallboss palette) + smoke.
      ctx.fillStyle = P.wallbossDk;
      ctx.fillRect(0, gy - 34, 26, 48); ctx.fillRect(14, gy - 12, 30, 26);
      ctx.fillStyle = P.wallboss;
      ctx.fillRect(4, gy - 28, 14, 10); ctx.fillRect(24, gy - 6, 16, 8);
      ctx.fillStyle = P.wallbossHi; ctx.fillRect(6, gy - 30, 10, 2);
      for (let i = 0; i < 3; i++) {
        const k = (sc.t * 0.35 + i * 0.33) % 1;
        ctx.fillStyle = "rgba(90,90,100," + (0.35 * (1 - k)) + ")";
        ctx.beginPath(); ctx.ellipse(18 + i * 9, gy - 30 - k * 34, 5 + k * 7, 4 + k * 5, 0, 0, Math.PI * 2); ctx.fill();
      }

      // The Air World gate — marble arch + doors; blown open after the crash.
      const gx = F.gate.x;
      ctx.fillStyle = "#dfe6f0";
      ctx.fillRect(gx - 34, gy - 96, 12, 100); ctx.fillRect(gx + 22, gy - 96, 12, 100);
      ctx.fillStyle = "#c8d2e2";
      ctx.fillRect(gx - 34, gy - 96, 12, 4); ctx.fillRect(gx + 22, gy - 96, 12, 4);
      ctx.beginPath(); ctx.arc(gx, gy - 92, 34, Math.PI, 0);
      ctx.lineWidth = 10; ctx.strokeStyle = "#dfe6f0"; ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = "#aab6c8"; ctx.stroke();
      if (!fin.gateOpen) {
        ctx.fillStyle = "#9fb3cc";
        ctx.fillRect(gx - 22, gy - 88, 21, 92); ctx.fillRect(gx + 1, gy - 88, 21, 92);
        ctx.fillStyle = "#8aa0bc"; ctx.fillRect(gx - 3, gy - 88, 2, 92);
      } else {
        // Portal glow inside + the doors blown flat onto the deck.
        A.drawFx(ctx, "portal", gx, gy + 2, sc.t, { scale: 1.4 });
        ctx.fillStyle = "#9fb3cc";
        ctx.fillRect(gx - 60, gy - 2, 24, 6); ctx.fillRect(gx + 38, gy, 22, 5);
      }

      // The runaway truck (empty cab), or its wreck at the gate's foot.
      if (!fin.crashed) {
        A.shadow(ctx, fin.truckX, gy, 26);
        A.draw(ctx, "truckBoard", fin.truckX, gy, 1, { frame: Math.floor(fin.truckX / DRIVE_STEP) });
      } else {
        const wx = F.gate.x - F.gate.crashPad;
        A.shadow(ctx, wx, gy, 26);
        A.draw(ctx, "truckWreck", wx, gy, 1, {});
        A.drawFx(ctx, "fire-small", wx - 18, gy - 30, sc.t, { scale: 0.4 });
        A.drawFx(ctx, "fire-small", wx + 22, gy - 44, sc.t + 0.4, { scale: 0.35 });
        for (let i = 0; i < 3; i++) {
          const k = (sc.t * 0.3 + i * 0.33) % 1;
          ctx.fillStyle = "rgba(70,70,80," + (0.4 * (1 - k)) + ")";
          ctx.beginPath(); ctx.ellipse(wx + 8 + i * 7, gy - 60 - k * 40, 6 + k * 8, 5 + k * 6, 0, 0, Math.PI * 2); ctx.fill();
        }
      }

      // Jon: blast-thrown (spinning), face-down (death sheet frame 7; the
      // stand-up plays it BACKWARD), standing, or walking.
      const j = fin.jon;
      if (j) {
        if (j.state === "air") {
          ctx.save(); ctx.translate(j.x, j.y - 26); ctx.rotate(j.rot);
          A.draw(ctx, "jon", 0, 26, 1, { state: "idle" });
          ctx.restore();
        } else if (j.state === "down") {
          const df = fin.standT > 0
            ? Math.max(0, Math.round(7 * (1 - fin.standT / F.standDur))) : 7;
          A.draw(ctx, "jon", j.x, gy, 1, { state: "death", frame: df });
        } else {
          A.shadow(ctx, j.x, gy, 10);
          A.draw(ctx, "jon", j.x, gy, fin.facing, j.state === "walk"
            ? { state: "walk", frame: fin.walkFrame } : { state: "idle" });
        }
      }

      // Crash booms ride on the tableau.
      for (const b of fin.booms)
        if (sc.t - b.born >= 0)
          A.drawFx(ctx, b.kind, b.x, b.y, sc.t - b.born, { scale: b.scale, loop: false });
    },
```

- [ ] **Step 5: Full test suite**

Run: `npm test`
Expected: green. (truck.js isn't directly under node:test, but the suite catches config/balance regressions and any accidental shared-file breakage.)

- [ ] **Step 6: Headless state verification (invoke the `headless-playtest` skill)**

Invoke the **`headless-playtest` project skill** and follow its harness pattern. Restart `npm run dev` first. Boot with `?truck=1`. Drive the finale by page-eval fast-forward (check `js/input.js` for the actual key bound to `spray` before scripting):

```js
// 1. Fast-forward to the boss:
await page.evaluate(() => { JH.TruckRun.scene.t = JH.TRUCKRUN.firewall.atSec; });
// wait ~200ms → firewall spawns, phase === "boss"
// 2. Rig the kill: weak spot open + on-lane + 1 hp:
await page.evaluate(() => {
  const sc = JH.TruckRun.scene, fw = sc.firewall;
  fw.hp = 1; fw.wsState = "open"; fw.wsT = 99; fw.wsDepth = sc.truck.depth;
});
// 3. Hold the spray key ~300ms (real key hold, per the skill's gotchas).
// 4. Poll phases with a timeout, in order:
//    detonate → whiteout → reveal → crash → walk  (each within ~4s)
//    e.g. await page.waitForFunction(`JH.TruckRun.scene && JH.TruckRun.scene.phase === "detonate"`, {timeout: 4000})
// 5. In walk: hold ArrowRight for ~4s (Jon covers ~300px at walkSpeed 90 —
//    keep re-holding in ~500ms pulses per the skill's input gotchas).
// 6. Assert the run ended: JH.TruckRun.scene === null and the game left the
//    truck state (win stub reached via afterTruckRun).
```

Also assert during detonate: `scene.finale.booms.length > 0`, input lock (`scene.truck.spraying` stays false after step 3's key release... simply assert `scene.phase` never regresses), and essence banked: capture `scene.essence` before the kill and assert it grew by `JH.TRUCKRUN.firewall.essence` immediately at detonate start.

Expected: every phase reached in order; scene torn down at the end; **zero console errors** (capture page console — a missing painter or NaN typically shows there).

- [ ] **Step 7: Screenshot spot-check**

Same harness: capture screenshots at (a) mid-detonate, (b) full white, (c) mid-reveal (Jon airborne + truck racing), (d) crash (wreck + open gate + portal glow), (e) walk (Jon walking, "WALK ON →"). Read each image and check: booms visibly grow on the Firewall; the reveal shows pale sky / cloud deck / rubble / gate (NO fire-world skyline, NO road HUD bars); Jon rotates in the air shot; the wreck sits at the gate's foot; the portal glow renders. Fix what's visibly wrong (positions/z-order), re-shoot.

- [ ] **Step 8: Do NOT commit**

`js/truck.js` stays uncommitted (playtest gate). Confirm: `git status --short` shows `M js/truck.js`, `M js/assets.js`, and nothing staged.

---

### Task 4: End-to-end verification pass + screenshot pack + docs

**Files:**
- Modify: `docs/superpowers/plans/2026-07-07-fire-truck-art-handoff.md` (status update)
- Modify: `.superpowers/sdd/progress.md` (ledger)

**Interfaces:**
- Consumes: everything above, complete and headless-verified per task.
- Produces: an end-to-end proof (real fight → finale → win stub, no rigged phases except the boss fast-forward), a screenshot pack for the user's playtest review, updated docs. No new code.

- [ ] **Step 1: Full suite once more**

Run: `npm test`
Expected: green (~229 tests).

- [ ] **Step 2: End-to-end headless run**

Invoke the **`headless-playtest` skill** again. This time play it straighter: boot `?truck=1`, fast-forward `scene.t` to the boss, then actually FIGHT the Firewall with held keys (line up depth with `fw.wsDepth` via up/down holds, hold spray while `wsState === "open"`; rig nothing but the fast-forward — if the fight drags past ~90s of wall-time, cut `fw.hp` to 200 and note that in the report). Then let the whole finale play WITHOUT page-eval interference, walk Jon in with held ArrowRight, and assert the win stub is reached. Capture the full console log; expected: no errors.

- [ ] **Step 3: Screenshot pack for the user**

Re-run capturing 6-8 stills across the beat (detonate early/late, whiteout, reveal early/late, crash, walk, enter-fade). Save them under the session scratchpad and present them in the final report so the user can eyeball the tableau before playtesting.

- [ ] **Step 4: Update the docs**

In `docs/superpowers/plans/2026-07-07-fire-truck-art-handoff.md`: mark §3's sprite work done (it was finished before this plan), and add a short §5 noting the Gate Crash finale is implemented per this plan + spec, held uncommitted in `js/truck.js` / `js/assets.js` for the playtest gate. Update `.superpowers/sdd/progress.md` with this plan's task states.

- [ ] **Step 5: Commit docs only**

```bash
git add docs/superpowers/plans/2026-07-07-fire-truck-art-handoff.md .superpowers/sdd/progress.md
git commit -m "docs: Gate Crash finale built + headless-verified; held for playtest"
git status --short
```

Expected after: only `js/truck.js`, `js/assets.js`, `js/game.js`, `js/world.js` dirty.

- [ ] **Step 6: Report to the user**

Summarize: what was built, the headless evidence (phases reached, console clean, suite count), the screenshots, and that everything feel-bearing is UNCOMMITTED awaiting their playtest. Do not merge, do not release — the user plays first.
