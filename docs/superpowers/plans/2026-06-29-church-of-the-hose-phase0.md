# Church of the Hose — Phase 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace full-reset death with a meaningful loop — die → death sequence → the walkable **Church of the Hose** (Father Jon, shrines, altar) → spend boss-earned **Holy Essence** on permanent blessings → portal back at the act-start checkpoint with your build intact.

**Architecture:** A new self-contained `js/church.js` module (`JH.Church`) owns all meta-progression state (essence, blessings, unlocked elements), its localStorage persistence, *and* the Church scene state machine + render. `js/game.js` gains two states (`playerDeathSeq`, `church`), routes death into them, awards essence on boss defeat, tracks an act-start checkpoint, and delegates the Church scene to `JH.Church`. Pure math (`actStartForWave`, `blessingCost`) lives in `js/balance.js` (node-tested); blessings fold into the existing `JH.Upgrades.computeStats` as a permanent layer.

**Tech Stack:** Vanilla ES5-style IIFE modules on the global `JH` namespace, `<canvas>` 2D, `node:test` for pure logic, manual playtest for DOM/canvas integration (project convention).

## Global Constraints

- All gameplay constants live in `js/config.js` (`JH.*`) — no hardcoded gameplay numbers elsewhere.
- Pure, testable math goes in `js/balance.js` using its dual-export pattern (`module.exports` + `JH.Balance`); tests in `tests/*.test.js`, run with `npm test` (`node --test`).
- `js/church.js` must be `require()`-able in node (dual-export like `balance.js`) and must NOT touch `window`/`localStorage`/`document` at module load — only inside methods called at runtime.
- Bump `package.json` `version` (patch) on every commit (project rule). Current: `0.11.10`.
- Script load order in `index.html`: `config.js` → `balance.js` → … → `upgrades.js` → **`church.js`** → `game.js` → `main.js`.
- Death keeps the player's build: the Church-return path must NOT call `JH.Upgrades.reset()`. Suds carry across respawn.
- No automated DOM/canvas tests exist — integration tasks are verified manually via the dev menu (backtick on localhost; `K` insta-kills the active boss).

---

### Task 1: Pure meta math — `actStartForWave` + `blessingCost`

Checkpoint resolution and the blessing cost curve, as pure functions in `balance.js`, plus the `JH.ACT_STARTS` constant.

**Files:**
- Modify: `js/balance.js` (add two functions to the `Balance` object, after `repeatableCost` ~line 58)
- Modify: `js/config.js` (add `JH.ACT_STARTS` near `JH.LEVEL1`, ~line 240)
- Test: `tests/church.test.js` (new)

**Interfaces:**
- Produces: `JH.Balance.actStartForWave(waveIndex, actStarts)` → `number` (the largest entry of `actStarts` that is ≤ `waveIndex`; if none, the first entry). `JH.Balance.blessingCost(timesBought)` → `number` (`timesBought + 1`).
- Produces: `JH.ACT_STARTS = [0, 5, 8, 10]`.

- [ ] **Step 1: Write the failing test**

Create `tests/church.test.js`:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const Balance = require("../js/balance.js");

const ACT_STARTS = [0, 5, 8, 10];

test("actStartForWave returns the start of the act containing the wave", () => {
  assert.strictEqual(Balance.actStartForWave(0, ACT_STARTS), 0);   // Act 1
  assert.strictEqual(Balance.actStartForWave(4, ACT_STARTS), 0);   // still Act 1 (mid-boss)
  assert.strictEqual(Balance.actStartForWave(5, ACT_STARTS), 5);   // Act 2 start
  assert.strictEqual(Balance.actStartForWave(7, ACT_STARTS), 5);   // Act 2
  assert.strictEqual(Balance.actStartForWave(8, ACT_STARTS), 8);   // Act 3
  assert.strictEqual(Balance.actStartForWave(9, ACT_STARTS), 8);   // Act 3
  assert.strictEqual(Balance.actStartForWave(10, ACT_STARTS), 10); // Act 4
  assert.strictEqual(Balance.actStartForWave(13, ACT_STARTS), 10); // Act 4 finale
});

test("actStartForWave clamps a negative/pre-start index to the first act", () => {
  assert.strictEqual(Balance.actStartForWave(-1, ACT_STARTS), 0);
});

