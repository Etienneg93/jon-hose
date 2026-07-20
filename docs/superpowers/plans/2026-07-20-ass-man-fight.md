# Ass Man Fight (wave 36) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the wave-36 three-phase Ass Man boss duel (spec: `docs/superpowers/specs/2026-07-20-ass-man-fight-design.md`) plus the leaderboard comparator/payload, with pure gameplay bookend stubs.

**Architecture:** One `AssManBoss` class (Boss subclass, `think()` state machine, house pattern) driven entirely by a new `JH.ASSMAN` config block; pure geometry/phase/comparator helpers dual-exported from `js/balance.js`; one new projectile class (`ToiletBomb`); draw via `Assets.register("assman", …)` with baked pose PNGs + procedural fallback (Switch/GK chassis precedent).

**Tech Stack:** Vanilla JS IIFE modules on `window.JH`; `node --test` suite; Python/Pillow bake tool (repo pattern established 2026-07-20).

## Global Constraints

- **Every number lives in `js/config.js` under `JH.ASSMAN`** — no other file hardcodes a gameplay constant; tests derive from config, never repeat literals.
- **Rim is hitbox:** every damaging shape (clap cone, toss landing ellipse, shard zone, clap-back lane, slam ellipse, storm rings) uses ONE shape function for telegraph, draw, and hit test.
- **Phase moves gate on hp fraction, never timers** (gates `[0.66, 0.33]`).
- **No adds, no stink clouds in the arena.** No jump, no melee — never suggest them.
- **Kneel, never death:** at 0 HP no corpse/explosion VFX (`survivesDefeat` gate, covers Slayer retroactively).
- Ground-ellipse depth flatten: cone uses `JH.GROUND_RY` (0.40); rings use 0.34 (pulse-ring precedent).
- Bookend stubs only: banner → spawn; kneel → beat → existing victory flow. NO cutscenes, NO K-9 relic (on ice).
- All work stays on branch `air-act`; commit per task; never touch main.

**Model assignments (SDD dispatch):** Task 1, 2, 8 → `haiku` (transcription). Task 3, 4, 6, 7 → `sonnet`. Task 5 → `sonnet` implementer + **`opus` reviewer** (phase-machine interleaving). Final whole-branch review: session model (Fable).

---

### Task 1: Config block, wave wiring, boss skeleton

**Files:**
- Modify: `js/config.js` (after `JH.SLAYER`, ~line 970)
- Modify: `js/config.js` air wave table (after FOUL WEATHER, ~line 1277)
- Modify: `js/game.js:43` (`WAVE_TRIGGERS`), `js/game.js:768` (boss def dispatch)
- Modify: `js/entities.js:6864` region (`makeEnemy`), new class stub after `SlayerBoss`
- Test: `tests/assman.test.js` (new file)

**Interfaces:**
- Produces: `JH.ASSMAN` (def), `AssManBoss` class reachable via `JH.makeEnemy("assman", x, y)`, `JH.AssManBoss` export, wave 36 `{ name: "BOSS", boss: true, bossType: "assman" }`.
- Later tasks fill `AssManBoss.think`; this task ships a skeleton that walks and does contact damage only.

- [ ] **Step 1: Write the failing tests**

```js
// tests/assman.test.js
const { test } = require("node:test");
const assert = require("node:assert");
global.window = globalThis;
require("../js/config.js");
window.JH.Loader = { img: () => ({}) };
require("../js/world.js");
require("../js/upgrades.js");
require("../js/entities.js");
const JH = global.window.JH;

test("assman: def exists with phase gates and full move tables", () => {
  const D = JH.ASSMAN;
  assert.ok(D && D.hp > JH.SLAYER.hp, "hardest boss yet: hp above Slayer");
  assert.deepStrictEqual(D.gates, [0.66, 0.33]);
  for (const k of ["clap", "hip", "toss", "clapback", "slam", "storm", "exhaust"])
    assert.ok(D[k], "move table " + k);
});

test("assman: wave 36 exists, routes bossType assman, triggers stay in sync", () => {
  const waves = JH.LEVEL1.waves;
  const last = waves[waves.length - 1];
  assert.strictEqual(last.boss, true);
  assert.strictEqual(last.bossType, "assman");
});

test("assman: makeEnemy builds the boss with isBoss and def wiring", () => {
  const b = JH.makeEnemy("assman", 100, 40);
  assert.ok(b instanceof JH.AssManBoss);
  assert.strictEqual(b.isBoss, true);
  assert.strictEqual(b.maxHp, JH.ASSMAN.hp);
  assert.strictEqual(b.phase, 1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/assman.test.js`
Expected: FAIL (`JH.ASSMAN` undefined).

- [ ] **Step 3: Add the config block** (js/config.js, after the `JH.SLAYER` block)

```js
  // ---- Ass Man (wave 36) — first multi-phase boss ----
  // Spec: docs/superpowers/specs/2026-07-20-ass-man-fight-design.md
  JH.ASSMAN = {
    name: "Ass Man", hp: 2200, speed: 40, bodyW: 34, bodyH: 58,
    touchDmg: 12, contactCd: 1.0, suds: 400, color: "boss",
    enrageAt: 0.33,             // phase-3 entry latches enrage (prayer_bead hook)
    survivesDefeat: true,       // kneels at 0 HP — no corpse/explosion VFX
    gates: [0.66, 0.33],        // phase gates on hp FRACTION (never timers)
    transitionInvuln: 1.6,      // s invulnerable during each phase beat
    decideEvery: 2.2,           // s between phase-1 move picks
    clap:     { wind: 0.9, range: 95, halfAngleDeg: 38, dmg: 22, shove: 260 },
    hip:      { brace: 0.7, speed: 300, dist: 200, dmg: 16, skid: 0.8 },
    toss:     { landRx: 30, dmg: 20, shardDur: 2.5, shardDmg: 6, shardEvery: 0.5,
                lobSpeed: 240, gravity: 520 },
    clapback: { every: 1.8, dmg: 14, band: 12, waveSpeed: 260 },
    slam:     { pause: 0.8, rx: 44, dmg: 26, shove: 300, recovery: 2.6, fallSpeed: 420,
                airZ: 46, shadowEvery: 2.0 },
    gustEveryLoops: 2, gustDur: 6,
    storm:    { rings: 3, ringSpeed: 90, ringDmg: 12, gapDeg: 55, gapRotDeg: 40,
                ringEvery: 1.4, rimW: 7, burstGap: 0.6 },
    exhaust:  { dur: 4, dmgTakenMult: 1.25 },
    kneelBeat: 1.5,
    barks: { p2: "THE CHEEKS HAVE CLAPPED BACK.", p3: "GLUTE FORCE TRAUMA." },
  };
```

- [ ] **Step 4: Add wave 36** (js/config.js, immediately after the FOUL WEATHER wave object; move the "last wave wins" comment down to it)

```js
      { name: "BOSS", boss: true, bossType: "assman" },      // wave 36: Ass Man
```

- [ ] **Step 5: Wire game.js.** In `WAVE_TRIGGERS` (game.js:43) append `14120` (ends `…, 13360, 13740, 14120]` — still < `JH.LEVEL_LEN` 14300). In the boss def dispatch (game.js:768) add the arm:

```js
  const bdef = bt === "switch" ? JH.SWITCH : bt === "quake" ? JH.QUAKE : bt === "gatewaykrusher" ? JH.GATEWAYKRUSHER : bt === "wallboss" ? JH.WALLBOSS : bt === "slayer" ? JH.SLAYER : bt === "assman" ? JH.ASSMAN : JH.BOSS;
```

- [ ] **Step 6: Skeleton class** (js/entities.js, after `SlayerBoss`; export + makeEnemy case)

```js
  // ---- Ass Man (wave 36): three-phase duel. Phases fill in over the ----
  // ---- fight-plan tasks; this skeleton walks + contact only.        ----
  class AssManBoss extends Boss {
    constructor(x, y) {
      super(x, y, Object.assign({}, JH.ASSMAN), "assman");   // instance def copy: kneel/air zero touchDmg safely
      this.phase = 1;
      this._invulnT = 0;
      this._decideT = JH.ASSMAN.decideEvery;
      this._grounded = true;
      this._kneeling = false;
    }
    think(dt, game) {
      const pl = game.player, d = this.def;
      if (this.strikeFx > 0) this.strikeFx -= dt;
      if (this._invulnT > 0) this._invulnT -= dt;
      // chase (skeleton)
      const dx = pl.x - this.x, dy = pl.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 30) {
        this.x += (dx / dist) * d.speed * dt;
        this.y += (dy / dist) * d.speed * dt;
        this.facing = dx >= 0 ? 1 : -1;
        this.state = "walk";
      } else this.state = "idle";
    }
  }
  JH.AssManBoss = AssManBoss;
```

