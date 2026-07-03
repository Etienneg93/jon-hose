# Slayer & Fire World Implementation Plan

> **STATUS: SHIPPED** — merged to main via next-level-pass, deployed 2026-07-01. Deferred: Slayer post-defeat portrait/dialogue/Church-NPC beats (cutscene stub is live, no art/dialogue).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Burn DoT mechanic, FirePatch world object, three new fire-world enemies (Smelt, Fuse, Furnace), the Slayer boss (pool-cue fireball thrower with charge/dash movement), and the Slayer ally cutscene that unlocks the Fire Mirror branch.

**Architecture:** Burn DoT lives entirely on `Player` (`burnStacks`/`burnTimer`/`applyBurn()`). `FirePatch` is a minimal standalone class (same `DeployedShield` pattern) in a new `game.firePatches` array, checked at the bottom of `doSpray` exactly like the existing barricade/garden checks. New enemies extend `Enemy` following the existing `Smelt`/`Pyro`/`Stalker` patterns; `SlayerBoss` extends `Enemy` following `QuakeBoss`. Ally cutscene uses the same `waveCleared_()` / `afterCutscene()` branch pattern as Quake Walker, but uses `JH.LEVEL1.waves.findIndex` instead of a hardcoded index so it survives wave-placement changes.

**Tech Stack:** Vanilla JS, `node:test` + `node:assert` (see `tests/balance.test.js` and `tests/entities.test.js` for patterns), Canvas 2D procedural painters + sprite-sheet painter (`js/assets.js`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-30-slayer-fire-world-design.md`. Every task below implements a section of it.
- **Exact tunables from spec** (copy verbatim — no guessing at numbers):
  - `JH.FIRE = { burnDpsPerStack: 4, burnDuration: 2.0, maxBurnStacks: 3, patchBurnInterval: 0.4 }`
  - `JH.SLAYER.hp: 1100`, `volleyRange: 200`, `chargeDur: 0.75`, `dashSpeed: 380`, `dashDist: 220`, `dashTell: 0.15`, `dashPatchSpacing: 40`, `dashPatchRadius: 18`, `dashPatchDur: 1.2`, `volleyWind: 0.9`, `volleyCd: 2.4`, `ballCount: 2`, `enrageBallCount: 3`, `ballSpawnOffset: 22`, `ballStagger: 0.18`, `igniteDelay: 0.12`, `slamWind: 0.75`, `slamDmg: 22`, `slamRange: 38`, `enrageAt: 0.40`
  - `JH.FIREBALL = { speed: 155, dmg: 14, burnStacks: 2, radius: 14, lifespan: 2.6 }`
  - Smelt: `hp: 80, speed: 20, waterMult: 0.5, smashWind: 0.8, smashCd: 2.8, smashPatchRadius: 32, smashPatchDur: 2.0`
  - Fuse: `hp: 28, speed: 78, deathPatchRadius: 22, deathPatchDur: 0.8, deathBurnRange: 30`
  - Furnace: `hp: 320, speed: 18, heatedWaterMult: 0.2, heatThreshold: 1.5, ventWind: 0.5, ventKnock: 180, ventBurnStacks: 1, ventCd: 4.0`
- **Fire patch sizes** (source → radius, extinguishDur): Fuse death → 22, 0.8s; Slayer fireball impact → 28, 1.4s; Smelt smash → 32, 2.0s.
- **Procedural placeholder art only** for Smelt, Fuse, Furnace painters (CLAUDE.md "Art pipeline"). The SlayerBoss painter uses REAL sprites from `sprites/slayer/`.
- `game.firePatches` must be initialized in BOTH reset points in `js/game.js` (lines 272 and 691 — the same line that resets `this.shields = []`).
- Run `npm test` after every task that touches `js/balance.js`, `js/entities.js`, or `js/config.js`. Expect 44 pre-existing tests passing.
- **Transitional safety:** if a task adds config fields consumed by a class not yet written, the tests (44/44) will still pass since `doSpray` / `Player.update` etc. are integration-only. No transitional breakage risk here because tasks add new fields, not remove existing ones.

---

### Task 1: Config — JH.FIRE, JH.SLAYER, JH.FIREBALL, JH.ENEMIES additions, palette

**Files:**
- Modify: `js/config.js`

**Interfaces:**
- Consumes: nothing (data only).
- Produces: `JH.FIRE`, `JH.SLAYER`, `JH.FIREBALL`, `JH.ENEMIES.smelt`, `JH.ENEMIES.fuse`, `JH.ENEMIES.furnace`, and new `JH.PAL` keys — consumed by every later task.

- [ ] **Step 1: Add palette entries**

In `js/config.js`, in `JH.PAL`, after the existing `stalker`/`stalkerDk` line (currently `stalker: "#8a2f5a", stalkerDk: "#591b3a",`), add:

```js
    slayerBody: "#3a2010", slayerDk: "#1e0f00", slayerEmber: "#ff6010",
    smelt: "#5a3020",      smeltDk: "#3a1a08",  smeltGlow: "#ff8030",
    fuse: "#ff4810",       fuseDk: "#cc2800",
    furnaceBody: "#4a3020",furnaceDk: "#2a1808",furnaceHot: "#ff6820",
    firePatch: "#ff6010",  firePatchHi: "#ffd040",
```

- [ ] **Step 2: Add JH.FIRE config block**

In `js/config.js`, immediately after `JH.COMBO_WINDOW = 2.5;` (currently line 216), insert:

```js
  // ---- Fire element tunables (Burn DoT + FirePatch) ---------------------
  JH.FIRE = {
    burnDpsPerStack: 4,      // hp/s per stack (3 stacks = 12 hp/s for burnDuration)
    burnDuration: 2.0,       // seconds burn lasts; refreshed (not extended) on reapply
    maxBurnStacks: 3,
    patchBurnInterval: 0.4,  // min seconds between burn-stack ticks while in a patch
  };
```

- [ ] **Step 3: Add JH.SLAYER and JH.FIREBALL config blocks**

In `js/config.js`, immediately after `JH.QUAKE = { ... };` (search for `JH.QUAKE =`, currently near line 365, add after its closing `};`):

```js

  // The Slayer — Fire boss (pool cue, charge-dash movement, fireball volley).
  // After defeat: ally cutscene, elements.fire unlocked, Fire Mirror branch lit.
  // See docs/superpowers/specs/2026-06-30-slayer-fire-world-design.md.
  JH.SLAYER = {
    name: "The Slayer", hp: 1100, bodyW: 44, bodyH: 58,
    touchDmg: 15, contactCd: 0.9, suds: 280, color: "slayerBody",
    // Movement: charge-up → dash (no walk cycle)
    chargeDur: 0.75,          // fire-particle build-up before dash
    dashSpeed: 380,           // px/s during dash
    dashDist: 220,            // max px per dash
    dashTell: 0.15,           // hold in dash pose before launching (visual beat)
    dashPatchSpacing: 40,     // px between FirePatch spawns along trail
    dashPatchRadius: 18,      // radius of each trail patch
    dashPatchDur: 1.2,        // extinguish duration for trail patches
    // Attack: Fireball Volley
    volleyRange: 200,         // px: trigger volley when player within this distance
    volleyWind: 0.9,          // cue wind-up duration (s)
    volleyCd: 2.4,            // post-volley cooldown
    ballCount: 2,             // balls per volley
    enrageBallCount: 3,       // balls per volley when enraged
    ballSpawnOffset: 22,      // px in front of Slayer where the ball materialises
    ballStagger: 0.18,        // seconds between each ball in a volley
    igniteDelay: 0.12,        // s after launch before fireball activates burn
    // Attack: Slam
    slamWind: 0.75, slamDmg: 22, slamRange: 38,
    // Behaviour
    enrageAt: 0.40,
  };
  JH.FIREBALL = {
    speed: 155, dmg: 14, burnStacks: 2, radius: 14, lifespan: 2.6,
  };
