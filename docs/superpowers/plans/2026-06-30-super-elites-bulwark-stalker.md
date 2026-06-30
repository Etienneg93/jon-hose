# Super-Elites: Bulwark & Stalker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new late-game enemy archetypes — **Bulwark** (a slow shield-bearer that
hard-blocks the player's spray, including Hydro Lance pierce, from its facing side) and
**Stalker** (a fast harasser that blinks behind the player and is only dodged by the
player's existing dash i-frames) — wired into two new curated Act-4 waves, so a
fully-upgraded player is threatened by *behavior*, not just bigger HP bars.

**Architecture:** Two new `Enemy` subclasses in `js/entities.js` (`Bulwark`, `Stalker`),
each with its own `think()` state machine, following the existing `Charger`/`Pyro`
pattern exactly. The one piece of genuinely new shared logic — "is the player on the
Bulwark's shielded side?" and "where does the Stalker reappear?" — is extracted as pure,
unit-tested functions in `js/balance.js` (matching the file's existing dual-export
pattern), consumed by both `entities.js` (gameplay) and `tests/balance.test.js`
(verification). `doSpray` in `js/entities.js` gets a small, surgical extension so a
shielding Bulwark blocks the stream at every beam tier, not just beam < 3. Two new wave
entries land in `JH.LEVEL1.waves` (`js/config.js`) right after the Quake Walker boss
(index 9), with matching new entries in `WAVE_TRIGGERS` (`js/game.js`).

**Tech Stack:** Vanilla JS (ES2015+ classes, single `JH` global namespace, no bundler),
`node:test` + `node:assert` (see `tests/balance.test.js` for the pattern), Canvas 2D
procedural painters (`js/assets.js`, see the `mook`/`charger`/`pyro` painters for the
pattern).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-28-super-elites-design.md` ("Status: Approved
  design — to become an implementation plan"). Every task below cites the section of
  that spec it implements.
- **No double-ramp.** Bulwark/Stalker are NOT `tough`-flagged in their wave entries —
  the existing elite-scale ramp (`Enemy.makeElite`, applied via `spawnEnemy(..., {elite})`
  in `js/game.js:509-517`) must never run on them. They're tuned to be threatening at
  base stats (spec: "Components / files" + "No double-ramp" note).
- **Pure logic goes in `js/balance.js`**, dual-exported (`root.JH.Balance` for the
  browser, `module.exports` for `node:test`), matching every existing function in that
  file — see `js/balance.js:1-89` and `tests/balance.test.js:1-15` for the exact pattern
  to copy. Do not read `JH.*` globals from inside these functions; take everything as
  parameters so they're testable with plain values.
- **Procedural placeholder art only** (per `CLAUDE.md` "Art pipeline" section): keep new
  painter comments minimal: real animated sprites are a separate pipeline track, swapped
  in later at the painter seam.
- **Do not re-enable jump or melee** (per `CLAUDE.md` "Disabled features"). The Stalker's
  strike is dodged via the player's EXISTING dash i-frames (`Player.dashTimer`,
  `js/entities.js:497-498`) — nothing new to wire there.
- `WAVE_TRIGGERS` (`js/game.js:13`) must stay length-synced with `JH.LEVEL1.waves` — a
  `console.warn` assert already guards this (`js/game.js:14-15`); both arrays must grow
  by exactly 2 entries, in the same relative position.
- Run `npm test` after every task that touches `js/balance.js`, `js/entities.js`, or
  `js/config.js`. Expect 38 pre-existing tests to keep passing, plus whatever this plan
  adds.

---

### Task 1: Pure logic — shield-facing check + blink-target computation (TDD)

**Files:**
- Modify: `js/balance.js` (add 2 functions to the `Balance` object)
- Test: `tests/balance.test.js` (append new tests)

**Interfaces:**
- Produces: `Balance.bulwarkShielded(bulwarkX, bulwarkFacing, attackerX)` → `boolean`.
  `true` when `attackerX` is on the side the Bulwark is facing (shielded/frontal);
  `false` when the Bulwark's back is exposed (full damage, no block).
- Produces: `Balance.stalkerBlinkTarget(playerX, playerY, playerFacing, blinkDist, bounds)`
  → `{ x: number, y: number }`. `bounds` is `{ minX, maxX, depthMin, depthMax }`. Result
  is the player's position minus `blinkDist` along `playerFacing` (i.e. behind them),
  clamped into `bounds`.
- Consumed by: Task 3 (`Bulwark` shield checks), Task 4 (`Stalker.think`), Task 5
  (`doSpray`'s extended blocker logic).

- [ ] **Step 1: Write the failing tests**

Append to `tests/balance.test.js` (after the existing tests, end of file):

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
  const bounds = { minX: 0, maxX: 1000, depthMin: 0, depthMax: 86 };
  const t = Balance.stalkerBlinkTarget(500, 40, 1, 60, bounds);     // facing right -> blink lands LEFT
  assert.strictEqual(t.x, 440);
  assert.strictEqual(t.y, 40);
  const t2 = Balance.stalkerBlinkTarget(500, 40, -1, 60, bounds);   // facing left -> blink lands RIGHT
  assert.strictEqual(t2.x, 560);
});

test("stalkerBlinkTarget: clamps to the arena/depth bounds", () => {
  const bounds = { minX: 0, maxX: 1000, depthMin: 0, depthMax: 86 };
  const t = Balance.stalkerBlinkTarget(20, 5, 1, 60, bounds);       // would land at x=-40
  assert.strictEqual(t.x, 0);
  const t2 = Balance.stalkerBlinkTarget(500, 90, 1, 60, bounds);    // y past depthMax
  assert.strictEqual(t2.y, 86);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: failures referencing `Balance.bulwarkShielded is not a function` and
`Balance.stalkerBlinkTarget is not a function` — all pre-existing tests still pass.

- [ ] **Step 3: Implement the two functions**

In `js/balance.js`, add inside the `Balance` object literal, after `dropThresholds`
(the last entry, currently ending at line 84) — add a comma after `dropThresholds`'s
closing brace and insert:

```js

    // Is `attackerX` on the side the Bulwark's shield (facing) currently
    // covers? true = frontal/shielded, false = the Bulwark's back is exposed.
    bulwarkShielded(bulwarkX, bulwarkFacing, attackerX) {
      const side = attackerX >= bulwarkX ? 1 : -1;
      return side === bulwarkFacing;
    },

    // Where a Stalker reappears after a blink: directly behind the player
    // relative to their current facing, offset by `blinkDist`, clamped into
    // the arena bounds. Pure — bounds/inputs are all passed in.
    stalkerBlinkTarget(playerX, playerY, playerFacing, blinkDist, bounds) {
      const x = Math.max(bounds.minX, Math.min(bounds.maxX, playerX - playerFacing * blinkDist));
      const y = Math.max(bounds.depthMin, Math.min(bounds.depthMax, playerY));
      return { x, y };
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all new tests plus the existing 38 tests green.

- [ ] **Step 5: Commit**

```bash
git add js/balance.js tests/balance.test.js
git commit -m "feat(balance): pure logic for Bulwark shield-facing + Stalker blink target"
```

---

### Task 2: Config — stat blocks + palette

**Files:**
- Modify: `js/config.js:50-77` (palette)
- Modify: `js/config.js:123-151` (enemy stat blocks)

**Interfaces:**
- Consumes: nothing (data only).
- Produces: `JH.ENEMIES.bulwark`, `JH.ENEMIES.stalker` (consumed by Task 3 + Task 4's
  `Enemy` constructor, which reads `JH.ENEMIES[type]` — see `js/entities.js:637`).
  `JH.PAL.bulwark`/`bulwarkDk`/`bulwarkShield`/`stalker`/`stalkerDk` (consumed by Task 6's
  painters).

- [ ] **Step 1: Add palette colors**

In `js/config.js`, in the `JH.PAL` object (ends at line 77 with `pill: "#ff77ff",`),
add before the closing `};`:

```js
    bulwark: "#5a6b7a", bulwarkDk: "#33404c", bulwarkShield: "#cfe9ff",
    stalker: "#8a2f5a", stalkerDk: "#591b3a",
```

- [ ] **Step 2: Add enemy stat blocks**

In `js/config.js`, in the `JH.ENEMIES` object, after the `neighbor` entry (the last one,
ending at line 150 with `},` before the closing `};` of `JH.ENEMIES` on line 151), add:

```js
    // Super-elite: slow "moving shield" — counters stand-and-pierce play. The
    // shield faces `facing`; frontal spray is blocked (frontDmgMult), back is
    // full damage. Re-faces only every `turnCooldown` — that's the dash-past
    // window. See docs/superpowers/specs/2026-06-28-super-elites-design.md.
    bulwark: {
      name: "Bulwark", hp: 220, speed: 26, touchDmg: 14, contactCd: 1.0,
      turnCooldown: 1.1, frontDmgMult: 0,
      suds: 60, waterMult: 1, dropMult: 1.6, bodyW: 22, bodyH: 34, color: "bulwark",
    },
    // Super-elite: fast "blink harasser" — counters back-pedal kiting. Chases
    // fast, then on a cooldown telegraphs and blinks to the player's blind
    // side for a wind-up strike. Only the player's dash i-frames dodge it.
    stalker: {
      name: "Stalker", hp: 30, speed: 95, touchDmg: 10, contactCd: 0.8,
      blinkCd: 3.2, blinkTell: 0.35, blinkDist: 60,
      strikeWind: 0.3, strikeDmg: 14, strikeRange: 22,
      suds: 22, waterMult: 1, dropMult: 1.2, bodyW: 14, bodyH: 26, color: "stalker",
    },
```

- [ ] **Step 3: Sanity-check the file still loads**

Run: `node -e "global.window = {}; require('./js/config.js'); console.log(Object.keys(window.JH.ENEMIES))"`
Expected: prints an array including `bulwark` and `stalker` (no syntax errors).

- [ ] **Step 4: Commit**

```bash
git add js/config.js
git commit -m "feat(config): Bulwark + Stalker stat blocks and palette colors"
```

---

### Task 3: `Bulwark` entity class

**Files:**
- Modify: `js/entities.js` (add class after `JH.Ember = Ember;` at line 889, before the
  `// ====== BOSS` comment at line 891)
- Modify: `js/entities.js:2579-2590` (`JH.makeEnemy` factory)

**Interfaces:**
- Consumes: `JH.ENEMIES.bulwark` (Task 2), base `Enemy` class (`js/entities.js:633-765`,
  in particular `this.def`, `this.facing`, `this.state`, generic `think(dt, game)`
  override point and the inherited `update`/`draw`/`takeDamage`).
- Produces: `JH.Bulwark` class with a `facing` that only updates every `turnCooldown`
  seconds (the dash-past counter-play window) — consumed by Task 5's `doSpray` shield
  check (via `Balance.bulwarkShielded(e.x, e.facing, ...)`) and Task 6's painter (via
  `opt.state`).

- [ ] **Step 1: Add the class**

In `js/entities.js`, insert immediately after `JH.Ember = Ember;` (line 889) and before
the `// ============================================================== BOSS` comment
(line 891):

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

- [ ] **Step 2: Register the type in the factory**

In `js/entities.js`, in `JH.makeEnemy` (currently lines 2579-2590):

```js
  JH.makeEnemy = function (type, x, y) {
    if (type === "dummy") return new TargetDummy(x, y);
    if (type === "charger") return new Charger(type, x, y);
    if (type === "pyro") return new Pyro(type, x, y);
```

add a new line after the `pyro` check:

```js
    if (type === "bulwark") return new Bulwark(type, x, y);
```

- [ ] **Step 3: Run the test suite**

Run: `npm test`
Expected: PASS (no logic this task adds is directly unit-tested — `Bulwark.think` is
integration-only per project convention; confirms nothing else broke).

- [ ] **Step 4: Commit**

```bash
git add js/entities.js
git commit -m "feat(enemies): Bulwark — slow advancer with a slow-reorient facing"
```

---

### Task 4: `Stalker` entity class

**Files:**
- Modify: `js/entities.js` (add class right after the `Bulwark` class from Task 3, still
  before the `// ====== BOSS` comment)
- Modify: `js/entities.js:2579-2590` (`JH.makeEnemy` factory)

**Interfaces:**
- Consumes: `JH.ENEMIES.stalker` (Task 2), `Balance.stalkerBlinkTarget` (Task 1),
  `Geo.inHitArc` (`js/world.js:37-47`), `Player.takeHit` (`js/entities.js:497-513`,
  which already no-ops while `dashTimer > 0` — the player's existing i-frames).
- Produces: `JH.Stalker` class — consumed only by Task 6's painter (`opt.state` values
  `"wind"` and `"strike"`) and the wave config in Task 7.

- [ ] **Step 1: Add the class**

In `js/entities.js`, right after the `Bulwark` class block added in Task 3 (i.e. right
after `JH.Bulwark = Bulwark;`), insert:

```js

  // ---- Stalker: fast "blink harasser" super-elite ----
  // Chases fast between blinks. On a cooldown: telegraphs (state "wind"),
  // blinks behind the player's facing, then winds up a strike (state
  // "strike") that only the player's dash i-frames negate (Player.takeHit
  // already no-ops while dashTimer > 0 — nothing new needed there).
  class Stalker extends Enemy {
    think(dt, game) {
      const pl = game.player, d = this.def;

      if (this.state === "strike") {
        this.attackTimer -= dt;
        if (this.attackTimer <= 0) {
          if (Geo.inHitArc(this, pl, this.facing, d.strikeRange, 16))
            pl.takeHit(d.strikeDmg, game, this.x);
          this.state = "idle";
          this.cdTimer = d.blinkCd;
        }
        return;
      }
      if (this.windTimer > 0) {
        this.windTimer -= dt; this.state = "wind";
        if (this.windTimer <= 0) {
          const t = JH.Balance.stalkerBlinkTarget(pl.x, pl.y, pl.facing, d.blinkDist, {
            minX: game.bounds.minX, maxX: game.bounds.maxX,
            depthMin: JH.DEPTH_MIN, depthMax: JH.DEPTH_MAX,
          });
          this.x = t.x; this.y = t.y;
          this.facing = pl.x >= this.x ? 1 : -1;
          this.attackTimer = d.strikeWind;
          this.state = "strike";
          game.audio.play("jump");
        }
        return;
      }
      if (this.cdTimer > 0) {
        this.cdTimer -= dt;
      } else if (this.spawnGrace <= 0) {
        this.windTimer = d.blinkTell; this.state = "wind";
        return;
      }
      const dx = pl.x - this.x, dy = pl.y - this.y;
      const dist = Math.hypot(dx, dy);
      this.facing = dx >= 0 ? 1 : -1;
      this.x += (dx / (dist || 1)) * d.speed * dt;
      this.y += (dy / (dist || 1)) * d.speed * dt * 0.85;
      this.state = "walk";
    }
  }
  JH.Stalker = Stalker;
```

- [ ] **Step 2: Register the type in the factory**

In `js/entities.js`, in `JH.makeEnemy`, add after the `bulwark` line from Task 3:

```js
    if (type === "stalker") return new Stalker(type, x, y);
```

- [ ] **Step 3: Run the test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add js/entities.js
git commit -m "feat(enemies): Stalker — blink-behind harasser countering kiting"
```

---

### Task 5: Extend `doSpray` so a shielding Bulwark blocks every beam tier

**Files:**
- Modify: `js/entities.js:334-345` (blocker-finding)
- Modify: `js/entities.js:377-389` (damage loop)

**Interfaces:**
- Consumes: `Balance.bulwarkShielded` (Task 1), `JH.ENEMIES.bulwark.frontDmgMult`
  (Task 2).
- Produces: nothing further downstream (leaf gameplay logic). Implements the spec's
  "Shield mechanic" section in full: frontal hits do `frontDmgMult` damage and the
  shield hard-blocks the stream (even Hydro Lance pierce) for anyone standing behind it
  along the facing line; from behind, the Bulwark takes full damage and does not block
  pierce.

- [ ] **Step 1: Replace the blocker-finding block**

In `js/entities.js`, replace lines 334-345:

```js
      // Hydro Lance (beam=3) pierces the whole line; default stops at first target.
      const pierce = beam >= 3;
      let blocker = null;
      if (!pierce) {
        let minFwd = Infinity;
        for (const e of game.enemies) {
          if (e.dead) continue;
          if (!Geo.inHitArc(this, e, this.facing, reach, S.sprayHitBand)) continue;
          const fwd = (e.x - ox) * this.facing;
          if (fwd < minFwd) { minFwd = fwd; blocker = e; }
        }
      }
```

with:

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

- [ ] **Step 2: Replace the damage loop header**

In `js/entities.js`, replace lines 377-389:

```js
      // Damage enemies: non-pierce hits only the closest (blocker), pierce hits all.
      let didHit = false;
      const hitEnemies = [];
      let healAmt = 0;
      for (const e of game.enemies) {
        if (e.dead) continue;
        if (!Geo.inHitArc(this, e, this.facing, reach, S.sprayHitBand)) continue;
        if (!pierce && e !== blocker) continue;
        const mult = e.def ? (e.def.waterMult || 1) : 1;
        const pressureMult = this.pressureBuffT > 0 ? JH.CONSUMABLES.pressure.mult : 1;
        const dmg = S.sprayDamage * dmgScale * mult * pressureMult * dt;
        e.takeDamage(dmg, game, this.facing, 0);
```

with:

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

(The rest of the loop body — knockback, splash particles, `didHit = true`, etc. — is
unchanged below this point.)

- [ ] **Step 3: Run the test suite**

Run: `npm test`
Expected: PASS — this touches no `node:test`-covered logic directly (doSpray is
integration-only), but confirms nothing else broke.

- [ ] **Step 4: Commit**

```bash
git add js/entities.js
git commit -m "feat(combat): shielding Bulwark hard-blocks spray at every beam tier"
```

---

### Task 6: Procedural placeholder painters

**Files:**
- Modify: `js/assets.js` (add two `Assets.register(...)` calls after the `pyro` painter,
  currently ending at line 427)

**Interfaces:**
- Consumes: `JH.PAL.bulwark`/`bulwarkDk`/`bulwarkShield`/`stalker`/`stalkerDk` (Task 2),
  the `opt.state`/`opt.frame`/`opt.hurt` contract every existing painter uses (see the
  `charger`/`pyro` painters at `js/assets.js:385-427` for the exact pattern), and the
  `legStep` helper (`js/assets.js:312`).
- Produces: visual rendering only — `Enemy.draw` (`js/entities.js:740-763`, inherited by
  both `Bulwark` and `Stalker`) already calls `Assets.draw(ctx, this.type, ...)`, so no
  entity-side changes are needed once the painters exist.

- [ ] **Step 1: Add the painters**

In `js/assets.js`, after the `pyro` painter (ends at line 427 with `});`), add:

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

  // ========================== STALKER ==================================
  // Procedural placeholder. `wind` = pre-blink telegraph flash; `strike` =
  // post-blink wind-up arm.
  Assets.register("stalker", (p, opt) => {
    const f = opt.frame | 0;
    const ls = (opt.state === "walk") ? legStep(f) : 0;
    if (opt.hurt && (f & 1)) return;
    p(-4 + ls, 0, 4, 9, PAL.stalkerDk);
    p(0 - ls, 0, 4, 9, PAL.stalkerDk);
    p(-6, 9, 12, 12, PAL.stalker);
    p(-6, 9, 12, 2, PAL.stalkerDk);
    p(-3, 19, 7, 7, PAL.skin);
    p(1, 20, 2, 2, "#fff");
    if (opt.state === "wind") p(-8, 22, 16, 2, "#fff");
    if (opt.state === "strike") p(5, 12, 8, 5, PAL.stalkerDk);
  });
```