In `makeEnemy` add: `if (type === "assman") return new AssManBoss(x, y);`

- [ ] **Step 7: Run the new tests + full suite**

Run: `node --test tests/assman.test.js` → PASS (3). Then `npm test` → all pass (baseline 430 + 3).
Note: an existing test may assert the wave count or that FOUL WEATHER is last — if one fails, update it to derive from `JH.LEVEL1.waves.length` / `bossType === "assman"`, not literals.

- [ ] **Step 8: Commit**

```bash
git add js/config.js js/game.js js/entities.js tests/assman.test.js
git commit -m "feat(assman): config block, wave 36 wiring, boss skeleton"
```

---

### Task 2: Pure helpers — cone, ring gap, phase, comparator

**Files:**
- Modify: `js/balance.js` (inside the `Balance` object; dual-export already in place)
- Test: `tests/assman.test.js` (append)

**Interfaces:**
- Produces (all on `JH.Balance`):
  - `assmanPhase(hpFrac, gates) -> 1|2|3`
  - `coneHits(px, py, bx, by, facing, range, halfAngleDeg, ry) -> bool`
  - `ringGapHits(px, py, cx, cy, r, rimW, gapCenterDeg, gapWidthDeg, ry) -> bool` (true = HIT; inside the gap = safe)
  - `semverCmp(a, b) -> -1|0|1`, `lbCompare(a, b) -> number` (sort comparator: newer version first, waves desc, time asc)

- [ ] **Step 1: Write the failing tests** (append to tests/assman.test.js; add `require("../js/balance.js")` after config in the header if not already loaded)

```js
test("assman helpers: phase gating from hp fraction", () => {
  const B = JH.Balance, G = JH.ASSMAN.gates;
  assert.strictEqual(B.assmanPhase(1.0, G), 1);
  assert.strictEqual(B.assmanPhase(G[0] + 0.001, G), 1);
  assert.strictEqual(B.assmanPhase(G[0], G), 2);
  assert.strictEqual(B.assmanPhase(G[1], G), 3);
  assert.strictEqual(B.assmanPhase(0, G), 3);
});

test("assman helpers: cone membership — rim is hitbox", () => {
  const B = JH.Balance, C = JH.ASSMAN.clap;
  // dead ahead inside range: hit
  assert.ok(B.coneHits(100 + C.range - 1, 40, 100, 40, 1, C.range, C.halfAngleDeg, JH.GROUND_RY));
  // behind: miss
  assert.ok(!B.coneHits(60, 40, 100, 40, 1, C.range, C.halfAngleDeg, JH.GROUND_RY));
  // beyond range: miss
  assert.ok(!B.coneHits(100 + C.range + 2, 40, 100, 40, 1, C.range, C.halfAngleDeg, JH.GROUND_RY));
  // just inside the angular edge (depth axis divided by ry): hit; just outside: miss
  const rad = (C.halfAngleDeg - 1) * Math.PI / 180;
  const dx = Math.cos(rad) * C.range * 0.9, dy = Math.sin(rad) * C.range * 0.9 * JH.GROUND_RY;
  assert.ok(B.coneHits(100 + dx, 40 + dy, 100, 40, 1, C.range, C.halfAngleDeg, JH.GROUND_RY));
  const rad2 = (C.halfAngleDeg + 2) * Math.PI / 180;
  const dx2 = Math.cos(rad2) * C.range * 0.9, dy2 = Math.sin(rad2) * C.range * 0.9 * JH.GROUND_RY;
  assert.ok(!B.coneHits(100 + dx2, 40 + dy2, 100, 40, 1, C.range, C.halfAngleDeg, JH.GROUND_RY));
});

test("assman helpers: ring rim hits except inside the rotating gap", () => {
  const B = JH.Balance, S = JH.ASSMAN.storm;
  const r = 80;
  // on the rim, opposite the gap: hit
  assert.ok(B.ringGapHits(200 + r, 40, 200, 40, r, S.rimW, 180, S.gapDeg, 0.34));
  // on the rim, at gap center (gap at 0°): safe
  assert.ok(!B.ringGapHits(200 + r, 40, 200, 40, r, S.rimW, 0, S.gapDeg, 0.34));
  // inside the ring, not on the rim: no hit
  assert.ok(!B.ringGapHits(200 + r * 0.5, 40, 200, 40, r, S.rimW, 180, S.gapDeg, 0.34));
  // angle wraparound: gap centered at 350°, point at +5° is inside the gap
  assert.ok(!B.ringGapHits(200 + r * Math.cos(5 * Math.PI / 180), 40 + r * Math.sin(5 * Math.PI / 180) * 0.34, 200, 40, r, S.rimW, 350, S.gapDeg, 0.34));
});

test("assman helpers: leaderboard comparator — version, waves, time", () => {
  const B = JH.Balance;
  const mk = (v, w, t) => ({ gameVersion: v, wavesCleared: w, timeSec: t });
  // newer version outranks regardless of waves/time
  assert.ok(B.lbCompare(mk("0.32.0", 10, 999), mk("0.31.9", 36, 100)) < 0);
  // same version: more waves outranks
  assert.ok(B.lbCompare(mk("0.32.0", 36, 999), mk("0.32.0", 29, 100)) < 0);
  // same version + waves: faster time outranks
  assert.ok(B.lbCompare(mk("0.32.0", 36, 100), mk("0.32.0", 36, 200)) < 0);
  // missing fields sort last, never throw
  assert.ok(B.lbCompare(mk("0.32.0", 36, 100), {}) < 0);
});
```

- [ ] **Step 2: Run to verify failure** — `node --test tests/assman.test.js` → new tests FAIL (`assmanPhase` undefined).

- [ ] **Step 3: Implement** (js/balance.js, inside the `Balance` object literal, near `actLevelForWave`)

```js
    // ---- Ass Man fight helpers (pure; spec 2026-07-20) ----
    // Phase from hp fraction: 1 above gates[0], 2 in (gates[1], gates[0]], 3 at/below gates[1].
    assmanPhase(hpFrac, gates) {
      if (hpFrac <= gates[1]) return 3;
      if (hpFrac <= gates[0]) return 2;
      return 1;
    },
    // Ground-plane cone from (bx,by) facing ±1: depth axis divided by ry so the
    // drawn flattened cone and the hit test share one shape.
    coneHits(px, py, bx, by, facing, range, halfAngleDeg, ry) {
      const dx = (px - bx) * facing, dy = (py - by) / (ry || 0.4);
      if (dx <= 0) return false;
      if (Math.hypot(dx, dy) > range) return false;
      return Math.abs(Math.atan2(dy, dx)) <= halfAngleDeg * Math.PI / 180;
    },
    // Expanding ring rim (elliptical, depth/ry): hit iff on the rim band AND
    // outside the safe gap. Angles in degrees, atan2 space (-180..180 wraps).
    ringGapHits(px, py, cx, cy, r, rimW, gapCenterDeg, gapWidthDeg, ry) {
      const dx = px - cx, dy = (py - cy) / (ry || 0.34);
      if (Math.abs(Math.hypot(dx, dy) - r) > rimW) return false;
      const a = Math.atan2(dy, dx) * 180 / Math.PI;
      const delta = ((a - gapCenterDeg) % 360 + 540) % 360 - 180;
      return Math.abs(delta) > gapWidthDeg / 2;
    },
    semverCmp(a, b) {
      const pa = String(a || "0").split(".").map(Number), pb = String(b || "0").split(".").map(Number);
      for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d < 0 ? -1 : 1; }
      return 0;
    },
    // Leaderboard sort: newer game version first, then waves cleared desc,
    // then time asc. Array.prototype.sort comparator shape.
    lbCompare(a, b) {
      const v = Balance.semverCmp((b || {}).gameVersion, (a || {}).gameVersion);
      if (v) return v;
      const w = ((b || {}).wavesCleared || 0) - ((a || {}).wavesCleared || 0);
      if (w) return w;
      return (((a || {}).timeSec != null ? a.timeSec : 1e9)) - (((b || {}).timeSec != null ? b.timeSec : 1e9));
    },
```

- [ ] **Step 4: Run tests** — `node --test tests/assman.test.js` → PASS. `npm test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add js/balance.js tests/assman.test.js
git commit -m "feat(assman): pure helpers — cone, ring gap, phase gate, lb comparator"
```

