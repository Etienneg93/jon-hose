# Player Death Ghost Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the player death sequence so the corpse lingers on its final collapsed
frame, stays visible on the ground for the whole sequence, and the cyan ghost
materializes out of it, rises off it still in the collapsed pose, visibly stands up
(death.png frames played in reverse), then drifts/beams upward and fades — instead of
today's instant pop-in of an unrelated idle sprite.

**Architecture:** Three new pure functions in `js/church.js` (`deathCorpseFrame`,
`deathGhostState`, `deathScreenFadeAlpha`) take elapsed time `t` and a `deathSeq` timing
config object and return the frame/position/alpha to draw — no canvas/DOM access, fully
unit-testable with `node:test`. `js/game.js`'s `render()` calls these three functions and
does only the `ctx.drawImage`/`ctx.save`/`ctx.restore` work. `js/config.js`'s
`JH.CHURCH.deathSeq` becomes the single source of truth for every duration (previously
declared there but ignored — game.js hardcoded its own literals).

**Tech Stack:** Vanilla JS, `node:test` + `node:assert` (see `tests/church.test.js` for
the existing pattern), Canvas 2D (`ctx.filter`, `ctx.globalAlpha`).

## Global Constraints

- `js/church.js` must stay dual-exported (`module.exports` for `node:test`, `root.JH.Church`
  for the browser) and must not touch `window`/DOM at module load — match the existing
  pattern in the file (see header comment at `js/church.js:1-10`).
- New pure functions take their timing config as a parameter (do not reach for
  `JH.CHURCH` global) so they're testable with a plain object literal, matching how
  `deathCorpseFrame`/`deathGhostState`/`deathScreenFadeAlpha` are specified below.
- No new sprite assets — every visual reuses `sprites/jon/death.png` (8 frames, 146x240
  each) via the existing `JH.Assets.draw(ctx, "jon", x, y, facing, { state: "death", frame })`
  path (`js/assets.js:327-344`).
- Run `npm test` after every task that touches `js/church.js`.

---

### Task 1: Pure timing functions in church.js (TDD)

**Files:**
- Modify: `js/church.js` (add 3 functions + register on the `Church` object)
- Test: `tests/church.test.js` (append new tests)

**Interfaces:**
- Produces: `Church.deathCorpseFrame(t, ds)` → integer 0-7
- Produces: `Church.deathGhostState(t, ds)` → `null` (ghost not yet started) or
  `{ frame: 0-7, riseY: number, alpha: number (0-1) }`
- Produces: `Church.deathScreenFadeAlpha(t, ds)` → number 0-1
- `ds` shape (a plain object, matches what Task 2 will put in `JH.CHURCH.deathSeq`):
  ```js
  {
    fallEnd: 0.6, lingerDur: 0.4, riseDur: 0.35, materializeDur: 0.15,
    standDur: 0.45, driftDur: 0.3, beamFadeDur: 0.4, screenFadeDelay: 0.3,
    screenFadeDur: 0.7, riseHeight: 16, ghostAlphaMax: 0.82, total: 3.2,
  }
  ```

- [ ] **Step 1: Write the failing tests**

Append to `tests/church.test.js` (after the existing tests, before any trailing code —
check the file currently ends around the `sanitize`/`Mirror` test block; add at the very
end of the file):

```js
const DS = {
  fallEnd: 0.6, lingerDur: 0.4, riseDur: 0.35, materializeDur: 0.15,
  standDur: 0.45, driftDur: 0.3, beamFadeDur: 0.4, screenFadeDelay: 0.3,
  screenFadeDur: 0.7, riseHeight: 16, ghostAlphaMax: 0.82, total: 3.2,
};
const approx = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !== ${b}`);

test("deathCorpseFrame plays 0->7 over fallEnd, then holds on 7 for the rest of the sequence", () => {
  assert.strictEqual(Church.deathCorpseFrame(0, DS), 0);
  assert.strictEqual(Church.deathCorpseFrame(0.3, DS), 4);     // 0.3/0.6*8 = 4
  assert.strictEqual(Church.deathCorpseFrame(0.6, DS), 7);     // settled
  assert.strictEqual(Church.deathCorpseFrame(1.0, DS), 7);     // linger
  assert.strictEqual(Church.deathCorpseFrame(3.0, DS), 7);     // corpse stays put till the end
});

