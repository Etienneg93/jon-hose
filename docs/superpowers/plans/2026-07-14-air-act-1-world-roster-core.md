# Air Act Plan 1 of 3 — World & Roster Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Air World exists and plays: post-truck-run arrival lands Jon on the
cloudline street, the two air verbs (stink clouds, gust lanes) work, all 4
sanitation enemies + their elite forms exist, and waves 30–32 are playable.

**Architecture:** Extends the existing single-world machinery — a 6th act entry in
every act-indexed array, 3 new wave entries appended after THE SLAYER, world
coordinates extended past the gate (`ZONE4_START`), and `afterTruckRun()`
rerouted from its `win()` stub into `enterAirAct()`. New hazards follow the
FirePatch pattern (own game array, footprint() shared by draw + hit); new
enemies follow the Enemy-subclass pattern with procedural painters only
(baking is a later art pass).

**Tech Stack:** Vanilla JS, global `JH` namespace, no bundler. Tests: `node --test`
(`npm test`), dual-export pattern where applicable.

**Spec:** `docs/superpowers/specs/2026-07-12-air-act-ass-man-design.md`
**Branch:** `air-act` off `main` (create at execution start; keep the user's
uncommitted WIP — sprites, CLAUDE.md — out of every commit).
**Plans 2–3** (super-elites/set-piece, Ass Man/bookends/K-9/leaderboard) are
written after this plan ships its playtest.

## Global Constraints

- **Honest numbers:** waterMult stays 1 on all four new enemies. Stink clouds
  attack the pressure TIER, never hidden HP. The tank bar shows latch drain live.
- **Rim is hitbox:** every new shape (cloud footprint, gust band, bidet landing
  ellipse, TP death puff) shares ONE shape function between draw and hit test,
  and gets a rim unit test. Stink clouds specifically have NO drawn ground
  ellipse — the puff mass is generated FROM the footprint (spec lock).
- **No jump, no melee.** Never suggest or add them.
- **All tunables in `js/config.js`** — no gameplay constants in other files.
- **Comments carry behavioral/mechanical facts only** (units, conventions,
  gotchas). Design intent goes in commit messages.
- **Commit per task on `air-act` with explicit file lists** (`git add js/config.js
  tests/air.test.js` — NEVER `git add -A`/`.`: the working tree holds the user's
  uncommitted sprite WIP).
- **Never touch** `sprites/mook/*`, `sprites/fuse/walk0-3.png`, or run any baker.
- **Headless testing:** telemetry endpoint in config is LIVE — install a fetch
  spy BEFORE `startGame`. Programmatic keypresses must span ≥2 frames (~120ms).
- **Merge to main only after the user playtests** — this plan ends held on the
  branch, not released.

## Balance derivation (threat scores, damage-per-10s, every cycle hits)

Band targets from the spec: rushers near mook/charger (60–105), control pieces
near smelt/fuse (35–45).

| Enemy | Cycle math | Score |
|---|---|---|
| Plunger Fiend | lunge 10 dmg / (0.5 wind + 0.5 lunge + 2.5 latch + 2.2 cd = 5.7s) ≈ 18 HP-dps10, **plus** latch 22 water/s × 2.5s = 55 water/cycle ≈ 96 water per 10s (≈ a full base tank) | rusher band via tank pressure; dash answers it instantly, same counter-verb as charger (61) |
| TP Mummy | wrap 8 dmg / (0.45 wind + 2.4 cd = 2.85s) ≈ 28 dps10 + 1.2s soft slow utility + touch 8 chip | ~35 — fuse (38) neighborhood |
| Gasbag | touch 8 only; its threat is OUTPUT DENIAL: gassed full tier = low tier (dmgScale 1.0 → 0.4) costs Jon up to 30 dps of the base 50 | control band by denial; hp 55 dies in ~1.1s of full spray, so the pop-fast reward (vent wind 0.8 + first-vent delay ≥1.5s) is reachable |
| Bidet Turret | 12 dmg / (0.9 aim + 2.6 cd = 3.5s) ≈ 34 dps10 | ~34 — smelt (40) neighborhood; immobile artillery |

Elite forms come free via `makeElite`: act-4 scale = hp ×(2.3 × power ≤1.72),
dmg ×1.68, speed ×1.2. Highest elite hp = bidet 120 × 3.96 ≈ 475, safely below
boss hp — no `ELITE_TUNE` damp entries needed.

## Temporary states this plan ships (removed by Plans 2–3)

- Clearing wave 32 (last list entry) triggers `win()` — the existing
  final-wave check. Plan 2 appends waves 33–35 and moves it; Plan 3 ends it.
- Air arrival is a banner beat ("THE AIR WORLD"), not the Ass Man entry
  cutscene (Plan 3).
- All four enemies render via procedural painters (baked art is a separate
  art pass per the spec).

---

### Task 1: Act-5 config extension + balance plumbing

**Files:**
- Modify: `js/config.js` (ACT_STARTS ~line 972, TICKETS ~367, WAVEFLOW ~376,
  ELITE_FRAC ~394, SUPER_TUNE ~408, SPRINKLE ~420, SHOP ~68, LEVEL_LEN/zones ~37–41,
  HYDRANTS ~49, LEVEL1.waves ~1013)
- Modify: `js/balance.js:233-243` (`unlockedPool` gains `fromWave`)
- Modify: `js/game.js:19` (WAVE_TRIGGERS), `js/game.js:637` (pool floor call)
- Create: `tests/air.test.js`

**Interfaces:**
- Produces: `JH.ACT_STARTS = [0, 5, 10, 16, 23, 29]`; 6th entries on all
  act-indexed arrays; `JH.ZONE4_START = 11500`; `JH.LEVEL_LEN = 12800`;
  `JH.SPRINKLE.poolFloor` (act-indexed, `[0,0,0,0,0,29]`);
  `Balance.unlockedPool(waves, waveIndex, fromWave)` (3rd param optional,
  default 0); wave entries `SANITATION 101` / `TANGLED UP` / `GAS LEAK`
  referencing types `plunger`, `tpmummy`, `gasbag` (classes arrive in Tasks
  4–6; the entries are inert data until then and the suite must stay green
  because `JH.ENEMIES` defs for all four types are added HERE).
- Consumes: existing `Balance.ticketBudget` clamped act-indexed lookup.

- [ ] **Step 1: Write the failing tests**

Create `tests/air.test.js`:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");

// Capture the WAVE_TRIGGERS-length warning game.js emits at require time.
const warnings = [];
const realWarn = console.warn;
console.warn = (...a) => { warnings.push(a.join(" ")); realWarn(...a); };

global.window = global.window || {};
require("../js/config.js");
global.window.JH.Loader = { img: () => ({}) };
require("../js/world.js");
require("../js/upgrades.js");
require("../js/benedictions.js");   // Player.doSpray reads beneRank — load it like the game does
require("../js/entities.js");
require("../js/game.js");
console.warn = realWarn;
const JH = global.window.JH;
const Balance = require("../js/balance.js");

test("air act: ACT_STARTS gains the 6th act at wave 29", () => {
  assert.deepStrictEqual(JH.ACT_STARTS, [0, 5, 10, 16, 23, 29]);
  assert.strictEqual(Balance.actLevelForWave(29, JH.ACT_STARTS), 4);
  assert.strictEqual(Balance.actLevelForWave(31, JH.ACT_STARTS), 4);
  assert.strictEqual(Balance.actLevelForWave(28, JH.ACT_STARTS), 3);
});

test("air act: every act-indexed array has an entry for actLevel 4 (index 5)", () => {
  for (const [name, arr] of [
    ["TICKETS.budgets", JH.TICKETS.budgets],
    ["WAVEFLOW.fieldCap", JH.WAVEFLOW.fieldCap],
    ["SPRINKLE.counts", JH.SPRINKLE.counts],
    ["SPRINKLE.poolFloor", JH.SPRINKLE.poolFloor],
    ["SUPER_TUNE.hpByAct", JH.SUPER_TUNE.hpByAct],
    ["ELITE_FRAC", JH.ELITE_FRAC],
    ["SHOP.relicGradeOdds", JH.SHOP.relicGradeOdds],
  ]) assert.ok(arr.length >= 6, name + " needs 6 entries, has " + arr.length);
  // ELITE_FRAC is read UNCLAMPED (game.js waveEliteFrac) — a missing 6th
  // entry silently zeroes air-act elites.
  assert.ok(JH.ELITE_FRAC[5] > 0);
  assert.strictEqual(JH.SPRINKLE.poolFloor[5], JH.ACT_STARTS[5]);
});

test("air act: WAVE_TRIGGERS matches the wave list (no length warning)", () => {
  assert.strictEqual(warnings.filter((w) => w.includes("WAVE_TRIGGERS")).length, 0,
    "game.js warned: " + warnings.join(" | "));
  assert.strictEqual(JH.LEVEL1.waves.length, 32);  // 29 + the 3 air waves
});

test("air act: waves 30-32 are authored per spec (pair, +gusts, +gasbags/tough)", () => {
  const w = JH.LEVEL1.waves;
  const types = (i) => w[i].spawns.map((g) => g.type);
  assert.deepStrictEqual([...new Set(types(29))].sort(), ["plunger", "tpmummy"]);
  assert.ok(!w[29].gusts && !w[29].tough);
  assert.ok(w[30].gusts && w[30].gusts.length >= 1, "wave 31 introduces gust lanes");
  assert.ok(types(31).includes("gasbag") && w[31].tough, "wave 32 adds gasbags + elite seasoning");
  // All four defs exist and are honest (waterMult 1).
  for (const t of ["plunger", "tpmummy", "gasbag", "bidet"])
    assert.strictEqual(JH.ENEMIES[t].waterMult, 1, t + " must not hide a soak");
});

