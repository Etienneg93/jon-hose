# Air Wind Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gust lanes re-roll their geometry every blow, waves 34-35 gain
mid-field contact hazards the wind blows you into, the cloudline edge reads
as a real broken walkway, and the Gasbag/Bidet/hazard/edge get sprite hooks
that activate the moment generated art lands.

**Architecture:** Extend `GustLane` in place with a range-spec constructor
(legacy `{y, dir}` regression-pinned). `WindHazard` is stationary wave
terrain following the `CloudlineEdge` lifecycle and the `FirePatch.footprint`
rim idiom. All art ships as procedural now + `registerBaked`-style image
slots that take over when PNGs exist. Sprite GENERATION is user-interactive
(codex, one at a time) and is deliberately NOT a task in this plan — briefs
are.

**Tech stack:** Vanilla JS, global `JH` namespace, `node --test`, headless
Edge via the repository playtest workflow.

**Spec:** `docs/superpowers/specs/2026-07-17-air-wind-pass-design.md`

## Global Constraints

- All tunables in `js/config.js`; no gameplay numbers in entity/game code.
- Rim is hitbox: every drawn band/ellipse/line is exactly the tested shape,
  one geometry source.
- Legacy `{y, dir}` gust entries behave byte-identically to today
  (band = `JH.GUST.band` = 14, fixed geometry) — regression-pinned by test.
- Lane geometry changes ONLY at telegraph start; the 1.2s telegraph always
  shows final geometry (fairness contract).
- Hazards: player chip 8 via normal `takeHit` + knockback; enemies
  knockback + stagger, ZERO damage; `speed === 0` emplacements and bosses
  immune; hazards never block wave clear.
- Waves 30-32 keep today's difficulty feel (wave 31's lane unchanged).
- Honest numbers: `waterMult` stays 1, no hidden soaks. No jump, no melee.
- Do not touch `sprites/mook/*`, `sprites/fuse/walk0-3.png`, or run bakers.
- Stage explicit `git add` paths only. The working tree carries unrelated
  uncommitted work (plunger sprites, `tests/air.test.js` local hardening,
  `.superpowers/`, `tmp/`): NEVER `git add -A`. Before committing
  `tests/air.test.js`, verify `git diff HEAD tests/air.test.js` shows ONLY
  your additions (the local plunger-walk hardening block must stay
  uncommitted; if present, ask the controller).
- Hold everything on `air-act`; no merge to main, no release.

---

### Task 1: Range-spec gust lanes

**Files:**
- Modify: `js/config.js` (`JH.GUST` + wave `gusts` data)
- Modify: `js/entities.js` (`GustLane`, ~line 2667)
- Modify: `js/game.js:700` (lane construction)
- Test: `tests/air.test.js`

**Interfaces:**
- Consumes: `JH.GUST` (band/telegraph/blowDur/gapDur/push/pushEnemy),
  `clamp`, `JH.DEPTH_MIN`/`JH.DEPTH_MAX`.
- Produces: `new JH.GustLane(spec)` where spec is a wave-data gust entry
  (legacy or range form). Instance fields other code relies on: `y` (rolled
  depth), `dir` (rolled direction), `band` (rolled half-band), `phase`
  ("telegraph"|"blow"|"gap"), `inBand(y)`. Task 5's headless probe reads
  `game.gustLanes[i].{y,dir,band,phase}`.

- [ ] **Step 1: Write the failing tests** (append to `tests/air.test.js`
  after the existing gust/holdout tests):