---

### Task 3: Phase 1 — decision cadence, Cheek Clap, Hip Check

**Files:**
- Modify: `js/entities.js` (`AssManBoss` from Task 1)
- Test: `tests/assman.test.js` (append; uses `makeThinkGame` — copy the helper from `tests/entities.test.js:586` into assman.test.js verbatim, with its `makePlayer` dependency, or `require` pattern used there)

**Interfaces:**
- Consumes: `JH.Balance.coneHits`, `JH.Balance.assmanPhase` (Task 2).
- Produces on the instance: `this.move` (`null | {kind:"clap"|"hip"|"toss", t, …}`), `this._coneLock {x,y,facing}` while a clap resolves, `this._skidT`. States used: `"walk" | "idle" | "clapwind" | "clap" | "hipbrace" | "hipdash" | "skid" | "toss"`. Task 5 replaces the phase-1-only `think` entry with the full phase router — keep phase-1 logic in a method `thinkP1(dt, game, pl, d)` so the router calls it.

- [ ] **Step 1: Failing tests**

```js
test("assman P1: cheek clap — telegraph then cone hit, shape shared", () => {
  const g = makeThinkGame(140, 40);              // player close, dead ahead
  const b = JH.makeEnemy("assman", 100, 40);
  g.enemies = [b];
  const C = JH.ASSMAN.clap;
  b._decideT = 0;                                // force a decision now
  b.think(1 / 60, g);
  assert.strictEqual(b.state, "clapwind", "close range picks the clap");
  const hp0 = g.player.hp;
  // run out the windup; the release frame applies cone damage once
  for (let t = 0; t < C.wind + 0.1; t += 1 / 60) b.think(1 / 60, g);
  assert.strictEqual(g.player.hp, hp0 - C.dmg, "cone caught the player once");
  // same fight, player parked outside the cone angle: no damage
  const g2 = makeThinkGame(100, 120);            // deep off-axis
  const b2 = JH.makeEnemy("assman", 100, 40);
  b2._decideT = 0; b2._forceMove = "clap";       // test hook (see Step 3)
  b2.think(1 / 60, g2);
  const hp2 = g2.player.hp;
  for (let t = 0; t < C.wind + 0.1; t += 1 / 60) b2.think(1 / 60, g2);
  assert.strictEqual(g2.player.hp, hp2, "outside the cone: telegraph = hit shape");
});

test("assman P1: hip check — dash with punishable skid on whiff", () => {
  const g = makeThinkGame(360, 40);              // far: picks hip or toss; force hip
  const b = JH.makeEnemy("assman", 100, 40);
  b._decideT = 0; b._forceMove = "hip";
  b.think(1 / 60, g);
  assert.strictEqual(b.state, "hipbrace");
  const H = JH.ASSMAN.hip;
  for (let t = 0; t < H.brace + 0.05; t += 1 / 60) b.think(1 / 60, g);
  assert.strictEqual(b.state, "hipdash");
  const x0 = b.x;
  g.player.x = 2000;                             // guarantee a whiff
  for (let t = 0; t < H.dist / H.speed + 0.1; t += 1 / 60) b.think(1 / 60, g);
  assert.ok(b.x > x0 + H.dist * 0.8, "dashed forward");
  assert.strictEqual(b.state, "skid", "whiff ends in the skid window");
  assert.ok(b._skidT > 0 && b._skidT <= H.skid);
});
```

- [ ] **Step 2: Run to verify failure** — states stay `"walk"`.

- [ ] **Step 3: Implement phase 1** — replace the skeleton `think` with a router + `thinkP1`:

```js
    think(dt, game) {
      const pl = game.player, d = this.def;
      if (this.strikeFx > 0) this.strikeFx -= dt;
      if (this._invulnT > 0) this._invulnT -= dt;
      // Prayer Bead: first enrage flip (phase-3 gate) grants the pressure buff.
      const enraged = this.hp / this.maxHp < d.enrageAt;
      if (enraged && !this._enrageLatched) {
        this._enrageLatched = true;
        if (game.relics && game.relics.prayer_bead) JH.Balance.prayerBeadProc(game.player, JH.RELIC_TUNE);
      }
      this.thinkP1(dt, game, pl, d);
    }

    // ---- Phase 1: Grounded Glutes — range-banded move picks ----
    thinkP1(dt, game, pl, d) {
      // resolve an in-flight move first
      if (this.move) { this.stepMove(dt, game, pl, d); return; }
      if (this._skidT > 0) {                     // hip-check whiff: punish window
        this._skidT -= dt; this.state = "skid"; return;
      }
      const dx = pl.x - this.x, dy = pl.y - this.y;
      const dist = Math.hypot(dx, dy);
      this._decideT -= dt;
      if (this._decideT <= 0) {
        this._decideT = d.decideEvery;
        const pick = this._forceMove ||
          (dist < d.clap.range * 0.9 ? "clap" : dist < 240 ? (Math.random() < 0.5 ? "clap" : "hip") : (Math.random() < 0.5 ? "hip" : "toss"));
        this._forceMove = null;
        this.startMove(pick, game, pl, d);
        return;
      }
      // footsies: brisk walk-in
      if (dist > 30) {
        this.x += (dx / dist) * d.speed * dt;
        this.y += (dy / dist) * d.speed * dt;
        this.facing = dx >= 0 ? 1 : -1;
        this.state = "walk";
      } else this.state = "idle";
    }

    startMove(kind, game, pl, d) {
      if (kind === "clap") {
        this.facing = pl.x >= this.x ? 1 : -1;
        this._coneLock = { x: this.x, y: this.y, facing: this.facing };
        this.move = { kind: "clap", t: d.clap.wind };
        this.state = "clapwind";
        game.audio.play("jump");                 // windup cue; THUNDERCRACK on release
      } else if (kind === "hip") {
        this.facing = pl.x >= this.x ? 1 : -1;
        this.move = { kind: "hip", t: d.hip.brace, dashed: 0, hit: false };
        this.state = "hipbrace";
      } else {                                   // toss (Task 4 fills the projectile)
        this.facing = pl.x >= this.x ? 1 : -1;
        this.move = { kind: "toss", t: 0.5, tx: pl.x, ty: pl.y, thrown: false };
        this.state = "toss";
      }
    }

    stepMove(dt, game, pl, d) {
      const m = this.move;
      if (m.kind === "clap") {
        m.t -= dt;
        this.state = "clapwind";
        if (m.t <= 0) {
          // release: ONE cone shape (drawn by drawCone with identical params)
          const L = this._coneLock;
          if (pl.alive && JH.Balance.coneHits(pl.x, pl.y, L.x, L.y, L.facing, d.clap.range, d.clap.halfAngleDeg, JH.GROUND_RY))
            pl.takeHit(d.clap.dmg, game, L.x, d.clap.shove);   // knock param carries the shove (Big Drip rain precedent)
          this.state = "clap"; this.strikeFx = 0.25;
          game.shake(7); game.audio.play("whack");             // THUNDERCRACK slot
          this.move = null; this._coneLock = null;
          this._coneAfter = 0.3;                               // brief release-pose hold via strikeFx
        }
        return;
      }
      if (m.kind === "hip") {
        if (m.t > 0) { m.t -= dt; this.state = "hipbrace"; return; }
        this.state = "hipdash";
        const step = d.hip.speed * dt;
        this.x += this.facing * step;
        m.dashed += step;
        if (!m.hit && pl.alive && Math.abs(pl.x - this.x) < this.bodyW * 0.6 && Math.abs(pl.y - this.y) < 14) {
          m.hit = true;
          pl.takeHit(d.hip.dmg, game, this.x, 320);
        }
        if (m.dashed >= d.hip.dist || m.hit) {
          this.move = null;
          if (!m.hit) this._skidT = d.hip.skid;   // whiff: punishable skid
          else this.state = "idle";
        }
        return;
      }
      if (m.kind === "toss") {                    // placeholder until Task 4
        this.move = null; this.state = "idle";
      }
    }
```

Also add the telegraph/draw for the cone — same params as the hit test (called from `draw`, Task 7 wires the full draw; add the method now):

