# Fire & Ground-Hazard Readability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every damaging ground zone tests its hit against the exact ellipse it draws (rim = hitbox), all flattened by one shared depth ratio, with a 0.2s sizzle-grace warning on fire patches.

**Architecture:** One pure helper `Geo.inGroundEllipse` in `js/world.js` (screen-space depth compare via `feetScreenY`, same pattern as the proven `insideDome`/`FirePatch` fixes) + one constant `JH.GROUND_RY = 0.40` in `js/config.js`. Every hazard call site (FirePatch, FireRing, Furnace vent, SmeltBomb, Slayer slam, Quake stomp/leap, Fuse drop/death, Bulwark dome) ports its hit test to the helper and its draw code to the shared ratio. FirePatch additionally gets the rim-decal contract, a flame-width clamp, and the first-contact grace tick.

**Tech Stack:** Vanilla JS (browser IIFEs on `window.JH`), `node --test` + `node:assert` for tests. No build step.

**Source spec:** `docs/superpowers/plans/ideas/2026-07-02-fire-and-hazard-readability.md`

## Global Constraints

- Work on a new branch `fire-readability` created from current HEAD. The working tree has **uncommitted user files** (`js/quake-frames.js`, `tools/imagen-gen.mjs`, `sprites/effects/`, `docs/superpowers/plans/2026-07-01-wave-flow-expansion.md`, `.gitignore`) — never modify, stage, or commit them. Stage files by exact path only, never `git add -A`/`.`.
- **Playtest gate (user rule):** do NOT push or merge. All gameplay changes require the user's own playtest sign-off; the branch stays local when the plan completes.
- `JH.GROUND_RY = 0.40` everywhere (spec decision). The Bulwark dome's ratio changes 0.45 → 0.40 (spec open-question 3 resolved: accept the slightly flatter bubble; flag for playtest).
- Sizzle grace fires **once per FirePatch instance** (spec open-question 1 resolved: re-entering the same patch does not re-warn).
- Code comments: behavioral/mechanical facts only (CLAUDE.md rule). Design "why" goes in commit messages.
- Script load order in `index.html` is `config.js` → `world.js` → `entities.js`; `entities.js` captures `const Geo = JH.Geo` at eval time, so the helper must live on the `Geo` object in `world.js` (it does). Tests must `require` in that same order.
- All test positions use `z: 0` grounded points; `Geo.feetScreenY(y, 0)` is `JH.FLOOR_TOP + y`, so screen-space depth deltas equal world-Y deltas in tests.

### Behavior deltas this plan intentionally makes (for the playtest gate)

| Hazard | Old hit shape | New hit shape (rx, ry) |
|---|---|---|
| FirePatch | ellipse (0.85r, 0.30r), hit min-r 6 vs drawn min-r 3 | ellipse (0.85r, 0.34r), min-r 6 shared |
| FireRing (Slayer dash) | circle band r±14 | elliptical band (r, 0.4r) ±14 rim-space |
| Furnace vent | circle 4·bodyW | ellipse (4·bodyW, 1.6·bodyW) |
| SmeltBomb landing | circle 34 | ellipse (28.9, 11.6) — matches spawned patch |
| Slayer slam | rect 38 × ±24 | ellipse (38, 15.2) |
| Quake stomp | rect 36 × ±26 | ellipse (36, 14.4) |
| Quake leap | circle 52 | ellipse (52, 20.8) |
| Fuse drop slam | circle 20 | ellipse (20, 8) |
| Fuse death burn | circle 30 | ellipse (30, 12) |
| Bulwark dome (shelter/block) | ellipse ratio 0.45 | ratio 0.40 |

All depth reaches shrink to match the drawn rims. Fire-zone difficulty eases slightly by design.

---

### Task 1: `JH.GROUND_RY` + `Geo.inGroundEllipse` + unit tests

**Files:**
- Modify: `js/config.js:22` (after `JH.DEPTH_MAX`)
- Modify: `js/world.js:47` (after `inHitArc` inside the `Geo` object literal)
- Create: `tests/world.test.js`

**Interfaces:**
- Produces: `JH.GROUND_RY` (number, 0.40) and `Geo.inGroundEllipse(px, py, cx, cy, rx, ry?) → boolean` where `ry` defaults to `rx * JH.GROUND_RY`. Every later task consumes both.

- [ ] **Step 1: Write the failing tests**

Create `tests/world.test.js`:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");

global.window = global.window || {};
require("../js/config.js");
// world.js preloads a debris sprite via JH.Loader at script eval; node has no
// Image, so stub the loader. Geo itself is pure math.
global.window.JH.Loader = { img: () => ({}) };
require("../js/world.js");
const JH = global.window.JH;
const Geo = JH.Geo;

test("GROUND_RY is defined", () => {
  assert.strictEqual(typeof JH.GROUND_RY, "number");
  assert.ok(JH.GROUND_RY > 0 && JH.GROUND_RY < 1);
});

test("inGroundEllipse: center and x-rim edge", () => {
  assert.ok(Geo.inGroundEllipse(100, 40, 100, 40, 30));
  assert.ok(Geo.inGroundEllipse(129, 40, 100, 40, 30));
  assert.ok(!Geo.inGroundEllipse(131, 40, 100, 40, 30));
});

test("inGroundEllipse: depth reach is rx * GROUND_RY, not rx", () => {
  const ry = 30 * JH.GROUND_RY; // 12
  assert.ok(Geo.inGroundEllipse(100, 40 + ry - 1, 100, 40, 30));
  assert.ok(!Geo.inGroundEllipse(100, 40 + ry + 1, 100, 40, 30));
  // A plain circle test would pass at depth 25; the ellipse must not.
  assert.ok(!Geo.inGroundEllipse(100, 40 + 25, 100, 40, 30));
});