```js
test("gust lanes: legacy {y, dir} specs are regression-pinned to fixed geometry", () => {
  const lane = new JH.GustLane({ y: 43, dir: 1 });
  const G = JH.GUST;
  // Drive through 6 full cycles; geometry must never change.
  const cycle = G.telegraph + G.blowDur + G.gapDur;
  const g = stubHazardGame(0, 0);
  g.player.alive = false;   // no push side effects
  for (let i = 0; i < Math.ceil(6 * cycle * 60); i++) {
    lane.update(1 / 60, g);
    assert.strictEqual(lane.y, 43, "legacy lane depth is fixed");
    assert.strictEqual(lane.dir, 1, "legacy lane direction is fixed");
    assert.strictEqual(lane.band, G.band, "legacy lane band is JH.GUST.band");
  }
});

test("gust lanes: range specs re-roll inside their ranges, only at telegraph start", () => {
  const spec = { yMin: 20, yMax: 60, dirs: [1, -1], bandMin: 10, bandMax: 22 };
  const lane = new JH.GustLane(spec);
  const G = JH.GUST;
  const g = stubHazardGame(0, 0);
  g.player.alive = false;
  const seen = { y: new Set(), dir: new Set(), band: new Set() };
  for (let c = 0; c < 40; c++) {
    // At telegraph start the roll must be inside the spec.
    assert.strictEqual(lane.phase, "telegraph");
    assert.ok(lane.y >= 20 && lane.y <= 60, "depth inside [yMin,yMax]");
    assert.ok([1, -1].includes(lane.dir), "direction from dirs");
    assert.ok(lane.band >= 10 && lane.band <= 22, "band inside [bandMin,bandMax]");
    const frozen = { y: lane.y, dir: lane.dir, band: lane.band };
    seen.y.add(lane.y); seen.dir.add(lane.dir); seen.band.add(lane.band);
    // Geometry is frozen through telegraph + blow + gap.
    const steps = Math.ceil((G.telegraph + G.blowDur + G.gapDur) * 60) + 1;
    for (let i = 0; i < steps && !(lane.phase === "telegraph" && i > 10); i++) {
      lane.update(1 / 60, g);
      if (lane.phase !== "telegraph")
        assert.deepStrictEqual({ y: lane.y, dir: lane.dir, band: lane.band },
          frozen, "geometry never changes mid-cycle");
    }
    // Land exactly on the next telegraph for the next iteration.
    while (lane.phase !== "telegraph") lane.update(1 / 60, g);
  }
  // 40 cycles of a 40px range: rolls must actually vary.
  assert.ok(seen.y.size > 5, "depth genuinely re-rolls");
  assert.strictEqual(seen.dir.size, 2, "both directions occur across 40 cycles");
  assert.ok(seen.band.size > 5, "band genuinely re-rolls");
});

test("gust lanes: phase offset delays the first telegraph; rolls clamp to the depth band", () => {
  const offset = new JH.GustLane({ y: 43, dir: 1, phase: 1.0 });
  const plain = new JH.GustLane({ y: 43, dir: 1 });
  const g = stubHazardGame(0, 0);
  g.player.alive = false;
  for (let i = 0; i < Math.ceil(JH.GUST.telegraph * 60) + 2; i++) {
    plain.update(1 / 60, g); offset.update(1 / 60, g);
  }
  assert.strictEqual(plain.phase, "blow", "un-offset lane has started blowing");
  assert.strictEqual(offset.phase, "telegraph", "offset lane is still telegraphing");
  // A spec hugging the depth floor clamps so band edges stay inside.
  const low = new JH.GustLane({ yMin: 0, yMax: 0, dirs: [1], bandMin: 22, bandMax: 22 });
  assert.ok(low.y - low.band >= JH.DEPTH_MIN, "band top clamped inside the depth band");
});
```

- [ ] **Step 2: Run to verify RED**

Run: `node --test tests/air.test.js`
Expected: the three new tests FAIL (`lane.band` undefined; constructor
signature mismatch — current code takes `(y, dir)`).

- [ ] **Step 3: Config — default band roll range** (`js/config.js`, inside
  `JH.GUST`):

```js
    bandMin: 10,       // default half-band roll range for RANGE specs
    bandMax: 22,       //   (legacy {y,dir} entries stay pinned to `band`)
```

- [ ] **Step 4: Rewrite `GustLane` construction/re-roll**
  (`js/entities.js:2667`). Replace the constructor and `inBand`, add
  `reroll()`, and switch every `G.band` read in `update`/`draw` to
  `this.band`:

```js
  class GustLane {
    // spec: legacy { y, dir } (fixed geometry, band = JH.GUST.band) or a
    // range spec { yMin, yMax, dirs, bandMin, bandMax, phase } — every
    // field optional; omitted band fields roll [GUST.bandMin, GUST.bandMax].
    constructor(spec) {
      const G = JH.GUST;
      const legacy = spec.y != null && spec.yMin == null && spec.yMax == null;
      this.spec = legacy
        ? { yMin: spec.y, yMax: spec.y, dirs: [spec.dir >= 0 ? 1 : -1],
            bandMin: G.band, bandMax: G.band }
        : {
            yMin: spec.yMin != null ? spec.yMin : spec.y,
            yMax: spec.yMax != null ? spec.yMax : spec.y,
            dirs: spec.dirs || [spec.dir >= 0 ? 1 : -1],
            bandMin: spec.bandMin != null ? spec.bandMin : G.bandMin,
            bandMax: spec.bandMax != null ? spec.bandMax : G.bandMax,
          };
      this.t = 0; this.phase = "telegraph";
      this.phaseT = G.telegraph + (spec.phase || 0);   // offset staggers lanes
      this.dead = false;
      this.reroll();
    }
    // Rolls happen ONLY here, and this is called ONLY at telegraph start.
    reroll() {
      const s = this.spec;
      this.dir = s.dirs[(Math.random() * s.dirs.length) | 0];
      this.band = s.bandMin + Math.random() * (s.bandMax - s.bandMin);
      const y = s.yMin + Math.random() * (s.yMax - s.yMin);
      this.y = clamp(y, JH.DEPTH_MIN + this.band, JH.DEPTH_MAX - this.band);
    }
    inBand(y) { return Math.abs(y - this.y) <= this.band; }
```

  and in `update`, the phase rotation gains one line:

```js
      if (this.phaseT <= 0) {
        if (this.phase === "telegraph") { this.phase = "blow"; this.phaseT = G.blowDur; }
        else if (this.phase === "blow") { this.phase = "gap"; this.phaseT = G.gapDur; }
        else { this.phase = "telegraph"; this.phaseT = G.telegraph; this.reroll(); }
      }
```

  In `draw`, replace both `G.band` reads with `this.band` (the drawn edge
  lines ARE the rolled band — rim is hitbox).