```js
    // Cone telegraph: identical (origin, facing, range, halfAngle, GROUND_RY)
    // as Balance.coneHits — rim is hitbox.
    drawCone(ctx, cam) {
      if (!this.move || this.move.kind !== "clap" || !this._coneLock) return;
      const d = this.def, L = this._coneLock;
      const sx = L.x - cam, sy = JH.Geo.feetScreenY(L.y, 0);
      const prog = 1 - this.move.t / d.clap.wind;
      const half = d.clap.halfAngleDeg * Math.PI / 180;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.scale(L.facing, JH.GROUND_RY);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, d.clap.range, -half, half);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,60,60,0.16)"; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, d.clap.range * prog, -half, half);
      ctx.closePath();
      ctx.fillStyle = "rgba(255,60,60,0.35)"; ctx.fill();
      ctx.strokeStyle = (Math.floor(this.t * 12) & 1) ? "#ff5a5a" : "#ffd23f";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, d.clap.range, -half, half); ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
```

Note: verify `JH.Geo` is exported from entities.js (the Big Drip drawRain uses bare `Geo` in-file — if `Geo` is module-local, `drawCone` lives in the same file so use bare `Geo` exactly like `drawRain` does).

- [ ] **Step 4: Run tests** — `node --test tests/assman.test.js` → PASS. `npm test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add js/entities.js tests/assman.test.js
git commit -m "feat(assman): phase 1 — clap cone (shared shape), hip check with skid"
```

---

### Task 4: Toilet Toss — ToiletBomb projectile + shard zone

**Files:**
- Modify: `js/entities.js` (new `ToiletBomb` class near `SmeltBomb` ~line 5634; `AssManBoss.stepMove` toss branch)
- Test: `tests/assman.test.js` (append)

**Interfaces:**
- Consumes: `Geo.inGroundEllipse`, `Player.takeHit`, `game.embers` contract (`update(dt, game) -> bool alive`, `draw(ctx, cam)`).
- Produces: `JH.ToiletBomb(x, y, tx, ty, T)` where `T = JH.ASSMAN.toss`. Landing: impact damage inside `landRx` ellipse (ry = `landRx * JH.GROUND_RY`), then a shard zone at the SAME ellipse ticking `shardDmg` every `shardEvery` for `shardDur`. The drawn landing ellipse = impact ellipse = shard ellipse.

- [ ] **Step 1: Failing tests**

```js
test("assman toss: toilet arcs, lands with rim-true impact + shard ticks", () => {
  const T = JH.ASSMAN.toss;
  const g = makeThinkGame(200, 40);
  const bomb = new JH.ToiletBomb(100, 40, 200, 40, T);
  g.embers = [bomb];
  // fly until landing
  let guard = 0;
  while (!bomb.landed && guard++ < 600) bomb.update(1 / 60, g);
  assert.ok(bomb.landed, "landed");
  // player stood on the landing spot: impact damage applied exactly once
  assert.strictEqual(g.player.hp, 100 - T.dmg);
  // shard zone ticks while standing inside
  const hpAfterImpact = g.player.hp;
  for (let t = 0; t < T.shardEvery + 0.05; t += 1 / 60) bomb.update(1 / 60, g);
  assert.strictEqual(g.player.hp, hpAfterImpact - T.shardDmg, "one shard tick");
  // outside the rim: no ticks
  g.player.x = 200 + T.landRx + 20;
  const hp2 = g.player.hp;
  for (let t = 0; t < T.shardEvery * 2; t += 1 / 60) bomb.update(1 / 60, g);
  assert.strictEqual(g.player.hp, hp2, "rim is hitbox — outside is safe");
  // zone expires
  for (let t = 0; t < T.shardDur; t += 1 / 60) if (!bomb.update(1 / 60, g)) break;
  assert.ok(!bomb.update(1 / 60, g), "dead after shardDur");
});
```

- [ ] **Step 2: Run to verify failure** — `JH.ToiletBomb` undefined.

- [ ] **Step 3: Implement `ToiletBomb`** (model: SmeltBomb; no fire patch, adds the shard phase)

```js
  // ---- ToiletBomb: Ass Man's Toilet Toss ----
  // Ballistic arc to a marked landing ellipse; impact hit + a shard zone
  // ticking inside the SAME ellipse (one shape: telegraph, draw, hit).
  class ToiletBomb {
    constructor(x, y, tx, ty, T) {
      this.x = x; this.y = y; this.z = 40;
      this.T = T;
      const dist = Math.max(1, Math.hypot(tx - x, ty - y));
      const flightT = Math.max(0.5, dist / T.lobSpeed);
      this.vx = (tx - x) / flightT;
      this.vy = (ty - y) / flightT;
      this.vz = 0.5 * T.gravity * flightT - this.z / flightT;
      this.tx = tx; this.ty = ty;
      this.landed = false;
      this.zoneT = 0; this.tickT = 0;
      this.spin = 0;
      this.isProjectile = true;
    }
    update(dt, game) {
      const T = this.T, pl = game.player;
      if (!this.landed) {
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.vz -= T.gravity * dt; this.z += this.vz * dt;
        this.spin += dt * 9;
        if (this.z <= 0) {
          this.landed = true;
          this.zoneT = T.shardDur; this.tickT = 0;
          game.shake(4); game.audio.play("whack");
          if (pl.alive && Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, T.landRx))
            pl.takeHit(T.dmg, game, this.x);
        }
        return true;
      }
      this.zoneT -= dt;
      this.tickT -= dt;
      if (this.tickT <= 0) {
        this.tickT = T.shardEvery;
        if (pl.alive && Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, T.landRx))
          pl.takeHit(T.shardDmg, game, this.x);
      }
      return this.zoneT > 0;
    }
    draw(ctx, cam) {
      const T = this.T;
      const gy = Geo.feetScreenY(this.landed ? this.y : this.ty, 0);
      const gx = (this.landed ? this.x : this.tx) - cam;
      // landing/shard ellipse — the one shape
      ctx.save();
      ctx.strokeStyle = this.landed ? "#e8ddcf" : "#ff5a5a";
      ctx.globalAlpha = this.landed ? 0.7 : 0.5;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(Math.round(gx), Math.round(gy), T.landRx, T.landRx * JH.GROUND_RY, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (this.landed) { ctx.globalAlpha = 0.12; ctx.fillStyle = "#e8ddcf"; ctx.fill(); }
      ctx.restore();
      if (!this.landed) {
        // the porcelain in flight (sprite hook lands in Task 7; box fallback)
        const sx = this.x - cam, sy = Geo.feetScreenY(this.y, 0) - this.z;
        ctx.save();
        ctx.translate(sx, sy); ctx.rotate(this.spin);
        ctx.fillStyle = "#efe9dd"; ctx.fillRect(-6, -7, 12, 14);
        ctx.strokeStyle = "#141414"; ctx.lineWidth = 1; ctx.strokeRect(-6, -7, 12, 14);
        ctx.restore();
      }
    }
  }
  JH.ToiletBomb = ToiletBomb;
```

- [ ] **Step 4: Wire the toss move** — replace the Task 3 toss placeholder in `stepMove`:

```js
      if (m.kind === "toss") {
        m.t -= dt;
        this.state = "toss";
        if (!m.thrown && m.t <= 0.25) {          // release beat inside the pose
          m.thrown = true;
          game.embers.push(new JH.ToiletBomb(this.x + this.facing * 10, this.y, m.tx, m.ty, d.toss));
        }
        if (m.t <= 0) { this.move = null; this.state = "idle"; }
        return;
      }
```

- [ ] **Step 5: Run tests** — `node --test tests/assman.test.js` → PASS; `npm test` → all pass.

- [ ] **Step 6: Commit**

```bash
git add js/entities.js tests/assman.test.js
git commit -m "feat(assman): toilet toss — ToiletBomb arc, rim-true impact + shard zone"
```

---

### Task 5: Phase gates, transition beats, Phase 2 (Air Superiority)

**Files:**
- Modify: `js/entities.js` (`AssManBoss`)
- Test: `tests/assman.test.js` (append)

**Interfaces:**
- Consumes: `JH.Balance.assmanPhase`, `game.gustLanes.push(new JH.GustLane(spec))` (generic update/draw loops handle pushed lanes), `game.banner(text, dur)`.
- Produces: full phase router in `think`; `this.phase 1|2|3`; `this._grounded`; `this.z` lift while airborne; `takeDamage` override (invuln beats, airborne immunity, exhaust multiplier — exhaust wired in Task 6). States added: `"transition" | "fly" | "airclap" | "slampause" | "slamfall" | "slamland"`. Task 6 consumes `thinkP3` slot in the router.

- [ ] **Step 1: Failing tests**

