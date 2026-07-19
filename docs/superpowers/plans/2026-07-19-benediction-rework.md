# Benediction Rework Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved benediction rework (spec `docs/superpowers/specs/2026-07-19-benediction-rework-design.md`): 3 tone-downs, 8 reworks, scaling fixes, 3 duo redesigns, legendary polish — no auto-picks, no dead cards.

**Architecture:** All tunables land in a new `JH.BENE_TUNE` config block (house rule: config.js is the single source of truth); every damage rider samples `player.stats.sprayDamage` at application time; every new AoE radius lives in `JH.BENE_AOE` and is used by BOTH hit test and drawn ring. Mechanics live where their systems already live: `balance.js` (pure multipliers, offer logic in `benedictions.js`), `entities.js` (player/enemy/zone behavior), `game.js` (HUD).

**Tech Stack:** Vanilla JS (IIFE modules on `window.JH`), node:test suite (dual-export pattern), headless playwright verification.

## Global Constraints

- Playtest before commit applies to FEEL only — these tasks commit code + tests per task (branch `air-act`, never to main).
- Tests derive expected numbers from `JH.BENE_TUNE` / `JH.BENE_AOE` / defs — never repeat literals.
- Rim is hitbox: any drawn AoE and its hit test read the same `BENE_AOE` constant.
- All changed descs use styled markup: `{g:...}` green values, `{i:dmg|range|speed|knockback|water|hp}` inline icons.
- Fire tree copy/FX read as scald/steam, never flame. Renames: Firestorm → "Steam Devil", Bushfire → "Boilover" (ids stay `firestorm` / `bushfire` — save/telemetry compat).
- Suite baseline 400/400 green before and after every task.

---

### Task 1: Config foundation — BENE_TUNE + BENE_AOE

**Files:**
- Modify: `js/config.js` (next to the existing `JH.BENE_AOE` block, ~line 78)
- Test: `tests/benedictions.test.js` (append)

**Interfaces:**
- Produces: `JH.BENE_TUNE` (object below, exact keys) and extended `JH.BENE_AOE` — every later task reads these.

- [ ] **Step 1: Write the failing test**

```js
test("BENE_TUNE and BENE_AOE carry the rework constants", () => {
  const T = JH.BENE_TUNE, A = JH.BENE_AOE;
  // presence + sane ranges only — values are design-owned
  for (const k of ["splitArcFrac", "splitArcFracII", "wakePull", "wakePullII",
    "overflowHigh", "overflowHighII", "overflowLow", "overflowLowII",
    "overflowRegenMult", "overflowRegenMultII", "baptizeMax", "baptizeMaxII",
    "scaldDpsFrac", "scaldDpsFracII", "backdraftPopFrac",
    "hazardBootsCd", "hazardBootsCdII", "hazardPopFrac", "hazardPopFracII",
    "quakeChargeS", "quakeChargeSII", "quakeDmgFrac", "quakeDmgFracII",
    "gravelEveryS", "gravelEverySII", "gravelDmgFrac", "gravelKnock",
    "galeStride", "galeStrideII", "tailwindRange", "tailwindRangeII",
    "tailwindKnock", "tailwindKnockII",
    "eyeHpFrac", "eyeHpFracII", "eyeShieldS", "eyeShieldSII", "eyeCd",
    "steamVentDpsFrac", "mudSlowCap", "mudSlowCapII", "mudSlowDmgII",
    "devilLife", "devilSpeed", "sermonWaveFrac",
    "boiloverScaldMult", "boiloverRecheckS",
    "whirlGustFrac", "dropletPopFrac", "bedrockHp", "bedrockHpII"])
    assert.ok(typeof T[k] === "number" && T[k] > 0, k + " present");
  for (const k of ["focusQuake", "steamVent", "dropletPop", "whirlwindSweep", "bushfireSpread"])
    assert.ok(A[k] > 0, "BENE_AOE." + k);
  assert.ok(A.whirlwindSweep === 20, "whirlwind sweep widened per spec");
});
```

- [ ] **Step 2: Run — expect FAIL** (`node --test tests/benedictions.test.js`)

- [ ] **Step 3: Implement in config.js**