- [ ] **Step 5: Pass the whole spec object** (`js/game.js:700`):

```js
      this.gustLanes = (wave.gusts || []).map((gd) => new JH.GustLane(gd));
```

- [ ] **Step 6: Escalation ladder wave data** (`js/config.js` — exact
  replacements; wave 31 `TANGLED UP` at line ~1172 is deliberately NOT
  touched, it stays legacy `{ y: 43, dir: 1 }`):

  Wave 32 `GAS LEAK` (line ~1174): replace
  `gusts: [{ y: 24, dir: 1 }, { y: 62, dir: -1 }]` with

```js
        gusts: [{ yMin: 12, yMax: 36, dirs: [1], bandMin: 14, bandMax: 14 },
                { yMin: 50, yMax: 74, dirs: [-1], bandMin: 14, bandMax: 14 }],
```

  Wave 33 `CLOUDLINE HOLDOUT` (line ~1179): replace
  `gusts: [{ y: 18, dir: 1 }, { y: 68, dir: 1 }]` with

```js
        // Direction stays rightward — the edge is the encounter.
        gusts: [{ yMin: 8, yMax: 28, dirs: [1] },
                { yMin: 58, yMax: 78, dirs: [1], phase: 3.6 }],
```

  Wave 34 `PORCELAIN PATROL` (has no gusts today — add after `placements`):

```js
        gusts: [{ yMin: 24, yMax: 62, dirs: [1, -1] }],
```

  Wave 35 `FOUL WEATHER` (line ~1189): replace
  `gusts: [{ y: 24, dir: 1 }, { y: 62, dir: -1 }]` with

```js
        // The squeeze: opposed lanes, offset phases, rolled depth + band.
        gusts: [{ yMin: 14, yMax: 40, dirs: [1] },
                { yMin: 46, yMax: 72, dirs: [-1], phase: 3.6 }],
```

- [ ] **Step 7: Fix the wave-33 authored-data test** — the existing
  Plan 2 test asserts `w[32].gusts.every((g) => g.dir === 1)` which is now
  `dirs`. In `tests/air.test.js` (test
  `"air act: waves 33-35 extend progression per the Plan 2 authoring table"`)
  replace that assertion with:

```js
  assert.ok(w[32].gusts && w[32].gusts.length === 2
    && w[32].gusts.every((g) => g.dirs.length === 1 && g.dirs[0] === 1),
    "two rightward-only gust lanes");
```

  and the wave-35 opposed-lane assertion with:

```js
  assert.ok(w[34].gusts && w[34].gusts.length === 2
    && w[34].gusts.some((g) => g.dirs.includes(1)) && w[34].gusts.some((g) => g.dirs.includes(-1)),
    "wave 35 carries two opposed gust lanes");
```

- [ ] **Step 8: Run targeted then full suite**

Run: `node --test tests/air.test.js` then `npm test`
Expected: all PASS (383+3 = 386).

- [ ] **Step 9: Commit**

```bash
git add js/config.js js/entities.js js/game.js tests/air.test.js
git commit -m "feat(air-act): gust lanes re-roll geometry from range specs at telegraph start"
```

---

### Task 2: WindHazard entity + placements

**Files:**
- Modify: `js/config.js` (`JH.WIND_HAZARD` + wave 34/35 `hazards` data)
- Modify: `js/entities.js` (new `WindHazard` class + Enemy stagger gate at
  ~line 1585)
- Modify: `js/game.js` (state array, startWave creation, update, draw,
  cleanup paths)
- Modify: `tools/air-threat-score.mjs` (hazards column)
- Test: `tests/air.test.js`

**Interfaces:**
- Consumes: `Geo.inGroundEllipse`, `JH.GROUND_RY`, `Player.takeHit(dmg,
  game, fromX, knock)` (returns landed-hit bool), `Enemy.applyKnockback(
  dirX, force)`, `Enemy` update loop at `js/entities.js:1585`.
- Produces: `new JH.WindHazard(x, y)` with `footprint()` returning
  `{ rx, ry }`, `update(dt, game)`, `draw(ctx, cam)`, `dead` flag.
  `game.windHazards` array. `Enemy.staggerT` (seconds; while > 0 the enemy
  skips `think`). Wave data key `hazards: [{ x, y }]` (x from arena left
  bound, like `placements`).

- [ ] **Step 1: Write the failing tests** (append to `tests/air.test.js`):