test("inGroundEllipse: explicit ry overrides the default ratio", () => {
  assert.ok(Geo.inGroundEllipse(100, 40 + 19, 100, 40, 30, 20));
  assert.ok(!Geo.inGroundEllipse(100, 40 + 21, 100, 40, 30, 20));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/world.test.js`
Expected: FAIL — `GROUND_RY` undefined / `Geo.inGroundEllipse is not a function`.

- [ ] **Step 3: Implement**

In `js/config.js`, directly after `JH.DEPTH_MAX = 86;`:

```js
  // Ground-ellipse depth ratio: every ground-plane footprint (hazard zones,
  // domes, telegraphs) draws AND hits an ellipse (rx, rx * GROUND_RY) — the
  // hit test lives in Geo.inGroundEllipse (world.js).
  JH.GROUND_RY = 0.40;
```

In `js/world.js`, inside the `Geo` object, after the `inHitArc` method:

```js
    // Is world point (px,py) inside the ground ellipse centred at (cx,cy)?
    // THE ground-hazard footprint test: x is 1:1 world→screen; depth compares
    // in screen space via feetScreenY, so a hazard affects exactly the ellipse
    // it draws (the rim is the hitbox). ry defaults to rx * JH.GROUND_RY.
    inGroundEllipse(px, py, cx, cy, rx, ry) {
      ry = ry || rx * JH.GROUND_RY;
      const dx = px - cx;
      const dyS = Geo.feetScreenY(py, 0) - Geo.feetScreenY(cy, 0);
      return (dx * dx) / (rx * rx) + (dyS * dyS) / (ry * ry) < 1;
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test` (full suite — confirms nothing else broke)
Expected: all pass (61 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git checkout -b fire-readability
git add js/config.js js/world.js tests/world.test.js
git commit -m "feat(world): shared GROUND_RY ratio + Geo.inGroundEllipse ground-footprint test

One flattening ratio and one screen-space ellipse test for every ground
hazard, generalizing the FirePatch/insideDome fix so rim = hitbox everywhere."
```

---

### Task 2: FirePatch — one footprint, rim decal, flame clamp, sizzle grace

**Files:**
- Modify: `js/config.js` (`JH.FIRE` block ~line 285; `JH.SFX` block ~line 552)
- Modify: `js/entities.js:1356-1411` (class `FirePatch`)
- Modify: `tests/entities.test.js` (require header + new tests)

**Interfaces:**
- Consumes: `Geo.inGroundEllipse`, `JH.GROUND_RY` (Task 1).
- Produces: `FirePatch.footprint() → {r, rx, ry}` (live shrinking footprint; `rx = 0.85r`, `ry = rx * JH.GROUND_RY`); fields `graceT` (number, `-1` = untouched) and `rimFlashT` (number); config `JH.FIRE.graceWindow` (0.2); SFX key `"sizzle"`; test helper `stubGame(px, py)` in `tests/entities.test.js` reused by Tasks 4–8.

- [ ] **Step 1: Update the test-file require header to load world.js**

In `tests/entities.test.js`, replace:

```js
global.window = global.window || {};
require("../js/config.js");
require("../js/upgrades.js");
require("../js/entities.js");
const JH = global.window.JH;
```

with:

```js
global.window = global.window || {};
require("../js/config.js");
// world.js preloads a debris sprite via JH.Loader at script eval; node has no
// Image, so stub the loader. entities.js captures Geo at eval time, so world
// must load first (same order as index.html).
global.window.JH.Loader = { img: () => ({}) };
require("../js/world.js");
require("../js/upgrades.js");
require("../js/entities.js");
const JH = global.window.JH;
```

Run: `npm test -- tests/entities.test.js` — all existing tests must still pass before continuing.

- [ ] **Step 2: Write the failing tests**

Append to `tests/entities.test.js`:

```js
// ---- ground-hazard footprint contract (rim = hitbox) ----

// Minimal game stub for hazard update/think paths. Extend fields here if an
// entity path touches something missing — keep one shared stub.
function stubGame(px, py) {
  return {
    player: {
      x: px, y: py, z: 0, alive: true, bodyW: 12, facing: 1,
      burns: 0, hits: 0,
      applyBurn(n) { this.burns += n; },
      takeHit() { this.hits++; },
      applyKnockback() {},
    },
    particles: [], embers: [], firePatches: [], pickups: [],
    bounds: { minX: 0, maxX: 600 },
    shake() {}, onEnemyKilled() {},
    audio: { played: [], play(k) { this.played.push(k); } },
  };
}

test("FirePatch: first contact arms sizzle grace — warning, no instant burn", () => {
  const p = new JH.FirePatch(100, 40, 24, 3);
  const g = stubGame(100, 40);
  p.update(0.016, g);
  assert.strictEqual(g.player.burns, 0);
  assert.deepStrictEqual(g.audio.played, ["sizzle"]);
});

test("FirePatch: still inside after the grace window → burn lands", () => {
  const p = new JH.FirePatch(100, 40, 24, 3);
  const g = stubGame(100, 40);
  for (let t = 0; t < 0.3; t += 0.016) p.update(0.016, g);
  assert.ok(g.player.burns >= 1);
});

test("FirePatch: stepping out during grace → no burn ever", () => {
  const p = new JH.FirePatch(100, 40, 24, 3);
  const g = stubGame(100, 40);
  p.update(0.016, g);            // sizzle warning fires
  g.player.y = 40 + 30;          // step out of the footprint
  for (let t = 0; t < 0.5; t += 0.016) p.update(0.016, g);
  assert.strictEqual(g.player.burns, 0);
});

test("FirePatch: hit footprint is the drawn ellipse — depth miss a circle would hit", () => {
  const p = new JH.FirePatch(100, 40, 24, 3);
  // footprint ry = 24*0.85*GROUND_RY ≈ 8.2; a 24-radius circle reaches depth 24
  const g = stubGame(100, 40 + 15);
  for (let t = 0; t < 0.5; t += 0.016) p.update(0.016, g);
  assert.strictEqual(g.player.burns, 0);
  assert.deepStrictEqual(g.audio.played, []);   // never even warned
});

test("FirePatch: re-entry after grace burns immediately, no second warning", () => {
  const p = new JH.FirePatch(100, 40, 24, 3);
  const g = stubGame(100, 40);
  for (let t = 0; t < 0.3; t += 0.016) p.update(0.016, g);  // grace + first burn
  g.player.y = 40 + 30;                                      // step out
  for (let t = 0; t < 0.5; t += 0.016) p.update(0.016, g);  // burn interval expires
  const before = g.player.burns;
  g.player.y = 40;                                           // step back in
  p.update(0.016, g);
  assert.strictEqual(g.player.burns, before + 1);
  assert.strictEqual(g.audio.played.filter((k) => k === "sizzle").length, 1);
});

test("FirePatch.footprint: shrinks with spray progress, floors at r=6", () => {
  const p = new JH.FirePatch(100, 40, 24, 3);
  const f0 = p.footprint();
  assert.strictEqual(f0.rx, 24 * 0.85);
  assert.strictEqual(f0.ry, f0.rx * JH.GROUND_RY);
  p.sprayProgress = 3;                 // fully extinguish-progressed
  const f1 = p.footprint();
  assert.ok(f1.r >= 6 && f1.r < f0.r);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- tests/entities.test.js`
Expected: FAIL — `p.footprint is not a function`, burn applied on first frame, no `"sizzle"` in `JH.SFX`.

- [ ] **Step 4: Implement config additions**

In `js/config.js`, `JH.FIRE` block — add one line:

```js
  JH.FIRE = {
    burnDpsPerStack: 4,      // hp/s per stack (3 stacks = 12 hp/s for burnDuration)
    burnDuration: 2.0,       // seconds burn lasts; refreshed (not extended) on reapply
    maxBurnStacks: 3,
    patchBurnInterval: 0.4,  // min seconds between burn-stack ticks while in a patch
    graceWindow: 0.2,        // first-contact sizzle warning before a patch's first burn
  };
```

In `js/config.js`, `JH.SFX` block — add after `blast`:

```js
    sizzle: { type: "noise", dur: 0.15, gain: 0.10 },
```

- [ ] **Step 5: Implement FirePatch**

Replace the `constructor`, `update`, and `draw` of `class FirePatch` (`js/entities.js` ~1356–1411) with:

```js
  class FirePatch {
    constructor(x, y, radius, extinguishDur) {
      this.x = x; this.y = y; this.z = 0;
      this.radius = radius;
      this.extinguishDur = extinguishDur;
      this.sprayProgress = 0;  // accumulated spray time; reaches extinguishDur to die
      this.patchBurnT = 0;     // cooldown between burn-stack applications
      this.graceT = -1;        // sizzle grace: -1 = never touched; counts down after first contact
      this.rimFlashT = 0;      // white rim flash while the sizzle warning is live
      this.dead = false; this.t = 0;
    }
    // Live footprint (shrinks as spray extinguishes). ONE shape shared by the
    // hit test and the drawn scorch/rim — the rim you see is the hitbox.
    footprint() {
      const prog = this.sprayProgress / this.extinguishDur;
      const r = Math.max(6, this.radius * (1 - prog * 0.55));
      const rx = r * 0.85;
      return { r, rx, ry: rx * JH.GROUND_RY };
    }
    update(dt, game) {
      this.t += dt;
      if (this.patchBurnT > 0) this.patchBurnT -= dt;
      if (this.graceT > 0) this.graceT -= dt;
      if (this.rimFlashT > 0) this.rimFlashT -= dt;
      const pl = game.player;
      if (pl && pl.alive) {
        const f = this.footprint();
        const inside = Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, f.rx, f.ry);
        if (inside && this.graceT === -1) {
          // First contact on this patch: audible sizzle + rim flash, and a
          // graceWindow beat to step out before the first burn lands.
          this.graceT = JH.FIRE.graceWindow;
          this.rimFlashT = JH.FIRE.graceWindow;
          if (game.audio) game.audio.play("sizzle");
        }
        if (inside && this.graceT !== -1 && this.graceT <= 0 && this.patchBurnT <= 0) {
          pl.applyBurn(1);
          this.patchBurnT = JH.FIRE.patchBurnInterval;
        }
      }
      if (this.sprayProgress >= this.extinguishDur) this.dead = true;
    }
    draw(ctx, cam) {
      const sx = Math.round(this.x - cam);
      const sy = Math.round(Geo.feetScreenY(this.y, 0));
      const prog = this.sprayProgress / this.extinguishDur;
      const f = this.footprint();
      const t = this.t;
      ctx.save();
      // Scorch base decal — the EXACT hit ellipse.
      ctx.globalAlpha = Math.max(0, 0.88 - prog * 0.45);
      ctx.beginPath();
      ctx.ellipse(sx, sy, f.rx, f.ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#440800";
      ctx.fill();
      // Bright rim on the same ellipse, pulsing while lit; flashes white during
      // the first-contact sizzle grace.
      const flash = this.rimFlashT > 0;
      ctx.globalAlpha = Math.max(0, (flash ? 0.95 : 0.45 + 0.25 * Math.sin(t * 6)) - prog * 0.35);
      ctx.strokeStyle = flash ? "#ffffff" : JH.PAL.firePatchHi;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(sx, sy, f.rx, f.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Animated pack flames: free to be tall, never wider than the rim (cap
      // at 80% of footprint width; fire-small frames are 16px wide native).
      // Wide patches add two offset flames only where they stay inside the rim
      // (offset + drawn half-width ≤ rx).
      ctx.globalAlpha = Math.max(0, 0.88 - prog * 0.45);
      let fscale = Math.max(0.5, (f.r * 1.6) / 48);
      fscale = Math.min(fscale, (2 * f.rx * 0.8) / 16);
      Assets.drawFx(ctx, "fire-small", sx, sy + 2, t, { scale: fscale });
      if (f.r > 20) {
        if (f.r * 0.45 + 8 * fscale * 0.7 <= f.rx)
          Assets.drawFx(ctx, "fire-small", sx - f.r * 0.45, sy + 3, t + 0.35, { scale: fscale * 0.7 });
        if (f.r * 0.4 + 8 * fscale * 0.75 <= f.rx)
          Assets.drawFx(ctx, "fire-small", sx + f.r * 0.4, sy + 3, t + 0.6, { scale: fscale * 0.75 });
      }
      ctx.restore();
    }
  }
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS (all files — church/mirror/balance untouched, fx manifest untouched).

- [ ] **Step 7: Commit**

```bash
git add js/config.js js/entities.js tests/entities.test.js
git commit -m "feat(fx): FirePatch rim-is-truth contract + 0.2s sizzle grace

Scorch decal and pulsing rim now draw the exact hit ellipse (shared
footprint(), GROUND_RY ratio); flames clamp to the rim width. First
contact per patch plays a sizzle + white rim flash and gives a 0.2s
window to step out before the first burn stack — Hades-style hazard
forgiveness. Grace is once per patch instance by design."
```

---

### Task 3: Bulwark dome adopts the shared ratio

**Files:**
- Modify: `js/entities.js:1268-1271` (the `DOME_RY` const)

**Interfaces:**
- Consumes: `JH.GROUND_RY` (Task 1). All five `DOME_RY` usages (Player.doSpray depth check ~371, dome draw ~1327/1333, `insideDome` ~1346) keep the same const name.

- [ ] **Step 1: Implement**

Replace:

```js
  // Dome ground-ellipse depth ratio — the DRAWN ground disc and the COLLISION
  // footprint (insideDome) share this so the barrier only affects you where the
  // visible circle is (depth is compared in screen space via feetScreenY).
  const DOME_RY = 0.45;
```

with:

```js
  // Dome ground-ellipse depth ratio — the DRAWN ground disc and the COLLISION
  // footprint (insideDome) share this so the barrier only affects you where the
  // visible circle is. Uses the game-wide ground-footprint ratio.
  const DOME_RY = JH.GROUND_RY;
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: PASS (no dome assertions exist in tests).

- [ ] **Step 3: Commit**

```bash
git add js/entities.js
git commit -m "refactor(bulwark): dome uses shared GROUND_RY (0.45 -> 0.40)

One flattening ratio game-wide so players learn one footprint shape.
Dome depth reach shrinks ~11% — accept the flatter bubble (spec Q3);
watch it in the playtest."
```

---

### Task 4: FireRing — elliptical rim crossing

**Files:**
- Modify: `js/entities.js:2037-2065` (`FireRing.update` hit test + `draw` ratios)
- Test: `tests/entities.test.js`

**Interfaces:**
- Consumes: `JH.GROUND_RY`, `stubGame` (Task 2). `FireRing` is constructed directly: `new JH.FireRing(x, y, {maxR, speed, dmg, burn})`.

- [ ] **Step 1: Write the failing test**

Append to `tests/entities.test.js`:

```js
test("FireRing: rim crossing is elliptical, matching the drawn ring", () => {
  // Ring at r=30 draws an ellipse (30, 30*GROUND_RY=12).
  // Depth 10 → rim-space 10/0.4 = 25, |25-30| < 14 → HIT (old circle missed).
  const ring = new JH.FireRing(100, 40, { maxR: 80, speed: 0, dmg: 10, burn: 1 });
  ring.r = 30;
  let g = stubGame(100, 40 + 10);
  ring.update(0.016, g);
  assert.strictEqual(g.player.hits, 1);
  // Depth 25 → rim-space 62.5 → MISS (old circle logic hit here: |25-30| < 14).
  const ring2 = new JH.FireRing(100, 40, { maxR: 80, speed: 0, dmg: 10, burn: 1 });
  ring2.r = 30;
  g = stubGame(100, 40 + 25);
  ring2.update(0.016, g);
  assert.strictEqual(g.player.hits, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/entities.test.js`
Expected: FAIL — depth-10 case misses and depth-25 case hits under the old circle test.

- [ ] **Step 3: Implement**

In `FireRing.update`, replace:

```js
        const pd = Math.hypot(pl.x - this.x, pl.y - this.y);
        if (Math.abs(pd - this.r) < 14) {
```

with:

```js
        // Rim-space distance: depth scaled up by GROUND_RY so the drawn
        // elliptical rim (rx = r, ry = r*GROUND_RY) becomes a circle of
        // radius r — the expanding edge hits exactly where it's drawn.
        const dx = pl.x - this.x;
        const dyS = Geo.feetScreenY(pl.y, 0) - Geo.feetScreenY(this.y, 0);
        const pd = Math.hypot(dx, dyS / JH.GROUND_RY);
        if (Math.abs(pd - this.r) < 14) {
```

In the ember-spawn line of `update`, replace `this.y + Math.sin(a) * this.r * 0.5` with `this.y + Math.sin(a) * this.r * JH.GROUND_RY`.

In `FireRing.draw`, replace the two ellipse calls:

```js
      ctx.beginPath(); ctx.ellipse(sx, sy, this.r, this.r * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
```
→
```js
      ctx.beginPath(); ctx.ellipse(sx, sy, this.r, this.r * JH.GROUND_RY, 0, 0, Math.PI * 2); ctx.stroke();
```

```js
      ctx.beginPath(); ctx.ellipse(sx, sy, this.r * 0.92, this.r * 0.41, 0, 0, Math.PI * 2); ctx.stroke();
```
→
```js
      ctx.beginPath(); ctx.ellipse(sx, sy, this.r * 0.92, this.r * 0.92 * JH.GROUND_RY, 0, 0, Math.PI * 2); ctx.stroke();
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/entities.js tests/entities.test.js
git commit -m "fix(slayer): FireRing hits the drawn elliptical rim, not a world circle

The dash-landing ring tested a circle while drawing a flattened ellipse,
reaching ~2.2x past the visible rim in depth — the same class of bug the
FirePatch fix removed. Rim-space distance test restores rim = hitbox."
```

---

### Task 5: Furnace vent — elliptical knockback/burn zone

**Files:**
- Modify: `js/entities.js:3648-3669` (vent effect in `Furnace.update`), `js/entities.js:3699-3707` (telegraph in `Furnace.prototype.draw`)
- Test: `tests/entities.test.js`

**Interfaces:**
- Consumes: `Geo.inGroundEllipse`, `JH.GROUND_RY`, `stubGame`. `JH.makeEnemy("furnace", x, y)` constructs a Furnace.

- [ ] **Step 1: Write the failing test**

Append to `tests/entities.test.js`:

```js
test("Furnace vent: burn/knockback only inside the drawn telegraph ellipse", () => {
  const f = JH.makeEnemy("furnace", 100, 40);
  const R = f.bodyW * 4;
  // Depth 0.6R: inside the old circle, outside the drawn ellipse (ry = 0.4R).
  let g = stubGame(100, 40 + R * 0.6);
  f.heatT = 0.001; f.heated = true;
  f.update(0.016, g);
  assert.strictEqual(g.player.burns, 0);

  const f2 = JH.makeEnemy("furnace", 100, 40);
  g = stubGame(100 + R * 0.6, 40);
  f2.heatT = 0.001; f2.heated = true;
  f2.update(0.016, g);
  assert.ok(g.player.burns > 0);
});
```

(If `Enemy.update`/`think` touches a `game` field the stub lacks, add it to `stubGame` — one shared stub.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/entities.test.js`
Expected: FAIL — depth case gets burned by the circular `dist < bodyW * 4`.

- [ ] **Step 3: Implement**

In `Furnace.update`, the vent-fire block: delete the line

```js
          const dist = Math.hypot(pl.x - this.x, pl.y - this.y);
```

replace the patch-ring depth placement `this.y + Math.sin(a) * ringR * 0.5` with `this.y + Math.sin(a) * ringR * JH.GROUND_RY`, and replace:

```js
          if (dist < this.bodyW * 4) {
```

with:

```js
          // Same ellipse the wind-up telegraph draws (R, R*GROUND_RY).
          if (Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, this.bodyW * 4)) {
```

In `Furnace.prototype.draw`, the telegraph: replace both `R * 0.4` occurrences with `R * JH.GROUND_RY` (numerically identical today; keeps the contract explicit):

```js
      ctx.beginPath(); ctx.ellipse(sx, sy, R, R * JH.GROUND_RY, 0, 0, Math.PI * 2); ctx.stroke();
      ...
      ctx.beginPath(); ctx.ellipse(sx, sy, R * prog, R * JH.GROUND_RY * prog, 0, 0, Math.PI * 2); ctx.fill();
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/entities.js tests/entities.test.js
git commit -m "fix(furnace): vent applies inside the drawn danger ellipse

Telegraph drew (R, 0.4R) but the knockback/burn was a world circle of R
— stepping below the drawn ellipse still vented you. Hit test now uses
the shared ground-footprint helper; scorch ring placement matches."
```

---

### Task 6: SmeltBomb landing + Fuse drop slam / death burn

**Files:**
- Modify: `js/entities.js:3288-3290` (SmeltBomb landing burn), `:3306` (bomb shadow ratio), `:3766` (Fuse drop slam), `:3783` (Fuse death burn), `:3803` (Fuse landing-ring ratio)
- Test: `tests/entities.test.js`

**Interfaces:**
- Consumes: `Geo.inGroundEllipse`, `JH.GROUND_RY`, `stubGame`, `JH.FUSE_DROP.slamRadius` (20), `JH.ENEMIES.fuse.deathBurnRange` (30), smelt `lobBombRadius` (34).

- [ ] **Step 1: Write the failing tests**

Append to `tests/entities.test.js`:

```js
test("SmeltBomb landing burn matches the spawned FirePatch footprint", () => {
  // lobBombRadius 34 → patch footprint rx = 34*0.85 = 28.9, ry ≈ 11.6.
  // Depth 20: the old world circle (r=34) burned; the patch ellipse must not.
  const s = JH.makeEnemy("smelt", 100, 40);
  let g = stubGame(100, 40 + 20);
  s.windTimer = 0.001;
  s.think(0.016, g);
  const bomb = g.embers.find((e) => e.vz !== undefined);
  assert.ok(bomb, "smelt should have lobbed a bomb");
  bomb.x = 100; bomb.y = 40; bomb.z = 0.0001; bomb.vz = -1;
  bomb.update(0.016, g);
  assert.strictEqual(g.player.burns, 0);

  const s2 = JH.makeEnemy("smelt", 100, 40);
  g = stubGame(120, 40);   // x-offset 20 < rx 28.9 → burn
  s2.windTimer = 0.001;
  s2.think(0.016, g);
  const bomb2 = g.embers.find((e) => e.vz !== undefined);
  bomb2.x = 100; bomb2.y = 40; bomb2.z = 0.0001; bomb2.vz = -1;
  bomb2.update(0.016, g);
  assert.strictEqual(g.player.burns, 1);
});

test("Fuse drop slam: hit zone matches the landing ring ellipse", () => {
  // slamRadius 20 → ry 8. Depth 14: old circle hit; ellipse must not.
  const f = JH.makeEnemy("fuse", 100, 40);
  let g = stubGame(100, 40 + 14);
  f.dropping = true; f.dropWait = 0; f.z = 0.0001; f.vz = -1;
  f.update(0.016, g);
  assert.strictEqual(g.player.hits, 0);

  const f2 = JH.makeEnemy("fuse", 100, 40);
  g = stubGame(112, 40);   // x-offset 12 < 20 → hit
  f2.dropping = true; f2.dropWait = 0; f2.z = 0.0001; f2.vz = -1;
  f2.update(0.016, g);
  assert.strictEqual(g.player.hits, 1);
});

test("Fuse death burn: elliptical, matching its death patch", () => {
  // deathBurnRange 30 → ry 12. Depth 20: old circle burned; ellipse must not.
  const f = JH.makeEnemy("fuse", 100, 40);
  let g = stubGame(100, 40 + 20);
  f.die(g);
  assert.strictEqual(g.player.burns, 0);

  const f2 = JH.makeEnemy("fuse", 100, 40);
  g = stubGame(120, 40);   // x-offset 20 < 30 → burn
  f2.die(g);
  assert.strictEqual(g.player.burns, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/entities.test.js`
Expected: FAIL on the depth cases (old circular tests hit/burn there).

- [ ] **Step 3: Implement**

`SmeltBomb.update` landing block — replace:

```js
        if (pl.alive && Math.hypot(pl.x - this.x, pl.y - this.y) < d.lobBombRadius)
          pl.applyBurn(1);
```

with:

```js
        // First-frame burn uses the SAME footprint as the FirePatch it just
        // spawned (rx = 0.85·radius), so frame 0 agrees with every later frame.
        if (pl.alive && Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, d.lobBombRadius * 0.85))
          pl.applyBurn(1);
```

`SmeltBomb.draw` shadow — replace `shadowR * 0.4` with `shadowR * JH.GROUND_RY`.

`Fuse.update` landing block — replace:

```js
          if (Math.hypot(pl.x - this.x, pl.y - this.y) < JH.FUSE_DROP.slamRadius && pl.z < 20)
            pl.takeHit(JH.FUSE_DROP.slamDmg, game, this.x);
```

with:

```js
          if (Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, JH.FUSE_DROP.slamRadius) && pl.z < 20)
            pl.takeHit(JH.FUSE_DROP.slamDmg, game, this.x);
```

`Fuse.die` — replace:

```js
      if (Math.hypot(game.player.x - this.x, game.player.y - this.y) < d.deathBurnRange)
        game.player.applyBurn(1);
```

with:

```js
      if (Geo.inGroundEllipse(game.player.x, game.player.y, this.x, this.y, d.deathBurnRange))
        game.player.applyBurn(1);
```

`Fuse.prototype.draw` landing ring — replace `ctx.ellipse(sx, sy, r, r * 0.45, ...)` with `ctx.ellipse(sx, sy, r, r * JH.GROUND_RY, ...)`.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/entities.js tests/entities.test.js
git commit -m "fix(fire): SmeltBomb and Fuse zones hit their drawn ellipses

SmeltBomb's first-frame burn now matches the FirePatch it spawns; Fuse
drop slam matches its landing ring; Fuse death burn matches its death
patch. All were world circles reaching past the visuals in depth."
```

---

### Task 7: Quake Walker — stomp and leap match their telegraphs

**Files:**
- Modify: `js/entities.js:2256` (stomp hit), `:2301-2302` (leap landing hit), `:2376-2379` (stomp telegraph ratios), `:2393-2403` (leap telegraph ratios)
- Test: `tests/entities.test.js`

**Interfaces:**
- Consumes: `Geo.inGroundEllipse`, `JH.GROUND_RY`, `stubGame`, `JH.QUAKE` (`stompRadius` 36, `leapRadius` 52).

- [ ] **Step 1: Write the failing tests**

Append to `tests/entities.test.js`:

```js
test("Quake stomp: old rect corners no longer hit; drawn ellipse does", () => {
  const d = JH.QUAKE;
  // Corner of the old rect (|dx|<36, |dy|<26): dx=32.4, dy=23 → old HIT.
  const q = JH.makeEnemy("quake", 100, 40);
  let g = stubGame(100 + d.stompRadius * 0.9, 40 + 23);
  q.state = "tele"; q.windTimer = 0.001; q.atkDur = 1;
  q.think(0.016, g);
  assert.strictEqual(g.player.hits, 0);
  // Dead ahead at half radius → hit.
  const q2 = JH.makeEnemy("quake", 100, 40);
  g = stubGame(100 + d.stompRadius * 0.5, 40);
  q2.state = "tele"; q2.windTimer = 0.001; q2.atkDur = 1;
  q2.think(0.016, g);
  assert.strictEqual(g.player.hits, 1);
});

test("Quake leap: landing hit matches the crosshair telegraph ellipse", () => {
  const d = JH.QUAKE;
  // Depth 0.6·leapRadius: old circle hit (31.2 < 52); ellipse (ry=20.8) must not.
  const q = JH.makeEnemy("quake", 100, 40);
  q.state = "leaping"; q.leapTarget = { x: 200, y: 40 };
  q._leapStartX = 100; q._leapStartY = 40; q._leapProgress = 0.999;
  let g = stubGame(200, 40 + d.leapRadius * 0.6);
  q.think(0.016, g);
  assert.strictEqual(g.player.hits, 0);
  // x-offset 0.7·leapRadius on the long axis → hit.
  const q2 = JH.makeEnemy("quake", 100, 40);
  q2.state = "leaping"; q2.leapTarget = { x: 200, y: 40 };
  q2._leapStartX = 100; q2._leapStartY = 40; q2._leapProgress = 0.999;
  g = stubGame(200 + d.leapRadius * 0.7, 40);
  q2.think(0.016, g);
  assert.strictEqual(g.player.hits, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/entities.test.js`
Expected: FAIL on the corner/depth cases.

- [ ] **Step 3: Implement**

Stomp hit (in the `"tele"` branch of `QuakeBoss.think`) — replace:

```js
          if (Math.abs(pl.x - this.x) < d.stompRadius && Math.abs(dy) < 26)
            pl.takeHit(d.stompDmg, game, this.x);
```

with:

```js
          if (Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, d.stompRadius))
            pl.takeHit(d.stompDmg, game, this.x);
```

Leap landing — replace:

```js
          const ldist = Math.hypot(pl.x - this.x, pl.y - this.y);
          if (ldist < d.leapRadius) pl.takeHit(d.leapDmg, game, this.x);
```

with:

```js
          if (Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, d.leapRadius))
            pl.takeHit(d.leapDmg, game, this.x);
```

`drawTelegraph` — replace both `r * 0.4` with `r * JH.GROUND_RY` (numerically identical today).

`drawLeapTelegraph` — replace the outer-ring `r * 0.45`, the crosshair verticals `r * 0.5` (both occurrences), and the fill `r * 0.45 * prog` ratios:

```js
      ctx.beginPath(); ctx.ellipse(tx, ty, r, r * JH.GROUND_RY, 0, 0, Math.PI * 2); ctx.stroke();
      // Crosshair
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(tx - r - 6, ty); ctx.lineTo(tx + r + 6, ty);
      ctx.moveTo(tx, ty - r * JH.GROUND_RY - 6); ctx.lineTo(tx, ty + r * JH.GROUND_RY + 6);
      ctx.stroke();
      // Fill progress
      ctx.globalAlpha = 0.18 + 0.2 * prog;
      ctx.fillStyle = "#ff5a5a";
      ctx.beginPath(); ctx.ellipse(tx, ty, r * prog, r * JH.GROUND_RY * prog, 0, 0, Math.PI * 2); ctx.fill();
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/entities.js tests/entities.test.js
git commit -m "fix(quake): stomp and leap landings hit their telegraph ellipses

Stomp was a 36x±26 rect and the leap a 52px world circle, both drawn as
flattened ellipses — landings hit rows the telegraph never warned.
Ported to the shared ground-footprint helper; telegraph ratios unified."
```

---

### Task 8: Slayer slam — hit the drawn ellipse

**Files:**
- Modify: `js/entities.js:3470-3471` (slam hit), `:3572-3590` (slam telegraph)
- Test: `tests/entities.test.js`

**Interfaces:**
- Consumes: `Geo.inGroundEllipse`, `JH.GROUND_RY`, `stubGame`, `JH.SLAYER.slamRange` (38).

- [ ] **Step 1: Write the failing test**

Append to `tests/entities.test.js`:

```js
test("Slayer slam: hits the drawn ellipse, not the old rect", () => {
  const d = JH.SLAYER;
  // Old rect corner (|dx|<38, |dy|<24): dx=34.2, dy=20 → old HIT; ellipse miss.
  const s = JH.makeEnemy("slayer", 100, 40);
  s.state = "slam"; s.windTimer = 0.001;
  let g = stubGame(100 + d.slamRange * 0.9, 40 + 20);
  s.think(0.016, g);
  assert.strictEqual(g.player.hits, 0);
  // Dead ahead at half range → hit.
  const s2 = JH.makeEnemy("slayer", 100, 40);
  s2.state = "slam"; s2.windTimer = 0.001;
  g = stubGame(100 + d.slamRange * 0.5, 40);
  s2.think(0.016, g);
  assert.strictEqual(g.player.hits, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/entities.test.js`
Expected: FAIL — the rect corner still hits.

- [ ] **Step 3: Implement**

Slam hit — replace:

```js
          if (Math.abs(dx) < d.slamRange && Math.abs(dy) < 24)
            pl.takeHit(d.slamDmg, game, this.x);
```

with:

```js
          if (Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, d.slamRange))
            pl.takeHit(d.slamDmg, game, this.x);
```

Slam telegraph in `SlayerBoss.draw` — replace:

```js
        // Same zone as before (slamRange x ±24 depth) but drawn as a flashing
        // ground ellipse — the bare fillRect read as a glitch, not a telegraph.
        const d = this.def;
        const flash = Math.floor(this.t * 12) & 1;
        const gy = Geo.feetScreenY(this.y, 0);
        const ry = (Geo.feetScreenY(this.y + 24, 0) - Geo.feetScreenY(this.y - 24, 0)) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(Math.round(sx), Math.round(gy), d.slamRange, Math.max(6, ry), 0, 0, Math.PI * 2);
```

with:

```js
        // The telegraph IS the hit zone: shared ground-footprint ellipse.
        const d = this.def;
        const flash = Math.floor(this.t * 12) & 1;
        const gy = Geo.feetScreenY(this.y, 0);
        const ry = d.slamRange * JH.GROUND_RY;
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(Math.round(sx), Math.round(gy), d.slamRange, Math.max(6, ry), 0, 0, Math.PI * 2);
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/entities.js tests/entities.test.js
git commit -m "fix(slayer): slam hit zone is the telegraph ellipse

The slam tested a slamRange x ±24 rect while telegraphing an ellipse —
rect corners hit outside the drawn oval. Hit and telegraph now share
the ground-footprint ellipse (38, 15.2)."
```

---

### Task 9: Slayer fireball ground shadow

**Files:**
- Modify: `js/entities.js:1108-1111` (`Fireball.draw`)

**Interfaces:**
- Consumes: `JH.GROUND_RY`. Draw-only; no behavioral change (verified by the suite staying green + Task 10 visual check).

- [ ] **Step 1: Implement**

Replace `Fireball.draw`:

```js
    draw(ctx, cam) {
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, this.z);
      Assets.draw(ctx, "fireball", sx, sy, 1, { ignited: this.igniteT <= 0, t: this.t, dir: this.dir });
    }
```

with:

```js
    draw(ctx, cam) {
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, this.z);
      // Ground shadow at the ball's (x,y) anchors its depth row while airborne
      // (same convention as SmeltBomb's landing shadow) — height vs depth is
      // otherwise ambiguous for a sinking 2.5D projectile.
      const gy = Geo.feetScreenY(this.y, 0);
      const shR = Math.max(2.5, 7 - this.z * 0.15);
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = "#220800";
      ctx.beginPath();
      ctx.ellipse(Math.round(sx), Math.round(gy), shR, shR * JH.GROUND_RY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      Assets.draw(ctx, "fireball", sx, sy, 1, { ignited: this.igniteT <= 0, t: this.t, dir: this.dir });
    }
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add js/entities.js
git commit -m "feat(slayer): fireballs cast a ground shadow while airborne

Depth-aimed balls sink from spawnZ; without a ground anchor their height
vs depth reads ambiguously (classic 2.5D projectile problem). Shadow
grows as the ball descends, like SmeltBomb's."
```

---

### Task 10: Full verification + visual smoke check

**Files:** none (verification only)

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: all tests pass (61 baseline + ~13 new).

- [ ] **Step 2: Browser smoke check**

Run: `npm run dev` and open `http://localhost:5173`. Verify at minimum:

1. A fire patch (Fuse death or douse wave) shows the scorch decal + pulsing rim; flames stay inside the rim.
2. Walking into a patch: white rim flash + sizzle sound, burn only lands if you stay ~0.2s.
3. Furnace vent telegraph ellipse = the zone that actually knocks you back (stand just below the drawn oval — no hit).
4. Slayer: dash fire ring, slam telegraph, and fireball shadows all read on the ground plane.
5. Bulwark dome still shelters/blocks where drawn (slightly flatter than before).

If anything reads wrong, fix before the final report; draw-only issues (rim alpha, shadow size) may be tuned directly.

- [ ] **Step 3: Report + STOP for the playtest gate**

Do NOT merge or push. Summarize the branch state and the behavior-deltas table to the user, and hand off for their playtest (user rule: gameplay changes need user-verified feel before integration). Suggested playtest focus: fire-zone waves (FIRE INTRO → THE SLAYER), Quake Walker fight, one Bulwark encounter.

---

## Self-review notes

- **Spec coverage:** §1 helper → Task 1; §1 port list (FirePatch, FireRing, Furnace, SmeltBomb, Slayer slam, Fuse drop, Quake leap) → Tasks 2, 4, 5, 6, 7, 8 (+ Quake stomp and Fuse death burn, same bug class); §2 GROUND_RY → Task 1 (dome: Task 3); §3 rim contract + flame clamp → Task 2; §4 grace tick → Task 2; §5 fireball depth shadow → Task 9 (SmeltBomb/Fuse already had shadows/rings — ratios unified in Tasks 5, 6).
- **Open questions resolved:** Q1 per-instance grace (Task 2), Q2 boss-telegraph grammar deferred to the boss-pattern spec (out of scope), Q3 dome accepts 0.40 (Task 3).
- **Known judgment calls for review:** FirePatch hit ry grows 0.30r → 0.34r (unification, slightly more honest vs the drawn scorch which also grows); FireRing rim band ±14 is measured in rim-space (thinner in depth — matches the drawn rim exactly); flame clamp barely binds at current sizes (fire-small is 16px native) but future-proofs bigger packs.