- [ ] **Step 2: Sanity-check the file still loads**

Run: `node -e "global.window = {}; global.document = { createElement: () => ({ getContext: () => ({}) }) }; try { require('./js/assets.js'); } catch (e) { console.log('EXPECTED (browser-only): ' + e.message); }"`
Expected: either loads cleanly or fails on an unrelated browser-only API (e.g. `Audio`,
`localStorage`) — NOT a syntax error in the new painters. (`assets.js` is browser-only
like `config.js`/`game.js`; this is a syntax smoke test, not a real require.)

- [ ] **Step 3: Commit**

```bash
git add js/assets.js
git commit -m "feat(art): procedural placeholder painters for Bulwark + Stalker"
```

---

### Task 7: Wire the two new Act-4 waves

**Files:**
- Modify: `js/config.js:371-373` (`JH.LEVEL1.waves`)
- Modify: `js/game.js:13` (`WAVE_TRIGGERS`)

**Interfaces:**
- Consumes: `JH.makeEnemy("bulwark"/"stalker", ...)` (Tasks 3-4), the wave-spawn pipeline
  in `js/game.js` `startWave` (`js/game.js:343-361`, the non-boss/garden/wall branch —
  unchanged, just fed new `spawns` entries).
- Produces: `JH.LEVEL1.waves` grows from 14 to 16 entries; `WAVE_TRIGGERS` grows to match.
  The hardcoded Quake-cutscene check (`this.waveIndex === 9`, `js/game.js:369`) and its
  `nextWave: 10` (`js/game.js:372`) are UNCHANGED and still correct — the new waves are
  inserted starting exactly at index 10, so `nextWave: 10` now correctly routes into
  "THE BULWARK LINE" instead of the old "WAVE 6".