```js
test("wind hazard rim: drawn ellipse IS the hit ellipse; chip + cooldown; enemies shoved not hurt", () => {
  const H = JH.WIND_HAZARD;
  const g = stubHazardGame(100, 40);
  const hz = new JH.WindHazard(100, 40);
  const f = hz.footprint();
  assert.strictEqual(f.rx, H.rx, "footprint rx comes from config");
  assert.ok(Math.abs(f.ry - f.rx * JH.GROUND_RY) < 0.001, "depth uses the flattened ellipse");
  // Player inside the rim: one chip through takeHit, then the cooldown gates.
  g.player.x = 100 + f.rx - 1; g.player.y = 40;
  const hp0 = g.player.hp;
  hz.update(1 / 60, g);
  assert.strictEqual(g.player.hp, hp0 - H.dmg, "chip damage lands once");
  hz.update(1 / 60, g);
  assert.strictEqual(g.player.hp, hp0 - H.dmg, "contact cooldown blocks per-frame ticking");
  // Outside the rim: nothing.
  const hz2 = new JH.WindHazard(300, 40);
  g.player.x = 300 + hz2.footprint().rx + 2; g.player.hp = hp0;
  hz2.update(1 / 60, g);
  assert.strictEqual(g.player.hp, hp0, "outside the rim takes nothing");
  // Enemy inside: knockback + stagger, zero damage.
  const e = JH.makeEnemy("tpmummy", 100 + f.rx - 1, 40);
  const ehp = e.hp;
  g.enemies.push(e);
  hz.contactCd = 0; g.player.x = 900;   // player out of the way
  hz.update(1 / 60, g);
  assert.strictEqual(e.hp, ehp, "enemies take zero damage");
  assert.ok(e.knockVX > 0, "enemy shoved away from the hazard center");
  assert.ok(e.staggerT > 0, "enemy staggered");
  // Emplacements immune.
  const b = JH.makeEnemy("bidet", 100 + f.rx - 1, 40);
  g.enemies.push(b);
  hz.update(1 / 60, g);
  assert.ok(!b.knockVX, "speed-0 emplacements hold fast");
});

test("wind hazard: staggered enemies skip think until the timer runs out", () => {
  const g = stubHazardGame(400, 40);
  const e = JH.makeEnemy("tpmummy", 100, 40);
  e.spawnGrace = 0; e.staggerT = 0.2;
  const x0 = e.x;
  e.update(1 / 60, g);
  assert.strictEqual(e.x, x0, "no self-movement while staggered (think skipped)");
  for (let i = 0; i < 20; i++) e.update(1 / 60, g);
  assert.ok(e.staggerT <= 0, "stagger expires");
  assert.strictEqual(e.state, "walk", "think resumes after the stagger (player far -> approach)");
});

test("wind hazards: wave data places them; they are terrain, not wave members", () => {
  const w = JH.LEVEL1.waves;
  assert.ok(!w[32].hazards, "wave 33 has no mid-field hazards (the edge is its hazard)");
  assert.strictEqual(w[33].hazards.length, 1, "wave 34: one hazard");
  assert.strictEqual(w[34].hazards.length, 2, "wave 35: two hazards");
  for (const wave of [w[33], w[34]])
    for (const h of wave.hazards) {
      assert.ok(h.x >= 0 && h.x <= JH.VIEW_W - 40, "inside the arena band");
      assert.ok(h.y >= JH.DEPTH_MIN && h.y <= JH.DEPTH_MAX, "inside the depth band");
    }
});
```

- [ ] **Step 2: Run to verify RED**

Run: `node --test tests/air.test.js`
Expected: FAIL — `JH.WIND_HAZARD` undefined, `JH.WindHazard` not a
constructor, `hazards` undefined on wave data.

- [ ] **Step 3: Config** (`js/config.js`, after `JH.CLOUDLINE_HOLDOUT`):

```js
  // ---- Wind hazard ("sky vent"): stationary wave terrain gusts blow you
  // into. Player takes dmg via the normal takeHit path + knockback, gated
  // by contactCd. Enemies: knockback + staggerT only, never damage.
  JH.WIND_HAZARD = { rx: 14, dmg: 8, knock: 140, enemyKnock: 120,
                     staggerT: 0.35, contactCd: 0.6 };
```

  Wave data: wave 34 `PORCELAIN PATROL` gains (next to `placements`):

```js
        hazards: [{ x: 180, y: 44 }],
```

  Wave 35 `FOUL WEATHER` gains:

```js
        hazards: [{ x: 150, y: 30 }, { x: 290, y: 56 }],
```

- [ ] **Step 4: `WindHazard` class** (`js/entities.js`, after
  `CloudlineEdge`):