```js
test("assman phases: gate on hp fraction with a transition beat + invuln", () => {
  const D = JH.ASSMAN;
  const g = makeThinkGame(400, 40);
  const b = JH.makeEnemy("assman", 100, 40);
  g.enemies = [b];
  b.hp = b.maxHp * (D.gates[0] - 0.01);          // below gate 1
  b.think(1 / 60, g);
  assert.strictEqual(b.phase, 2);
  assert.strictEqual(b.state, "transition");
  assert.ok(b._invulnT > 0 && b._invulnT <= D.transitionInvuln);
  // invulnerable during the beat
  const hp0 = b.hp;
  b.takeDamage(50, g, 1, 0);
  assert.strictEqual(b.hp, hp0, "no damage during the transition beat");
});

test("assman P2: airborne = untouchable; slam landing recovery = the window", () => {
  const D = JH.ASSMAN;
  const g = makeThinkGame(300, 40);
  const b = JH.makeEnemy("assman", 100, 40);
  g.enemies = [b];
  b.hp = b.maxHp * (D.gates[0] - 0.01);
  // run through the transition beat into flight
  for (let t = 0; t < D.transitionInvuln + 0.1; t += 1 / 60) b.think(1 / 60, g);
  assert.ok(!b._grounded, "airborne after the beat");
  const hpAir = b.hp;
  b.takeDamage(60, g, 1, 0);
  assert.strictEqual(b.hp, hpAir, "out of the hit band while airborne");
  // force the slam cycle to the landing
  b._p2 = { mode: "slampause", t: 0.01, loops: 0, cbT: 9, tx: g.player.x, ty: g.player.y };
  b.state = "slampause";
  let guard = 0;
  while (!b._grounded && guard++ < 900) b.think(1 / 60, g);
  assert.strictEqual(b.state, "slamland");
  assert.ok(b._recoverT > 0 && b._recoverT <= D.slam.recovery);
  b.takeDamage(60, g, 1, 0);
  assert.strictEqual(b.hp, hpAir - 60, "vulnerable ONLY during landed recovery");
});

test("assman P2: slam ellipse is rim-true and the gust lane summons", () => {
  const D = JH.ASSMAN;
  const g = makeThinkGame(300, 40);
  g.gustLanes = [];
  const b = JH.makeEnemy("assman", 100, 40);
  b.phase = 2; b._grounded = false; b.z = D.slam.airZ;
  b._p2 = { mode: "slamfall", t: 0, loops: 1, cbT: 9, tx: 300, ty: 40 };   // loops odd → this landing summons
  b.x = 300; b.y = 40; b.state = "slamfall";
  const hp0 = g.player.hp;                        // player at the impact point
  let guard = 0;
  while (b.state !== "slamland" && guard++ < 900) b.think(1 / 60, g);
  assert.strictEqual(g.player.hp, hp0 - D.slam.dmg, "landing ellipse caught the player");
  assert.strictEqual(g.gustLanes.length, 1, "every 2nd loop summons a gust lane");
  // outside the rim: safe
  const g2 = makeThinkGame(300 + D.slam.rx + 25, 40);
  g2.gustLanes = [];
  const b2 = JH.makeEnemy("assman", 100, 40);
  b2.phase = 2; b2._grounded = false; b2.z = D.slam.airZ;
  b2._p2 = { mode: "slamfall", t: 0, loops: 0, cbT: 9, tx: 300, ty: 40 };
  b2.x = 300; b2.y = 40; b2.state = "slamfall";
  const hp2 = g2.player.hp;
  guard = 0;
  while (b2.state !== "slamland" && guard++ < 900) b2.think(1 / 60, g2);
  assert.strictEqual(g2.player.hp, hp2, "rim is hitbox");
});

test("assman P2: clap back wave travels the lane, dodged by depth", () => {
  const D = JH.ASSMAN;
  const g = makeThinkGame(260, 40);
  const b = JH.makeEnemy("assman", 100, 40);
  b.phase = 2; b._grounded = false; b.z = D.slam.airZ;
  b._p2 = { mode: "shadow", t: 9, loops: 0, cbT: 0, tx: 0, ty: 0 };
  b.y = 40;                                       // same depth lane as the player
  b.think(1 / 60, g);
  assert.strictEqual(b._waves.length, 1, "clap back fired");
  const hp0 = g.player.hp;
  let guard = 0;
  while (b._waves.length && guard++ < 900) b.think(1 / 60, g);
  assert.strictEqual(g.player.hp, hp0 - D.clapback.dmg, "wave crossed the player in-lane");
  // depth-dodged copy
  const g2 = makeThinkGame(260, 40 + D.clapback.band + 10);
  const b2 = JH.makeEnemy("assman", 100, 40);
  b2.phase = 2; b2._grounded = false; b2.z = D.slam.airZ;
  b2._p2 = { mode: "shadow", t: 9, loops: 0, cbT: 0, tx: 0, ty: 0 };
  b2.y = 40;
  const hp2 = g2.player.hp;
  guard = 0;
  b2.think(1 / 60, g2);
  while (b2._waves.length && guard++ < 900) b2.think(1 / 60, g2);
  assert.strictEqual(g2.player.hp, hp2, "dodged by depth");
});
```

Note: `makeThinkGame` has no `gustLanes` — the tests set `g.gustLanes = []` where needed; the implementation must tolerate its absence (`if (game.gustLanes)`).

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement the router + phase 2.** Replace `think` and add methods:

```js
    takeDamage(dmg, game, dirX, knock, crit) {
      if (this._invulnT > 0) return;                       // transition beat
      if (this.phase === 2 && !this._grounded) return;     // airborne: out of the hit band
      const mult = (this._exhaustT || 0) > 0 ? this.def.exhaust.dmgTakenMult : 1;
      super.takeDamage(dmg * mult, game, dirX, knock, crit);
    }

    think(dt, game) {
      const pl = game.player, d = this.def;
      if (this.strikeFx > 0) this.strikeFx -= dt;
      if (this._invulnT > 0) this._invulnT -= dt;
      const enraged = this.hp / this.maxHp < d.enrageAt;
      if (enraged && !this._enrageLatched) {
        this._enrageLatched = true;
        if (game.relics && game.relics.prayer_bead) JH.Balance.prayerBeadProc(game.player, JH.RELIC_TUNE);
      }
      if (this._kneeling) { this.stepKneel(dt, game); return; }        // Task 6
      // ---- phase gates: hp fraction only ----
      const want = JH.Balance.assmanPhase(this.hp / this.maxHp, d.gates);
      if (want > this.phase && !this._transitionT) {
        // finish nothing mid-air: slam completes because gates only re-check here
        this.move = null; this._coneLock = null; this._skidT = 0;
        this._transitionT = d.transitionInvuln;
        this._invulnT = d.transitionInvuln;
        this._nextPhase = want;
        this.state = "transition";
        game.banner(want === 2 ? d.barks.p2 : d.barks.p3, 1.6);
        game.audio.play("jump");
        return;
      }
      if (this._transitionT) {
        this._transitionT -= dt;
        this.state = "transition";
        if (this._transitionT <= 0) {
          this.phase = this._nextPhase; this._transitionT = 0;
          if (this.phase === 2) {
            this._grounded = false; this.z = d.slam.airZ;
            this.def.touchDmg = 0;                                     // no contact from the sky
            this._p2 = { mode: "shadow", t: 2.0, loops: 0, cbT: d.clapback.every, tx: 0, ty: 0 };
            this._waves = this._waves || [];
          } else if (this.phase === 3) {
            this._grounded = true; this.z = 0;
            this.def.touchDmg = JH.ASSMAN.touchDmg;
            this._p3 = null;                                           // Task 6 arms the storm
          }
        }
        return;
      }
      if (this.phase === 1) { this.thinkP1(dt, game, pl, d); return; }
      if (this.phase === 2) { this.thinkP2(dt, game, pl, d); return; }
      this.thinkP3(dt, game, pl, d);                                   // Task 6
    }

    // ---- Phase 2: Air Superiority ----
    thinkP2(dt, game, pl, d) {
      const P = this._p2;
      this._waves = this._waves || [];
      // clap-back waves always advance (even during the slam)
      for (let i = this._waves.length - 1; i >= 0; i--) {
        const w = this._waves[i];
        const x0 = w.x;
        w.x += w.dir * d.clapback.waveSpeed * dt;
        if (pl.alive && !w.hit && Math.abs(pl.y - w.y) <= d.clapback.band &&
            ((x0 - pl.x) * (w.x - pl.x) <= 0)) {                       // front crossed the player
          w.hit = true;
          pl.takeHit(d.clapback.dmg, game, w.x - w.dir * 20);
        }
        if (w.x < -60 || w.x > JH.LEVEL_LEN + 60) this._waves.splice(i, 1);
      }
      if (P.mode === "shadow") {
        this.state = "fly";
        // track the player's x from the air
        const dx = pl.x - this.x;
        this.x += Math.sign(dx) * Math.min(Math.abs(dx), d.speed * 2.4 * dt);
        this.facing = dx >= 0 ? 1 : -1;
        P.cbT -= dt;
        if (P.cbT <= 0) {
          P.cbT = d.clapback.every;
          this._waves.push({ x: this.x, y: this.y, dir: this.facing, hit: false });
          this.state = "airclap"; this.strikeFx = 0.2;
          game.audio.play("whack");
        }
        P.t -= dt;
        if (P.t <= 0) {
          P.mode = "slampause"; P.t = d.slam.pause;
          P.tx = pl.x; P.ty = pl.y;                                    // lock the drop point
          this.x = pl.x; this.y = pl.y;                                // hover above it
          this.state = "slampause";
        }
        return;
      }
      if (P.mode === "slampause") {
        this.state = "slampause";
        P.t -= dt;
        if (P.t <= 0) { P.mode = "slamfall"; this.state = "slamfall"; }
        return;
      }
      if (P.mode === "slamfall") {
        this.state = "slamfall";
        this.z -= d.slam.fallSpeed * dt;
        if (this.z <= 0) {
          this.z = 0; this._grounded = true;
          this.state = "slamland";
          this._recoverT = d.slam.recovery;
          game.shake(8); game.audio.play("whack");
          if (pl.alive && Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, d.slam.rx))
            pl.takeHit(d.slam.dmg, game, this.x, d.slam.shove);
          P.loops++;
          if (P.loops % d.gustEveryLoops === 0 && game.gustLanes && JH.GustLane) {
            const lane = new JH.GustLane({ y: pl.y, dir: this.facing });
            lane._bossT = d.gustDur;                                   // boss lanes expire
            game.gustLanes.push(lane);
          }
        }
        return;
      }
      // slamland: the ONLY vulnerability window
      this.state = "slamland";
      this._recoverT -= dt;
      if (this._recoverT <= 0) {
        this._grounded = false; this.z = d.slam.airZ;
        P.mode = "shadow"; P.t = 2.0; P.cbT = d.clapback.every;
        this.state = "fly";
      }
    }

    thinkP3(dt, game, pl, d) { this.state = "idle"; }      // Task 6 replaces
```