```

- [ ] **Step 4: Add Smelt, Fuse, Furnace stat blocks**

In `js/config.js`, in `JH.ENEMIES`, after the `stalker` entry (the last enemy block), insert:

```js
    // Fire-world enemies — Smelt/Fuse are regular (elite-scaleable); Furnace
    // is a curated elite (no `tough` flag in its wave entry).
    smelt: {
      name: "Smelt", hp: 80, speed: 20, touchDmg: 10, contactCd: 1.0,
      waterMult: 0.5,          // water flashes off dense/hot material
      smashWind: 0.8, smashCd: 2.8,
      smashPatchRadius: 32, smashPatchDur: 2.0,
      suds: 20, dropMult: 1.4, bodyW: 22, bodyH: 34, color: "smelt",
    },
    fuse: {
      name: "Fuse", hp: 28, speed: 78, touchDmg: 8, contactCd: 0.6,
      waterMult: 1.0,
      deathPatchRadius: 22, deathPatchDur: 0.8,
      deathBurnRange: 30,      // px: Jon within this on death → +1 burn stack
      suds: 12, dropMult: 1.0, bodyW: 14, bodyH: 24, color: "fuse",
    },
    furnace: {
      name: "Furnace", hp: 320, speed: 18, touchDmg: 14, contactCd: 1.0,
      waterMult: 1.0,          // normal phase: full spray damage
      heatedWaterMult: 0.2,    // heated phase: 20% spray damage
      heatThreshold: 1.5,      // continuous spray-seconds before heating triggers
      ventWind: 0.5,           // delay after heat threshold before vent fires (s)
      ventKnock: 180,          // knockback impulse on vent (px/s)
      ventBurnStacks: 1,       // burn stacks applied by vent
      ventCd: 4.0,             // post-vent cooldown before it can heat again
      suds: 55, dropMult: 1.8, bodyW: 22, bodyH: 36, color: "furnaceBody",
    },
```

- [ ] **Step 5: Smoke-check the file still loads**

Run: `node -e "global.window = {}; require('./js/config.js'); console.log(window.JH.FIRE.burnDpsPerStack, window.JH.SLAYER.hp, window.JH.ENEMIES.furnace.heatThreshold)"`
Expected: prints `4 1100 1.5`.

- [ ] **Step 6: Run the test suite**

Run: `npm test`
Expected: PASS (44/44 — config changes are additive, nothing removed).

- [ ] **Step 7: Commit**

```bash
git add js/config.js
git commit -m "feat(config): JH.FIRE, JH.SLAYER, JH.FIREBALL, fire-world enemy stats + palette"
```

---

### Task 2: Pure logic — `Balance.furnaceShouldVent` (TDD)

**Files:**
- Modify: `js/balance.js`
- Test: `tests/balance.test.js`

**Interfaces:**
- Produces: `Balance.furnaceShouldVent(continuousSprayT, heatThreshold, ventCdT)` → `boolean`. Returns `true` when the Furnace should enter vent wind-up: `continuousSprayT >= heatThreshold && ventCdT <= 0`. Consumed by Task 6 (`Furnace.onSprayHit`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/balance.test.js` (end of file):

