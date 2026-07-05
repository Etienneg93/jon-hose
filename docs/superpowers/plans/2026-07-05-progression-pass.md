# v0.27.0 Progression Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three growth layers per `docs/superpowers/specs/2026-07-05-progression-pass-design.md` — XP levels (numbers), benedictions (rules), Church pillars (favor) — plus the event shop, relics, and drop-feel fixes.

**Architecture:** Two new dual-export modules: `js/pillars.js` (replaces `js/mirror.js`) and `js/benedictions.js` (boon defs + active map + stat folding + offer algorithm). Pure math goes in `js/balance.js`. Levels ride the existing `Upgrades.repCount` pattern (`levelCount` folded in `computeStats`). Runtime boon hooks live at the specific `entities.js`/`game.js` sites named per task. Everything run-scoped resets in `startGame`; benedictions ALSO wash on death.

**Tech Stack:** Vanilla JS (IIFE + `JH` global), canvas, `node --test`. Branch: `progression-pass` (stacked on switch-gk-art → curve-pass; `SlowZone`, stat panel, `spawnFirePatch`, `powerCount` all exist).

## Global Constraints

- Suite baseline **154 passing**; every task ends green with its new tests.
- Comments: behavioral/mechanical facts only (no design lore — CLAUDE.md).
- No new input bindings. No modals. Walk-up + E only (Church station pattern).
- Death wash: benedictions clear; suds/signatures/relics/levels/pillars survive (`respawnFromChurch` keeps them; `startGame` resets everything).
- `index.html` load order: config → balance → pillars → benedictions → world → upgrades → church → mirror(remove) → entities → game — new scripts must be added there AND to the test-file boot sequences that need them.
- All tunables land at the spec's numbers verbatim; tuning happens at the compound playtest gate (v0.26 + boss art + this).
- Commits end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Test-file boot pattern (tests/entities.test.js): `global.window = {}` → require config → stub `JH.Loader` → world → upgrades → entities; extend with pillars/benedictions requires where a task says so.
- **Essence is pickup-only** — see "TODO notes" at the bottom before touching Tasks 3, 6, 15, 17, or any `addEssence`/`markBossDefeated` call site; floating gain-text + real-icon notes live there too.

---

### Task 1: Balance — xpForLevel, levelGains, rollDrop

**Files:**
- Modify: `js/balance.js`
- Test: `tests/balance.test.js` (append)

**Interfaces:**
- Produces: `Balance.xpForLevel(n) -> int` (XP needed to go from level n-1 to n; n>=1)
- Produces: `Balance.levelGains(levelCount, cycle) -> stats-delta object` (sums the repeating 6-step cycle)
- Produces: `Balance.rollDrop(dropMult, dryStreak, hpFrac, waterFrac, rng) -> "health"|"water"|null` (pity at streak>=6; need-weighting)

- [ ] **Step 1: Failing tests** (append):

```js
test("xpForLevel: 20 + 12n curve", () => {
  assert.strictEqual(Balance.xpForLevel(1), 32);
  assert.strictEqual(Balance.xpForLevel(5), 80);
  assert.strictEqual(Balance.xpForLevel(13), 176);
});

test("levelGains sums the repeating cycle", () => {
  const cycle = [
    { sprayDamage: 3 }, { maxWater: 8 }, { maxHp: 8 },
    { sprayRange: 4 }, { sprayDamage: 3 }, { waterRegen: 2 },
  ];
  assert.deepStrictEqual(Balance.levelGains(0, cycle), {});
  assert.deepStrictEqual(Balance.levelGains(2, cycle), { sprayDamage: 3, maxWater: 8 });
  const g13 = Balance.levelGains(13, cycle);          // two full cycles + 1
  assert.strictEqual(g13.sprayDamage, 3 * 2 * 2 + 3); // 4 dmg steps + the 13th (dmg)
  assert.strictEqual(g13.maxWater, 16);
  assert.strictEqual(g13.waterRegen, 4);
});

test("rollDrop: pity guarantees an item at streak >= 6; need-weighting biases the split", () => {
  assert.notStrictEqual(Balance.rollDrop(1, 6, 1, 1, () => 0.99), null);   // pity fires
  assert.strictEqual(Balance.rollDrop(1, 0, 1, 1, () => 0.99), null);      // no pity, high roll
  // low hp doubles health weight: with rng 0.5 the pick tips to health
  assert.strictEqual(Balance.rollDrop(1, 6, 0.3, 1, () => 0.5), "health");
  assert.strictEqual(Balance.rollDrop(1, 6, 1, 0.1, () => 0.5), "water");
});
```

- [ ] **Step 2: Run — FAIL** (functions undefined). Existing 154 pass.
- [ ] **Step 3: Implement** on the Balance object:

```js
    // XP needed to climb from level n-1 to n.
    xpForLevel(n) { return 20 + 12 * (n | 0); },

    // Summed stat deltas for `levelCount` level-ups walking the repeating
    // gain cycle. Returns {statKey: total}.
    levelGains(levelCount, cycle) {
      const out = {};
      for (let i = 0; i < (levelCount | 0); i++) {
        const step = cycle[i % cycle.length];
        for (const k in step) out[k] = (out[k] || 0) + step[k];
      }
      return out;
    },

    // One drop decision per kill. Pity: 6+ dry kills guarantees an item.
    // Need-weighting doubles the low resource's share of the item roll.
    rollDrop(dropMult, dryStreak, hpFrac, waterFrac, rng) {
      rng = rng || Math.random;
      const t = this.dropThresholds(dropMult);
      const itemChance = (dryStreak >= 6) ? 1 : t.water;   // t.water = cumulative item chance
      if (rng() >= itemChance) return null;
      let wh = t.health, ww = t.water - t.health;
      if (hpFrac < 0.5) wh *= 2;
      if (waterFrac < 0.3) ww *= 2;
      return rng() < wh / (wh + ww) ? "health" : "water";
    },
```

- [ ] **Step 4: `npm test`** — 157 pass.
- [ ] **Step 5: Commit** — `feat(balance): xp curve, level gain cycle, pity/need drop roll`

---

### Task 2: js/pillars.js + JH.PILLARS (module + data; wiring in Task 4/17)

**Files:**
- Create: `js/pillars.js`
- Modify: `js/config.js` (add `JH.PILLARS` after `JH.CHURCH`)
- Test: Create `tests/pillars.test.js`

**Interfaces:**
- Produces: `JH.Pillars.{rank(state, el), canBuy(state, def), buy(state, def), unlocked(state, def), apply(s, state, defs), totalRanks(state)}` — dual-export, mirrors mirror.js's shape. `state.pillars = {water:0, earth:0, fire:0, air:0}` lives on `JH.Church.state`.
- Produces: `JH.PILLARS.defs` — 4 defs `{element, name, gateBoss|null, maxRank:3, apply(s, rank)}` with capstone flags at rank 3: `s.pressureFloor=true` (water), `s.wallSlamStagger=true` (earth), `s.baselineScald=true` (fire), `s.dashIframeBonus=0.1` (air).

- [ ] **Step 1: Failing tests** (`tests/pillars.test.js`, boots like balance tests: `require("../js/pillars.js")` direct):

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const Pillars = require("../js/pillars.js");

const DEFS = [
  { element: "water", gateBoss: null, maxRank: 3,
    apply: (s, r) => { s.maxWater += 15 * r; s.waterRegen += 3 * r; if (r >= 3) s.pressureFloor = true; } },
  { element: "earth", gateBoss: "quake", maxRank: 3,
    apply: (s, r) => { s.maxHp += 12 * r; s.knockback += 15 * r; if (r >= 3) s.wallSlamStagger = true; } },
];

test("water is open from the start; earth gates on its boss", () => {
  const state = { essence: 5, elements: {}, pillars: {} };
  assert.strictEqual(Pillars.unlocked(state, DEFS[0]), true);
  assert.strictEqual(Pillars.unlocked(state, DEFS[1]), false);
  state.elements.earth = true;
  assert.strictEqual(Pillars.unlocked(state, DEFS[1]), true);
});

test("buy: costs 1/2/3, caps at maxRank, spends essence", () => {
  const state = { essence: 6, elements: {}, pillars: {} };
  assert.ok(Pillars.buy(state, DEFS[0]));   // -1
  assert.ok(Pillars.buy(state, DEFS[0]));   // -2
  assert.ok(Pillars.buy(state, DEFS[0]));   // -3
  assert.strictEqual(state.essence, 0);
  assert.strictEqual(Pillars.rank(state, "water"), 3);
  state.essence = 9;
  assert.strictEqual(Pillars.buy(state, DEFS[0]), false);  // capped
});

