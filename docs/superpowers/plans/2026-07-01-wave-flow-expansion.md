# Wave-Flow Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flesh out the under-filled acts to an escalating 4-4-5-6-6 encounter curve by adding 8 recombined-archetype fights and 2 new set-pieces, while keeping run income ~flat and making the wave list safely editable.

**Architecture:** The wave list (`JH.LEVEL1.waves`) is the single source of truth; `WAVE_TRIGGERS`, `ACT_STARTS`, and `LEVEL_LEN` are parallel data that must stay in sync with it. Elite-tier logic (`Balance.actLevelForWave`) is refactored to derive from `ACT_STARTS` instead of magic numbers, and the Quake cutscene stops hardcoding wave index 9. Two new set-pieces reuse existing plumbing: **Hold the Line** reuses the Barricade's pool-spawn loop with a survival timer; **Douse the Flames** reuses the Garden's spray-to-fill `GardenBox` objective with a flame variant.

**Tech Stack:** Vanilla JS (browser, IIFE modules under `js/`), `node:test` for pure-logic unit tests (`tests/`), canvas 2D rendering. No build step for the source (`dist/` is a generated copy — do not edit it).

## Global Constraints

- **Source of truth is `js/` only** — never edit `dist/*` (it's a generated copy).
- **`WAVE_TRIGGERS.length` MUST equal `JH.LEVEL1.waves.length`** — a guard at `js/game.js:14` warns otherwise.
- **`ACT_STARTS` entries are ascending wave indices**, one per elite/checkpoint act boundary.
- **Charger spawns are capped at 2 per wave** (`JH.WAVECAP.charger`, enforced by `Balance.capEnemyType`) — don't rely on more than 2 chargers being present.
- **New Act 2/3 fights carry `tough: true`** (elite scaling); **new Fire fights do NOT** (curated, un-`tough`, like existing fire waves).
- **Playtest-before-commit is mandatory** for any gameplay/feel change — code correctness ≠ feel correctness. Scene-glue changes (game.js/config.js) have no unit-test harness; their verification step is a user-confirmed playtest, not an automated assertion.
- **Suds economy target:** total run income stays ~2,150; boss suds untouched; regular-enemy suds trimmed ~40%.
- **Placeholder art is disposable** — keep the new flame draw minimal; don't build a new sprite asset for it.

---

## Reference: final wave layout (29 waves, indices 0–28)

| idx | name | kind | notes |
|-----|------|------|-------|
| 0 | WAVE 1 | fight | existing |
| 1 | WAVE 2 | fight | existing |
| 2 | WAVE 3 | fight | existing |
| 3 | WAVE 4 | fight | existing |
| 4 | BIG DRIP | boss | existing (rework out of scope) |
| 5 | WAVE 5 | fight tough | existing |
| 6 | **STREET SWARM** | fight tough | NEW |
| 7 | BARRICADE | wall tough | existing |
| 8 | **CROSSFIRE** | fight tough | NEW |
| 9 | THE SWITCH | boss | existing (`bossType:"switch"`) |
| 10 | RUBBLE ROW | fight tough | existing |
| 11 | **DEBRIS RUN** | fight tough | NEW |
| 12 | **HOLD THE LINE** | holdout tough | NEW set-piece |
| 13 | **ASH CHARGE** | fight tough | NEW |
| 14 | **LAST STAND** | fight tough | NEW |
| 15 | QUAKE WALKER | boss | existing (`bossType:"quake"`) |
| 16 | THE BULWARK LINE | fight | existing |
| 17 | STALKER AMBUSH | fight | existing |
| 18 | WAVE 6 | fight tough | existing |
| 19 | THE GARDEN | garden | existing |
| 20 | WAVE 7 | fight tough | existing |
| 21 | **OVERRUN** | fight tough | NEW |
| 22 | GATEWAY KRUSHER 9000 | boss | existing (`bossType:"gatewaykrusher"`) |
| 23 | FIRE INTRO | fight | existing |
| 24 | **EMBER RUSH** | fight | NEW |
| 25 | **DOUSE THE FLAMES** | douse | NEW set-piece |
| 26 | FURNACE TRIAL | fight | existing |
| 27 | **MELTDOWN** | fight | NEW |
| 28 | THE SLAYER | boss | existing (`bossType:"slayer"`) |

**New `ACT_STARTS` = `[0, 5, 10, 16, 23]`** (Act1 / Act2 / Act3 / Act4 / Fire).
**New `WAVE_TRIGGERS`** (29 values, ascending, ~370px apart):
`[360, 740, 1120, 1500, 1880, 2260, 2640, 3020, 3400, 3780, 4160, 4540, 4920, 5300, 5680, 6060, 6440, 6820, 7200, 7580, 7960, 8340, 8720, 9100, 9480, 9860, 10240, 10620, 11000]`
**New `LEVEL_LEN` = `11200`.**

---

## Task 1: Refactor `actLevelForWave` to derive from `ACT_STARTS`

Makes elite-tier boundaries data-driven so inserting waves can't silently mis-assign act tiers. Pure refactor — no behavior change while `ACT_STARTS` stays `[0,5,8,10]`.

**Files:**
- Modify: `js/balance.js:11-16` (`actLevelForWave`)
- Modify: `tests/balance.test.js:6-15` (existing test)
- Modify: `js/game.js:345`, `js/game.js:1057` (callers)

**Interfaces:**
- Produces: `actLevelForWave(waveIndex, actStarts) -> number` (−1 for Act 1, then 0,1,2,… per `actStarts` boundary).

- [ ] **Step 1: Update the failing test** — change `tests/balance.test.js:6-15` to pass the `actStarts` array explicitly; expected values are unchanged:

```javascript
test("actLevelForWave maps wave index to elite act tier", () => {
  const AS = [0, 5, 8, 10];
  assert.strictEqual(Balance.actLevelForWave(0, AS), -1);  // Act 1, no elites
  assert.strictEqual(Balance.actLevelForWave(4, AS), -1);  // mid-boss wave
  assert.strictEqual(Balance.actLevelForWave(5, AS), 0);   // first elite wave
  assert.strictEqual(Balance.actLevelForWave(7, AS), 0);   // Act 2
  assert.strictEqual(Balance.actLevelForWave(8, AS), 1);   // Act 3
  assert.strictEqual(Balance.actLevelForWave(9, AS), 1);
  assert.strictEqual(Balance.actLevelForWave(10, AS), 2);  // Act 4
  assert.strictEqual(Balance.actLevelForWave(13, AS), 2);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `node --test tests/balance.test.js`
Expected: FAIL — `actLevelForWave` currently ignores the 2nd arg but still returns correct values via hardcoded branches, EXCEPT the intent is to prove derivation; if it passes here that's fine, proceed to Step 3 to remove the magic numbers. (The real safety net is Task 6's boundary test.)

- [ ] **Step 3: Replace the implementation** in `js/balance.js:11-16`:

```javascript
    // Elite difficulty tier by wave index, derived from act-start markers.
    // Returns -1 for Act 1 (no elites), then 0,1,2,… per crossed boundary.
    actLevelForWave(waveIndex, actStarts) {
      let level = -1;
      for (let i = 0; i < actStarts.length; i++) {
        if (waveIndex >= actStarts[i]) level = i - 1;
      }
      return level;
    },
```

- [ ] **Step 4: Update the two callers** to pass `JH.ACT_STARTS`.

`js/game.js:345`:
```javascript
        const actLevel = JH.Balance.actLevelForWave(this.waveIndex, JH.ACT_STARTS);
```
`js/game.js:1057`:
```javascript
                ? JH.Balance.eliteScale(JH.Balance.actLevelForWave(this.waveIndex, JH.ACT_STARTS), Object.keys(JH.Upgrades.owned).length)
```

- [ ] **Step 5: Run all tests, verify pass**

Run: `node --test tests/`
Expected: PASS (all suites).

- [ ] **Step 6: Commit**

```bash
git add js/balance.js js/game.js tests/balance.test.js
git commit -m "refactor(balance): derive actLevelForWave from ACT_STARTS"
```

---

## Task 2: Make the Quake cutscene index dynamic

Four sites hardcode Quake at wave index 9/10. In the new layout Quake is index 15. Convert to a `findIndex` by `bossType` so the wave list is reorder-safe (mirrors the existing Slayer handling).

**Files:**
- Modify: `js/game.js:145`, `js/game.js:369-375`, `js/game.js:419-431`

**Interfaces:**
- Consumes: `JH.LEVEL1.waves[n].bossType === "quake"` marks the Quake boss wave.

- [ ] **Step 1: Fix `waveCleared_`** (`js/game.js:368-376`) — replace the hardcoded block:

```javascript
      // After Quake Walker, play his ally cutscene before continuing.
      const quakeIdx = JH.LEVEL1.waves.findIndex((w) => w.bossType === "quake");
      if (quakeIdx >= 0 && this.waveIndex === quakeIdx) {
        JH.Camera.unlock();
        this.state = "cutscene";
        this.cutscene = { phase: 0, nextWave: quakeIdx + 1 };
        document.getElementById("hud").classList.add("hidden");
        document.getElementById("banner").classList.add("hidden");
        return;
      }
```

- [ ] **Step 2: Fix `afterCutscene`** (`js/game.js:422`) — replace the hardcoded lookup:

```javascript
      const quakeIdx = JH.LEVEL1.waves.findIndex((w) => w.bossType === "quake");
      const clearedWave = JH.LEVEL1.waves[quakeIdx];
```

- [ ] **Step 3: Fix the dev cutscene trigger** (`js/game.js:145`, inside `devTriggerCutscene`) — replace `nextWave: 10`:

```javascript
      const quakeIdx = JH.LEVEL1.waves.findIndex((w) => w.bossType === "quake");
      this.cutscene = { phase: 0, nextWave: quakeIdx + 1 };
```

- [ ] **Step 4: Run tests** (sanity — no logic tests cover this, but confirm nothing else broke)

Run: `node --test tests/`
Expected: PASS.

- [ ] **Step 5: Verify no stray hardcoded indices remain**

Run: `grep -n "waves\[9\]\|waveIndex === 9\|nextWave: 10" js/game.js`
Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add js/game.js
git commit -m "refactor(waves): dynamic Quake cutscene index via findIndex"
```

Note: full playtest of the Quake cutscene happens in Task 7 (once the new layout exists).

---

## Task 3: "Hold the Line" holdout set-piece mechanic

A survival set-piece: survive a countdown while enemies respawn from a pool. Reuses the Barricade's pool-spawn loop (`wallPool`, `wallSpawnTimer`, `JH.WALL.maxAlive/spawnEvery`) but ends on a timer instead of a destroyed wall. Dormant until Task 6 adds a `holdout` wave.

**Files:**
- Modify: `js/game.js` — `startWave` (after the `wave.wall` branch, ~`js/game.js:335`), the wave-logic update block (`js/game.js:1046-1076`), and the render block (add a countdown readout).
- Modify: `js/game.js:25` (state fields) — add `holdoutTimer`.

**Interfaces:**
- Consumes: a wave shaped `{ name, holdout: true, tough: true, holdDur: <seconds>, spawns: [{type,count}...] }`.
- Produces: `this.holdoutTimer` (seconds remaining, drives the HUD countdown).

- [ ] **Step 1: Add the state field** at `js/game.js:25` (alongside `wall`, `wallSpawnTimer`, `wallPool`):

```javascript
    wall: null, wallSpawnTimer: 0, wallPool: [], holdoutTimer: 0,
```

- [ ] **Step 2: Add the `startWave` setup branch.** Insert immediately AFTER the `} else if (wave.wall) { ... }` block closes (just before `} else if (wave.boss) {` at ~`js/game.js:336`):

```javascript
      } else if (wave.holdout) {
        // Survival hold-out: reuse the barricade's pool-spawn loop, end on a timer.
        this.holdoutTimer = wave.holdDur || 22;
        this.wallSpawnTimer = 0.4;
        this.wallPool = [];
        wave.spawns.forEach((g) => { for (let k = 0; k < g.count; k++) this.wallPool.push(g.type); });
        this.dropBudget = { suds: 14, items: 7 };            // anti-farm cap
        this.banner("HOLD THE LINE!  SURVIVE!", 1.8);
```

- [ ] **Step 3: Add the update branch.** In the wave-logic block, insert a new branch after the `wave.wall` branch and before the `wave.garden` branch (~`js/game.js:1064`):

```javascript
        } else if (wave && wave.holdout) {
          this.holdoutTimer -= dt;
          this.wallSpawnTimer -= dt;
          if (this.wallSpawnTimer <= 0 && this.enemies.length < JH.WALL.maxAlive) {
            this.wallSpawnTimer = JH.WALL.spawnEvery;
            const type = this.wallPool[(Math.random() * this.wallPool.length) | 0] || "mook";
            const ey = JH.DEPTH_MIN + 8 + Math.random() * (JH.DEPTH_MAX - JH.DEPTH_MIN - 16);
            const sc = wave.tough
              ? JH.Balance.eliteScale(JH.Balance.actLevelForWave(this.waveIndex, JH.ACT_STARTS), Object.keys(JH.Upgrades.owned).length)
              : null;
            const ex = this.bounds.maxX - 10 - Math.random() * 40;
            const e = this.spawnEnemy(type, ex, ey, { infinite: true, elite: sc });
            e.spawnGrace = 0.2;
          }
          if (this.holdoutTimer <= 0) {
            // Survived: remaining enemies retreat (removed WITHOUT suds reward — the
            // dropBudget already capped income during the hold).
            for (const e of this.enemies) e.dead = true;
            this.waveCleared_();
          }
```

- [ ] **Step 4: Add the countdown readout.** In `render()`, in the screen-space HUD section (after the world is drawn — locate the existing banner draw and add nearby), insert:

```javascript
      if (this.state === "play" && this.waveActive) {
        const hw = JH.LEVEL1.waves[this.waveIndex];
        if (hw && hw.holdout && this.holdoutTimer > 0) {
          const label = "HOLD  " + Math.ceil(this.holdoutTimer) + "s";
          ctx.save();
          ctx.font = "bold 12px monospace"; ctx.textAlign = "center";
          ctx.fillStyle = "#000"; ctx.fillText(label, JH.VIEW_W / 2 + 1, 25);
          ctx.fillStyle = "#ffd23f"; ctx.fillText(label, JH.VIEW_W / 2, 24);
          ctx.restore();
        }
      }
```

- [ ] **Step 5: Run tests** (confirm no syntax/load regression)

Run: `node --test tests/`
Expected: PASS.

- [ ] **Step 6: Commit** (mechanic only; playtested via a temp wave in Task 6/7)

```bash
git add js/game.js
git commit -m "feat(waves): Hold the Line holdout set-piece mechanic"
```

---

## Task 4: "Douse the Flames" set-piece (GardenBox flame variant)

Reuses the Garden's spray-to-fill objective: 4 flame sources you spray to extinguish while Smelts harass you. Adds a `flame` variant to `GardenBox` (skips the pill/Concerta reward, draws a placeholder flame, retextes the prompt) and generalizes the garden update/clear path to also handle `wave.douse`. Dormant until Task 6 adds a `douse` wave.

**Files:**
- Modify: `js/entities.js` — `GardenBox` constructor (`js/entities.js:2255-2262`), `addGrow` (`js/entities.js:2263-2281`), `draw` (`js/entities.js:2283-2313`).
- Modify: `js/game.js` — `startWave` (add `wave.douse` branch), update block (`js/game.js:1064-1072` generalize garden clear).

**Interfaces:**
- Consumes: a wave shaped `{ name, douse: true, spawns: [{type,count}...] }`; `new JH.GardenBox(x, y, idx, { flame: true })`.
- Produces: flame boxes complete via the same `garden.done` flag the Garden uses.

- [ ] **Step 1: Add the `flame` option to the constructor** (`js/entities.js:2256-2262`):

```javascript
    constructor(x, y, idx, opts) {
      this.x = x; this.y = (y != null) ? y : JH.DEPTH_MAX * 0.5; this.z = 0;
      this.idx = idx || 0;
      this.flame = !!(opts && opts.flame);
      this.grow = 0; this.growMax = JH.GARDEN.growMax;
      this.bodyW = 42; this.dead = false; this.done = false; this.t = 0; this.hitFx = 0;
      this.doneFx = 0;   // countdown that drives the completion pop
    }
```

- [ ] **Step 2: Gate the garden-only rewards** in `addGrow` (`js/entities.js:2273-2279`). Replace the reward block so flame boxes skip the Concerta unlock and the pill drop:

```javascript
        if (!this.flame) {
          // Garden reward: pill + first-box Concerta unlock. Flame boxes give none.
          if (!game.concertaUnlocked) {
            game.concertaUnlocked = true;
            game.banner("CONCERTA UNLOCKED!", 4.0);
          }
          game.spawnPickup("pill", this.x, this.y, 1);
          game.gardensCleared = (game.gardensCleared || 0) + 1;
        }
```

- [ ] **Step 3: Branch the draw for flame** (`js/entities.js:2286-2293`). Replace the `JH.Assets.draw(... "garden_box" ...)` line and growth-bar block with a variant switch (placeholder flame — kept minimal per art rules):

```javascript
      if (this.flame) {
        // Placeholder flame that shrinks as it's doused (gf: 0 = raging, 1 = out).
        const rem = 1 - gf;
        const baseY = sy;
        for (let i = 0; i < 3; i++) {
          const fh = (14 + i * 6) * rem * (0.8 + 0.3 * Math.sin(this.t * 12 + i));
          const fw = (10 - i * 2);
          ctx.fillStyle = i === 0 ? "#ff7a1a" : i === 1 ? "#ffb020" : "#ffe070";
          ctx.beginPath();
          ctx.moveTo(sx - fw, baseY);
          ctx.quadraticCurveTo(sx, baseY - fh * 1.4, sx + fw, baseY);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        JH.Assets.draw(ctx, "garden_box", sx, sy, 1, { growFrac: gf });
      }
      // Progress bar (extinguish progress for flame, growth for garden)
      const w = 44, bx = sx - w / 2, by = sy - 28 - Math.round(gf * 16);
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(bx - 1, by - 1, w + 2, 7);
      ctx.fillStyle = "#1a3a10"; ctx.fillRect(bx, by, w, 5);
      ctx.fillStyle = this.done ? "#55cc44" : (this.hitFx > 0 ? "#aaffaa" : "#3a9a28");
      ctx.fillRect(bx, by, this.done ? w : Math.round(w * gf), 5);
```

- [ ] **Step 4: Retext the floating prompt** for flame (`js/entities.js:2300-2311`). Replace the two `fillText` string pairs so flame boxes read differently:

```javascript
      if (this.done && this.doneFx > 0) {
        const k = this.doneFx / 1.6;                 // 1 → 0
        const ty = by - 6 - (1 - k) * 14;            // rises as it fades
        ctx.globalAlpha = Math.min(1, k * 1.4);
        const doneMsg = this.flame ? "OUT!" : "GREAT!";
        ctx.fillStyle = "#0a2a08"; ctx.fillText(doneMsg, sx + 1, ty + 1);
        ctx.fillStyle = "#7dff5a"; ctx.fillText(doneMsg, sx, ty);
      } else if (!this.done && this.hitFx > 0) {
        const ty = by - 6 + Math.sin(this.t * 6) * 1.5;
        ctx.globalAlpha = 0.92;
        const msg = this.flame ? "Douse it!" : "Keep watering!";
        ctx.fillStyle = "#062033"; ctx.fillText(msg, sx + 1, ty + 1);
        ctx.fillStyle = "#bfefff"; ctx.fillText(msg, sx, ty);
      }
```

- [ ] **Step 5: Add the `startWave` branch** for `wave.douse`. Insert after the `wave.garden` branch closes (~`js/game.js:326`, before `} else if (wave.wall) {`):

```javascript
      } else if (wave.douse) {
        // Fire set-piece: spray 4 flame sources out while Smelts harass you.
        const xs = [left + 70, left + 172, left + 274, left + 370];
        const ys = [JH.DEPTH_MIN + 14, JH.DEPTH_MAX - 14, JH.DEPTH_MIN + 22, JH.DEPTH_MAX - 22];
        this.gardens = xs.map((x, i) => new JH.GardenBox(x, ys[i], i, { flame: true }));
        this.dropBudget = { suds: 0, items: 0 };
        (wave.spawns || [{ type: "smelt", count: 2 }]).forEach((g) => {
          for (let k = 0; k < g.count; k++) {
            const e = this.spawnEnemy(g.type, left + 40 + k * 30, JH.DEPTH_MAX * 0.4);
            e.spawnGrace = 1.0;
          }
        });
        this.banner("DOUSE ALL 4 FLAMES!", 2.8);
```

- [ ] **Step 6: Generalize the garden clear** in the update block (`js/game.js:1064-1072`). Replace `} else if (wave && wave.garden) {` with:

```javascript
        } else if (wave && (wave.garden || wave.douse)) {
          for (const g of this.gardens) g.update(dt);
          if (this.gardens.length > 0 && this.gardens.every((g) => g.done)) {
            // Objective done — harassers leave. Neighbor dies (0 suds); douse
            // harassers are removed WITHOUT reward (dropBudget was 0 anyway).
            for (const e of this.enemies) {
              if (e.dead) continue;
              if (wave.douse) e.dead = true;
              else if (e.type === "neighbor") e.die(this);
            }
            this.waveCleared_();
          }
```

- [ ] **Step 7: Run tests** (GardenBox is loaded via entities.js; confirm no regression)

Run: `node --test tests/`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add js/entities.js js/game.js
git commit -m "feat(waves): Douse the Flames set-piece (GardenBox flame variant)"
```

---

## Task 5: Suds retune — keep run income ~flat

Pure data change. Trim regular-enemy suds ~40% so the doubled fight count holds regular income near ~750; leave boss suds untouched; trim curated elites (Bulwark/Furnace) gently.

**Files:**
- Modify: `js/config.js:133-214` (enemy `suds` values)

**Interfaces:** none (data only).

- [ ] **Step 1: Apply the new suds values** in `JH.ENEMIES`. Exact edits:

| Enemy | line | `suds:` now → new |
|-------|------|-------------------|
| mook | 135 | `8` → `5` |
| charger | 141 | `13` → `8` |
| pyro | 146 | `16` → `10` |
| stalker | 180 | `22` → `13` |
| bulwark | 171 | `60` → `48` |
| smelt | 194 | `20` → `12` |
| fuse | 201 | `12` → `7` |
| furnace | 212 | `55` → `44` |

Leave all boss `suds` (Big Drip 120, Switch 240, Quake, GK 480, Slayer, etc.) unchanged. Leave `dummy`/`neighbor` at 0.

- [ ] **Step 2: Run tests** (no test asserts suds; confirm config still loads)

Run: `node --test tests/`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add js/config.js
git commit -m "balance(economy): trim regular-enemy suds ~40% to hold run income flat"
```

---

## Task 6: Expand the wave list, ACT_STARTS, WAVE_TRIGGERS, LEVEL_LEN, HYDRANTS

Wires everything together: the 10 new wave entries, the parallel data arrays, and a boundary test locking the new act structure. This is the task that makes the new content live.

**Files:**
- Modify: `js/config.js:459-491` (`JH.LEVEL1.waves`), `js/config.js:454` (`ACT_STARTS`), `js/config.js:23` (`LEVEL_LEN`), `js/config.js:30-41` (`HYDRANTS`)
- Modify: `js/game.js:13` (`WAVE_TRIGGERS`)
- Modify: `tests/balance.test.js` (add boundary test)

**Interfaces:**
- Consumes: `holdout`/`douse` wave shapes from Tasks 3 & 4; `bossType` markers from Task 2.

- [ ] **Step 1: Add the boundary test FIRST** (TDD the structural invariant). Append to `tests/balance.test.js`:

```javascript
test("actLevelForWave with expanded ACT_STARTS assigns new act tiers", () => {
  const AS = [0, 5, 10, 16, 23];
  assert.strictEqual(Balance.actLevelForWave(4, AS), -1);   // Act 1
  assert.strictEqual(Balance.actLevelForWave(5, AS), 0);    // Act 2 start
  assert.strictEqual(Balance.actLevelForWave(9, AS), 0);    // Act 2 (Switch)
  assert.strictEqual(Balance.actLevelForWave(10, AS), 1);   // Act 3 start
  assert.strictEqual(Balance.actLevelForWave(15, AS), 1);   // Act 3 (Quake)
  assert.strictEqual(Balance.actLevelForWave(16, AS), 2);   // Act 4 start
  assert.strictEqual(Balance.actLevelForWave(22, AS), 2);   // Act 4 (GK)
  assert.strictEqual(Balance.actLevelForWave(23, AS), 3);   // Fire start
  assert.strictEqual(Balance.actLevelForWave(28, AS), 3);   // Fire (Slayer)
});
```

- [ ] **Step 2: Run it, verify it passes** (Task 1's derivation already supports this)

Run: `node --test tests/balance.test.js`
Expected: PASS (proves the derivation generalizes to 5 acts).

- [ ] **Step 3: Update `ACT_STARTS`** at `js/config.js:454`:

```javascript
  JH.ACT_STARTS = [0, 5, 10, 16, 23];
```

- [ ] **Step 4: Update `LEVEL_LEN`** at `js/config.js:23`:

```javascript
  JH.LEVEL_LEN = 11200;      // world length of level 1 (logical px)
```

- [ ] **Step 5: Extend `HYDRANTS`** (`js/config.js:40`). Add 5 entries after the last (`{ x: 6700, ... }`) so the longer level stays covered ~every 800px:

```javascript
    { x: 6700, y: JH.DEPTH_MAX - 14 },
    { x: 7500, y: JH.DEPTH_MIN + 12 },
    { x: 8300, y: JH.DEPTH_MAX - 12 },
    { x: 9100, y: JH.DEPTH_MIN + 12 },   // fire world
    { x: 9900, y: JH.DEPTH_MAX - 12 },
    { x: 10700, y: JH.DEPTH_MIN + 12 },
  ];
```

- [ ] **Step 6: Replace `JH.LEVEL1.waves`** (`js/config.js:459-491`) with the full 29-wave list. New entries interleaved; existing entries keep their exact shapes:

```javascript
  JH.LEVEL1 = {
    waves: [
      { name: "WAVE 1", spawns: [{ type: "mook", count: 3 }] },
      { name: "WAVE 2", spawns: [{ type: "mook", count: 3 }, { type: "charger", count: 1 }] },
      { name: "WAVE 3", spawns: [{ type: "mook", count: 3 }, { type: "pyro", count: 1 }] },
      { name: "WAVE 4", spawns: [{ type: "mook", count: 2 }, { type: "charger", count: 2 }] },
      { name: "BOSS", boss: true },                          // mid-boss: The Big Drip
      // ---- Act 2: ELITE ----
      { name: "WAVE 5", tough: true, spawns: [{ type: "pyro", count: 2 }, { type: "charger", count: 2 }] },
      { name: "STREET SWARM", tough: true, spawns: [{ type: "mook", count: 4 }, { type: "charger", count: 1 }] },
      { name: "BARRICADE", wall: true, tough: true, wallHp: 360,
        spawns: [{ type: "mook", count: 2 }, { type: "charger", count: 1 }] },
      { name: "CROSSFIRE", tough: true, spawns: [{ type: "pyro", count: 2 }, { type: "mook", count: 2 }] },
      { name: "THE SWITCH", boss: true, bossType: "switch" },
      // ---- Act 3: the ruined district ----
      { name: "RUBBLE ROW", tough: true, spawns: [{ type: "charger", count: 2 }, { type: "pyro", count: 1 }, { type: "mook", count: 2 }] },
      { name: "DEBRIS RUN", tough: true, spawns: [{ type: "charger", count: 2 }, { type: "mook", count: 2 }] },
      { name: "HOLD THE LINE", holdout: true, tough: true, holdDur: 22,
        spawns: [{ type: "mook", count: 2 }, { type: "pyro", count: 1 }, { type: "charger", count: 1 }] },
      { name: "ASH CHARGE", tough: true, spawns: [{ type: "charger", count: 2 }, { type: "pyro", count: 1 }] },
      { name: "LAST STAND", tough: true, spawns: [{ type: "pyro", count: 2 }, { type: "mook", count: 2 }, { type: "charger", count: 1 }] },
      { name: "QUAKE WALKER", boss: true, bossType: "quake" },
      // ---- Act 4: the aftermath ----
      { name: "THE BULWARK LINE", spawns: [{ type: "bulwark", count: 1 }, { type: "mook", count: 2 }] },
      { name: "STALKER AMBUSH", spawns: [{ type: "stalker", count: 2 }, { type: "charger", count: 1 }] },
      { name: "WAVE 6", tough: true, spawns: [{ type: "mook", count: 3 }, { type: "pyro", count: 1 }, { type: "charger", count: 1 }] },
      { name: "THE GARDEN", garden: true },
      { name: "WAVE 7", tough: true, spawns: [{ type: "charger", count: 2 }, { type: "pyro", count: 2 }, { type: "mook", count: 1 }] },
      { name: "OVERRUN", tough: true, spawns: [{ type: "mook", count: 3 }, { type: "charger", count: 1 }, { type: "pyro", count: 1 }] },
      { name: "GATEWAY KRUSHER 9000", boss: true, bossType: "gatewaykrusher" },
      // ---- Fire World (curated, un-tough) ----
      { name: "FIRE INTRO", spawns: [{ type: "fuse", count: 3 }, { type: "smelt", count: 1 }] },
      { name: "EMBER RUSH", spawns: [{ type: "fuse", count: 3 }, { type: "smelt", count: 1 }] },
      { name: "DOUSE THE FLAMES", douse: true, spawns: [{ type: "smelt", count: 2 }] },
      { name: "FURNACE TRIAL", spawns: [{ type: "furnace", count: 1 }, { type: "fuse", count: 2 }] },
      { name: "MELTDOWN", spawns: [{ type: "smelt", count: 1 }, { type: "fuse", count: 3 }] },
      { name: "THE SLAYER", boss: true, bossType: "slayer" },
    ],
  };
```

- [ ] **Step 7: Replace `WAVE_TRIGGERS`** at `js/game.js:13`:

```javascript
  const WAVE_TRIGGERS = [360, 740, 1120, 1500, 1880, 2260, 2640, 3020, 3400, 3780, 4160, 4540, 4920, 5300, 5680, 6060, 6440, 6820, 7200, 7580, 7960, 8340, 8720, 9100, 9480, 9860, 10240, 10620, 11000];
```

- [ ] **Step 8: Verify the length guard is satisfied**

Run: `node -e "global.window={}; require('./js/config.js'); const w=global.window.JH.LEVEL1.waves.length; const t=29; console.log('waves',w,'triggers',t); if(w!==t) process.exit(1);"`
Expected: `waves 29 triggers 29` and exit 0. (Confirms `WAVE_TRIGGERS.length === waves.length` before loading in-browser.)

- [ ] **Step 9: Run all tests**

Run: `node --test tests/`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add js/config.js js/game.js tests/balance.test.js
git commit -m "feat(waves): expand to 29-wave 4-4-5-6-6 curve + retuned triggers/hydrants"
```

---

## Task 7: Full-run integration playtest

The gameplay-verification gate. No code unless the playtest surfaces a defect (then fix inline and re-verify before committing). This task is NOT complete until the user confirms feel.

**Files:** none (verification only, unless fixes needed).

- [ ] **Step 1: Launch the game** (use the `/run` skill or the project's normal serve flow, then open `index.html`).

- [ ] **Step 2: Verify each new/changed encounter** via the dev wave-jump menu:
  - Act 2: STREET SWARM (6) and CROSSFIRE (8) play as elite fights; Switch still triggers at 9.
  - Act 3: DEBRIS RUN (11), **HOLD THE LINE (12)** — countdown shows, enemies respawn, wave ends when timer hits 0 and remaining enemies vanish with no coin dump; ASH CHARGE (13), LAST STAND (14); **Quake cutscene fires correctly** (Task 2) and hands off to Bulwark Line.
  - Act 4: OVERRUN (21) plays; GK triggers at 22.
  - Fire: EMBER RUSH (24), **DOUSE THE FLAMES (25)** — 4 flames, spraying extinguishes them, Smelts harass, wave clears when all 4 are out (no pill/Concerta banner); MELTDOWN (27); **Slayer cutscene** still fires.

- [ ] **Step 3: Verify economy** — play a continuous run (or spot-check) and confirm end-of-run `sudsEarned` lands roughly in the ~2,150 range (HUD/summary shows banked suds), i.e. the added waves didn't balloon income.

- [ ] **Step 4: Verify traversal** — hydrants appear across the extended level (no long dry stretch in Acts 4/Fire); camera/bounds reach the Slayer at x≈11000 without the player getting stuck.

- [ ] **Step 5: Get explicit user sign-off** on feel (pacing per act, the two set-pieces, difficulty). If anything feels off (timer length, spawn density, suds), tune the relevant data (`holdDur`, `spawns` counts, `suds`, `WAVE_TRIGGERS` spacing) and re-verify.

- [ ] **Step 6: Final commit** (only if Step 5 required tuning fixes):

```bash
git add -A
git commit -m "balance(waves): playtest tuning for wave-flow expansion"
```

---

## Self-review notes

- **Spec coverage:** escalating 4-4-5-6-6 curve (Task 6 table) ✓; recombine + 2 set-pieces (Tasks 3,4,6) ✓; income ~flat (Task 5) ✓; no new archetypes ✓; make indices dynamic — `actLevelForWave` (Task 1) + Quake cutscene (Task 2) + `WAVE_TRIGGERS`/`LEVEL_LEN` (Task 6) ✓; `tough` on Act2/3 fights, un-`tough` Fire fights ✓; Big Drip untouched ✓.
- **Naming consistency:** `holdout`/`holdDur`/`holdoutTimer`, `douse`, `flame`, `ACT_STARTS`, `actLevelForWave(waveIndex, actStarts)` used identically across tasks.
- **Testability honesty:** only `balance.js` logic is unit-tested (Tasks 1, 6); all scene/data changes are gated by the mandatory playtest (Task 7), per the project's playtest-before-commit rule.
- **HYDRANTS extension** (Task 6, Step 5) is beyond the spec's Section 4 list but is a necessary consequence of `LEVEL_LEN` growing — without it the back half of the run has no water top-ups.