```js
test("furnaceShouldVent: true when spray threshold reached and not on cooldown", () => {
  assert.strictEqual(Balance.furnaceShouldVent(1.5, 1.5, 0), true);   // exactly at threshold
  assert.strictEqual(Balance.furnaceShouldVent(2.0, 1.5, 0), true);   // over threshold
});

test("furnaceShouldVent: false when still building up spray time", () => {
  assert.strictEqual(Balance.furnaceShouldVent(1.4, 1.5, 0), false);  // just under threshold
  assert.strictEqual(Balance.furnaceShouldVent(0, 1.5, 0), false);    // no spray yet
});

test("furnaceShouldVent: false when on cooldown even if threshold reached", () => {
  assert.strictEqual(Balance.furnaceShouldVent(2.0, 1.5, 0.1), false); // ventCdT > 0
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: failures referencing `Balance.furnaceShouldVent is not a function`.

- [ ] **Step 3: Implement the function**

In `js/balance.js`, add after `stalkerBlinkTarget` (the last function, before the closing `};` of the `Balance` object — currently around line 100):

```js

    // Should the Furnace enter its vent wind-up? True when the player has
    // sprayed it continuously past the heat threshold and the post-vent
    // cooldown has expired. Pure — inputs are all passed in.
    furnaceShouldVent(continuousSprayT, heatThreshold, ventCdT) {
      return continuousSprayT >= heatThreshold && ventCdT <= 0;
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (47/47 — 44 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add js/balance.js tests/balance.test.js
git commit -m "feat(balance): pure furnaceShouldVent heat-threshold check (TDD)"
```

---

### Task 3: Burn DoT — Player fields, `applyBurn()`, tick, + integration test

**Files:**
- Modify: `js/entities.js` (Player class)
- Test: `tests/entities.test.js`

**Interfaces:**
- Consumes: `JH.FIRE.burnDpsPerStack`, `JH.FIRE.burnDuration`, `JH.FIRE.maxBurnStacks` (Task 1).
- Produces: `Player.burnStacks` (int), `Player.burnTimer` (float), `Player.applyBurn(n)`. Called by Task 6 (Furnace vent), Task 7 (Fireball hit), Task 4 (Fuse death). Tested here via the `entities.test.js` pattern (require config + entities, instantiate `JH.Player` with a stub game).

- [ ] **Step 1: Write the integration tests**

Append to `tests/entities.test.js`:

```js
// Minimal Player stub — Player constructor reads JH.Upgrades.computeStats().
// Ensure Upgrades is initialised before constructing a Player.
function makePlayer() {
  JH.Upgrades.reset();
  return new JH.Player(60, 40);
}

test("Player.applyBurn: adds stacks and resets timer", () => {
  const p = makePlayer();
  assert.strictEqual(p.burnStacks, 0);
  p.applyBurn(2);
  assert.strictEqual(p.burnStacks, 2);
  assert.strictEqual(p.burnTimer, JH.FIRE.burnDuration);
});

test("Player.applyBurn: caps stacks at maxBurnStacks", () => {
  const p = makePlayer();
  p.applyBurn(2);
  p.applyBurn(2);  // would be 4, capped at 3
  assert.strictEqual(p.burnStacks, JH.FIRE.maxBurnStacks);
});

test("Player.applyBurn: refreshes timer even when already burning", () => {
  const p = makePlayer();
  p.applyBurn(1);
  p.burnTimer = 0.5;  // simulate partial drain
  p.applyBurn(1);
  assert.strictEqual(p.burnTimer, JH.FIRE.burnDuration);  // reset, not extended
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: failures referencing `p.applyBurn is not a function`.

- [ ] **Step 3: Add fields to Player constructor**

In `js/entities.js`, in the `Player` constructor, after `this.kibbleRegen = 0;` (currently line 174), add:

```js
      this.burnStacks = 0;   // active burn stacks (0–3); cleared when burnTimer expires
      this.burnTimer = 0;    // seconds of burn remaining
```

- [ ] **Step 4: Add the `applyBurn` method**

In `js/entities.js`, in the `Player` class, add `applyBurn` immediately after `applyStats`:

```js
    applyBurn(n) {
      this.burnStacks = Math.min(this.burnStacks + n, JH.FIRE.maxBurnStacks);
      this.burnTimer = JH.FIRE.burnDuration;
    }
```

- [ ] **Step 5: Add the burn tick to `Player.update`**

In `js/entities.js`, in `Player.update`, after the existing timer decrements block (after `if (this.pressureBuffT > 0) this.pressureBuffT -= dt;`, currently line 188), add:

```js
      // Burn DoT: tick while burnTimer > 0; clears stacks on expiry.
      if (this.burnTimer > 0) {
        this.burnTimer -= dt;
        this.hp = Math.max(0, this.hp - this.burnStacks * JH.FIRE.burnDpsPerStack * dt);
        this.hurt();   // reuses the existing white hurt-flash to signal burn damage
        if (this.burnTimer <= 0) { this.burnTimer = 0; this.burnStacks = 0; }
        if (this.hp <= 0) this.alive = false;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (50/50 — 47 + 3 new burn tests).

- [ ] **Step 7: Commit**

```bash
git add js/entities.js tests/entities.test.js
git commit -m "feat(player): burn DoT — burnStacks/burnTimer/applyBurn + tick (TDD)"
```

---

### Task 4: `FirePatch` class + `game.firePatches` wiring

**Files:**
- Modify: `js/entities.js` (add `FirePatch` class after `JH.DeployedShield = DeployedShield;`)
- Modify: `js/game.js` (init, update, cull, draw)

**Interfaces:**
- Consumes: `JH.FIRE.patchBurnInterval` (Task 1), `Player.applyBurn` (Task 3).
- Produces: `JH.FirePatch` — `new JH.FirePatch(x, y, radius, extinguishDur)`. Fields: `.x`, `.y`, `.z` (0), `.radius`, `.extinguishDur`, `.sprayProgress` (0), `.patchBurnT` (0), `.dead` (false), `.t` (0). Methods: `.update(dt, game)` (burn-tick player on overlap), `.draw(ctx, cam)` (glowing oval, shrinks as extinguished). Consumed by Task 5 (Fuse death), Task 6 (Smelt smash), Task 7 (Fireball impact + Slayer dash trail), Task 10 (doSpray extinguish check).

- [ ] **Step 1: Add the FirePatch class**

In `js/entities.js`, immediately after `JH.DeployedShield = DeployedShield;` (search for that exact string), insert:

```js

  // ---- FirePatch: stationary burning ground zone ----
  // Left behind by Fuse deaths, Smelt smashes, Slayer fireballs, and the
  // Slayer's dash trail. Applies burn stacks to the player on overlap;
  // extinguished by spraying directly (tracked in Player.doSpray, not here).
  // See docs/superpowers/specs/2026-06-30-slayer-fire-world-design.md.
  class FirePatch {
    constructor(x, y, radius, extinguishDur) {
      this.x = x; this.y = y; this.z = 0;
      this.radius = radius;
      this.extinguishDur = extinguishDur;
      this.sprayProgress = 0;  // accumulated spray time; reaches extinguishDur to die
      this.patchBurnT = 0;     // cooldown between burn-stack applications
      this.dead = false; this.t = 0;
    }
    update(dt, game) {
      this.t += dt;
      if (this.patchBurnT > 0) this.patchBurnT -= dt;
      const pl = game.player;
      if (pl && pl.alive) {
        const dist = Math.hypot(pl.x - this.x, pl.y - this.y);
        if (dist < this.radius + pl.bodyW * 0.5 && this.patchBurnT <= 0) {
          pl.applyBurn(1);
          this.patchBurnT = JH.FIRE.patchBurnInterval;
        }
      }
      if (this.sprayProgress >= this.extinguishDur) this.dead = true;
    }
    draw(ctx, cam) {
      const sx = this.x - cam;
      const sy = Geo.feetScreenY(this.y, 0);
      const prog = this.sprayProgress / this.extinguishDur;
      const r = Math.max(2, this.radius * (1 - prog));
      const flick = 0.5 + 0.5 * Math.sin(this.t * 18);
      ctx.save();
      ctx.globalAlpha = (0.55 + 0.25 * flick) * (1 - prog * 0.4);
      ctx.beginPath();
      ctx.ellipse(Math.round(sx), Math.round(sy), r, r * 0.38, 0, 0, Math.PI * 2);
      ctx.fillStyle = flick > 0.5 ? JH.PAL.firePatch : JH.PAL.firePatchHi;
      ctx.fill();
      ctx.restore();
    }
  }
  JH.FirePatch = FirePatch;
```

- [ ] **Step 2: Initialize `game.firePatches` in both reset points**

In `js/game.js`, find this line (it appears TWICE — in `startGame()` around line 272 and in `respawnAtCheckpoint()` around line 691):

```js
      this.enemies = []; this.embers = []; this.pickups = []; this.particles = []; this.shields = [];
```

Replace **both occurrences** with:

```js
      this.enemies = []; this.embers = []; this.pickups = []; this.particles = []; this.shields = []; this.firePatches = [];
```

- [ ] **Step 3: Add update + cull to the main loop**

In `js/game.js`, find:

```js
      for (const s of this.shields) s.update(dt);
```

Replace with:

```js
      for (const s of this.shields) s.update(dt);
      for (const fp of this.firePatches) fp.update(dt, this);
```

Then find:

```js
      this.shields = this.shields.filter((s) => !s.dead);
```

Replace with:

```js
      this.shields = this.shields.filter((s) => !s.dead);
      this.firePatches = this.firePatches.filter((fp) => !fp.dead);
```

- [ ] **Step 4: Add draw to the render pass**

In `js/game.js`, find:

```js
        // planted Bulwark shields (static world props, drawn like the wall/gardens)
        for (const s of this.shields) s.draw(ctx, cam);
```

Replace with:

```js
        // planted Bulwark shields (static world props, drawn like the wall/gardens)
        for (const s of this.shields) s.draw(ctx, cam);

        // fire patches (burning ground zones from Fuse deaths, Smelt smashes, etc.)
        for (const fp of this.firePatches) fp.draw(ctx, cam);
```

- [ ] **Step 5: Run the test suite**

Run: `npm test`
Expected: PASS (50/50 — `FirePatch` class has no automated test; confirms nothing else broke).

- [ ] **Step 6: Commit**

```bash
git add js/entities.js js/game.js
git commit -m "feat(entities): FirePatch world object + game.firePatches wiring"
```

---

### Task 5: Smelt + Fuse enemy classes + painters

**Files:**
- Modify: `js/entities.js` (add Smelt + Fuse classes before `JH.makeEnemy`; register in factory)
- Modify: `js/assets.js` (add Smelt + Fuse procedural painters)

**Interfaces:**
- Consumes: `JH.ENEMIES.smelt`, `JH.ENEMIES.fuse` (Task 1); `JH.FirePatch` (Task 4); `Player.applyBurn` (Task 3).
- Produces: `JH.Smelt`, `JH.Fuse` registered in `JH.makeEnemy`.

- [ ] **Step 1: Add Smelt and Fuse classes**

In `js/entities.js`, immediately before `JH.makeEnemy = function (type, x, y)` (search for that exact string), insert:

```js
  // ---- Smelt: slow, arena-control, half-effective spray ----
  // Approaches slowly; on a cooldown wind-up, smashes the ground to create a
  // FirePatch. waterMult:0.5 means spray does half damage — stay on it or it
  // tiles the arena. Extends Enemy, overrides think().
  class Smelt extends Enemy {
    think(dt, game) {
      const pl = game.player, d = this.def;
      const dx = pl.x - this.x, dy = pl.y - this.y;
      const dist = Math.hypot(dx, dy);
      this.facing = dx >= 0 ? 1 : -1;

      if (this.windTimer > 0) {
        this.windTimer -= dt; this.state = "wind";
        if (this.windTimer <= 0) {
          game.firePatches.push(new JH.FirePatch(this.x, this.y, d.smashPatchRadius, d.smashPatchDur));
          burst(game, this.x, this.y, 2, JH.PAL.smeltGlow, 10, { speed: 90, life: 0.45, up: 40 });
          this.cdTimer = d.smashCd;
        }
        return;
      }
      if (this.cdTimer > 0) { this.cdTimer -= dt; }

      if (dist < this.bodyW + 14 && this.cdTimer <= 0 && this.spawnGrace <= 0) {
        this.windTimer = d.smashWind; this.state = "wind";
        return;
      }
      if (dist > 18 && this.spawnGrace <= 0) {
        this.x += (dx / (dist || 1)) * d.speed * dt;
        this.y += (dy / (dist || 1)) * d.speed * dt * 0.7;
        this.state = "walk";
      } else {
        this.state = "idle";
      }
    }
  }
  JH.Smelt = Smelt;

  // ---- Fuse: fast rusher, fire-patch death burst ----
  // Dies in ~1.5s at full Jon DPS — the mechanic is WHERE it dies. Death
  // creates a FirePatch + applies 1 burn stack if Jon is in deathBurnRange.
  class Fuse extends Enemy {
    die(game) {
      const d = this.def;
      game.firePatches.push(new JH.FirePatch(this.x, this.y, d.deathPatchRadius, d.deathPatchDur));
      burst(game, this.x, this.y, 6, JH.PAL.fuse, 12, { speed: 110, life: 0.4, up: 60 });
      if (Math.hypot(game.player.x - this.x, game.player.y - this.y) < d.deathBurnRange)
        game.player.applyBurn(1);
      super.die(game);
    }
  }
  JH.Fuse = Fuse;
```

- [ ] **Step 2: Register in the factory**

In `js/entities.js`, in `JH.makeEnemy` (search for `if (type === "bulwark") return new Bulwark`), add after the `stalker` line:

```js
    if (type === "smelt") return new Smelt(type, x, y);
    if (type === "fuse") return new Fuse(type, x, y);
```

- [ ] **Step 3: Add procedural painters**

In `js/assets.js`, after the `deployed_shield` painter (search for `Assets.register("deployed_shield"`) and its closing `});`, add:

```js

  // ============================ SMELT ==================================
  // Procedural placeholder. Heavy, slow fire-worker. `wind` = smash wind-up.
  Assets.register("smelt", (p, opt) => {
    const f = opt.frame | 0;
    const ls = (opt.state === "walk") ? legStep(f) * 0.4 : 0;
    if (opt.hurt && (f & 1)) return;
    p(-8 + ls, 0, 7, 12, PAL.smeltDk);
    p(1 - ls, 0, 7, 12, PAL.smeltDk);
    p(-11, 12, 22, 16, PAL.smelt);
    p(-11, 12, 22, 3, PAL.smeltDk);
    p(-5, 28, 10, 9, PAL.skin);
    p(-5, 32, 10, 3, PAL.smeltDk);
    p(1, 30, 2, 2, "#111");
    if (opt.state === "wind") {
      p(-13, 10, 26, 4, PAL.smeltGlow);   // glowing wind-up band
    }
  });

  // ============================ FUSE ===================================
  // Procedural placeholder. Fast, low-HP, dangerous in death.
  Assets.register("fuse", (p, opt) => {
    const f = opt.frame | 0;
    const ls = (opt.state === "walk") ? legStep(f) : 0;
    if (opt.hurt && (f & 1)) return;
    p(-4 + ls, 0, 4, 8, PAL.fuseDk);
    p(0 - ls, 0, 4, 8, PAL.fuseDk);
    p(-5, 8, 10, 12, PAL.fuse);
    p(-5, 8, 10, 2, PAL.fuseDk);
    p(-3, 18, 6, 7, PAL.skin);
    p(1, 19, 2, 2, "#111");
  });
```

- [ ] **Step 4: Smoke-check assets.js syntax**

Run: `node -e "global.window = {}; global.document = { createElement: () => ({ getContext: () => ({}) }) }; try { require('./js/assets.js'); } catch (e) { console.log('Expected browser-only error: ' + e.message); }"`
Expected: fails on a browser-only API (not a syntax error from the new painters).

- [ ] **Step 5: Run the test suite**

Run: `npm test`
Expected: PASS (50/50).

- [ ] **Step 6: Commit**

```bash
git add js/entities.js js/assets.js
git commit -m "feat(enemies): Smelt (arena-control) + Fuse (death-placement) + painters"
```

---

### Task 6: Furnace class + painter + `onSprayHit` hook in `doSpray`

**Files:**
- Modify: `js/entities.js` (Furnace class before `JH.makeEnemy`; `onSprayHit` call in `doSpray`; register in factory)
- Modify: `js/assets.js` (Furnace painter)

**Interfaces:**
- Consumes: `JH.ENEMIES.furnace` (Task 1); `Balance.furnaceShouldVent` (Task 2); `Player.applyBurn` (Task 3).
- Produces: `JH.Furnace`. The `onSprayHit(dt, game)` method on `Furnace` is called from `doSpray`'s damage loop — add a generic `e.onSprayHit && e.onSprayHit(dt, game)` call there (after `e.takeDamage`) so any future enemy can use this hook without further changes to `doSpray`.

- [ ] **Step 1: Add the Furnace class**

In `js/entities.js`, immediately before `JH.Smelt = Smelt;` (added in Task 5), insert:

```js
  // ---- Furnace: rhythm-based curated elite ----
  // Sustained spray causes it to heat up (reduced damage, visual glow), then
  // vent steam (knockback + burn). Burst-spray rhythm is the counter. No elite-
  // ramp (`tough: false` in its wave entry). Extends Enemy, adds onSprayHit().
  class Furnace extends Enemy {
    constructor(type, x, y) {
      super(type, x, y);
      this.continuousSprayT = 0;   // resets if spray pauses > 0.3s
      this.lastSprayT = -99;       // game time of last onSprayHit call
      this.heated = false;         // true during the vent wind-up
      this.heatT = -1;             // vent wind-up countdown (-1 = inactive)
      this.ventCdT = 0;            // post-vent cooldown
    }
    onSprayHit(dt, game) {
      const d = this.def;
      this.lastSprayT = this.t;
      this.continuousSprayT += dt;
      if (this.heatT >= 0) return;  // already in vent wind-up, don't re-trigger
      if (JH.Balance.furnaceShouldVent(this.continuousSprayT, d.heatThreshold, this.ventCdT)) {
        this.heatT = d.ventWind;
        this.heated = true;
      }
    }
    takeDamage(dmg, game, dirX, knock) {
      // Apply heatedWaterMult when in the heated phase. `dmg` here is the raw
      // spray damage computed by doSpray; we scale it down for the vent window.
      const mult = this.heated ? this.def.heatedWaterMult : 1;
      super.takeDamage(dmg * mult, game, dirX, knock);
    }
    update(dt, game) {
      super.update(dt, game);   // base Enemy update (physics, contact, animate)
      const d = this.def;
      if (this.ventCdT > 0) this.ventCdT -= dt;
      // If spray stopped for > 0.3s, reset heat build-up.
      if (this.t - this.lastSprayT > 0.3) this.continuousSprayT = 0;
      // Vent wind-up countdown.
      if (this.heatT >= 0) {
        this.heatT -= dt;
        if (this.heatT <= 0) {
          // Vent fires.
          const pl = game.player;
          const dist = Math.hypot(pl.x - this.x, pl.y - this.y);
          if (dist < this.bodyW * 4) {
            const dir = pl.x >= this.x ? 1 : -1;
            pl.applyKnockback(dir, d.ventKnock);
            pl.applyBurn(d.ventBurnStacks);
            burst(game, this.x, this.y, 10, "#d0e8ff", 14, { speed: 140, life: 0.4, up: 60 });
            game.shake(4);
          }
          this.heatT = -1;
          this.heated = false;
          this.continuousSprayT = 0;
          this.ventCdT = d.ventCd;
        }
      }
    }
    think(dt, game) {
      // Slow melee chaser — inherits default Enemy.think() (no override needed).
      const pl = game.player, d = this.def;
      const dx = pl.x - this.x, dy = pl.y - this.y, dist = Math.hypot(dx, dy);
      this.facing = dx >= 0 ? 1 : -1;
      if (dist > 18 && this.spawnGrace <= 0) {
        this.x += (dx / (dist || 1)) * d.speed * dt;
        this.y += (dy / (dist || 1)) * d.speed * dt * 0.7;
        this.state = "walk";
      } else { this.state = "idle"; }
    }
  }
  JH.Furnace = Furnace;
```

- [ ] **Step 2: Register Furnace in the factory**

In `js/entities.js`, in `JH.makeEnemy`, after the `fuse` line (added in Task 5), add:

```js
    if (type === "furnace") return new Furnace(type, x, y);
```

- [ ] **Step 3: Add the `onSprayHit` hook to `doSpray`'s damage loop**

In `js/entities.js`, in `Player.doSpray`, find the line:

```js
        e.takeDamage(dmg, game, this.facing, 0);
```

Replace with:

```js
        e.takeDamage(dmg, game, this.facing, 0);
        if (e.onSprayHit) e.onSprayHit(dt, game);
```

(Note: `Furnace.takeDamage` scales `dmg` internally using `heatedWaterMult` — but the `dmg` computed on the line above is the raw value from `doSpray`. The `takeDamage` override on `Furnace` will apply the mult inside `super.takeDamage`, so the existing `e.takeDamage(dmg, ...)` call already works correctly — no change to how `dmg` is computed here.)

- [ ] **Step 4: Add the Furnace painter**

In `js/assets.js`, after the `fuse` painter (the closing `});` of the Fuse painter), add:

```js

  // ============================ FURNACE ================================
  // Procedural placeholder. Bulky golem. `opt.heated` = glowing red vent phase.
  Assets.register("furnace", (p, opt) => {
    const f = opt.frame | 0;
    const ls = (opt.state === "walk") ? legStep(f) * 0.5 : 0;
    if (opt.hurt && (f & 1)) return;
    const hot = !!opt.heated;
    p(-8 + ls, 0, 7, 12, PAL.furnaceDk);
    p(1 - ls, 0, 7, 12, PAL.furnaceDk);
    p(-11, 12, 22, 18, hot ? PAL.furnaceHot : PAL.furnaceBody);
    p(-11, 12, 22, 3, PAL.furnaceDk);
    p(-11, 24, 22, 4, hot ? PAL.smeltGlow : PAL.furnaceDk);
    p(-5, 30, 10, 9, PAL.skin);
    p(-5, 34, 10, 3, PAL.furnaceDk);
    p(1, 32, 2, 2, "#111");
  });
```

The painter needs `opt.heated` passed in. Furnace inherits `Enemy.draw()` which calls `Assets.draw(ctx, this.type, sx, sy, this.facing, { state, frame, hurt, ... })`. Extend it to include `heated`:

Override `draw` on Furnace immediately after the class definition (`JH.Furnace = Furnace;`):

```js
  Furnace.prototype.draw = function(ctx, cam) {
    const sx = this.x - cam, sy = Geo.feetScreenY(this.y, 0);
    Assets.shadow(ctx, sx, sy, this.bodyW * 0.7);
    Assets.draw(ctx, "furnace", sx, Geo.feetScreenY(this.y, this.z), this.facing, {
      state: this.state, frame: this.frame, t: this.t,
      hurt: this.flashTimer > 0, hurtAlpha: this.flashTimer / 0.18,
      heated: this.heated,
      scale: 1,
    });
    if (this.hp < this.maxHp) {
      const w = this.bodyW + 4;
      const bx = Math.round(sx - w / 2), by = Math.round(sy - this.bodyH - 8);
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(bx, by, w, 3);
      ctx.fillStyle = "#ff5a5a"; ctx.fillRect(bx, by, Math.round(w * (this.hp / this.maxHp)), 3);
    }
  };
```

- [ ] **Step 5: Run the test suite**

Run: `npm test`
Expected: PASS (50/50).

- [ ] **Step 6: Commit**

```bash
git add js/entities.js js/assets.js
git commit -m "feat(enemies): Furnace (rhythm, heated/vent) + painter + onSprayHit hook"
```

---

### Task 7: Fireball projectile + doSpray fire-patch extinguish check + Fireball painter

**Files:**
- Modify: `js/entities.js` (add `Fireball` class after `Ember` class; add fire-patch extinguish check at bottom of `doSpray`)
- Modify: `js/assets.js` (add Fireball painter)

**Interfaces:**
- Consumes: `JH.FIREBALL` (Task 1); `JH.FirePatch` (Task 4); `Player.applyBurn` (Task 3).
- Produces: `JH.Fireball` — `new JH.Fireball(x, y, dir, game)`. Fields: `.x`,`.y`,`.z`,`.dir`,`.vx`,`.dmg`,`.radius`,`.burnStacks`,`.igniteT`,`.life`,`.t`,`.dead`. Pushed into `game.embers` (same pipeline as `Ember`/`Shockwave`). `doSpray` fire-patch check consumed by Task 8 (SlayerBoss.onSprayHit NOT needed — patches extinguish via spray-aimed-at-patch, not per-enemy).

- [ ] **Step 1: Add the Fireball class**

In `js/entities.js`, immediately after `JH.Ember = Ember;` (search for that exact string), insert:

```js

  // ---- Fireball: Slayer's pool-cue projectile ----
  // Spawns as a plain pool ball, ignites after igniteDelay (visual + burn on hit).
  // Travels horizontally at a fixed depth row. Leaves a FirePatch on player hit.
  // Pushed into game.embers so it runs through the same update/draw pipeline.
  class Fireball {
    constructor(x, y, dir, game) {
      const d = JH.FIREBALL;
      this.x = x; this.y = y; this.z = 8;
      this.dir = dir;
      this.vx = d.speed * dir;
      this.dmg = d.dmg;
      this.radius = d.radius;
      this.burnStacks = d.burnStacks;
      this.igniteT = d.igniteDelay;  // counts down to 0; burn only activates after this
      this.life = d.lifespan;
      this.t = 0;
      this.dead = false;
    }
    update(dt, game) {
      this.t += dt;
      if (this.igniteT > 0) this.igniteT -= dt;
      this.x += this.vx * dt;
      this.z = Math.max(0, this.z - 4 * dt);  // slight droop
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return !this.dead; }
      // Emit trailing fire particles once ignited.
      if (this.igniteT <= 0 && Math.random() < 0.6) {
        game.particles.push(new Particle({
          x: this.x - this.dir * 4, y: this.y, z: this.z + 4,
          vx: -this.dir * 20 + (Math.random() - 0.5) * 30,
          vy: (Math.random() - 0.5) * 20,
          vz: 15 + Math.random() * 20,
          life: 0.18 + Math.random() * 0.12,
          color: Math.random() > 0.4 ? JH.PAL.firePatch : JH.PAL.firePatchHi,
          size: 2, grav: 160,
        }));
      }
      // Hit check against player.
      const pl = game.player;
      if (pl.alive && this.igniteT <= 0) {
        const dist = Math.hypot(pl.x - this.x, pl.y - this.y);
        const zDiff = Math.abs((pl.z || 0) - this.z);
        if (dist < this.radius + pl.bodyW * 0.5 && zDiff < 24) {
          pl.takeHit(this.dmg, game, this.x);
          pl.applyBurn(this.burnStacks);
          game.firePatches.push(new JH.FirePatch(this.x, this.y, 28, 1.4));
          burst(game, this.x, this.y, this.z, JH.PAL.firePatch, 8, { speed: 90, life: 0.35, up: 50 });
          game.shake(3);
          this.dead = true;
        }
      }
      return !this.dead;
    }
    draw(ctx, cam) {
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, this.z);
      const ignited = this.igniteT <= 0;
      const flick = Math.floor(this.t * 14) & 1;
      ctx.save();
      ctx.fillStyle = ignited ? (flick ? JH.PAL.firePatch : JH.PAL.firePatchHi) : "#f0eecc";
      ctx.beginPath();
      ctx.arc(Math.round(sx), Math.round(sy), ignited ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  JH.Fireball = Fireball;
```

- [ ] **Step 2: Add the fire-patch extinguish check to `doSpray`**

In `js/entities.js`, in `Player.doSpray`, find the garden-box check at the bottom:

```js
      // Garden boxes: face each box and match its depth to water it.
      if (game.gardens) {
        for (const garden of game.gardens) {
```

Immediately BEFORE that block, insert:

```js
      // Fire patches: spray aimed at a patch's depth advances its extinguish timer.
      if (game.firePatches) {
        for (const fp of game.firePatches) {
          if (fp.dead) continue;
          const fwd = (fp.x - ox) * this.facing;
          if (fwd > 0 && fwd - this.bodyW * 0.5 - fp.radius <= reach
              && Math.abs(fp.y - oy) < S.sprayHitBand)
            fp.sprayProgress += dt;
        }
      }
```

- [ ] **Step 3: Add the Fireball painter**

In `js/assets.js`, after the `furnace` painter, add:

```js

  // ============================ FIREBALL ===============================
  // Slayer's pool ball — plain off-white before igniting, then orange/yellow.
  // The update() method draws this directly via the draw() on the class itself;
  // `Assets.register` is used only if other code calls `Assets.draw("fireball")`.
  Assets.register("fireball", (p, opt) => {
    const ignited = !!(opt.ignited);
    const flick = Math.floor((opt.t || 0) * 14) & 1;
    p(-5, 4, 10, 10, ignited ? (flick ? PAL.firePatch : PAL.firePatchHi) : "#f0eecc");
  });
```

- [ ] **Step 4: Run the test suite**

Run: `npm test`
Expected: PASS (50/50).

- [ ] **Step 5: Commit**

```bash
git add js/entities.js js/assets.js
git commit -m "feat(entities): Fireball projectile + doSpray fire-patch extinguish check"
```

---

### Task 8: SlayerBoss class + Slayer sprite painter

**Files:**
- Modify: `js/entities.js` (add `SlayerBoss` class before `JH.makeEnemy`; register)
- Modify: `js/assets.js` (add sprite-sheet painter for Slayer using real PNGs)

**Interfaces:**
- Consumes: `JH.SLAYER` (Task 1); `JH.FIREBALL` + `JH.Fireball` (Task 7); `JH.FirePatch` (Task 4); `Player.applyBurn` (Task 3); sprite files at `sprites/slayer/{idle,dash,cueWind,cueRelease}.png`.
- Produces: `JH.SlayerBoss`, registered as `type === "slayer"` in `JH.makeEnemy`.

- [ ] **Step 1: Add the SlayerBoss class**

In `js/entities.js`, immediately before `JH.Smelt = Smelt;` (search for that string), insert:

```js
  // ---- SlayerBoss: Fire boss ----
  // Charge-up/dash movement (no walk cycle), fireball volley, slam attack.
  // After defeat: ally cutscene triggers in waveCleared_() → fire element unlocked.
  // See docs/superpowers/specs/2026-06-30-slayer-fire-world-design.md.
  class SlayerBoss extends Enemy {
    constructor(x, y) {
      super("mook", x, y);
      this.def = JH.SLAYER;
      this.type = "slayer";
      this.hp = this.maxHp = JH.SLAYER.hp;
      this.bodyW = JH.SLAYER.bodyW; this.bodyH = JH.SLAYER.bodyH;
      this.isBoss = true;
      this.state = "charge";     // initial: charge up before first dash
      // Charge/dash state
      this.chargeT = 0;
      this.dashTarget = null;    // {x,y} computed when charge completes
      this.dashTellT = 0;
      this.dashPatchAcc = 0;     // accumulated travel px for trail patch spawning
      // Volley state
      this.windTimer = 0;
      this.volleyBallsLeft = 0;
      this.volleyT = 0;
      // Cooldown between attack cycles
      this.cdTimer = 0.8;        // initial settle time
      this.strikeFx = 0;
    }

    think(dt, game) {
      this.x = clamp(this.x, game.bounds.minX + 24, game.bounds.maxX - 24);
      const pl = game.player, d = this.def;
      const dx = pl.x - this.x, dy = pl.y - this.y, dist = Math.hypot(dx, dy);
      const enraged = this.hp / this.maxHp < d.enrageAt;
      if (this.strikeFx > 0) this.strikeFx -= dt;
      if (this.cdTimer > 0) { this.cdTimer -= dt; this.state = "idle"; return; }

      // ---- CHARGE: fire particles build up, then snap to dash ----
      if (this.state === "charge") {
        this.chargeT += dt;
        this.facing = dx >= 0 ? 1 : -1;
        const density = Math.min(1, this.chargeT / d.chargeDur);
        if (Math.random() < density * 2.5 * dt * 60)
          burst(game, this.x + (Math.random() - 0.5) * 16,
            this.y + (Math.random() - 0.5) * 8, 12 + Math.random() * 16,
            JH.PAL.slayerEmber, 1, { speed: 50, life: 0.22, up: 30 });
        if (this.chargeT >= d.chargeDur) {
          this.dashTarget = { x: pl.x, y: clamp(pl.y, JH.DEPTH_MIN, JH.DEPTH_MAX) };
          this.dashTellT = d.dashTell;
          this.dashPatchAcc = 0;
          this.state = "pre_dash";
        }
        return;
      }

      // ---- PRE_DASH: brief hold in dash pose ----
      if (this.state === "pre_dash") {
        this.dashTellT -= dt;
        this.state = "pre_dash";   // keep as pre_dash; painter reads "dash" sprite
        if (this.dashTellT <= 0) this.state = "dash";
        return;
      }

      // ---- DASH: move to dashTarget, spawn trail patches ----
      if (this.state === "dash") {
        const tdx = this.dashTarget.x - this.x, tdy = this.dashTarget.y - this.y;
        const tdist = Math.hypot(tdx, tdy);
        if (tdist < 8) {
          // Dash complete — decide next attack.
          this.chargeT = 0;
          if (dist < d.slamRange + 10) {
            this.windTimer = enraged ? d.slamWind * 0.8 : d.slamWind;
            this.state = "slam";
          } else if (dist < d.volleyRange) {
            this.volleyBallsLeft = enraged ? d.enrageBallCount : d.ballCount;
            this.windTimer = enraged ? d.volleyWind * 0.8 : d.volleyWind;
            this.state = "cueWind";
          } else {
            this.state = "charge";
          }
          return;
        }
        const step = Math.min(tdist, d.dashSpeed * dt);
        const nx = tdx / tdist, ny = tdy / tdist;
        this.x += nx * step; this.y += ny * step;
        this.dashPatchAcc += step;
        // Emit particles and spawn trail fire patches.
        if (Math.random() < 0.7)
          burst(game, this.x, this.y, 4, JH.PAL.slayerEmber, 1, { speed: 70, life: 0.15, up: 10 });
        while (this.dashPatchAcc >= d.dashPatchSpacing) {
          this.dashPatchAcc -= d.dashPatchSpacing;
          game.firePatches.push(new JH.FirePatch(this.x, this.y, d.dashPatchRadius, d.dashPatchDur));
        }
        this.facing = tdx >= 0 ? 1 : -1;
        return;
      }

      // ---- SLAM ----
      if (this.state === "slam") {
        this.windTimer -= dt;
        if (this.windTimer <= 0) {
          if (Math.abs(dx) < d.slamRange && Math.abs(dy) < 24)
            pl.takeHit(d.slamDmg, game, this.x);
          for (let i = 0; i < 10; i++)
            burst(game, this.x + (Math.random() - 0.5) * 24, this.y + (Math.random() - 0.5) * 16, 4,
              JH.PAL.smeltGlow, 1, { speed: 100, life: 0.4, up: 50 });
          game.shake(8); game.audio.play("whack");
          this.strikeFx = 0.2;
          this.cdTimer = enraged ? d.volleyCd * 0.6 : d.volleyCd * 0.5;
          this.state = "idle";
        }
        return;
      }

      // ---- CUE WIND-UP ----
      if (this.state === "cueWind") {
        this.windTimer -= dt;
        if (this.windTimer <= 0) {
          // Fire first ball, transition to volley-fire state.
          this._fireOneBall(game, enraged);
          this.volleyBallsLeft--;
          this.volleyT = d.ballStagger;
          this.state = this.volleyBallsLeft > 0 ? "volley" : "post_volley";
          if (this.state === "post_volley") this.windTimer = 0.15;
        }
        return;
      }

      // ---- VOLLEY: stagger remaining balls ----
      if (this.state === "volley") {
        this.volleyT -= dt;
        if (this.volleyT <= 0) {
          this._fireOneBall(game, enraged);
          this.volleyBallsLeft--;
          if (this.volleyBallsLeft > 0) {
            this.volleyT = d.ballStagger;
          } else {
            this.windTimer = 0.15;   // brief cueRelease hold
            this.state = "post_volley";
          }
        }
        return;
      }

      // ---- POST_VOLLEY: cueRelease sprite flash ----
      if (this.state === "post_volley") {
        this.windTimer -= dt;
        if (this.windTimer <= 0) {
          this.cdTimer = enraged ? d.volleyCd * 0.8 : d.volleyCd;
          this.chargeT = 0;
          this.state = "idle";
        }
        return;
      }
    }

    _fireOneBall(game, enraged) {
      const d = this.def;
      const bx = this.x + this.facing * d.ballSpawnOffset;
      game.embers.push(new JH.Fireball(bx, this.y, this.facing, game));
      game.audio.play("jump");
    }

    draw(ctx, cam) {
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, 0);
      Assets.shadow(ctx, sx, sy, this.bodyW * 0.75);
      // Map internal state to sprite state string.
      let spriteState = "idle";
      if (this.state === "dash" || this.state === "pre_dash") spriteState = "dash";
      else if (this.state === "cueWind") spriteState = "cueWind";
      else if (this.state === "post_volley") spriteState = "cueRelease";
      Assets.draw(ctx, "slayer", sx, sy, this.facing, {
        state: spriteState,
        hurt: this.flashTimer > 0,
        hurtAlpha: Math.min(this.flashTimer / 0.18, 1),
      });
      if (this.hp < this.maxHp) {
        const w = this.bodyW + 8;
        const bx = Math.round(sx - w / 2), by = Math.round(Geo.feetScreenY(this.y, 0) - this.bodyH - 10);
        ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(bx - 1, by - 1, w + 2, 6);
        ctx.fillStyle = "#5a2a1a"; ctx.fillRect(bx, by, w, 4);
        ctx.fillStyle = JH.PAL.slayerEmber; ctx.fillRect(bx, by, Math.round(w * (this.hp / this.maxHp)), 4);
      }
      // Slam telegraph zone.
      if (this.state === "slam" && this.strikeFx <= 0) {
        const d = this.def;
        const flash = Math.floor(this.t * 12) & 1;
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = flash ? "#ff6010" : "#ff3000";
        ctx.fillRect(Math.round(sx - d.slamRange), Math.round(Geo.feetScreenY(this.y - 24, 0)),
          d.slamRange * 2, Math.round(Geo.feetScreenY(this.y + 24, 0) - Geo.feetScreenY(this.y - 24, 0)));
        ctx.restore();
      }
    }

    die(game) {
      if (this.dead) return;
      this.dead = true;
      game.audio.play("win");
      spawnCoinFountain(game, this.x, this.y, this.def.suds);  // local fn in same IIFE
      game.onEnemyKilled(this);   // triggers Church.markBossDefeated("slayer")
    }
  }
  JH.SlayerBoss = SlayerBoss;
```

- [ ] **Step 2: Register SlayerBoss in the factory**

In `js/entities.js`, in `JH.makeEnemy`, after `if (type === "quake") return new QuakeBoss(x, y);`, add:

```js
    if (type === "slayer") return new SlayerBoss(x, y);
```

- [ ] **Step 3: Add the Slayer sprite painter**

In `js/assets.js`, after the `fireball` painter, add:

```js

  // ============================ SLAYER (BOSS) ==========================
  // Real sprite sheets — 4 static PNG states (no walk cycle).
  const SLAYER_H = 58;
  const _slayerImgs = {
    idle:       JH.Loader.img("sprites/slayer/idle.png"),
    dash:       JH.Loader.img("sprites/slayer/dash.png"),
    cueWind:    JH.Loader.img("sprites/slayer/cueWind.png"),
    cueRelease: JH.Loader.img("sprites/slayer/cueRelease.png"),
  };
  Assets.register("slayer", (p, opt, ctx, x, y, facing) => {
    if (opt.hurt && (Math.floor((opt.t || 0) * 10) & 1)) return;
    const key = _slayerImgs[opt.state] ? opt.state : "idle";
    const img = _slayerImgs[key];
    if (!img || !img.complete || !img.naturalWidth) {
      // Fallback placeholder while sprites are loading.
      p(-22, 0, 44, SLAYER_H, PAL.slayerBody);
      p(-22, 0, 44, 3, PAL.slayerDk);
      return;
    }
    const scale = SLAYER_H / img.naturalHeight;
    const dw = Math.round(img.naturalWidth * scale);
    ctx.save();
    ctx.translate(x, y);
    if (facing < 0) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -Math.round(dw / 2), -SLAYER_H, dw, SLAYER_H);
    ctx.restore();
  });
```

- [ ] **Step 4: Run the test suite**

Run: `npm test`
Expected: PASS (50/50 — SlayerBoss is integration-only; tests confirm nothing else broke).

- [ ] **Step 5: Commit**

```bash
git add js/entities.js js/assets.js
git commit -m "feat(boss): SlayerBoss — charge/dash movement, fireball volley, slam + sprite painter"
```

---

### Task 9: game.js — Slayer ally cutscene + firePatches + wave entry stubs

**Files:**
- Modify: `js/game.js`
- Modify: `js/config.js` (add two new wave entries + WAVE_TRIGGERS extension)

**Interfaces:**
- Consumes: `JH.SlayerBoss` (Task 8); `JH.Church.markBossDefeated("slayer")` (already wired generically in `game.onEnemyKilled` — no code change needed there); `game.firePatches` init (Task 4 already added to both reset lines).
- Produces: a `waveCleared_()` branch that triggers the Slayer ally cutscene; a new `afterSlayerCutscene()` method; placeholder wave entries for playtesting.

**Note on wave placement:** exact positions in the campaign are deferred to the wave-flow pacing spec (memory: `project_wave_flow_redesign`). This task adds fire-world waves APPENDED after the current Gateway Krusher entry so they're reachable for playtesting. The cutscene branch uses a dynamic `findIndex` rather than a hardcoded wave index so it survives future wave reordering.

- [ ] **Step 1: Add fire-world wave entries + WAVE_TRIGGERS**

In `js/config.js`, in `JH.LEVEL1.waves`, find:

```js
      { name: "GATEWAY KRUSHER 9000", boss: true, bossType: "gatewaykrusher" },  // true finale
```

Replace with:

```js
      { name: "GATEWAY KRUSHER 9000", boss: true, bossType: "gatewaykrusher" },
      // ---- Fire World (placeholder position — move with wave-flow pacing spec) ----
      { name: "FIRE INTRO", spawns: [{ type: "fuse", count: 3 }, { type: "smelt", count: 1 }] },
      { name: "FURNACE TRIAL", spawns: [{ type: "furnace", count: 1 }, { type: "fuse", count: 2 }] },
      { name: "THE SLAYER", boss: true, bossType: "slayer" },
```

In `js/game.js`, find the `WAVE_TRIGGERS` line (currently line 13):

```js
  const WAVE_TRIGGERS = [360, 840, 1320, 1800, 2300, 2820, 3340, 3860, 4380, 4920, 5100, 5280, 5440, 5960, 6480, 7000];
```

Replace with:

```js
  const WAVE_TRIGGERS = [360, 840, 1320, 1800, 2300, 2820, 3340, 3860, 4380, 4920, 5100, 5280, 5440, 5960, 6480, 7000, 7400, 7700, 8000];
```

- [ ] **Step 2: Add Slayer cutscene branch in `waveCleared_()`**

In `js/game.js`, in `waveCleared_()`, find:

```js
      // After Quake Walker (index 9), play his ally cutscene before continuing.
      if (this.waveIndex === 9) {
```

Immediately AFTER the closing `}` of that Quake Walker `if` block (the `return;` + `}`), add:

```js

      // After The Slayer, play his ally cutscene before continuing.
      // Dynamic findIndex so this survives wave-list reordering.
      const slayerIdx = JH.LEVEL1.waves.findIndex((w) => w.bossType === "slayer");
      if (slayerIdx >= 0 && this.waveIndex === slayerIdx) {
        JH.Camera.unlock();
        this.state = "cutscene";
        this.cutscene = { phase: 0, nextWave: slayerIdx + 1, who: "slayer" };
        document.getElementById("hud").classList.add("hidden");
        document.getElementById("banner").classList.add("hidden");
        return;
      }
```

- [ ] **Step 3: Add `afterSlayerCutscene()` (or extend `afterCutscene`)**

The existing `afterCutscene(nextWaveIdx)` is hardcoded to Quake Walker. Add a parallel method `afterSlayerCutscene` in `js/game.js`, immediately after `afterCutscene`:

```js
    afterSlayerCutscene(nextWaveIdx) {
      this.cutscene = null;
      this.state = "play";
      const slayerIdx = JH.LEVEL1.waves.findIndex((w) => w.bossType === "slayer");
      const clearedWave = JH.LEVEL1.waves[slayerIdx];
      if (clearedWave) {
        document.getElementById("hud-wave").textContent = clearedWave.name;
        document.getElementById("hud-wave-label").classList.remove("hidden");
      }
      this.bounds = { minX: 8, maxX: WAVE_TRIGGERS[nextWaveIdx] + 30 };
      this.shopNpc = new JH.ShopNPC(WAVE_TRIGGERS[nextWaveIdx] - 150, JH.DEPTH_MIN + 6);
      this.showScreen("hud");
      this.banner("THE SLAYER JOINS YOUR SIDE!", 2.4);
    },
```

- [ ] **Step 4: Route the cutscene dispatch**

The existing cutscene update loop (in `update()`) calls `this.afterCutscene(cs.nextWave)` when `cs.phase >= 3`. We need it to dispatch to `afterSlayerCutscene` when `cs.who === "slayer"`. Find:

```js
            if (cs.phase >= 3) this.afterCutscene(cs.nextWave);
```

Replace with:

```js
            if (cs.phase >= 3) {
              if (this.cutscene && this.cutscene.who === "slayer")
                this.afterSlayerCutscene(this.cutscene.nextWave);
              else
                this.afterCutscene(this.cutscene ? this.cutscene.nextWave : 10);
            }
```

- [ ] **Step 5: Verify the wave-trigger array length matches waves length**

Run: `node -e "global.window = {}; require('./js/config.js'); console.log(window.JH.LEVEL1.waves.length)"`
Expected: prints `19` (16 original + 3 new).

Then confirm WAVE_TRIGGERS has 19 entries (count manually from the array you just edited — it should be `[360, 840, 1320, 1800, 2300, 2820, 3340, 3860, 4380, 4920, 5100, 5280, 5440, 5960, 6480, 7000, 7400, 7700, 8000]` — that is 19 values).

- [ ] **Step 6: Run the test suite**

Run: `npm test`
Expected: PASS (50/50).

- [ ] **Step 7: Commit**

```bash
git add js/config.js js/game.js
git commit -m "feat(waves): fire-world waves + Slayer ally cutscene branch (dynamic wave index)"
```

---

### Task 10: Manual playtest verification

**Files:** none (verification only, no commit).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background) — serves at `http://localhost:5173/`. Check first if still running: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/`.

- [ ] **Step 2: Verify Burn DoT**

Dev wave-select (backtick on localhost) → warp to "FIRE INTRO". Let a Fuse die near Jon. Confirm:
- HP bar drains for ~2 seconds after the death-burst.
- Draining stops when `burnTimer` expires (no indefinite drain).

- [ ] **Step 3: Verify FirePatch**

Stay in "FIRE INTRO" wave. Confirm:
- Fuse death leaves a glowing oval on the ground at its death position.
- Standing in it applies burn stacks.
- Spraying the patch (aim at its ground depth) causes it to visibly shrink and disappear after ~0.8s of spray.

- [ ] **Step 4: Verify Smelt**

Warp to "FIRE INTRO". Confirm:
- Smelt approaches slowly; when adjacent, telegraphs (wind-up visual), then drops a large fire patch (radius 32).
- Jon's spray deals noticeably less damage per second to Smelt than to a mook (waterMult 0.5 — roughly half the HP drain rate).

- [ ] **Step 5: Verify Furnace**

Warp to "FURNACE TRIAL". Hold spray on the Furnace for 1.5s continuously. Confirm:
- It begins to glow/redden (painted differently in `opt.heated = true`).
- After ~0.5s more, it vents steam (blue-white burst + Jon is knocked back).
- Jon takes 1 burn stack from the vent.
- Burst-spraying (stop before the glow intensifies) prevents the vent.

- [ ] **Step 6: Verify Slayer boss**

Warp to "THE SLAYER". Confirm:
- Slayer stays in idle pose while fire particles build up during the charge (~0.75s).
- Snaps to dash pose, zips across the arena; fire patches appear along the trail.
- If within volley range on landing: cue wind-up → pool ball materialises → shoots across floor → ignites in flight (visual change at ~0.12s) → hits player for damage + burn.
- If within slam range on landing: telegraphs slam zone → punch.
- When HP < 40%: volley fires 3 balls, timing speeds up.
- Killing Slayer: coin fountain spawns, ally cutscene plays ("THE SLAYER JOINS YOUR SIDE!").
- After cutscene: `JH.Church.state.elements.fire === true` (check in devtools).

- [ ] **Step 7: Confirm no regressions**

Warp through "STALKER AMBUSH", "WAVE 6", "GATEWAY KRUSHER 9000" to confirm existing waves are unaffected (no `PAGEERROR` in console, correct enemy spawns).

- [ ] **Step 8: Report result**

No commit for this task — summarize what was confirmed and any tuning notes (Slayer HP, Furnace heatThreshold, Fuse speed, etc.) for the user to weigh in on.

---
