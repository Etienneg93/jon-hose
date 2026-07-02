# Juice & Game-Feel Pass Implementation Plan (spec items 1–5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tiered hit-stop, trauma-based directional screenshake, blink-free hurt reads with squash-stretch, kills that scale (white pop → boom+splat → wave-ender freeze+loot vacuum), and a GUSH combo audio ladder with a capped water crumb.

**Architecture:** One `JH.JUICE` config block is the single source of truth for every feel constant. Kill presentation centralizes in a new `Game.killJuice(e)` called from `Enemy.die` (bosses keep their bespoke death sequences). The shake accumulator is replaced by the standard trauma model (`amplitude = trauma², shake(n) API preserved for all ~20 call sites). Hurt-blink lines are deleted from all 15 painters (the silhouette flash in `Assets.draw` becomes the one hurt read) and a squash-stretch transform is applied centrally in `Assets.draw` so every painter gets it for free.

**Tech Stack:** Vanilla JS IIFEs on `window.JH`; `node --test`. No new art (splats are procedural; KillPop reuses the hurt-flash compositor).

**Source spec:** `docs/superpowers/plans/ideas/2026-07-02-juice-and-game-feel.md` items 1–5 (items 6–8 deferred: spray audio, boss beats, player-state readability).

## Global Constraints

- Branch `juice-pass` off `main`. Stage by exact path only.
- **Playtest gate (user rule):** push the branch, never merge until the user signs off. Feel constants are all in `JH.JUICE` — expect a tuning round.
- Hit-stop on simultaneous kills takes the **max, never the sum** (spec open Q1) — `game.hitStop` already does `Math.max`; keep it.
- Splat decals: cap 40, oldest culled (spec open Q3).
- GUSH stays a feedback system: milestone crumb is +10 water / skip-regen-delay-once only — no damage or suds effects (spec Q + existing code comment).
- The input buffer (merged) is the prerequisite that makes bigger hit-stop safe — do not add hit-stop anywhere input isn't buffered-safe (dash/confirm are).
- Comments: behavioral/mechanical only (CLAUDE.md).
- Run `npm test` gated on **exit code** (`ec=$?`), not grep.
- Splat/ground ellipses use `JH.GROUND_RY` (the game-wide ground-footprint ratio).

### Feel deltas for the playtest

| Event | Before | After |
|---|---|---|
| regular kill freeze | 0.04s | 0.05s + white 1.3× silhouette pop (70ms) |
| elite/bulwark/furnace/smelt kill | 0.04s | 0.09s + boom FxBurst + wet splat (2s fade) |
| last kill of a wave | nothing | 0.14s freeze + shake + 1.2s arena-wide loot vacuum |
| player hit | 0.06s, undirected shake 5 | 0.07s, shake kicked away from impact |
| hurt read | blink (sprite deleted every other frame) + flash | flash only + 90ms squash-stretch |
| kill sound | fixed 70Hz | +1 semitone per combo step, cap +12 |
| GUSH ×5 milestone | shake only | shake + 10 water + regen delay skipped + coin blip |
| screenshake | linear pool, everything wobbles alike | trauma² curve — small shakes near-invisible, big ones punchy |

---

### Task 1: `JH.JUICE` config, trauma shake, SFX pitch parameter

**Files:**
- Modify: `js/config.js` (new block after `JH.FIRE`, ~line 292)
- Modify: `js/assets.js:40-73` (`AudioFX.play` gains `opt.pitch`)
- Modify: `js/game.js:33` (state fields), `:285` (reset), `:710` (`shake`), `:848-849` (respawn reset), `:988` (decay → `tickShake`), `:1224-1226` (render translate)
- Create: `tests/juice.test.js`

**Interfaces:**
- Produces: `JH.JUICE` (shape below); `Game.shake(n, dirX?)` (API-compatible; optional impact direction kicks the shake away); `Game.tickShake(dt)`; `Game.shakeOffset() → {x, y}`; `AudioFX.play(name, opt?)` with `opt.pitch` frequency multiplier; Game fields `trauma`, `shakeKickX`, `lootVacuumT`, `splats` (consumed by Tasks 2–3).

- [ ] **Step 1: Write the failing tests**

Create `tests/juice.test.js`:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");

global.window = global.window || {};
global.window.addEventListener = global.window.addEventListener || (() => {});
require("../js/config.js");
global.window.JH.Loader = { img: () => ({}) };
require("../js/world.js");
require("../js/upgrades.js");
require("../js/entities.js");
require("../js/game.js");
const JH = global.window.JH;

test("JH.JUICE: hit-stop tier table and shake constants exist", () => {
  const J = JH.JUICE;
  assert.ok(J, "JH.JUICE missing");
  for (const k of ["kill", "heavyKill", "waveEnd", "playerHit", "domePop", "bossPhase"])
    assert.strictEqual(typeof J.hitstop[k], "number", "hitstop." + k);
  assert.ok(J.hitstop.waveEnd > J.hitstop.heavyKill && J.hitstop.heavyKill > J.hitstop.kill);
  assert.ok(Array.isArray(J.heavyTypes) && J.heavyTypes.includes("furnace"));
  for (const k of ["traumaDiv", "traumaDecay", "shakeMax", "shakeScale", "vacuumDur",
                   "splatCap", "splatFade", "comboPitchCap", "comboWaterRefund"])
    assert.strictEqual(typeof J[k], "number", k);
});

function shakeStub() { return { trauma: 0, shakeKickX: 0 }; }

test("shake: trauma accumulates and caps at 1", () => {
  const g = shakeStub();
  JH.Game.shake.call(g, 5);
  const t1 = g.trauma;
  assert.ok(t1 > 0 && t1 < 1);
  for (let i = 0; i < 20; i++) JH.Game.shake.call(g, 12);
  assert.strictEqual(g.trauma, 1);
});

test("shake: amplitude follows trauma-squared and respects shakeScale", () => {
  const g = shakeStub();
  g.trauma = 1;
  let max = 0;
  for (let i = 0; i < 200; i++) {
    const o = JH.Game.shakeOffset.call(g);
    max = Math.max(max, Math.abs(o.y));
  }
  assert.ok(max <= 0.5 * JH.JUICE.shakeMax * JH.JUICE.shakeScale + 1e-9);
  assert.ok(max > 0.2 * JH.JUICE.shakeMax, "full trauma should visibly shake");
  g.trauma = 0.3;                       // trauma² = 0.09 → tiny
  let max2 = 0;
  for (let i = 0; i < 200; i++) max2 = Math.max(max2, Math.abs(JH.Game.shakeOffset.call(g).y));
  assert.ok(max2 < max * 0.2, "small trauma should be near-invisible (squared curve)");
});

test("tickShake: trauma decays to zero and clears the kick", () => {
  const g = shakeStub();
  JH.Game.shake.call(g, 8, -1);
  assert.strictEqual(g.shakeKickX, -1);
  for (let i = 0; i < 120; i++) JH.Game.tickShake.call(g, 1 / 60);
  assert.strictEqual(g.trauma, 0);
  assert.strictEqual(g.shakeKickX, 0);
  const o = JH.Game.shakeOffset.call(g);
  assert.deepStrictEqual(o, { x: 0, y: 0 });
});

test("shake: directional kick biases x away from impact", () => {
  const g = shakeStub();
  JH.Game.shake.call(g, 10, -1);        // impact from the right → kick left
  let mean = 0;
  for (let i = 0; i < 400; i++) mean += JH.Game.shakeOffset.call(g).x;
  mean /= 400;
  assert.ok(mean < -0.5, "offsets should bias in the kick direction, got " + mean);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/juice.test.js`
Expected: FAIL — `JH.JUICE` undefined / `shakeOffset` not a function.

- [ ] **Step 3: Implement config**

In `js/config.js`, after the `JH.FIRE` block:

```js
  // ---- Juice / game-feel tunables --------------------------------------
  JH.JUICE = {
    // Hit-stop tier table — every freeze routes through game.hitStop, which
    // takes the max of pending freezes (simultaneous kills never sum).
    hitstop: {
      kill: 0.05,        // regular enemy death
      heavyKill: 0.09,   // elite, or heavy-frame type below
      waveEnd: 0.14,     // last kill of an active wave
      playerHit: 0.07,
      domePop: 0.10,     // reserved: dome/wall break
      bossPhase: 0.20,   // reserved: boss phase transitions
    },
    heavyTypes: ["bulwark", "furnace", "smelt"],
    // Trauma screenshake: shake(n) adds n/traumaDiv trauma (cap 1); the
    // rendered amplitude is trauma^2 * shakeMax px and trauma decays
    // traumaDecay/sec — big hits punch, small ones barely register.
    traumaDiv: 16,
    traumaDecay: 1.1,
    shakeMax: 14,
    shakeScale: 1,        // player-facing intensity multiplier (settings hook)
    vacuumDur: 1.2,       // wave-ender loot-magnet duration (sec)
    splatCap: 40,         // wet kill decals kept at once (oldest culled)
    splatFade: 2.0,       // splat decal lifetime (sec)
    comboPitchCap: 12,    // kill-sound ladder tops out +12 semitones
    comboWaterRefund: 10, // GUSH every-5th-kill water crumb
  };
```

- [ ] **Step 4: Implement `AudioFX.play` pitch**

In `js/assets.js`, `AudioFX.play`: change the signature to `play(name, opt)` and, in the oscillator branch, derive frequency once and reuse it in the ramps:

```js
      } else {
        const osc = this.ctx.createOscillator();
        osc.type = def.type === "saw" ? "sawtooth" : def.type;
        const freq = def.freq * ((opt && opt.pitch) || 1);
        osc.frequency.setValueAtTime(freq, t);
        if (name === "coin" || name === "win" || name === "buy" || name === "upgrade")
          osc.frequency.exponentialRampToValueAtTime(freq * 1.6, t + def.dur);
        if (name === "hurt" || name === "die")
          osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + def.dur);
        osc.connect(g);
        osc.start(t); osc.stop(t + def.dur);
      }
```

- [ ] **Step 5: Implement the trauma model in `js/game.js`**

State fields (line ~33): replace `shakeAmt: 0,` with:

```js
    trauma: 0, shakeKickX: 0,   // trauma screenshake (see JH.JUICE)
    lootVacuumT: 0,             // wave-ender loot vacuum time remaining
    splats: [],                 // wet kill decals {x, y, rx, t}
```

Replace `shake` (line ~710):

```js
    // Add n/traumaDiv trauma (legacy 1..14 scale at existing call sites).
    // Optional dirX kicks the shake away from an impact direction.
    shake(n, dirX) {
      this.trauma = Math.min(1, (this.trauma || 0) + n / JH.JUICE.traumaDiv);
      if (dirX) this.shakeKickX = dirX > 0 ? 1 : -1;
    },
    tickShake(dt) {
      if (this.trauma > 0) this.trauma = Math.max(0, this.trauma - JH.JUICE.traumaDecay * dt);
      else this.shakeKickX = 0;
    },
    shakeOffset() {
      if (!this.trauma) return { x: 0, y: 0 };
      const amp = this.trauma * this.trauma * JH.JUICE.shakeMax * JH.JUICE.shakeScale;
      return {
        x: ((Math.random() - 0.5) + (this.shakeKickX || 0) * 0.6) * amp,
        y: (Math.random() - 0.5) * amp,
      };
    },
```

Decay (line ~988): replace `if (this.shakeAmt > 0) this.shakeAmt = Math.max(0, this.shakeAmt - 24 * dt);` with:

```js
      this.tickShake(dt);
      if (this.lootVacuumT > 0) this.lootVacuumT -= dt;
```

Render (line ~1224): replace the `if (this.shakeAmt > 0) { ctx.translate(...) }` block with:

```js
      const so = this.shakeOffset();
      if (so.x || so.y) ctx.translate(so.x, so.y);
```

Resets: at line ~285 replace `this.shakeAmt = 0;` with `this.trauma = 0; this.shakeKickX = 0; this.lootVacuumT = 0; this.splats = [];` and at the respawn reset (~848, after `this.hitStopTimer = 0;`) add the same line.

- [ ] **Step 6: Run the full suite**

Run: `npm test > /tmp/t.out 2>&1; ec=$?; grep -E "^ℹ (tests|pass|fail)" /tmp/t.out; echo exit=$ec`
Expected: all pass, exit 0.

- [ ] **Step 7: Commit**

```bash
git checkout -b juice-pass
git add js/config.js js/assets.js js/game.js tests/juice.test.js
git commit -m "feat(juice): JH.JUICE tunables, trauma screenshake, SFX pitch param

trauma^2 amplitude curve gives per-source discipline the linear pooled
accumulator couldn't: milestone taps are near-invisible, Quake stomps
punch. shake(n) call sites unchanged; optional dirX kicks away from
impact. shakeScale is the future settings-panel hook."
```

---

### Task 2: `killJuice` — tiered hit-stop, pitch ladder, KillPop, heavy boom+splat

**Files:**
- Modify: `js/game.js` (new methods after `hitStop`, ~line 712)
- Modify: `js/entities.js:797-805` (`Enemy.die`), `:603-619` (`Player.takeHit` tier + directional shake)
- Modify: `js/entities.js` (new `KillPop` class next to `JH.FxBurst` — search `JH.FxBurst =`)
- Modify: `js/assets.js:261` (silhouette alpha cap override)
- Test: `tests/juice.test.js`, `tests/entities.test.js` (stub gains `killJuice`)

**Interfaces:**
- Consumes: `JH.JUICE` tiers, `Game.shake`, `lootVacuumT`, `splats` (Task 1).
- Produces: `Game.killJuice(e)`, `Game.addSplat(x, y, w)`, `JH.KillPop` (ember: `update(dt) → alive`, `draw(ctx, cam)`), `opt.flashCap` in `Assets.draw`. Task 3 consumes `lootVacuumT`/`splats` values set here.

- [ ] **Step 1: Write the failing tests**

Append to `tests/juice.test.js`:

```js
// Stub with the real juice methods bound, so Enemy.die exercises them.
function killStub(waveActive) {
  const g = {
    waveActive: !!waveActive, combo: 0, kills: 0,
    comboTimer: 0, comboFlash: 0,
    enemies: [], embers: [], splats: [], particles: [], pickups: [],
    player: { x: 0, y: 0, alive: true, stats: { maxWater: 100 }, water: 50, regenLock: 1 },
    hitStopTimer: 0, lootVacuumT: 0, trauma: 0, shakeKickX: 0,
    audio: { played: [], play(k, o) { this.played.push({ k, o }); } },
    dropLoot() {}, onEnemyKilled(e) { JH.Game.onEnemyKilled.call(this, e); },
    hitStop(s) { this.hitStopTimer = Math.max(this.hitStopTimer, s); },
    shake(n, d) { JH.Game.shake.call(this, n, d); },
    killJuice(e) { JH.Game.killJuice.call(this, e); },
    addSplat(x, y, w) { JH.Game.addSplat.call(this, x, y, w); },
  };
  return g;
}

test("killJuice: regular kill = kill tier + white KillPop", () => {
  const g = killStub(false);
  const e = new JH.Enemy("mook", 50, 40);
  g.enemies.push(e);
  e.die(g);
  assert.strictEqual(g.hitStopTimer, JH.JUICE.hitstop.kill);
  assert.ok(g.embers.some((m) => m instanceof JH.KillPop), "KillPop spawned");
  assert.strictEqual(g.splats.length, 0, "no splat for a mook");
});

test("killJuice: elite kill = heavy tier + boom + wet splat", () => {
  const g = killStub(false);
  const e = new JH.Enemy("mook", 50, 40);
  e.makeElite();
  g.enemies.push(e);
  e.die(g);
  assert.strictEqual(g.hitStopTimer, JH.JUICE.hitstop.heavyKill);
  assert.ok(g.embers.some((m) => m instanceof JH.FxBurst), "boom FxBurst spawned");
  assert.strictEqual(g.splats.length, 1);
});

test("killJuice: last kill of an active wave = waveEnd tier + loot vacuum", () => {
  const g = killStub(true);
  const e1 = new JH.Enemy("mook", 50, 40);
  const e2 = new JH.Enemy("mook", 90, 40);
  g.enemies.push(e1, e2);
  e1.die(g);
  assert.strictEqual(g.hitStopTimer, JH.JUICE.hitstop.kill, "not last yet");
  assert.strictEqual(g.lootVacuumT, 0);
  e2.die(g);
  assert.strictEqual(g.hitStopTimer, JH.JUICE.hitstop.waveEnd);
  assert.strictEqual(g.lootVacuumT, JH.JUICE.vacuumDur);
});

test("killJuice: kill sound pitch climbs with the combo and caps", () => {
  const g = killStub(false);
  for (let i = 0; i < 15; i++) {
    const e = new JH.Enemy("mook", 50, 40);
    g.enemies.push(e);
    e.die(g);
  }
  const dies = g.audio.played.filter((s) => s.k === "die");
  assert.strictEqual(dies[0].o.pitch, 1, "first kill at base pitch");
  assert.ok(dies[5].o.pitch > dies[1].o.pitch, "ladder climbs");
  const cap = Math.pow(2, JH.JUICE.comboPitchCap / 12);
  assert.ok(Math.abs(dies[14].o.pitch - cap) < 1e-9, "caps at +12 semitones");
});

test("addSplat: cap culls oldest", () => {
  const g = killStub(false);
  for (let i = 0; i < JH.JUICE.splatCap + 5; i++) g.addSplat(i, 40, 16);
  assert.strictEqual(g.splats.length, JH.JUICE.splatCap);
  assert.strictEqual(g.splats[0].x, 5, "oldest culled first");
});

test("KillPop: expires after ~70ms", () => {
  const kp = new JH.KillPop(new JH.Enemy("mook", 10, 40));
  for (let i = 0; i < 3; i++) kp.update(0.016);
  assert.ok(!kp.dead);
  for (let i = 0; i < 3; i++) kp.update(0.016);
  assert.ok(kp.dead);
});

test("Player.takeHit: playerHit tier + shake kicked away from impact", () => {
  const p = (function () { JH.Upgrades.reset(); return new JH.Player(60, 40); })();
  const g = killStub(false);
  g.player = p;
  JH.Game.shake.call(g, 0);   // ensure fields
  p.takeHit(10, g, 100);      // hit from the right
  assert.strictEqual(g.hitStopTimer, JH.JUICE.hitstop.playerHit);
  assert.strictEqual(g.shakeKickX, -1, "kick away from impact (leftward)");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/juice.test.js`
Expected: FAIL — `killJuice`/`KillPop` undefined; old 0.04/0.06 hit-stop values.

- [ ] **Step 3: Implement `killJuice`/`addSplat` in `js/game.js`** (after `hitStop`, line ~712)

```js
    // Per-kill presentation, one place: tiered hit-stop, pitch-laddered kill
    // sound, white kill pop, heavy-kill boom + wet splat, and the wave-ender
    // beat (big freeze + shake + arena-wide loot vacuum). Bosses bypass this
    // via their own die() overrides. Simultaneous kills take the strongest
    // freeze (hitStop maxes), never a sum.
    killJuice(e) {
      const J = JH.JUICE;
      const heavy = !!e.elite || J.heavyTypes.includes(e.type);
      const last = this.waveActive && this.enemies.every((x) => x.dead || x === e);
      this.audio.play("die", { pitch: Math.pow(2, Math.min(this.combo, J.comboPitchCap) / 12) });
      this.hitStop(last ? J.hitstop.waveEnd : heavy ? J.hitstop.heavyKill : J.hitstop.kill);
      if (last) { this.shake(5); this.lootVacuumT = J.vacuumDur; }
      if (heavy) {
        this.embers.push(new JH.FxBurst(e.x, e.y, e.bodyW > 18 ? "boom-mid" : "boom-small", { scale: 0.55 }));
        this.addSplat(e.x, e.y, e.bodyW);
      }
      this.embers.push(new JH.KillPop(e));
    },
    // Wet ground decal where a heavy kill landed (drawn in render; capped).
    addSplat(x, y, w) {
      this.splats.push({ x, y, rx: w * 1.1, t: 0 });
      if (this.splats.length > JH.JUICE.splatCap) this.splats.shift();
    },
```

- [ ] **Step 4: Rewire `Enemy.die` and `Player.takeHit` in `js/entities.js`**

`Enemy.die` — replace:

```js
      game.audio.play("die");
      game.hitStop(0.04);
```

with:

```js
      game.killJuice(this);
```

`Player.takeHit` — replace:

```js
      game.shake(5);
      game.hitStop(0.06);
```

with:

```js
      game.shake(5, dir);                       // kick away from the impact
      game.hitStop(JH.JUICE.hitstop.playerHit);
```

- [ ] **Step 5: Add `KillPop` in `js/entities.js`** (next to the `JH.FxBurst` definition)

```js
  // One-shot kill confirm: the dead enemy's sprite stamped once more through
  // the hurt-flash compositor — bright white, 1.3x, ~70ms. Rides game.embers.
  class KillPop {
    constructor(e) {
      this.type = e.type; this.x = e.x; this.y = e.y; this.z = e.z || 0;
      this.facing = e.facing || 1; this.frame = e.frame || 0; this.state = e.state;
      this.t = 0; this.dead = false;
    }
    update(dt) { this.t += dt; if (this.t >= 0.07) this.dead = true; return !this.dead; }
    draw(ctx, cam) {
      Assets.draw(ctx, this.type, this.x - cam, Geo.feetScreenY(this.y, this.z), this.facing, {
        state: this.state, frame: this.frame, t: this.t,
        hurt: true, hurtAlpha: 1, flashCap: 0.9, scale: 1.3,
      });
    }
  }
  JH.KillPop = KillPop;
```

- [ ] **Step 6: `opt.flashCap` in `js/assets.js`** (line ~261) — replace:

```js
        ctx.globalAlpha = Math.min(opt.hurtAlpha, HURT_FLASH_MAX_ALPHA);
```

with:

```js
        // flashCap lets one-shot effects (KillPop) exceed the steady-stream
        // cap without whiting out enemies under continuous spray.
        ctx.globalAlpha = Math.min(opt.hurtAlpha, opt.flashCap || HURT_FLASH_MAX_ALPHA);
```

- [ ] **Step 7: Extend the shared stub in `tests/entities.test.js`**

`stubGame`'s return object gains one line next to `dropLoot() {}`:

```js
    killJuice() {},
```

- [ ] **Step 8: Run the full suite**

Run: `npm test > /tmp/t.out 2>&1; ec=$?; grep -E "^ℹ (tests|pass|fail)" /tmp/t.out; echo exit=$ec`
Expected: all pass (the old Fuse-death tests work via the stub's no-op `killJuice`).

- [ ] **Step 9: Commit**

```bash
git add js/game.js js/entities.js js/assets.js tests/juice.test.js tests/entities.test.js
git commit -m "feat(juice): tiered kill presentation via Game.killJuice

Kills scale: regular 0.05s freeze + white silhouette pop; elite/heavy
0.09s + boom + wet splat decal; last kill of a wave 0.14s + shake +
loot-vacuum flag. Kill sound pitches up a semitone per combo step
(cap +12). Player hits use the 0.07 tier and kick the shake away from
the impact."
```

---

### Task 3: Wave-ender loot vacuum + splat decals rendered

**Files:**
- Modify: `js/entities.js:1668-1672` (`Pickup.update` magnet)
- Modify: `js/game.js:1058` area (splat fade in the play update), `:1248` area (draw splats after fire patches)
- Test: `tests/juice.test.js`

**Interfaces:**
- Consumes: `game.lootVacuumT`, `game.splats` (Tasks 1–2), `JH.GROUND_RY`.

- [ ] **Step 1: Write the failing test**

Append to `tests/juice.test.js`:

```js
test("Pickup: arena-wide vacuum while lootVacuumT is live", () => {
  const mk = () => { const p = new JH.Pickup("suds", 400, 40, 5); p.grounded = true; p.z = 0; return p; };
  const base = { player: { x: 60, y: 40 }, lootVacuumT: 0 };
  const still = mk();
  still.update(0.016, base);
  assert.strictEqual(still.x, 400, "no magnet from 340px away normally");
  const vac = mk();
  vac.update(0.016, Object.assign({}, base, { lootVacuumT: 1 }));
  assert.ok(vac.x < 400, "vacuum pulls from across the arena");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/juice.test.js` — Expected: FAIL (no pull at 340px).

- [ ] **Step 3: Implement the Pickup magnet** — in `Pickup.update`, replace:

```js
      const pl = game.player;
      // gentle magnet when close
      const dx = pl.x - this.x, dy = pl.y - this.y, dist = Math.hypot(dx, dy);
      if (dist < 30) { this.x += dx * 4 * dt; this.y += dy * 4 * dt; }
```

with:

```js
      const pl = game.player;
      // Gentle magnet when close; during the wave-ender beat every pickup on
      // the field vacuums to Jon (kills the post-wave coin walk).
      const vac = game.lootVacuumT > 0;
      const dx = pl.x - this.x, dy = pl.y - this.y, dist = Math.hypot(dx, dy);
      if (vac || dist < 30) {
        const pull = vac ? 12 : 4;
        this.x += dx * pull * dt; this.y += dy * pull * dt;
      }
```

- [ ] **Step 4: Splat fade + draw in `js/game.js`**

In the play update, after `for (const fp of this.firePatches) fp.update(dt, this);` add:

```js
      this.splats = this.splats.filter((s) => { s.t += dt; return s.t < JH.JUICE.splatFade; });
```

In `render()`, directly after the fire-patch draw loop (`for (const fp of this.firePatches) fp.draw(ctx, cam);`) add:

```js
        // wet kill splats — ground decals under pickups/actors, fading out
        for (const s of this.splats) {
          const k = 1 - s.t / JH.JUICE.splatFade;
          ctx.save();
          ctx.globalAlpha = 0.25 * k;
          ctx.fillStyle = JH.PAL.water;
          ctx.beginPath();
          ctx.ellipse(Math.round(s.x - cam), Math.round(JH.Geo.feetScreenY(s.y, 0)),
            s.rx, s.rx * JH.GROUND_RY, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
```

- [ ] **Step 5: Run the full suite** (exit-code gated). Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add js/entities.js js/game.js tests/juice.test.js
git commit -m "feat(juice): wave-ender loot vacuum + wet splat decals rendered

Clearing a wave hoovers every pickup to Jon for 1.2s; heavy kills leave
a water splat that fades over 2s (capped at 40, oldest culled)."
```

---

### Task 4: Kill the hurt-blink, add squash-stretch

**Files:**
- Modify: `js/assets.js` — delete all 15 blink lines (12× `if (opt.hurt && (f & 1)) return;` at 383, 404, 425, 446, 473, 498, 516, 542, 637, 653, 708, plus `:612` (`(opt.t || 0) * 10`), `:872` (`t * 8`), `:996` (`(opt.t || 0) * 8`), `:1114` (`(opt.frame | 0) & 1`)); add the squash transform in `Assets.draw` (~line 224)
- Modify: `js/entities.js:114` (Entity ctor), `:137` (timer decay), `:148` (`hurt()`), `:884-889` (Enemy.draw opt), `:633-640` area (Player.draw opt), `:3760` area (Fuse landing)
- Test: `tests/juice.test.js`

**Interfaces:**
- Produces: `Entity.squashT` (seconds, set 0.09 by `hurt()`); painters receive `opt.squash` in [0..1]; `Assets.draw` applies `scaleX 1+0.15s / scaleY 1-0.15s` anchored at the feet.

- [ ] **Step 1: Write the failing test**

Append to `tests/juice.test.js`:

```js
test("hurt() arms both the flash and the squash", () => {
  const e = new JH.Enemy("mook", 0, 0);
  e.hurt();
  assert.strictEqual(e.flashTimer, 0.18);
  assert.ok(e.squashT > 0 && e.squashT <= 0.12);
});
```

- [ ] **Step 2: Run to verify it fails** (`squashT` undefined → `assert.ok(undefined > 0)` fails).

- [ ] **Step 3: Implement entity side** in `js/entities.js`:

Line 114 (`this.hurtTimer = 0; this.flashTimer = 0;`) becomes:

```js
      this.hurtTimer = 0; this.flashTimer = 0; this.squashT = 0;
```

Line 137, next to the flash decay, add:

```js
      if (this.squashT > 0) this.squashT -= dt;
```

Line 148:

```js
    hurt() { this.flashTimer = 0.18; this.squashT = 0.09; }
```

Enemy.draw opt (line ~884) — add one property:

```js
        squash: this.squashT > 0 ? Math.min(1, this.squashT / 0.09) : 0,
```

Player.draw's `Assets.draw(ctx, "jon", ...)` opt gains the same `squash:` line.

Fuse landing (the `this.z = 0; this.vz = 0; this.dropping = false;` line in `Fuse.update`) — add after it:

```js
          this.squashT = 0.12;   // landing squash
```

- [ ] **Step 4: Implement the central transform + delete the blinks** in `js/assets.js`:

In `Assets.draw`, right after `ctx.save();` (line ~224):

```js
      // Squash-stretch anchored at the feet baseline: wider + shorter while
      // opt.squash (0..1, timer-driven) decays. Applies to the silhouette
      // stamp too since it shares this transform.
      const squash = Math.min(1, opt && opt.squash || 0);
      if (squash > 0) {
        ctx.translate(x, y);
        ctx.scale(1 + 0.15 * squash, 1 - 0.15 * squash);
        ctx.translate(-x, -y);
      }
```

(Note: `opt` is normalized two lines above; keep the guard order as written.)

Then delete all 15 blink lines listed in **Files** — the silhouette flash is the sole hurt read.

- [ ] **Step 5: Verify the blinks are gone**

Run: `grep -cE "opt\.hurt && \(" js/assets.js` — Expected output: `0` (the compositor check at ~237 is `opt.hurt && opt.hurtAlpha`, which doesn't match this pattern; if it does on your grep, confirm the only remaining `opt.hurt` uses are the two in `Assets.draw` itself).

- [ ] **Step 6: Run the full suite** (exit-code gated). Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add js/assets.js js/entities.js tests/juice.test.js
git commit -m "feat(juice): silhouette flash is the one hurt read; squash-stretch on hit

Deleted the every-other-frame hurt blink from all 15 painters — it read
as flicker and deleted the sprite half the time, fighting the white
flash. hurt() now also arms a 90ms squash (1.15x/0.85x at the feet),
applied centrally in Assets.draw; Fuse drop-ins squash on landing."
```

---

### Task 5: GUSH milestone crumb

**Files:**
- Modify: `js/game.js:676-685` (`onEnemyKilled`)
- Test: `tests/juice.test.js`

**Interfaces:**
- Consumes: `JH.JUICE.comboWaterRefund`, `AudioFX.play(name, {pitch})`.

- [ ] **Step 1: Write the failing test**

Append to `tests/juice.test.js`:

```js
test("GUSH x5 milestone refunds water and skips the regen delay", () => {
  const g = killStub(false);
  g.combo = 4;
  g.player.water = 40; g.player.regenLock = 0.8;
  JH.Game.onEnemyKilled.call(g, null);
  assert.strictEqual(g.combo, 5);
  assert.strictEqual(g.player.water, 40 + JH.JUICE.comboWaterRefund);
  assert.strictEqual(g.player.regenLock, 0);
  assert.ok(g.audio.played.some((s) => s.k === "coin"), "milestone blip");
});

test("GUSH: non-milestone kills grant nothing", () => {
  const g = killStub(false);
  g.combo = 2;
  g.player.water = 40;
  JH.Game.onEnemyKilled.call(g, null);
  assert.strictEqual(g.player.water, 40);
});
```

- [ ] **Step 2: Run to verify it fails** (water unchanged at milestone).

- [ ] **Step 3: Implement** — replace the milestone line in `onEnemyKilled`:

```js
      if (this.combo >= 3 && this.combo % 5 === 0) this.shake(3);  // milestone pop
```

with:

```js
      // Milestone crumb every 5th chained kill: pop + a capped water refund
      // and one skipped regen delay. GUSH never touches damage or suds.
      if (this.combo >= 3 && this.combo % 5 === 0) {
        this.shake(3);
        const p = this.player;
        if (p && p.alive) {
          p.water = Math.min(p.stats.maxWater, p.water + JH.JUICE.comboWaterRefund);
          p.regenLock = 0;
          this.audio.play("coin", { pitch: 1.5 });
        }
      }
```

Also update the comment above `this.combo++` from "Self-contained feedback only (display + a milestone shake) — never affects damage/economy" to "Feedback + a capped water crumb at milestones — never affects damage or suds."

- [ ] **Step 4: Run the full suite** (exit-code gated). Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add js/game.js tests/juice.test.js
git commit -m "feat(juice): GUSH x5 milestone refunds 10 water + skips regen delay once

The minimum mechanical crumb the vision doc asked for: the meter now
matters without touching damage or economy. Milestone plays a pitched
coin blip on top of the existing shake."
```

---

### Task 6: Browser smoke + handoff

**Files:** none (verification)

- [ ] **Step 1: Full suite** — `npm test`, exit-code gated.

- [ ] **Step 2: Headless smoke** (dev server + playwright pattern from the previous passes; `require("D:/Projects/jon-hose/node_modules/playwright")`, `channel: "chrome"`):

1. Boot → title → Enter → `play`; assert no `pageerror`s.
2. Eval: spawn a mook next to Jon, `e.takeDamage(999, JH.Game, 1)` — assert `JH.Game.hitStopTimer > 0` and an ember with constructor name `KillPop` existed that frame; screenshot.
3. Eval: `JH.Game.shake(11)` — screenshot twice ~100ms apart (frames should differ = shake alive).
4. Eval: spawn 3 pickups far away, set `JH.Game.lootVacuumT = 1`, wait 500ms — assert pickups' x moved toward the player.
5. Screenshot a hurt enemy under spray if convenient; kill the server after.

- [ ] **Step 3: Push branch + STOP for the playtest gate**

```bash
git push -u origin juice-pass
```

Report the feel-deltas table and hand off. Playtest focus: kill rhythm in a dense wave (does 0.05 freeze feel chunky or sticky?), an elite kill, a wave-ender (freeze + vacuum), getting hit (directional kick), whether the blink's absence reads clearly under continuous spray, and the pitch ladder as a combo builds. Tuning knobs are ALL in `JH.JUICE`.

---

## Self-review notes

- **Spec coverage:** item 1 tier table → Tasks 1–2 (domePop/bossPhase reserved as constants; their callers are the Bulwark/boss-pattern specs). Item 2 trauma shake → Task 1 (directional kick on player-hit only for now). Item 3 blink/squash → Task 4. Item 4 kill confirms → Tasks 2–3 (pop, boom+splat, wave-ender vacuum). Item 5 audio ladder + crumb → Tasks 2 & 5. Items 6–8 intentionally out of scope.
- **Open questions resolved:** Q1 max-not-sum (hitStop already maxes; documented), Q3 splat cap 40 oldest-first, Q4 semitone ladder first (shimmer layers can come with the audio-pack item 6).
- **Judgment calls:** `killJuice` lives on Game (needs wave/combo/splat state); bosses bypass it (their death seqs are item 7). Pitch uses the pre-increment combo so kill #1 is base pitch. Wave-ender detection is "every enemy dead while waveActive", which also fires on clearing the field mid-holdout — acceptable (it IS a clear-the-field beat). KillPop caps `flashCap` at 0.9 rather than removing the steady-stream cap.
- **Type consistency check:** `killJuice(e)`/`addSplat(x,y,w)`/`KillPop(e)`/`shakeOffset()→{x,y}`/`opt.squash`/`opt.flashCap` used identically across tasks.