test("air act: sprinkle pool floor keeps fire enemies out of the air roster", () => {
  const pool = Balance.unlockedPool(JH.LEVEL1.waves, 30, JH.ACT_STARTS[5]);
  assert.ok(pool.includes("plunger") && pool.includes("tpmummy"));
  for (const t of ["fuse", "smelt", "furnace", "mook", "charger", "pyro"])
    assert.ok(!pool.includes(t), t + " must not sprinkle into the air act");
  // Default arg unchanged: full pool from wave 0.
  assert.ok(Balance.unlockedPool(JH.LEVEL1.waves, 30).includes("mook"));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- --test-name-pattern "air act"` (or `node --test tests/air.test.js`)
Expected: FAIL — ACT_STARTS has 5 entries, waves length 29, `poolFloor` undefined.

- [ ] **Step 3: Implement the config extension**

In `js/config.js`:

1. `ACT_STARTS` (~line 972) becomes:
```js
// Act-start wave indices (bounded by boss clears) — death respawns here.
// 0 Act1 · 5 Act2 (after Big Drip) · 10 Act3 (after Switch) · 16 Act4 (after
// Quake) · 23 Fire (after GK) · 29 Air (after Slayer + the gate crash).
JH.ACT_STARTS = [0, 5, 10, 16, 23, 29];
```

2. Act-indexed arrays gain a 6th entry (keep each line's existing comment):
```js
JH.TICKETS  = { budgets: [4, 4, 5, 5, 6, 6] };
JH.WAVEFLOW = { fieldCap: [4, 6, 7, 7, 7, 8], trickle: 1.1,
                batchMin: 3, batchMax: 5, batchPause: 2.0 };
JH.ELITE_FRAC = [0, 0.34, 0.55, 0.75, 0.9, 0.9];
// in JH.SUPER_TUNE:
  hpByAct: [0.55, 0.75, 0.9, 1, 1, 1],
// in JH.SPRINKLE:
  counts: [1, 1, 2, 3, 4, 4],
  weights: { mook: 3, pyro: 3, fuse: 3, stalker: 3, charger: 2,
             bulwark: 0.5, furnace: 0.5, smelt: 0.5,
             plunger: 3, tpmummy: 3, gasbag: 2, bidet: 0 },  // bidet: pre-placed artillery, never sprinkled
  // First wave of the sprinkle pool by actLevel+1 (Balance.ticketBudget
  // lookup). The air act (entry 29 = ACT_STARTS[5]) sprinkles ONLY types
  // introduced from wave 29 on — earlier acts keep the full history.
  poolFloor: [0, 0, 0, 0, 0, 29],
// in JH.SHOP:
  relicGradeOdds: [0, 0.25, 0.5, 0.75, 0.75, 0.75],
```

3. World geometry (~lines 37–41): change `JH.LEVEL_LEN` to `12800` and add
below `ZONE3_START`:
```js
JH.ZONE4_START = 11500;   // cloudline street (Air World) — Jon arrives past the gate at +40
```

4. `JH.HYDRANTS` (~line 49) gains a final entry:
```js
{ x: 11740, y: JH.DEPTH_MAX - 12 },   // Air World entry (before WAVE 30)
```

5. Append to `JH.LEVEL1.waves` after `{ name: "THE SLAYER", ... }`:
```js
// ---- Air World (Ass Man's warzone; waves 30+) ----
{ name: "SANITATION 101", spawns: [{ type: "plunger", count: 3 }, { type: "tpmummy", count: 2 }] },
{ name: "TANGLED UP", gusts: [{ y: 43, dir: 1 }],
  spawns: [{ type: "plunger", count: 3 }, { type: "tpmummy", count: 4 }] },
{ name: "GAS LEAK", tough: true, gusts: [{ y: 24, dir: 1 }, { y: 62, dir: -1 }],
  spawns: [{ type: "gasbag", count: 2 }, { type: "plunger", count: 3 }, { type: "tpmummy", count: 3 }] },
```
(Gust lane depths: band 14 around y 24 and 62 leaves walkable gaps at depths
0–10, 38–48, 76–86 — always a dodge lane. `gusts` is consumed in Task 3.)

6. Add the four enemy defs at the end of `JH.ENEMIES` (after `furnace`) and
the palette entries at the end of `JH.PAL` — both blocks below, all at once.
They are pure data; adding them now keeps the wave entries valid while the
classes land task-by-task (an unknown type falls back to the generic Enemy):

```js
// Air-world sanitation roster (Ass Man's warzone). All waterMult 1 —
// honest numbers; their teeth are the latch/snare/gas verbs, not soaks.
plunger: {
  name: "Plunger Fiend", hp: 60, speed: 44, touchDmg: 6, contactCd: 0.8,
  lungeSpeed: 190, lungeWind: 0.5, lungeDur: 0.5, lungeCd: 2.2, lungeDmg: 10,
  latchDrain: 22,     // water units/s siphoned while latched (tank bar shows it live)
  latchMax: 2.5,      // s a latch holds if never dash-broken
  latchOffset: 10,    // px in front of Jon the latched body glues to
  suds: 8, waterMult: 1, dropMult: 1.6, bodyW: 16, bodyH: 26, color: "plunger",
},
tpmummy: {
  name: "TP Mummy", hp: 45, speed: 40, touchDmg: 8, contactCd: 0.8,
  wrapRange: 130, wrapCd: 2.4, wrapWind: 0.45, wrapSpeed: 150, wrapDmg: 8,
  wrapSlow: 0.6,      // moveSpeed multiplier while snared (soft — never a root)
  wrapSlowDur: 1.2,   // s the snare lasts
  driftH: 150,        // streamer drop-in start height
  driftSpeed: 62,     // px/s float-down (vs the fuse's gravity slam)
  puffRadius: 34,     // death gust: one-shot shove ellipse rx (no damage)
  puffKnock: 240,     // shove impulse px/s
  suds: 7, waterMult: 1, dropMult: 1.2, bodyW: 15, bodyH: 27, color: "tpmummy",
},
gasbag: {
  name: "Gasbag", hp: 55, speed: 30, touchDmg: 8, contactCd: 0.8,
  hoverZ: 26,         // cruise height — the spray band still reaches it (nozzleZ 30)
  ventCd: 4.5,        // s between vents
  ventWind: 0.8,      // inflate telegraph before the cloud starts growing
  firstVent: 1.5,     // min s after spawn before the first vent can wind up
  preferRange: 60,    // hover standoff from Jon
  suds: 10, waterMult: 1, dropMult: 1.4, bodyW: 16, bodyH: 20, color: "gasbag",
},
bidet: {
  name: "Bidet Turret", hp: 120, speed: 0, touchDmg: 0, contactCd: 99,
  aimWind: 0.9,       // telegraph: landing ellipse drawn from wind start, target locked
  lobCd: 2.6,
  arcSpeed: 150,      // horizontal px/s of the water arc
  arcGravity: 300,
  landRadius: 26,     // landing ellipse rx — drawn AND hit (one shape)
  landDmg: 12, landKnock: 140,
  suds: 12, waterMult: 1, dropMult: 1.4, bodyW: 20, bodyH: 22, color: "bidet",
},
```
```js
// JH.PAL additions (air roster + gas):
plunger: "#b0543a", plungerDk: "#77351f",
tpmummy: "#e8e4d8", tpmummyDk: "#b3ad9c",
gasbag: "#7fae4a", gasbagDk: "#4f7a2a", gasbagHi: "#b9d98a",
stink: "#a7c25e",
bidet: "#e9edf2", bidetDk: "#a8b4c2", bidetHi: "#ffffff",
```

7. In `js/balance.js`, `unlockedPool` gains the optional floor (keep the
existing comment, extend it):
```js
// Enemy types introduced by authored waves up to and including waveIndex
// (from their `spawns` lists — bosses have none). dummy/neighbor excluded.
// Order = first-seen order. `fromWave` (default 0) floors the scan — the
// air act passes its act start so only air types sprinkle there. Pure.
unlockedPool(waves, waveIndex, fromWave) {
  const seen = [];
  const last = Math.min(waveIndex, waves.length - 1);
  for (let i = (fromWave || 0); i <= last; i++) {
    (waves[i].spawns || []).forEach((g) => {
      if (g.type === "dummy" || g.type === "neighbor") return;
      if (!seen.includes(g.type)) seen.push(g.type);
    });
  }
  return seen;
},
```

8. In `js/game.js:19`, append three triggers (air corridor starts past the
gate teleport at ZONE4_START+40 = 11540):
```js
const WAVE_TRIGGERS = [360, 740, 1120, 1500, 1880, 2260, 2640, 3020, 3400, 3780, 4160, 4540, 4920, 5300, 5680, 6060, 6440, 6820, 7200, 7580, 7960, 8340, 8720, 9100, 9480, 9860, 10240, 10620, 11000, 11840, 12220, 12600];
```

9. In `js/game.js:637`, floor the sprinkle pool:
```js
const poolFrom = JH.Balance.ticketBudget(actLevel, JH.SPRINKLE.poolFloor || [0]);
const pool = JH.Balance.unlockedPool(JH.LEVEL1.waves, this.waveIndex, poolFrom);
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: new "air act" tests PASS; full suite green (existing unlockedPool
tests unaffected — the new param defaults to 0). If any existing test asserts
array lengths or wave counts, update it to derive from config, not literals.

- [ ] **Step 5: Commit**

```bash
git add js/config.js js/balance.js js/game.js tests/air.test.js
git commit -m "feat(air-act): act-5 config extension — ACT_STARTS, act-indexed arrays, waves 30-32 data, sprinkle pool floor"
```

---

### Task 2: Stink clouds — the air ground hazard

**Files:**
- Modify: `js/config.js` (add `JH.STINK` after `JH.FIRE`, ~line 538)
- Modify: `js/entities.js` (StinkCloud class + `JH.spawnStinkCloud` after
  `JH.spawnFirePatch` ~line 2424; Player `gasT` init ~line 169, decay in
  update, tier demotion in doSpray ~line 676, dispersal after the firePatch
  douse block ~line 1016, `clearBuffs` ~line 265)
- Modify: `js/game.js` (array init at lines 477 + 1653, update ~1936, filter
  ~2125, draw ~2429)
- Test: `tests/air.test.js`

**Interfaces:**
- Produces: `JH.StinkCloud` (constructor `(x, y, opts)` with `opts.friendly`),
  `cloud.footprint() -> {rx, ry}`, `cloud.fadeFrac()`, `cloud.sprayProgress`,
  `JH.spawnStinkCloud(game, x, y, opts) -> cloud|null`, `game.stinkClouds`,
  `player.gasT` (seconds remaining of the tier demotion tag).
- Consumes: `Geo.inGroundEllipse`, `JH.FIRE.douseBand` (shared dispersal band).

- [ ] **Step 1: Write the failing tests** (append to `tests/air.test.js`)

```js
function stubPlayer(x, y) {
  JH.Upgrades.reset();
  const p = new JH.Player(x, y);
  return p;
}
function stubHazardGame(px, py) {
  return {
    player: Object.assign(stubPlayer(px, py), { x: px, y: py }),
    enemies: [], embers: [], particles: [], firePatches: [], shields: [],
    stinkClouds: [], gustLanes: [],
    bounds: { minX: 0, maxX: 480 },
    audio: { play() {} }, shake() {}, hitStop() {}, defer() {},
    killJuice() {}, dropLoot() {}, onEnemyKilled() {}, spawnEnemy() {},
    canAttack() { return true; }, sigils: [], banner() {}, combo: 0,
  };
}

test("stink cloud: grows in from the vent point, never spawns full size", () => {
  const c = new JH.StinkCloud(100, 40);
  assert.ok(c.footprint().rx < JH.STINK.radius * 0.3, "t=0 must be near-point");
  c.t = JH.STINK.growT;
  assert.ok(Math.abs(c.footprint().rx - JH.STINK.radius) < 0.001, "full size at growT");
});

test("stink cloud rim: inside tags player.gasT, outside (x and depth) does not", () => {
  const S = JH.STINK;
  const g = stubHazardGame(100, 40);
  const c = new JH.StinkCloud(100, 40); c.t = S.growT;   // full grown
  g.stinkClouds.push(c);
  const f = c.footprint(), pad = g.player.bodyW * 0.25;
  // inside the rim (x axis)
  g.player.x = 100 + f.rx + pad - 2; g.player.gasT = 0;
  c.update(1 / 60, g);
  assert.ok(g.player.gasT > 0, "inside rim must tag gasT");
  // outside the rim (x axis)
  g.player.x = 100 + f.rx + pad + 3; g.player.gasT = 0;
  c.update(1 / 60, g);
  assert.strictEqual(g.player.gasT, 0, "outside rim must not tag");
  // outside in DEPTH: rim ry = rx*GROUND_RY, so depth f.rx would be a circle bug
  g.player.x = 100; g.player.y = 40 + f.rx * 0.8; g.player.gasT = 0;
  c.update(1 / 60, g);
  assert.strictEqual(g.player.gasT, 0, "depth uses the flattened ellipse");
});

test("gas demotes the pressure tier one step (full -> low reach)", () => {
  const g = stubHazardGame(100, 40);
  const p = g.player;
  p.water = p.stats.maxWater * 0.5;   // full tier (0.25..0.8)
  p.gasT = 0; p.doSpray(1 / 60, g);
  const cleanReach = p._dbgReach;
  p.gasT = 0.15; p.doSpray(1 / 60, g);
  assert.ok(p._dbgReach < cleanReach, "gassed reach must shrink");
  assert.ok(Math.abs(p._dbgReach - p.stats.sprayRange * 0.55) < 0.001,
    "full tier demotes to the LOW tier rangeMult");
});

test("spraying into a cloud disperses it; speed scales with spray damage", () => {
  const g = stubHazardGame(100, 40);
  const c = new JH.StinkCloud(150, 40); c.t = JH.STINK.growT;
  g.stinkClouds.push(c);
  g.player.facing = 1; g.player.water = g.player.stats.maxWater;
  g.player.doSpray(1 / 60, g);
  const base = c.sprayProgress;
  assert.ok(base > 0, "stream over the cloud must add dispersal progress");
  c.sprayProgress = 0;
  g.player.stats.sprayDamage = JH.PLAYER.sprayDamage * 2;
  g.player.doSpray(1 / 60, g);
  assert.ok(c.sprayProgress > base * 1.5, "dispersal scales with spray damage");
  c.sprayProgress = JH.STINK.disperseDur;
  assert.ok(c.fadeFrac() >= 1, "fully dispersed cloud is gone");
});

test("friendly cloud cooks enemies, ignores the player; hostile stack check", () => {
  const g = stubHazardGame(100, 40);
  const e = JH.makeEnemy("mook", 100, 40);   // any live enemy works
  g.enemies.push(e);
  const fc = JH.spawnStinkCloud(g, 100, 40, { friendly: true });
  fc.t = JH.STINK.growT;
  const hp0 = e.hp; g.player.gasT = 0;
  fc.update(0.5, g);
  assert.ok(e.hp < hp0, "friendly cloud damages enemies");
  assert.strictEqual(g.player.gasT, 0, "friendly cloud never gasses Jon");
  // Hostile clouds don't stack on the same spot; friendly always spawns.
  const h1 = JH.spawnStinkCloud(g, 200, 40); h1.t = JH.STINK.growT;
  assert.strictEqual(JH.spawnStinkCloud(g, 200, 40), null);
  assert.ok(JH.spawnStinkCloud(g, 200, 40, { friendly: true }) !== null);
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/air.test.js`
Expected: FAIL — `JH.StinkCloud is not a constructor`.

- [ ] **Step 3: Implement**

`js/config.js`, after `JH.FIRE`:
```js
// ---- Stink clouds (air-element ground hazard) --------------------------
// Attacks the pressure TIER, never HP (player.gasT tag -> doSpray demotes
// one step). Sprayed dispersal mirrors fire-patch dousing (damage-scaled).
JH.STINK = {
  radius: 34,        // full-grown footprint rx (world px)
  growT: 0.9,        // s to grow in from the vent point (never spawns full size)
  life: 6,           // s a hostile cloud lingers untouched
  fizzle: 1.2,       // ...fading over these last seconds (like FIRE.patchFizzle)
  disperseDur: 1.6,  // s of BASE-damage spray to disperse (scales up, never below 1x)
  friendlyLife: 3,   // s the pop-fast reward cloud lives
  friendlyDps: 8,    // enemy hp/s inside a friendly cloud
  puffCount: 9,      // billow puffs per cloud
};
```

`js/entities.js`, after `JH.spawnFirePatch` (~line 2424):
```js
// Stink cloud: billowing gas grown from a vent point. NO drawn ground
// ellipse — the puffs are generated FROM footprint() (centers at <=0.72*rx,
// drawn radius 0.28*rx*size, size<=1, so max extent == rx): the visible gas
// edge IS the tested edge. Standing inside tags player.gasT (doSpray demotes
// the pressure tier one step). Spraying it adds sprayProgress (see doSpray).
// `friendly` clouds skip the player and cook enemies (Gasbag pop-fast reward).
class StinkCloud {
  constructor(x, y, opts) {
    this.x = x; this.y = y;
    this.friendly = !!(opts && opts.friendly);
    this.t = 0;
    this.sprayProgress = 0;   // dispersal seconds accumulated (damage-scaled)
    this.dead = false;
    this.puffs = [];
    for (let i = 0; i < JH.STINK.puffCount; i++)
      this.puffs.push({
        ang: Math.random() * Math.PI * 2,
        rad: 0.25 + 0.75 * Math.random(),
        size: 0.55 + 0.45 * Math.random(),
        ph: Math.random() * Math.PI * 2,
      });
  }
  // 0 fresh .. 1 gone: the larger of spray dispersal and end-of-life fade.
  fadeFrac() {
    const S = JH.STINK;
    const sprayed = this.sprayProgress / S.disperseDur;
    const life = this.friendly ? S.friendlyLife : S.life;
    const fade = (this.t - (life - S.fizzle)) / S.fizzle;
    return Math.min(1, Math.max(sprayed, fade, 0));
  }
  // ONE shape: grows in from the vent, shrinks as it disperses. Shared by
  // the hit test AND the puff renderer.
  footprint() {
    const S = JH.STINK;
    const grow = Math.min(1, this.t / S.growT);
    const rx = Math.max(2, S.radius * grow * (1 - this.fadeFrac() * 0.6));
    return { rx, ry: rx * JH.GROUND_RY };
  }
  update(dt, game) {
    this.t += dt;
    const f = this.footprint();
    if (this.friendly) {
      for (const e of game.enemies) {
        if (e.dead || e.dropping) continue;
        if (Geo.inGroundEllipse(e.x, e.y, this.x, this.y, f.rx, f.ry))
          e.takeDamage(JH.STINK.friendlyDps * dt, game, 0, 0);
      }
      if (this.t >= JH.STINK.friendlyLife) this.dead = true;
      return;
    }
    const pl = game.player;
    if (pl && pl.alive && (pl.z || 0) < 18) {
      const pad = (pl.bodyW || 12) * 0.25;   // feet aren't a point (FirePatch idiom)
      if (Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, f.rx + pad, f.ry + pad * JH.GROUND_RY))
        pl.gasT = Math.max(pl.gasT || 0, 0.15);
    }
    if (this.fadeFrac() >= 1) this.dead = true;
  }
  draw(ctx, cam) {
    const f = this.footprint();
    const sx = this.x - cam, sy = Geo.feetScreenY(this.y, 0);
    const gone = this.fadeFrac();
    ctx.save();
    for (const p of this.puffs) {
      const wob = Math.sin(this.t * 1.6 + p.ph) * 0.05;
      const cxp = sx + Math.cos(p.ang) * f.rx * (p.rad * 0.72 + wob);
      const cyp = sy + Math.sin(p.ang) * f.ry * (p.rad * 0.72 + wob);
      const pr = f.rx * 0.28 * p.size;
      ctx.globalAlpha = (0.28 + 0.22 * Math.sin(this.t * 2 + p.ph * 2)) * (1 - gone);
      ctx.fillStyle = this.friendly ? "#d6e89a" : JH.PAL.stink;
      ctx.beginPath();
      ctx.ellipse(cxp, cyp - pr * 0.3, pr, pr * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
JH.StinkCloud = StinkCloud;

// Hostile gas doesn't stack: a vent inside a live hostile cloud is a no-op
// (returns null). Friendly bursts always spawn — the pop-fast reward fires.
JH.spawnStinkCloud = function (game, x, y, opts) {
  if (!(opts && opts.friendly)) {
    for (const sc of game.stinkClouds) {
      if (sc.dead || sc.friendly) continue;
      const f = sc.footprint();
      if (Geo.inGroundEllipse(x, y, sc.x, sc.y, f.rx, f.ry)) return null;
    }
  }
  const c = new StinkCloud(x, y, opts);
  game.stinkClouds.push(c);
  return c;
};
```

Player wiring (`js/entities.js`):
1. Constructor (~line 169 block): add `this.gasT = 0; this.snareT = 0; this.snareMult = 1;`
   (snare fields are consumed in Task 5; declaring them here keeps clearBuffs whole).
2. In `update()` near the other timer decays: `if (this.gasT > 0) this.gasT -= dt;`
   and `if (this.snareT > 0) this.snareT -= dt;`
3. In `clearBuffs()` (~line 265): add `this.gasT = 0; this.snareT = 0;`
4. In `doSpray`, directly after the tier ladder (after the `else { dmgScale = 0.40; ... }`
   line ~676):
```js
// Stink gas clogs the nozzle: while gassed (StinkCloud tag) output drops
// one PRESSURE TIER — bonus reads as full, full reads as low. The tank bar
// is untouched (honest numbers: the TIER is what the gas attacks).
// Deliberately overrides pressureFloor — the pillar guards tank fraction,
// not sabotage.
if (this.gasT > 0 && !dry) {
  if (frac >= 0.80) { dmgScale = 1.00; rangeMult = 1.00; }
  else { dmgScale = 0.40; rangeMult = 0.55; }
}
```
5. In `doSpray`, right after the firePatch douse loop closes (~line 1020):
```js
// Water washes air: spraying into a stink cloud disperses it — same
// stream test and damage scaling as the fire-patch douse above.
if (game.stinkClouds) for (const sc of game.stinkClouds) {
  if (sc.dead || sc.friendly) continue;
  const f = sc.footprint();
  const fwd = (sc.x - ox) * this.facing;
  if (fwd > 0 && fwd - this.bodyW * 0.5 - f.rx <= reach
      && Math.abs(sc.y - oy) < JH.FIRE.douseBand)
    sc.sprayProgress += dt * Math.max(1, (S.sprayDamage * dmgScale) / JH.PLAYER.sprayDamage);
}
```

Game wiring (`js/game.js`) — mirror the firePatches idiom at each site:
- Lines 477 and 1653 (both reset lists): append `this.stinkClouds = []; this.gustLanes = [];`
- After line 1936 (`for (const fp of this.firePatches) fp.update(dt, this);`):
```js
for (const sc of this.stinkClouds) sc.update(dt, this);
for (const gl of this.gustLanes) gl.update(dt, this);
```
- After line 2125 (firePatches filter): `this.stinkClouds = this.stinkClouds.filter((sc) => !sc.dead);`
- After line 2429 (`for (const fp of this.firePatches) fp.draw(ctx, cam);`):
```js
for (const gl of this.gustLanes) gl.draw(ctx, cam);
for (const sc of this.stinkClouds) sc.draw(ctx, cam);
```
(`gustLanes` is populated in Task 3; empty-array iteration is safe now.)

- [ ] **Step 4: Run tests** — `npm test`. Expected: all air tests pass, suite green.
- [ ] **Step 5: Commit**

```bash
git add js/config.js js/entities.js js/game.js tests/air.test.js
git commit -m "feat(air-act): stink clouds — pressure-tier gas hazard, spray dispersal, pop-fast friendly variant"
```

---

### Task 3: Gust lanes — telegraphed wind bands

**Files:**
- Modify: `js/config.js` (add `JH.GUST` after `JH.STINK`)
- Modify: `js/entities.js` (GustLane class after StinkCloud)
- Modify: `js/game.js` (spawn from wave data in `startWave`, clear in `waveCleared_` ~line 802)
- Test: `tests/air.test.js`

**Interfaces:**
- Produces: `JH.GustLane` (constructor `(y, dir)`), `lane.inBand(y)`,
  `lane.phase` ("telegraph" | "blow" | "gap"); waves consume the `gusts:
  [{y, dir}]` data added in Task 1.
- Consumes: `game.gustLanes` array + update/draw wiring from Task 2.

- [ ] **Step 1: Write the failing tests** (append to `tests/air.test.js`)

```js
test("gust lane rim: the drawn band edge is the push edge; telegraph never pushes", () => {
  const G = JH.GUST;
  const g = stubHazardGame(200, 40);
  const lane = new JH.GustLane(40, 1);
  g.gustLanes.push(lane);
  lane.phase = "blow"; lane.phaseT = G.blowDur;
  // inside the band
  g.player.y = 40 + G.band - 1; const x0 = g.player.x;
  lane.update(1 / 60, g);
  assert.ok(g.player.x > x0, "inside the band: pushed along +X");
  // just outside the band
  g.player.y = 40 + G.band + 1; const x1 = g.player.x;
  lane.update(1 / 60, g);
  assert.strictEqual(g.player.x, x1, "outside the drawn edge: untouched");
  // telegraph phase never pushes
  lane.phase = "telegraph"; lane.phaseT = G.telegraph;
  g.player.y = 40; const x2 = g.player.x;
  lane.update(1 / 60, g);
  assert.strictEqual(g.player.x, x2);
});

test("gust lane: displaces light enemies; emplacements and bosses hold fast", () => {
  const g = stubHazardGame(200, 0);
  const lane = new JH.GustLane(40, 1);
  lane.phase = "blow"; lane.phaseT = JH.GUST.blowDur;
  const mook = JH.makeEnemy("mook", 100, 40);
  const turret = JH.makeEnemy("bidet", 140, 40);
  const boss = JH.makeEnemy("mook", 180, 40); boss.isBoss = true;
  g.enemies.push(mook, turret, boss);
  lane.update(1 / 60, g);
  assert.ok(mook.x > 100, "light enemy shoved");
  assert.strictEqual(turret.x, 140, "speed-0 emplacement immune");
  assert.strictEqual(boss.x, 180, "boss immune");
});

test("gust lane cycle: telegraph -> blow -> gap -> telegraph", () => {
  const G = JH.GUST;
  const g = stubHazardGame(0, 0);
  const lane = new JH.GustLane(40, 1);
  assert.strictEqual(lane.phase, "telegraph");
  lane.update(G.telegraph + 0.01, g);
  assert.strictEqual(lane.phase, "blow");
  lane.update(G.blowDur + 0.01, g);
  assert.strictEqual(lane.phase, "gap");
  lane.update(G.gapDur + 0.01, g);
  assert.strictEqual(lane.phase, "telegraph");
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/air.test.js`
Expected: FAIL — `JH.GustLane is not a constructor`.

- [ ] **Step 3: Implement**

`js/config.js`, after `JH.STINK`:
```js
// ---- Gust lanes (telegraphed horizontal wind bands) --------------------
// One shape feeds telegraph, draw, and shove (SwitchBoss.lineHits
// precedent): |y - laneY| <= band. Displaces along X; dodged by depth.
JH.GUST = {
  band: 14,          // depth half-band — the drawn edge lines ARE the hit band
  telegraph: 1.2,    // s of edge flash + faint streaks before the blow
  blowDur: 3.5,      // s of active push
  gapDur: 2.5,       // s of calm between blows
  push: 120,         // px/s applied to Jon along the lane direction
  pushEnemy: 100,    // px/s applied to light enemies (bosses/emplacements immune)
};
```

`js/entities.js`, after `JH.spawnStinkCloud`:
```js
// Telegraphed horizontal wind band. Cycles telegraph -> blow -> gap while it
// lives; wave terrain lanes (wave data `gusts`) persist until the wave
// clears. Push can't be outrun along X (120 vs moveSpeed 92) — the counter
// is depth. Dash (240) also escapes; dashing bodies still get pushed.
class GustLane {
  constructor(y, dir) {
    this.y = y; this.dir = dir >= 0 ? 1 : -1;
    this.t = 0; this.phase = "telegraph"; this.phaseT = JH.GUST.telegraph;
    this.dead = false;
  }
  inBand(y) { return Math.abs(y - this.y) <= JH.GUST.band; }
  update(dt, game) {
    const G = JH.GUST;
    this.t += dt;
    this.phaseT -= dt;
    if (this.phaseT <= 0) {
      if (this.phase === "telegraph") { this.phase = "blow"; this.phaseT = G.blowDur; }
      else if (this.phase === "blow") { this.phase = "gap"; this.phaseT = G.gapDur; }
      else { this.phase = "telegraph"; this.phaseT = G.telegraph; }
    }
    if (this.phase !== "blow") return;
    const pl = game.player;
    if (pl && pl.alive && this.inBand(pl.y))
      pl.x = clamp(pl.x + this.dir * G.push * dt, game.bounds.minX, game.bounds.maxX);
    for (const e of game.enemies) {
      if (e.dead || e.dropping || e.isBoss) continue;
      if (e.def && e.def.speed === 0) continue;   // emplacements hold fast
      if (this.inBand(e.y))
        e.x = clamp(e.x + this.dir * G.pushEnemy * dt, game.bounds.minX, game.bounds.maxX);
    }
  }
  draw(ctx, cam) {
    // Edge lines at laneY ± band = exactly the tested band (rim is hitbox).
    const G = JH.GUST;
    const yT = Geo.feetScreenY(this.y - G.band, 0), yB = Geo.feetScreenY(this.y + G.band, 0);
    const blowing = this.phase === "blow";
    const flash = this.phase === "telegraph" && (Math.floor(this.t * 8) & 1);
    ctx.save();
    ctx.globalAlpha = blowing ? 0.5 : this.phase === "telegraph" ? (flash ? 0.6 : 0.25) : 0.1;
    ctx.strokeStyle = "#bfe6ff";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(0, yT); ctx.lineTo(JH.VIEW_W, yT); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, yB); ctx.lineTo(JH.VIEW_W, yB); ctx.stroke();
    ctx.setLineDash([]);
    // Wind streaks INSIDE the band only (never outside the tested edges).
    if (blowing || this.phase === "telegraph") {
      const n = blowing ? 9 : 4;
      for (let i = 0; i < n; i++) {
        const k = (this.t * (blowing ? 1.4 : 0.4) + i / n) % 1;
        const lx = this.dir > 0 ? k * JH.VIEW_W : (1 - k) * JH.VIEW_W;
        const ly = yT + 2 + ((i * 37) % Math.max(1, yB - yT - 4));
        ctx.globalAlpha = (blowing ? 0.5 : 0.2) * (1 - Math.abs(k - 0.5) * 1.6);
        ctx.fillStyle = "#dff2ff";
        ctx.fillRect(Math.round(lx), Math.round(ly), 14, 1);
      }
    }
    ctx.restore();
  }
}
JH.GustLane = GustLane;
```

`js/game.js` wave wiring:
- In `startWave`, right after `JH.Camera.lock();` / bounds setup (~line 563),
  add:
```js
// Terrain wind: waves 31+ author gust lanes ({y, dir} rows in wave data).
this.gustLanes = (wave.gusts || []).map((gd) => new JH.GustLane(gd.y, gd.dir));
```
- In `waveCleared_` at the cleanup line (~802, `this.wall = null; this.gardens = [];`),
  append `this.gustLanes = [];`

- [ ] **Step 4: Run tests** — `npm test`. Expected green.
- [ ] **Step 5: Commit**

```bash
git add js/config.js js/entities.js js/game.js tests/air.test.js
git commit -m "feat(air-act): gust lanes — telegraphed wind bands, wave terrain wiring"
```

---

### Task 4: Plunger Fiend — the latching rusher

**Files:**
- Modify: `js/entities.js` (PlungerFiend class before `JH.makeEnemy` ~line 5361;
  register in `JH.makeEnemy`; `makeElite` lunge/wrap/land dmg lines ~line 1409)
- Modify: `js/assets.js` (procedural painter, near the other `registerBaked`
  calls ~line 894 — plain `Assets.register`, no baking)
- Test: `tests/air.test.js`

**Interfaces:**
- Produces: `JH.makeEnemy("plunger", x, y)` returns a PlungerFiend; states
  `walk|wind|lunge|latch|idle`; while latched it glues to
  `player.x + player.facing * def.latchOffset` and drains `player.water`.
- Consumes: def from Task 1; `player.dashTimer` (the latch break),
  `Geo.bodiesOverlap`, `game.canAttack()` (lunge is a melee-class attack —
  it holds a ticket through wind+lunge+latch).

- [ ] **Step 1: Write the failing tests** (append to `tests/air.test.js`)

```js
test("plunger: lunge contact latches and drains WATER, not HP", () => {
  const g = stubHazardGame(100, 40);
  const e = JH.makeEnemy("plunger", 90, 40);
  g.enemies.push(e);
  e.state = "lunge"; e.attackTimer = JH.ENEMIES.plunger.lungeDur;
  e.aimAng = 0; e.spawnGrace = 0;
  const hp0 = g.player.hp, w0 = g.player.water;
  e.think(1 / 60, g);
  assert.strictEqual(e.state, "latch");
  e.think(1, g);   // one full latched second
  assert.ok(w0 - g.player.water >= JH.ENEMIES.plunger.latchDrain * 0.99,
    "latch drains latchDrain water/s");
  assert.ok(g.player.hp >= hp0 - JH.ENEMIES.plunger.lungeDmg,
    "only the lunge hit touches HP, the latch itself never does");
});

test("plunger: a dash breaks the latch; latch ignores spray knockback", () => {
  const g = stubHazardGame(100, 40);
  const e = JH.makeEnemy("plunger", 100, 40);
  e.state = "latch"; e.latchT = 2;
  e.applyKnockback(1, 500);
  assert.strictEqual(e.knockVX || 0, 0, "suction holds through knockback");
  g.player.dashTimer = 0.1;
  e.think(1 / 60, g);
  assert.notStrictEqual(e.state, "latch", "dash pops it off");
  assert.ok(e.cdTimer > 0, "broken latch goes on lunge cooldown");
});

test("plunger: dash i-frames also dodge the lunge grab itself", () => {
  const g = stubHazardGame(100, 40);
  const e = JH.makeEnemy("plunger", 90, 40);
  e.state = "lunge"; e.attackTimer = JH.ENEMIES.plunger.lungeDur; e.aimAng = 0;
  g.player.dashTimer = 0.1;
  e.think(1 / 60, g);
  assert.notStrictEqual(e.state, "latch");
});

test("makeElite scales the air-roster damage keys", () => {
  const e = JH.makeEnemy("plunger", 0, 0);
  const base = JH.ENEMIES.plunger.lungeDmg;
  e.makeElite({ hp: 2, dmg: 1.5, speed: 1 });
  assert.strictEqual(e.def.lungeDmg, Math.round(base * 1.5));
});
```

- [ ] **Step 2: Run to verify failure** — FAIL: `makeEnemy` returns a generic
Enemy with no `latch` handling (`state` never becomes "latch").

- [ ] **Step 3: Implement**

`js/entities.js` — in `makeElite` (~line 1409), extend the per-key damage
scaling block:
```js
if (d.lungeDmg) d.lungeDmg = Math.round(d.lungeDmg * s.dmg);
if (d.wrapDmg)  d.wrapDmg  = Math.round(d.wrapDmg * s.dmg);
if (d.landDmg)  d.landDmg  = Math.round(d.landDmg * s.dmg);
```

New class (place with the other enemy classes, before `JH.makeEnemy`):
```js
// ---- Plunger Fiend: lunging rusher that LATCHES and drains the tank ----
// Attacks the weapon, not the HP bar: a held latch siphons water (visible
// on the tank bar). A dash breaks it — the same counter-verb as chargers.
class PlungerFiend extends Enemy {
  applyKnockback(dirX, force, dirY) {
    if (this.state === "latch") return;   // suction holds through spray shove
    super.applyKnockback(dirX, force, dirY);
  }
  think(dt, game) {
    const pl = game.player, d = this.def;
    const dx = pl.x - this.x, dy = pl.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (this.state !== "lunge" && this.state !== "latch")
      this.facing = dx >= 0 ? 1 : -1;

    if (this.state === "latch") {
      this.latchT -= dt;
      // Glued to Jon's front; the stuck-on sprite state reads the clog.
      this.x = pl.x + pl.facing * d.latchOffset;
      this.y = pl.y;
      this.facing = -pl.facing;
      pl.water = Math.max(0, pl.water - d.latchDrain * dt);
      const broken = pl.dashTimer > 0;
      if (broken || this.latchT <= 0 || !pl.alive) {
        this.state = "idle"; this.cdTimer = d.lungeCd; this.usingTicket = false;
        if (broken) {
          super.applyKnockback(-pl.facing, 200);
          game.audio.play("whack");
        }
      }
      return;
    }
    if (this.state === "lunge") {
      this.attackTimer -= dt;
      this.x += Math.cos(this.aimAng) * d.lungeSpeed * dt;
      this.y += Math.sin(this.aimAng) * d.lungeSpeed * dt * 0.6;
      // Dash i-frames dodge the grab like any hit.
      if (Geo.bodiesOverlap(this, pl) && pl.z < 20
          && pl.dashTimer <= 0 && pl.dashGraceT <= 0) {
        pl.takeHit(d.lungeDmg, game, this.x);
        this.state = "latch"; this.latchT = d.latchMax;
        game.audio.play("sizzle");
        return;
      }
      if (this.attackTimer <= 0) { this.state = "idle"; this.cdTimer = d.lungeCd; this.usingTicket = false; }
      return;
    }
    if (this.windTimer > 0) {
      this.windTimer -= dt; this.state = "wind";
      this.aimAng = Math.atan2(dy, dx);
      if (this.windTimer <= 0) { this.state = "lunge"; this.attackTimer = d.lungeDur; }
      return;
    }
    if (this.cdTimer > 0) { this.cdTimer -= dt; this.state = "idle"; return; }
    if (dist < 120 && Math.abs(dy) < 16 && this.spawnGrace <= 0 && game.canAttack()) {
      this.windTimer = d.lungeWind; this.windDur = d.lungeWind; this.state = "wind";
      this.usingTicket = true;
      this.aimAng = Math.atan2(dy, dx);
    } else {
      this.x += (dx / (dist || 1)) * d.speed * dt;
      this.y += (dy / (dist || 1)) * d.speed * dt * 0.9;
      this.state = "walk";
    }
  }
}
JH.PlungerFiend = PlungerFiend;
```

In `JH.makeEnemy` add (with the other type lines):
```js
if (type === "plunger") return new PlungerFiend(type, x, y);
```

`js/assets.js` painter (place near the other enemy registrations; the painter
signature is `fn(p, opt, ctx, x, y, facing)` with `p(lx, ly, w, h, color)`
feet-anchored, ly measured UP):
```js
// Plunger Fiend: squat rubber imp with a plunger-cup head. Lip flares on
// windup/latch; suction ticks while latched.
Assets.register("plunger", (p, opt) => {
  const P = JH.PAL;
  const step = opt.state === "walk" ? Math.floor((opt.t || 0) * 8) % 2 : 0;
  p(-5, 0, 4, 5 + step, P.plungerDk);          // legs
  p(1, 0, 4, 5 + (1 - step), P.plungerDk);
  p(-7, 5, 14, 9, P.plunger);                  // rubber body
  p(-7, 5, 14, 2, P.plungerDk);
  p(-4, 8, 2, 2, "#ffd23f");                   // eyes
  p(2, 8, 2, 2, "#ffd23f");
  p(-1, 14, 3, 6, "#a8763e");                  // wooden handle neck
  const flare = (opt.state === "latch" || opt.wind) ? 2 : 0;
  p(-8 - flare, 20, 16 + flare * 2, 3, P.plungerDk);   // cup lip
  p(-6, 22, 12, 4, P.plunger);                          // cup dome
  if (opt.state === "latch") {                 // suction lines
    p(-11, 21, 2, 1, "#ffffff");
    p(9, 21, 2, 1, "#ffffff");
  }
});
```

- [ ] **Step 4: Run tests** — `npm test`. Expected green.
- [ ] **Step 5: Commit**

```bash
git add js/entities.js js/assets.js tests/air.test.js
git commit -m "feat(air-act): Plunger Fiend — lunge-latch tank drain, dash break, elite dmg-key scaling"
```

---

### Task 5: TP Mummy — streamer drop-in harasser

**Files:**
- Modify: `js/entities.js` (TPWrap projectile + TPMummy class; `makeEnemy`
  entry; player snare consumption at ~line 497)
- Modify: `js/game.js:687` (`spawnWaveEnemy` drop-in branch)
- Modify: `js/assets.js` (painter)
- Test: `tests/air.test.js`

**Interfaces:**
- Produces: `JH.makeEnemy("tpmummy", x, y)`; `e.beginDrop(delay)` streamer
  drift entry (works with `spawnEnemy`'s existing `opts.dropIn` hook);
  `JH.TPWrap` pushed to `game.embers`; sets `player.snareT`/`player.snareMult`
  (fields declared in Task 2).
- Consumes: `player.snareT` decay from Task 2; `FUSE_DROP.stagger` reused for
  the spawn stagger.

- [ ] **Step 1: Write the failing tests** (append to `tests/air.test.js`)

```js
test("tpmummy: streamer drop-in drifts down without a landing slam", () => {
  const g = stubHazardGame(200, 40);
  const e = JH.makeEnemy("tpmummy", 100, 40);
  e.beginDrop(0);
  assert.strictEqual(e.z, JH.ENEMIES.tpmummy.driftH);
  g.player.x = 100; g.player.y = 40;
  const hp0 = g.player.hp;
  for (let i = 0; i < 400 && e.dropping; i++) e.update(1 / 60, g);
  assert.strictEqual(e.dropping, false);
  assert.strictEqual(e.z, 0);
  assert.strictEqual(g.player.hp, hp0, "no landing slam — harasser entry");
});

test("tpmummy wrap: snares (soft slow) only when the hit lands", () => {
  const g = stubHazardGame(100, 40);
  const d = JH.ENEMIES.tpmummy;
  const wrap = new JH.TPWrap(80, 40, 100, 40, d);
  // i-framed: no hit, no snare
  g.player.invulnTimer = 1;
  for (let i = 0; i < 60 && !wrap.dead; i++) wrap.update(1 / 60, g);
  assert.strictEqual(g.player.snareT, 0);
  // clean hit: snare lands
  const g2 = stubHazardGame(100, 40);
  const wrap2 = new JH.TPWrap(80, 40, 100, 40, d);
  for (let i = 0; i < 60 && !wrap2.dead; i++) wrap2.update(1 / 60, g2);
  assert.ok(wrap2.dead);
  assert.strictEqual(g2.player.snareT, d.wrapSlowDur);
  assert.strictEqual(g2.player.snareMult, d.wrapSlow);
});

test("tpmummy death puff: shoves inside the rim, no damage, spares the rim-outside", () => {
  const d = JH.ENEMIES.tpmummy;
  const g = stubHazardGame(100 + d.puffRadius - 2, 40);
  const e = JH.makeEnemy("tpmummy", 100, 40);
  const hp0 = g.player.hp;
  e.die(g);
  assert.ok((g.player.knockVX || 0) > 0, "inside the puff rim: shoved");
  assert.strictEqual(g.player.hp, hp0, "the puff never damages");
  const g2 = stubHazardGame(100 + d.puffRadius + 3, 40);
  const e2 = JH.makeEnemy("tpmummy", 100, 40);
  e2.die(g2);
  assert.strictEqual(g2.player.knockVX || 0, 0, "outside the rim: untouched");
});
```

- [ ] **Step 2: Run to verify failure** — FAIL: generic Enemy has no `beginDrop`,
`JH.TPWrap` undefined.

- [ ] **Step 3: Implement**

Player snare consumption (`js/entities.js` ~line 497, right after
`let speed = S.moveSpeed * this.zoneSlow;`):
```js
// TP-wrap snare: a soft timed slow (never a root). Dash overrides speed
// entirely below, so dashing out remains full strength.
if (this.snareT > 0) speed *= this.snareMult;
```

New classes (with the other enemies):
```js
// ---- TP Mummy: streamer drop-in harasser ----
// Thrown wrap = soft snare; death = one-shot gust puff that SHOVES (no
// damage) everything in its ellipse — Jon and light enemies alike.
class TPWrap {
  constructor(x, y, tx, ty, d) {
    this.x = x; this.y = y; this.z = 24;
    const dist = Math.max(1, Math.hypot(tx - x, ty - y));
    this.vx = ((tx - x) / dist) * d.wrapSpeed;
    this.vy = ((ty - y) / dist) * d.wrapSpeed;
    this.def = d; this.t = 0; this.dead = false;
    this.life = d.wrapRange / d.wrapSpeed + 0.4;
    this.isProjectile = true;   // Whirlwind Walk's dash sweep destroys these
  }
  update(dt, game) {
    this.t += dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    const pl = game.player;
    if (pl.alive && Math.abs(pl.x - this.x) < 10 && Math.abs(pl.y - this.y) < 9 && pl.z < 26) {
      // Only a LANDED hit snares — i-frames/dash dodge wrap and slow together.
      if (pl.invulnTimer <= 0 && pl.dashTimer <= 0 && pl.dashGraceT <= 0) {
        pl.takeHit(this.def.wrapDmg, game, this.x);
        pl.snareT = this.def.wrapSlowDur;
        pl.snareMult = this.def.wrapSlow;
      }
      this.dead = true;
    }
    if (this.t >= this.life) this.dead = true;
    return !this.dead;
  }
  draw(ctx, cam) {
    const sx = this.x - cam, sy = Geo.feetScreenY(this.y, this.z);
    const spin = Math.floor(this.t * 14) % 2;
    ctx.save();
    ctx.fillStyle = JH.PAL.tpmummy;
    ctx.fillRect(Math.round(sx) - 3, Math.round(sy) - 3, 6, 6);
    ctx.fillStyle = JH.PAL.tpmummyDk;
    if (spin) ctx.fillRect(Math.round(sx) - 3, Math.round(sy) - 1, 6, 2);
    else ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 3, 2, 6);
    // trailing streamer
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = JH.PAL.tpmummy;
    ctx.fillRect(Math.round(sx - this.vx * 0.06), Math.round(sy) - 1, 8, 1);
    ctx.restore();
  }
}
JH.TPWrap = TPWrap;

class TPMummy extends Enemy {
  // Streamer entry: constant drift + sway — no gravity slam (harasser).
  beginDrop(delay) {
    this.dropping = true;
    this.dropWait = delay || 0;
    this.z = this.dropWait > 0 ? 0 : this.def.driftH;
  }
  update(dt, game) {
    if (this.dropping) {
      this.t += dt;
      if (this.dropWait > 0) {
        this.dropWait -= dt;
        if (this.dropWait <= 0) this.z = this.def.driftH;
        return;
      }
      this.z -= this.def.driftSpeed * dt;
      this.x += Math.sin(this.t * 2.2) * 14 * dt;
      if (this.z <= 0) { this.z = 0; this.dropping = false; this.spawnGrace = 0.3; }
      return;
    }
    super.update(dt, game);
  }
  takeDamage(dmg, game, dirX, knock) {
    if (this.dropping) return;   // inert until landed (fuse idiom)
    super.takeDamage(dmg, game, dirX, knock);
  }
  think(dt, game) {
    const pl = game.player, d = this.def;
    const dx = pl.x - this.x, dy = pl.y - this.y;
    const dist = Math.hypot(dx, dy);
    this.facing = dx >= 0 ? 1 : -1;
    if (this.windTimer > 0) {
      this.windTimer -= dt; this.state = "wind";
      if (this.windTimer <= 0) {
        game.embers.push(new TPWrap(this.x + this.facing * 8, this.y, pl.x, pl.y, d));
        this.cdTimer = d.wrapCd;
      }
      return;
    }
    if (this.cdTimer > 0) this.cdTimer -= dt;
    // Ranged harasser: no attack ticket (tickets meter melee attackers).
    if (this.cdTimer <= 0 && dist < d.wrapRange && this.spawnGrace <= 0) {
      this.windTimer = d.wrapWind; this.windDur = d.wrapWind; this.state = "wind";
      return;
    }
    const want = dist < 70 ? -1 : dist > 120 ? 1 : 0;   // hold a loose midrange
    if (want) {
      this.x += (dx / (dist || 1)) * d.speed * want * dt;
      this.y += (dy / (dist || 1)) * d.speed * want * dt * 0.8;
      this.state = "walk";
    } else this.state = "idle";
  }
  die(game) {
    // Unravel: one-shot gust puff — shove only, no damage. Ellipse rx =
    // puffRadius, ry via GROUND_RY (the burst FX below is drawn AT the rim).
    const d = this.def, rx = d.puffRadius, ry = rx * JH.GROUND_RY;
    const pl = game.player;
    if (pl.alive && Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, rx, ry))
      pl.applyKnockback(pl.x >= this.x ? 1 : -1, d.puffKnock);
    for (const o of game.enemies) {
      if (o === this || o.dead || o.isBoss) continue;
      if (o.def && o.def.speed === 0) continue;
      if (Geo.inGroundEllipse(o.x, o.y, this.x, this.y, rx, ry))
        o.applyKnockback(o.x >= this.x ? 1 : -1, d.puffKnock);
    }
    burst(game, this.x, this.y, 8, JH.PAL.tpmummy, 14, { speed: 110, life: 0.5, up: 60, size: 2 });
    super.die(game);
  }
}
JH.TPMummy = TPMummy;
```

Drop-in draw override (after the class, mirroring `Fuse.prototype.draw`):
```js
// Streamer drop-in visuals: dangling TP strips above, body swaying down.
TPMummy.prototype.draw = function (ctx, cam) {
  if (this.dropping) {
    if (this.dropWait > 0) return;   // not on screen yet
    const sx = this.x - cam, sy = Geo.feetScreenY(this.y, this.z);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = JH.PAL.tpmummy;
    for (let i = -1; i <= 1; i++) {
      const fl = Math.sin(this.t * 5 + i) * 2;
      ctx.fillRect(Math.round(sx + i * 5 + fl), Math.round(sy - this.bodyH - 14), 2, 12);
    }
    ctx.restore();
    Assets.shadow(ctx, sx, Geo.feetScreenY(this.y, 0), this.bodyW * 0.4);
    Assets.draw(ctx, this.type, sx, sy, this.facing, { state: "walk", frame: this.frame, t: this.t });
    return;
  }
  JH.Enemy.prototype.draw.call(this, ctx, cam);
};
```

`JH.makeEnemy`: `if (type === "tpmummy") return new TPMummy(type, x, y);`

`js/game.js:687` — the drop-in branch in `spawnWaveEnemy` becomes:
```js
if (type === "fuse" || type === "tpmummy") {
  // Aerial entries land at a random arena spot (fuse: slam ring; tpmummy:
  // streamer drift). Shared stagger cadence.
  const ex = left + 30 + Math.random() * (right - left - 60);
  return this.spawnEnemy(type, ex, ey, {
    elite: eliteScale, dropIn: true, dropDelay: (slot || 0) * JH.FUSE_DROP.stagger * 0.5,
  });
}
```

`js/assets.js` painter:
```js
// TP Mummy: banded white wrap, loose fluttering streamer, throw pose.
Assets.register("tpmummy", (p, opt) => {
  const P = JH.PAL;
  const step = opt.state === "walk" ? Math.floor((opt.t || 0) * 7) % 2 : 0;
  p(-5, 0, 4, 6 + step, P.tpmummyDk);          // legs
  p(1, 0, 4, 6 + (1 - step), P.tpmummyDk);
  p(-6, 6, 12, 14, P.tpmummy);                 // wrapped body
  for (let i = 0; i < 4; i++) p(-6, 7 + i * 3, 12, 1, P.tpmummyDk);
  p(-4, 20, 9, 7, P.tpmummy);                  // head
  p(-4, 22, 9, 1, P.tpmummyDk);
  p(1, 23, 2, 2, "#2a2020");                   // eye slit
  if (opt.wind) p(-10, 15, 4, 4, P.tpmummy);   // arm back with a wad
  const fl = Math.floor((opt.t || 0) * 6) % 3;
  p(-9, 10 - fl, 2, 6, P.tpmummy);             // loose streamer
});
```

- [ ] **Step 4: Run tests** — `npm test`. Expected green.
- [ ] **Step 5: Commit**

```bash
git add js/entities.js js/game.js js/assets.js tests/air.test.js
git commit -m "feat(air-act): TP Mummy — streamer drop-in, wrap snare, unravel shove puff"
```

---

### Task 6: Gasbag — hovering zone control with the pop-fast reward

**Files:**
- Modify: `js/entities.js` (Gasbag class; `makeEnemy` entry)
- Modify: `js/assets.js` (painter)
- Test: `tests/air.test.js`

**Interfaces:**
- Produces: `JH.makeEnemy("gasbag", x, y)`; hovers at `def.hoverZ`; vents via
  `JH.spawnStinkCloud(game, x, y)`; `e._vented` true after the first completed
  vent; death before first vent spawns a `friendly` cloud.
- Consumes: `JH.spawnStinkCloud` from Task 2.

- [ ] **Step 1: Write the failing tests** (append to `tests/air.test.js`)

```js
test("gasbag: vents a hostile cloud beneath itself after the inflate telegraph", () => {
  const g = stubHazardGame(400, 40);
  const e = JH.makeEnemy("gasbag", 100, 40);
  e.spawnGrace = 0; e.ventT = 0; e.cdTimer = 0;
  // run until the vent completes
  for (let i = 0; i < 600 && g.stinkClouds.length === 0; i++) e.think(1 / 60, g);
  assert.strictEqual(g.stinkClouds.length, 1);
  assert.ok(!g.stinkClouds[0].friendly);
  assert.ok(e._vented);
});

test("gasbag pop-fast: killed before its first vent, the payload bursts on ENEMIES", () => {
  const g = stubHazardGame(400, 40);
  const e = JH.makeEnemy("gasbag", 100, 40);
  g.enemies.push(e);
  e.die(g);
  assert.strictEqual(g.stinkClouds.length, 1);
  assert.ok(g.stinkClouds[0].friendly, "pre-vent kill = friendly burst");
  // after venting, death carries no payload
  const g2 = stubHazardGame(400, 40);
  const e2 = JH.makeEnemy("gasbag", 100, 40);
  e2._vented = true;
  e2.die(g2);
  assert.strictEqual(g2.stinkClouds.length, 0);
});

test("gasbag hovers inside the spray band (nozzle can reach it)", () => {
  const e = JH.makeEnemy("gasbag", 100, 40);
  assert.ok(e.z >= JH.ENEMIES.gasbag.hoverZ - 3);
  // stream line at nozzleZ must intersect the hover body
  assert.ok(JH.ENEMIES.gasbag.hoverZ < JH.PLAYER.nozzleZ + 10);
});
```

- [ ] **Step 2: Run to verify failure** — FAIL: generic Enemy never vents.

- [ ] **Step 3: Implement**

```js
// ---- Gasbag: hovering stink spirit — zone control ----
// Vents a stink cloud beneath itself on a cycle. Popped BEFORE its first
// vent lands, the payload bursts on ENEMIES instead (friendly cloud) — the
// fast-target-priority skill reward.
class Gasbag extends Enemy {
  constructor(type, x, y) {
    super(type, x, y);
    this.z = this.def.hoverZ;
    this.ventT = this.def.firstVent + Math.random();  // first vent comes soon, not instantly
    this._vented = false;
  }
  think(dt, game) {
    const pl = game.player, d = this.def;
    const dx = pl.x - this.x, dy = pl.y - this.y;
    const dist = Math.hypot(dx, dy);
    this.facing = dx >= 0 ? 1 : -1;
    this.z = d.hoverZ + Math.sin(this.t * 2.4) * 3;   // hover bob
    if (this.ventT > 0) this.ventT -= dt;
    if (this.windTimer > 0) {
      this.windTimer -= dt; this.state = "wind";      // inflate telegraph
      if (this.windTimer <= 0) {
        JH.spawnStinkCloud(game, this.x, this.y);
        this._vented = true;
        this.cdTimer = d.ventCd;
        game.audio.play("sizzle");
      }
      return;
    }
    if (this.cdTimer > 0) this.cdTimer -= dt;
    else if (this.spawnGrace <= 0 && this.ventT <= 0) {
      this.windTimer = d.ventWind; this.windDur = d.ventWind; this.state = "wind";
      return;
    }
    // Drift to a loose standoff — zone controller, not a chaser.
    const err = dist - d.preferRange;
    if (Math.abs(err) > 8) {
      const dir = err > 0 ? 1 : -1;
      this.x += (dx / (dist || 1)) * d.speed * dir * dt;
      this.y += (dy / (dist || 1)) * d.speed * dir * dt * 0.8;
      this.state = "walk";
    } else this.state = "idle";
  }
  die(game) {
    if (!this._vented)
      JH.spawnStinkCloud(game, this.x, this.y, { friendly: true });
    super.die(game);
  }
}
JH.Gasbag = Gasbag;
```

`JH.makeEnemy`: `if (type === "gasbag") return new Gasbag(type, x, y);`

`js/assets.js` painter:
```js
// Gasbag: sagging hover sack; inflates through the vent windup (windFrac).
Assets.register("gasbag", (p, opt) => {
  const P = JH.PAL;
  const inf = opt.wind ? Math.round(2 + 2 * (opt.windFrac || 0)) : 0;
  const wob = Math.floor((opt.t || 0) * 5) % 2;
  p(-6, 2 - wob, 12, 3, P.gasbagDk);                     // puckered vent base
  p(-8 - inf, 4 - wob, 16 + inf * 2, 12 + inf, P.gasbag); // sack
  p(-8 - inf, 13 - wob + inf, 16 + inf * 2, 3, P.gasbagHi);
  p(-2, 16 + inf - wob, 4, 3, P.gasbagDk);               // knotted top
  p(-4, 9, 2, 2, "#2a2a1a");                             // dopey face
  p(3, 9, 2, 2, "#2a2a1a");
  p(-1, 6, 3, 1, "#2a2a1a");
});
```

- [ ] **Step 4: Run tests** — `npm test`. Expected green.
- [ ] **Step 5: Commit**

```bash
git add js/entities.js js/assets.js tests/air.test.js
git commit -m "feat(air-act): Gasbag — hovering venter with the pop-fast friendly-burst reward"
```

---

### Task 7: Bidet Turret — locked-target water artillery

**Files:**
- Modify: `js/entities.js` (BidetShot + BidetTurret; `makeEnemy` entry)
- Modify: `js/assets.js` (painter)
- Test: `tests/air.test.js`

**Interfaces:**
- Produces: `JH.makeEnemy("bidet", x, y)`; `JH.BidetShot(x, y, tx, ty, def)`
  pushed to `game.embers`; turret locks `aimX/aimY` at wind START (the
  telegraph ellipse never chases).
- Consumes: SmeltBomb arc math idiom; `game.firePatches` (landing douse).

- [ ] **Step 1: Write the failing tests** (append to `tests/air.test.js`)

```js
test("bidet shot: lands at the LOCKED target; the telegraph ellipse is the hit ellipse", () => {
  const d = JH.ENEMIES.bidet;
  // player stands just inside the landing rim
  const g = stubHazardGame(200 + d.landRadius - 2, 40);
  const shot = new JH.BidetShot(100, 40, 200, 40, d);
  const hp0 = g.player.hp;
  for (let i = 0; i < 600 && !shot.dead; i++) shot.update(1 / 60, g);
  assert.ok(shot.dead);
  assert.ok(Math.abs(shot.x - 200) < 8, "arc comes down at the locked spot");
  assert.ok(g.player.hp < hp0, "inside the drawn rim: hit");
  // just outside the rim: spared
  const g2 = stubHazardGame(200 + d.landRadius + 4, 40);
  const shot2 = new JH.BidetShot(100, 40, 200, 40, d);
  const hp2 = g2.player.hp;
  for (let i = 0; i < 600 && !shot2.dead; i++) shot2.update(1 / 60, g2);
  assert.strictEqual(g2.player.hp, hp2, "outside the drawn rim: spared");
});

test("bidet shot: landing douses fire patches it touches (world consistency)", () => {
  const d = JH.ENEMIES.bidet;
  const g = stubHazardGame(400, 40);
  const fp = new JH.FirePatch(200, 40, 20, 2.0);
  g.firePatches.push(fp);
  const shot = new JH.BidetShot(100, 40, 200, 40, d);
  for (let i = 0; i < 600 && !shot.dead; i++) shot.update(1 / 60, g);
  assert.ok(fp.sprayProgress >= fp.extinguishDur, "returned water still douses fire");
});

test("bidet turret: locks its aim at wind start and is knockback-immune", () => {
  const g = stubHazardGame(180, 40);
  const e = JH.makeEnemy("bidet", 100, 40);
  e.spawnGrace = 0;
  e.think(1 / 60, g);
  assert.strictEqual(e.aimX, 180, "target locked when the wind starts");
  g.player.x = 300;                       // player moves; telegraph must not chase
  e.think(1 / 60, g);
  assert.strictEqual(e.aimX, 180);
  e.applyKnockback(1, 500);
  assert.strictEqual(e.knockVX || 0, 0, "porcelain emplacement doesn't slide");
});
```

- [ ] **Step 2: Run to verify failure** — FAIL: `JH.BidetShot` undefined.

- [ ] **Step 3: Implement**

```js
// ---- Bidet Turret: pre-placed porcelain artillery ----
// Lobs a water arc at a target LOCKED at wind start; the landing ellipse is
// drawn from the telegraph through the whole flight and IS the hit shape
// (SmeltBomb arc idiom + honest locked landing spots). Landing douses fire.
class BidetShot {
  constructor(x, y, tx, ty, d) {
    this.x = x; this.y = y; this.z = 20;
    this.tx = tx; this.ty = ty;
    const dist = Math.max(1, Math.hypot(tx - x, ty - y));
    const flightT = Math.max(0.5, dist / d.arcSpeed);
    this.vx = (tx - x) / flightT;
    this.vy = (ty - y) / flightT;
    this.vz = 0.5 * d.arcGravity * flightT - this.z / flightT;
    this.def = d; this.t = 0; this.dead = false;
    this.isProjectile = true;
  }
  update(dt, game) {
    this.t += dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.vz -= this.def.arcGravity * dt; this.z += this.vz * dt;
    if (this.z <= 0) {
      const d = this.def, pl = game.player;
      burst(game, this.x, this.y, 4, JH.PAL.waterHi, 12, { speed: 100, life: 0.4, up: 50, size: 2 });
      game.shake(2); game.audio.play("whack");
      if (pl.alive && Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, d.landRadius))
        pl.takeHit(d.landDmg, game, this.x);
      // Returned water is still water: douse any fire the splash covers.
      if (game.firePatches) for (const fp of game.firePatches) {
        if (fp.dead || fp.friendly) continue;
        if (Geo.inGroundEllipse(fp.x, fp.y, this.x, this.y, d.landRadius + fp.footprint().rx))
          fp.sprayProgress = fp.extinguishDur;
      }
      this.dead = true;
    }
    return !this.dead;
  }
  draw(ctx, cam) {
    const d = this.def;
    // Landing telegraph: the SAME ellipse the landing tests, at the locked target.
    const lx = this.tx - cam, ly = Geo.feetScreenY(this.ty, 0);
    const flash = Math.floor(this.t * 10) & 1;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = flash ? "#bfe6ff" : "rgba(120,200,255,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(lx, ly, d.landRadius, d.landRadius * JH.GROUND_RY, 0, 0, Math.PI * 2);
    ctx.stroke();
    const sx = this.x - cam, sy = Geo.feetScreenY(this.y, this.z);
    Assets.glow(ctx, Math.round(sx), Math.round(sy), 10, JH.PAL.water, 0.7);
    ctx.globalAlpha = 1;
    ctx.fillStyle = flash ? JH.PAL.waterHi : JH.PAL.water;
    ctx.beginPath(); ctx.arc(Math.round(sx), Math.round(sy), 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}
JH.BidetShot = BidetShot;

class BidetTurret extends Enemy {
  applyKnockback() {}   // porcelain emplacement — never slides
  think(dt, game) {
    const pl = game.player, d = this.def;
    this.facing = pl.x >= this.x ? 1 : -1;
    if (this.windTimer > 0) {
      this.windTimer -= dt; this.state = "wind";
      if (this.windTimer <= 0) {
        game.embers.push(new BidetShot(this.x, this.y, this.aimX, this.aimY, d));
        this.cdTimer = d.lobCd;
      }
      return;
    }
    if (this.cdTimer > 0) { this.cdTimer -= dt; this.state = "idle"; return; }
    if (this.spawnGrace <= 0) {
      // Lock the landing spot NOW — the telegraph never chases.
      this.aimX = pl.x; this.aimY = pl.y;
      this.windTimer = d.aimWind; this.windDur = d.aimWind; this.state = "wind";
    }
  }
}
JH.BidetTurret = BidetTurret;

// Aim telegraph during the windup (the shot carries it through the flight).
BidetTurret.prototype.draw = function (ctx, cam) {
  if (this.state === "wind" && this.aimX != null) {
    const d = this.def;
    const lx = this.aimX - cam, ly = Geo.feetScreenY(this.aimY, 0);
    const flash = Math.floor(this.t * 10) & 1;
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = flash ? "#bfe6ff" : "rgba(120,200,255,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(lx, ly, d.landRadius, d.landRadius * JH.GROUND_RY, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  JH.Enemy.prototype.draw.call(this, ctx, cam);
};
```

`JH.makeEnemy`: `if (type === "bidet") return new BidetTurret(type, x, y);`

`js/assets.js` painter:
```js
// Bidet Turret: porcelain pedestal + basin; nozzle rises and spurts on windup.
Assets.register("bidet", (p, opt) => {
  const P = JH.PAL;
  p(-9, 0, 18, 4, P.bidetDk);                  // pedestal base
  p(-6, 4, 12, 8, P.bidet);                    // column
  p(-10, 12, 20, 7, P.bidet);                  // basin
  p(-10, 17, 20, 2, P.bidetHi);                // rim highlight
  p(-7, 13, 14, 3, P.bidetDk);                 // basin shadow
  const nz = opt.wind ? 3 : 0;
  p(-1, 19 + nz, 3, 3, P.bidetDk);             // nozzle
  if (opt.wind && Math.floor((opt.t || 0) * 12) % 2)
    p(-1, 22 + nz, 3, 2, P.water);             // pressurizing spurt
});
```

- [ ] **Step 4: Run tests** — `npm test`. Expected green.
- [ ] **Step 5: Commit**

```bash
git add js/entities.js js/assets.js tests/air.test.js
git commit -m "feat(air-act): Bidet Turret — locked-target water arcs with honest landing telegraphs"
```

---

### Task 8: Air World arrival, cloudline backdrop, headless verification

**Files:**
- Modify: `js/game.js:877-887` (`afterTruckRun` → `enterAirAct`)
- Modify: `js/world.js` (Background.init air buildings ~line 129; draw sky/skyline
  ~lines 195-244; drawFloor tints ~lines 285-296)
- Test: `tests/air.test.js` + headless run (headless-playtest skill)

**Interfaces:**
- Produces: `Game.enterAirAct()` — teleports Jon to `ZONE4_START + 40`, sets
  checkpoint/trigger/bounds/vendor, banners "THE AIR WORLD".
- Consumes: everything from Tasks 1–7.

- [ ] **Step 1: Write the failing test** (append to `tests/air.test.js`)

```js
test("enterAirAct: arrival state — position, checkpoint, vendor, free-walk trigger", () => {
  // Game.init touches the DOM; drive enterAirAct on a shallow clone instead.
  const airStart = JH.ACT_STARTS[JH.ACT_STARTS.length - 1];
  const g = Object.create(JH.Game);
  g.player = stubPlayer(0, 40);
  g.showScreen = () => {}; g.banner = () => {}; g.spawnVendor = function (x) { this._vendorX = x; };
  g.gatedTriggerX = JH.Game.gatedTriggerX;
  g.stinkClouds = []; g.gustLanes = []; g.sigils = [];
  g.enterAirAct();
  assert.strictEqual(g.player.x, JH.ZONE4_START + 40);
  assert.strictEqual(g.checkpointWave, airStart);
  assert.strictEqual(g.waveIndex, airStart - 1, "next walk trigger rolls WAVE 30");
  assert.ok(g.bounds.minX >= JH.ZONE4_START, "no walking back through the gate");
  assert.ok(g._vendorX > JH.ZONE4_START && g._vendorX < g.waveTriggerX,
    "act-boundary vendor sits in the arrival corridor");
});
```

- [ ] **Step 2: Run to verify failure** — FAIL: `enterAirAct` is not a function.

- [ ] **Step 3: Implement the arrival**

`js/game.js` — replace the body of `afterTruckRun` (keep its comment, update
the last line) and add `enterAirAct` below it:
```js
// Called by JH.TruckRun when the escape reaches the Air World gate. The
// benediction was already chosen (pre-truck), so this just tallies the
// essence banked on the road and hands off to the Air World entrance.
afterTruckRun() {
  this.state = "play";
  document.getElementById("hud").classList.remove("hidden");
  this.showScreen("hud");
  if (JH.AudioFX && JH.AudioFX.play) JH.AudioFX.play("win");
  this.enterAirAct();
},

// Air World arrival (post-Gate Crash). Banner-beat stub of the Ass Man
// entry cutscene (bookends pass replaces it): Jon steps onto the cloudline
// street, vendor at the act boundary, free-walk to WAVE 30.
enterAirAct() {
  const airStart = JH.ACT_STARTS[JH.ACT_STARTS.length - 1];
  const p = this.player;
  p.x = JH.ZONE4_START + 40; p.y = JH.DEPTH_MAX * 0.6; p.z = 0;
  JH.Camera.snapTo(p);
  if (JH.Music && JH.Music.setTrack) JH.Music.setTrack("level");
  this.waveIndex = airStart - 1;   // cleared-through marker: the walk trigger rolls WAVE 30
  this.checkpointWave = airStart;
  this.waveActive = false; this.waveCleared = false;
  this.sigils = [];
  this.waveTriggerX = this.gatedTriggerX(airStart, p.x);
  this.bounds = { minX: JH.ZONE4_START + 8, maxX: this.waveTriggerX + 30 };
  this.clearsSinceVendor = 0;
  this.spawnVendor(WAVE_TRIGGERS[airStart] - 150);
  this.banner("THE AIR WORLD", 2.6);
},
```
(The `JH.Music` guard matches the AudioFX-guard idiom two lines up — under
node tests `JH.Music` doesn't exist.)

- [ ] **Step 4: Implement the cloudline backdrop** (`js/world.js`, visual — no unit test)

1. `Background.init`: cap the Act-3 debris scatter at the air boundary — the
   piles are COLLIDING floor props (`JH.DEBRIS.collide`) and must not litter
   the cloud walkway now that `LEVEL_LEN` extends past the gate. The debris
   loop (~line 168) bound changes:
```js
for (let x = JH.ZONE2_START + 40; x < JH.ZONE4_START - 200; ) {
```
2. `Background.init` building loop: compute the air boundary alongside `broken`
   and store the flag (air overrides broken):
```js
const broken = x > (JH.ZONE2_START - 200) * 0.5 + JH.VIEW_W;
const air = x > (JH.ZONE4_START - 200) * 0.5 + JH.VIEW_W;
const b = {
  x, w, h: air ? Math.round(h * 0.7) : h, broken: broken && !air, air, jag: null, windows: [],
  c: air ? "#c8b060"
    : broken ? (rA() > 0.5 ? "#241f24" : "#2b242a")
             : (rA() > 0.5 ? "#1b2740" : "#202d4a"),
};
```
   Skip window generation for air buildings (`if (!air) { ...existing window
   loops... }`) — they read as distant golden porcelain monuments, not towers.
3. `Background.draw` — compute `airT` next to `zoneT`/`fireT` and fade the
   older acts' tints out under it:
```js
const airT = Math.max(0, Math.min(1, (cam + W * 0.5 - (JH.ZONE4_START - 200)) / 500));
const zoneT = Math.max(0, Math.min(1, (cam + W * 0.5 - (JH.ZONE2_START - 200)) / 500)) * (1 - airT);
const fireT = Math.max(0, Math.min(1, (cam + W * 0.5 - (JH.ZONE3_START - 200)) / 500)) * (1 - airT);
```
   After the fire-tint block, add the air sky (bright day-blue wash + cloud
   horizon + drifting TP):
```js
// Cloudline: bright sky wash, a white cloud horizon, drifting TP streamers.
if (airT > 0) {
  ctx.fillStyle = "rgba(140,190,240," + (0.55 * airT).toFixed(3) + ")";
  ctx.fillRect(0, 0, W, top);
  const ag = ctx.createLinearGradient(0, top - 50, 0, top);
  ag.addColorStop(0, "rgba(235,244,252,0)");
  ag.addColorStop(1, "rgba(235,244,252," + (0.7 * airT).toFixed(3) + ")");
  ctx.fillStyle = ag; ctx.fillRect(0, top - 50, W, 50);
  ctx.fillStyle = "rgba(255,255,255," + (0.6 * airT).toFixed(3) + ")";
  for (let i = 0; i < 6; i++) {
    const tpx = ((i * 173 - cam * 0.3) % (W + 40) + W + 40) % (W + 40) - 20;
    const tpy = 22 + ((i * 31) % (top - 80));
    ctx.fillRect(Math.round(tpx), tpy, 2, 9);
    ctx.fillRect(Math.round(tpx) + 2, tpy + 3, 2, 7);
  }
}
```
   In the near-skyline loop, give air buildings a gold cap instead of windows:
```js
if (b.air) {
  ctx.fillStyle = "#e0cd80";
  ctx.fillRect(Math.round(sx), top - b.h, b.w, 3);
}
```
   (window loop already skipped for air buildings since none were baked).
4. `drawFloor` — same `airT` computation and previous-tint damping as draw(),
   plus a cloud-deck wash after the fire tint:
```js
if (airT > 0) {
  ctx.fillStyle = "rgba(215,230,245," + (0.5 * airT).toFixed(3) + ")";
  ctx.fillRect(0, top, W, H - top);
}
```

- [ ] **Step 5: Run the unit suite** — `npm test`. Expected green.

- [ ] **Step 6: Headless verification** (use the `headless-playtest` project skill —
it has the harness pattern and the ≥120ms key-hold gotcha)

Verify, in one scripted session:
1. **Telemetry spy FIRST** (config ships a live endpoint — stub `fetch`/beacon
   before any `startGame`).
2. `Game.startGame()` → dev-warp (Backquote menu) to wave 30 "SANITATION 101" —
   the new waves appear in the dev list automatically. Confirm plungers +
   mummies spawn, kill them all with real spray input, wave clears.
3. Warp to "GAS LEAK": confirm `game.gustLanes.length === 2` during the wave
   and `0` after clearing; stand in a cloud and assert `player.gasT > 0`.
4. Call `Game.enterAirAct()` directly: assert banner text, vendor exists, then
   drive Jon right with real keys until `waveIndex === 29` and `waveActive`.
5. Screenshot the cloudline backdrop (sky + floor + gold skyline) for the
   user's review.

Expected: all assertions pass; screenshot attached to the task report.

- [ ] **Step 7: Commit**

```bash
git add js/game.js js/world.js tests/air.test.js
git commit -m "feat(air-act): Air World arrival + cloudline backdrop — afterTruckRun hands off past the gate"
```

---

## Done means

- `npm test` fully green (existing ~214 + the new air suite).
- Headless: post-truck arrival → walk → waves 30–32 cleared with real inputs.
- Branch `air-act` held for the user's playtest — NOT merged, NOT released.
  (Release comes with Plan 3 as the act's minor version.)
- Report to the user with: the threat-score table above, the temporary-states
  list (win() after wave 32, banner arrival), and the backdrop screenshot.
