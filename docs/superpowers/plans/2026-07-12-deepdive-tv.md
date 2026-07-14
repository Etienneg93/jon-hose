# Deepdive TV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The kibble-accelerator TV — sitting at a shop-interlude TV fast-forwards the whole world to 10× so a banked kibble buff resolves in seconds — per `docs/superpowers/specs/2026-07-06-deepdive-tv-design.md`.

**Architecture:** Four units per the spec: config block, a time-scale seam in the fixed-step `frame()` loop (ramp advanced on REAL dt, sim driven by scaled dt, per-step dt stays `FIXED_DT`), a `DeepdiveTV` prop + `tickDeepdive()` interaction, and presentation (fake-YouTube screen, time-distortion overlay, SFX). Ramp math extracted to a pure dual-export `Balance.deepdiveRamp` for unit testing.

**Tech Stack:** Vanilla JS (IIFE + `JH` namespace), `node --test`, headless Edge via playwright-core (`headless-playtest` project skill).

## Global Constraints

- Branch `deepdive-tv` (off shop-relics-pass @ 8162f77 — that branch stays FROZEN for the user's playtest; never commit to it). Suite baseline 278; stays green every task.
- **Spec updates vs the 2026-07-06 text** (codebase moved; these govern where they differ):
  - `laneGap: 70`, not 40 — the TV's ±22 interact zone must not intersect the vendor's shop-open zone: **`laneGap > JH.SHOP.range + 22` must hold** (read `JH.SHOP.range` at implementation; if 70 violates it, raise laneGap and note it).
  - Kibble fields confirmed live: `player.kibbleTimer` / `player.kibbleRegen`, drained in `Player.update` (entities.js ~406-409) — the spec's zero-feature-specific-kibble-code claim still holds.
  - Loop facts confirmed: `frame(now)` at game.js ~1691, `JH.FIXED_DT = 1/60`, `JH.MAX_STEPS = 5` (config.js:14-15), accumulator `this.acc`.
  - **Leaderboard clock rides scaled time (intended):** `this.elapsed += dt` accrues per sim step (game.js ~1793), so a deepdive burns FASTEST-WINS clock ~10× while it runs — the binge trades leaderboard seconds for entering the next wave healed. Do NOT special-case the clock. (Flagged to the user; their playtest call.)
- Config is the single source of truth: all tunables in `JH.DEEPDIVE`; no gameplay literals in game/entities code; tests derive from config.
- No jump, no melee. Comments: behavioral facts only.
- Working tree holds the user's unrelated uncommitted WIP: stage ONLY the files each task touches; never `git add -A` / `git add .` / bare `commit -am`. No commit trailers.
- Headless runs: telemetry endpoint spy BEFORE Backquote, every launch.

---

### Task 1: Config + time-scale seam + ramp math

**Files:**
- Modify: `js/config.js` (new `JH.DEEPDIVE` block after `JH.SHOP`), `js/balance.js` (pure ramp helper), `js/game.js` (`frame()` ~1691, state fields ~30s block, `startGame` defensive reset)
- Test: `tests/balance.test.js`

**Interfaces:**
- Produces: `JH.DEEPDIVE` (keys below); `Balance.deepdiveRamp(cur, deepdiving, dtReal, D)` → new timeScale (pure); `Game.timeScale` (number, 1 at rest) and `Game.deepdiving` (bool) — Task 2 flips `deepdiving`, Task 3 reads `timeScale` for overlay intensity.

- [ ] **Step 1: Write the failing tests** in `tests/balance.test.js`:

```js
test("deepdiveRamp: reaches maxScale in ~rampUp s, returns in ~rampDown s, clamps, never overshoots", () => {
  const D = JH.DEEPDIVE;
  let s = 1, t = 0;
  while (s < D.maxScale && t < 5) { s = JH.Balance.deepdiveRamp(s, true, 1 / 60, D); t += 1 / 60; }
  assert.ok(Math.abs(t - D.rampUp) < 0.05, "ramp-up time ~" + D.rampUp + ", got " + t.toFixed(2));
  assert.strictEqual(s, D.maxScale, "clamps at maxScale exactly");
  s = JH.Balance.deepdiveRamp(s, true, 1, D);
  assert.strictEqual(s, D.maxScale, "no overshoot while held");
  t = 0;
  while (s > 1 && t < 5) { s = JH.Balance.deepdiveRamp(s, false, 1 / 60, D); t += 1 / 60; }
  assert.ok(Math.abs(t - D.rampDown) < 0.05, "ramp-down time ~" + D.rampDown);
  assert.strictEqual(s, 1, "clamps at 1 exactly");
});

test("DEEPDIVE config shape", () => {
  const D = JH.DEEPDIVE;
  for (const k of ["threshold", "maxScale", "rampUp", "rampDown", "stepCap", "titleSwap", "laneGap"])
    assert.strictEqual(typeof D[k], "number", k);
  assert.ok(D.stepCap > JH.MAX_STEPS, "stepCap must exceed MAX_STEPS or 10x can't run");
  assert.ok(Array.isArray(D.titles) && D.titles.length >= 5);
  assert.ok(Array.isArray(D.quips) && D.quips.length >= 3);
  assert.ok(D.laneGap > JH.SHOP.range + 22, "TV interact zone must clear the shop-open zone");
});
```

- [ ] **Step 2: Run to verify failure** — `node --test --test-name-pattern="deepdive" tests/balance.test.js` → FAIL (no JH.DEEPDIVE / deepdiveRamp).

- [ ] **Step 3: Config block** in `js/config.js` (after the JH.SHOP object):

```js
// Deepdive TV: kibble-accelerator shop prop. Sitting fast-forwards the WHOLE
// world (fixed-step count scales, per-step dt stays FIXED_DT). The run clock
// (elapsed) rides scaled time on purpose — a binge costs leaderboard seconds.
JH.DEEPDIVE = {
  threshold: 20,    // s of banked kibble required at vendor-spawn to spawn the TV
  maxScale: 10,     // peak world time multiplier
  rampUp:   0.8,    // s of REAL time to ramp 1 -> maxScale
  rampDown: 0.6,    // s of REAL time to ramp back to 1
  stepCap:  12,     // MAX_STEPS override while ramped (default 5 caps speed ~5x)
  titleSwap: 2.5,   // s of SCALED time between fake-video title swaps
  laneGap:  70,     // px further down-lane than the vendor (> SHOP.range + 22)
  titles: [
    "Are FIRE HYDRANTS conscious? (they answered)",
    "I ate only KIBBLE for 30 days",
    "The DARK TRUTH about municipal water pressure",
    "POV: you're a dog at 3am",
    "This ONE hose trick BROKE the game",
    "Why do I keep RESPAWNING? (existential)",
    "Top 10 hydrants that ATTACKED back",
  ],
  quips: [
    "wait — it's ALL kibble?",
    "liked & subscribed",
    "just one more video",
    "the algorithm knows me",
  ],
};
```

Verify `JH.SHOP.range + 22 < 70`; if not, raise laneGap to `range + 30` and note it in the report.

- [ ] **Step 4: Pure ramp** in `js/balance.js` (beside the other pure helpers; balance.js has no local `JH` — use its `root.JH` idiom only if you need a default, but prefer the passed `D`):

```js
// Deepdive time-scale ramp: advances toward maxScale (deepdiving) or 1 (not)
// at the constant rate that crosses the full span in rampUp/rampDown seconds
// of REAL time. Pure; clamps at both ends.
deepdiveRamp(cur, deepdiving, dtReal, D) {
  const target = deepdiving ? D.maxScale : 1;
  const rate = (D.maxScale - 1) / (deepdiving ? D.rampUp : D.rampDown);
  const step = rate * dtReal;
  return target > cur ? Math.min(target, cur + step) : Math.max(target, cur - step);
},
```

- [ ] **Step 5: Seam in `js/game.js`** — state fields in the Game object literal (near `shopNpc: null` ~32): `timeScale: 1, deepdiving: false,`. Rework `frame()` (~1691) per the spec, using the helper:

```js
frame(now) {
  if (!this.running) return;
  let dt = (now - this.lastT) / 1000;
  this.lastT = now;
  if (dt > 0.25) dt = 0.25;                 // tab-switch guard (unchanged)
  // Ramp advances on REAL dt so sim speed never feeds back into ramp rate.
  this.timeScale = JH.Balance.deepdiveRamp(this.timeScale, this.deepdiving, dt, JH.DEEPDIVE);
  this.acc += dt * this.timeScale;
  const cap = (this.deepdiving || this.timeScale > 1.01) ? JH.DEEPDIVE.stepCap : JH.MAX_STEPS;
  let steps = 0;
  while (this.acc >= JH.FIXED_DT && steps < cap) {
    this.update(JH.FIXED_DT);
    this.acc -= JH.FIXED_DT;
    steps++;
  }
  this.render();
  requestAnimationFrame((t) => this.frame(t));
}
```

Keep everything else `frame()` currently does (compare against the real body — if it has extra lines the spec's sketch lacks, e.g. FPS bookkeeping, preserve them verbatim around the seam). In `startGame`, beside the shop resets: `this.timeScale = 1; this.deepdiving = false;` (defensive). Same two lines in `respawnFromChurch`'s reset block.

- [ ] **Step 6: Full suite** — `npm test` → 280 (278 + 2). With `deepdiving` false and `timeScale` 1 the loop is behavior-identical (acc += dt·1, cap = MAX_STEPS).
- [ ] **Step 7: Headless sanity** — normal run boots, moves, sprays; eval `JH.Game.deepdiving = true` mid-shop-less moment → `timeScale` climbs to 10, world visibly fast; set false → returns to 1. 0 pageerrors.
- [ ] **Step 8: Commit** — `git add js/config.js js/balance.js js/game.js tests/balance.test.js && git commit -m "feat(deepdive): config + time-scale seam — world runs on scaled fixed steps, pure ramp helper"`

---

### Task 2: DeepdiveTV prop, spawn seam, interaction, input gating

**Files:**
- Modify: `js/entities.js` (DeepdiveTV class beside ShopNPC ~2850; Player.update movement/spray gate), `js/game.js` (`spawnVendor` ~1056, `tickDeepdive` beside `tickSigils` ~1298 + call site, clear sites: startWave ~533, startGame ~470, respawnFromChurch ~1543)
- Test: `tests/entities.test.js`

**Interfaces:**
- Consumes: `Game.deepdiving`/`timeScale` (Task 1), `JH.DEEPDIVE.threshold/laneGap`, ShopNPC class shape, `input.buffered/consume/pressed` idioms.
- Produces: `JH.DeepdiveTV` (x, y, z, facing, t, bodyW, near, videoT, titleIdx; `update(dt)`; `draw(ctx, cam)` — Task 3 replaces the draw body); `Game.deepdiveTV` (null when absent); `Game.tickDeepdive()`.

- [ ] **Step 1: Write the failing tests** in `tests/entities.test.js` (game-stub idiom like the sibling `onEnemyKilled`/`toggleRelic` tests):

```js
test("deepdive: TV spawns at threshold, not below; sits down-lane of the vendor", () => {
  const mk = (kib) => {
    const g = { relics: {}, player: { kibbleTimer: kib, x: 0, y: 0 },
                shopWheelEntries: () => [], };
    JH.Game.spawnVendor.call(g, 300);
    return g;
  };
  const D = JH.DEEPDIVE;
  const at = mk(D.threshold);
  assert.ok(at.deepdiveTV, "TV at exactly threshold");
  assert.strictEqual(at.deepdiveTV.x, 300 - D.laneGap, "down-lane by laneGap");
  assert.strictEqual(mk(D.threshold - 1).deepdiveTV, null, "no TV below threshold");
});

test("deepdive: auto-ends when kibble empties; move key bails", () => {
  const mkInput = (bufferedKeys, pressedKeys) => ({
    buffered: (k) => bufferedKeys.includes(k), consume: () => {},
    pressed: (k) => pressedKeys.includes(k),
  });
  const g = { deepdiving: true, deepdiveTV: { x: 0, y: 0, near: true, videoT: 0 },
              player: { x: 0, y: 0, kibbleTimer: 0 },
              input: mkInput([], []), audio: { play() {} } };
  JH.Game.tickDeepdive.call(g);
  assert.strictEqual(g.deepdiving, false, "kibble 0 auto-ends");
  g.deepdiving = true; g.player.kibbleTimer = 5; g.input = mkInput([], ["left"]);
  JH.Game.tickDeepdive.call(g);
  assert.strictEqual(g.deepdiving, false, "move key bails");
});
```

(Adapt the `spawnVendor` stub fields to whatever the real method dereferences — read it first; it rolls wheel stock via `JH.Balance.rollWheelStock(JH.RELICS, this.relics, ...)`, so `relics: {}` is needed; add any other field it touches. If `JH.Upgrades.currentActLevel` is read, set it in a try/finally.)

- [ ] **Step 2: Run to verify failure** — `node --test --test-name-pattern="deepdive" tests/entities.test.js` → FAIL.

- [ ] **Step 3: DeepdiveTV class** in `js/entities.js` beside ShopNPC:

```js
// ====================================================== DEEPDIVE TV
// Shop-interlude prop: spawns down-lane of the vendor when Jon arrives with
// a big banked kibble buff. Sitting at it (game.deepdiving) fast-forwards
// the whole world; see JH.DEEPDIVE and Game.tickDeepdive.
class DeepdiveTV {
  constructor(x, y) {
    this.x = x; this.y = y; this.z = 0; this.facing = 1;
    this.t = 0; this.bodyW = 16; this.near = false;
    this.videoT = 0; this.titleIdx = 0;
  }
  update(dt) { this.t += dt; }
  draw(ctx, cam) {
    // Task 2 placeholder: dark TV box on legs + lit screen. Task 3 replaces
    // this body with the fake-YouTube render.
    const sx = Math.round(this.x - cam), sy = Math.round(Geo.feetScreenY(this.y, 0));
    Assets.shadow(ctx, sx, sy, 10);
    ctx.save();
    ctx.fillStyle = "#1a2030"; ctx.fillRect(sx - 9, sy - 22, 18, 14);   // set
    ctx.fillStyle = "#3a4a66"; ctx.fillRect(sx - 7, sy - 20, 14, 10);   // screen
    ctx.fillStyle = "#0d1420"; ctx.fillRect(sx - 6, sy - 8, 2, 8); ctx.fillRect(sx + 4, sy - 8, 2, 8); // legs
    ctx.restore();
  }
}
JH.DeepdiveTV = DeepdiveTV;
```

- [ ] **Step 4: Spawn seam** — in `Game.spawnVendor` (js/game.js ~1056), after `this.shopNpc = new JH.ShopNPC(x, JH.DEPTH_MIN + 6);`:

```js
// Deepdive TV: only when Jon arrives at the shop with a big kibble bank.
this.deepdiveTV = (this.player && this.player.kibbleTimer >= JH.DEEPDIVE.threshold)
  ? new JH.DeepdiveTV(x - JH.DEEPDIVE.laneGap, JH.DEPTH_MIN + 6)
  : null;
```

Clear it (`this.deepdiveTV = null;`) at every site that clears `shopNpc`: startWave (~533), startGame (~470), respawnFromChurch (~1543). Also force `this.deepdiving = false;` at startWave (belt-and-suspenders — the TV is gone). Add `deepdiveTV: null` to the Game object literal near `shopNpc: null`.

Wire update + draw where `shopNpc` gets its update/draw calls (game.js ~1885 for update; find shopNpc's draw in the world render pass and draw the TV the same way, depth-sorted or adjacent — follow the shopNpc pattern exactly).

- [ ] **Step 5: tickDeepdive** in js/game.js beside `tickSigils`, called from `update()` right after the `tickSigils()` call:

```js
// Deepdive TV interaction: sit (E) to fast-forward the world while banked
// kibble drains; any move key or a second E stands Jon back up. Auto-ends
// when the kibble bank empties.
tickDeepdive() {
  const tv = this.deepdiveTV;
  if (!tv) return;
  const pl = this.player;
  tv.near = Math.abs(pl.x - tv.x) < 22 && Math.abs(pl.y - tv.y) < 28;
  if (!this.deepdiving) {
    if (tv.near && this.input.buffered("confirm")) {
      this.input.consume("confirm");
      this.deepdiving = true;
      this.audio.play("upgrade", { pitch: 0.55 });   // spin-up
    }
    return;
  }
  tv.videoT += JH.FIXED_DT;   // scaled steps make this race on their own
  const bail = this.input.pressed("up") || this.input.pressed("down")
            || this.input.pressed("left") || this.input.pressed("right")
            || this.input.buffered("confirm");
  if (bail || pl.kibbleTimer <= 0) {
    if (this.input.buffered("confirm")) this.input.consume("confirm");
    this.deepdiving = false;
    this.audio.play("upgrade", { pitch: 1.6 });      // spin-down
  }
},
```

(Verify `input.pressed` exists with that name — if the API differs (`wasPressed`, `held`), use the real edge-triggered call and note it. Verify `audio.play("upgrade", {pitch})` is a real cue+option — else pick an existing cue the same way the range stations do.)

- [ ] **Step 6: Input gating while seated** — in the play-input block that moves/sprays Jon (Player.update or the game-side input application — find where movement keys become velocity), gate on `!game.deepdiving` so a seated Jon doesn't walk/spray. The gate must NOT swallow the bail keys read by tickDeepdive (tickDeepdive runs regardless; only the movement/spray application is skipped).

- [ ] **Step 7: Full suite** — `npm test` → 282 (280 + 2). **Step 8: Headless verify** — real run: eval `JH.Game.player.kibbleTimer = 25`, eval-call `JH.Game.spawnVendor(JH.Game.player.x + 120)`; assert `deepdiveTV` exists at vendor.x − laneGap; walk to it + held E → `deepdiving` true, `timeScale` → 10, `kibbleTimer` drains ≥5× faster than wall-clock; press ArrowLeft → `deepdiving` false, timeScale back to ~1, Jon moves again; E near the VENDOR still opens the shop (no contention). Screenshot the TV + seated state.
- [ ] **Step 9: Commit** — `git add js/entities.js js/game.js tests/entities.test.js && git commit -m "feat(deepdive): TV prop + sit/bail interaction — kibble-gated spawn at the vendor seam, world fast-forward while seated"`

---

### Task 3: Presentation — fake-YouTube screen, overlay, prompt, quips

**Files:**
- Modify: `js/entities.js` (DeepdiveTV.draw full version), `js/game.js` (time-distortion overlay in the render pass beside the essenceDim ramp ~1858-1871 region; "E: DEEPDIVE" prompt; quip floats in tickDeepdive)
- Test: screenshot-verified (rendering; no unit test)

**Interfaces:**
- Consumes: `JH.DEEPDIVE.titles/quips/titleSwap/maxScale`, `Game.timeScale`, `tv.videoT/titleIdx`, `game.float(x, y, text, color)`.
- Produces: nothing for later tasks.

- [ ] **Step 1: Fake-YouTube draw** — replace the placeholder `DeepdiveTV.draw` body: dark set + screen; inside the screen a video area with a title from `JH.DEEPDIVE.titles[this.titleIdx]` (5px font, clipped to screen width), a progress bar filling over `titleSwap` scaled seconds, a fake view count (derive from `titleIdx` — e.g. `(3 + this.titleIdx * 7) % 10` M views — no RNG so it's stable per title), and a small "UP NEXT" box. Advance `titleIdx = (titleIdx + 1) % titles.length` when `videoT >= titleSwap` (reset videoT). Screen glows brighter while `JH.Game && JH.Game.deepdiving`.
- [ ] **Step 2: Seated Jon + quips** — while `deepdiving`, in tickDeepdive roll a quip roughly every ~4 scaled seconds: `if (Math.random() < JH.FIXED_DT / 4) this.float(pl.x, pl.y - 30, JH.DEEPDIVE.quips[Math.floor(Math.random() * JH.DEEPDIVE.quips.length)], "#9be8ff");`. Jon's seated pose: skip a bespoke sprite — while deepdiving, draw Jon at the TV facing it (his existing idle; art is disposable per the pipeline note, do not over-invest).
- [ ] **Step 3: Time-distortion overlay** — in the render pass beside the essenceDim full-screen pattern: intensity `k = (this.timeScale - 1) / (JH.DEEPDIVE.maxScale - 1)`; when `k > 0.01` draw vignette (radial dark edges at `0.25 * k` alpha) + 3-4 horizontal speed-lines at `0.15 * k` alpha jittering per frame. Keep it cheap — no per-pixel work, follow essenceDim's draw budget.
- [ ] **Step 4: Prompt** — "E: DEEPDIVE" over the TV when `tv.near && !this.deepdiving`, matching the vendor/sigil prompt style (same font/color idiom as the range-station "E").
- [ ] **Step 5: Full suite** — `npm test` → stays 282. **Step 6: Headless screenshots** — (a) TV idle with prompt, (b) mid-deepdive at full ramp: screen + racing progress bar + overlay + a quip if luck allows. LOOK at both (Read the PNGs): titles legible at 5px? overlay reads as speed, not murk? Iterate alpha/fonts until yes.
- [ ] **Step 7: Commit** — `git add js/entities.js js/game.js && git commit -m "feat(deepdive): fake-youtube screen, time-distortion overlay, prompt + quips"`

---

## Self-review notes (already applied)

- Spec's `laneGap: 40` collided with the post-v0.28 shop-opens-on-E zone (`JH.SHOP.range`); raised to 70 with a config-shape test pinning `laneGap > SHOP.range + 22`.
- Spec's inline ramp math moved to pure `Balance.deepdiveRamp` (dual-export, unit-testable) — same numbers, same clamping.
- Leaderboard clock deliberately rides scaled time (Global Constraints) — spec predates telemetry; flagged to the user rather than silently chosen.
- Spec's audio cues are placeholders by design; pitch-bent existing cues are sanctioned by the spec's own Audio section.
- `videoT += JH.FIXED_DT` inside tickDeepdive (called once per sim step) IS scaled time — the spec's "scaled dt is fine here" comment resolved concretely.