Boss-summoned gust lanes expire: in `GustLane.update` add at the top (entities.js:2922 region):

```js
      if (this._bossT != null) { this._bossT -= dt; if (this._bossT <= 0) { this.dead = true; return; } }
```

and in the game loop that updates lanes (game.js:2202) filter dead ones after update:

```js
      this.gustLanes = this.gustLanes.filter((gl) => !gl.dead);
```

Also add the wave/slam telegraph draw methods (wired fully in Task 7):

```js
    drawP2Fx(ctx, cam) {
      const d = this.def;
      if (this._waves) for (const w of this._waves) {
        const sx = w.x - cam, syT = Geo.feetScreenY(w.y - d.clapback.band, 0), syB = Geo.feetScreenY(w.y + d.clapback.band, 0);
        ctx.save();
        ctx.strokeStyle = "#bfe0ff"; ctx.globalAlpha = 0.8; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx, syT - 16); ctx.lineTo(sx, syB); ctx.stroke();
        ctx.globalAlpha = 0.25;
        ctx.beginPath(); ctx.moveTo(sx - w.dir * 6, syT - 16); ctx.lineTo(sx - w.dir * 6, syB); ctx.stroke();
        ctx.restore();
      }
      if (this._p2 && (this._p2.mode === "slampause" || this._p2.mode === "slamfall")) {
        const sx = this._p2.tx - cam, sy = Geo.feetScreenY(this._p2.ty, 0);
        const flash = Math.floor(this.t * 12) & 1;
        ctx.save();
        ctx.strokeStyle = flash ? "#ff5a5a" : "#ffd23f"; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.ellipse(Math.round(sx), Math.round(sy), this.def.slam.rx, this.def.slam.rx * JH.GROUND_RY, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.15; ctx.fillStyle = "#ff5a5a"; ctx.fill();
        ctx.restore();
      }
    }
```

- [ ] **Step 4: Run tests** — `node --test tests/assman.test.js` → PASS; `npm test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add js/entities.js js/game.js tests/assman.test.js
git commit -m "feat(assman): phase gates + transition beats + phase 2 air superiority"
```

---

### Task 6: Phase 3 clap-storm, exhaustion, kneel + shared no-death-VFX gate

**Files:**
- Modify: `js/entities.js` (`AssManBoss.thinkP3`, `die`, `stepKneel`; `SlayerBoss.die` gate; `JH.SLAYER` flag in `js/config.js`)
- Test: `tests/assman.test.js` (append)

**Interfaces:**
- Consumes: `JH.Balance.ringGapHits` (Task 2), `game.onEnemyKilled`, `spawnCoinFountain` (module-local — call inside entities.js).
- Produces: `this._storm { rings:[{r, gapA}], spawnT, spawned, burstRestT }`, `this._exhaustT`; `die()` override → `_kneeling`; `JH.SLAYER.survivesDefeat = true` and the FxBurst gate in `SlayerBoss.die`.

- [ ] **Step 1: Failing tests**

