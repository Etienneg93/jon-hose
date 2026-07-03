# Enemy Variety & Behavior Pass Implementation Plan

> **STATUS: SHIPPED** — merged to main + deployed 2026-07-01.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add entry/behavior variety to existing enemies — spawn-pool sprinkles on authored waves, random-edge entries, a telegraphed fuse aerial drop-in, and a fast/invulnerable Furnace cooldown phase.

**Architecture:** Pure selection logic (`unlockedPool`, `pickSprinkles`) lives in `js/balance.js` (unit-tested, injectable RNG); tunables live in `js/config.js` (`JH.SPRINKLE`, `JH.FUSE_DROP`, furnace def); behavior changes live in the `Fuse`/`Furnace` classes in `js/entities.js`; `startWave` in `js/game.js` composes it all (authored spawns + sprinkles + entry rules). The authored 29-wave list and its economy are never modified — sprinkles only add on top.

**Tech Stack:** Vanilla JS (browser IIFE modules under `js/`), `node:test` for pure-logic tests (`tests/`), canvas 2D. No build step; `dist/` is a generated copy — never edit it.

## Global Constraints

- **Source of truth is `js/` only** — never edit `dist/*`.
- **Test command:** `node --test tests/*.test.js` (the dir form `node --test tests/` fails on this machine's Node v24). Suite currently passes 51/51; new tests raise that count.
- **Commit discipline:** `git add` only the files your task lists. Never `git add -A`/`git add .`. Pre-existing dirty files (`.gitignore`, `js/quake-frames.js`, `tools/imagen-gen.mjs`, `docs/superpowers/plans/2026-07-01-wave-flow-expansion.md`, `sprites/effects/`, `sprites/slayer/8ball.png`) must stay untouched and uncommitted.
- **Authored waves are the backbone** — `JH.LEVEL1.waves` entries, the charger cap (`JH.WAVECAP.charger = 2` via `Balance.capEnemyType`), and enemy `suds` values must not change.
- Sprinkles apply **only to normal fight waves** (the final `else` branch of `startWave`) — never to boss / wall / holdout / garden / douse waves.
- **Heavies** (`bulwark`, `furnace`, `smelt`) are low-weight and capped at **1 total sprinkled per wave**.
- Sprinkled enemies **elite-scale on `tough` waves** exactly like authored spawns.
- Fuse landing slam: **~8 damage, dodgeable, no burn stack**; drops staggered **0.5s per fuse**.
- Furnace cooldown phase: **speed ×2, fully invulnerable, duration = `ventCd` (4s)**, with a hot-glow visual.
- **Playtest-before-commit is mandatory** for gameplay feel; scene/behavior changes have no unit-test harness — their gate is the user-verified playtest (Task 5), not an automated assertion.
- Line numbers below are approximate — **locate edit points by the quoted code strings**, not line numbers.

---

## Task 1: Balance pool functions + `JH.SPRINKLE` config (TDD)

Pure, deterministic selection logic consumed by Task 4.

**Files:**
- Modify: `js/balance.js` (add two functions to the `Balance` object, before the closing `};`)
- Modify: `js/config.js` (add `JH.SPRINKLE` near `JH.WAVECAP`, ~line 250)
- Test: `tests/balance.test.js` (append)

**Interfaces:**
- Produces: `Balance.unlockedPool(waves, waveIndex) -> string[]` — deduped enemy types from `waves[0..waveIndex]`'s `spawns` lists, excluding `"dummy"` and `"neighbor"`.
- Produces: `Balance.pickSprinkles(pool, count, opts) -> string[]` — weighted picks; `opts = { weights, heavies, heavyCap, typeCaps, rng }`, all optional (`rng` defaults to `Math.random`; unlisted weights default 1; `heavyCap` defaults 1).
- Produces: `JH.SPRINKLE = { counts, weights, heavies, heavyCap }` — `counts` indexed by `actLevel + 1` (`actLevelForWave` returns −1..3).

- [ ] **Step 1: Write the failing tests.** Append to `tests/balance.test.js`:

```javascript
test("unlockedPool: types accumulate up to the wave index, deduped", () => {
  const waves = [
    { spawns: [{ type: "mook", count: 3 }] },
    { spawns: [{ type: "mook", count: 2 }, { type: "charger", count: 1 }] },
    { boss: true },
    { spawns: [{ type: "pyro", count: 2 }] },
  ];
  assert.deepStrictEqual(Balance.unlockedPool(waves, 0), ["mook"]);
  assert.deepStrictEqual(Balance.unlockedPool(waves, 1), ["mook", "charger"]);
  assert.deepStrictEqual(Balance.unlockedPool(waves, 2), ["mook", "charger"]); // boss wave adds nothing
  assert.deepStrictEqual(Balance.unlockedPool(waves, 3), ["mook", "charger", "pyro"]);
});

test("unlockedPool excludes dummy and neighbor", () => {
  const waves = [{ spawns: [{ type: "dummy", count: 1 }, { type: "neighbor", count: 1 }, { type: "fuse", count: 2 }] }];
  assert.deepStrictEqual(Balance.unlockedPool(waves, 0), ["fuse"]);
});

test("pickSprinkles: deterministic picks from the pool, honors count", () => {
  const picks = Balance.pickSprinkles(["mook", "pyro"], 3, { rng: () => 0 });
  assert.strictEqual(picks.length, 3);
  picks.forEach((p) => assert.ok(["mook", "pyro"].includes(p)));
});

test("pickSprinkles caps heavies at heavyCap total", () => {
  // rng()=0 walks the cumulative weights and lands on the first eligible type;
  // bulwark's huge weight would win every roll if it weren't heavy-capped.
  const picks = Balance.pickSprinkles(["bulwark", "mook"], 3, {
    weights: { bulwark: 100, mook: 1 }, heavies: ["bulwark"], heavyCap: 1, rng: () => 0,
  });
  assert.strictEqual(picks.filter((p) => p === "bulwark").length, 1);
  assert.strictEqual(picks.filter((p) => p === "mook").length, 2);
});

test("pickSprinkles honors per-type caps", () => {
  const picks = Balance.pickSprinkles(["charger", "mook"], 3, {
    typeCaps: { charger: 1 }, rng: () => 0,
  });
  assert.deepStrictEqual(picks, ["charger", "mook", "mook"]);
});

test("pickSprinkles returns fewer picks when nothing is eligible", () => {
  const picks = Balance.pickSprinkles(["bulwark"], 3, { heavies: ["bulwark"], heavyCap: 1, rng: () => 0 });
  assert.deepStrictEqual(picks, ["bulwark"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/balance.test.js`
Expected: FAIL — `Balance.unlockedPool is not a function`.

- [ ] **Step 3: Implement the two functions.** In `js/balance.js`, add inside the `Balance` object (after `furnaceShouldVent`, before the closing `};`):

```javascript
    // Enemy types introduced by authored waves up to and including waveIndex
    // (from their `spawns` lists — bosses have none). dummy/neighbor excluded.
    // Order = first-seen order. Pure.
    unlockedPool(waves, waveIndex) {
      const seen = [];
      const last = Math.min(waveIndex, waves.length - 1);
      for (let i = 0; i <= last; i++) {
        (waves[i].spawns || []).forEach((g) => {
          if (g.type === "dummy" || g.type === "neighbor") return;
          if (!seen.includes(g.type)) seen.push(g.type);
        });
      }
      return seen;
    },

    // Weighted sprinkle picks from an unlocked pool. opts (all optional):
    //   weights  — {type: weight}; unlisted types weigh 1
    //   heavies  — types sharing one combined heavyCap
    //   heavyCap — max TOTAL heavy picks (default 1)
    //   typeCaps — {type: max picks} hard per-type caps
    //   rng      — injectable () => [0,1) for deterministic tests
    // May return fewer than `count` when nothing is eligible. Pure.
    pickSprinkles(pool, count, opts) {
      const o = opts || {};
      const rng = o.rng || Math.random;
      const heavies = o.heavies || [];
      const heavyCap = o.heavyCap != null ? o.heavyCap : 1;
      const typeCaps = o.typeCaps || {};
      const weights = o.weights || {};
      const w = (t) => (weights[t] != null ? weights[t] : 1);
      const picks = [];
      let heavyN = 0;
      for (let n = 0; n < count; n++) {
        const eligible = pool.filter((t) => {
          if (heavies.includes(t) && heavyN >= heavyCap) return false;
          const cap = typeCaps[t];
          if (cap != null && picks.filter((p) => p === t).length >= cap) return false;
          return true;
        });
        if (!eligible.length) break;
        let total = 0;
        eligible.forEach((t) => { total += w(t); });
        let r = rng() * total;
        let picked = eligible[eligible.length - 1];
        for (const t of eligible) {
          r -= w(t);
          if (r <= 0) { picked = t; break; }
        }
        picks.push(picked);
        if (heavies.includes(picked)) heavyN++;
      }
      return picks;
    },
```

- [ ] **Step 4: Add `JH.SPRINKLE`.** In `js/config.js`, directly after the `JH.WAVECAP = { charger: 2 };` line:

```javascript
  // Wave sprinkle: extra enemies drawn from the already-introduced pool,
  // added on top of authored spawns (variety, not economy — counts stay low).
  // counts is indexed by actLevel+1 (Balance.actLevelForWave returns -1..3).
  JH.SPRINKLE = {
    counts: [0, 1, 2, 2, 2],
    weights: { mook: 3, pyro: 3, fuse: 3, stalker: 3, charger: 2, bulwark: 0.5, furnace: 0.5, smelt: 0.5 },
    heavies: ["bulwark", "furnace", "smelt"],
    heavyCap: 1,
  };
```

- [ ] **Step 5: Run all tests to verify pass**

Run: `node --test tests/*.test.js`
Expected: PASS, 57 tests (51 + 6 new).

- [ ] **Step 6: Commit**

```bash
git add js/balance.js js/config.js tests/balance.test.js
git commit -m "feat(balance): unlockedPool + pickSprinkles selection logic and SPRINKLE tunables"
```

---

## Task 2: Fuse aerial drop-in

Fuses enter via a telegraphed drop: invisible during their stagger delay, then fall from `z = height` with a shrinking landing ring, land with a light dodgeable slam, then chase normally. Inert (no damage in or out) until landed.

**Files:**
- Modify: `js/config.js` (add `JH.FUSE_DROP` after the `JH.FIRE` block, ~line 285)
- Modify: `js/entities.js` — `Fuse` class (~line 3689), `Player.doSpray` targeting loops (~lines 373, 428), and `Fuse.prototype.draw` (new, after the class)
- Modify: `js/game.js` — `spawnEnemy` opts (~line 630), `separate()` (~line 1115)

**Interfaces:**
- Consumes: `Entity` z/vz fields and `JH.PLAYER.gravity` (620) — a body at `z > 0` falls on its own.
- Produces: `fuse.beginDrop(delaySeconds)` — starts the drop sequence; `fuse.dropping` (truthy while airborne/waiting) — checked by spray targeting and `separate()`.
- Produces: `spawnEnemy(type, x, y, { dropIn: true, dropDelay: n })` wiring used by Task 4.

- [ ] **Step 1: Add `JH.FUSE_DROP`.** In `js/config.js`, directly after the `JH.FIRE = { ... };` block:

```javascript
  // Fuse aerial drop-in: telegraph ring + gravity fall + light landing slam.
  JH.FUSE_DROP = {
    height: 150,      // spawn z (px); gravity (620) lands it in ~0.7s
    slamRadius: 20,   // landing hit zone (world px; also the ring size)
    slamDmg: 8,       // light and dodgeable — no burn stack
    stagger: 0.5,     // per-fuse drop delay (s)
  };
```

- [ ] **Step 2: Extend the `Fuse` class.** In `js/entities.js`, inside `class Fuse extends Enemy { ... }` (it currently only overrides `die`), add these methods above `die(game)`:

```javascript
    // Aerial drop-in entry: hidden during the stagger delay, then falls from
    // FUSE_DROP.height with a landing ring, slams on touchdown, then chases.
    beginDrop(delay) {
      this.dropping = true;
      this.dropWait = delay || 0;
      this.z = 0;               // stays hidden until the fall starts
    }
    update(dt, game) {
      if (this.dropping) {
        this.t += dt;
        if (this.dropWait > 0) {
          this.dropWait -= dt;
          if (this.dropWait <= 0) { this.z = JH.FUSE_DROP.height; this.vz = 0; }
          return;
        }
        // Falling — gravity only; inert (no think/contact) until it lands.
        this.vz -= JH.PLAYER.gravity * dt;
        this.z += this.vz * dt;
        if (this.z <= 0) {
          this.z = 0; this.vz = 0; this.dropping = false;
          this.spawnGrace = 0.25;
          const pl = game.player;
          burst(game, this.x, this.y, 4, JH.PAL.firePatchHi, 10, { speed: 90, life: 0.35, up: 40, size: 2 });
          game.shake(2);
          if (Math.hypot(pl.x - this.x, pl.y - this.y) < JH.FUSE_DROP.slamRadius && pl.z < 20)
            pl.takeHit(JH.FUSE_DROP.slamDmg, game, this.x);
        }
        return;
      }
      super.update(dt, game);
    }
    takeDamage(dmg, game, dirX, knock) {
      if (this.dropping) return;   // inert until landed
      super.takeDamage(dmg, game, dirX, knock);
    }
```

- [ ] **Step 3: Add the drop draw.** In `js/entities.js`, after `JH.Fuse = Fuse;`, add:

```javascript
  // Drop-in visuals: landing ring (shrinks as it falls) + the falling body.
  Fuse.prototype.draw = function (ctx, cam) {
    if (this.dropping) {
      if (this.dropWait > 0) return;               // not on screen yet
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, 0);
      const frac = Math.max(0, Math.min(1, this.z / JH.FUSE_DROP.height));  // 1 top → 0 land
      const r = JH.FUSE_DROP.slamRadius * (0.6 + 0.4 * frac);
      const flash = (Math.floor(this.t * 12) & 1);
      ctx.save();
      ctx.fillStyle = "rgba(255,110,40,0.10)";
      ctx.strokeStyle = flash ? "#ff8030" : "rgba(255,110,40,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(sx, sy, r, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
      Assets.shadow(ctx, sx, sy, this.bodyW * 0.5 * (1 - frac * 0.5));
      Assets.draw(ctx, this.type, sx, Geo.feetScreenY(this.y, this.z), this.facing,
        { state: "walk", frame: this.frame, t: this.t });
      return;
    }
    JH.Enemy.prototype.draw.call(this, ctx, cam);
  };
```

- [ ] **Step 4: Exclude dropping enemies from spray targeting.** In `js/entities.js`, `Player.doSpray` has two enemy loops. In the blocker-finding loop (`for (const e of game.enemies) {` under `if (!pierce) {`), after `if (e.dead) continue;` add:

```javascript
            if (e.dropping) continue;   // airborne drop-ins can't block or be hit
```

In the damage loop (`for (const e of game.enemies) {` above `if (!Geo.inHitArc(this, e, this.facing, reach, S.sprayHitBand)) continue;` where hits are applied), after `if (e.dead) continue;` add:

```javascript
        if (e.dropping) continue;   // airborne drop-ins can't be hit
```

- [ ] **Step 5: Wire `spawnEnemy` and `separate()`.** In `js/game.js`, in `spawnEnemy`'s `if (opts) {` block, after the `opts.elite` line add:

```javascript
        if (opts.dropIn && e.beginDrop) e.beginDrop(opts.dropDelay || 0);
```

In `separate()`, inside the double loop after `if (e1.isBoss || e2.isBoss) continue;` add:

```javascript
          if (e1.dropping || e2.dropping) continue;  // don't shove airborne drop-ins
```

- [ ] **Step 6: Syntax-check and run the suite**

Run: `node --check js/entities.js && node --check js/game.js && node --check js/config.js && node --test tests/*.test.js`
Expected: all checks clean; tests still pass (57 after Task 1; this task adds none).

- [ ] **Step 7: Commit**

```bash
git add js/config.js js/entities.js js/game.js
git commit -m "feat(enemies): fuse aerial drop-in with telegraphed landing slam"
```

---

## Task 3: Furnace cooldown buff (fast + invulnerable while cooling)

While `ventCdT > 0` (the 4s window after a vent fires), the Furnace moves at ×2 speed, takes zero damage, accumulates no heat, and glows hot.

**Files:**
- Modify: `js/config.js` — furnace def (~line 211)
- Modify: `js/entities.js` — `Furnace` class: `onSprayHit`, `takeDamage`, `think`, and `Furnace.prototype.draw`

**Interfaces:**
- Consumes: existing `this.ventCdT` countdown (set to `d.ventCd` when the vent fires, decremented in `update`).
- Produces: `cooldownSpeedMult` tunable on the furnace def.

- [ ] **Step 1: Add the tunable.** In `js/config.js`, in the `furnace:` def, after the `ventCd: 4.0,` line:

```javascript
      cooldownSpeedMult: 2,    // movespeed multiplier while cooling (ventCdT > 0)
```

- [ ] **Step 2: Gate damage and heat during cooldown.** In `js/entities.js`, `class Furnace`:

In `takeDamage`, add as the FIRST line of the body:

```javascript
      if (this.ventCdT > 0) return;   // cooling: invulnerable until it settles
```

In `onSprayHit`, add as the FIRST line of the body:

```javascript
      if (this.ventCdT > 0) return;   // cooling: no damage taken, no heat built
```

- [ ] **Step 3: Speed boost while cooling.** In `Furnace.think`, the movement currently reads:

```javascript
      if (dist > 18 && this.spawnGrace <= 0) {
        this.x += (dx / (dist || 1)) * d.speed * dt;
        this.y += (dy / (dist || 1)) * d.speed * dt * 0.7;
```

Replace with:

```javascript
      const sp = d.speed * (this.ventCdT > 0 ? d.cooldownSpeedMult : 1);
      if (dist > 18 && this.spawnGrace <= 0) {
        this.x += (dx / (dist || 1)) * sp * dt;
        this.y += (dy / (dist || 1)) * sp * dt * 0.7;
```

- [ ] **Step 4: Hot glow while cooling.** In `Furnace.prototype.draw`, wrap the body-sprite `Assets.draw(...)` call (the one passing `state: this.state, frame: this.frame`):

Before it:

```javascript
    // Cooling phase: hot, fast, untouchable — glow signals "stop spraying, kite".
    if (this.ventCdT > 0) {
      ctx.save();
      ctx.shadowColor = "#ff5a20";
      ctx.shadowBlur = 8 + 4 * Math.sin(this.t * 10);
    }
```

After it:

```javascript
    if (this.ventCdT > 0) ctx.restore();
```

- [ ] **Step 5: Syntax-check and run the suite**

Run: `node --check js/entities.js && node --check js/config.js && node --test tests/*.test.js`
Expected: clean; tests unchanged. (Note: the existing `furnaceShouldVent` unit tests cover the vent trigger, not the cooldown gate — the gate is verified in the Task 5 playtest.)

- [ ] **Step 6: Commit**

```bash
git add js/config.js js/entities.js
git commit -m "feat(enemies): furnace gains 2x speed and invulnerability while cooling"
```

---

## Task 4: startWave entry variety + sprinkle integration

Replaces the right-corner 3-column spawn cluster: non-fuse enemies enter from a random left/right edge at a random depth; fuses drop in (staggered); sprinkles from the unlocked pool are appended to the authored list.

**Files:**
- Modify: `js/game.js` — the final `else` branch of `startWave` (~line 365)

**Interfaces:**
- Consumes: `JH.Balance.unlockedPool(waves, idx)`, `JH.Balance.pickSprinkles(pool, count, opts)`, `JH.SPRINKLE` (Task 1); `spawnEnemy(..., { dropIn, dropDelay })` and `JH.FUSE_DROP.stagger` (Task 2).

- [ ] **Step 1: Replace the spawn loop.** In `js/game.js` `startWave`, the final `else` branch currently reads:

```javascript
      } else {
        this.banner(wave.name + (wave.tough ? " — ELITES!" : " — FIGHT!"), 1.3);
        const actLevel = JH.Balance.actLevelForWave(this.waveIndex, JH.ACT_STARTS);
        const ownedCount = Object.keys(JH.Upgrades.owned).length;
        const eliteScale = wave.tough
          ? JH.Balance.eliteScale(actLevel, ownedCount) : null;
        let slot = 0;
        const spawnList = JH.Balance.capEnemyType(
          wave.spawns, "charger", JH.WAVECAP.charger, "mook");
        spawnList.forEach((grp) => {
          for (let k = 0; k < grp.count; k++) {
            const ex = right - 6 - (slot % 3) * 16 + Math.random() * 10;
            const ey = JH.DEPTH_MIN + 8 + ((slot * 27) % (JH.DEPTH_MAX - JH.DEPTH_MIN - 16));
            const e = this.spawnEnemy(grp.type, clamp(ex, left, right), ey, { elite: eliteScale });
            e.spawnGrace = 0.3 + slot * 0.25; // stagger entrances
            slot++;
          }
        });
      }
```

Replace the whole block with:

```javascript
      } else {
        this.banner(wave.name + (wave.tough ? " — ELITES!" : " — FIGHT!"), 1.3);
        const actLevel = JH.Balance.actLevelForWave(this.waveIndex, JH.ACT_STARTS);
        const ownedCount = Object.keys(JH.Upgrades.owned).length;
        const eliteScale = wave.tough
          ? JH.Balance.eliteScale(actLevel, ownedCount) : null;
        const spawnList = JH.Balance.capEnemyType(
          wave.spawns, "charger", JH.WAVECAP.charger, "mook");
        // Flatten authored spawns, then sprinkle extras from the unlocked pool
        // on top (variety pass) — the authored list stays the tuned backbone.
        const types = [];
        spawnList.forEach((g) => { for (let k = 0; k < g.count; k++) types.push(g.type); });
        const SPR = JH.SPRINKLE;
        const sprinkleCount = SPR.counts[actLevel + 1] || 0;
        const pool = JH.Balance.unlockedPool(JH.LEVEL1.waves, this.waveIndex);
        const chargerRoom = Math.max(0, JH.WAVECAP.charger - types.filter((t) => t === "charger").length);
        types.push(...JH.Balance.pickSprinkles(pool, sprinkleCount, {
          weights: SPR.weights, heavies: SPR.heavies, heavyCap: SPR.heavyCap,
          typeCaps: { charger: chargerRoom },
        }));
        const depthSpan = JH.DEPTH_MAX - JH.DEPTH_MIN - 16;
        let slot = 0, fuseIdx = 0;
        types.forEach((type) => {
          const ey = JH.DEPTH_MIN + 8 + Math.random() * depthSpan;
          if (type === "fuse") {
            // Fuses drop in at a random arena spot, staggered so they don't
            // all land at once.
            const ex = left + 30 + Math.random() * (right - left - 60);
            this.spawnEnemy(type, ex, ey, {
              elite: eliteScale, dropIn: true, dropDelay: fuseIdx * JH.FUSE_DROP.stagger,
            });
            fuseIdx++;
          } else {
            // Enter from a random screen edge at a random depth.
            const ex = (Math.random() < 0.5) ? left + 6 + Math.random() * 10
                                             : right - 6 - Math.random() * 10;
            const e = this.spawnEnemy(type, ex, ey, { elite: eliteScale });
            e.spawnGrace = 0.3 + slot * 0.25; // stagger entrances
          }
          slot++;
        });
      }
```

- [ ] **Step 2: Syntax-check and run the suite**

Run: `node --check js/game.js && node --test tests/*.test.js`
Expected: clean; all tests pass.

- [ ] **Step 3: Smoke-load the composition logic headlessly**

Run:
```bash
node -e "global.window={}; require('./js/config.js'); const B=require('./js/balance.js'); const w=global.window.JH.LEVEL1.waves; const pool=B.unlockedPool(w,17); console.log('pool@17:',pool.join(',')); const s=B.pickSprinkles(pool,2,{weights:global.window.JH.SPRINKLE.weights,heavies:global.window.JH.SPRINKLE.heavies,heavyCap:1}); console.log('sample sprinkle:',s.join(','));"
```
Expected: `pool@17:` includes `mook,charger,pyro,bulwark,stalker` (types introduced by wave 17) and a 2-item sample sprinkle prints without error.

- [ ] **Step 4: Commit**

```bash
git add js/game.js
git commit -m "feat(waves): random-edge entries, fuse drop-ins, and unlocked-pool sprinkles"
```

---

## Task 5: Integration playtest (USER GATE)

No code unless the playtest surfaces a defect (fix inline, re-verify). This task is not complete until the user confirms feel. Combine with the still-pending wave-flow Task 7 playtest if convenient.

**Files:** none (verification only).

- [ ] **Step 1: Launch the game** (`/run` skill or the project's normal serve flow).

- [ ] **Step 2: Verify via the dev warp menu (backtick):**
  - **Spawn variety:** any normal fight (e.g. WAVE 4, STREET SWARM) — enemies enter from BOTH edges at varied depths, no right-corner cluster.
  - **Sprinkles:** Act 2+ fights show 1–2 extra enemies beyond the authored list; occasionally a Bulwark/Stalker appears in a normal fight (never 2 heavies at once); Act 1 waves have no extras.
  - **Fuse drop-in:** FIRE INTRO / EMBER RUSH — rings telegraph, fuses fall staggered ~0.5s apart, standing in a ring on landing costs ~8 HP with knockback, dodging sideways avoids it; falling fuses can't be sprayed and don't block the stream.
  - **Furnace:** FURNACE TRIAL — after baiting a vent, the furnace speeds up visibly, glows hot, takes zero spray damage for ~4s, then settles back to slow and damageable.
  - **Set-piece waves unchanged:** BARRICADE / HOLD THE LINE / GARDEN / DOUSE still spawn per their own rules (no sprinkles there).

- [ ] **Step 3: Feel + economy spot-check** — sprinkles shouldn't spike difficulty (heavies rare) and end-of-run income should stay near ~2,150 (sprinkles nudge it up slightly; flag if it drifts far).

- [ ] **Step 4: User sign-off.** Tune `JH.SPRINKLE` counts/weights, `JH.FUSE_DROP` values, or `cooldownSpeedMult` per feedback and re-verify before any tuning commit:

```bash
git add js/config.js
git commit -m "balance(enemies): playtest tuning for enemy variety pass"
```

---

## Self-review notes

- **Spec coverage:** pool augmentation w/ act-scaled counts + weighting + heavy cap (Tasks 1, 4) ✓; random-edge entries (Task 4) ✓; fuse-only drop-in w/ light slam, no burn, inert while airborne, 0.5s stagger (Tasks 2, 4) ✓; furnace ×2 speed + invuln + no-heat + glow during `ventCdT` (Task 3) ✓; sprinkles elite-scale on tough waves and skip set-piece waves (Task 4) ✓; economy untouched except acknowledged sprinkle drift (spec's economy note → Task 5 check) ✓.
- **Type consistency:** `dropping` / `beginDrop(delay)` / `dropWait` consistent across Tasks 2 and 4's `dropIn`/`dropDelay` opts; `unlockedPool`/`pickSprinkles`/`JH.SPRINKLE`/`JH.FUSE_DROP` names match between Tasks 1, 2, and 4.
- **Testability honesty:** only the Balance selection logic is unit-tested; entity behavior and spawn placement are playtest-gated per project rule.
- **Charger cap** is preserved across authored+sprinkled combined via `typeCaps: { charger: chargerRoom }`.