- [ ] **Step 1: Insert the two wave entries**

In `js/config.js`, replace lines 371-373:

```js
      { name: "QUAKE WALKER", boss: true, bossType: "quake" },
      // ---- Act 4: the aftermath — Quake Walker turns ally ----
      { name: "WAVE 6", tough: true, spawns: [{ type: "mook", count: 3 }, { type: "pyro", count: 1 }, { type: "charger", count: 1 }] },
```

with:

```js
      { name: "QUAKE WALKER", boss: true, bossType: "quake" },
      // ---- Act 4: the aftermath — Quake Walker turns ally ----
      // Super-elites: curated counters to late-game dominant tactics (pierce-spray
      // camping vs. the Bulwark's shield; back-pedal kiting vs. the Stalker's blink).
      // No `tough` flag — already tuned for Act 4, not elite-ramped (see
      // docs/superpowers/specs/2026-06-28-super-elites-design.md, "No double-ramp").
      { name: "THE BULWARK LINE", spawns: [{ type: "bulwark", count: 1 }, { type: "mook", count: 2 }] },
      { name: "STALKER AMBUSH", spawns: [{ type: "stalker", count: 2 }, { type: "charger", count: 1 }] },
      { name: "WAVE 6", tough: true, spawns: [{ type: "mook", count: 3 }, { type: "pyro", count: 1 }, { type: "charger", count: 1 }] },
```

