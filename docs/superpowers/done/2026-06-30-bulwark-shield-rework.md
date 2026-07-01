# Bulwark Shield Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Bulwark's permanent body-mounted shield (which read as "completely
unkillable" in playtest) with a throw/deploy/pickup cycle: the Bulwark's own body is
*never* a blocker and always takes full damage; instead it periodically plants its
shield as a separate, stationary, indestructible `DeployedShield` object that hard-blocks
the player's spray (every beam tier), then fights shieldless until it sprints back to
reclaim it.

**Architecture:** A new `DeployedShield` class (`js/entities.js`) follows the existing
`Wall`/`GardenBox` pattern — a small standalone object tracked in a new `game.shields`
array, updated/drawn alongside the other lightweight per-run world objects. `Bulwark`
becomes a 5-phase state machine (`armed` → `winding` → deploy → `shieldless` →
`retrieving`) reusing the inherited `windTimer` field the same way `Charger`/`Pyro` do.
`Player.doSpray`'s existing "nearest hard blocker, even for pierce" loop (from the prior
Bulwark work) gets a second blocker source — `game.shields` — and loses its
Bulwark-facing-specific branch entirely. One new pure function,
`Balance.bulwarkShouldThrow`, gates the throw trigger and is unit-tested like the other
`js/balance.js` functions.