test("deathGhostState is null until the corpse has settled and lingered", () => {
  assert.strictEqual(Church.deathGhostState(0.5, DS), null);   // mid-collapse
  assert.strictEqual(Church.deathGhostState(1.0, DS), null);   // exactly ghostStart (0.6+0.4)
});

test("deathGhostState rise-out phase: still frame 7, rises out of the corpse, fades in", () => {
  const s = Church.deathGhostState(1.05, DS);                  // 0.05s into riseDur (0.35)
  assert.strictEqual(s.frame, 7);
  approx(s.riseY, (0.05 / 0.35) * 16);
  approx(s.alpha, Math.min(1, 0.05 / 0.15) * 0.82);
});

test("deathGhostState rise-out -> stand-up boundary is continuous (no visual pop)", () => {
  const end = Church.deathGhostState(1.35, DS);                // riseEnd = 1.0+0.35
  assert.strictEqual(end.frame, 7);
  approx(end.riseY, 16);
  approx(end.alpha, 0.82);
});

test("deathGhostState stand-up phase: frame counts 7->0, holds at riseHeight", () => {
  const mid = Church.deathGhostState(1.575, DS);               // halfway through standDur (0.45)
  assert.strictEqual(mid.frame, 3);                            // step = floor(0.5*8) = 4 -> 7-4=3
  approx(mid.riseY, 16);
  approx(mid.alpha, 0.82);
});

test("deathGhostState stand-up -> ascend boundary is continuous", () => {
  const end = Church.deathGhostState(1.8, DS);                 // standEnd = 1.35+0.45
  assert.strictEqual(end.frame, 0);
  approx(end.riseY, 16);
  approx(end.alpha, 0.82);
});

test("deathGhostState ascend phase: slow drift then accelerating beam, fading out", () => {
  const slow = Church.deathGhostState(2.1, DS);                // beamStart, at=driftDur=0.3
  assert.strictEqual(slow.frame, 0);
  approx(slow.riseY, 16 + 0.3 * 28);
  approx(slow.alpha, 0.82);

  const mid = Church.deathGhostState(2.4, DS);                 // at=0.6
  approx(mid.riseY, 16 + 0.3 * 28 + Math.pow(0.3, 2) * 480);
  approx(mid.alpha, Math.max(0, 1 - 0.3 / 0.4) * 0.82);

  const gone = Church.deathGhostState(2.7, DS);                // at=0.9, fully faded
  approx(gone.alpha, 0);
});