```js
  // Wind hazard ("sky vent"): stationary wave terrain. ONE ellipse is both
  // the drawn rim and the hit test (FirePatch.footprint idiom). Player:
  // chip via takeHit + knockback, gated by contactCd (the cd re-arms even
  // on a dodged hit — no per-frame retries against i-frames). Enemies:
  // knockback + stagger, zero damage; emplacements/bosses immune.
  class WindHazard {
    constructor(x, y) {
      this.x = x; this.y = y;
      this.t = 0; this.contactCd = 0; this.dead = false;
    }
    footprint() {
      const rx = JH.WIND_HAZARD.rx;
      return { rx, ry: rx * JH.GROUND_RY };
    }
    update(dt, game) {
      const H = JH.WIND_HAZARD;
      this.t += dt;
      if (this.contactCd > 0) this.contactCd -= dt;
      const f = this.footprint(), pl = game.player;
      if (pl && pl.alive && this.contactCd <= 0
          && Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, f.rx, f.ry)) {
        pl.takeHit(H.dmg, game, this.x, H.knock);
        this.contactCd = H.contactCd;
      }
      for (const e of game.enemies) {
        if (e.dead || e.dropping || e.isBoss) continue;
        if (e.def && e.def.speed === 0) continue;   // emplacements hold fast
        if (e._hazardCd > 0) { e._hazardCd -= dt; continue; }
        if (Geo.inGroundEllipse(e.x, e.y, this.x, this.y, f.rx, f.ry)) {
          e.applyKnockback(e.x >= this.x ? 1 : -1, H.enemyKnock);
          e.staggerT = Math.max(e.staggerT || 0, H.staggerT);
          e._hazardCd = H.contactCd;
        }
      }
    }
    draw(ctx, cam) {
      // Procedural fallback: broken fan disc + spark flicker + exact rim.
      const f = this.footprint();
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, 0);
      ctx.save();
      // rim = hitbox
      ctx.strokeStyle = "#8d97ad"; ctx.globalAlpha = 0.7; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(sx, sy, f.rx, f.ry, 0, 0, Math.PI * 2); ctx.stroke();
      // squat vent body + lazily spinning broken blade
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#454f63"; ctx.fillRect(Math.round(sx) - 8, Math.round(sy) - 10, 16, 9);
      ctx.fillStyle = "#2c3344"; ctx.fillRect(Math.round(sx) - 8, Math.round(sy) - 3, 16, 2);
      const a = this.t * 2.2;
      ctx.strokeStyle = "#98a4bd"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx - Math.cos(a) * 6, sy - 6 - Math.sin(a) * 2.4);
      ctx.lineTo(sx + Math.cos(a) * 6, sy - 6 + Math.sin(a) * 2.4);
      ctx.stroke();
      // spark flicker
      if ((Math.floor(this.t * 9) % 4) === 0) {
        ctx.fillStyle = "#ffd23f";
        ctx.fillRect(Math.round(sx + Math.sin(this.t * 7) * 5), Math.round(sy) - 12, 2, 2);
      }
      ctx.restore();
    }
  }
  JH.WindHazard = WindHazard;
```

- [ ] **Step 5: Enemy stagger gate** (`js/entities.js:1585` — wrap the
  existing `this.think(dt, game);` call):

```js
      if (this.staggerT > 0) this.staggerT -= dt;   // hazard shove: skip think
      else this.think(dt, game);
```

  (`prePx/prePy` capture above stays; a staggered enemy simply doesn't move
  under its own power that frame — knock velocity still applies.)

- [ ] **Step 6: Game lifecycle wiring** (`js/game.js`) — mirror
  `cloudlineEdge`'s five touch points, as an array like `gustLanes`:
  - State default (next to `cloudlineEdge: null`): `windHazards: [],`
  - `startWave` (next to the placements/edge creation):

```js
      this.windHazards = (wave.hazards || []).map((h) =>
        new JH.WindHazard(this.bounds.minX + h.x, h.y));
```

  - Update (immediately after the `cloudlineEdge` update so gust pushes
    resolve into hazards in the same fixed step):

```js
      for (const hz of this.windHazards) hz.update(dt, this);
```

  - Draw (in the terrain-hazard block, right after gust lanes / stink
    clouds, before actors): `for (const hz of this.windHazards) hz.draw(ctx, cam);`
  - Cleanup: add `this.windHazards = [];` at every point that sets
    `this.cloudlineEdge = null` (`startGame`, `waveCleared_`, `enterAirAct`,
    `respawnFromChurch` — grep `cloudlineEdge = null` and mirror each).