- [ ] **Step 2: Insert matching `WAVE_TRIGGERS` entries**

In `js/game.js`, replace line 13:

```js
  const WAVE_TRIGGERS = [360, 840, 1320, 1800, 2300, 2820, 3340, 3860, 4380, 4920, 5440, 5960, 6480, 7000];
```

with:

```js
  const WAVE_TRIGGERS = [360, 840, 1320, 1800, 2300, 2820, 3340, 3860, 4380, 4920, 5100, 5280, 5440, 5960, 6480, 7000];
```

(Two new entries — `5100`, `5280` — inserted between the Quake Walker trigger `4920` and
the old "WAVE 6" trigger `5440`, keeping every value monotonically increasing and within
`JH.LEVEL_LEN` = 7400.)

- [ ] **Step 3: Verify the length-assert and run the test suite**

Run: `node -e "global.window = {}; require('./js/config.js'); console.log(window.JH.LEVEL1.waves.length)"`
Expected: prints `16`.

Run: `npm test`
Expected: PASS (38+ tests; `actLevelForWave` in `tests/balance.test.js` is index-based,
not array-length-based, so it's unaffected by the insertion).

- [ ] **Step 4: Commit**

```bash
git add js/config.js js/game.js
git commit -m "feat(waves): insert THE BULWARK LINE + STALKER AMBUSH after Quake Walker"
```

---

### Task 8: Manual playtest verification

**Files:** none (verification only, no commit).

**Interfaces:**
- Consumes: dev wave-select (backtick key on `localhost`, per `docs/superpowers/specs/2026-06-28-super-elites-design.md` "Testing / verification" — warps with 999 Suds).

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background) — serves at `http://localhost:5173/`.