```js
test("assman P3: storm rings expand, gap rotates, rim hits the player", () => {
  const D = JH.ASSMAN, S = D.storm;
  const g = makeThinkGame(0, 40);
  const b = JH.makeEnemy("assman", 200, 40);
  b.phase = 3; b._grounded = true;
  b.think(1 / 60, g);                             // arms the storm
  assert.ok(b._storm, "storm armed");
  // spawn all rings
  let guard = 0;
  while ((b._storm.spawned || 0) < S.rings && guard++ < 2000) b.think(1 / 60, g);
  assert.strictEqual(b._storm.rings.length > 0, true);
  // gap centers rotate ring to ring
  const gaps = b._storm.rings.map((r) => r.gapA);
  if (gaps.length >= 2) assert.strictEqual((gaps[1] - gaps[0] + 360) % 360, S.gapRotDeg % 360);
  // park the player on a rim point opposite the first ring's gap → takes ringDmg
  const ring = b._storm.rings[0];
  const away = (ring.gapA + 180) * Math.PI / 180;
  g.player.x = b.x + Math.cos(away) * (ring.r + 30);
  g.player.y = b.y + Math.sin(away) * (ring.r + 30) * 0.34;
  const hp0 = g.player.hp;
  guard = 0;
  while (g.player.hp === hp0 && guard++ < 2000) b.think(1 / 60, g);
  assert.ok(g.player.hp <= hp0 - S.ringDmg, "expanding rim caught the player");
});

test("assman P3: exhaustion window — 1.25x damage taken, then next burst", () => {
  const D = JH.ASSMAN;
  const g = makeThinkGame(0, 40);
  const b = JH.makeEnemy("assman", 200, 40);
  b.phase = 3; b._grounded = true;
  b.think(1 / 60, g);
  // fast-forward: exhaust after the burst completes
  let guard = 0;
  while (!(b._exhaustT > 0) && guard++ < 5000) b.think(1 / 60, g);
  assert.ok(b._exhaustT > 0, "exhaustion window opened");
  assert.strictEqual(b.state, "exhaust");
  const hp0 = b.hp;
  b.takeDamage(100, g, 1, 0);
  assert.strictEqual(b.hp, hp0 - 100 * D.exhaust.dmgTakenMult, "opening takes bonus damage");
});

test("assman kneel: no death VFX, beat, then onEnemyKilled — and Slayer gated too", () => {
  const D = JH.ASSMAN;
  const g = makeThinkGame(0, 40);
  let killed = null; let fxPushed = 0;
  g.onEnemyKilled = (e) => { killed = e; };
  g.embers = { push: () => { fxPushed++; } };
  const b = JH.makeEnemy("assman", 200, 40);
  b.phase = 3;
  b.takeDamage(b.hp + 10, g, 1, 0);               // lethal
  assert.ok(b._kneeling, "kneels instead of dying");
  assert.strictEqual(b.dead, false);
  assert.strictEqual(fxPushed, 0, "no corpse/explosion VFX");
  for (let t = 0; t < D.kneelBeat + 0.1; t += 1 / 60) b.think(1 / 60, g);
  assert.strictEqual(b.dead, true);
  assert.strictEqual(killed, b, "routed through onEnemyKilled (ally path)");
  // Slayer: survivesDefeat gates its boom-big
  assert.strictEqual(JH.SLAYER.survivesDefeat, true);
});
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement phase 3 + kneel:**

```js
    // ---- Phase 3: Glute Force Trauma — clap-storm bursts + exhaustion ----
    thinkP3(dt, game, pl, d) {
      const S = d.storm;
      if (this._exhaustT > 0) {
        this._exhaustT -= dt;
        this.state = "exhaust";
        if (this._exhaustT <= 0) this._storm = null;       // next burst arms below
        return;
      }
      if (!this._storm) {
        this._storm = { rings: [], spawnT: 0, spawned: 0, gapA: Math.floor(Math.random() * 360), restT: 0 };
        this.state = "clapwind";
        return;
      }
      const st = this._storm;
      // spawn rings on cadence
      if (st.spawned < S.rings) {
        st.spawnT -= dt;
        if (st.spawnT <= 0) {
          st.spawnT = S.ringEvery;
          st.rings.push({ r: 6, gapA: (st.gapA + st.spawned * S.gapRotDeg) % 360, hit: false });
          st.spawned++;
          this.state = "clap"; this.strikeFx = 0.2;
          game.shake(5); game.audio.play("whack");
        }
      }
      // expand + hit-test rims (one shape: ringGapHits mirrors drawStorm)
      for (let i = st.rings.length - 1; i >= 0; i--) {
        const ring = st.rings[i];
        ring.r += S.ringSpeed * dt;
        if (pl.alive && !ring.hit &&
            JH.Balance.ringGapHits(pl.x, pl.y, this.x, this.y, ring.r, S.rimW, ring.gapA, S.gapDeg, 0.34)) {
          if (pl.takeHit(S.ringDmg, game, this.x) !== false) ring.hit = true;
        }
        if (ring.r > 480) st.rings.splice(i, 1);
      }
      // burst over → exhaustion
      if (st.spawned >= S.rings && st.rings.length === 0) {
        st.restT += dt;
        if (st.restT >= S.burstGap) {
          this._exhaustT = d.exhaust.dur;
          this.state = "exhaust";
        }
      } else this.state = st.rings.length ? "clap" : "clapwind";
    }

    drawStorm(ctx, cam) {
      if (!this._storm) return;
      const S = this.def.storm;
      const cx = this.x - cam, cy = Geo.feetScreenY(this.y, 0);
      ctx.save();
      for (const ring of this._storm.rings) {
        const g0 = (ring.gapA - S.gapDeg / 2) * Math.PI / 180;
        const g1 = (ring.gapA + S.gapDeg / 2) * Math.PI / 180;
        ctx.strokeStyle = "#bfe0ff"; ctx.lineWidth = 2; ctx.globalAlpha = 0.85;
        ctx.beginPath();
        // rim drawn from gap end to gap start (the gap itself stays open) —
        // same center/r/gap params as ringGapHits, ry 0.34
        ctx.save();
        ctx.translate(Math.round(cx), Math.round(cy));
        ctx.scale(1, 0.34);
        ctx.arc(0, 0, ring.r, g1, g0 + Math.PI * 2);
        ctx.restore();
        ctx.stroke();
      }
      ctx.restore();
    }

    // ---- 0 HP: the kneel (never a death) ----
    die(game) {
      if (this.dead || this._kneeling) return;
      this._kneeling = true;
      this.hp = 0;
      this.state = "kneel";
      this._kneelT = this.def.kneelBeat;
      this.def.touchDmg = 0;
      this.move = null; this._storm = null; this._waves = [];
      game.audio.play("win");
      // survivesDefeat: NO FxBurst, no corpse sequence — the kneel IS the beat.
    }

    stepKneel(dt, game) {
      this.state = "kneel";
      this._kneelT -= dt;
      if (this._kneelT <= 0 && !this.dead) {
        this.dead = true;
        spawnCoinFountain(game, this.x, this.y, this.def.suds);
        game.onEnemyKilled(this);                          // ally path: Church.markBossDefeated("assman") lights the Air pillar
      }
    }
```

- [ ] **Step 4: The shared gate.** In `js/config.js` add `survivesDefeat: true,` to `JH.SLAYER`. In `SlayerBoss.die` (entities.js:6004-6011) wrap the VFX line:

```js
    die(game) {
      if (this.dead) return;
      this.dead = true;
      game.audio.play("win");
      // Defeated-but-surviving bosses skip the corpse/explosion VFX — they
      // are about to stand up in a cutscene (shared gate: Slayer + Ass Man).
      if (!this.def.survivesDefeat)
        game.embers.push(new JH.FxBurst(this.x, this.y, "boom-big", { scale: 0.9 }));
      spawnCoinFountain(game, this.x, this.y, this.def.suds);
      game.onEnemyKilled(this);
    }
```

- [ ] **Step 5: Run tests** — `node --test tests/assman.test.js` → PASS; `npm test` → all pass (a Slayer death test asserting the FxBurst may need its expectation flipped to the gate).

- [ ] **Step 6: Commit**

```bash
git add js/entities.js js/config.js tests/assman.test.js
git commit -m "feat(assman): phase 3 clap-storm + exhaustion + kneel; survivesDefeat VFX gate"
```

---

### Task 7: Draw — pose sprites, bake tool, telegraphs wired

**Files:**
- Create: `tools/assman-bake.py`
- Create (outputs): `sprites/assman/baked/{idle,flight,slam,kneel,clapwind,clap,hipcheck,toss,airclap,exhaust}.png`
- Modify: `js/assets.js` (register "assman"), `js/entities.js` (`AssManBoss.draw`)
- Test: visual — headless screenshots (no unit tests for draw; the shape methods are already tested)

**Interfaces:**
- Consumes: masters `sprites/assman/ass-man.png` + `sprites/assman/pose_*.png`; `Assets.register` / `Assets.draw` (verify the exact `Assets.draw` arg order against the Slayer call at entities.js:5971 before writing the call).
- Produces: `Assets.register("assman", drawFn)` keyed by `opt.state`; `AssManBoss.draw(ctx, cam)` mapping states → poses; telegraphs (`drawCone`, `drawP2Fx`, `drawStorm`, ToiletBomb draws itself) all invoked.

- [ ] **Step 1: Bake tool** (`tools/assman-bake.py`) — masters → game-scale (4× logical: boss bodyH 58 → 232px tall), Pillow LANCZOS, hard alpha:

```python
# Bakes sprites/assman masters to game-scale runtime PNGs (4x logical).
# Masters are hi-res with binary alpha already; this is downscale + re-harden.
#   python tools/assman-bake.py
from PIL import Image
import os
SRC = "sprites/assman"
OUT = "sprites/assman/baked"
TARGET_H = 232        # 58 logical * 4
POSES = { "idle": "ass-man.png" }
for k in ["flight","slam","kneel","clapwind","clap","hipcheck","toss","airclap","exhaust"]:
    POSES[k] = f"pose_{k}.png"
os.makedirs(OUT, exist_ok=True)
for name, f in POSES.items():
    im = Image.open(os.path.join(SRC, f)).convert("RGBA")
    w = max(1, round(im.width * TARGET_H / im.height))
    out = im.resize((w, TARGET_H), Image.LANCZOS)
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 255 if a >= 128 else 0)
    out.save(os.path.join(OUT, f"{name}.png"))
    print(name, out.size)
```

Run: `python tools/assman-bake.py` → 10 files in `sprites/assman/baked/`.

- [ ] **Step 2: Register the painter** (js/assets.js, next to the Switch/GK chassis registrations ~line 1483; copy their image-guard idiom):

```js
  // ---- Ass Man: baked pose set + procedural silhouette fallback ----
  {
    const _amImgs = {};
    ["idle", "flight", "slam", "kneel", "clapwind", "clap", "hipcheck", "toss", "airclap", "exhaust"]
      .forEach((k) => { _amImgs[k] = JH.Loader.img("sprites/assman/baked/" + k + ".png"); });
    const AM_H = 58;                                     // logical draw height
    function proceduralAssman(p, opt, ctx, x, y, facing) {
      // silhouette fallback: navy body + gold band, enough to fight against
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(facing < 0 ? -1 : 1, 1);
      ctx.fillStyle = "#1d2f66";
      ctx.fillRect(-9, -AM_H, 18, AM_H);
      ctx.fillStyle = "#d9a520";
      ctx.fillRect(-9, -AM_H * 0.45, 18, 6);
      ctx.strokeStyle = "#0d1020"; ctx.lineWidth = 1;
      ctx.strokeRect(-9.5, -AM_H + 0.5, 19, AM_H - 1);
      ctx.restore();
    }
    Assets.register("assman", (p, opt, ctx, x, y, facing) => {
      const img = _amImgs[opt.state] || _amImgs.idle;
      if (!(img && img.complete && img.naturalWidth)) return proceduralAssman(p, opt, ctx, x, y, facing);
      const h = AM_H, w = Math.round(h * img.naturalWidth / img.naturalHeight);
      const prev = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(facing < 0 ? -1 : 1, 1);
      ctx.drawImage(img, -w / 2, -h, w, h);
      ctx.restore();
      ctx.imageSmoothingEnabled = prev;
    });
  }
