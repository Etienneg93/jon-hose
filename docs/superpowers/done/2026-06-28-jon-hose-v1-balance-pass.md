# Jon Hose v1.0 Balance Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Jon Hose's inverted difficulty curve and dead-end economy by tuning early-game numbers and adding four structural systems (per-type drops, progressive elite ramp, charger cap, hybrid Suds sink).

**Architecture:** All new *pure* balance math lives in a new isolated, dual-export (browser + Node) module `js/balance.js`, unit-tested with the built-in `node:test` runner. The existing global-IIFE game files (`config.js`, `entities.js`, `game.js`, `upgrades.js`) consume `JH.Balance.*` at their integration points. Value-only tuning and shop-UI changes are verified by manual playtest, matching the project's established verification style.

**Tech Stack:** Vanilla ES2015+ JS, no framework/bundler, global `JH` namespace on `window`, `<script>` tags. Tests: `node --test` (built-in, zero new deps). Dev server: `npm run dev` (serve@14 on :5173).

## Global Constraints

- **No new runtime dependencies.** Only `pngjs` is a dep; tests use Node built-in `node:test`/`node:assert` only.
- **All gameplay constants live in `js/config.js`** — no other file hardcodes tunables (existing project rule). New pure *formulas* may live in `js/balance.js`; their input *values* come from config where they are tunable.
- **Bump `package.json` `version` before every commit** (project rule). This plan starts at `0.10.2` and increments patch per task: 0.11.0, 0.11.1, …
- **Chargers keep their stats** (user decision): no change to `JH.ENEMIES.charger` hp/chargeDmg/chargeSpeed. The swing is tamed by the per-wave cap (Task 6) and drop changes (Task 4) only.
- **Boss payouts unchanged** — the Suds sink (Tasks 7–8) gives them purpose.
- **No automated tests exist for DOM/canvas code**; integration/feel is verified by manual playthrough. Dev wave-select: backtick on localhost opens "JUMP TO WAVE" (player gets 999 Suds on warp; garden = index 12, Quake = index 10).
- **Load order matters** (`index.html`): `config → quake-frames → neighbor-frames → assets → input → world → entities → upgrades → game → main`. `js/balance.js` must load immediately after `config.js` (before `entities.js`, which consumes it).

---

## File map

- **Create** `js/balance.js` — pure balance helpers (`JH.Balance`), dual browser/Node export. (Tasks 2–7)
- **Create** `tests/balance.test.js` — `node:test` unit tests for `js/balance.js`. (Tasks 2–7)
- **Modify** `index.html` — add `<script src="js/balance.js">` after config. (Task 2)
- **Modify** `package.json` — add `"test": "node --test"` script; version bumps. (Task 2+)
- **Modify** `js/config.js` — Tier-A tuning values; `dropMult` per enemy; repeatable-node + consumable tunables. (Tasks 1, 4, 7, 8)
- **Modify** `js/entities.js` — parameterize `makeElite(scale)`. (Task 5)
- **Modify** `js/game.js` — `dropLoot` per-type scaling; elite-scale at spawn; charger cap; shop UI for repeatables + consumables. (Tasks 4, 5, 6, 7, 8)
- **Modify** `js/upgrades.js` — Tier-1 cost cut; repeatable scaling nodes. (Tasks 1, 7)

---

## Task 1: Tier-A number tuning (config only)

Pure value changes; no logic. Verified by playtest feel.

**Files:**
- Modify: `js/config.js` (`JH.PLAYER`, `JH.ENEMIES`)
- Modify: `js/upgrades.js` (tier-1 node `cost` fields)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new (value edits only).

- [ ] **Step 1: Buff early water recovery**

In `js/config.js`, `JH.PLAYER`:
```js
    waterRegen: 18,         // units/sec passive recovery (was 14)
    regenDelay: 0.35,       // sec after spraying before regen kicks in (was 0.5)
```

- [ ] **Step 2: Raise early enemy income**

In `js/config.js`, `JH.ENEMIES`, change the `suds` field on the three base enemies:
```js
    mook:    { ... suds: 8,  ... },   // was 6
    charger: { ... suds: 13, ... },   // was 11
    pyro:    { ... suds: 16, ... },   // was 14
```
(Edit only the `suds:` value on each; leave all other fields untouched. Charger hp/chargeDmg/chargeSpeed stay as-is per Global Constraints.)

- [ ] **Step 3: Cut tier-1 upgrade costs ~20%**

In `js/upgrades.js`, the five tier-1 nodes (`req: []`):
```js
    { id: "pw1", ... cost: 32, ... },   // was 40
    { id: "rc1", ... cost: 36, ... },   // was 45
    { id: "tk1", ... cost: 20, ... },   // was 25
    { id: "mb1", ... cost: 32, ... },   // was 40
    { id: "vt1", ... cost: 20, ... },   // was 25
```