test("blessingCost rises by 1 per purchase: 1, 2, 3, ...", () => {
  assert.strictEqual(Balance.blessingCost(0), 1);
  assert.strictEqual(Balance.blessingCost(1), 2);
  assert.strictEqual(Balance.blessingCost(2), 3);
  assert.strictEqual(Balance.blessingCost(9), 10);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Balance.actStartForWave is not a function`.

- [ ] **Step 3: Add the functions to `js/balance.js`**

Insert into the `Balance` object immediately after `repeatableCost(...) { ... },` (~line 58):

```js
    // Act-start checkpoint for a wave: largest actStarts entry <= waveIndex
    // (clamped to the first act for pre-start indices). Pure.
    actStartForWave(waveIndex, actStarts) {
      let start = actStarts[0];
      for (let i = 0; i < actStarts.length; i++) {
        if (actStarts[i] <= waveIndex) start = actStarts[i];
      }
      return start;
    },

    // Cost of the next blessing purchase: 1, 2, 3, ... (timesBought + 1). Pure.
    blessingCost(timesBought) {
      return (timesBought || 0) + 1;
    },
```

- [ ] **Step 4: Add `JH.ACT_STARTS` to `js/config.js`**

Immediately before `// ---- Level 1 waves` (~line 238), add:

```js
  // Act-start wave indices (bounded by boss clears) — death respawns here.
  // 0 Act1 · 5 Act2 (after Big Drip) · 8 Act3 (after Switch) · 10 Act4 (after Quake).
  JH.ACT_STARTS = [0, 5, 8, 10];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all `church.test.js` + existing `balance.test.js` tests green).

- [ ] **Step 6: Commit**

```bash
# bump package.json "version" to 0.11.11
git add js/balance.js js/config.js tests/church.test.js package.json
git commit -m "feat(church): pure checkpoint + blessing-cost math, ACT_STARTS"
```

---

### Task 2: `JH.Church` core — persistence, essence, blessings + config block

The meta-state module: persistent essence/blessings/elements, localStorage load/save, boss-defeat hook, and blessing purchase. Plus the `JH.CHURCH` config block and the `index.html` include.

**Files:**
- Create: `js/church.js`
- Modify: `js/config.js` (add `JH.CHURCH` block after `JH.CONSUMABLES`, ~line 189)
- Modify: `index.html` (add `<script src="js/church.js">` after `upgrades.js`, line 88)
- Test: `tests/church.test.js` (extend)

**Interfaces:**
- Consumes: `JH.Balance.blessingCost` (Task 1).
- Produces: `JH.Church` with:
  - `state` = `{ essence:number, blessings:{[id]:number}, elements:{earth,fire,air,water:boolean}, churchVisited:boolean, ceremonyDone:{[element]:boolean} }`
  - `defaults()` → fresh state; `sanitize(raw)` → state merged over defaults (corrupt/missing-safe); `serialize()` → JSON string
  - `load()` / `save()` (localStorage wrappers, runtime-only)
  - `addEssence(n)`, `markBossDefeated(type)` (awards essence + unlocks mapped element), `blessingCount(id)`, `blessingCost(id)`, `canBuyBlessing(id)`, `buyBlessing(id, player)` → `boolean`
- Produces: `JH.CHURCH` config (see Step 3).

- [ ] **Step 1: Write the failing test**

Append to `tests/church.test.js`:

```js
const Church = require("../js/church.js");

test("defaults() is a fresh zeroed meta-state", () => {
  const d = Church.defaults();
  assert.strictEqual(d.essence, 0);
  assert.deepStrictEqual(d.blessings, {});
  assert.strictEqual(d.churchVisited, false);
  assert.deepStrictEqual(d.elements, { earth: false, fire: false, air: false, water: false });
});

test("sanitize() merges partial/corrupt data over defaults", () => {
  assert.strictEqual(Church.sanitize(null).essence, 0);
  assert.strictEqual(Church.sanitize({ essence: 3 }).essence, 3);
  // unknown/garbage fields ignored; missing nested objects restored
  const s = Church.sanitize({ essence: "x", blessings: { bless_dps: 2 } });
  assert.strictEqual(s.essence, 0);                 // non-number -> 0
  assert.strictEqual(s.blessings.bless_dps, 2);
  assert.strictEqual(s.elements.earth, false);
});

test("serialize() round-trips through sanitize()", () => {
  Church.state = Church.sanitize({ essence: 4, blessings: { bless_hp: 1 } });
  const round = Church.sanitize(JSON.parse(Church.serialize()));
  assert.strictEqual(round.essence, 4);
  assert.strictEqual(round.blessings.bless_hp, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../js/church.js'`.

- [ ] **Step 3: Add the `JH.CHURCH` config block to `js/config.js`**

After the `JH.CONSUMABLES = { ... };` block (~line 189), add:

```js
  // ---- Church of the Hose (Phase 0 meta-progression) ------------------
  JH.CHURCH = {
    // Death-sequence timeline (seconds): collapse -> fade -> spirit -> Church.
    deathSeq: { animEnd: 1.2, fadeEnd: 2.0, spiritEnd: 2.8, total: 2.8 },
    essencePerBoss: 1,
    // Walkable scene layout (logical px). spawnFar = long first-visit walk;
    // spawnNear = short repeat walk. Altar/portal are world-x trigger points.
    layout: { length: 640, spawnFar: 40, spawnNear: 360, altarX: 470, portalX: 540 },
    // Shrine -> element -> redeeming boss (e.type). null boss = capstone (Water/Jon).
    shrines: [
      { element: "earth", boss: "quake",  label: "EARTH" },
      { element: "fire",  boss: "slayer", label: "FIRE"  },
      { element: "air",   boss: "assman", label: "AIR"   },
      { element: "water", boss: null,     label: "WATER" },
    ],
    // Permanent blessings (repeatable, +1-per-level cost via Balance.blessingCost).
    blessings: [
      { id: "bless_dps",  name: "Anointed Pressure", desc: "+4 spray dmg",   apply: (s) => { s.sprayDamage += 4; } },
      { id: "bless_tank", name: "Deep Reservoir",    desc: "+15 max water",  apply: (s) => { s.maxWater += 15; } },
      { id: "bless_hp",   name: "Blessed Vigor",     desc: "+20 max HP",     apply: (s) => { s.maxHp += 20; } },
    ],
  };
```

- [ ] **Step 4: Create `js/church.js` (core only — scene methods come in later tasks)**

```js
/* =====================================================================
   church.js — JH.Church: the Church of the Hose.
   Owns permanent meta-progression (Holy Essence, blessings, unlocked
   elements) + its localStorage persistence, AND the death-interlude scene
   (scene state machine + render are added in later Phase-0 tasks).
   Dual-export (node:test) like balance.js; no DOM access at module load.
   ===================================================================== */
(function (root) {
  "use strict";
  const KEY = "jonhose.church.v1";
  const ELEMENTS = ["earth", "fire", "air", "water"];

  function defaults() {
    return {
      essence: 0,
      blessings: {},                                   // id -> count
      elements: { earth: false, fire: false, air: false, water: false },
      churchVisited: false,
      ceremonyDone: {},                                // element -> bool
    };
  }

  function num(v) { return (typeof v === "number" && isFinite(v)) ? v : 0; }

  function sanitize(raw) {
    const d = defaults();
    if (!raw || typeof raw !== "object") return d;
    d.essence = num(raw.essence);
    if (raw.blessings && typeof raw.blessings === "object") {
      for (const k in raw.blessings) d.blessings[k] = num(raw.blessings[k]);
    }
    if (raw.elements && typeof raw.elements === "object") {
      ELEMENTS.forEach((e) => { d.elements[e] = !!raw.elements[e]; });
    }
    d.churchVisited = !!raw.churchVisited;
    if (raw.ceremonyDone && typeof raw.ceremonyDone === "object") {
      ELEMENTS.forEach((e) => { if (raw.ceremonyDone[e]) d.ceremonyDone[e] = true; });
    }
    return d;
  }

  const Church = {
    KEY,
    state: defaults(),
    defaults,
    sanitize,

    serialize() { return JSON.stringify(this.state); },

    load() {
      try { this.state = sanitize(JSON.parse(root.localStorage.getItem(KEY))); }
      catch (e) { this.state = defaults(); }
    },
    save() {
      try { root.localStorage.setItem(KEY, this.serialize()); } catch (e) { /* ignore */ }
    },

    addEssence(n) { this.state.essence += n; this.save(); },

    // Boss defeated/redeemed: +essence, and light its element shrine if mapped.
    markBossDefeated(type) {
      const JH = root.JH;
      this.state.essence += (JH && JH.CHURCH ? JH.CHURCH.essencePerBoss : 1);
      const sh = JH && JH.CHURCH && JH.CHURCH.shrines.find((s) => s.boss === type);
      if (sh) this.state.elements[sh.element] = true;
      this.save();
    },

    blessingCount(id) { return this.state.blessings[id] || 0; },
    blessingCost(id) { return root.JH.Balance.blessingCost(this.blessingCount(id)); },
    canBuyBlessing(id) { return this.state.essence >= this.blessingCost(id); },

    // Spend essence, bump the count, recompute + carry the player's stats.
    buyBlessing(id, player) {
      if (!this.canBuyBlessing(id)) return false;
      this.state.essence -= this.blessingCost(id);
      this.state.blessings[id] = this.blessingCount(id) + 1;
      this.save();
      const fresh = root.JH.Upgrades.computeStats(root.JH.Upgrades.owned);
      const hpGain = fresh.maxHp - player.stats.maxHp;
      const waterGain = fresh.maxWater - player.stats.maxWater;
      player.applyStats(fresh);
      if (hpGain > 0) player.hp = Math.min(fresh.maxHp, player.hp + hpGain);
      if (waterGain > 0) player.water = Math.min(fresh.maxWater, player.water + waterGain);
      return true;
    },
  };

  root.JH = root.JH || {};
  root.JH.Church = Church;
  if (typeof module !== "undefined" && module.exports) module.exports = Church;
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 5: Add the script include to `index.html`**

After line 88 (`<script src="js/upgrades.js"></script>`), add:

```html
  <script src="js/church.js"></script>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test`
Expected: PASS (defaults / sanitize / serialize tests green).

- [ ] **Step 7: Commit**

```bash
# bump package.json "version" to 0.11.12
git add js/church.js js/config.js index.html tests/church.test.js package.json
git commit -m "feat(church): JH.Church meta-state + persistence + config block"
```

---

### Task 3: Fold blessings into `computeStats` (permanent layer)

Make Church blessings apply on top of base stats every run, surviving `Upgrades.reset()`.

**Files:**
- Modify: `js/upgrades.js` (`computeStats`, ~lines 125-134)

**Interfaces:**
- Consumes: `JH.Church.state.blessings` (Task 2), `JH.CHURCH.blessings` (Task 2).

- [ ] **Step 1: Edit `computeStats` in `js/upgrades.js`**

Replace the body of `computeStats(owned)` (currently lines ~125-134):

```js
    computeStats(owned) {
      const s = JSON.parse(JSON.stringify(JH.PLAYER));
      NODES.forEach((n) => { if (owned && owned[n.id]) n.apply(s); });
      const rc = this.repCount || {};
      REPEATABLES.forEach((n) => {
        const c = rc[n.id] || 0;
        for (let i = 0; i < c; i++) n.apply(s);
      });
      // Permanent Church blessings (survive Upgrades.reset()).
      const ch = (JH.Church && JH.Church.state && JH.Church.state.blessings) || {};
      const cdefs = (JH.CHURCH && JH.CHURCH.blessings) || [];
      cdefs.forEach((b) => {
        const c = ch[b.id] || 0;
        for (let i = 0; i < c; i++) b.apply(s);
      });
      return s;
    },
```

- [ ] **Step 2: Manual verification (browser dev console)**

Run: `npm run dev`, open http://localhost:5173, press START.
In the console:

```js
JH.Church.state.blessings = { bless_dps: 2 };
JH.Upgrades.computeStats(JH.Upgrades.owned).sprayDamage; // base 50 + 2*4 = 58
```

Expected: `58`. Then reset for cleanliness: `JH.Church.state.blessings = {}`.

- [ ] **Step 3: Commit**

```bash
# bump package.json "version" to 0.11.13
git add js/upgrades.js package.json
git commit -m "feat(church): fold permanent blessings into computeStats"
```

---

### Task 4: Award essence on boss defeat

Hook the single universal kill path so every boss defeat/redemption banks 1 essence and lights its shrine.

**Files:**
- Modify: `js/game.js` (`onEnemyKilled`, line 496)

**Interfaces:**
- Consumes: `JH.Church.markBossDefeated(type)` (Task 2). Boss entities carry `isBoss === true` and `type` equal to their `bossType` (e.g. `"quake"`).

- [ ] **Step 1: Edit `onEnemyKilled` in `js/game.js`**

Replace line 496:

```js
    onEnemyKilled(e) {
      this.kills++;
      if (e && e.isBoss && JH.Church) JH.Church.markBossDefeated(e.type);
    },
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev`. START. Console: `JH.Church.state.essence` → note value.
Press backtick → dev menu → jump to `QUAKE WALKER`. Press `K` to insta-kill the boss; let the cutscene/clear play.
Console: `JH.Church.state.essence` increased by 1; `JH.Church.state.elements.earth` is `true`.

Expected: +1 essence per boss kill, `earth` unlocked after Quake. Reload page → values persist (`localStorage`).

- [ ] **Step 3: Commit**

```bash
# bump package.json "version" to 0.11.14
git add js/game.js package.json
git commit -m "feat(church): bank 1 essence + light element on boss defeat"
```

---

### Task 5: Act-start checkpoint tracking + respawn helper

Track the current act's start wave and add a respawn path that keeps the build and Suds.

**Files:**
- Modify: `js/game.js` (state fields ~line 38; `startGame` ~line 259; `startWave` ~line 279; new `respawnAtCheckpoint` near `closeShop` ~line 640)

**Interfaces:**
- Consumes: `JH.Balance.actStartForWave` + `JH.ACT_STARTS` (Task 1).
- Produces: `Game.checkpointWave:number`; `Game.respawnAtCheckpoint()` — rebuilds the world at the checkpoint wave in `play` state without resetting upgrades; called by the Church portal (Task 7).

- [ ] **Step 1: Add the state field**

In the `Game` object literal, line 38 (after `dyingBoss: null, deathSeqT: 0,`):

```js
    checkpointWave: 0,
```

- [ ] **Step 2: Initialise it in `startGame`**

In `startGame()`, after `this.waveIndex = -1; this.waveActive = false; this.waveCleared = false;` (line 259), add:

```js
      this.checkpointWave = 0;
```

- [ ] **Step 3: Update it when a wave starts**

In `startWave(i)`, immediately after `this.waveIndex = i;` (line 279), add:

```js
      this.checkpointWave = JH.Balance.actStartForWave(i, JH.ACT_STARTS);
```

- [ ] **Step 4: Add `respawnAtCheckpoint`**

Immediately before `closeShop()` (line 640), add:

```js
    // Return from the Church: rebuild the world at the act-start checkpoint.
    // Keeps the player's build (no Upgrades.reset) and Suds.
    respawnAtCheckpoint() {
      const cp = this.checkpointWave || 0;
      JH.Camera.reset();
      const p = this.player;
      p.applyStats(JH.Upgrades.computeStats(JH.Upgrades.owned));
      p.x = WAVE_TRIGGERS[cp] - 40;
      p.y = JH.DEPTH_MAX - 24;
      p.hp = p.stats.maxHp;
      p.water = p.stats.maxWater;
      p.alive = true;
      this.enemies = []; this.embers = []; this.pickups = []; this.particles = [];
      this.deferredQueue = [];
      this.hitStopTimer = 0;
      this.wall = null; this.gardens = [];
      this.shopNpc = null; this.nearShop = false;
      this.dropBudget = { suds: 0, items: 0 };
      this.waveIndex = cp - 1;
      this.waveActive = false; this.waveCleared = false;
      this.bounds = { minX: 8, maxX: WAVE_TRIGGERS[cp] + 30 };
      this.state = "play";
      this.showScreen("hud");
      JH.Music.reset(); JH.Music.start();
      this.banner("BACK TO THE STREET!", 1.4);
    },
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. START. Backtick → jump to `RUBBLE ROW` (Act 3). Console: `JH.Game ? null : null` — instead verify via the running instance; in `js/main.js` the game is `JH.Game`. Console:

```js
Game === undefined; // (Game is module-local) — use the dev path instead:
```

Simplest check: after jumping to RUBBLE ROW, open console and run the respawn through the live object exposed by main. If `JH.Game` is not exposed, verify in Task 7 end-to-end instead. For now confirm no syntax errors: the page runs, START works, wave-jump works.

Expected: no console errors; game playable. (Full checkpoint behaviour is exercised in Task 7.)

- [ ] **Step 6: Commit**

```bash
# bump package.json "version" to 0.11.15
git add js/game.js package.json
git commit -m "feat(church): act-start checkpoint tracking + respawn helper"
```

---

### Task 6: Player death sequence → enter Church

Route death into a `playerDeathSeq` state (collapse → fade → spirit flicker), then hand off to the `church` state. Mirrors the existing `bossDeathSeq` pattern.

**Files:**
- Modify: `js/game.js` (death check line 813; new methods near `gameOver` line 655; update dispatch ~line 697; render overlay ~line 914)

**Interfaces:**
- Consumes: `JH.CHURCH.deathSeq` (Task 2), `JH.Church.enterScene(game)` (Task 7 — guard until then).
- Produces: `Game` states `"playerDeathSeq"` and `"church"`; `Game.enterChurch()`.

- [ ] **Step 1: Route the death check into the sequence**

Replace line 813 (`if (!this.player.alive) this.gameOver();`):

```js
      if (!this.player.alive && this.state === "play") this.startPlayerDeathSeq();
```

- [ ] **Step 2: Add the sequence + church-entry methods**

Immediately after `gameOver() { ... },` (ends line 662), add:

```js
    startPlayerDeathSeq() {
      this.state = "playerDeathSeq";
      this.deathSeqT = 0;
      this.audio.play("die");
      this.shake(8);
    },

    updatePlayerDeathSeq(dt) {
      if ((this.deathSeqT += dt) >= JH.CHURCH.deathSeq.total) {
        this.deathSeqT = 0;
        this.enterChurch();
      }
    },

    enterChurch() {
      this.state = "church";
      document.getElementById("hud").classList.add("hidden");
      document.getElementById("banner").classList.add("hidden");
      if (JH.Church.enterScene) JH.Church.enterScene(this);
    },
```

- [ ] **Step 3: Add the update dispatch**

In `update(dt)`, after the existing `bossDeathSeq` block (ends line 704), add:

```js
      if (this.state === "playerDeathSeq") {
        this.particles = this.particles.filter((p) => p.update(dt));
        this.embers   = this.embers.filter((p) => p.update(dt, this));
        this.updatePlayerDeathSeq(dt);
        return;
      }
      if (this.state === "church") {
        if (JH.Church.updateScene) JH.Church.updateScene(dt, this);
        return;
      }
```

- [ ] **Step 4: Add the death-sequence render overlay**

In `render()`, after `ctx.restore();` (line 914) and before the hover-shop line, add:

```js
      // Player death sequence: fade-to-black then a flickering spirit.
      if (this.state === "playerDeathSeq") {
        const D = JH.CHURCH.deathSeq, t = this.deathSeqT, ctx2 = this.ctx;
        let a = 0;
        if (t > D.animEnd) a = Math.min(1, (t - D.animEnd) / (D.fadeEnd - D.animEnd));
        if (a > 0) { ctx2.save(); ctx2.globalAlpha = a; ctx2.fillStyle = "#000";
          ctx2.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H); ctx2.restore(); }
        if (t > D.fadeEnd) {
          const flick = (Math.sin(t * 22) > -0.3) ? 0.85 : 0.25;   // placeholder flicker
          ctx2.save(); ctx2.globalAlpha = flick; ctx2.fillStyle = JH.PAL.waterHi;
          const cx = JH.VIEW_W / 2, cy = JH.VIEW_H / 2;
          ctx2.fillRect(cx - 5, cy - 16, 10, 22);                  // body
          ctx2.fillRect(cx - 4, cy - 24, 8, 8);                    // head
          ctx2.restore();
        }
      }
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. START. Stand still and let mooks kill you (or console: `JH.Game` is module-local — instead walk into enemies until HP hits 0).
Observe: screen shakes, fades to black ~1.2–2.0s, then a flickering cyan spirit placeholder appears; state becomes `"church"` (screen then goes to the placeholder Church — currently blank until Task 7). No crash, no `over` screen.

Expected: death → fade → spirit; lands in `church` state. (`JH.Church.enterScene`/`updateScene` are guarded, so a blank Church with no error is correct here.)

- [ ] **Step 6: Commit**

```bash
# bump package.json "version" to 0.11.16
git add js/game.js package.json
git commit -m "feat(church): player death sequence -> enter Church state"
```

---

### Task 7: Church scene core loop — walk → discover → portal back

The minimal end-to-end Church: a mysterious walk to the altar, then a portal that returns you to the act-start checkpoint. (Father Jon + altar menu + ceremony arrive in Tasks 8–9.)

**Files:**
- Modify: `js/church.js` (add scene state + `enterScene`/`updateScene`/`renderScene`)
- Modify: `js/game.js` (`render()` — delegate the `church` state to `JH.Church.renderScene`, ~top of `render`)

**Interfaces:**
- Consumes: `JH.CHURCH.layout` (Task 2), `JH.Input` (`held`/`pressed`), `game.respawnAtCheckpoint()` (Task 5), `JH.Camera`.
- Produces: `JH.Church.enterScene(game)`, `JH.Church.updateScene(dt, game)`, `JH.Church.renderScene(ctx, game)`; `JH.Church.scene` = `{ phase, spiritX, t }`.

- [ ] **Step 1a: Add the `blit` fallback helper to `js/church.js`**

Inside the IIFE, immediately above `const Church = {`, add the image-blit-with-procedural-fallback helper (the documented `neighbor` pattern — draws the PNG once loaded, else runs the rect fallback so the loop always renders):

```js
  // Draw img if it's a loaded Image (_ready), else run the procedural fallback.
  function blit(ctx, img, x, y, w, h, fallback) {
    if (img && img._ready) ctx.drawImage(img, x, y, w, h);
    else fallback();
  }
```

- [ ] **Step 1b: Add the scene methods to `js/church.js`**

Inside the `Church` object (after `buyBlessing`), add. `renderScene` reads transparent PNGs from `JH.ChurchArt` (added in Task 10) and falls back to ctx-rects until they exist — so this task renders on fallbacks and Task 10 lights up the art with no changes here:

```js
    // ---- Death-interlude scene -------------------------------------
    enterScene(game) {
      const L = root.JH.CHURCH.layout;
      const firstVisit = !this.state.churchVisited;
      this.state.churchVisited = true;
      this.save();
      this.scene = {
        phase: "walk",
        spiritX: firstVisit ? L.spawnFar : L.spawnNear,
        firstVisit: firstVisit,
        t: 0,
      };
    },

    updateScene(dt, game) {
      const sc = this.scene; if (!sc) return;
      const L = root.JH.CHURCH.layout, In = root.JH.Input;
      sc.t += dt;
      if (sc.phase === "walk") {
        const sp = 70 * dt;
        if (In.held("right")) sc.spiritX += sp;
        if (In.held("left"))  sc.spiritX -= sp;
        if (sc.spiritX < 8) sc.spiritX = 8;
        if (sc.spiritX >= L.altarX) { sc.spiritX = L.altarX; sc.phase = "portal"; sc.t = 0; }
        return;
      }
      if (sc.phase === "portal") {
        if (In.pressed("confirm") && sc.t > 0.25) { this.scene = null; game.respawnAtCheckpoint(); }
        return;
      }
    },

    renderScene(ctx, game) {
      const sc = this.scene; if (!sc) return;
      const JH = root.JH, L = JH.CHURCH.layout, PAL = JH.PAL, ART = JH.ChurchArt || {};
      const VW = JH.VIEW_W, VH = JH.VIEW_H;
      const camX = Math.max(0, Math.min(sc.spiritX - VW / 2, L.length - VW));
      ctx.font = "8px monospace"; ctx.textAlign = "center";

      // Backdrop.
      blit(ctx, ART.backdrop, 0, 0, VW, VH, () => {
        ctx.fillStyle = "#0a0c14"; ctx.fillRect(0, 0, VW, VH);
        ctx.fillStyle = "#11141f"; ctx.fillRect(0, VH - 60, VW, 60);
      });

      // Four shrines; lit by unlocked element.
      JH.CHURCH.shrines.forEach((s, i) => {
        const x = Math.round(120 + i * 90 - camX), lit = this.state.elements[s.element];
        blit(ctx, lit ? ART.shrineLit : ART.shrineDim, x - 10, 52, 20, 44, () => {
          ctx.fillStyle = lit ? PAL.waterHi : "#1c2233"; ctx.fillRect(x - 10, 56, 20, 40);
        });
      });

      // Altar.
      const ax = Math.round(L.altarX - camX);
      blit(ctx, ART.altar, ax - 14, VH - 96, 28, 36, () => {
        ctx.fillStyle = "#39507a"; ctx.fillRect(ax - 12, VH - 92, 24, 32);
      });

      // Portal (only once revealed).
      if (sc.phase === "portal") {
        const px = Math.round(L.portalX - camX);
        blit(ctx, ART.portal, px - 10, VH - 100, 20, 40, () => {
          ctx.fillStyle = "#6cff9a"; ctx.fillRect(px - 8, VH - 96, 16, 36);
        });
      }

      // Spirit.
      const sx = Math.round(sc.spiritX - camX);
      blit(ctx, ART.spirit, sx - 8, VH - 96, 16, 32, () => {
        ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = PAL.waterHi;
        ctx.fillRect(sx - 5, VH - 86, 10, 22); ctx.fillRect(sx - 4, VH - 94, 8, 8); ctx.restore();
      });

      // Phase prompts.
      ctx.fillStyle = "#9fb0c8";
      if (sc.phase === "walk") ctx.fillText("...where am I?  →", VW / 2, 20);
      else if (sc.phase === "portal") ctx.fillText("A portal hums. Press E to return.", VW / 2, 20);
      ctx.textAlign = "left";
    },
```

- [ ] **Step 2: Delegate `church` rendering in `js/game.js`**

At the very top of `render()` (after `render() {`), add:

```js
      if (this.state === "church") {
        const ctx = this.ctx;
        ctx.save();
        ctx.clearRect(-12, -12, JH.VIEW_W + 24, JH.VIEW_H + 24);
        JH.Church.renderScene(ctx, this);
        ctx.restore();
        if (this.devMenu) this.drawDevMenu(ctx);
        return;
      }
```

- [ ] **Step 3: Manual verification (the full loop end-to-end)**

Run: `npm run dev`. START. Backtick → jump to `RUBBLE ROW` (Act 3, checkpoint = wave 8).
Die (walk into enemies). After the death sequence you land in the Church: a dim hall, the spirit on the left, the "...where am I?" prompt.
Walk RIGHT (D) to the altar → the portal appears → press E.
You return to the street at **RUBBLE ROW** (Act 3 start), full HP, with your Suds and upgrades intact.

Expected: walk → altar → portal → respawn at the correct act start; build/Suds preserved; no errors. Reload page: essence/blessings still persist.

- [ ] **Step 4: Commit**

```bash
# bump package.json "version" to 0.11.17
git add js/church.js js/game.js package.json
git commit -m "feat(church): walkable Church loop -> portal back to checkpoint"
```

---

### Task 8: The altar boon menu

Stop at the altar to spend Holy Essence on the three blessings before the portal.

**Files:**
- Modify: `js/church.js` (`updateScene`/`renderScene` — add an `altar` phase between `walk` and `portal`)

**Interfaces:**
- Consumes: `JH.CHURCH.blessings`, `JH.Church.canBuyBlessing/buyBlessing/blessingCost/blessingCount`, `game.player`.
- Produces: scene `phase: "altar"` with `sc.cursor` (0..blessings.length, last row = "Leave →").

- [ ] **Step 1: Route walk → altar (not straight to portal)**

In `updateScene`, change the `walk` phase transition:

```js
        if (sc.spiritX >= L.altarX) { sc.spiritX = L.altarX; sc.phase = "altar"; sc.cursor = 0; sc.t = 0; }
```

- [ ] **Step 2: Add the `altar` phase handler**

In `updateScene`, before the `if (sc.phase === "portal")` block, add:

```js
      if (sc.phase === "altar") {
        const defs = root.JH.CHURCH.blessings, rows = defs.length + 1; // + "Leave"
        if (In.pressed("up"))   sc.cursor = (sc.cursor - 1 + rows) % rows;
        if (In.pressed("down")) sc.cursor = (sc.cursor + 1) % rows;
        if (In.pressed("confirm") && sc.t > 0.2) {
          if (sc.cursor >= defs.length) { sc.phase = "portal"; sc.t = 0; }
          else {
            const id = defs[sc.cursor].id;
            if (this.buyBlessing(id, game.player)) game.audio.play("upgrade");
            else game.audio.play("hurt");
          }
        }
        return;
      }
```

- [ ] **Step 3: Render the altar menu**

In `renderScene`, replace the `else if (sc.phase === "portal")` prompt branch with handling for both `altar` and `portal`:

```js
      else if (sc.phase === "altar") {
        ctx.fillText("ALTAR OF ELEMENTS — Holy Essence: " + this.state.essence, root.JH.VIEW_W / 2, 16);
        const defs = root.JH.CHURCH.blessings;
        const baseY = 30;
        defs.forEach((b, i) => {
          const sel = sc.cursor === i;
          ctx.fillStyle = sel ? "#ffd23f" : (this.canBuyBlessing(b.id) ? "#cfe" : "#667");
          ctx.fillText((sel ? "▶ " : "  ") + b.name + "  (" + b.desc + ")  cost " +
            this.blessingCost(b.id) + "  lvl " + this.blessingCount(b.id),
            root.JH.VIEW_W / 2, baseY + i * 11);
        });
        const sel = sc.cursor === defs.length;
        ctx.fillStyle = sel ? "#6cff9a" : "#9fb0c8";
        ctx.fillText((sel ? "▶ " : "  ") + "Leave →", root.JH.VIEW_W / 2, baseY + defs.length * 11);
      }
      else if (sc.phase === "portal")
        ctx.fillText("A portal hums. Press E to return.", root.JH.VIEW_W / 2, 20);
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. START. Backtick → jump to `QUAKE WALKER`; press `K` to kill it (banks 1 essence). Continue, then die.
In the Church, walk to the altar: the menu shows "Holy Essence: 1" (or more), the three blessings with cost 1 / level 0, and "Leave →".
Buy `Anointed Pressure` → essence drops by 1, its level → 1, cost → 2; chime plays. Try to buy with 0 essence → "hurt" buzz, no change.
Select "Leave →" → portal → E → back on the street; `JH.Church.state.blessings.bless_dps` persists after reload, and spray damage reflects the blessing.

Expected: spend/feedback correct; cost rises 1→2→3; persists.

- [ ] **Step 5: Commit**

```bash
# bump package.json "version" to 0.11.18
git add js/church.js package.json
git commit -m "feat(church): altar boon menu — spend essence on blessings"
```

---

### Task 9: Father Jon + shrine ceremony + first-visit/abbreviated

Add the framing: Father Jon's sermon on arrival, a one-time shrine-lighting ceremony per newly-unlocked element, and the abbreviated repeat-visit path.

**Files:**
- Modify: `js/church.js` (`enterScene` — build the ceremony queue + branch full/abbreviated; `updateScene`/`renderScene` — add `sermon` + `ceremony` phases)
- Modify: `js/config.js` (`JH.CHURCH` — add `sermon` line pools)

**Interfaces:**
- Consumes: `JH.Church.state.elements` / `ceremonyDone`, `JH.CHURCH.sermon`.
- Produces: scene phases `"sermon"` and `"ceremony"`; `sc.ceremonyQueue:string[]` (element names), `sc.line:string`.

- [ ] **Step 1: Add sermon copy to `JH.CHURCH` in `js/config.js`**

Inside the `JH.CHURCH = { ... }` block (after `essencePerBoss: 1,`), add:

```js
    sermon: {
      first: "Rise, my child. You have passed from the street into the Church of the Hose. Death is not the end of the spray.",
      repeat: ["The water remembers you.", "Again you fall — again you rise.", "Pressure builds in the faithful.", "The street still thirsts. Return."],
    },
```

- [ ] **Step 2: Build the ceremony queue + branch in `enterScene`**

Replace the body of `enterScene(game)` with:

```js
    enterScene(game) {
      const JH = root.JH, L = JH.CHURCH.layout;
      const firstVisit = !this.state.churchVisited;
      this.state.churchVisited = true;
      // Elements unlocked but not yet celebrated -> queue a one-time ceremony.
      const queue = JH.CHURCH.shrines
        .filter((s) => this.state.elements[s.element] && !this.state.ceremonyDone[s.element])
        .map((s) => s.element);
      this.save();
      const line = firstVisit
        ? JH.CHURCH.sermon.first
        : JH.CHURCH.sermon.repeat[(Math.random() * JH.CHURCH.sermon.repeat.length) | 0];
      this.scene = {
        phase: "walk",
        spiritX: firstVisit ? L.spawnFar : L.spawnNear,
        firstVisit: firstVisit,
        ceremonyQueue: queue,
        line: line,
        t: 0,
      };
    },
```

- [ ] **Step 3: Insert `sermon` + `ceremony` phases in `updateScene`**

Change the `walk` transition to go to `sermon`:

```js
        if (sc.spiritX >= L.altarX) { sc.spiritX = L.altarX; sc.phase = "sermon"; sc.t = 0; }
```

Then, before the `altar` handler, add:

```js
      if (sc.phase === "sermon") {
        if (In.pressed("confirm") && sc.t > 0.3) {
          sc.phase = sc.ceremonyQueue.length ? "ceremony" : "altar";
          sc.cursor = 0; sc.t = 0;
        }
        return;
      }
      if (sc.phase === "ceremony") {
        if (In.pressed("confirm") && sc.t > 0.3) {
          const el = sc.ceremonyQueue.shift();
          if (el) { this.state.ceremonyDone[el] = true; this.save(); }
          if (!sc.ceremonyQueue.length) { sc.phase = "altar"; sc.cursor = 0; }
          sc.t = 0;
        }
        return;
      }
```

- [ ] **Step 4: Render `sermon` + `ceremony` overlays**

In `renderScene`, add to the prompt chain (before the `altar` branch):

```js
      else if (sc.phase === "sermon") {
        ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(0, root.JH.VIEW_H - 56, root.JH.VIEW_W, 56);
        // Father Jon portrait (transparent PNG; nothing drawn if absent).
        blit(ctx, (root.JH.ChurchArt || {}).fatherJon, 8, root.JH.VIEW_H - 54, 44, 50, () => {});
        ctx.fillStyle = "#ffe9a8"; ctx.textAlign = "center";
        wrapText(ctx, "Father Jon: " + sc.line, root.JH.VIEW_W / 2, root.JH.VIEW_H - 42, 400, 10);
        ctx.fillStyle = "#9fb0c8"; ctx.fillText("Press E", root.JH.VIEW_W / 2, root.JH.VIEW_H - 8);
      }
      else if (sc.phase === "ceremony") {
        const el = sc.ceremonyQueue[0] || "";
        const glow = (Math.sin(sc.t * 8) * 0.5 + 0.5);
        ctx.fillStyle = `rgba(108,211,255,${(0.3 + 0.5 * glow).toFixed(2)})`;
        ctx.fillRect(0, 0, root.JH.VIEW_W, root.JH.VIEW_H);
        ctx.fillStyle = "#fff"; ctx.textAlign = "center";
        ctx.fillText("The " + el.toUpperCase() + " shrine awakens!", root.JH.VIEW_W / 2, root.JH.VIEW_H / 2);
        ctx.fillStyle = "#9fb0c8"; ctx.fillText("Press E", root.JH.VIEW_W / 2, root.JH.VIEW_H / 2 + 16);
      }
```

Add a small `wrapText` helper at the top of the IIFE (after `const ELEMENTS = ...`):

```js
  function wrapText(ctx, text, cx, y, maxW, lh) {
    const words = text.split(" "); let line = "", yy = y;
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, cx, yy); line = w; yy += lh; }
      else line = test;
    }
    if (line) ctx.fillText(line, cx, yy);
  }
```

- [ ] **Step 5: Manual verification**

**Fresh-state run** (console: `localStorage.removeItem("jonhose.church.v1")`, then reload):
START → backtick → jump to `QUAKE WALKER` → `K` to redeem (earth unlocks, +1 essence) → die.
Church: long walk (spirit starts far left) → reach altar → **Father Jon's full first-visit sermon** → press E → **EARTH shrine ceremony** (cyan glow) → press E → altar menu → Leave → portal → return.
**Die again:** abbreviated — spirit starts near the altar (short walk), Father Jon gives a brief *repeat* line, **no** earth ceremony (already done, shrine just glows), altar + portal as normal.

Expected: full-then-abbreviated; ceremony only on first unlock; `ceremonyDone.earth === true` persists.

- [ ] **Step 6: Commit**

```bash
# bump package.json "version" to 0.11.19
git add js/church.js js/config.js package.json
git commit -m "feat(church): Father Jon sermon + one-time shrine ceremony"
```

---

### Task 10: Transparent-PNG placeholder art (Gemini) + `JH.ChurchArt`

Generate style-consistent transparent-PNG placeholders for the Church and blit them in (the rect fallbacks from Tasks 6–9 remain the safety net). Pure enhancement — the loop already works without it.

**Files:**
- Create: `sprites/church/*.png` (generated)
- Modify: `js/assets.js` (add the `JH.ChurchArt` image cache, end of the IIFE near the Quake portrait loader ~line 908)

**Interfaces:**
- Produces: `JH.ChurchArt = { backdrop, spirit, altar, shrineDim, shrineLit, portal, fatherJon }` (each a preloaded `Image` with `_ready`), consumed by `church.js` `renderScene`/`sermon` `blit(...)` calls.

**Prerequisite:** `GOOGLE_API_KEY` in `.env` (root). If absent, skip generation — the game runs on the ctx-rect fallbacks; this task can be revisited later.

**Art brief** (hand to the generation skill — see "Address the skill request" below): dim, sacred *Church of the Hose* pixel-art matching `JH.PAL`; the spirit/portal glow cyan (`PAL.waterHi #d6f6ff` / `PAL.water #6cd3ff`); stone/holy tones for backdrop/altar/shrines. **Transparent background** PNGs (except `backdrop`, which is full-frame). Target logical sizes (generate at 3–4× then downscale on blit):

| Asset | File | ~logical px | Transparent |
|---|---|---|---|
| Backdrop | `sprites/church/backdrop.png` | 480×270 | no (full frame) |
| Spirit (Jon) | `sprites/church/spirit.png` | 16×32 | yes |
| Altar of Elements | `sprites/church/altar.png` | 28×36 | yes |
| Shrine (dim) | `sprites/church/shrine_dim.png` | 20×44 | yes |
| Shrine (lit) | `sprites/church/shrine_lit.png` | 20×44 | yes |
| Portal | `sprites/church/portal.png` | 20×40 | yes |
| Father Jon portrait | `sprites/church/father_jon.png` | 44×50 | yes |

- [ ] **Step 1: Generate the PNGs**

Use the jon-hose art-generation skill (see the skill decision below) to produce the seven assets above into `sprites/church/`, transparent where specified, matching the art brief. (Underlying tool: `node tools/imagen-gen.mjs` → Gemini Flash Image, then transparency/quantize postprocess.)

- [ ] **Step 2: Add the `JH.ChurchArt` cache to `js/assets.js`**

At the end of the IIFE, after the Quake portrait block (closes ~line 908), add:

```js
  // =================== CHURCH OF THE HOSE ART =======================
  // Transparent PNGs; church.js renderScene falls back to ctx-rects if a
  // file is missing/unloaded (the documented neighbor blit+fallback seam).
  {
    function makeImg(src) {
      const img = new Image(); img._ready = false;
      img.onload = () => { img._ready = true; };
      img.src = src; return img;
    }
    JH.ChurchArt = {
      backdrop:  makeImg("sprites/church/backdrop.png"),
      spirit:    makeImg("sprites/church/spirit.png"),
      altar:     makeImg("sprites/church/altar.png"),
      shrineDim: makeImg("sprites/church/shrine_dim.png"),
      shrineLit: makeImg("sprites/church/shrine_lit.png"),
      portal:    makeImg("sprites/church/portal.png"),
      fatherJon: makeImg("sprites/church/father_jon.png"),
    };
  }
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`. Trigger the Church (die after a wave-jump). The backdrop, spirit, altar, shrines, portal, and (in the sermon) Father Jon now render as PNGs.
Rename one file (e.g. `spirit.png` → `spirit.bak`) and reload → that element falls back to its ctx-rect with no error. Restore the file.

Expected: PNGs blit when present; clean procedural fallback when absent.

- [ ] **Step 4: Commit**

```bash
# bump package.json "version" to 0.11.20
git add sprites/church js/assets.js package.json
git commit -m "feat(church): transparent-PNG placeholder art + JH.ChurchArt cache"
```

---

## Self-Review

**Spec coverage** (against `2026-06-29-church-of-the-hose-phase0-death-loop-design.md`):
- §1 states & death flow → Tasks 6 (states, fade, spirit) + 7 (church delegation). ✓
- §2 Church scene (walk/discover/ceremony/altar/portal; first-vs-abbreviated) → Tasks 7, 8, 9. ✓
- §3 checkpoints (ACT_STARTS, respawn no-reset, Suds intact) → Tasks 1, 5, 7. ✓
- §4 essence (1/boss) + altar blessings (+DPS/+Tank/+HP, cost 1,2,3) → Tasks 2, 4, 8. ✓
- §4 blessings fold into computeStats → Task 3. ✓
- §5 persistence (localStorage, sanitize/defaults, debug-only reset) → Task 2. ✓
- §6 files (config/church/upgrades/game/index.html) → covered across tasks. ✓
- §7 art = placeholder: transparent-PNG (Gemini) blitted with a ctx-rect procedural fallback (the `neighbor` swap-point seam) → Tasks 6–9 (fallbacks) + Task 10 (PNGs/`JH.ChurchArt`). ✓
- §8 tests (essence/cost, checkpoint, persistence round-trip pure; rest manual) → Tasks 1, 2; manual steps elsewhere. ✓
- §9 out-of-scope (gear, talent tree, archetypes, new bosses, real art, difficulty) → not implemented. ✓

**Placeholder scan:** Two intentional placeholders in Task 7 Step 1 (`ctx.fillText ? null : null;` and the `"#3a4straws"` typo line) are explicitly called out with the corrected replacement in the same step — remove on paste. No other TBD/TODO/"handle edge cases".

**Type consistency:** `JH.Church.state` shape, `markBossDefeated(type)`, `blessingCost/canBuyBlessing/buyBlessing(id[,player])`, `enterScene/updateScene/renderScene(…, game)`, `Game.checkpointWave`, `Game.respawnAtCheckpoint()`, `JH.Balance.actStartForWave(waveIndex, actStarts)` / `blessingCost(timesBought)`, and `JH.CHURCH.{deathSeq,layout,shrines,blessings,sermon,essencePerBoss}` are used consistently across tasks.

## Notes for the implementer

- **Deferred (not this plan):** the player death **animation** and all Church visuals are minimal placeholders (ctx rectangles) by design — a later graphics-polish pass replaces them at the same seams (`deathSeqT` windows in `render`, `renderScene` in `church.js`). Don't invest in art here.
- `JH.Game` is module-local in `game.js`; for console pokes use `JH.Church`, `JH.Upgrades`, `JH.CHURCH` (exposed) and the dev menu (backtick / `K`) to drive states.
- If `npm test` reports no files, ensure the new tests live in `tests/` and end with `.test.js`.