test("deathScreenFadeAlpha stays 0 until fadeStart, then ramps to 1 over screenFadeDur", () => {
  assert.strictEqual(Church.deathScreenFadeAlpha(2.0, DS), 0);
  assert.strictEqual(Church.deathScreenFadeAlpha(2.4, DS), 0);  // fadeStart = 2.1+0.3
  approx(Church.deathScreenFadeAlpha(2.75, DS), 0.5);
  assert.strictEqual(Church.deathScreenFadeAlpha(3.5, DS), 1);  // clamped
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: failures referencing `Church.deathCorpseFrame is not a function` (and similarly
for the other two) — the existing tests in the file should still pass.

- [ ] **Step 3: Implement the three functions**

In `js/church.js`, add these three functions after `fatherFootDepth` (around line 30,
before `wrapText`):

```js
  // ---- Player death sequence (pure timing -> {frame, riseY, alpha}) ----
  // `ds` is JH.CHURCH.deathSeq (or an equivalent object) — passed in rather than
  // read from a global so this stays testable without a DOM/window.

  function deathCorpseFrame(t, ds) {
    if (t < ds.fallEnd) return Math.max(0, Math.min(7, Math.floor((t / ds.fallEnd) * 8)));
    return 7; // settled: corpse stays on the ground for the rest of the sequence
  }

  function deathGhostState(t, ds) {
    const ghostStart = ds.fallEnd + ds.lingerDur;
    if (t <= ghostStart) return null;

    const riseEnd = ghostStart + ds.riseDur;
    const standEnd = riseEnd + ds.standDur;
    const alphaMax = ds.ghostAlphaMax;

    if (t <= riseEnd) {
      // Still in the corpse's final (kneeling) pose, lifting straight up out of it.
      const gt = t - ghostStart;
      const k = gt / ds.riseDur;
      return { frame: 7, riseY: k * ds.riseHeight, alpha: Math.min(1, gt / ds.materializeDur) * alphaMax };
    }
    if (t <= standEnd) {
      // Hovering at riseHeight, playing the collapse frames in reverse (7 -> 0).
      const k = (t - riseEnd) / ds.standDur;
      const step = Math.min(7, Math.floor(k * 8));
      return { frame: 7 - step, riseY: ds.riseHeight, alpha: alphaMax };
    }
    // Standing (frame 0): slow drift, then an accelerating beam upward, fading out.
    const at = t - standEnd;
    const extraRise = at <= ds.driftDur
      ? at * 28
      : ds.driftDur * 28 + Math.pow(at - ds.driftDur, 2) * 480;
    const alpha = Math.max(0, 1 - Math.max(0, at - ds.driftDur) / ds.beamFadeDur) * alphaMax;
    return { frame: 0, riseY: ds.riseHeight + extraRise, alpha };
  }

  function deathScreenFadeAlpha(t, ds) {
    const standEnd = ds.fallEnd + ds.lingerDur + ds.riseDur + ds.standDur;
    const beamStart = standEnd + ds.driftDur;
    const fadeStart = beamStart + ds.screenFadeDelay;
    if (t <= fadeStart) return 0;
    return Math.min(1, (t - fadeStart) / ds.screenFadeDur);
  }
```

Then register them on the `Church` object — in `js/church.js` find the object literal
starting `const Church = {` (around line 98) and add the three names next to the existing
`defaults,` / `sanitize,` shorthand entries:

```js
  const Church = {
    KEY,
    state: defaults(),
    defaults,
    sanitize,
    deathCorpseFrame,
    deathGhostState,
    deathScreenFadeAlpha,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all new tests plus the existing church/balance tests green.

- [ ] **Step 5: Commit**

```bash
git add js/church.js tests/church.test.js
git commit -m "feat(church): pure timing functions for the player death/ghost sequence"
```

---

### Task 2: Update `JH.CHURCH.deathSeq` config

**Files:**
- Modify: `js/config.js:195-197`

**Interfaces:**
- Consumes: nothing (data only)
- Produces: `JH.CHURCH.deathSeq` object matching the `ds` shape from Task 1, which Task 3
  passes into `Church.deathCorpseFrame` / `deathGhostState` / `deathScreenFadeAlpha`.

- [ ] **Step 1: Replace the deathSeq line**

In `js/config.js`, replace:

```js
    \ Death-sequence timeline (seconds): collapse -> fade -> spirit -> Church.
    deathSeq: { whitenEnd: 0.6, ghostStart: 0.5, beamStart: 1.3, fadeStart: 1.6, total: 2.4 },
```

with:

```js
    // Player death/ghost sequence (seconds) — durations of each phase, consumed by
    // Church.deathCorpseFrame / deathGhostState / deathScreenFadeAlpha (church.js).
    deathSeq: {
      fallEnd: 0.6,          // corpse collapses, frames 0->7
      lingerDur: 0.4,        // corpse holds on frame 7 before the ghost stirs
      riseDur: 0.35,         // ghost lifts out of the corpse, still in the collapsed pose
      materializeDur: 0.15,  // ghost alpha ramp-in, within riseDur
      standDur: 0.45,        // ghost plays frames 7->0 (reverse), standing up while hovering
      driftDur: 0.3,         // slow upward drift once standing, before the beam accelerates
      beamFadeDur: 0.4,      // ghost alpha fades out over this long once the beam starts
      screenFadeDelay: 0.3,  // gap between beam start and the screen starting to fade
      screenFadeDur: 0.7,    // screen fade-to-black duration
      riseHeight: 16,        // px the ghost lifts above the corpse before standing
      ghostAlphaMax: 0.82,   // ghost's peak opacity
      total: 3.2,            // whole sequence length; updatePlayerDeathSeq exits the Church at this point
    },
```

- [ ] **Step 2: Sanity-check the file still loads**

Run: `node -e "global.window = {}; require('./js/config.js'); console.log(typeof window.JH)"`
Expected: prints `object` (no syntax errors). Note `config.js` is browser-only (assigns to
`window.JH`), so this is just a load/syntax smoke test, not a real require of the module.

- [ ] **Step 3: Commit**

```bash
git add js/config.js
git commit -m "feat(church): expand deathSeq config for the ghost rework"
```

---

### Task 3: Wire game.js's render() to the new functions

**Files:**
- Modify: `js/game.js:1004-1012` (corpse draw block)
- Modify: `js/game.js:1054-1082` (ghost overlay + screen fade block)

**Interfaces:**
- Consumes: `Church.deathCorpseFrame(t, ds)`, `Church.deathGhostState(t, ds)`,
  `Church.deathScreenFadeAlpha(t, ds)` from Task 1; `JH.CHURCH.deathSeq` from Task 2.
- Produces: nothing further downstream (this is the leaf render call).

- [ ] **Step 1: Replace the corpse draw block**

In `js/game.js`, replace lines 1004-1012:

```js
          if (e === this.player && this.state === "playerDeathSeq") {
            // Death sheet (8 frames) plays out over the first 0.6s, then the
            // body is gone — only the rising ghost remains (drawn in overlay).
            const t = this.deathSeqT;
            if (t < 0.6) {
              const df = Math.min(7, Math.floor((t / 0.6) * 8));
              JH.Assets.shadow(ctx, this.deathSx, this.deathSy, this.player.stats.bodyW * 0.7);
              JH.Assets.draw(ctx, "jon", this.deathSx, this.deathSy, this.deathFacing, { state: "death", frame: df });
            }
          } else if (e.dying) {
```

with:

```js
          if (e === this.player && this.state === "playerDeathSeq") {
            // Corpse: collapses (frames 0->7), then stays on the ground for the
            // rest of the sequence while the ghost (drawn in the overlay below)
            // rises out of it.
            const df = JH.Church.deathCorpseFrame(this.deathSeqT, JH.CHURCH.deathSeq);
            JH.Assets.shadow(ctx, this.deathSx, this.deathSy, this.player.stats.bodyW * 0.7);
            JH.Assets.draw(ctx, "jon", this.deathSx, this.deathSy, this.deathFacing, { state: "death", frame: df });
          } else if (e.dying) {
```

- [ ] **Step 2: Replace the ghost overlay + screen fade block**

In `js/game.js`, replace lines 1054-1082:

```js
      // Player death sequence: body whitens → cyan ghost rises → beams off → fade to black.
      if (this.state === "playerDeathSeq") {
        const t = this.deathSeqT, ctx2 = this.ctx;
        const sx = this.deathSx, sy = this.deathSy, facing = this.deathFacing;

        // Ghost: starts rising at 0.5s, slow float then snaps into a beam.
        if (t > 0.5) {
          const ft = t - 0.5;
          const slowEnd = 0.8;   // seconds of slow drift
          let rise = ft <= slowEnd
            ? ft * 28                                      // slow: 28 px/s
            : slowEnd * 28 + Math.pow(ft - slowEnd, 2) * 480; // accelerating beam
          const ghostAlpha = Math.max(0, 1 - Math.max(0, ft - slowEnd) / 0.4);
          if (ghostAlpha > 0) {
            ctx2.save();
            ctx2.globalAlpha = ghostAlpha * 0.82;
            ctx2.filter = "sepia(1) hue-rotate(150deg) saturate(3) brightness(2.2)";
            JH.Assets.draw(ctx2, "jon", sx, sy - rise, facing, { state: "idle", frame: 0 });
            ctx2.restore();
          }
        }

        // Fade to black: starts at 1.6s, over 0.7s.
        if (t > 1.6) {
          const a = Math.min(1, (t - 1.6) / 0.7);
          ctx2.save(); ctx2.globalAlpha = a; ctx2.fillStyle = "#000";
          ctx2.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H); ctx2.restore();
        }
      }
```

with:

```js
      // Player death sequence: corpse settles → ghost lifts out of it, stands up,
      // drifts/beams off → fade to black.
      if (this.state === "playerDeathSeq") {
        const t = this.deathSeqT, ctx2 = this.ctx;
        const sx = this.deathSx, sy = this.deathSy, facing = this.deathFacing;
        const ds = JH.CHURCH.deathSeq;

        const ghost = JH.Church.deathGhostState(t, ds);
        if (ghost && ghost.alpha > 0) {
          ctx2.save();
          ctx2.globalAlpha = ghost.alpha;
          ctx2.filter = "sepia(1) hue-rotate(150deg) saturate(3) brightness(2.2)";
          JH.Assets.draw(ctx2, "jon", sx, sy - ghost.riseY, facing, { state: "death", frame: ghost.frame });
          ctx2.restore();
        }

        const fadeAlpha = JH.Church.deathScreenFadeAlpha(t, ds);
        if (fadeAlpha > 0) {
          ctx2.save(); ctx2.globalAlpha = fadeAlpha; ctx2.fillStyle = "#000";
          ctx2.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H); ctx2.restore();
        }
      }
```

- [ ] **Step 3: Run the existing automated test suite**

Run: `npm test`
Expected: PASS (this task touches no logic `node:test` exercises directly, but confirms
nothing else broke).

- [ ] **Step 4: Commit**

```bash
git add js/game.js
git commit -m "feat(church): wire the death-sequence draw code to Church's timing functions"
```

---

### Task 4: Manual visual verification

**Files:**
- Create (scratch, not committed): a temporary Playwright script under the scratchpad
  directory to drive a real death and screenshot each phase.

**Interfaces:**
- Consumes: `JH.Game` (global, set at `js/game.js:1437`), `JH.Game.player.hp` /
  `JH.Game.player.alive` (`js/entities.js:158-176`), `JH.Game.state` (must be `"play"` for
  the death check at `js/game.js:931` to fire).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (in the background — leave it running for this task)
Expected: serves the game at `http://localhost:5173/`.

- [ ] **Step 2: Write and run the verification script**

Save to the scratchpad (not the repo) as e.g. `verify_death_ghost.mjs`:

```js
import { chromium } from "playwright";
const out = process.argv[2] || ".";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto("http://localhost:5173/");
await page.waitForTimeout(600);

// Get into "play" state and force the player to die.
await page.evaluate(() => {
  window.JH.Game.state = "play";
  window.JH.Game.player.hp = 0;
  window.JH.Game.player.alive = false;
});

// Phase boundaries from JH.CHURCH.deathSeq: fallEnd .6, ghostStart 1.0, riseEnd 1.35,
// standEnd 1.8, beamStart 2.1, fadeStart 2.4, total 3.2.
const checkpoints = [
  ["collapse_mid", 300],
  ["linger", 800],
  ["rise_out", 1150],
  ["stand_up_mid", 1550],
  ["ascend_drift", 1900],
  ["beam", 2200],
  ["fade", 2600],
];
let elapsed = 0;
for (const [name, atMs] of checkpoints) {
  await page.waitForTimeout(atMs - elapsed);
  elapsed = atMs;
  await page.screenshot({ path: `${out}/death_${name}.png` });
}
console.log("done");
await browser.close();
```

Run: `node verify_death_ghost.mjs <scratchpad-dir>` from inside the scratchpad directory
(adjust the import to use the `playwright` already installed for this repo's tooling — if
not present, check `tools/` for the existing pattern used by other verification scripts).
Expected: 7 PNGs written, no `PAGEERROR` lines printed.

- [ ] **Step 3: Visually inspect the screenshots**

Read each PNG (via the Read tool) in checkpoint order and confirm:
- `death_collapse_mid.png`: Jon mid-collapse (some intermediate frame, not fully kneeling).
- `death_linger.png`: Jon fully kneeling (frame 7), no ghost visible yet.
- `death_rise_out.png`: a faint cyan kneeling silhouette lifted slightly above the (still
  kneeling) corpse.
- `death_stand_up_mid.png`: the cyan ghost mid-way through standing up (an intermediate
  frame between kneeling and standing), hovering at a fixed height above the corpse.
- `death_ascend_drift.png`: the ghost fully standing (frame 0), drifting upward, corpse
  still visible on the ground below it.
- `death_beam.png`: the ghost higher up, starting to fade.
- `death_fade.png`: screen substantially or fully black.

If any checkpoint doesn't match (e.g. ghost missing, wrong frame, no separation from
corpse), use the `superpowers:systematic-debugging` skill rather than guessing at a fix.

- [ ] **Step 4: Report result to the user**

No commit for this task (verification only) — summarize what was confirmed working, with
the screenshots available for the user to glance at if they want.

---