```js
  // Benediction rework tunables (spec 2026-07-19). Fractions are of the
  // CURRENT sprayDamage stat, sampled at application time.
  JH.BENE_TUNE = {
    splitArcFrac: 0.35, splitArcFracII: 0.50,     // arc dmg share (II: 2 targets)
    splitTargetsII: 2,
    wakePull: 40, wakePullII: 70,                 // px/s puddle pull
    wakeRadiusIIMult: 1.4,
    overflowHigh: 0.8, overflowHighII: 0.7,       // tank frac for +dmg edge
    overflowLow: 0.2, overflowLowII: 0.3,         // tank frac for regen edge
    overflowDmg: 0.2, overflowDmgII: 0.3,
    overflowRegenMult: 2, overflowRegenMultII: 3,
    baptizeMax: 0.15, baptizeMaxII: 0.25,         // at wetness 1.0, linear from 0
    scaldDpsFrac: 0.10, scaldDpsFracII: 0.18,     // of sprayDamage
    backdraftPopFrac: 0.20,
    hazardBootsCd: 10, hazardBootsCdII: 6,
    hazardPopFrac: 0.30, hazardPopFracII: 0.50,
    quakeChargeS: 2, quakeChargeSII: 1.5,
    quakeDmgFrac: 0.40, quakeDmgFracII: 0.60,
    gravelEveryS: 3, gravelEverySII: 2,
    gravelDmgFrac: 0.60, gravelKnock: 220,
    gravelTapGraceS: 0.3,                          // spray gaps <= this don't reset the timer
    galeStride: 0.25, galeStrideII: 0.40,
    tailwindRange: 0.20, tailwindRangeII: 0.30,
    tailwindKnock: 0.20, tailwindKnockII: 0.30,
    eyeHpFrac: 0.30, eyeHpFracII: 0.40,
    eyeShieldS: 1.5, eyeShieldSII: 2.0, eyeCd: 30,
    steamVentDpsFrac: 0.15,
    mudSlowCap: 0.50, mudSlowCapII: 0.65, mudSlowDmgII: 0.10,
    mudDecayS: 1.0, mudStackPerS: 0.5,             // slow builds 50%/s of cap while sprayed
    devilLife: 2, devilSpeed: 80, devilNudge: 60,
    sermonWaveFrac: 0.40,
    boiloverScaldMult: 1.5, boiloverRecheckS: 1,
    whirlGustFrac: 0.25, dropletPopFrac: 0.10,
    bedrockHp: 25, bedrockHpII: 45,
    sureGripSlowMult: 0.5,                          // base: half the spray slow (II: none)
  };
```
And in the existing `JH.BENE_AOE` block: set `whirlwindSweep: 20` and add `focusQuake: 30, steamVent: 24, dropletPop: 12` (keep `aftershockSplash` REMOVED — Aftershock's wall-slam is replaced; delete the constant and its slam code in Task 7).

- [ ] **Step 4: Run test — PASS**; run full suite — the old wall-slam code still compiles (constant deletion happens in Task 7, so keep `aftershockSplash` until then — instead mark it with a comment `// removed in Focus Quake task`). Adjust: leave the key in place for now.

- [ ] **Step 5: Commit** `git commit -m "feat(bene): BENE_TUNE config block + BENE_AOE additions"`

---

### Task 2: Pure multipliers — Overflow edges + Baptize wetness scaling (balance.js)

**Files:**
- Modify: `js/balance.js` `beneDmgMult` (~line 354)
- Modify: `js/entities.js` water-regen block (~line 592: `waterRegen` computation) for the Overflow low-edge regen
- Modify: `js/benedictions.js` defs: `overflow`, `baptize` descs
- Test: `tests/balance.test.js` (or the file holding beneDmgMult tests — locate with `grep -rn beneDmgMult tests/`)

**Interfaces:**
- Consumes: `JH.BENE_TUNE` (Task 1).
- Produces: `beneDmgMult(ranks, t)` same signature; new semantics below. `t.wet` is used linearly.

- [ ] **Step 1: Failing tests**

```js
test("overflow: +dmg at the high edge only", () => {
  const T = JH.BENE_TUNE;
  const m = (frac, rank) => Balance.beneDmgMult({ overflow: rank, baptize: 0, trial: 0 }, { waterFrac: frac, wet: 0, burning: false });
  assert.strictEqual(m(T.overflowHigh + 0.01, 1), 1 + T.overflowDmg);
  assert.strictEqual(m(T.overflowHigh - 0.01, 1), 1);
  assert.strictEqual(m(T.overflowHighII + 0.01, 2), 1 + T.overflowDmgII);
});
test("baptize: bonus scales linearly with wetness", () => {
  const T = JH.BENE_TUNE;
  const m = (wet, rank) => Balance.beneDmgMult({ overflow: 0, baptize: rank, trial: 0 }, { waterFrac: 0, wet, burning: false });
  assert.strictEqual(m(0, 1), 1);
  assert.ok(Math.abs(m(0.5, 1) - (1 + T.baptizeMax * 0.5)) < 1e-9);
  assert.ok(Math.abs(m(1, 2) - (1 + T.baptizeMaxII)) < 1e-9);
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```js
    beneDmgMult(ranks, t) {
      const T = root.JH.BENE_TUNE;
      let m = 1;
      if (ranks.overflow && t.waterFrac >= (ranks.overflow >= 2 ? T.overflowHighII : T.overflowHigh))
        m *= 1 + (ranks.overflow >= 2 ? T.overflowDmgII : T.overflowDmg);
      if (ranks.baptize && t.wet > 0)
        m *= 1 + (ranks.baptize >= 2 ? T.baptizeMaxII : T.baptizeMax) * Math.min(1, t.wet);
      if (ranks.trial && t.burning) m *= ranks.trial >= 2 ? 1.3 : 1.2;
      return m;
    },
```

Overflow regen edge — in the Player water-regen block (entities.js, the line computing `this.water = Math.min(S.maxWater, this.water + (S.waterRegen + moveBon) * gasCut * dt)`), insert before it:

```js
        // Overflow low edge: near-empty tank regenerates faster.
        const ovRank = this.beneRank("overflow");
        const T2 = JH.BENE_TUNE;
        const ovLow = ovRank ? (ovRank >= 2 ? T2.overflowLowII : T2.overflowLow) : 0;
        const ovMult = (ovRank && this.water / S.maxWater < ovLow)
          ? (ovRank >= 2 ? T2.overflowRegenMultII : T2.overflowRegenMult) : 1;
```
and multiply the regen line by `* ovMult`. Add an entities test: rank 1, water at 10% of max → regen per second is `overflowRegenMult`× the no-boon rate (compare two players; derive from config).

Descs:
```js
    { id: "overflow", ..., name: "Overflow",
      desc: "Tank ≥80%: {g:+20%} {i:dmg} · tank <20%: {g:2×} {i:water} regen",
      descII: "70% / {g:+30%} · 30% / {g:3×}" },
    { id: "baptize", ..., name: "Baptize",
      desc: "Soak scales the payoff: up to {g:+15%} {i:dmg} at full drench",
      descII: "up to {g:+25%} {i:dmg}" },
```

- [ ] **Step 4: Run suite — PASS (fix any test that hard-coded the old thresholds by deriving from BENE_TUNE)**

- [ ] **Step 5: Commit** `git commit -m "feat(bene): overflow edge design + baptize wetness scaling"`

---

### Task 3: Water actives — Split Stream numbers + Wake pull puddles

**Files:**
- Modify: `js/entities.js`: split-stream arc block (grep `beneRank("split_stream")`, ~line 817) — replace hard-coded `0.5` share and target counts with `BENE_TUNE.splitArcFrac/(II)` and `splitTargetsII`; dash-wake spawn (~line 492) and `class SlowZone` (~line 2934)
- Modify: `js/benedictions.js` defs `split_stream`, `baptismal_wake`
- Test: `tests/entities.test.js`

**Interfaces:**
- Consumes: `JH.BENE_TUNE`, existing `SlowZone(x, y, r, dur, opts)`.
- Produces: `SlowZone` accepts `opts.pull` (px/s toward center, enemies only).

- [ ] **Step 1: Failing tests**

```js
test("wake puddles pull enemies toward their center", () => {
  const g = makeThinkGame(400, 40);
  const z = new JH.SlowZone(100, 40, 16, 3, { vsEnemies: true, pull: JH.BENE_TUNE.wakePull });
  const e = JH.makeEnemy("mook", 110, 40);
  e.spawnGrace = 0;
  g.enemies.push(e);
  z.update(0.25, g);
  assert.ok(e.x < 110, "inside the rim the enemy is pulled toward center");
  const far = JH.makeEnemy("mook", 200, 40);
  g.enemies.push(far);
  z.update(0.25, g);
  assert.strictEqual(far.x, 200, "outside the rim no pull");
});
test("split stream arc share derives from BENE_TUNE", () => {
  // locate the arc application; assert via a spy on takeDamage that the arc
  // target receives splitArcFrac * primary damage (rank 1)
});
```
(Write the split test against the real arc path: spawn two enemies in spray range, rank 1 split, run doSpray one tick, compare damage ratio to `BENE_TUNE.splitArcFrac` within 1e-6.)

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

SlowZone update, inside the `vsEnemies` enemy loop after the slow tag:

```js
          if (this.pull) {
            const dx = this.x - e.x, dy = this.y - e.y;
            const dist = Math.hypot(dx, dy) || 1;
            const step = Math.min(dist, this.pull * dt);
            e.x += (dx / dist) * step;
            e.y += (dy / dist) * step * 0.5;   // depth pulls gentler
          }
```
Constructor: `this.pull = (opts && opts.pull) || 0;`

Dash wake spawn becomes:

```js
        const wakeRank = this.beneRank("baptismal_wake");
        if (wakeRank && game.slowZones) {
          const T = JH.BENE_TUNE;
          game.slowZones.push(new JH.SlowZone(
            this.x, this.y, wakeRank >= 2 ? Math.round(16 * T.wakeRadiusIIMult) : 16, 3,
            { vsEnemies: true, slowMult: 0.7,
              pull: wakeRank >= 2 ? T.wakePullII : T.wakePull }));
        }
```
(the old `dmgAmp` rider is dropped — pull is the II payoff now, per spec.)

Split arc: replace the hard-coded share/targets with
`const arcFrac = ssRank >= 2 ? T.splitArcFracII : T.splitArcFrac;` and `const arcTargets = ssRank >= 2 ? T.splitTargetsII : 1;` in the existing arc code.

Descs:
```js
      desc: "{g:35%} of spray damage arcs to a nearby enemy",
      descII: "{g:50%} to {g:2} enemies" },
      desc: "Dash lays a puddle that {g:pulls} enemies in and slows 0.7× (3s)",
      descII: "stronger pull + {g:40%} larger" },