**Tech Stack:** Vanilla JS, `node:test` + `node:assert` (`tests/balance.test.js`),
Canvas 2D procedural painters (`js/assets.js`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-30-bulwark-shield-rework-design.md`. Every task
  below implements a specific section of it.
- **Tunables (exact values, from the spec's table):** `hp: 420`, `throwRange: 80`,
  `throwWind: 0.5`, `shieldlessDur: 3.5`, `retrieveSpeedMult: 1.6`, `pickupRadius: 16`,
  `shieldBodyW: 16`. `speed` (26), `touchDmg` (14), `contactCd` (1.0), `suds` (60),
  `waterMult`/`dropMult`/`bodyW`/`bodyH`/`color` are unchanged from the current config.
- **Pure logic goes in `js/balance.js`**, dual-exported (`root.JH.Balance` /
  `module.exports`), parameters only — no `JH.*` global reads inside pure functions. See
  `js/balance.js:1-101` and `tests/balance.test.js:1-15` for the pattern.
- **Procedural placeholder art only** (per `CLAUDE.md` "Art pipeline"): keep new/changed
  painter comments minimal.
- **No double-ramp / no facing-block reintroduction:** the Bulwark's body must never
  multiply or zero out incoming spray damage in any phase — that's the entire point of
  this rework. If you find yourself adding a damage multiplier back onto the Bulwark
  entity itself, stop — that's the bug being fixed.
- **Transitional task ordering — read this before objecting to "dead-looking" code:**
  Tasks 1-2 *add* new fields/functions without removing the old `turnCooldown`/
  `frontDmgMult`/`bulwarkShielded` ones yet, because `Bulwark.think()` and `doSpray`
  still reference them until Tasks 4-5 land. Removing them early would silently corrupt
  damage math (e.g. `dmg = ... * undefined` → `NaN` → an enemy whose `hp` can never read
  `<= 0`) in the commits between tasks, even though no automated test would catch it
  (`doSpray`/`Bulwark.think()` are integration-only, per the existing project
  convention). Task 6 deletes them once nothing references them. Do not reorder tasks to
  "clean up" early.
- Run `npm test` after every task that touches `js/balance.js`, `js/entities.js`, or
  `js/config.js`. Expect 43 pre-existing tests to keep passing throughout, plus whatever
  each task adds.

---

### Task 1: Pure logic — `Balance.bulwarkShouldThrow` (TDD)

**Files:**
- Modify: `js/balance.js` (add 1 function)
- Test: `tests/balance.test.js` (append new tests)

**Interfaces:**
- Produces: `Balance.bulwarkShouldThrow(bulwarkX, bulwarkY, playerX, playerY, throwRange)`
  → `boolean`. True when the player is within `throwRange` of the Bulwark (a plain
  Euclidean distance check — no angle/facing component, since `Bulwark.facing` will
  update freely every frame once Task 4 lands, so it's always already oriented toward
  whatever triggered the throw).
- Consumed by: Task 4 (`Bulwark.think()`'s `armed`-phase throw trigger).

- [ ] **Step 1: Write the failing tests**

In `tests/balance.test.js`, insert these 4 tests immediately before the existing
`test("bulwarkShielded: attacker in front of the Bulwark's facing is shielded", ...)`
block (currently starting at line 91):

```js
test("bulwarkShouldThrow: true when the player is within range", () => {
  assert.strictEqual(Balance.bulwarkShouldThrow(100, 40, 150, 40, 80), true);  // dist 50 <= 80
  assert.strictEqual(Balance.bulwarkShouldThrow(100, 40, 100, 40, 80), true);  // dist 0
});

test("bulwarkShouldThrow: false when the player is out of range", () => {
  assert.strictEqual(Balance.bulwarkShouldThrow(100, 40, 250, 40, 80), false); // dist 150
});

test("bulwarkShouldThrow: accounts for depth (y), not just x", () => {
  // hypot(30, 80) ≈ 85.44 > 80
  assert.strictEqual(Balance.bulwarkShouldThrow(100, 0, 130, 80, 80), false);
});

test("bulwarkShouldThrow: exactly at range counts as in range", () => {
  assert.strictEqual(Balance.bulwarkShouldThrow(0, 0, 80, 0, 80), true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: failures referencing `Balance.bulwarkShouldThrow is not a function` — all
pre-existing tests still pass.

- [ ] **Step 3: Implement the function**

In `js/balance.js`, insert immediately before the existing `bulwarkShielded` function
(currently starting at line 88, right after `dropThresholds`'s closing `},`):

```js

    // Is the player within throwRange of the Bulwark? Pure distance check —
    // facing/angle doesn't matter since Bulwark.facing now updates freely
    // every frame (no turn-cooldown), so it's already oriented correctly.
    bulwarkShouldThrow(bulwarkX, bulwarkY, playerX, playerY, throwRange) {
      const dist = Math.hypot(playerX - bulwarkX, playerY - bulwarkY);
      return dist <= throwRange;
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all new tests plus the existing 43 tests green (47 total).

- [ ] **Step 5: Commit**

```bash
git add js/balance.js tests/balance.test.js
git commit -m "feat(balance): pure bulwarkShouldThrow range check for the shield-throw rework"
```

---

### Task 2: Config — new Bulwark tunables (transitional: old fields stay for now)

**Files:**
- Modify: `js/config.js` (the `bulwark` entry in `JH.ENEMIES`, currently lines 157-161)

**Interfaces:**
- Consumes: nothing (data only).
- Produces: `JH.ENEMIES.bulwark.{throwRange,throwWind,shieldlessDur,retrieveSpeedMult,
  pickupRadius,shieldBodyW}` (consumed by Task 3's `DeployedShield` constructor and
  Task 4's `Bulwark.think()`); `hp: 420` (no other task depends on the literal value,
  it's just the live stat).
- `turnCooldown`/`frontDmgMult` are **left in place** per the Global Constraints
  transitional-ordering note — Task 6 removes them.

- [ ] **Step 1: Replace the bulwark block**

In `js/config.js`, replace:

```js
    bulwark: {
      name: "Bulwark", hp: 220, speed: 26, touchDmg: 14, contactCd: 1.0,
      turnCooldown: 1.1, frontDmgMult: 0,
      suds: 60, waterMult: 1, dropMult: 1.6, bodyW: 22, bodyH: 34, color: "bulwark",
    },
```

with:

```js
    bulwark: {
      name: "Bulwark", hp: 420, speed: 26, touchDmg: 14, contactCd: 1.0,
      // Shield-throw cycle (seconds/px) — see docs/superpowers/specs/
      // 2026-06-30-bulwark-shield-rework-design.md. turnCooldown/frontDmgMult
      // are retained here only until the Bulwark/doSpray rewrite lands later
      // in this plan — they become dead code and are deleted then (Task 6).
      turnCooldown: 1.1, frontDmgMult: 0,
      throwRange: 80, throwWind: 0.5, shieldlessDur: 3.5,
      retrieveSpeedMult: 1.6, pickupRadius: 16, shieldBodyW: 16,
      suds: 60, waterMult: 1, dropMult: 1.6, bodyW: 22, bodyH: 34, color: "bulwark",
    },
```

- [ ] **Step 2: Sanity-check the file still loads**

Run: `node -e "global.window = {}; require('./js/config.js'); console.log(window.JH.ENEMIES.bulwark.hp, window.JH.ENEMIES.bulwark.throwRange)"`
Expected: prints `420 80`.

- [ ] **Step 3: Run the test suite**

Run: `npm test`
Expected: PASS (47/47 — config.js is loaded by several test files).

- [ ] **Step 4: Commit**

```bash
git add js/config.js
git commit -m "feat(config): new Bulwark shield-throw tunables, hp 220->420"
```

---

### Task 3: `DeployedShield` class + `game.shields` array wiring

**Files:**
- Modify: `js/entities.js` (add class after `JH.Bulwark = Bulwark;`, currently line 928)
- Modify: `js/game.js` (init the array in 2 places, update/cull in the main loop, draw
  in the render pass)

**Interfaces:**
- Consumes: `JH.ENEMIES.bulwark.shieldBodyW` (Task 2), `Geo.feetScreenY` (`js/world.js`),
  `Assets.shadow`/`Assets.draw` (`js/assets.js`).
- Produces: `JH.DeployedShield` — `new JH.DeployedShield(x, y, owner)` with fields
  `.x`, `.y`, `.z` (always 0), `.bodyW`, `.owner`, `.dead` (bool, externally settable),
  `.t`; methods `.update(dt)`, `.draw(ctx, cam)`. Consumed by Task 4 (Bulwark spawns and
  reclaims one) and Task 5 (`doSpray` scans `game.shields` for blockers).
- Nothing pushes into `game.shields` yet in this task — it's wired but always empty
  until Task 4 lands, so this task cannot change any observable game behavior.

- [ ] **Step 1: Add the `DeployedShield` class**

In `js/entities.js`, insert immediately after `JH.Bulwark = Bulwark;` (currently line
928) and before the `// ---- Stalker: fast "blink harasser" super-elite ----` comment
(currently line 930):

```js

  // ---- DeployedShield: a Bulwark's planted shield ----
  // Stationary, indestructible (no takeDamage path — the player can never
  // destroy it directly). Hard-blocks Player.doSpray at every beam tier (see
  // doSpray's blocker-finding). Owned by exactly one Bulwark, which reclaims
  // (and removes) it when it returns — `dead` is only ever set by the owner
  // reclaiming it or dying, never by combat.
  class DeployedShield {
    constructor(x, y, owner) {
      this.x = x; this.y = y; this.z = 0;
      this.bodyW = JH.ENEMIES.bulwark.shieldBodyW;
      this.owner = owner;
      this.dead = false; this.t = 0;
    }
    update(dt) { this.t += dt; }
    draw(ctx, cam) {
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, 0);
      Assets.shadow(ctx, sx, sy, this.bodyW * 0.6);
      Assets.draw(ctx, "deployed_shield", sx, sy, 1, { t: this.t });
    }
  }
  JH.DeployedShield = DeployedShield;
```

- [ ] **Step 2: Initialize `game.shields` in both per-run reset points**

In `js/game.js`, find this line (it appears twice — `startGame()` around line 272 and
`respawnAtCheckpoint`'s equivalent around line 691):

```js
      this.enemies = []; this.embers = []; this.pickups = []; this.particles = [];
```

Replace **both occurrences** with:

```js
      this.enemies = []; this.embers = []; this.pickups = []; this.particles = []; this.shields = [];
```

- [ ] **Step 3: Update and cull shields in the main loop**

In `js/game.js`, find:

```js
      this.player.update(dt, this);
      for (const e of this.enemies) e.update(dt, this);
```

Replace with:

```js
      this.player.update(dt, this);
      for (const e of this.enemies) e.update(dt, this);
      for (const s of this.shields) s.update(dt);
```

Then find:

```js
      this.enemies = this.enemies.filter((e) => !e.dead);
```

Replace with:

```js
      this.enemies = this.enemies.filter((e) => !e.dead);
      this.shields = this.shields.filter((s) => !s.dead);
```

- [ ] **Step 4: Draw shields in the render pass**

In `js/game.js`, find:

```js
        // garden boxes (if a garden encounter is active)
        if (this.gardens) for (const g of this.gardens) g.draw(ctx, cam);
```

Replace with:

```js
        // garden boxes (if a garden encounter is active)
        if (this.gardens) for (const g of this.gardens) g.draw(ctx, cam);

        // planted Bulwark shields (static world props, drawn like the wall/gardens)
        for (const s of this.shields) s.draw(ctx, cam);
```

- [ ] **Step 5: Run the test suite**

Run: `npm test`
Expected: PASS (47/47 — this task adds no test-covered logic, just wiring; confirms
nothing broke).

- [ ] **Step 6: Commit**

```bash
git add js/entities.js js/game.js
git commit -m "feat(entities): DeployedShield class + game.shields array wiring"
```

---

### Task 4: Rewrite `Bulwark` as the shield-throw state machine

**Files:**
- Modify: `js/entities.js` (replace the entire `Bulwark` class, currently lines 899-928)

**Interfaces:**
- Consumes: `JH.ENEMIES.bulwark.{throwRange,throwWind,shieldlessDur,retrieveSpeedMult,
  pickupRadius}` (Task 2), `Balance.bulwarkShouldThrow` (Task 1), `JH.DeployedShield`
  (Task 3), `game.shields` (Task 3).
- Produces: `Bulwark` instances with `this.state` cycling through `"wind"`, `"walk"`,
  `"idle"`, `"retrieve"` (consumed by Task 7's painter), `this.hasShield` (bool),
  `this.shield` (a `DeployedShield` or `null`).
- This task does **not** touch `doSpray` — between this task and Task 5, the OLD
  `doSpray` logic still calls `JH.Balance.bulwarkShielded(e.x, e.facing, this.x)` against
  the Bulwark's now-freely-updating `facing`. That's a temporary semantic inconsistency
  (the body will visually "shield" again in the old check), not a crash — `bulwarkShielded`
  and `frontDmgMult` still exist in config (Task 2 kept them). `npm test` stays green
  because `doSpray` isn't exercised by any automated test. This resolves itself in Task 5.

- [ ] **Step 1: Replace the class**

In `js/entities.js`, replace the entire block from the `// ---- Bulwark: slow "moving
shield" super-elite ----` comment through `JH.Bulwark = Bulwark;` (currently lines
899-928):

```js
  // ---- Bulwark: slow "moving shield" super-elite ----
  // Chases the player but only RE-FACES every `turnCooldown` seconds — that
  // slow turn is the counter-play window (dash behind it before it pivots
  // back). The shield-blocking itself lives in Player.doSpray (it needs to
  // know the attacker's position, which the Bulwark doesn't track).
  class Bulwark extends Enemy {
    constructor(type, x, y) {
      super(type, x, y);
      this.turnTimer = 0;
    }
    think(dt, game) {
      const pl = game.player, d = this.def;
      const dx = pl.x - this.x, dy = pl.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (this.turnTimer > 0) this.turnTimer -= dt;
      const wantFacing = dx >= 0 ? 1 : -1;
      if (wantFacing !== this.facing && this.turnTimer <= 0) {
        this.facing = wantFacing;
        this.turnTimer = d.turnCooldown;
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
  JH.Bulwark = Bulwark;
```

with:

```js
  // ---- Bulwark: "shield trooper" super-elite ----
  // Body is NEVER a blocker — it always takes full damage, in every phase.
  // It periodically plants its shield as a separate, stationary
  // DeployedShield (above) that hard-blocks spray, then fights shieldless
  // until it sprints back to reclaim it. See docs/superpowers/specs/
  // 2026-06-30-bulwark-shield-rework-design.md.
  class Bulwark extends Enemy {
    constructor(type, x, y) {
      super(type, x, y);
      this.hasShield = true;   // true: can throw; false: shieldless, must retrieve
      this.shield = null;      // its own DeployedShield instance while deployed
      this.shieldlessTimer = 0;
    }
    die(game) {
      if (this.shield) { this.shield.dead = true; this.shield = null; }
      super.die(game);
    }
    think(dt, game) {
      const pl = game.player, d = this.def;
      const dx = pl.x - this.x, dy = pl.y - this.y;
      const dist = Math.hypot(dx, dy);
      this.facing = dx >= 0 ? 1 : -1;

      if (this.state === "retrieve") {
        const sx = this.shield ? this.shield.x - this.x : 0;
        const sy = this.shield ? this.shield.y - this.y : 0;
        const sdist = Math.hypot(sx, sy);
        if (!this.shield || this.shield.dead || sdist <= d.pickupRadius) {
          if (this.shield) this.shield.dead = true;
          this.shield = null;
          this.hasShield = true;
          this.state = "walk";
          return;
        }
        this.x += (sx / sdist) * d.speed * d.retrieveSpeedMult * dt;
        this.y += (sy / sdist) * d.speed * d.retrieveSpeedMult * dt * 0.7;
        return;
      }

      if (!this.hasShield) {
        this.shieldlessTimer -= dt;
        if (this.shieldlessTimer <= 0) { this.state = "retrieve"; return; }
        if (dist > 18 && this.spawnGrace <= 0) {
          this.x += (dx / (dist || 1)) * d.speed * dt;
          this.y += (dy / (dist || 1)) * d.speed * dt * 0.7;
          this.state = "walk";
        } else {
          this.state = "idle";
        }
        return;
      }

      if (this.windTimer > 0) {
        this.windTimer -= dt; this.state = "wind";
        if (this.windTimer <= 0) {
          const shield = new JH.DeployedShield(this.x, this.y, this);
          game.shields.push(shield);
          this.shield = shield;
          this.hasShield = false;
          this.shieldlessTimer = d.shieldlessDur;
          this.state = "walk";
        }
        return;
      }

      if (this.spawnGrace <= 0 && JH.Balance.bulwarkShouldThrow(this.x, this.y, pl.x, pl.y, d.throwRange)) {
        this.windTimer = d.throwWind; this.state = "wind";
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
  JH.Bulwark = Bulwark;
```

- [ ] **Step 2: Run the test suite**

Run: `npm test`
Expected: PASS (47/47 — no automated test exercises `Bulwark.think()` directly, per
project convention; confirms nothing else broke).

- [ ] **Step 3: Commit**

```bash
git add js/entities.js
git commit -m "feat(enemies): rewrite Bulwark as a shield-throw/retrieve state machine"
```

---

### Task 5: Rewrite `doSpray` to block via `game.shields`, not Bulwark facing

**Files:**
- Modify: `js/entities.js:334-349` (blocker-finding)
- Modify: `js/entities.js:381-396` (damage loop header through the `takeDamage` call)

**Interfaces:**
- Consumes: `game.shields` (Task 3).
- Produces: nothing further downstream (leaf gameplay logic). After this task,
  `Balance.bulwarkShielded` and `JH.ENEMIES.bulwark.frontDmgMult` have no remaining
  callers/readers anywhere in the codebase — Task 6 deletes them.

- [ ] **Step 1: Replace the blocker-finding block**

In `js/entities.js`, replace lines 334-349:

```js
      // Hydro Lance (beam=3) pierces the whole line; default stops at first target.
      // A SHIELDING Bulwark hard-blocks the stream at every beam tier — pierce
      // punches through everything except a raised shield (spec: "Shield mechanic").
      const pierce = beam >= 3;
      let blocker = null;
      {
        let minFwd = Infinity;
        for (const e of game.enemies) {
          if (e.dead) continue;
          if (!Geo.inHitArc(this, e, this.facing, reach, S.sprayHitBand)) continue;
          const shielding = e.type === "bulwark" && JH.Balance.bulwarkShielded(e.x, e.facing, this.x);
          if (pierce && !shielding) continue;   // pierce only stops at a shielding Bulwark
          const fwd = (e.x - ox) * this.facing;
          if (fwd < minFwd) { minFwd = fwd; blocker = e; }
        }
      }
```

with:

```js
      // Hydro Lance (beam=3) pierces the whole line; default stops at first
      // target. A planted DeployedShield (Bulwark's thrown shield) hard-blocks
      // the stream at every beam tier — nothing else blocks pierce.
      const pierce = beam >= 3;
      let blocker = null;
      {
        let minFwd = Infinity;
        if (!pierce) {
          for (const e of game.enemies) {
            if (e.dead) continue;
            if (!Geo.inHitArc(this, e, this.facing, reach, S.sprayHitBand)) continue;
            const fwd = (e.x - ox) * this.facing;
            if (fwd < minFwd) { minFwd = fwd; blocker = e; }
          }
        }
        for (const s of game.shields) {
          if (s.dead) continue;
          if (!Geo.inHitArc(this, s, this.facing, reach, S.sprayHitBand)) continue;
          const fwd = (s.x - ox) * this.facing;
          if (fwd < minFwd) { minFwd = fwd; blocker = s; }
        }
      }
```

- [ ] **Step 2: Replace the damage loop header**

In `js/entities.js`, replace lines 381-396:

```js
      // Damage enemies: non-pierce hits only the closest (blocker); pierce hits
      // everyone EXCEPT anyone standing behind a shielding Bulwark's wall.
      let didHit = false;
      const hitEnemies = [];
      let healAmt = 0;
      const blockerFwd = blocker ? (blocker.x - ox) * this.facing : Infinity;
      for (const e of game.enemies) {
        if (e.dead) continue;
        if (!Geo.inHitArc(this, e, this.facing, reach, S.sprayHitBand)) continue;
        if (!pierce && e !== blocker) continue;
        if (pierce && blocker && e !== blocker && (e.x - ox) * this.facing > blockerFwd) continue;
        const shielded = e.type === "bulwark" && JH.Balance.bulwarkShielded(e.x, e.facing, this.x);
        const mult = shielded ? e.def.frontDmgMult : (e.def ? (e.def.waterMult || 1) : 1);
        const pressureMult = this.pressureBuffT > 0 ? JH.CONSUMABLES.pressure.mult : 1;
        const dmg = S.sprayDamage * dmgScale * mult * pressureMult * dt;
        e.takeDamage(dmg, game, this.facing, 0);
```

with:

```js
      // Damage enemies: non-pierce hits only the closest (blocker); pierce
      // hits everyone EXCEPT anyone standing behind a planted shield's wall.
      // (`blocker` can only ever be an enemy in non-pierce mode, or a
      // DeployedShield in pierce mode — see the blocker-finding block above,
      // so `e` here — always drawn from game.enemies — can never equal a
      // pierce-mode `blocker`.)
      let didHit = false;
      const hitEnemies = [];
      let healAmt = 0;
      const blockerFwd = blocker ? (blocker.x - ox) * this.facing : Infinity;
      for (const e of game.enemies) {
        if (e.dead) continue;
        if (!Geo.inHitArc(this, e, this.facing, reach, S.sprayHitBand)) continue;
        if (!pierce && e !== blocker) continue;
        if (pierce && blocker && (e.x - ox) * this.facing > blockerFwd) continue;
        const mult = e.def ? (e.def.waterMult || 1) : 1;
        const pressureMult = this.pressureBuffT > 0 ? JH.CONSUMABLES.pressure.mult : 1;
        const dmg = S.sprayDamage * dmgScale * mult * pressureMult * dt;
        e.takeDamage(dmg, game, this.facing, 0);
```

(The rest of the loop body — knockback, splash particles, `didHit = true`, etc. — is
unchanged below this point.)

- [ ] **Step 3: Run the test suite**

Run: `npm test`
Expected: PASS (47/47 — `doSpray` is integration-only; confirms nothing else broke).

- [ ] **Step 4: Commit**

```bash
git add js/entities.js
git commit -m "feat(combat): doSpray blocks via planted DeployedShield, not Bulwark facing"
```

---

### Task 6: Remove the dead body-shield code

**Files:**
- Modify: `js/balance.js` (remove `bulwarkShielded`)
- Modify: `tests/balance.test.js` (remove its 3 tests)
- Modify: `js/config.js` (remove `turnCooldown`/`frontDmgMult` from the `bulwark` block)

**Interfaces:**
- Consumes/Produces: nothing — this is pure removal of code with zero remaining
  callers after Tasks 4-5 landed (verify this is actually true before deleting — see
  Step 1).

- [ ] **Step 1: Confirm nothing still references the old symbols**

Run:
```bash
grep -rn "bulwarkShielded\|frontDmgMult\|turnCooldown" js/ tests/
```
Expected: every match is inside the function/field definitions you're about to delete in
this task (i.e. no call sites left in `js/entities.js` or anywhere else). If you find a
live call site outside `js/balance.js`/`js/config.js`/`tests/balance.test.js`, STOP —
Tasks 4-5 weren't fully applied; do not delete anything until that's resolved.

- [ ] **Step 2: Remove `bulwarkShielded` from `js/balance.js`**

Replace:

```js
    // Is `attackerX` on the side the Bulwark's shield (facing) currently
    // covers? true = frontal/shielded, false = the Bulwark's back is exposed.
    bulwarkShielded(bulwarkX, bulwarkFacing, attackerX) {
      const side = attackerX >= bulwarkX ? 1 : -1;
      return side === bulwarkFacing;
    },

    // Where a Stalker reappears after a blink: directly behind the player
```

with:

```js
    // Where a Stalker reappears after a blink: directly behind the player
```

- [ ] **Step 3: Remove its tests from `tests/balance.test.js`**

Replace:

```js
test("bulwarkShielded: attacker in front of the Bulwark's facing is shielded", () => {
  assert.strictEqual(Balance.bulwarkShielded(100, 1, 150), true);   // facing right, attacker to the right
  assert.strictEqual(Balance.bulwarkShielded(100, -1, 50), true);   // facing left, attacker to the left
});

test("bulwarkShielded: attacker behind the Bulwark's facing is NOT shielded", () => {
  assert.strictEqual(Balance.bulwarkShielded(100, 1, 50), false);   // facing right, attacker to the left
  assert.strictEqual(Balance.bulwarkShielded(100, -1, 150), false); // facing left, attacker to the right
});

test("bulwarkShielded: attacker exactly at the Bulwark's x counts as in front", () => {
  assert.strictEqual(Balance.bulwarkShielded(100, 1, 100), true);
});

test("stalkerBlinkTarget: lands behind the player relative to their facing", () => {
```

with:

```js
test("stalkerBlinkTarget: lands behind the player relative to their facing", () => {
```

- [ ] **Step 4: Remove the dead fields from `js/config.js`**

Replace:

```js
      // Shield-throw cycle (seconds/px) — see docs/superpowers/specs/
      // 2026-06-30-bulwark-shield-rework-design.md. turnCooldown/frontDmgMult
      // are retained here only until the Bulwark/doSpray rewrite lands later
      // in this plan — they become dead code and are deleted then (Task 6).
      turnCooldown: 1.1, frontDmgMult: 0,
      throwRange: 80, throwWind: 0.5, shieldlessDur: 3.5,
```

with:

```js
      // Shield-throw cycle (seconds/px) — see docs/superpowers/specs/
      // 2026-06-30-bulwark-shield-rework-design.md.
      throwRange: 80, throwWind: 0.5, shieldlessDur: 3.5,
```

- [ ] **Step 5: Run the test suite**

Run: `npm test`
Expected: PASS — 44 tests (47 minus the 3 removed `bulwarkShielded` tests).

- [ ] **Step 6: Commit**

```bash
git add js/balance.js tests/balance.test.js js/config.js
git commit -m "chore: remove dead body-shield code (bulwarkShielded, frontDmgMult, turnCooldown)"
```

---

### Task 7: Painter updates

**Files:**
- Modify: `js/assets.js:429-446` (the `bulwark` painter)

**Interfaces:**
- Consumes: `PAL.bulwark`/`bulwarkDk`/`bulwarkShield`/`skin` (all already exist),
  `legStep` (`js/assets.js:312`).
- Produces: `Assets.register("deployed_shield", ...)` — consumed by Task 3's
  `DeployedShield.draw()` (already calling `Assets.draw(ctx, "deployed_shield", ...)`,
  which silently no-ops until this painter exists — so visually nothing renders for the
  shield prop until this task lands; that's fine, it was already a hard blocker
  mechanically since Task 5).

- [ ] **Step 1: Replace the bulwark painter and add the deployed_shield painter**

In `js/assets.js`, replace lines 429-446:

```js
  // ========================== BULWARK =================================
  // Procedural placeholder (per CLAUDE.md art pipeline — real sprite later).
  // The shield is drawn at a fixed local +x offset so `Assets.draw`'s
  // facing-mirror keeps it on whichever side the Bulwark is actually facing.
  Assets.register("bulwark", (p, opt) => {
    const f = opt.frame | 0;
    const ls = (opt.state === "walk") ? legStep(f) * 0.6 : 0;
    if (opt.hurt && (f & 1)) return;
    p(-7 + ls, 0, 6, 10, PAL.bulwarkDk);
    p(1 - ls, 0, 6, 10, PAL.bulwarkDk);
    p(-10, 10, 20, 16, PAL.bulwark);
    p(-10, 10, 20, 3, PAL.bulwarkDk);
    p(-5, 26, 10, 9, PAL.skin);
    p(-5, 30, 10, 3, PAL.bulwarkDk);
    p(1, 28, 2, 2, "#111");
    p(9, 4, 6, 26, PAL.bulwarkShield);
    p(9, 4, 6, 3, "#fff");
  });
```

with:

```js
  // ========================== BULWARK =================================
  // Procedural placeholder (per CLAUDE.md art pipeline — real sprite later).
  // No body-mounted shield anymore — the Bulwark's own body is never a
  // blocker (see the deployed_shield painter below for the planted prop).
  Assets.register("bulwark", (p, opt) => {
    const f = opt.frame | 0;
    const ls = (opt.state === "walk" || opt.state === "retrieve") ? legStep(f) * 0.6 : 0;
    if (opt.hurt && (f & 1)) return;
    p(-7 + ls, 0, 6, 10, PAL.bulwarkDk);
    p(1 - ls, 0, 6, 10, PAL.bulwarkDk);
    p(-10, 10, 20, 16, PAL.bulwark);
    p(-10, 10, 20, 3, PAL.bulwarkDk);
    p(-5, 26, 10, 9, PAL.skin);
    p(-5, 30, 10, 3, PAL.bulwarkDk);
    p(1, 28, 2, 2, "#111");
  });

  // ====================== DEPLOYED SHIELD (Bulwark prop) ===============
  // Procedural placeholder — the Bulwark's planted shield. Stationary and
  // indestructible, so no hurt-flash branch is needed.
  Assets.register("deployed_shield", (p) => {
    p(-8, 0, 16, 3, PAL.bulwarkDk);
    p(-7, 3, 14, 22, PAL.bulwarkShield);
    p(-7, 3, 14, 3, "#fff");
    p(-2, 9, 4, 12, PAL.bulwarkDk);
  });
```

- [ ] **Step 2: Sanity-check the file still loads**

Run: `node -e "global.window = {}; global.document = { createElement: () => ({ getContext: () => ({}) }) }; try { require('./js/assets.js'); } catch (e) { console.log('EXPECTED (browser-only): ' + e.message); }"`
Expected: fails on an unrelated browser-only API (e.g. `Audio`, `localStorage`), NOT a
syntax error in the new code.

- [ ] **Step 3: Run the test suite**

Run: `npm test`
Expected: PASS (44/44).

- [ ] **Step 4: Commit**

```bash
git add js/assets.js
git commit -m "feat(art): drop Bulwark's body shield rect; add deployed_shield painter"
```

---

### Task 8: Manual playtest verification

**Files:** none (verification only, no commit).

**Interfaces:**
- Consumes: dev wave-select (backtick key on `localhost`, warps with 999 Suds) →
  "THE BULWARK LINE" (still wave index 10 — this plan doesn't touch wave config).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background) — serves at `http://localhost:5173/`.

- [ ] **Step 2: Warp to THE BULWARK LINE and confirm the full cycle**

Open the game, backtick → "JUMP TO WAVE" → "THE BULWARK LINE". Confirm, in order:
- The Bulwark approaches normally; spraying it from any angle (front, side, back) deals
  damage immediately — **no facing-dependent block of any kind.**
- Once you're within roughly spray range and in front of it, it pauses with a brief
  telegraph, then plants a shield (a new static prop appears where it was standing).
- After planting, the Bulwark itself becomes a normal, fully-vulnerable melee chaser —
  confirm spraying it (including maxed Hydro Lance) damages it normally with no block.
- The planted shield hard-blocks your spray: stand in its lane (same depth) and confirm
  the stream visibly stops at it and nothing behind it takes damage, including at beam
  tier 3 (Hydro Lance). Step to a different depth lane (or walk past it in x) and confirm
  you can hit the Bulwark/other enemies again — this is the intended counter-play.
- A mook standing in the shield's lane, farther along it than the shield, takes no
  pierce damage while the shield is up (the "for free" ally-cover effect).
- After a few seconds, the Bulwark sprints (visibly faster) back toward the planted
  shield, picks it up (the prop disappears), and the cycle repeats.
- Kill the Bulwark while a shield is deployed (e.g. during the shieldless melee window)
  and confirm the planted shield disappears too — no orphaned prop left blocking the
  lane forever.
- Overall feel check: with `hp: 420`, does it read as "the toughest non-boss enemy in
  the game" rather than either trivial or unkillable? Note any further tuning desired.

- [ ] **Step 3: Confirm no other wave broke**

Warp through a couple of unrelated waves (e.g. "STALKER AMBUSH", "WAVE 6", "GATEWAY
KRUSHER 9000") — confirm no `PAGEERROR` console messages and nothing else regressed.

- [ ] **Step 4: Report result to the user**

Summarize what was confirmed working (or not), with any tuning recommendations
(`throwRange`/`throwWind`/`shieldlessDur`/`retrieveSpeedMult`/`hp`) for the user to weigh
in on. No commit for this task — verification only.

---