```

(Adapt the register signature to match the file's actual `Assets.register` painter contract — mirror the Switch registration verbatim as the template.)

- [ ] **Step 3: Boss draw** (js/entities.js, on `AssManBoss`; mirror `SlayerBoss.draw` at entities.js:5971 for the `Assets.draw` call shape):

```js
    poseKey() {
      const s = this.state;
      if (this._kneeling) return "kneel";
      if (s === "transition") return this._nextPhase === 2 ? "flight" : "clap";
      if (s === "fly") return "flight";
      if (s === "airclap") return "airclap";
      if (s === "slampause" || s === "slamfall") return "slam";
      if (s === "slamland") return "kneel";              // landed recovery reads as grounded/open
      if (s === "clapwind") return "clapwind";
      if (s === "clap") return "clap";
      if (s === "hipbrace" || s === "hipdash" || s === "skid") return "hipcheck";
      if (s === "toss") return "toss";
      if (s === "exhaust") return "exhaust";
      return "idle";
    }
    draw(ctx, cam) {
      const sx = this.x - cam;
      const feetY = Geo.feetScreenY(this.y, 0);
      // telegraphs under the body
      this.drawCone(ctx, cam);
      this.drawP2Fx(ctx, cam);
      this.drawStorm(ctx, cam);
      Assets.shadow(ctx, sx, feetY, this.bodyW * 0.6);
      const sy = feetY - (this.z || 0);
      Assets.draw(ctx, "assman", sx, sy, this.facing, { state: this.state, pose: this.poseKey(), hurt: this.hurtT > 0 });
      // hp bar comes from the shared boss draw path — mirror how SlayerBoss
      // surfaces it (reuse the same helper/lines found at its draw site).
    }
```

Adjust: the registered painter reads `opt.state` — pass `{ state: this.poseKey(), … }` so the pose map key lands in `opt.state` (keep the two consistent; the painter keys on what the entity sends).

- [ ] **Step 4: Visual verification (headless).** Serve on :8123, then with the established probe pattern (`headless-playtest` skill): `devGotoWave` to the last wave, screenshot idle/walk; force `b.hp = b.maxHp*0.5` → transition + flight screenshots; force `b.phase = 3` storm + exhaust screenshots. LOOK at each image: pose renders, telegraph shapes match their described geometry, no missing-image silhouette unless PNGs absent.

- [ ] **Step 5: Commit**

```bash
git add tools/assman-bake.py sprites/assman/baked js/assets.js js/entities.js
git commit -m "feat(assman): baked pose draw + procedural fallback + telegraph wiring"
```

---

### Task 8: Leaderboard payload + client render + comparator doc

**Files:**
- Modify: `js/telemetry.js` (`buildPayload` ~line 60-74), `js/game.js:1982` (`finishWin` call), `js/game.js:1994-2007` (`openLeaderboard` render)
- Create: `docs/leaderboard-comparator.md`
- Test: `tests/assman.test.js` (append)

**Interfaces:**
- Consumes: `JH.Balance.lbCompare` (Task 2; the doc embeds its logic for Apps Script).
- Produces: payload field `wavesCleared` (win: `finalWaveIndex + 1`; death: `finalWaveIndex` — waves fully cleared before dying); leaderboard rows render `waves` when present.

- [ ] **Step 1: Failing test**

```js
test("telemetry payload carries wavesCleared and gameVersion", () => {
  // telemetry.js attaches to window.JH — load and drive buildPayload via its
  // public finish path with a stubbed transport.
  require("../js/telemetry.js");
  const T = JH.Telemetry;
  let sent = null;
  T.configure({ endpoint: "x", enabled: true, gameVersion: JH.TELEMETRY.version });
  T._setTransport ? T._setTransport((p) => { sent = p; }) : (T._send = (p) => { sent = p; });
  T.startRun("testhandle");
  T.finishWin({ timeSec: 100, kills: 5, deaths: 0, sudsEarned: 10, finalWaveIndex: 35, finalWaveName: "BOSS" });
  assert.ok(sent, "payload sent");
  assert.strictEqual(sent.wavesCleared, 36, "win: finalWaveIndex + 1");
  assert.strictEqual(sent.gameVersion, JH.TELEMETRY.version);
});
```

(Adapt the transport stub to telemetry.js's actual seam — it has `installBrowserTransport`; if there is no test seam, add `Telemetry._setTransport(fn)` as part of this task: a one-line setter the browser transport also uses.)

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement.** In `buildPayload` add:

```js
      wavesCleared: outcome === "win" ? (run.finalWaveIndex || 0) + 1 : (run.finalWaveIndex || 0),
```

(match the surrounding field style — `run` vs `stats` naming per the actual function body). In `openLeaderboard`'s `render(rows)` include waves when present:

```js
      li.textContent = row.handle + " — " + (row.wavesCleared != null ? "w" + row.wavesCleared + " · " : "") + Number(row.timeSec).toFixed(1) + "s (" + (row.deaths || 0) + ")";
```

(mirror the existing row-building lines; only the text template changes).

- [ ] **Step 4: The comparator doc** (`docs/leaderboard-comparator.md`) — the Apps Script–side sort to paste into the deployed script (it is NOT in this repo):

```markdown
# Leaderboard comparator (Apps Script side)

The client now submits `wavesCleared` (int) and `gameVersion` (string) with
every run. The deployed Apps Script's leaderboard read must sort with:

    function semverCmp(a, b) {
      var pa = String(a || "0").split(".").map(Number), pb = String(b || "0").split(".").map(Number);
      for (var i = 0; i < 3; i++) { var d = (pa[i] || 0) - (pb[i] || 0); if (d) return d < 0 ? -1 : 1; }
      return 0;
    }
    rows.sort(function (a, b) {
      var v = semverCmp(b.gameVersion, a.gameVersion);   // newer version first
      if (v) return v;
      var w = (b.wavesCleared || 0) - (a.wavesCleared || 0);  // waves desc
      if (w) return w;
      return (a.timeSec != null ? a.timeSec : 1e9) - (b.timeSec != null ? b.timeSec : 1e9);  // time asc
    });

Mirrors `JH.Balance.lbCompare` (js/balance.js), which is the unit-tested
source of truth. Old rows without `wavesCleared` sort as 0 waves — they age
out under version priority anyway.
```

- [ ] **Step 5: Run tests** — `node --test tests/assman.test.js` → PASS; `npm test` → all pass.

- [ ] **Step 6: Commit**

```bash
git add js/telemetry.js js/game.js docs/leaderboard-comparator.md tests/assman.test.js
git commit -m "feat(assman): leaderboard wavesCleared payload + render + comparator doc"
```

---

## Final verification (controller, not a task dispatch)

1. `npm test` — full suite green.
2. Headless full-fight run (headless-playtest skill): `devGotoWave` to the final wave → boss spawns with banner → scripted damage through phase 1 (observe clap cone + hip check + toss telegraphs) → cross gate 1 (transition beat, bark, flight) → burn phase 2 only during slamland windows (verify airborne damage is refused) → cross gate 2 (storm rings + exhaustion, verify 1.25× via hp deltas) → 0 HP → kneel, no boom FX → `game.state` reaches "win" and the win-stats screen text includes the run. Screenshot each phase; LOOK at them.
3. Confirm `Church.markBossDefeated("assman")` lit the Air pillar path (gateBoss "assman", config.js:902) — check `JH.Church.state` after the kill.
4. Ledger + final whole-branch review (session model), then HOLD for user playtest per house rule — no release without their word.

## Self-review notes (writing-time)

- Spec coverage: every spec section maps to a task (stubs T1/T6-kneel; phases T3/T5/T6; toss T4; leaderboard T8; art T7; testing throughout). The "no stink clouds in arena" needs no code — wave 36 defines no hazards; the constraint is recorded so no task adds them.
- The `Assets.draw` arg-order and telemetry transport seam are flagged inline as verify-against-file points (both have exact file:line anchors) rather than assumed.
- `makeThinkGame` lacks `banner`/`gustLanes` — T5 tests set what they need; `banner` exists in the stub already.