- [ ] **Step 7: Cleanup regression** — the existing test
  `"holdout timer expiry clears..."` family in `tests/air.test.js` builds a
  Game via `Object.create(JH.Game)` and drives `waveCleared_()`. Extend the
  Plan 2 timer-expiry/clear test (search `waveCleared_` in the file, the
  test asserting gusts+edge clear): before the clear add
  `g.windHazards = [new JH.WindHazard(50, 40)];` and after it assert
  `assert.deepStrictEqual(g.windHazards, [], "wave clear removes hazards");`
  (matches the spec's "cleared on every terrain reset path" — the other
  paths share `startGame`/`startWave`, covered by Step 6's mirroring).

- [ ] **Step 8: Threat tool hazards column** (`tools/air-threat-score.mjs`):
  in `waveStats()` add `hazards: (w.hazards || []).length` and print it as a
  column in the per-wave table. No new gate (hazards are terrain, not wave
  members).

- [ ] **Step 9: Run targeted then full suite; run the threat tool**

Run: `node --test tests/air.test.js && npm test && node tools/air-threat-score.mjs`
Expected: all PASS; threat tool exits 0 with the new column showing
0/0/0/1/2 for waves 31-35.

- [ ] **Step 10: Commit**

```bash
git add js/config.js js/entities.js js/game.js tools/air-threat-score.mjs tests/air.test.js
git commit -m "feat(air-act): sky-vent wind hazards — chip the player, shove enemies"
```

---

### Task 3: Cloudline edge dressing (procedural layers + image slot)

**Files:**
- Modify: `js/entities.js` (`CloudlineEdge.draw` + crossing poof state)
- Modify: `js/assets.js` (edge-lip image slots)
- Test: `tests/air.test.js` (existing edge geometry tests must keep passing
  unchanged — that IS the test; plus one new poof-state test)

**Interfaces:**
- Consumes: `CloudlineEdge` (edge.x, crossed(), update()), `JH.Loader.img`.
- Produces: `Assets.drawCloudlineLip(ctx, sx)` — draws the lip strip (baked
  when `sprites/cloudline/lip0.png`/`lip1.png` exist, two-tone band
  fallback otherwise). `edge.poofT`/`edge.poofY` visual state set on every
  crossing.

- [ ] **Step 1: Write the failing test** (append to `tests/air.test.js`):

```js
test("cloudline edge: crossing arms the visual poof at the crossing depth", () => {
  const g = stubHazardGame(100, 40);
  const edge = new JH.CloudlineEdge(200);
  g.player.x = 200 + g.player.bodyW; g.player.y = 52;
  edge.update(1 / 60, g);
  assert.ok(edge.poofT > 0, "crossing arms the poof timer");
  assert.strictEqual(edge.poofY, 52, "poof remembers the crossing depth");
  assert.ok(g.player.x < 200, "reset still happens (mechanic untouched)");
});
```

- [ ] **Step 2: Run to verify RED**

Run: `node --test tests/air.test.js`
Expected: FAIL — `poofT` undefined.

- [ ] **Step 3: Poof state** (`js/entities.js`, `CloudlineEdge`): in the
  constructor add `this.poofT = 0; this.poofY = 0;`. In `update`, inside
  the crossing branch (where the reset + `takeHit` happen) add:

```js
        this.poofT = 0.5; this.poofY = pl.y;   // visual-only crossing poof
```

  and at the top of `update`: `if (this.poofT > 0) this.poofT -= dt;`

- [ ] **Step 4: Lip image slots + fallback** (`js/assets.js`, near the
  other environment painters):

```js
  // Cloudline lip strip: pavement visibly ends at edge.x. Baked segments
  // (sprites/cloudline/lip0.png tileable, lip1.png broken-guardrail
  // variant, 128x128 = 32x32 logical at 4x) take over when present;
  // fallback is a two-tone band. Drawn at the EXACT edge x — the hit line.
  const _lipImgs = [JH.Loader.img("sprites/cloudline/lip0.png"),
                    JH.Loader.img("sprites/cloudline/lip1.png")];
  Assets.drawCloudlineLip = function (ctx, sx) {
    const top = Geo.feetScreenY(JH.DEPTH_MIN, 0) - 14;
    const bottom = Geo.feetScreenY(JH.DEPTH_MAX, 0) + 6;
    const ok = _lipImgs[0] && _lipImgs[0].complete && _lipImgs[0].naturalWidth;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (ok) {
      for (let y = top, i = 0; y < bottom; y += 32, i++) {
        const img = (i % 3 === 2 && _lipImgs[1].naturalWidth) ? _lipImgs[1] : _lipImgs[0];
        ctx.drawImage(img, Math.round(sx) - 16, Math.round(y), 32, 32);
      }
    } else {
      // two-tone fallback band (replaces the old dashed line)
      ctx.fillStyle = "#3a4152"; ctx.fillRect(Math.round(sx) - 3, top, 3, bottom - top);
      ctx.fillStyle = "#8d97ad"; ctx.fillRect(Math.round(sx) - 1, top, 1, bottom - top);
    }
    ctx.restore();
  };
```

- [ ] **Step 5: Rewrite `CloudlineEdge.draw`** (`js/entities.js`): remove
  the dashed-line block; keep the wind-streak telegraphs. New layers, all
  anchored to `this.x`:

```js
    draw(ctx, cam) {
      const sx = this.x - cam;
      // 1. walkway lip (baked strip or two-tone fallback) at the hit line
      Assets.drawCloudlineLip(ctx, sx);
      // 2. cloud churn, sky side only (scald-pass wisp idiom)
      ctx.save();
      for (let i = 0; i < 6; i++) {
        const cyc = (this.t * 0.25 + i / 6) % 1;
        const cy = Geo.feetScreenY(JH.DEPTH_MIN + (i / 6) * (JH.DEPTH_MAX - JH.DEPTH_MIN), 0);
        const cx = sx + 6 + cyc * 16 + Math.sin(this.t * 0.8 + i * 2.1) * 3;
        ctx.globalAlpha = 0.28 * (1 - cyc) + 0.06;
        ctx.fillStyle = i % 2 ? "#d6e4f2" : "#b9c9dd";
        ctx.beginPath();
        ctx.ellipse(cx, cy - 3, 7 + cyc * 8, 4 + cyc * 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      // 3. crossing poof
      if (this.poofT > 0) {
        const k = 1 - this.poofT / 0.5;
        const py = Geo.feetScreenY(this.poofY, 0);
        ctx.save();
        ctx.globalAlpha = 0.7 * (1 - k);
        ctx.fillStyle = "#e8f2fb";
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.ellipse(sx - 8 + i * 7, py - 4 - k * 8, 5 + k * 4, 3 + k * 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      // (existing wind-streak telegraph block stays below, unchanged)
    }
```

  Keep the existing wind-streak code at the end of `draw` untouched.

- [ ] **Step 6: Run targeted then full suite** — the pre-existing edge
  geometry/reset tests passing unchanged proves the mechanic is untouched.

Run: `node --test tests/air.test.js && npm test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add js/entities.js js/assets.js tests/air.test.js
git commit -m "art(air-act): cloudline edge reads as a broken walkway (lip slot, churn, poof)"
```

---

### Task 4: Gasbag/Bidet pose hooks + baked wiring + generation briefs

**Files:**
- Modify: `js/entities.js` (Gasbag `vent` beat, Bidet `fire` beat)
- Modify: `js/assets.js` (registerBaked for gasbag + bidet, procedural
  painters become fallbacks; hazard image slot)
- Create: `tmp/briefs/gasbag.txt`, `tmp/briefs/bidet.txt`,
  `tmp/briefs/windhazard.txt`, `tmp/briefs/cloudline-lip.txt`
- Test: `tests/air.test.js`

**Interfaces:**
- Consumes: `registerBaked(key, art, poseFn, fallback)` in `js/assets.js`
  (art: `{w, h, feet, poses}`; sources face RIGHT; elite falls back to base
  frames; procedural fallback shown until images load). Enemy draw opts:
  `{ state, frame, t, wind, windFrac, scale }`.
- Produces: Gasbag sets `this.ventBeatT = 0.25` when its cloud spawns and
  passes `state: "vent"` while it runs; Bidet sets `this.fireBeatT = 0.2`
  on arc launch (`state: "fire"`). Baked pose sets: gasbag
  `idle0/idle1/wind0/wind1/vent`, bidet `idle0/idle1/wind/fire` — all on
  the 112x116 / feet-row-111 canvas (tpmummy convention). Frames land in
  `sprites/gasbag/` and `sprites/bidet/`; wiring activates automatically.

- [ ] **Step 1: Write the failing tests** (append to `tests/air.test.js`):

```js
test("gasbag vent beat + bidet fire beat: visual-only state pulses on the signature moments", () => {
  const g = stubHazardGame(400, 40);
  const gb = JH.makeEnemy("gasbag", 100, 40);
  gb.spawnGrace = 0; gb.ventT = 0; gb.cdTimer = 0;
  for (let i = 0; i < 600 && g.stinkClouds.length === 0; i++) gb.think(1 / 60, g);
  assert.strictEqual(g.stinkClouds.length, 1, "premise: a vent completed");
  assert.ok(gb.ventBeatT > 0, "vent beat armed when the cloud spawns");
  assert.strictEqual(gb.state, "vent", "vent pose while the beat runs");
  const bd = JH.makeEnemy("bidet", 100, 40);
  bd.spawnGrace = 0; bd.cdTimer = 0;
  g.player.x = 220; g.player.y = 40;   // inside artillery range
  for (let i = 0; i < 900 && g.embers.length === 0; i++) bd.think(1 / 60, g);
  assert.ok(g.embers.length > 0, "premise: an arc launched");
  assert.ok(bd.fireBeatT > 0, "fire beat armed on launch");
  assert.strictEqual(bd.state, "fire", "fire pose while the beat runs");
});
```

  NOTE for the implementer: read the Gasbag vent-complete branch and the
  Bidet arc-launch branch in `js/entities.js` first (search `gasbag`,
  `bidet` / `BidetTurret`); the beat is set in the SAME branch that spawns
  the cloud / pushes the arc. If the bidet's projectile list is not
  `game.embers`, adjust the premise line to the list it actually uses and
  note it in your report.

- [ ] **Step 2: Run to verify RED**

Run: `node --test tests/air.test.js`
Expected: FAIL — `ventBeatT`/`fireBeatT` undefined.

- [ ] **Step 3: Implement the beats** (`js/entities.js`, TP Mummy `release`
  idiom): in the Gasbag vent-complete branch add
  `this.ventBeatT = 0.25;`; in its think's state selection, after the
  existing state assignments, add
  `if (this.ventBeatT > 0) { this.ventBeatT -= dt; this.state = "vent"; }`.
  Same shape for Bidet: `this.fireBeatT = 0.2;` on launch,
  `if (this.fireBeatT > 0) { this.fireBeatT -= dt; this.state = "fire"; }`
  after its state selection. Movement/attack logic untouched — pose only.

- [ ] **Step 4: registerBaked wiring** (`js/assets.js`): convert the
  `Assets.register("gasbag", ...)` and `Assets.register("bidet", ...)`
  painters into fallbacks (rename to `gasbagFallback`/`bidetFallback`,
  keeping their code byte-identical) and register:

```js
  registerBaked("gasbag",
    { w: 28, h: 29, feet: 28,
      poses: ["idle0", "idle1", "wind0", "wind1", "vent"] },
    (opt) => opt.state === "vent" ? "vent"
           : (opt.state === "wind" || opt.wind) ? ((opt.windFrac || 0) < 0.5 ? "wind0" : "wind1")
           : idlePose(opt),
    gasbagFallback);

  registerBaked("bidet",
    { w: 28, h: 29, feet: 28,
      poses: ["idle0", "idle1", "wind", "fire"] },
    (opt) => opt.state === "fire" ? "fire"
           : (opt.state === "wind" || opt.wind) ? "wind"
           : idlePose(opt),
    bidetFallback);
```

  Also add the wind-hazard image slot next to the WindHazard draw path:
  register `Assets.register("windhazard", ...)` with two frames
  (`sprites/windhazard/idle0.png`, `idle1.png`, alternating on
  `Math.floor(opt.t * 2) & 1`, drawn 28 logical wide feet-anchored, same
  blit shape as the tpmummy-puff painter) and call it from
  `WindHazard.draw` before the procedural body (early-return when the image
  drew, keeping the rim ellipse stroke in BOTH paths — the rim is the
  hitbox and must always render).

- [ ] **Step 5: Write the four generation briefs** to `tmp/briefs/*.txt`.
  Each brief is a complete codex/gpt-image-2 prompt: the jon-hose pixel-art
  rules (hard edges, no AA, thick 2px black outline, flat lighting, solid
  magenta #FF00FF background, no magenta inside the subject), the subject
  description pulled from the current procedural painter's read, the frame
  list with per-frame pose notes from the spec table (gasbag: sag-bob idle
  pair, two inflate stages, deflate spurt; bidet: bowl-shimmer idle pair,
  nozzle-rise wind, recoil fire; hazard: two lazy-broken-spin frames; lip:
  tileable 32x32 segment + broken-guardrail variant), the target canvas
  (112x116, feet row 111; lip: 128x128), facing RIGHT, and "all frames of
  one set in ONE image as a horizontal strip, equal columns, no gaps".
  These files are the deliverable — generation itself is user-interactive
  and out of plan scope.

- [ ] **Step 6: Run full suite** (the baked sets have no PNGs yet — the
  fallbacks must render, which existing tests plus the suite's require-time
  smoke already cover).

Run: `npm test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add js/entities.js js/assets.js tests/air.test.js
git commit -m "art(air-act): gasbag/bidet/hazard baked-sprite hooks + vent/fire pose beats"
```

  (`tmp/briefs/` stays uncommitted — tmp is scratch.)

---

### Task 5: Headless gate + ledger

**Files:**
- Create: `.superpowers/sdd/windpass-verify.mjs` (gitignored scratch)
- Modify: `.superpowers/sdd/progress.md` (never staged)
- No production code unless a defect surfaces (report first).

**Interfaces:**
- Consumes: the headless harness pattern from
  `.superpowers/sdd/tpmummy-verify.mjs` (port 5199 server, Backquote dev
  menu, `devGotoWave`, real key events, screenshot + Read inspection).
  Lane probe fields from Task 1 (`game.gustLanes[i].{y, dir, band, phase}`).

- [ ] **Step 1: Write and run the verify script** — copy the
  tpmummy-verify harness shape; drive:
  1. `devGotoWave(31)` (wave 32): sample `gustLanes[0..1]` geometry at two
     consecutive telegraph starts (poll `phase === "telegraph"`); PASS if
     values stay inside the wave-32 spec ranges and at least one field
     differs between cycles.
  2. `devGotoWave(33)` (wave 34): walk Jon (real arrow keys) into the
     hazard at its authored position; PASS if HP drops by exactly
     `JH.WIND_HAZARD.dmg` once, and a second contact within 0.6s deals
     nothing. Screenshot the hazard: `.superpowers/sdd/windpass-hazard.png`.
  3. `devGotoWave(32)` (wave 33): screenshot the dressed edge
     (`windpass-edge.png`) during a blow; assert `game.cloudlineEdge` still
     resets Jon (drive right with real keys, check position snaps back and
     the poof armed).
  4. Zero page errors, zero telemetry calls (same spies as tpmummy-verify).
- [ ] **Step 2: Read (visually inspect) both screenshots** — the hazard
  must read as an object with a visible rim; the edge must show lip band +
  churn (fallback art until sprites land, that's expected).
- [ ] **Step 3: Run `npm test` and `node tools/air-threat-score.mjs`** one
  final time; both green.
- [ ] **Step 4: Update the ledger** (`.superpowers/sdd/progress.md`): add a
  "Wind Pass" round row: commits, 386+ tests, verify-script results,
  screenshots, and "sprites pending user-verified codex generations —
  briefs in tmp/briefs/".
- [ ] **Step 5: No commit** (only gitignored scratch changed in this task).

---

## Done means

- Wave 32/33/34/35 lanes re-roll depth/direction/band per their specs at
  telegraph start; wave 31 plays byte-identically to today.
- Waves 34-35 field sky-vent hazards that chip the player (8, cooldown
  0.6s) and shove-stagger enemies without damaging them; wave clear never
  waits on them.
- The cloudline edge draws lip + churn + crossing poof with the dashed line
  gone; every pre-existing edge geometry/reset test passes unchanged.
- Gasbag/Bidet/hazard render procedurally today and flip to baked frames
  the moment `sprites/{gasbag,bidet,windhazard,cloudline}/` PNGs land;
  vent/fire beats give the new frames their moments.
- Four generation briefs exist in `tmp/briefs/`.
- Full suite green; threat tool green with the hazards column; headless
  verify green with inspected screenshots; branch held for playtest.