- [ ] **Step 4: Manual verify**

Run: `npm run dev` → http://localhost:5173. Start a fresh run (do NOT warp — test the real early game).
Expected: water no longer bottoms out constantly in Waves 1–2; a tier-1 upgrade is affordable within ~2 waves; the run still has bite (not faceroll).

- [ ] **Step 5: Commit**

Bump `package.json` `version` to `0.11.0`, then:
```bash
git add js/config.js js/upgrades.js package.json
git commit -m "balance: ease early water starvation, income, and tier-1 costs"
```

---

## Task 2: Scaffold `js/balance.js` + test runner

Create the dual-export module shell and wire the test runner, with one trivial pure helper to prove the harness end-to-end.

**Files:**
- Create: `js/balance.js`
- Create: `tests/balance.test.js`
- Modify: `index.html` (script tag)
- Modify: `package.json` (`test` script)

**Interfaces:**
- Produces: `JH.Balance.actLevelForWave(waveIndex: number) -> number` — 0 for Act-2 waves (indices 5–7), 1 for Act-3 (8–9), 2 for Act-4 (10+); `-1` for pre-elite waves (0–4). Used by Task 5.

- [ ] **Step 1: Write the failing test**

Create `tests/balance.test.js`:
```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const Balance = require("../js/balance.js");

test("actLevelForWave maps wave index to elite act tier", () => {
  assert.strictEqual(Balance.actLevelForWave(0), -1);  // Act 1, no elites
  assert.strictEqual(Balance.actLevelForWave(4), -1);  // mid-boss wave
  assert.strictEqual(Balance.actLevelForWave(5), 0);   // first elite wave
  assert.strictEqual(Balance.actLevelForWave(7), 0);   // Act 2
  assert.strictEqual(Balance.actLevelForWave(8), 1);   // Act 3
  assert.strictEqual(Balance.actLevelForWave(9), 1);
  assert.strictEqual(Balance.actLevelForWave(10), 2);  // Act 4
  assert.strictEqual(Balance.actLevelForWave(13), 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `Cannot find module '../js/balance.js'`.

- [ ] **Step 3: Create the module with the helper**

Create `js/balance.js`:
```js
/* =====================================================================
   balance.js — pure, side-effect-free balance math. Dual export:
   attaches JH.Balance in the browser; module.exports for node:test.
   Game files consume JH.Balance.*; tests require() it directly.
   ===================================================================== */