- [ ] **Step 2: Warp to THE BULWARK LINE**

Open the game, press backtick (`` ` ``) to open "JUMP TO WAVE", select "THE BULWARK
LINE" (index 10). Confirm:
- The Bulwark advances slowly; its shield (light-blue block) sits on whichever side it's
  currently facing.
- Standing in front of it and spraying (any beam tier, including Hydro Lance after
  buying Pressure to tier 3) does little/no damage and the stream visibly stops at it —
  enemies behind it (the 2 mooks) take no damage from a maxed pierce stream.
- Dashing to its back and spraying deals full damage.
- After it re-faces toward you, there's a brief window (~1.1s) where the old facing side
  is still exposed before it catches up — confirm by circling it.

- [ ] **Step 3: Warp to STALKER AMBUSH**

Select "STALKER AMBUSH" (index 11). Confirm:
- Stalkers close distance quickly between blinks.
- On a ~3s cooldown each flashes a brief telegraph, then teleports to your blind side
  (opposite your current facing) and winds up a strike shortly after reappearing.
- Dashing the instant it reappears (or during its wind-up) negates the strike — no
  damage taken, matching the player's existing dash-invuln window.
- Taking the strike without dashing deals damage and knocks you back as usual.

- [ ] **Step 4: Confirm no other wave broke**

Warp through a few more waves (e.g. "WAVE 6", "THE GARDEN", "GATEWAY KRUSHER 9000") to
confirm indices shifted cleanly and nothing soft-locks.

- [ ] **Step 5: Report result to the user**

Summarize what was confirmed working (or not) — no commit for this task.

---