```

- [ ] **Step 4: Run suite — PASS**
- [ ] **Step 5: Commit** `git commit -m "feat(bene): split stream tuned + wake pull puddles"`

---

### Task 4: Scald family — damage scaling, Backdraft II pop, Boilover

**Files:**
- Modify: `js/balance.js`: add pure helper; `js/entities.js`: all `applyScald(JH.SCALD...)` sites (grep `applyScald(` — doSpray ~908/910, Backdraft dash ~518, Steam Devil later consumes the same helper), Bushfire contagion block (~1557)
- Modify: `js/benedictions.js` defs `scalding_faith`, `backdraft`, `bushfire` (rename display "Boilover")
- Test: `tests/balance.test.js`, `tests/entities.test.js`

**Interfaces:**
- Produces: `Balance.scaldDps(sprayDamage, scaldRank, boilover)` → number:
  `sprayDamage * (rank>=2 ? scaldDpsFracII : scaldDpsFrac) * (boilover ? boiloverScaldMult : 1)`; rank 0 uses base frac (for baselineScald/Backdraft with no Scalding Faith).

- [ ] **Step 1: Failing tests**

```js
test("scald dps scales with spray damage and Boilover multiplies it", () => {
  const T = JH.BENE_TUNE;
  assert.strictEqual(Balance.scaldDps(50, 1, false), 50 * T.scaldDpsFrac);
  assert.strictEqual(Balance.scaldDps(120, 2, false), 120 * T.scaldDpsFracII);
  assert.strictEqual(Balance.scaldDps(50, 1, true), 50 * T.scaldDpsFrac * T.boiloverScaldMult);
});
test("boilover contagion re-checks while scalded (not once)", () => {
  // scald enemy A, place B 30px away (inside BENE_AOE.bushfireSpread), tick
  // boiloverRecheckS + epsilon twice with player owning bushfire: B scalded;
  // then move C into range while A still scalded: C also scalded after the
  // next recheck window (was impossible with the old once-per-application flag).
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

balance.js:
```js
    scaldDps(sprayDamage, scaldRank, boilover) {
      const T = root.JH.BENE_TUNE;
      const frac = scaldRank >= 2 ? T.scaldDpsFracII : T.scaldDpsFrac;
      return sprayDamage * frac * (boilover ? T.boiloverScaldMult : 1);
    },
```
entities.js — every scald application computes:
```js
const sd = JH.Balance.scaldDps(this.stats.sprayDamage, this.beneRank("scalding_faith"), !!this.beneRank("bushfire"));
e.applyScald(sd, scaldRank >= 2 ? JH.SCALD.dur2 : JH.SCALD.dur);
```
(Backdraft/enemy-side sites that lack `this.stats` use `game.player.stats.sprayDamage` and `game.player.beneRank`.) `JH.SCALD.dps/dps2` stay for enemy-authored scalds if any; player paths stop reading them.

Backdraft II pop: replace `e.takeDamage(8, ...)` with `e.takeDamage(game.player.stats.sprayDamage * JH.BENE_TUNE.backdraftPopFrac, ...)` (it's in Player dash: `this.stats.sprayDamage`).

Boilover contagion — replace the `_spreadDone` once-per-application flag with a rolling recheck on the SCALDED enemy:
```js
        // Boilover: while scalded, contagion re-checks every boiloverRecheckS.
        this._spreadT = (this._spreadT || 0) - dt;
        if (this._spreadT <= 0) {
          this._spreadT = JH.BENE_TUNE.boiloverRecheckS;
          const bfRank = game.player.beneRank ? game.player.beneRank("bushfire") : 0;
          if (bfRank) {
            const sr = JH.BENE_AOE.bushfireSpread;
            for (const o of game.enemies) {
              if (o === this || o.dead || (o.scaldT || 0) > 0) continue;
              if (Math.hypot(o.x - this.x, o.y - this.y) > sr) continue;
              o.applyScald(this.scaldDps, this.scaldT);
            }
            // ring at the exact spread radius (rim is hitbox)
            if (game.pulseRings) game.pulseRings.push({
              x: this.x, y: this.y, r: 0, targetR: sr, dur: 0.25, t: 0,
              dmg: 0, kb: 0, douse: false, hit: new Set(), color: "#ff8c2a",
            });
          }
        }
```
Delete `_spreadDone` init/reset lines.

Descs:
```js
      desc: "Full-pressure spray Scalds: {g:10%} of {i:dmg} per second for 2s",
      descII: "{g:18%} for 3s" },
      // bushfire ->
      name: "Boilover",
      desc: "Scald burns {g:+50%} hotter and rolls to enemies within 40px while it lasts" },
```

- [ ] **Step 4: Suite PASS** (update any test pinning flat 4/6 scald dps — derive from `Balance.scaldDps`).
- [ ] **Step 5: Commit** `git commit -m "feat(bene): scald scales with damage; Boilover rolling contagion"`

---

### Task 5: Trial by Fire offer gate

**Files:**
- Modify: `js/benedictions.js` `pickOffers` boon-candidate filter + a `SCALD_SOURCES` const
- Test: `tests/benedictions.test.js`

**Interfaces:**
- Produces: exported `Benedictions.SCALD_SOURCES = ["scalding_faith", "backdraft", "firestorm"]` (Steam Devil keeps id `firestorm`).

- [ ] **Step 1: Failing test**

```js
test("trial_by_fire is offered only with a scald source owned", () => {
  const rng = () => 0.01;   // deterministic
  const no = JH.Benedictions.pickOffers({ active: { gale_stride: 1 }, pillarRanks: { fire: 1 }, usedOnce: {} }, rng);
  assert.ok(!no.some((o) => o.id === "trial_by_fire"));
  const yes = JH.Benedictions.pickOffers({ active: { scalding_faith: 1 }, pillarRanks: { fire: 1 }, usedOnce: {} }, rng);
  // trial must at least be POSSIBLE: assert it appears across a rng sweep
  let seen = false;
  for (let i = 0; i < 200 && !seen; i++) {
    const r = mulberry(i);   // any seeded rng helper already used in this file
    seen = JH.Benedictions.pickOffers({ active: { scalding_faith: 1 }, pillarRanks: { fire: 1 }, usedOnce: {} }, r)
      .some((o) => o.id === "trial_by_fire");
  }
  assert.ok(seen);
});
```

- [ ] **Step 2: FAIL** → **Step 3: Implement** — in the boon candidate filter inside `pickOffers`, exclude `trial_by_fire` unless `SCALD_SOURCES.some((id) => active[id])`. Desc note: append ` (needs a Scald source)` un-marked-up to the def desc.

- [ ] **Step 4: Suite PASS** → **Step 5: Commit** `git commit -m "feat(bene): trial by fire gated on scald sources"`

---

### Task 6: Hazard Boots (Ash Walk rework)

**Files:**
- Modify: `js/entities.js`: Player gains `hazardGuard(game, kind)` helper; call sites: FirePatch burn application, StinkCloud gas tag, WindHazard contact chip, hostile SlowZone slow application (grep each class's player-touch block)
- Modify: `js/benedictions.js` def `ash_walk` (name stays, desc rewritten)
- Test: `tests/entities.test.js`

**Interfaces:**
- Produces: `Player.hazardGuard(game, hazard)` → boolean "this tick is eaten"; internally: owns `ash_walk`, per-hazard `hazard._bootsEaten` flag unset + global `this.bootsCdT <= 0` → set flag, start cd (`hazardBootsCd/II`), spawn the steam-pop clear if the hazard is a FirePatch or StinkCloud (kill it: patch `sprayProgress = extinguishDur`, cloud `dead = true`), pop dmg `hazardPopFrac * sprayDamage` at `BENE_AOE` radius 22 with a pulse ring.

- [ ] **Step 1: Failing tests** — three: (a) first fire-patch tick eaten + patch doused + cd set; (b) during cd a second hazard is NOT eaten; (c) wind-hazard chip eaten at rank 1 (derive cd from BENE_TUNE).
- [ ] **Step 2: FAIL** → **Step 3: Implement** helper on Player + insert `if (pl.hazardGuard && pl.hazardGuard(game, this)) return;` at the four hazard player-touch sites (before their damage/tag).

Desc:
```js
      name: "Ash Walk",
      desc: "First tick of any ground hazard is ignored; stepping into a patch or cloud clears it with a steam pop ({g:30%} {i:dmg}), 10s cd",
      descII: "{g:6s} cd + {g:50%} pop" },
```

- [ ] **Step 4: Suite PASS** → **Step 5: Commit** `git commit -m "feat(bene): ash walk -> hazard boots, all ground hazards"`

---

### Task 7: Earth — Focus Quake, Gravel Spray, Sure Grip, Bedrock

**Files:**
- Modify: `js/entities.js`: doSpray primary-target tracking (Focus Quake + Gravel timers live on Player: `this.quakeT`, `this.gravelT`, `this.focusTarget`); wall-slam Aftershock block (~1600) DELETED; spray movement slow site (grep `spraySlow` or the moveSpeed reduction while spraying) for Sure Grip; `js/config.js` remove `BENE_AOE.aftershockSplash`
- Modify: `js/benedictions.js` defs `aftershock` (name "Focus Quake"? — keep name "Aftershock", new desc), `landslide` (name "Gravel Spray"), `sure_grip`, `bedrock` (+ its apply() stat hook numbers → BENE_TUNE.bedrockHp/II)
- Test: `tests/entities.test.js`

**Interfaces:**
- Consumes: doSpray already knows its primary target (`blocker` / nozzleTarget path).
- Produces: quake + gravel both reuse `game.pulseRings` (visual) and direct `takeDamage`.

- [ ] **Step 1: Failing tests**

```js
test("focus quake: 2s sustained spray on one target quakes around it", () => {
  // player sprays a mook for quakeChargeS + eps -> mook and a second enemy
  // inside BENE_AOE.focusQuake take quakeDmgFrac * sprayDamage; switching
  // targets resets the charge.
});
test("gravel spray: a rock chunk fires every gravelEveryS of continuous spray", () => {
  // spray gravelEveryS + eps -> target took one extra hit of
  // gravelDmgFrac * sprayDamage with gravelKnock knockback; a 0.2s tap gap
  // (< gravelTapGraceS) does NOT reset the timer; a 0.5s gap does.
});
test("sure grip: rank 1 halves the spray slow, rank 2 removes it", () => {
  // compare effective speeds while spraying across ranks 0/1/2 using
  // BENE_TUNE.sureGripSlowMult and the base spray-slow constant.
});
```

- [ ] **Step 2: FAIL** → **Step 3: Implement**

Player fields init (constructor): `this.quakeT = 0; this.gravelT = 0; this.focusTarget = null; this.sprayGapT = 99;`
In doSpray when a primary enemy target is hit this frame (`blocker` non-shield or first hitList entry):

```js
      const focus = hitList.length ? hitList[0].e : null;
      const T = JH.BENE_TUNE;
      this.sprayGapT = 0;
      if (focus !== this.focusTarget) { this.focusTarget = focus; this.quakeT = 0; }
      if (focus && this.beneRank("aftershock")) {
        const need = this.beneRank("aftershock") >= 2 ? T.quakeChargeSII : T.quakeChargeS;
        this.quakeT += dt;
        if (this.quakeT >= need) {
          this.quakeT = 0;
          const r = JH.BENE_AOE.focusQuake;
          const dmg = this.stats.sprayDamage * (this.beneRank("aftershock") >= 2 ? T.quakeDmgFracII : T.quakeDmgFrac);
          for (const o of game.enemies) {
            if (o.dead) continue;
            if (Math.hypot(o.x - focus.x, o.y - focus.y) > r) continue;
            o.takeDamage(dmg, game, Math.sign(o.x - focus.x) || 1, 0);
            if (this.beneRank("aftershock") >= 2) { o.windTimer = 0; o.cdTimer = Math.max(o.cdTimer || 0, 0.4); }
          }
          game.pulseRings.push({ x: focus.x, y: focus.y, r: 0, targetR: r, dur: 0.2, t: 0,
            dmg: 0, kb: 0, douse: false, hit: new Set(), color: "#e0902f" });
          game.shake(3); game.audio.play("whack");
        }
      }
      if (focus && this.beneRank("landslide")) {
        const every = this.beneRank("landslide") >= 2 ? T.gravelEverySII : T.gravelEveryS;
        this.gravelT += dt;
        if (this.gravelT >= every) {
          this.gravelT = 0;
          focus.takeDamage(this.stats.sprayDamage * T.gravelDmgFrac, game, this.facing, T.gravelKnock, true);
          burst(game, focus.x, focus.y, 10, "#c8a050", 10, { speed: 90, life: 0.3, up: 40, size: 2 });
          game.audio.play("whack", { pitch: 0.8 });
        }
      }
```
In Player.update when NOT spraying: `this.sprayGapT += dt; if (this.sprayGapT > JH.BENE_TUNE.gravelTapGraceS) { this.gravelT = 0; this.quakeT = 0; this.focusTarget = null; }`

Sure Grip — at the spray movement-slow site, replace the boolean with:
```js
const sg = this.beneRank("sure_grip");
const spraySlowMult = sg >= 2 ? 1 : (sg ? 1 - (1 - BASE_SPRAY_SLOW) * JH.BENE_TUNE.sureGripSlowMult : BASE_SPRAY_SLOW);
```
(Locate the existing constant; keep its value as `BASE_SPRAY_SLOW`; rank 2 keeps the +10% knockback stat fold it already has.)

Delete the wall-slam Aftershock block in Enemy.update (the `asr` block + its pulse ring) and `BENE_AOE.aftershockSplash`. Bedrock: point its `apply` numbers at `BENE_TUNE.bedrockHp/II`.

Descs:
```js
      // aftershock
      desc: "Spray one target {g:2s} to crack a quake under it: {g:40%} {i:dmg} nearby",
      descII: "every {g:1.5s}, {g:60%} + stagger" },
      // landslide
      name: "Gravel Spray",
      desc: "Every {g:3s} of spraying, the stream hurls a rock: {g:60%} {i:dmg} + heavy {i:knockback}",
      descII: "every {g:2s}" },
      // sure_grip
      desc: "Spray slows your movement {g:half} as much",
      descII: "no slow at all + {g:+10%} {i:knockback}" },
      // bedrock
      desc: "{g:+25} {i:hp}; taking a hit grants {g:+20%} {i:knockback} for 3s",
      descII: "{g:+45} {i:hp}" },
```

- [ ] **Step 4: Suite PASS** (update tests referencing wall-slam / old bedrock 40/60).
- [ ] **Step 5: Commit** `git commit -m "feat(bene): focus quake + gravel spray + sure grip/bedrock retune"`

---

### Task 8: Air — Gale trim, Slipstream read, Tailwind stats, Eye emergency bubble

**Files:**
- Modify: `js/entities.js`: dash distance site (gale), stream draw tint while `freeSprayT > 0`, Player.takeHit (eye), stat fold site for tailwind (benedictions.js `foldStats` if present — locate with `grep -n "sprayRange" js/benedictions.js js/upgrades.js`)
- Modify: `js/benedictions.js` defs `gale_stride`, `slipstream`, `tailwind`, `eye_of_storm`
- Modify: `js/game.js` HUD sigil strip: eye cooldown pip
- Test: `tests/entities.test.js`, `tests/benedictions.test.js`

**Interfaces:**
- Produces: `player.eyeCdT` (seconds remaining), decremented in update; `stormT` remains the active-bubble timer (bubble/BLOCKED visuals unchanged).

- [ ] **Step 1: Failing tests**

```js
test("eye of the storm: emergency bubble under the HP threshold, 30s cd", () => {
  const T = JH.BENE_TUNE;
  // player with eye rank 1, hp set to maxHp * (eyeHpFrac - 0.01), eyeCdT 0:
  // takeHit -> returns false (blocked), stormT === eyeShieldS, eyeCdT === eyeCd.
  // second takeHit after stormT expires but during cd -> damage lands.
  // hp above threshold -> no trigger.
});
test("tailwind folds range and knockback", () => {
  // rank 1: stats.sprayRange and stats.knockback are base * (1 + tailwindRange/Knock)
  // (or additive fold matching the existing fold pattern — mirror how other
  // stat boons fold and assert relative to a no-boon player).
});
test("gale stride derives from BENE_TUNE", () => { /* dash distance multiplier == 1 + galeStride */ });
```

- [ ] **Step 2: FAIL** → **Step 3: Implement**

Eye in takeHit — replace the current `if (this.stormT > 0)` block's FEEDING trigger (stormT is now only set here; remove the wave-start/sigil grants in game.js/entities Sigil.pick):

```js
      if (this.stormT > 0) { /* existing bubble-block body stays */ }
      const eyeRank = this.beneRank("eye_of_storm");
      if (eyeRank && this.eyeCdT <= 0 &&
          this.hp < this.stats.maxHp * (eyeRank >= 2 ? JH.BENE_TUNE.eyeHpFracII : JH.BENE_TUNE.eyeHpFrac)) {
        this.eyeCdT = JH.BENE_TUNE.eyeCd;
        this.stormT = eyeRank >= 2 ? JH.BENE_TUNE.eyeShieldSII : JH.BENE_TUNE.eyeShieldS;
        // block THIS hit through the same bubble read
        burst(game, this.x, this.y, this.z + 14, "#9be8ff", 12, { speed: 120, life: 0.3, up: 10, size: 2 });
        if (game.float) game.float(this.x, this.y - 34, "BLOCKED", "#9be8ff");
        game.audio.play("whack", { pitch: 1.6 });
        this.invulnTimer = 0.3;
        return false;
      }
```
`this.eyeCdT = 0` in constructor/reset; `if (this.eyeCdT > 0) this.eyeCdT -= dt;` in update. Remove `p.stormT = ...` grants in `Sigil.pick` and any wave-start grant (grep `stormT =` outside entities Player). The II move-speed rider (`stormT > 0 && rank >= 2 → speed *= 1.15`) stays.

Tailwind — fold into stats where benediction stat folding already happens (mirror the existing pattern; if boons fold via `applyStats` recompute, add tailwind to that fold): `sprayRange *= 1 + tailwindRange(II)`, `knockback *= 1 + tailwindKnock(II)`.

Gale: replace the dash-distance literals with `1 + T.galeStride/(II)` at the dash impulse site.

Slipstream read — in the stream drawing code (doSpray render or Player.draw stream), when `this.freeSprayT > 0`: tint the stream `#d6f6ff` and draw a 3px swirl arc at the nozzle each frame.

HUD pip (game.js drawSigilStrip): after the icon draw, if `d.id === "eye_of_storm"`, draw a 3px cooldown pie/pip: grey while `pl.eyeCdT > 0`, cyan when ready.

Descs:
```js
      // gale
      desc: "Dash travels {g:+25%} farther",
      descII: "{g:+40%}" },
      // slipstream (unchanged numbers; desc unchanged)
      // tailwind
      desc: "The wind carries your water: {g:+20%} {i:range} and {g:+20%} {i:knockback}",
      descII: "{g:+30%} / {g:+30%}" },
      // eye_of_storm
      desc: "Under {g:30%} {i:hp}, the next hit is blocked by a {g:1.5s} immunity shield (30s cd)",
      descII: "{g:40%} {i:hp} / {g:2s} shield" },
```

- [ ] **Step 4: Suite PASS** (update the old eye wave-start tests to the new trigger).
- [ ] **Step 5: Commit** `git commit -m "feat(bene): air retune — tailwind stats, emergency eye bubble"`

---

### Task 9: Duos — Steam Sermon vent, Mud Spray, Steam Devil

**Files:**
- Modify: `js/entities.js`: Enemy scald block (vent aura), doSpray hit application (mud stacks), Player dash (spawn vortex), new `class SteamDevil` (embers array citizen: `update/draw`, `isFx = true` so Whirlwind never sweeps it)
- Modify: `js/benedictions.js` defs `steam_sermon`, `mudslide`, `firestorm` (name "Steam Devil")
- Test: `tests/entities.test.js`

**Interfaces:**
- Produces: `JH.SteamDevil(x, y, dir)` pushed to `game.embers`; enemy fields `_mudSlow` (0..cap, consumed like `_puddleSlow`), vent uses `BENE_AOE.steamVent`.

- [ ] **Step 1: Failing tests**

```js
test("steam sermon: scalded enemies vent damage to OTHER nearby enemies", () => {
  // A scalded, B within BENE_AOE.steamVent, player owns steam_sermon:
  // tick 1s -> B lost ~steamVentDpsFrac * sprayDamage hp; A only its scald.
});
test("mud spray: sprayed enemies stack slow to the cap, decaying after", () => {
  // spray 2s -> e._mudSlow ~= mudSlowCap; stop 1.5s (> mudDecayS) -> 0.
});
test("steam devil: dash spawns a traveling vortex that scalds once per enemy", () => {
  // dash with firestorm owned -> a SteamDevil exists in embers, moving at
  // devilSpeed along dash dir; an enemy in its path gains scaldT once.
});
```

- [ ] **Step 2: FAIL** → **Step 3: Implement**

Vent (in the Enemy scald-ticking block, next to Boilover's recheck):
```js
        if (game.player.beneRank && game.player.beneRank("steam_sermon")) {
          const vr = JH.BENE_AOE.steamVent;
          const vdps = game.player.stats.sprayDamage * JH.BENE_TUNE.steamVentDpsFrac;
          for (const o of game.enemies) {
            if (o === this || o.dead) continue;
            if (Math.hypot(o.x - this.x, o.y - this.y) > vr) continue;
            o.takeDamage(vdps * dt, game, 0, 0);
          }
        }
```
Vent ring: faint `#d6f6ff` ellipse at `vr` drawn in Enemy.draw while `scaldT > 0` and the player owns steam_sermon.

Mud stacks — in doSpray per-hit: `if (this.beneRank("mudslide")) e._mudSlow = Math.min(cap, (e._mudSlow || 0) + JH.BENE_TUNE.mudStackPerS * cap * dt);` with `cap = rank>=2 ? T.mudSlowCapII : T.mudSlowCap`; Enemy.update consumes it beside `_puddleSlow` (`speed *= 1 - this._mudSlow`) and decays it by `cap / T.mudDecayS * dt` when not sprayed this frame (track `_mudFresh` flag set by doSpray, cleared each enemy update). Rank II: in the damage pipeline, `if (e._mudSlow > 0 && rank >= 2) dmg *= 1 + T.mudSlowDmgII`.

SteamDevil class (new, near FxBurst):
```js
  class SteamDevil {
    constructor(x, y, dir) {
      this.x = x; this.y = y; this.dir = dir;
      this.t = 0; this.dead = false; this.isFx = true;
      this.hit = new Set();
    }
    update(dt, game) {
      const T = JH.BENE_TUNE;
      this.t += dt;
      this.x += this.dir * T.devilSpeed * dt;
      if (this.t >= T.devilLife) { this.dead = true; return false; }
      for (const e of game.enemies) {
        if (e.dead || e.dropping || this.hit.has(e)) continue;
        if (Math.hypot(e.x - this.x, e.y - this.y) > 14) continue;
        this.hit.add(e);
        e.applyScald(JH.Balance.scaldDps(game.player.stats.sprayDamage,
          game.player.beneRank("scalding_faith"), !!game.player.beneRank("bushfire")), JH.SCALD.dur);
        e.applyKnockback(this.dir, T.devilNudge);
      }
      return true;
    }
    draw(ctx, cam) {
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, 0);
      ctx.save();
      ctx.globalAlpha = 0.55 * (1 - this.t / JH.BENE_TUNE.devilLife) + 0.2;
      ctx.strokeStyle = "#e8f4fa";
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(Math.round(sx), Math.round(sy) - 6 - i * 7, 7 - i * 1.5, 3, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  JH.SteamDevil = SteamDevil;
```
Spawn in the dash-start block (where `_dashTouched` resets): `if (this.beneRank("firestorm")) game.embers.push(new JH.SteamDevil(this.x, this.y, this.facing));`
Remove the old friendly-flame-trail spawn (grep `firestorm` in entities.js).

Descs:
```js
      // steam_sermon
      desc: "Scalded enemies vent steam: {g:15%} {i:dmg}/s to OTHER enemies near them" },
      // mudslide
      desc: "Your stream runs muddy: sprayed enemies slow, stacking to {g:50%}",
      descII: "{g:65%} cap + slowed enemies take {g:+10%} {i:dmg}" },
      // firestorm
      name: "Steam Devil",
      desc: "Dashing spins off a traveling steam vortex that Scalds and shoves what it touches" },
```
(duos have no descII — mudslide keeps a descII only if the defs schema allows; it does not: duos carry no descII, so fold the II line into the base desc? NO — duos cannot rank up; drop the mudslide descII and bake rank-II text out: mud spray is single-rank. Correct the desc to the base numbers only.)

- [ ] **Step 4: Suite PASS** → **Step 5: Commit** `git commit -m "feat(bene): duo redesigns — vent, mud spray, steam devil"`

---

### Task 10: Legendary polish + copy sweep + headless verify

**Files:**
- Modify: `js/game.js` `updateSermonWaves` (percent damage); `js/entities.js` Whirlwind block (gust scale + droplet pop); `js/benedictions.js` remaining descs (pressure_sermon, whirlwind_walk, standing_stone untouched check)
- Test: `tests/game.test.js` or wherever sermon-wave tests live; `tests/entities.test.js`
- Verify: headless script `.superpowers/sdd/bene-rework-verify.mjs` (gitignored)

**Interfaces:** consumes everything above.

- [ ] **Step 1: Failing tests**

```js
test("pressure sermon wavefront deals sermonWaveFrac of spray damage", () => {
  // enemy in the wave path: hp loss === player.stats.sprayDamage * BENE_TUNE.sermonWaveFrac
});
test("whirlwind gust scales and destroyed projectiles pop droplets", () => {
  // gust hit === whirlGustFrac * sprayDamage; a projectile inside
  // BENE_AOE.whirlwindSweep dies and enemies within BENE_AOE.dropletPop of it
  // take dropletPopFrac * sprayDamage.
});
```

- [ ] **Step 2: FAIL** → **Step 3: Implement**

Sermon: in `updateSermonWaves`, replace `e.takeDamage(C.dmg, ...)` with `e.takeDamage(this.player.stats.sprayDamage * JH.BENE_TUNE.sermonWaveFrac, ...)` (keep `C.kb`); delete `JH.SERMON.dmg` and its config comment.
Whirlwind: gust `e.takeDamage(15, ...)` → `game.player.stats.sprayDamage * T.whirlGustFrac` (it's in Player dash: `this.stats.sprayDamage`); on projectile destroy add:
```js
            const pr = JH.BENE_AOE.dropletPop;
            for (const e2 of game.enemies) {
              if (e2.dead || Math.hypot(e2.x - em.x, e2.y - em.y) > pr) continue;
              e2.takeDamage(this.stats.sprayDamage * JH.BENE_TUNE.dropletPopFrac, game, this.facing, 0);
            }
            burst(game, em.x, em.y, em.z || 0, "#9be8ff", 10, { speed: 80, life: 0.3, up: 30, size: 2 });
```
Descs:
```js
      // pressure_sermon
      desc: "Release ≥0.8s of full-pressure spray: a wavefront of {g:40%} {i:dmg} + heavy {i:knockback}" },
      // whirlwind_walk
      desc: "Dashing destroys enemy projectiles (droplet pop: {g:10%} {i:dmg}) and gusts enemies for {g:25%} {i:dmg}" },
```

- [ ] **Step 4: Full suite PASS**

- [ ] **Step 5: Headless verify** — write `.superpowers/sdd/bene-rework-verify.mjs` on the harness pattern (port 8123 or 5173, Backquote start, Escape): take benes via `JH.Benedictions.take`, spawn a dummy (`target_dummy`), drive real spray keys, assert: quake ring fires after `quakeChargeS`; gravel chunk hit lands; mud slow measured on enemy speed; eye blocks under threshold; screenshot the quake ring + steam devil. Zero pageerrors.

- [ ] **Step 6: Ledger + commit** — update `.superpowers/sdd/progress.md` (rework shipped, held for playtest) and `git commit -m "feat(bene): legendary polish + copy sweep — rework pass complete"`

---

## Self-review notes

- Spec coverage: 24 items → Tasks 2 (overflow, baptize, absolution-keep none needed), 3 (split, wake), 4 (scalding, backdraft, boilover), 5 (trial), 6 (ash walk), 7 (aftershock, sure grip, bedrock, landslide), 8 (gale, slipstream, tailwind, eye), 9 (steam sermon, mudslide, firestorm), 10 (pressure sermon, whirlwind, standing-stone no-op). Keeps (absolution, standing stone) need no task. ✓
- Mudslide has no rank II (duos don't deepen) — Task 9 corrected to single-rank numbers; `mudSlowCapII/mudSlowDmgII` stay in BENE_TUNE unused-by-duo? REMOVE from Task 1 block: keep only `mudSlowCap`, `mudDecayS`, `mudStackPerS` (fix Task 1's test list accordingly at implementation time — drop `mudSlowCapII`, `mudSlowDmgII` keys).
- Trial gate list includes `firestorm` id (Steam Devil applies scald ✓ post-Task 9).
- Eye II speed rider retained; wave-start/sigil grants removed in Task 8 (grep `stormT` outside Player).