(function (root) {
  "use strict";
  const Balance = {
    // Elite difficulty tier by wave index. -1 = no elites (Act 1).
    // Act 2 = waves 5-7 (0), Act 3 = 8-9 (1), Act 4 = 10+ (2).
    actLevelForWave(waveIndex) {
      if (waveIndex < 5) return -1;
      if (waveIndex < 8) return 0;
      if (waveIndex < 10) return 1;
      return 2;
    },
  };
  root.JH = root.JH || {};
  root.JH.Balance = Balance;
  if (typeof module !== "undefined" && module.exports) module.exports = Balance;
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (1 test).

- [ ] **Step 5: Wire into the page and add the npm script**

In `index.html`, add after the config script (line ~80):
```html
  <script src="js/config.js"></script>
  <script src="js/balance.js"></script>
```
In `package.json` `scripts`, add:
```json
    "test": "node --test",
```

- [ ] **Step 6: Verify the page still loads**

Run: `npm run dev` → http://localhost:5173. Open devtools console.
Expected: no errors; `JH.Balance.actLevelForWave(5)` typed in console returns `0`.

- [ ] **Step 7: Commit**

Bump `version` to `0.11.1`, then:
```bash
git add js/balance.js tests/balance.test.js index.html package.json
git commit -m "build: add js/balance.js module + node:test harness"
```

---

## Task 3: Drop-scaling helper

Add the pure drop-threshold helper to `js/balance.js` (consumed by Task 4).

**Files:**
- Modify: `js/balance.js`
- Modify: `tests/balance.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `JH.Balance.dropThresholds(dropMult: number) -> { health: number, water: number }` — cumulative roll thresholds against `Math.random()`. Base (mult 1) reproduces today's rates: `health` 0.18, `water` 0.45 (i.e. 0.18 health + 0.27 water). Item chances scale by `dropMult`, each capped at a sane max so high mults don't guarantee drops; `water` is returned as the cumulative upper bound (`health + waterChance`).

- [ ] **Step 1: Write the failing test**

Add to `tests/balance.test.js`:
```js
test("dropThresholds reproduces base rates at mult 1", () => {
  const t = Balance.dropThresholds(1);
  assert.strictEqual(t.health, 0.18);
  assert.ok(Math.abs(t.water - 0.45) < 1e-9);   // 0.18 + 0.27
});

test("dropThresholds scales item chances by mult and stays cumulative", () => {
  const t = Balance.dropThresholds(1.8);
  assert.ok(Math.abs(t.health - 0.324) < 1e-9); // 0.18 * 1.8
  assert.ok(Math.abs(t.water - 0.81) < 1e-9);   // 0.324 + 0.27*1.8 (0.486)
  assert.ok(t.water > t.health);
});

test("dropThresholds caps so drops are never guaranteed", () => {
  const t = Balance.dropThresholds(10);
  assert.ok(t.health <= 0.45);
  assert.ok(t.water <= 0.9);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `Balance.dropThresholds is not a function`.

- [ ] **Step 3: Implement the helper**

In `js/balance.js`, add to the `Balance` object (after `actLevelForWave`):
```js
    // Cumulative loot-roll thresholds vs Math.random(), scaled by an enemy's
    // dropMult. Base rates (mult 1): 18% health, 27% water can.
    dropThresholds(dropMult) {
      const m = dropMult || 1;
      const health = Math.min(0.45, 0.18 * m);
      const waterChance = Math.min(0.45, 0.27 * m);
      return { health, water: health + waterChance };
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

Bump `version` to `0.11.2`, then:
```bash
git add js/balance.js tests/balance.test.js package.json
git commit -m "balance: add per-type drop-threshold helper"
```

---

## Task 4: Per-type drop rates

Add `dropMult` to enemy defs and consume the helper in `dropLoot`.

**Files:**
- Modify: `js/config.js` (`JH.ENEMIES`)
- Modify: `js/game.js` (`dropLoot`, ~`:505-510`)

**Interfaces:**
- Consumes: `JH.Balance.dropThresholds(dropMult)` (Task 3); `e.def.dropMult`.
- Produces: nothing.

- [ ] **Step 1: Add `dropMult` to enemy defs**

In `js/config.js`, `JH.ENEMIES`, add a `dropMult` field:
```js
    mook:    { ... dropMult: 1,   ... },
    charger: { ... dropMult: 1.8, ... },
    pyro:    { ... dropMult: 1.8, ... },
```
(Add the field to each of `mook`, `charger`, `pyro`. Leave `dummy` and `neighbor` without it — they default to 1 in the helper.)

- [ ] **Step 2: Consume the helper in the scripted-drop branch**

In `js/game.js`, the `else` branch of `dropLoot` (the non-`infinite` path, ~`:505-510`), replace the fixed thresholds:
```js
      } else {
        JH.spawnSudsCoins(this, e.x, e.y, e.def.suds);
        const t = JH.Balance.dropThresholds(e.def.dropMult);
        const r = Math.random();
        if (r < t.health) this.spawnPickup("health", e.x + 6, e.y, 25);
        else if (r < t.water) this.spawnPickup("water_can", e.x - 6, e.y, 40);
      }
```

- [ ] **Step 3: Manual verify**

Run: `npm run dev`; warp (backtick) to a Pyro/Charger-heavy wave (e.g. WAVE 5, index 5).
Expected: noticeably more health/water pickups dropping off Pyros and Chargers than off Mooks over several kills. No console errors.

- [ ] **Step 4: Commit**

Bump `version` to `0.11.3`, then:
```bash
git add js/config.js js/game.js package.json
git commit -m "balance: per-type item drop rates (Pyro/Charger drop more)"
```

---

## Task 5: Progressive elite ramp

Replace the flat ×1.7 elite multiplier with an act- and player-power-scaled one.

**Files:**
- Modify: `js/balance.js` (+ test)
- Modify: `tests/balance.test.js`
- Modify: `js/entities.js` (`makeElite`, ~`:655-671`)
- Modify: `js/game.js` (spawn site, ~`:323`)

**Interfaces:**
- Consumes: `JH.Balance.actLevelForWave` (Task 2); `JH.Upgrades.owned`.
- Produces:
  - `JH.Balance.eliteScale(actLevel: number, ownedCount: number) -> { hp: number, dmg: number, speed: number }` — multiplier set. `hp = (1.3 + 0.25*actLevel) * (1 + 0.03*min(ownedCount,15))`; `dmg = 1.2 + 0.12*actLevel`; `speed = 1.08 + 0.03*actLevel`. All rounded to 3 decimals.
  - `Enemy.makeElite(scale?: {hp,dmg,speed})` — when `scale` omitted, falls back to the legacy `{hp:1.7, dmg:1.3, speed:1.12}` so existing callers/tests are unaffected.

- [ ] **Step 1: Write the failing test**

Add to `tests/balance.test.js`:
```js
test("eliteScale ramps by act level", () => {
  const a2 = Balance.eliteScale(0, 0);
  const a4 = Balance.eliteScale(2, 0);
  assert.strictEqual(a2.hp, 1.3);
  assert.strictEqual(a4.hp, 1.8);
  assert.ok(a4.dmg > a2.dmg);
  assert.ok(a4.speed > a2.speed);
});

test("eliteScale ramps with player power and caps at 15 owned", () => {
  const fresh = Balance.eliteScale(2, 0);
  const mid = Balance.eliteScale(2, 10);
  const capped = Balance.eliteScale(2, 15);
  const over = Balance.eliteScale(2, 99);
  assert.ok(mid.hp > fresh.hp);
  assert.strictEqual(capped.hp, over.hp);   // capped at 15
  assert.strictEqual(over.hp, 2.61);        // 1.8 * (1 + 0.03*15) = 1.8*1.45
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `Balance.eliteScale is not a function`.

- [ ] **Step 3: Implement `eliteScale`**

In `js/balance.js`, add to `Balance`:
```js
    // Elite stat multipliers: ramp by act tier and by player power
    // (owned-upgrade count, capped at 15) so late fights stay tense.
    eliteScale(actLevel, ownedCount) {
      const lvl = Math.max(0, actLevel);
      const power = 1 + 0.03 * Math.min(ownedCount || 0, 15);
      const round3 = (n) => Math.round(n * 1000) / 1000;
      return {
        hp: round3((1.3 + 0.25 * lvl) * power),
        dmg: round3(1.2 + 0.12 * lvl),
        speed: round3(1.08 + 0.03 * lvl),
      };
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Parameterize `makeElite`**

In `js/entities.js`, replace the `makeElite` body (~`:655-671`) with a scale-driven version that keeps legacy defaults:
```js
    // Tougher clone of the def (never mutate the shared one). `scale` is a
    // {hp,dmg,speed} multiplier set; omitted = legacy flat values.
    makeElite(scale) {
      this.elite = true;
      const s = scale || { hp: 1.7, dmg: 1.3, speed: 1.12 };
      const d = Object.assign({}, this.def);
      d.hp = Math.round(d.hp * s.hp);
      d.touchDmg = Math.round(d.touchDmg * s.dmg);
      if (d.meleeDmg)  d.meleeDmg  = Math.round(d.meleeDmg * s.dmg);
      if (d.chargeDmg) d.chargeDmg = Math.round(d.chargeDmg * s.dmg);
      if (d.emberDmg)  d.emberDmg  = Math.round(d.emberDmg * s.dmg);
      if (d.speed)     d.speed    *= s.speed;
      if (d.bodyW)     d.bodyW = Math.round(d.bodyW * 1.22);
      if (d.bodyH)     d.bodyH = Math.round(d.bodyH * 1.16);
      d.suds = Math.round(d.suds * 1.4);
      this.def = d;
      this.hp = this.maxHp = d.hp;
      this.bodyW = d.bodyW;
      this.bodyH = d.bodyH;
    }
```

- [ ] **Step 6: Compute and pass the scale at the spawn site**

In `js/game.js`, the normal-wave spawn loop (~`:318-326`), compute the scale once and pass it through. `spawnEnemy`'s `opts.elite` is currently a boolean; pass the scale object instead and have `makeElite` receive it. Replace the loop body:
```js
        this.banner(wave.name + (wave.tough ? " — ELITES!" : " — FIGHT!"), 1.3);
        const actLevel = JH.Balance.actLevelForWave(this.waveIndex);
        const ownedCount = Object.keys(JH.Upgrades.owned).length;
        const eliteScale = wave.tough
          ? JH.Balance.eliteScale(actLevel, ownedCount) : null;
        let slot = 0;
        wave.spawns.forEach((grp) => {
          for (let k = 0; k < grp.count; k++) {
            const ex = right - 6 - (slot % 3) * 16 + Math.random() * 10;
            const ey = JH.DEPTH_MIN + 8 + ((slot * 27) % (JH.DEPTH_MAX - JH.DEPTH_MIN - 16));
            const e = this.spawnEnemy(grp.type, clamp(ex, left, right), ey, { elite: eliteScale });
            e.spawnGrace = 0.3 + slot * 0.25; // stagger entrances
            slot++;
          }
        });
```

- [ ] **Step 7: Update `spawnEnemy` to pass the scale through**

In `js/game.js`, `spawnEnemy` (~`:476-484`), `opts.elite` may now be a scale object (truthy) or null:
```js
    spawnEnemy(type, x, y, opts) {
      const e = JH.makeEnemy(type, x, y);
      if (opts) {
        if (opts.infinite) e.infinite = true;
        if (opts.elite && e.makeElite) e.makeElite(opts.elite === true ? undefined : opts.elite);
      }
      this.enemies.push(e);
      return e;
    },
```
(The `opts.elite === true ? undefined : opts.elite` keeps any legacy boolean callers on the flat defaults; object callers get the ramp.)

- [ ] **Step 8: Update the wall-zone reinforcement spawn**

In `js/game.js`, the barricade reinforcement spawn (~`:696`) passes `elite: wave.tough` (a boolean). Convert it to use the ramp too:
```js
              const sc = wave.tough
                ? JH.Balance.eliteScale(JH.Balance.actLevelForWave(this.waveIndex), Object.keys(JH.Upgrades.owned).length)
                : null;
              const e = this.spawnEnemy(type, this.wall.x - 16, ey, { infinite: true, elite: sc });
```

- [ ] **Step 9: Manual verify**

Run: `npm run dev`.
- Warp to WAVE 5 (index 5, Act 2) with few/no upgrades: elites tough but fair.
- Warp to a late Act-4 wave (e.g. index 11) and buy several upgrades first (999 Suds on warp): elites should be visibly beefier than Act 2 — not trivial.
Expected: no console errors; elite HP/damage scales up across acts and with upgrades owned.

- [ ] **Step 10: Commit**

Bump `version` to `0.11.4`, then:
```bash
git add js/balance.js tests/balance.test.js js/entities.js js/game.js package.json
git commit -m "balance: progressive elite ramp by act and player power"
```

---

## Task 6: Charger per-wave cap

Cap chargers per wave so an all-charger swarm can't occur; convert excess to mooks.

**Files:**
- Modify: `js/balance.js` (+ test)
- Modify: `tests/balance.test.js`
- Modify: `js/config.js` (`JH.WAVECAP`)
- Modify: `js/game.js` (normal spawn loop, ~`:318`)

**Interfaces:**
- Consumes: nothing.
- Produces: `JH.Balance.capEnemyType(spawns, type, cap, fallback) -> Array<{type,count}>` — returns a new spawn list where the total count of `type` is clamped to `cap`; any removed count is added to a `fallback`-type group (merged if present). Order preserved; input not mutated.

- [ ] **Step 1: Write the failing test**

Add to `tests/balance.test.js`:
```js
test("capEnemyType clamps a type and reassigns excess to fallback", () => {
  const spawns = [{ type: "charger", count: 4 }, { type: "pyro", count: 1 }];
  const out = Balance.capEnemyType(spawns, "charger", 2, "mook");
  const charger = out.find((g) => g.type === "charger");
  const mook = out.find((g) => g.type === "mook");
  assert.strictEqual(charger.count, 2);
  assert.strictEqual(mook.count, 2);                  // 2 excess → mooks
  assert.strictEqual(out.find((g) => g.type === "pyro").count, 1);
});

test("capEnemyType merges fallback into an existing group and is non-mutating", () => {
  const spawns = [{ type: "charger", count: 3 }, { type: "mook", count: 1 }];
  const out = Balance.capEnemyType(spawns, "charger", 2, "mook");
  assert.strictEqual(out.find((g) => g.type === "mook").count, 2); // 1 + 1 excess
  assert.strictEqual(spawns[0].count, 3);             // original untouched
});

test("capEnemyType leaves under-cap lists unchanged", () => {
  const spawns = [{ type: "charger", count: 1 }];
  const out = Balance.capEnemyType(spawns, "charger", 2, "mook");
  assert.deepStrictEqual(out, [{ type: "charger", count: 1 }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `Balance.capEnemyType is not a function`.

- [ ] **Step 3: Implement `capEnemyType`**

In `js/balance.js`, add to `Balance`:
```js
    // Clamp total count of `type` to `cap`; excess becomes `fallback` enemies
    // (merged into an existing fallback group if present). Pure: returns a new
    // list, never mutates the input.
    capEnemyType(spawns, type, cap, fallback) {
      let total = 0;
      spawns.forEach((g) => { if (g.type === type) total += g.count; });
      if (total <= cap) return spawns.map((g) => ({ type: g.type, count: g.count }));
      let excess = total - cap;
      const out = [];
      let capped = false;
      spawns.forEach((g) => {
        if (g.type === type) {
          if (!capped) { out.push({ type, count: cap }); capped = true; }
          // drop additional `type` groups (their counts folded into excess)
        } else {
          out.push({ type: g.type, count: g.count });
        }
      });
      const fb = out.find((g) => g.type === fallback);
      if (fb) fb.count += excess;
      else out.push({ type: fallback, count: excess });
      return out;
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Add the cap tunable to config**

In `js/config.js`, after `JH.WALL`:
```js
  // Per-wave spawn caps to defang luck-driven swings (e.g. all-charger waves).
  JH.WAVECAP = { charger: 2 };
```

- [ ] **Step 6: Apply the cap in the spawn loop**

In `js/game.js`, the normal-wave branch, immediately before `wave.spawns.forEach` (inside Task 5's edited block), derive a capped list and iterate it instead of `wave.spawns`:
```js
        let slot = 0;
        const spawnList = JH.Balance.capEnemyType(
          wave.spawns, "charger", JH.WAVECAP.charger, "mook");
        spawnList.forEach((grp) => {
```
(Change the `wave.spawns.forEach((grp) => {` line to `spawnList.forEach((grp) => {`. Everything inside the loop is unchanged.)

- [ ] **Step 7: Manual verify**

Run: `npm run dev`; warp to WAVE 7 (index 11: `charger 2, pyro 2, mook 1`) and RUBBLE ROW / any charger-heavy wave.
Expected: never more than 2 chargers alive from a single wave's scripted spawns; the freed slots appear as mooks. No console errors.

- [ ] **Step 8: Commit**

Bump `version` to `0.11.5`, then:
```bash
git add js/balance.js tests/balance.test.js js/config.js js/game.js package.json
git commit -m "balance: cap chargers per wave, excess become mooks"
```

---

## Task 7: Repeatable scaling upgrade nodes (Suds sink, part 1)

Add infinitely-repeatable nodes with rising cost, folded into `computeStats`, surfaced in the shop.

**Files:**
- Modify: `js/balance.js` (+ test)
- Modify: `tests/balance.test.js`
- Modify: `js/upgrades.js` (repeatables data + buy/cost/stats logic)
- Modify: `js/game.js` (`renderShop` — repeatables section)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `JH.Balance.repeatableCost(base: number, timesBought: number) -> number` — `Math.round(base * 1.5^timesBought)`.
  - `JH.Upgrades.repeatables: Array<{id, name, desc, baseCost, apply(s)}>` — repeatable node defs.
  - `JH.Upgrades.repCount: { [id]: number }` — purchase counts (reset by `reset()`).
  - `JH.Upgrades.repCost(id) -> number`; `JH.Upgrades.canBuyRep(id, suds) -> boolean`; `JH.Upgrades.buyRep(id, player) -> boolean`.
  - `computeStats(owned)` also folds `repCount` (each repeatable applied `repCount[id]` times).

- [ ] **Step 1: Write the failing test for the cost curve**

Add to `tests/balance.test.js`:
```js
test("repeatableCost rises 1.5x per purchase", () => {
  assert.strictEqual(Balance.repeatableCost(60, 0), 60);
  assert.strictEqual(Balance.repeatableCost(60, 1), 90);
  assert.strictEqual(Balance.repeatableCost(60, 2), 135);
  assert.strictEqual(Balance.repeatableCost(60, 3), 203); // round(202.5)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `Balance.repeatableCost is not a function`.

- [ ] **Step 3: Implement `repeatableCost`**

In `js/balance.js`, add to `Balance`:
```js
    // Cost of the next purchase of a repeatable node (1.5x per prior buy).
    repeatableCost(base, timesBought) {
      return Math.round(base * Math.pow(1.5, timesBought || 0));
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Add repeatables to `js/upgrades.js`**

After the `NODES` array, add:
```js
  // Repeatable "Overcharge" nodes: bought any number of times, cost rises each
  // buy (JH.Balance.repeatableCost). The late-game Suds sink that keeps power
  // creeping to match the elite ramp.
  const REPEATABLES = [
    { id: "ov_dmg",   name: "Overcharge",  baseCost: 60, desc: "+4 spray dmg (repeatable).",
      apply: (s) => { s.sprayDamage += 4; } },
    { id: "ov_water", name: "Reserves",    baseCost: 50, desc: "+12 max water (repeatable).",
      apply: (s) => { s.maxWater += 12; } },
    { id: "ov_hp",    name: "Conditioning",baseCost: 55, desc: "+12 max HP (repeatable).",
      apply: (s) => { s.maxHp += 12; } },
  ];
```

- [ ] **Step 6: Extend the `Upgrades` object**

In `js/upgrades.js`, add `repeatables`/`repCount` to the object and the methods. Add `repeatables: REPEATABLES,` and `repCount: {},` to the object literal; reset `repCount` in `reset()`:
```js
    reset() { this.owned = {}; this.repCount = {}; },
```
Add these methods (after `buy`):
```js
    repById(id) { return REPEATABLES.find((n) => n.id === id); },
    repCost(id) { return JH.Balance.repeatableCost(this.repById(id).baseCost, this.repCount[id] || 0); },
    canBuyRep(id, suds) { return !!this.repById(id) && suds >= this.repCost(id); },
    buyRep(id, player) {
      if (!this.canBuyRep(id, player.suds)) return false;
      player.suds -= this.repCost(id);
      this.repCount[id] = (this.repCount[id] || 0) + 1;
      const fresh = this.computeStats(this.owned);
      const hpGain = fresh.maxHp - player.stats.maxHp;
      const waterGain = fresh.maxWater - player.stats.maxWater;
      player.applyStats(fresh);
      if (hpGain > 0) player.hp = Math.min(fresh.maxHp, player.hp + hpGain);
      if (waterGain > 0) player.water = Math.min(fresh.maxWater, player.water + waterGain);
      return true;
    },
```

- [ ] **Step 7: Fold repeatables into `computeStats`**

In `js/upgrades.js`, `computeStats` must apply repeatables `repCount[id]` times. Replace its body:
```js
    computeStats(owned) {
      const s = JSON.parse(JSON.stringify(JH.PLAYER));
      NODES.forEach((n) => { if (owned && owned[n.id]) n.apply(s); });
      const rc = this.repCount || {};
      REPEATABLES.forEach((n) => {
        const c = rc[n.id] || 0;
        for (let i = 0; i < c; i++) n.apply(s);
      });
      return s;
    },
```
(Note: `computeStats` now reads `this.repCount`, so callers must invoke it as `Upgrades.computeStats(...)` — they already do via `this`/`U.`.)

- [ ] **Step 8: Render repeatables in the shop**

In `js/game.js`, `renderShop`, after the `U.branches.forEach(...)` block and before the closing `connector` helper definition, append a repeatables column:
```js
      const repCol = document.createElement("div");
      repCol.className = "tree-col";
      repCol.innerHTML = '<div class="tree-head">OVERCHARGE</div>';
      U.repeatables.forEach((n) => {
        const cost = U.repCost(n.id);
        const afford = this.player.suds >= cost;
        const node = document.createElement("div");
        node.className = "tree-node " + (afford ? "buyable" : "cant");
        node.innerHTML =
          '<div class="tn-top"><span class="tn-name">' + n.name +
          (U.repCount[n.id] ? " ×" + U.repCount[n.id] : "") + "</span>" +
          '<span class="tn-cost">💧' + cost + "</span></div>" +
          '<div class="tn-desc">' + n.desc + "</div>";
        node.addEventListener("click", () => {
          if (U.buyRep(n.id, this.player)) { this.audio.play("upgrade"); this.renderShop(); }
          else this.audio.play("hurt");
        });
        repCol.appendChild(node);
      });
      list.appendChild(repCol);
```

- [ ] **Step 9: Manual verify**

Run: `npm run dev`; warp anywhere (999 Suds), open shop (walk to vendor / E).
Expected: an OVERCHARGE column with three repeatable nodes; buying one raises its next cost ~1.5×, shows `×N`, and immediately changes the stat (HP bar grows for Conditioning, water bar for Reserves, spray hits harder for Overcharge). Suds deduct correctly. No console errors.

- [ ] **Step 10: Commit**

Bump `version` to `0.11.6`, then:
```bash
git add js/balance.js tests/balance.test.js js/upgrades.js js/game.js package.json
git commit -m "feat: repeatable Overcharge nodes as late-game Suds sink"
```

---

## Task 8: Between-wave consumables (Suds sink, part 2)

Add instant Med Kit and an armed Pressure Charge (damage buff that ticks only during play) to the shop.

**Files:**
- Modify: `js/config.js` (`JH.CONSUMABLES`)
- Modify: `js/entities.js` (`Player`: buff field + spray-damage hook + buff tick in `Player.update`)
- Modify: `js/game.js` (`renderShop` consumables row)

**Interfaces:**
- Consumes: `JH.CONSUMABLES`.
- Produces:
  - `player.pressureBuffT: number` — seconds of damage buff remaining; decremented in `Player.update` (which only runs during play, so the timer naturally pauses in the shop).
  - Player spray damage multiplied by `JH.CONSUMABLES.pressure.mult` while `pressureBuffT > 0`.

- [ ] **Step 1: Add consumable tunables**

In `js/config.js`, after `JH.CONCERTA`:
```js
  // Between-wave consumables (Suds sink). Med Kit heals instantly on purchase;
  // Pressure Charge is "armed" in the shop and ticks down only during play.
  JH.CONSUMABLES = {
    medkit:   { name: "Med Kit",        cost: 45, heal: 60 },
    pressure: { name: "Pressure Charge", cost: 70, mult: 1.5, dur: 8 },
  };
```

- [ ] **Step 2: Initialize the buff field on the player**

In `js/entities.js`, in the `Player` constructor, add the field right after `this.concertaTimer = 0;` (line ~171):
```js
      this.concertaTimer = 0;      // Concerta pill: unlimited water while > 0
      this.pressureBuffT = 0;      // Pressure Charge damage buff, sec remaining
```

- [ ] **Step 3: Apply the buff to spray damage**

In `js/entities.js`, `doSpray`, the per-tick damage line (line ~378):
```js
        const mult = e.def ? (e.def.waterMult || 1) : 1;
        const pressureMult = this.pressureBuffT > 0 ? JH.CONSUMABLES.pressure.mult : 1;
        const dmg = S.sprayDamage * dmgScale * mult * pressureMult * dt;
```
(Only the `pressureMult` line is new plus the `* pressureMult` factor; leave `this.stats.sprayDamage` itself untouched.)

- [ ] **Step 4: Tick the buff down (play-only by construction)**

In `js/entities.js`, `Player.update`, after the existing timer decrements (right after `if (this.regenLock > 0) this.regenLock -= dt;`, line ~186):
```js
      if (this.regenLock > 0) this.regenLock -= dt;
      if (this.pressureBuffT > 0) this.pressureBuffT -= dt;
```
`Player.update` runs only during the `play` state (the shop is a separate state that early-returns before entity updates), so the buff naturally pauses while shopping — no state check needed.

- [ ] **Step 5: Render consumables in the shop**

In `js/game.js`, `renderShop`, after the OVERCHARGE column (Task 7) and before `list.appendChild` of the connector helper, add a consumables column:
```js
      const conCol = document.createElement("div");
      conCol.className = "tree-col";
      conCol.innerHTML = '<div class="tree-head">SUPPLIES</div>';
      const cons = [
        { key: "medkit", buy: () => {
            const c = JH.CONSUMABLES.medkit;
            if (this.player.suds < c.cost) return false;
            this.player.suds -= c.cost;
            this.player.hp = Math.min(this.player.stats.maxHp, this.player.hp + c.heal);
            return true;
          }, label: () => JH.CONSUMABLES.medkit.name,
          desc: () => "Heal " + JH.CONSUMABLES.medkit.heal + " HP now.",
          cost: () => JH.CONSUMABLES.medkit.cost },
        { key: "pressure", buy: () => {
            const c = JH.CONSUMABLES.pressure;
            if (this.player.suds < c.cost) return false;
            this.player.suds -= c.cost;
            this.player.pressureBuffT = c.dur;
            return true;
          }, label: () => JH.CONSUMABLES.pressure.name,
          desc: () => "+" + Math.round((JH.CONSUMABLES.pressure.mult - 1) * 100) +
                      "% spray dmg for " + JH.CONSUMABLES.pressure.dur + "s of the next fight.",
          cost: () => JH.CONSUMABLES.pressure.cost },
      ];
      cons.forEach((item) => {
        const cost = item.cost();
        const afford = this.player.suds >= cost;
        const node = document.createElement("div");
        node.className = "tree-node " + (afford ? "buyable" : "cant");
        node.innerHTML =
          '<div class="tn-top"><span class="tn-name">' + item.label() + "</span>" +
          '<span class="tn-cost">💧' + cost + "</span></div>" +
          '<div class="tn-desc">' + item.desc() + "</div>";
        node.addEventListener("click", () => {
          if (item.buy()) { this.audio.play("buy"); this.renderShop(); }
          else this.audio.play("hurt");
        });
        conCol.appendChild(node);
      });
      list.appendChild(conCol);
```

- [ ] **Step 6: Manual verify**

Run: `npm run dev`; warp (999 Suds), take some damage, open shop.
- Med Kit: HP increases by 60 (capped at max) on purchase; Suds deduct.
- Pressure Charge: buy it, BACK TO THE STREET, spray — damage is visibly higher for ~8s, then returns to normal. Confirm the timer does NOT tick while sitting in the shop (buy it, wait in shop, leave — still buffed).
Expected: no console errors.

- [ ] **Step 7: Commit**

Bump `version` to `0.11.7`, then:
```bash
git add js/config.js js/entities.js js/game.js package.json
git commit -m "feat: between-wave consumables (Med Kit + Pressure Charge)"
```

---

## Final verification

- [ ] **Run the full unit suite:** `node --test` → all tests PASS.
- [ ] **Full manual playthrough** from a fresh run (no warp): early game no longer water-starved or upgrade-starved; mid-game steady; late game (maxed tree + Overcharge stacks) still has tension from the elite ramp; Suds always have a sink; no all-charger waves; Pyros/Chargers drop more.
- [ ] Confirm `package.json` version is `0.11.7` and the build tag shows it.

## Notes for the executor

- These tasks are ordered so each ends with an independently testable, committable deliverable. Tasks 3/5/6/7 each add one pure helper (tested) before its integration step.
- Tier-A (Task 1) and the shop-UI / player-buff steps have no unit tests by design — the project has no DOM/canvas test harness; they use the established manual-playtest verification.
- Charger stats and boss payouts are intentionally untouched (see Global Constraints).
- If `git` is run, do it on the local machine per `DEPLOY.md`; commit only when the user has authorized it.