test("apply folds ranks + capstone; totalRanks sums", () => {
  const state = { essence: 0, elements: { earth: true }, pillars: { water: 3, earth: 1 } };
  const s = { maxWater: 100, waterRegen: 18, maxHp: 100, knockback: 115 };
  Pillars.apply(s, state, DEFS);
  assert.strictEqual(s.maxWater, 145);
  assert.strictEqual(s.pressureFloor, true);
  assert.strictEqual(s.maxHp, 112);
  assert.strictEqual(Pillars.totalRanks(state), 4);
});
```

- [ ] **Step 2: Run — FAIL** (module missing).
- [ ] **Step 3: Implement `js/pillars.js`** (same IIFE dual-export skeleton as mirror.js):

```js
/* =====================================================================
   pillars.js — JH.Pillars: the four element pillars in the Church nave.
   Replaces the Mirror node model. Pure logic + stat application;
   dual-export like balance.js. state shape (on JH.Church.state):
     { essence:int, elements:{...}, pillars:{water,earth,fire,air:int} }
   Rank r costs r+1 essence (1, 2, 3). Water has no gate; the others
   unlock when their nemesis is redeemed (state.elements[element]).
   ===================================================================== */
(function (root) {
  "use strict";
  function ranks(state) { return (state && state.pillars) || {}; }
  const Pillars = {
    rank(state, element) { return ranks(state)[element] | 0; },
    unlocked(state, def) {
      return !def.gateBoss || !!(state && state.elements && state.elements[def.element]);
    },
    cost(rank) { return (rank | 0) + 1; },
    canBuy(state, def) {
      if (!this.unlocked(state, def)) return false;
      const r = this.rank(state, def.element);
      if (r >= (def.maxRank || 3)) return false;
      return (state.essence || 0) >= this.cost(r);
    },
    buy(state, def) {
      if (!this.canBuy(state, def)) return false;
      if (!state.pillars) state.pillars = {};
      const r = this.rank(state, def.element);
      state.essence -= this.cost(r);
      state.pillars[def.element] = r + 1;
      return true;
    },
    apply(s, state, defs) {
      if (!s || !state || !defs) return s;
      for (const def of defs) {
        if (!this.unlocked(state, def)) continue;
        const r = this.rank(state, def.element);
        if (r > 0) def.apply(s, r);
      }
      return s;
    },
    totalRanks(state) {
      const p = ranks(state);
      let n = 0;
      for (const k in p) n += p[k] | 0;
      return n;
    },
  };
  root.JH = root.JH || {};
  root.JH.Pillars = Pillars;
  if (typeof module !== "undefined" && module.exports) module.exports = Pillars;
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 4: `JH.PILLARS` in config.js** (after the `JH.CHURCH` block; spec §3 numbers verbatim):

```js
  // ---- The four element pillars (replaces JH.MIRROR) ------------------
  // Rank r costs r+1 essence. Locked pillars display their nemesis.
  JH.PILLARS = {
    defs: [
      { element: "water", name: "Pillar of Water", gateBoss: null, maxRank: 3,
        desc: "+15 max water, +3 regen / rank · III: pressure never drops below mid tier",
        apply: (s, r) => { s.maxWater += 15 * r; s.waterRegen += 3 * r; if (r >= 3) s.pressureFloor = true; } },
      { element: "earth", name: "Pillar of Earth", gateBoss: "quake", maxRank: 3,
        desc: "+12 max HP, +15 knockback / rank · III: wall-slammed enemies stagger",
        apply: (s, r) => { s.maxHp += 12 * r; s.knockback += 15 * r; if (r >= 3) s.wallSlamStagger = true; } },
      { element: "fire", name: "Pillar of Fire", gateBoss: "slayer", maxRank: 3,
        desc: "+3 spray dmg, burn on you -25%·rank/3 · III: full pressure Scalds",
        apply: (s, r) => { s.sprayDamage += 3 * r; s.burnTakenMult = 1 - 0.25 * (r / 3); if (r >= 3) s.baselineScald = true; } },
      { element: "air", name: "Pillar of Air", gateBoss: "assman", maxRank: 3,
        desc: "+5 move speed, -0.05s dash cd / rank · III: +0.1s dash i-frames",
        apply: (s, r) => { s.moveSpeed += 5 * r; s.dashCd = Math.max(0.2, s.dashCd - 0.05 * r); if (r >= 3) s.dashIframeBonus = 0.1; } },
    ],
  };
```

  Also add `burnTakenMult: 1,` to `JH.PLAYER` (next to `dodgeChance`) and add `<script src="js/pillars.js"></script>` to index.html between balance and world.
- [ ] **Step 5: `npm test`** — 160 pass. **Commit** — `feat(pillars): element pillar module + defs (replaces Mirror model; wiring follows)`

---

### Task 3: XP & levels — accrual, computeStats fold, level-up moment, HUD sliver

**Files:**
- Modify: `js/config.js` (JH.LEVELS), `js/upgrades.js` (levelCount fold), `js/game.js` (accrual in `onEnemyKilled`, set-piece XP in `waveCleared_`, resets), `js/entities.js` (level-up FX helper on Player is NOT needed — game-side), `index.html` + `styles.css` (XP sliver)
- Test: `tests/entities.test.js` (append)

**Interfaces:**
- Produces: `JH.LEVELS.cycle` (6 entries), `JH.Upgrades.levelCount` (int, reset() clears), `game.playerXp`, `game.playerLevel`, `game.grantXp(n)`.
- Consumes: `Balance.xpForLevel`, `Balance.levelGains` (Task 1).

- [ ] **Step 1: config** —

```js
  // XP level-ups: kills grant xp = the enemy's def.suds; each level applies
  // the next step of this repeating cycle instantly (no pick, no pause).
  JH.LEVELS = {
    setPieceXp: 30,
    cycle: [
      { sprayDamage: 3 }, { maxWater: 8 }, { maxHp: 8 },
      { sprayRange: 4 }, { sprayDamage: 3 }, { waterRegen: 2 },
    ],
  };
```

- [ ] **Step 2: Failing test** (append to entities tests):

```js
test("computeStats folds levelCount through the gain cycle", () => {
  JH.Upgrades.reset();
  const base = JH.Upgrades.computeStats({});
  JH.Upgrades.levelCount = 2;                        // +3 dmg, +8 water
  const s = JH.Upgrades.computeStats({});
  assert.strictEqual(s.sprayDamage, base.sprayDamage + 3);
  assert.strictEqual(s.maxWater, base.maxWater + 8);
  JH.Upgrades.reset();
  assert.strictEqual(JH.Upgrades.levelCount, 0);
});
```

- [ ] **Step 3: Run — FAIL.**
- [ ] **Step 4: upgrades.js** — add `levelCount: 0,` next to `repCount`; in `reset()` add `this.levelCount = 0;`; in `computeStats` after the REPEATABLES fold:

```js
      // XP level-ups: fold the gain cycle (see JH.LEVELS).
      if (JH.LEVELS && this.levelCount > 0) {
        const g = JH.Balance.levelGains(this.levelCount, JH.LEVELS.cycle);
        for (const k in g) s[k] += g[k];
      }
```

- [ ] **Step 5: game.js.** In `onEnemyKilled(e)` first lines add `this.grantXp(e.def.suds || 0);`. In `waveCleared_` (after the clearedWave lookup) add `if (clearedWave && (clearedWave.garden || clearedWave.wall || clearedWave.holdout || clearedWave.douse)) this.grantXp(JH.LEVELS.setPieceXp);` (same guard as the cross drop — merge into that if-block). New method next to `onEnemyKilled`:

```js
    // XP: kills feed the bar; each threshold applies the next gain-cycle
    // step instantly — flash + sting + 10% water/hp top-up, no pause.
    grantXp(n) {
      if (!this.player || !this.player.alive) return;
      this.playerXp += n;
      while (this.playerXp >= JH.Balance.xpForLevel(this.playerLevel + 1)) {
        this.playerXp -= JH.Balance.xpForLevel(this.playerLevel + 1);
        this.playerLevel++;
        JH.Upgrades.levelCount = this.playerLevel;
        const p = this.player;
        p.applyStats(JH.Upgrades.computeStats(JH.Upgrades.owned));
        p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.1);
        p.water = Math.min(p.stats.maxWater, p.water + p.stats.maxWater * 0.1);
        this.audio.play("upgrade", { pitch: 1.3 });
        JH.burst(this, p.x, p.y, p.z + 16, "#ffd23f", 16, { speed: 90, life: 0.5, up: 70, size: 2 });
        this.shake(3);
      }
    },
```

  Resets: `this.playerXp = 0; this.playerLevel = 0;` in `startGame` (next to `deathCount = 0`); NOT reset in `respawnFromChurch` (levels survive death; `Upgrades.levelCount` survives since reset() isn't called there).
- [ ] **Step 6: HUD sliver.** index.html: inside `#hud`, directly under the water-bar element, add `<div id="hud-xp"><div id="hud-xp-fill"></div></div>` and `<span id="hud-lv"></span>` next to it. styles.css: `#hud-xp { height: 3px; background: rgba(255,255,255,0.12); } #hud-xp-fill { height: 100%; background: #ffd23f; width: 0%; } #hud-lv { font-size: 9px; color: #ffd23f; }`. `updateHUD()` (game.js): `document.getElementById("hud-xp-fill").style.width = Math.min(100, 100 * this.playerXp / JH.Balance.xpForLevel(this.playerLevel + 1)) + "%"; document.getElementById("hud-lv").textContent = "LV " + this.playerLevel;` (match the surrounding element-caching style if updateHUD caches lookups).
- [ ] **Step 7: `npm test`** (161) **+ dev smoke** (kill wave 1, watch sliver + a level flash). **Commit** — `feat(levels): xp accrual, instant cycle level-ups, HUD sliver`

---

### Task 4: powerCount v2 — levels + pillar ranks in, mirror out

**Files:**
- Modify: `js/balance.js` (`powerCount`), `js/game.js` (3 callsites already pass repCount/church — extend), `tests/balance.test.js`

**Interfaces:**
- Changes: `Balance.powerCount(owned, repCount, churchState, levelCount)` — adds `levelCount`; the mirror-ranks term becomes pillar ranks (`churchState.pillars`).

- [ ] **Step 1: Failing test:**

```js
test("powerCount v2: nodes + reps + pillar ranks + levels (mirror term gone)", () => {
  const church = { pillars: { water: 3, earth: 1 }, mirror: { water_vigor: { rank: 3 } } };
  assert.strictEqual(Balance.powerCount({ a: 1 }, { ov: 2 }, church, 5), 1 + 2 + 4 + 5);
});
```

- [ ] **Step 2: FAIL** (mirror term counts 3, no level arg). **Implement:** in `powerCount`, replace the `state.mirror` loop with `const p = (churchState && churchState.pillars) || {}; for (const k in p) n += p[k] | 0;` and add `n += (arguments[3] | 0);` — better: add the named 4th param `levelCount` and `n += levelCount | 0;`. Update the Task-1-era mirror test expectation accordingly (it asserted mirror ranks — recalculate to pillars/0).
- [ ] **Step 3: game.js callsites** (spawnWave, wall, holdout — search `JH.Balance.powerCount(`): append `, JH.Upgrades.levelCount` as the 4th arg at ALL of them, including the boss branch in `spawnEnemy`.
- [ ] **Step 4: `npm test`** green. **Commit** — `feat(scaling): enemy ramp sees levels + pillar ranks; mirror term retired`

---

### Task 5: js/benedictions.js — defs, active map, stat folding, offer algorithm

**Files:**
- Create: `js/benedictions.js`  · Modify: `index.html` (script tag after pillars.js)
- Test: Create `tests/benedictions.test.js`

**Interfaces:**
- Produces: `JH.Benedictions` (dual-export): `DEFS` (24 entries: 17 boons `{id, element, name, desc, descII, kind:"boon"}`, 3 duos `{kind:"duo", needs:[el,el]}`, 4 legendaries `{kind:"legendary", element}`), `active: {}` (id → rank 1|2), `reset()`, `rank(id)`, `take(id)` (rank 1 or bump to 2), `applyStats(s)` (folds ONLY the stat-type boons: Bedrock +40/60 HP, Gale dashSpeed ×1.4/1.6, Sure Grip flag `s.noSpraySlow`, Eye/others are runtime), `pickOffers(state, rng) -> [{id, deepen:bool}]` where state = `{active, pillarRanks, usedOnce:{}, censer:bool}`.
- Offer rules (spec §2): 3 slots (4 with censer); distinct elements when possible; weight `1 + 0.5*pillarRank + 0.25*ownedCount(element)`; duo replaces slot at 25% when its two elements each have ≥1 owned boon (once each); legendary (gold) at 15% when element has ≥2 owned boons (once each; duo wins ties); owned boons at rank 1 re-enter as `deepen:true`; rank-2 boons excluded.

- [ ] **Step 1: Failing tests** (require the module directly; construct states; use seeded rng stubs):

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const B = require("../js/benedictions.js");

test("DEFS: 17 boons, 3 duos, 4 legendaries; ids unique", () => {
  const boons = B.DEFS.filter((d) => d.kind === "boon");
  assert.strictEqual(boons.length, 17);
  assert.strictEqual(B.DEFS.filter((d) => d.kind === "duo").length, 3);
  assert.strictEqual(B.DEFS.filter((d) => d.kind === "legendary").length, 4);
  assert.strictEqual(new Set(B.DEFS.map((d) => d.id)).size, B.DEFS.length);
});

test("pickOffers: 3 offers, distinct elements when possible, no rank-2 repeats", () => {
  const state = { active: {}, pillarRanks: {}, usedOnce: {}, censer: false };
  const offers = B.pickOffers(state, () => 0.9);   // high rolls: no duo/legendary
  assert.strictEqual(offers.length, 3);
  const els = offers.map((o) => B.byId(o.id).element);
  assert.strictEqual(new Set(els).size, 3);
});

test("pickOffers: owned rank-1 boons can return as deepen; rank-2 never return", () => {
  const state = { active: { baptize: 2, overflow: 1 }, pillarRanks: {}, usedOnce: {}, censer: false };
  for (let i = 0; i < 40; i++) {
    const offers = B.pickOffers(state, Math.random);
    assert.ok(!offers.some((o) => o.id === "baptize"));
    for (const o of offers) if (o.id === "overflow") assert.strictEqual(o.deepen, true);
  }
});

test("legendary appears only with >= 2 boons of its element and only once", () => {
  const state = { active: { baptize: 1, overflow: 1 }, pillarRanks: {}, usedOnce: {}, censer: false };
  let seen = false;
  for (let i = 0; i < 200 && !seen; i++)
    seen = B.pickOffers(state, Math.random).some((o) => B.byId(o.id).kind === "legendary" && B.byId(o.id).element === "water");
  assert.ok(seen, "water legendary eventually offered");
  state.usedOnce.pressure_sermon = true;
  for (let i = 0; i < 100; i++)
    assert.ok(!B.pickOffers(state, Math.random).some((o) => o.id === "pressure_sermon"));
});

test("applyStats folds stat boons only", () => {
  B.reset(); B.take("bedrock"); B.take("gale_stride");
  const s = { maxHp: 100, dashSpeed: 240 };
  B.applyStats(s);
  assert.strictEqual(s.maxHp, 140);
  assert.ok(Math.abs(s.dashSpeed - 336) < 1e-9);
  B.take("bedrock");                                  // deepen to rank 2
  const s2 = { maxHp: 100, dashSpeed: 240 };
  B.applyStats(s2);
  assert.strictEqual(s2.maxHp, 160);
  B.reset();
});
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement.** IIFE dual-export. DEFS ids/elements (spec tables verbatim — desc strings from the spec's effect column, descII from the (II:) clauses):
  water: `split_stream, baptismal_wake, overflow, baptize, absolution`; fire: `scalding_faith, backdraft, trial_by_fire, ash_walk`; earth: `aftershock, sure_grip, bedrock, landslide`; air: `gale_stride, slipstream, tailwind, eye_of_storm`; duos: `steam_sermon(needs water+fire), mudslide(water+earth), firestorm(fire+air)`; legendaries: `pressure_sermon(water), bushfire(fire), standing_stone(earth), whirlwind_walk(air)`.
  Core methods:

```js
  const Benedictions = {
    DEFS, active: {},
    byId(id) { return DEFS.find((d) => d.id === id); },
    rank(id) { return this.active[id] | 0; },
    reset() { this.active = {}; },
    take(id) { this.active[id] = Math.min(2, (this.active[id] | 0) + 1); return this.active[id]; },
    ownedOf(element) {
      return Object.keys(this.active).filter((id) => { const d = this.byId(id); return d && d.kind === "boon" && d.element === element; }).length;
    },
    // Stat-type boons fold into computeStats; rule boons hook at runtime.
    applyStats(s) {
      const r = (id) => this.active[id] | 0;
      if (r("bedrock"))     s.maxHp += r("bedrock") >= 2 ? 60 : 40;
      if (r("gale_stride")) s.dashSpeed *= r("gale_stride") >= 2 ? 1.6 : 1.4;
      if (r("sure_grip")) { s.noSpraySlow = true; if (r("sure_grip") >= 2) s.knockback *= 1.1; }
      return s;
    },
    pickOffers(state, rng) { /* weighted element draw, distinct-els, duo 25% / legendary 15% slot replacement with usedOnce, deepen for rank-1 owned; returns [{id, deepen}] */ },
  };
```

  `pickOffers` implementation requirements (write it fully): build candidate list per element = unowned boons + rank-1 owned (deepen); element weights as specced (pillarRanks arg supplies favor); draw slots (3 or 4 with censer) preferring distinct elements, falling back to repeats only when fewer eligible elements than slots; then duo check (each duo: both `needs` elements have ≥1 owned boon, not in usedOnce → 25% roll replaces slot 3), else legendary check (per element with ≥2 owned, not usedOnce → 15% roll). The caller marks `usedOnce` when TAKEN, and also marks offered-but-skipped duos/legendaries NOT used (they can re-roll).
- [ ] **Step 4: Wire `applyStats` into `Upgrades.computeStats`** — after the Pillars fold (Task 17 adds that; for now after the Mirror block): `if (JH.Benedictions) JH.Benedictions.applyStats(s);`. Add `dashSpeed` note: it's already in JH.PLAYER (240).
- [ ] **Step 5: `npm test`** — ~166. **Commit** — `feat(benedictions): defs, active map, stat folding, offer algorithm`

---

### Task 6: Sigil beats — spawn, walk-up pick, death wash, HUD strip

**Files:**
- Modify: `js/entities.js` (Sigil class), `js/game.js` (spawn at beats, tick, draw, wash), `js/church.js` (death wash hook is game-side — none here), tests append (entities)

**Interfaces:**
- Produces: `JH.Sigil(x, y, offer)` — walk-up entity: `offer = {id, deepen}`; `game.sigils = []`; picking calls `JH.Benedictions.take(id)`, marks `usedOnce` for duo/legendary, refreshes player stats, plays juice; other sigils despawn on pick or on next `startWave`.
- Beat trigger: in `waveCleared_`, same condition as the essence cross (`boss || garden || wall || holdout || douse` — note the cross condition currently excludes `boss`; sigils include it).

- [ ] **Step 1: Failing test:**

```js
test("sigil pick: takes the boon, refreshes stats, clears the beat", () => {
  global.window.JH.Benedictions.reset();
  const g = makeThinkGame(60, 40);
  g.sigils = [new JH.Sigil(60, 40, { id: "bedrock", deepen: false }),
              new JH.Sigil(120, 40, { id: "overflow", deepen: false })];
  const hpBefore = g.player.stats.maxHp;
  g.sigils[0].pick(g);
  assert.strictEqual(global.window.JH.Benedictions.rank("bedrock"), 1);
  assert.ok(g.player.stats.maxHp > hpBefore, "stat boon applied immediately");
  assert.ok(g.sigils.every((s) => s.dead), "picking one clears the offer");
  global.window.JH.Benedictions.reset();
});
```

  (Test boot: add `require("../js/pillars.js"); require("../js/benedictions.js");` to the entities test header after balance, and `makeThinkGame` gains `sigils: []`.)
- [ ] **Step 2: FAIL.** **Step 3: Implement.**
  - `Sigil` class (entities.js, near Pickup): element-colored floating glyph (diamond + element letter, procedural — no art), bob like the cross, `update(dt, game)`: if player within 16px AND `game.input.pressed("confirm")`-equivalent — follow the Church station interact pattern: game-side tick checks proximity + E (see `tickRangeStations` game.js:831 for the exact input call), so Sigil itself exposes `pick(game)`:

```js
  class Sigil {
    constructor(x, y, offer) {
      this.x = x; this.y = y; this.z = 0; this.offer = offer;
      this.t = 0; this.dead = false;
      const d = JH.Benedictions.byId(offer.id);
      this.element = d.element || (d.needs && d.needs[0]) || "water";
      this.kind = d.kind;
    }
    update(dt) { this.t += dt; return !this.dead; }
    pick(game) {
      const d = JH.Benedictions.byId(this.offer.id);
      JH.Benedictions.take(this.offer.id);
      if (d.kind === "duo" || d.kind === "legendary") game.beneUsedOnce[this.offer.id] = true;
      const p = game.player;
      p.applyStats(JH.Upgrades.computeStats(JH.Upgrades.owned));
      if (p.beneRank("eye_of_storm")) p.stormT = p.beneRank("eye_of_storm") >= 2 ? 1.5 : 1;
      game.audio.play("upgrade", { pitch: 0.9 });
      JH.burst(game, this.x, this.y, 14, SIGIL_COLORS[this.element], 18, { speed: 100, life: 0.6, up: 80, size: 2 });
      game.banner(d.name.toUpperCase() + (this.offer.deepen ? " II" : ""), 1.4);
      for (const s of game.sigils) s.dead = true;
    }
    draw(ctx, cam) { /* bobbing diamond glyph in SIGIL_COLORS[this.element], gold ring when kind==="legendary", dual-tint for duo, "II" tag when offer.deepen; name label when player within 24px */ }
  }
  const SIGIL_COLORS = { water: "#6cd3ff", fire: "#ff8030", earth: "#c8a050", air: "#bfe8ff" };
  JH.Sigil = Sigil;
```

    Write the full draw body (bob = `Math.sin(t*2)*3`, 10px diamond via rotated fillRect, label via 6px monospace) — keep it procedural.
  - `Player.beneRank = function (id) { return JH.Benedictions ? JH.Benedictions.rank(id) : 0; }` (prototype helper, entities.js) and `this.stormT = 0;` in the constructor.
  - game.js: `this.sigils = []; this.beneUsedOnce = {};` in startGame (+ `respawnFromChurch` clears `sigils` only — usedOnce survives death, benedictions don't: also call `JH.Benedictions.reset()` in `respawnFromChurch` AND `startGame`, followed by the applyStats refresh in respawn (it already refreshes). In `waveCleared_` next to the cross-drop block:

```js
      if (clearedWave && (clearedWave.boss || clearedWave.garden || clearedWave.wall || clearedWave.holdout || clearedWave.douse)) {
        const offers = JH.Benedictions.pickOffers({
          active: JH.Benedictions.active,
          pillarRanks: (JH.Church && JH.Church.state.pillars) || {},
          usedOnce: this.beneUsedOnce,
          censer: !!this.relics && !!this.relics.censer,
        }, Math.random);
        this.sigils = offers.map((o, i) =>
          new JH.Sigil(this.player.x + 60 + i * 46, JH.DEPTH_MAX - 20 - i * 14, o));
      }
```

    In `startWave` first lines: `this.sigils = [];` (walk-on skip). In the update loop: tick sigils + proximity/E pick (pattern-match `tickRangeStations`); in the draw world pass: draw sigils with the pickups.
  - Sigil HUD strip: in `drawStatPanel`-adjacent area OR standalone `drawSigilStrip(ctx)` called near `drawCombo`: one 8px glyph per active benediction (bright pip when rank 2), row under the top-left HUD. Stat panel: add active benediction names under the stat rows (6px, element color).
- [ ] **Step 4: `npm test` + dev smoke** (dev-jump BOSS, kill with K, sigils appear, E picks, banner). **Commit** — `feat(benedictions): sigil beats, walk-up pick, death wash, HUD strip`

---

### Task 7: Water boons runtime — Split Stream, Overflow, Baptize, Wake, Absolution

**Files:** `js/entities.js` (doSpray + dash + SlowZone variant), `js/game.js` (Absolution in waveCleared_), tests append

**Interfaces:** consumes `player.beneRank(id)`. SlowZone gains `opts = {vsEnemies:true, slowMult, dmgAmp}` mode (enemy-slowing puddle; Task 14's class currently slows the player).

- [ ] **Step 1: Failing tests:**

```js
test("Baptize: wet enemies take amplified spray damage", () => { /* construct player+enemy via makeThinkGame, set e.wetness=0.5, take('baptize'), call doSpray-driving harness OR unit-test the multiplier helper */ });
```

  Practical shape: extract a pure helper `Balance.beneDmgMult({overflowRank, baptizeRank, trialRank}, {waterFrac, wet, burning})` returning the combined multiplier, test THAT exhaustively (6 cases), and have doSpray call it. This keeps the doSpray edit to two lines and the math fully tested.
- [ ] **Step 2: Implement.**
  - `Balance.beneDmgMult(ranks, target)`:

```js
    beneDmgMult(ranks, t) {
      let m = 1;
      if (ranks.overflow && t.waterFrac >= (ranks.overflow >= 2 ? 0.7 : 0.8)) m *= ranks.overflow >= 2 ? 1.3 : 1.2;
      if (ranks.baptize && t.wet > 0.3) m *= ranks.baptize >= 2 ? 1.25 : 1.15;
      if (ranks.trial && t.burning) m *= ranks.trial >= 2 ? 1.3 : 1.2;
      return m;
    },
```

  - doSpray damage line (entities.js ~534, `const pressureMult = ...`): after it add

```js
        const beneMult = JH.Balance.beneDmgMult({
          overflow: this.beneRank("overflow"), baptize: this.beneRank("baptize"),
          trial: this.beneRank("trial_by_fire"),
        }, {
          waterFrac: this.water / S.maxWater, wet: e.wetness || 0,
          burning: (e.scaldT || 0) > 0 || enemyInFire(game, e),
        });
```

    and multiply it into the damage expression. `enemyInFire(game, e)` module helper: any live patch whose footprint contains (e.x, e.y). (`scaldT` arrives in Task 8 — `(e.scaldT || 0)` is safe now.)
  - Split Stream boon: the existing `if (S.splitStream && hitEnemies.length > 0)` block — change the gate to `const ssRank = this.beneRank("split_stream"); if (ssRank && hitEnemies.length > 0)`, arc damage `0.30` → `0.50`, and the inner per-primary loop limits secondaries to `ssRank >= 2 ? 3 : 1` targets (closest first — sort by distance). `S.splitStream` flag and its setter are gone after Task 15 retires the node; remove the flag from config PLAYER block in that task, not here.
  - Baptismal Wake: in the dash-start block (entities.js ~308, where `dashBoostTimer` is armed — the dash INITIATION site): if `beneRank("baptismal_wake")`, push `new JH.SlowZone(this.x, this.y, 16, 3, { vsEnemies: true, slowMult: 0.7, dmgAmp: rank2 ? 1.1 : 1 })` into `game.slowZones`. SlowZone constructor gains the opts tail: `vsEnemies` zones skip the player check and instead set `e.zoneSlow` on enemies inside (enemies gain `zoneSlow = 1` reset+consume in `Enemy.update` movement — mirror the player pattern: reset in game update loop before zones tick); `dmgAmp` is read by `beneDmgMult`? No — keep scope tight: rank II's +10% dmg applies via the zone setting `e.wetness = Math.max(e.wetness, 0.35)` (soaks them — which feeds Baptize naturally). Document that choice in the code comment.
  - Absolution: in `waveCleared_` after the XP grant: `const ab = this.player.beneRank("absolution"); if (ab) { this.player.hp = Math.min(this.player.stats.maxHp, this.player.hp + (ab >= 2 ? 40 : 25)); if (ab >= 2) this.player.clearBurn(); }`.
- [ ] **Step 3: tests green (+beneDmgMult cases), dev smoke, Commit** — `feat(benedictions): water pool runtime hooks`

---

### Task 8: Scald status + Scalding Faith + Trial by Fire

**Files:** `js/entities.js` (Enemy scald fields/tick, doSpray hook), `js/config.js` (JH.SCALD tunables), tests append

**Interfaces:**
- Produces: `Enemy.applyScald(dps, dur)`, fields `scaldT`, `scaldDps`; ticks in `Enemy.update` (damage via `takeDamage(dps*dt, game, 0, 0)` so wetness/kill flow reuse); orange flicker overlay in Enemy.draw while scalded. `JH.SCALD = { dps: 4, dur: 2, dps2: 6, dur2: 3 }`.
- Trial by Fire's multiplier already landed in Task 7 (`beneDmgMult`); this task makes `scaldT` real.

- [ ] **Step 1: Failing tests:**

```js
test("applyScald ticks damage over its duration and expires", () => {
  const g = makeThinkGame(400, 40);
  const m = new JH.Enemy("mook", 100, 40);
  m.applyScald(4, 2);
  const hp0 = m.hp;
  m.update(1, g);
  assert.ok(m.hp < hp0 && m.hp > hp0 - 6, "roughly 4 dmg over 1s");
  m.update(1.5, g);
  assert.strictEqual(m.scaldT, 0);
});

test("Scalding Faith: full-pressure spray applies scald", () => { /* drive via a doSpray harness: player water full (dmgScale 1.2 tier), take('scalding_faith'), one doSpray(dt) frame at an enemy in reach, assert e.scaldT > 0 */ });
```

- [ ] **Step 2: Implement.** Enemy constructor: `this.scaldT = 0; this.scaldDps = 0;`. In `Enemy.update` next to the wetness block:

```js
      if (this.scaldT > 0) {
        this.scaldT = Math.max(0, this.scaldT - dt);
        this.hp -= this.scaldDps * dt;
        if (Math.random() < 6 * dt) burst(game, this.x, this.y, this.bodyH * 0.6, JH.PAL.firePatchHi, 1, { speed: 20, life: 0.3, up: 30, size: 1 });
        if (this.hp <= 0) this.die(game);
      }
```

  `applyScald(dps, dur) { this.scaldDps = Math.max(this.scaldDps, dps); this.scaldT = Math.max(this.scaldT, dur); }` (bosses allowed — it's small). Draw: while `scaldT > 0`, pulse an orange tint ring (reuse the outline-glow pattern used for burn on Jon — one ring, `#ff8030`, alpha 0.4+0.2*sin(t*8)).
  doSpray hook (inside the per-enemy hit block, after damage): `if (this.beneRank("scalding_faith") && dmgScale >= 1.2) e.applyScald(...rank2 ? [JH.SCALD.dps2, JH.SCALD.dur2] : [JH.SCALD.dps, JH.SCALD.dur]);` — also `if (this.stats.baselineScald && dmgScale >= 1.2) e.applyScald(JH.SCALD.dps, JH.SCALD.dur);` (fire pillar capstone, lands free here).
- [ ] **Step 3: green, Commit** — `feat(benedictions): scald status; scalding faith + fire pillar capstone hook`

---

### Task 9: Backdraft + Ash Walk

**Files:** `js/entities.js` (Player dash overlap; FirePatch interplay), tests append

- [ ] **Backdraft:** in `Player.update` while `dashTimer > 0` (the dash movement branch): for each live enemy overlapping (`Geo.bodiesOverlap(this, e)`), if not already tagged this dash (`this._dashTouched` Set cleared at dash start), `e.applyScald(4, 2)`; rank II also `e.takeDamage(8, game, this.facing, 60)`. Create/clear `this._dashTouched = new Set()` at dash initiation.
- [ ] **Ash Walk:** Player constructor `this.douseCdT = 0;` (decay in update). In `FirePatch.update`'s inside-branch: before the burn attempt, `const aw = pl.beneRank("ash_walk");` — (a) immunity: `if (aw && pl.burnStacks === 0) {} else if (inside && this.patchBurnT <= 0) {...existing applyBurn...}` (first stack while unburned is ignored); (b) douse: `if (aw && pl.douseCdT <= 0 && inside) { this.sprayProgress = this.extinguishDur; pl.douseCdT = aw >= 2 ? 6 : 10; steam pop: damage enemies within f.rx for 6 via takeDamage + white burst; }`. Friendly patches (Task 12) skip all of this via their own flag.
- [ ] **Tests:** ash-walk douse sets patch dead + cd set + second patch within cd NOT doused; backdraft harness: dash through enemy → scaldT > 0. **Commit** — `feat(benedictions): backdraft dash-scald; ash walk immunity + cooldown douse`

---

### Task 10: Earth boons — Aftershock, Landslide (Sure Grip/Bedrock landed via applyStats in Task 5)

**Files:** `js/entities.js`, `js/config.js` (JH.PLAYER `noSpraySlow` consumed), tests append

- [ ] **Sure Grip consumption:** find the spray movement-slow factor in `Player.update` (search `0.55` near the spraying-movement code); gate it: `if (!S.noSpraySlow) speed *= 0.55;` (match the actual variable names at the site).
- [ ] **Aftershock:** in `Enemy.update`, the containment clamp (`this.x = clamp(this.x, game.bounds.minX, game.bounds.maxX);`):

```js
      const preClamp = this.x;
      this.x = clamp(this.x, game.bounds.minX, game.bounds.maxX);
      // Wall slam: a knocked enemy stopped by the arena edge takes crunch
      // damage (Aftershock benediction) and staggers (Earth pillar III).
      if (this.x !== preClamp && Math.abs(this.knockVX || 0) > 60 && this.slamCdT <= 0) {
        this.slamCdT = 0.5;
        const asr = game.player.beneRank ? game.player.beneRank("aftershock") : 0;
        if (asr) {
          this.takeDamage(asr >= 2 ? 25 : 15, game, 0, 0);
          game.shake(3); game.audio.play("whack");
          if (asr >= 2) for (const o of game.enemies)
            if (o !== this && !o.dead && Math.hypot(o.x - this.x, o.y - this.y) < 30) o.takeDamage(8, game, 0, 0);
        }
        if (game.player.stats.wallSlamStagger) { this.windTimer = 0; this.state = "idle"; this.cdTimer = Math.max(this.cdTimer, 0.6); }
      }
```

  (`slamCdT` init 0 in constructor, decay in update; check `knockVX` is the real field name in `Entity.basePhysics` and adapt.) Debris rubble collisions are out of scope (arena walls only, v1).
- [ ] **Landslide:** in `Entity.basePhysics` knockback movement (or Enemy.update post-physics): while `Math.abs(knockVX) > 60`, overlapping OTHER enemies take `8` (rank II `14` + the stagger line above) with a 0.3s per-victim tag (`e._lsCdT`). Gate on `game.player.beneRank("landslide")` — basePhysics has no game ref; do it in `Enemy.update` after basePhysics, before think.
- [ ] **Tests:** aftershock — knock a mook into `bounds.maxX` with knockVX 200 → hp drops; landslide — two overlapping mooks, one knocked → other damaged. **Commit** — `feat(benedictions): earth pool — wall slams, landslide, sure grip consumption`

---

### Task 11: Air boons — Slipstream, Tailwind, Eye of the Storm (Gale landed in Task 5)

**Files:** `js/entities.js`, `js/game.js` (stormT on wave start), tests append

- [ ] **Slipstream:** Player `this.freeSprayT = 0;` — set at dash END (where `dashTimer` crosses 0: search the dash-expiry branch) to `beneRank >= 2 ? 0.8 : 0.5`; decay in update. doSpray drain line (`this.water = Math.max(0, this.water - S.waterDrain * dt)`) gains `&& this.freeSprayT <= 0` alongside the concerta check.
- [ ] **Tailwind:** in the walk-speed computation (same site as zoneSlow): `if (this.beneRank("tailwind")) speed *= 1 + Math.min(this.beneRank("tailwind") >= 2 ? 0.30 : 0.20, 0.02 * (game.combo || 0));` — Player.update receives `game`; confirm and use the real combo field.
- [ ] **Eye of the Storm:** `stormT` set on sigil pick (done, Task 6) AND in `startWave` (game.js): `if (this.player.beneRank("eye_of_storm")) this.player.stormT = this.player.beneRank("eye_of_storm") >= 2 ? 1.5 : 1;`. In `Player.takeHit`, before the dodge roll: `if (this.stormT > 0) { dodge-burst visual; return; }`. Rank II: while stormT > 0, walk speed ×1.15 (same speed site). Decay stormT in update.
- [ ] **Tests:** takeHit no-ops while stormT>0; freeSprayT skips drain (call doSpray via harness, water unchanged). **Commit** — `feat(benedictions): air pool — slipstream, tailwind, eye of the storm`

---

### Task 12: Duos — Steam Sermon, Mudslide, Firestorm

**Files:** `js/entities.js` (doSpray patch block, SlowZone, FirePatch friendly flag), tests append

- [ ] **Steam Sermon:** in doSpray's fire-patch extinguish block (`fp.sprayProgress += dt`): `if (this.beneRank("steam_sermon")) for (const e of game.enemies) if (!e.dead && Geo.inGroundEllipse(e.x, e.y, fp.x, fp.y, fp.footprint().rx + 6)) e.takeDamage(12 * dt, game, 0, 0);` + white steam particles over the patch.
- [ ] **Mudslide:** in `SlowZone.update` vsEnemies branch: enemies inside with `|knockVX| > 60` get `knockVX *= 1 + 2.5*dt` (drag amplification while crossing — approximates "dragged the full length") and their zoneSlow lingers (`e._mudT = 0.8` slow after leaving; consume in Enemy movement). Gate on `game.player.beneRank("mudslide")`.
- [ ] **Firestorm:** FirePatch constructor gains `friendly` flag (skip ALL player-facing logic when set: no burn, no sizzle, no ash-walk; instead damage enemies inside at 8/s via takeDamage). Dash movement (same site as Backdraft): every 24px of dash travel spawn `JH.spawnFirePatch(game, x, y, 12, 1.0)` — extend `spawnFirePatch(game, x, y, r, dur, opts)` to pass `{friendly:true}` through (dedupe rule unchanged). Gate `beneRank("firestorm")`.
- [ ] **Tests:** friendly patch damages an enemy standing in it and never applies burn to the player standing in it; steam sermon damages an enemy over a sprayed patch. **Commit** — `feat(benedictions): duo boons`

---

### Task 13: Legendaries — Pressure Sermon, Bushfire, Standing Stone, Whirlwind Walk

**Files:** `js/entities.js`, tests append

- [ ] **Pressure Sermon:** Player tracks `sprayHeldT` already. On spray RELEASE (the frame `spraying` goes false after being true — find where sprayHeldT resets; add the check there): if `beneRank("pressure_sermon") && this.sprayHeldT >= 0.8 && lastDmgScale >= 1.2 && this.water >= 10`: `this.water -= 10;` cone: enemies within 70px in a ±0.6 rad arc of facing take 15 + knockback 200; big splash burst + `blast` sfx. Track `this.lastDmgScale` in doSpray.
- [ ] **Bushfire:** in `Enemy.applyScald`, after setting fields: `if (!fromSpread && game player has bushfire)` — applyScald has no game ref; instead do the spread in the scald TICK (Enemy.update): once per scald application (`this._spreadDone` flag cleared when scaldT hits 0): scald enemies within 40px at the same dps/dur with `_spreadDone` pre-set (depth-1 contagion, no chains).
- [ ] **Standing Stone:** Player `this.stillT` — increments when no movement input and not dashing, else 0. While `stillT >= 0.5 && beneRank("standing_stone")`: `takeHit` knockback line skipped (`applyKnockback` no-op — guard inside takeHit), doSpray damage ×1.25 and `S.sprayWidth`+4 effective (apply in doSpray locals, not stats), gold dust particles at feet. Any movement clears.
- [ ] **Whirlwind Walk:** during `dashTimer > 0`: embers array sweep — any projectile (`Ember`, `JH.Fireball`, `SmeltBomb`, rocks — anything in `game.embers` with x/y and a `dmg`-ish role; test `typeof e.update === "function"` and proximity < 14) is marked `dead = true` with a white poof; non-boss enemies overlapped get knocked (`applyKnockback(this.facing, 140)`) + 15 dmg once per dash (reuse `_dashTouched`). Guard: skip `FxBurst`/`ShieldLob`? ShieldLob counts as a projectile — destroying it is FINE (counterplay). FxBursts are visual — skip anything with `isFx` flag; add `this.isFx = true` to FxBurst.
- [ ] **Tests:** standing stone: takeHit while still → no knockback applied + damage still taken; bushfire: two mooks 30px apart, scald one, update → both scalded; whirlwind: dashing player near a live Ember kills it. **Commit** — `feat(benedictions): four legendaries`

---

### Task 14: Shop restructure — signatures, node retirement, vendor cadence

**Files:** `js/upgrades.js`, `js/config.js` (PLAYER cleanup), `js/game.js` (vendor cadence + shop rows), tests update

- [ ] **upgrades.js NODES** becomes exactly 3 signatures (old ids retired — savefile compat is moot):

```js
  const NODES = [
    { id: "sig_dash", branch: "SIGNATURE", tier: 1, req: [], cost: 160,
      name: "Hydro-Dash", desc: "-0.2s dash cd. Dash boosts speed +28 for 3s and leaves a slick.",
      apply: (s) => { s.dashCd = Math.max(0.2, s.dashCd - 0.2); s.dashPuddle = true; s.dashBoost = 28; s.dashBoostDur = 3; } },
    { id: "sig_marshal", branch: "SIGNATURE", tier: 1, req: [], cost: 200,
      name: "Fire-Marshal Spec", desc: "+30 range, +30 knockback. Blow 'em back.",
      apply: (s) => { s.sprayRange += 30; s.knockback += 30; } },
    { id: "sig_lance", branch: "SIGNATURE", tier: 3, req: [], cost: 220,
      name: "Hydro Lance", desc: "+18 dmg. A cutting beam that pierces the whole line.",
      apply: (s) => { s.sprayDamage += 18; s.beam = 3; s.knockback += 20; } },
  ];
```

  (tier 3 on Lance reuses the existing Act-2 gate untouched.) REPEATABLES → only `ov_dmg`, and its cost uses a new `Balance.repeatableCost(base, n, factor)` optional-factor param (default 1.5; pass 1.8 from `repCost`). `BRANCHES = ["SIGNATURE"]`. Remove `splitStream` from JH.PLAYER and delete the `S.splitStream` reference remaining in doSpray (Task 7 already rerouted the block to beneRank). Fix/replace the vt3/tier-gate/computeStats tests that referenced retired ids (rewrite them against `sig_lance` for the act gate; drop the vamp-5% node test — vampiricRate now comes only from pillars/boons? NO — vt3 is retired; delete the test and the `vampiricRate` node references; `vampiricRate` stat stays (fire pillar/relic-free, base 0).
- [ ] **Vendor cadence** (game.js `waveCleared_`, the `if (this.waveIndex >= 1) { this.shopNpc = new JH.ShopNPC(...)` block): add `this.clearsSinceVendor = (this.clearsSinceVendor || 0) + 1;` and spawn only when `this.clearsSinceVendor >= 3 || (clearedWave && clearedWave.boss)`, resetting the counter on spawn. Init 2 in `startGame` (first vendor after the 1st clear? spec: every 3rd — init to 1 so the first vendor lands after wave 2, matching today's earliest). `respawnFromChurch` leaves the counter as-is.
- [ ] **Tests:** signature defs present, retired ids gone, `repCost` uses 1.8 (assert `ov_dmg` second buy = round(60*1.8)). Suite green after test rewrites.
- [ ] **Dev smoke:** vendor appears wave 2, then not again until wave 5. **Commit** — `feat(shop): three signatures, node retirement, every-3rd-wave vendor`

---

### Task 15: Relics — data, rotation, purchase, effect hooks

**Files:** `js/config.js` (JH.RELICS), `js/balance.js` (pickRelics), `js/game.js` (ownership, rotation per visit, shop rows, hooks), `js/entities.js` (Pickup magnet/dowsing, spigot buff), tests append

**Interfaces:** `game.relics = {}` (id → true, survives death, reset at startGame); `game.relicStock = [ids]` rolled when the vendor spawns; `Balance.pickRelics(poolIds, ownedMap, n, rng) -> ids`.

- [ ] **JH.RELICS** (10 defs `{id, name, cost, desc}` — effects are hook-checks on `game.relics`, not apply fns): brass_nozzle 180, spigot_key 150, loaded_sponge 160, prayer_bead 220, collection_plate 300, censer 250, sunday_suit 260, punch_card 200, dowsing_rod 150, alarm_bell 180 *(costs tunable)*.
- [ ] **`Balance.pickRelics`** — filter owned, shuffle via rng, take n (test: never returns owned, returns ≤ n, deterministic under seeded rng).
- [ ] **Rotation + rows:** roll `this.relicStock = JH.Balance.pickRelics(JH.RELICS.map(r=>r.id), this.relics, 3, Math.random)` at vendor spawn. `shopSelectables()` adds `{kind:"relic", id}` rows; purchase path (the confirm handler, game.js ~1224 region) handles `kind === "relic"`: cost check (× punch_card 0.8), `this.relics[id] = true`, remove from stock. `drawHoverShop` renders a RELICS section (name/desc/cost rows, match existing row style).
- [ ] **Hooks** (each 1-3 lines at named sites):
  - brass_nozzle: doSpray non-pierce blocker selection — when relic owned, hit the blocker AND the next-closest enemy in arc (collect two in the blocker scan).
  - spigot_key: hydrant refill trigger site (search `JH.HYDRANT.range` in game.js): set `player.spigotT = 15`; decay in Player.update; doSpray dmg ×1.1 while > 0.
  - loaded_sponge: `comboWaterRefund` use site ×2.
  - prayer_bead: boss enrage flip — in `Boss.think` (and Switch/GK/Quake/Slayer thinks) enrage is computed per-frame; add once-latch `if (enraged && !this._enrageLatched) { this._enrageLatched = true; if (game.relics && game.relics.prayer_bead) game.player.pressureBuffT = Math.max(game.player.pressureBuffT, 4); }` in the SHARED base `Boss.think` + each overridden think that computes `enraged` (grep `enrageAt`).
  - collection_plate: suds pickup collect (+2 per kill — simplest: `onEnemyKilled` grants `p.suds += 2` when owned).
  - censer: already consumed by `pickOffers` (Task 6 passes it).
  - sunday_suit: `Church.markBossDefeated` call site in game.js — grant +1 extra essence when owned.
  - punch_card: all three purchase paths (node/rep/consumable/relic) multiply cost by 0.8 (round) — centralize: `game.priceOf(base)` helper used by the four sites + the draw rows.
  - dowsing_rod: Pickup.update magnet `dist < 30` → `dist < (game.relics && game.relics.dowsing_rod ? 60 : 30)`; water_can value ×1.5 at collect when owned.
  - alarm_bell: Task 16's wave-clear bonus condition drops the `tough` requirement when owned.
- [ ] **Tests:** pickRelics purity; priceOf with/without punch_card; collection_plate via onEnemyKilled stub. **Commit** — `feat(shop): ten relics — rotation, purchase, effect hooks`

---

### Task 16: Drop feel — pity/need wiring, kibble ticks, wave-clear bonus

**Files:** `js/game.js` (dropLoot rewrite, waveCleared_ bonus, dryStreak), `js/entities.js` (kibble green ticks), tests append

- [ ] **dropLoot:** replace the else-branch roll (game.js ~796-802) with:

```js
        JH.spawnSudsCoins(this, e.x, e.y, e.def.suds);
        const p = this.player;
        const kind = JH.Balance.rollDrop(e.def.dropMult, this.dryStreak,
          p.hp / p.stats.maxHp, p.water / p.stats.maxWater, Math.random);
        if (kind === "health")     { this.spawnPickup("health", e.x + 6, e.y, 25); this.dryStreak = 0; }
        else if (kind === "water") { this.spawnPickup("water_can", e.x - 6, e.y, 40); this.dryStreak = 0; }
        else this.dryStreak++;
```

  `this.dryStreak = 0` init in startGame; NOT reset in the infinite/budget branch (streak carries across boss fights — leave the budget branch's own rolls untouched).
- [ ] **Wave-clear bonus** (`waveCleared_`): `if (clearedWave && (clearedWave.tough || (this.relics && this.relics.alarm_bell))) { need-weighted bonus: reuse rollDrop with dryStreak=6 to force an item, spawn at player+20 }`.
- [ ] **Kibble ticks:** in the kibble regen block (entities.js ~275): every 0.5s while healing, push a small floating `+N` green text particle (there's no text-particle system — use the existing `Particle` with a 2px green pixel AND draw the number via a tiny `game.floaters` array `{x,y,t,text}` drawn in the world pass, 6px monospace, rises 10px over 0.8s; cap 20 floaters). Keep it minimal — one new array, tick+draw ~15 lines.
- [ ] **Tests:** dryStreak increments on null rolls and resets on drops (stub rng). **Commit** — `feat(drops): pity + need weighting live, kibble reads, wave-clear bonus`

---

### Task 17: Church pillars — stations, locked silhouettes, spend juice; Mirror retirement

**Files:** `js/church.js` (stations + state + draw + buy path), `js/config.js` (CHURCH.layout.stations → pillar list; remove JH.MIRROR), `js/upgrades.js` (computeStats swaps Mirror→Pillars), delete `js/mirror.js`, delete `tests/mirror.test.js`, `index.html` (remove mirror script), `tests/church.test.js` (update)

- [ ] **State:** `Church.defaults()` (church.js ~90): add `pillars: { water: 0, earth: 0, fire: 0, air: 0 },`; `sanitize` passes it through (ints, clamp 0..3). Keep `mirror` field parsing REMOVED (no saves exist to migrate — persistence parked).
- [ ] **Stations:** `JH.CHURCH.layout.stations` becomes the 4 pillars: `[{ pillar: "water", x: 396 }, { pillar: "earth", x: 470 }, { pillar: "fire", x: 544 }, { pillar: "air", x: 618 }]`. church.js station tick (~310-315): active when near ANY pillar (locked ones show info but E does nothing); buy path: `JH.Pillars.buy(this.state, def)` + save; SHIFT/side-toggle code deleted.
- [ ] **Draw** (~408-440 station render): pillar = tall column (procedural rects in element color), rank pips (0-3), name + desc + cost line when near; LOCKED pillars render dark with the nemesis silhouette (reuse the boss painters at small scale via `Assets.draw(ctx, "quake"/"slayer"..., …, {state:"idle"})` tinted black — draw to position, then overlay `rgba(0,0,0,0.75)` rect clip... simpler: draw the boss sprite with `ctx.globalAlpha=0.35` and a "SEAL BROKEN BY: <NAME>" caption). Keep it modest; the statement is "someone's missing here."
- [ ] **Spend juice:** on successful buy: `audio.play("bell")` (new JH.SFX entry: `bell: { type: "sine", freq: 196, dur: 0.6, gain: 0.16 }`), element-color ring burst at the station, pips animate (stagger fill over 0.4s — a `pipAnimT` on the scene), Father Jon `fatherFacing` toward the station for 1s (the scene already tracks father position/draw — set a facing field if one exists, else skip the head-turn and note it).
- [ ] **computeStats:** replace the `JH.Mirror.apply` block with `if (JH.Pillars && JH.Church && JH.Church.state && JH.PILLARS) JH.Pillars.apply(s, JH.Church.state, JH.PILLARS.defs);`. Delete mirror.js + its script tag + tests/mirror.test.js. Update tests/church.test.js (drop mirror-node cases; add: defaults include pillars; sanitize clamps pillar ranks).
- [ ] **Consumers of capstones:** `pressureFloor` — in doSpray's pressure-tier ladder (entities.js ~400): `else if (frac >= 0.25 || S.pressureFloor) { dmgScale = 1.00; rangeMult = 1.00; }` (floor at mid tier); `burnTakenMult` — in the burn tick damage application (Player.tickBurn): multiply; `dashIframeBonus` — dash i-frame check is `dashTimer > 0` in takeHit: extend with a post-dash grace `this.dashGraceT = S.dashIframeBonus` set at dash end, takeHit also no-ops while > 0. `wallSlamStagger`/`baselineScald` already consumed (Tasks 10/8).
- [ ] **Tests + dev smoke** (die → church → pump water pillar → banked stats visible on respawn via stat panel). **Commit** — `feat(church): four element pillars replace the Mirror; spend beat juice`

---

### Task 18: HUD polish + death wash end-to-end

**Files:** `js/game.js`, `js/entities.js`, tests append

- [ ] Verify/complete: sigil strip draws (Task 6), stat panel LV row + benediction names, XP sliver updates, floaters capped.
- [ ] **Death wash e2e test:**

```js
test("death wash: benedictions clear, levels/signatures survive respawn refresh", () => {
  JH.Upgrades.reset(); JH.Benedictions.reset();
  JH.Upgrades.owned = { sig_marshal: true };
  JH.Upgrades.levelCount = 4;
  JH.Benedictions.take("bedrock");
  const before = JH.Upgrades.computeStats(JH.Upgrades.owned);
  JH.Benedictions.reset();                             // what respawnFromChurch does
  const after = JH.Upgrades.computeStats(JH.Upgrades.owned);
  assert.strictEqual(before.maxHp - after.maxHp, 40);  // bedrock gone
  assert.ok(after.sprayRange > JH.PLAYER.sprayRange);  // signature survived
  JH.Upgrades.reset(); JH.Benedictions.reset();
});
```

  Confirm `respawnFromChurch` calls `JH.Benedictions.reset()` BEFORE its `applyStats` refresh (Task 6 added it — verify order) and clears `sigils`.
- [ ] `npm test` full green. **Commit** — `test(progression): death-wash e2e + HUD completeness`

---

### Task 19: Verification + compound-playtest handoff (NO release)

- [ ] `npm test` (expect ~185+), `npm run build`.
- [ ] Headless sweep (playwright-core in the scratchpad, dev server :5173, `window.JH.Game`): (1) kill wave-1 mooks → `playerLevel >= 1`, XP fill moved; (2) dev-jump BOSS, `K` → sigils array populated, screenshot; (3) evaluate a sigil pick → `Benedictions.active` non-empty, HUD strip visible in screenshot; (4) vendor cadence: clear waves 1-2 → shopNpc present, relicStock length 3; (5) no console/page errors.
- [ ] Push `progression-pass`.
- [ ] STOP at the **compound playtest gate**: v0.26.0 (curve) + boss art + v0.27.0 tune together; super-elite numbers finalize here per the spec's sequencing note. Release ritual afterward, two merges in order (v0.26.0 first, then v0.27.0).

---

## Self-review notes (applied)

- Split Stream's flag rides `beneRank`, not stats — the stat-flag `splitStream` and its node retire together (Task 14) after Task 7 rewires the block; between those tasks both paths coexist harmlessly (flag is never set).
- `beneDmgMult` centralizes all three percent-amps so stacking order is one tested function, not three scattered multiplies.
- Scald ticks route through raw `hp -=` + `die()` (not `takeDamage`) to avoid knockback/wetness side-effects from a DoT; Bushfire spreads depth-1 via `_spreadDone`.
- Mirror deletion is confined to Task 17 so every earlier task runs with the suite green.
- Test-count expectations are approximate floors; the binding requirement is "green with the task's new tests present."

---

### Task 20: Floaters + essence pickup-only (EXECUTE AFTER TASK 3 — gates Tasks 6/15/17 semantics)

**Files:** `js/game.js` (floater pool, essence conversions), `js/entities.js` (Pickup.collect floater), `js/church.js` (markBossDefeated stops adding essence), tests append

**Interfaces:**
- Produces: `game.float(x, y, text, color)` — pooled world-space floating text (rises ~22px over 0.9s, fades; cap 20 oldest-dropped; drawn in the world pass after pickups, 6px monospace centered). Consumed by Tasks 6 (sigil picks), 16 (kibble ticks), 17 (pillar buys).
- RULE (user, plan TODO §1): **Essence enters `Church.state.essence` only via collection of a spawned cross (player pickup or end-of-context sweep at win/respawn).**

- [ ] Floater pool: `this.floaters = []` init in startGame + respawnFromChurch; `float(x,y,text,color)` pushes `{x,y,t:0,text,color}`; tick+cull in update; draw with `alpha = 1 - t/0.9`, rise `-22*t/0.9`.
- [ ] Cross collect (entities.js `Pickup.collect` cross branch): `game.float(pl.x, pl.y - 30, "+" + (this.value || 1) + " HOLY ESSENCE", "#ffd23f");`
- [ ] Boss essence → cross: `Church.markBossDefeated` (church.js ~170) loses its `essence +=` line (keeps shrine lighting + save). `onEnemyKilled` boss branch (game.js ~776): after markBossDefeated, `this.spawnPickup("cross", e.x, e.y, 1);`. (World-dim now fires on boss kills — intended.)
- [ ] Pity → cross: `startPlayerDeathSeq` first-death block drops the `addEssence(1)` call, keeps `pendingPity` (sermon line), sets `this.pendingPityCross = true;`. `respawnFromChurch` after player placement: `if (this.pendingPityCross) { this.spawnPickup("cross", p.x + 34, p.y, 1); this.pendingPityCross = false; }`
- [ ] Level-up floaters (grantXp, after the burst): `"LEVEL UP"` gold at p.y-34 + one green floater per stat in `JH.LEVELS.cycle[(this.playerLevel - 1) % 6]` (key→label map: sprayDamage "SPRAY DMG", maxWater "MAX WATER", maxHp "MAX HP", sprayRange "RANGE", waterRegen "REGEN"), stacked 8px apart.
- [ ] Shop purchase floaters: where `U.buy`/`U.buyRep` succeed in the confirm handler, `this.float(player.x, player.y - 30, node name, "#80ff80")`.
- [ ] Tests: float cap 20 + age cull (stub game); adjust the curve-pass pity expectation if any test asserts direct addEssence on death.
- [ ] Suite green. **Commit** — `feat(essence): pickup-only essence — boss + pity crosses; world floating text`

### Task 21: Icon atlas (EXECUTE AFTER TASK 17, BEFORE TASK 18)

**Files:** Create `tools/icon-sprites.mjs`, `sprites/icons/*.png`; modify `js/config.js` (JH.ICONS), `js/assets.js` (`Assets.icon` helper), swap sites in game.js (HUD strip, stat panel, shop rows), church.js (essence readout, pillar icons), entities.js (sigil glyphs)

- [ ] Baker (`tools/icon-sprites.mjs`, enemy-sprites pipeline: 2px/logical grid, 2x save = 4x logical, outline pass, arg validation like boss-sprites.mjs): 12x12-logical (48px) icons. Keys: stats `dmg, range, water, regen, hp, knockback, speed, dash, dodge, vamp`; elements `el_water, el_fire, el_earth, el_air` (drop/flame/rock/gust); `essence` (cross); relics `brass_nozzle, spigot_key, loaded_sponge, prayer_bead, collection_plate, censer, sunday_suit, punch_card, dowsing_rod, alarm_bell`; frames `frame_duo, frame_legendary`. Boon icons = element icon + 4px corner verb mark (stream/dash/body) — one consistent set, not 24 bespoke drawings (user TODO §2).
- [ ] `JH.ICONS = { size: 12 }` manifest + `Assets.icon(ctx, key, x, y, scale)` (imageSmoothing off; silent no-op while loading — procedural glyphs stay as the fallback at every swap site).
- [ ] Swap: HUD sigil strip + stat panel rows, Sigil entity glyph (element icon + frame overlay), church `✦` readout + pillar station icons, shop relic/signature rows. Icons replace glyphs only; text labels stay.
- [ ] Verify: headless screenshots (shop + sigil beat + church); `git status sprites/` shows only sprites/icons/.
- [ ] Suite green. **Commit** — `art(icons): baked icon atlas replaces glyph placeholders`

**Cross-task amendments (binding):** Task 15's `sunday_suit` relic = the boss cross spawns with `value: 2` when owned (never a direct add); Task 17's pillar-buy juice includes `game.float(station, "+RANK " + …)` via the Task 20 helper; Task 6's sigil pick adds a floater with the boon name.

---

## TODO notes (added 2026-07-05, user)

### 1. Holy Essence is pickup-only + gain-feedback floating text

**Rule: the ONLY way Essence enters `Church.state.essence` during play is by
collecting the cross pickup.** Audit found two sequences that currently hide
the pickup and grant directly — both must be converted to a spawned cross:

- **Boss defeat** — `game.js:776` calls `Church.markBossDefeated`, which adds
  essence directly (`church.js:170`). The wave-clear cross condition at
  `game.js:499` deliberately excludes `boss` because of this. Fix: drop a
  cross on boss defeat instead; `markBossDefeated` keeps only the
  shrine-lighting side, or the cross's collect handler routes through it.
- **First-death pity** — `game.js:1078` calls `addEssence(1)` directly during
  `startPlayerDeathSeq`. Fix: make the pity essence a visible pickup (e.g.
  cross waiting at the church/respawn point), not a silent bank.
- **Task 15 `sunday_suit` relic** (+1 extra essence on boss defeat) must ride
  the same cross-drop path (drop 2 crosses or a `value: 2` cross), never a
  direct add.
- Set-piece waves already do this right (`game.js:500` spawns the cross) —
  that's the pattern.

**Feedback text:** on cross collect, show a **"+1 Holy Essence"**
upward-drifting, fading text at the pickup. No world-space floating-text
helper exists yet (only the DOM `banner`) — add a small pooled floater
(spawn(x, y, text, color), rises ~20px over ~0.9s while fading). Reuse it
for:

- **Level-up moment** (Task 3): "LEVEL UP" plus the granted stat line(s).
- **Stat upgrades bought or picked up**: shop vendor buys, pillar rank buys
  (Task 17), sigil picks (Task 6) — float the stat delta (e.g. "+3 spray
  dmg") at Jon/the station.

### 2. Real icons, not mojibake

Replace unicode-glyph placeholders with proper PNG icons **if findable or
drawable** (sprite-forge / tools bakers; per the canvas-resolution note, size
art for device pixels — ~4x the logical size, so a "10px" HUD icon should be
authored at 40px+):

- Current/planned glyph spots: `✦` essence readout (`church.js:538`),
  Task 6 sigils ("diamond + element letter, procedural"), Task 18 HUD strip
  ("one 8px glyph per active benediction"), stat panel rows.
- Coverage wanted: **each stat** (spray dmg, spray range, hit band, max
  water, water regen/return, max HP, knockback, move speed, dash, dodge,
  lifesteal, …), **each benediction/boon** (incl. duo + legendary variants),
  **the 4 element pillars**, **relics**, **shop stat nodes**, and the
  **essence cross** itself.
- One consistent set > mixed sources; bake to `sprites/icons/` with a
  manifest so HUD/shop/church all pull from the same atlas.
