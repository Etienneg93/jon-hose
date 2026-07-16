# Air Act Plan 2 of 3 — Pressure & Cloudline Holdout

**Goal:** Finish the pre-boss Air World: wave 33 is a distinct Cloudline
Holdout set-piece, waves 34–35 introduce pre-placed Bidets and one authored
super-elite each, and the full Air roster is quantified and playtested before
Ass Man work begins.

**Architecture:** Extend the existing wave machinery instead of adding a
second encounter engine. The Cloudline Holdout remains a `holdout` wave with
one additional `cloudlineEdge` hazard. Pre-placed enemies are wave-data
placements that reserve slots inside the existing field cap. Super Plunger and
Super Gasbag branch inside their regular classes, as existing supers do. All
new values live in `js/config.js`; all shapes share their draw and hit geometry.

**Tech stack:** Vanilla JS, global `JH` namespace, fixed-step canvas loop,
`node --test`, headless Edge through the repository playtest workflow.

**Spec:** `docs/superpowers/specs/2026-07-12-air-act-ass-man-design.md`

**Depends on:** Plan 1 commits through `30f65f0`, the live-playtest support
rounds already on `air-act`, and the uncommitted Plunger/runtime-range work in
the current working tree. Preserve all of it; stage explicit paths only.

## Locked scope

- Build only waves 33–35. Wave 35 temporarily remains the last wave and calls
  `win()`; Plan 3 appends Ass Man at wave 36 and moves victory again.
- The two supers are **Plunger Fiend** and **Gasbag**. The spec's last
  "Plunger/TP super forms deferred" bullet is stale; the roster section and
  build shape are authoritative. TP Mummy and Bidet super forms are deferred.
- No additional roster baking. Procedural TP/Gasbag/Bidet art is sufficient;
  the hand-cleaned Plunger set stays untouched except for runtime wiring fixes.
- No third Air verb and no spray-bending wind.
- No Ass Man, bookend cutscenes, K-9 Unit, leaderboard, or release work.

## Global constraints

- **Honest numbers:** supers add explicit attacks and HP, not hidden spray
  resistance. `waterMult` remains 1.
- **Rim is hitbox:** the cloud-edge line and pull cone each have one geometry
  source used by update, draw, and tests.
- **All tunables in `js/config.js`.** State-machine code contains no gameplay
  durations, damage, ranges, spawn cadence, or pull distances.
- **Peak field cap remains eight.** Pre-placed Bidets and the authored super
  reserve slots before regular opening spawns are sliced; reinforcements fill
  the vacated slots later.
- **One super per authored wave.** No random super conversion.
- **Infinite set-piece/child spawns use the existing anti-farm path.**
- **No jump, no melee.**
- Do not touch `sprites/mook/*`, `sprites/fuse/walk0-3.png`, or run bakers.
- Use explicit `git add` paths. Never stage the whole dirty tree.
- Hold for user playtest; do not merge or release.

## Authoring and balance contract

### New wave data

| Game wave | Name | Backbone | Terrain / apex |
|---|---|---|---|
| 33 | CLOUDLINE HOLDOUT | timed pool: 3 Plunger, 3 TP Mummy, 2 Gasbag | 24s; two rightward gust lanes; cloud edge; regular enemies so the terrain owns the read |
| 34 | PORCELAIN PATROL | 2 Plunger, 2 TP Mummy, 2 Gasbag + 4 Air sprinkles | tough; one pre-placed Bidet; Super Plunger |
| 35 | FOUL WEATHER | 3 Plunger, 3 TP Mummy, 2 Gasbag + 4 Air sprinkles | tough; two pre-placed Bidets; Super Gasbag; two opposed gust lanes |

Wave 34 opens with at most: one Bidet + one super + six regulars = eight.
Wave 35 opens with at most: two Bidets + one super + five regulars = eight.
The rest stays in `wavePool`, preserving the surge cadence.

### Tunable starting points

Add these config-owned starting values; they are playtest knobs, not promises:

```js
JH.CLOUDLINE_HOLDOUT = {
  holdDur: 24,
  spawnEvery: 1.35,
  maxAlive: 4,
  edgeInset: 28,
  resetDist: 54,
  edgeDmg: 12,
};

JH.SUPER_PLUNGER = {
  pullWind: 1.2,
  pullPulses: 3,
  pullRange: 150,
  pullNearHalf: 12,
  pullFarHalf: 44,
  pullStep: 20,
};

JH.SUPER_GASBAG = {
  megaRadius: 60,
  megaLife: 7.5,
  megaFriendlyLife: 4,
  megaFriendlyDps: 12,
  childCount: 2,
  childHpMult: 0.5,
  childScale: 0.72,
  childFirstVent: 1.0,
  childSpawnRadius: 28,
};
```

Add `plunger: { hp: 2 }` and `gasbag: { hp: 2.5 }` to `JH.SUPER_TUNE`.
At the late-act elite ceiling (`hp × 3.956`), this produces approximately:

- Super Plunger: `60 × 3.956 × 2 = 475 HP`.
- Super Gasbag: `55 × 3.956 × 2.5 = 544 HP`, plus two half-HP children.

`superEliteDef` must double `lungeDmg`, so a ceiling-scale Super Plunger hit
is about `10 × 1.68 × 2 = 34 HP`. Its latch drain remains 22 water/s: the
signature pull raises connection pressure without turning one missed dash
into a guaranteed empty tank.

### Threat-score targets

The Plan 1 regular baselines remain:

| Type | Damage/output math per 10s | Target read |
|---|---:|---|
| Plunger | `10 / 5.7 × 10 = 17.5 HP` + `22 × 2.5 / 5.7 × 10 = 96.5 water` | resource rusher |
| TP Mummy | `8 / 2.85 × 10 = 28.1 HP` + soft slow | light control |
| Gasbag | up to 30 base DPS denied while gassed | priority control |
| Bidet | `12 / 3.5 × 10 = 34.3 HP` | artillery |

Super Plunger adds a 1.2s pull beat. At ceiling elite damage its cycle is
approximately `1.2 + 0.5 + 2.5 + 2.2 = 6.4s`: `53 HP/10s` plus
`86 water/10s` if every latch holds. Three telegraphed pull pulses and dash
break are the counterplay. Super Gasbag's threat is its death endpoint, not a
hidden DPS multiplier: a 60px cloud plus exactly two finite children.

---

## Task 1 — Extend progression and add field-cap-aware placements

**Files:**

- Modify `js/config.js` (`LEVEL_LEN`, Air waves, `SUPER_TUNE`).
- Modify `js/game.js` (`WAVE_TRIGGERS`, regular-wave spawn reservation).
- Modify `tests/air.test.js`.

**Interfaces:**

- Wave data gains optional `placements: [{ type, x, y }]`, where `x` is an
  offset from the locked arena's left bound and `y` is world depth.
- `Game.spawnWavePlacements(wave)` returns the number of live reserved slots.
- Opening regular count is
  `max(0, fieldCap - placementCount - (wave.superElite ? 1 : 0))`.

- [ ] Add failing tests:
  - wave list has 35 entries and waves 33–35 match the table above;
  - every Air placement is a Bidet and lies inside a 440px arena/depth band;
  - `WAVE_TRIGGERS.length === waves.length` emits no warning;
  - wave 32 clearing no longer wins; wave 35 clearing temporarily does;
  - placements plus super plus opening regulars never exceed Air field cap 8.
- [ ] Extend triggers by the existing 380px cadence:
  `12980, 13360, 13740`.
- [ ] Raise `JH.LEVEL_LEN` from 12800 to 14300 so wave 35's locked arena and
  free-walk cleanup cannot be clamped short. Plan 3 will extend it again for
  the boss arena.
- [ ] Add wave data exactly from the authoring table. Suggested placements:
  wave 34 `{ type: "bidet", x: 344, y: 18 }`; wave 35 at
  `{ x: 112, y: 18 }` and `{ x: 344, y: 68 }`.
- [ ] Implement `spawnWavePlacements`; apply `nextEliteScale()` on tough
  waves, set `spawnGrace = 0.8`, and never put Bidets in `wavePool`.
- [ ] Reserve placement/super slots before slicing the regular opening batch.
- [ ] Run `node --test tests/air.test.js` and `npm test`.
- [ ] Commit only `js/config.js`, `js/game.js`, and `tests/air.test.js`:
  `feat(air-act): extend progression through waves 33-35 with capped placements`

## Task 2 — Cloudline edge: one line, one penalty shape

**Files:**

- Modify `js/config.js` (`JH.CLOUDLINE_HOLDOUT`).
- Modify `js/entities.js` (`CloudlineEdge`).
- Modify `js/game.js` (state lifecycle, update, draw, cleanup).
- Modify `tests/air.test.js`.

**Interfaces:**

- `new JH.CloudlineEdge(x)`.
- `edge.crossed(entity)` tests the entity's forward body rim against the same
  world-X line drawn by `edge.draw`.
- `edge.update(dt, game)` resets Jon inward on every crossing and routes the
  12 HP penalty through `Player.takeHit`; reset happens even if i-frames or a
  dodge negate that particular hit.

- [ ] Add failing geometry tests:
  - player front rim one epsilon inside does not cross;
  - front rim touching the line crosses;
  - crossing resets to `edge.x - resetDist` and never kills instantly by a
    special path (normal `takeHit` owns HP/death);
  - repeated update after reset cannot multi-hit on adjacent frames.
- [ ] Implement `CloudlineEdge` with line X, reset, shake, and a short visible
  gust burst. Do not add an invisible damage rectangle.
- [ ] Draw a bright broken walkway line at exactly `edge.x - cam`, plus wind
  streaks falling away on the unsafe side. No full-screen overlay.
- [ ] Add `cloudlineEdge: null` to Game state; initialize/reset it in every
  array-reset path that clears Air hazards.
- [ ] Create it only for `wave.cloudlineEdge`, at
  `bounds.maxX - JH.CLOUDLINE_HOLDOUT.edgeInset`.
- [ ] Update it after gust lanes so a gust crossing resolves in the same
  fixed step. Draw it with terrain hazards before actors.
- [ ] Clear it in `waveCleared_`, death/respawn, dev warps, and new-run reset.
- [ ] Run targeted tests and `npm test`.
- [ ] Commit explicit paths:
  `feat(air-act): add honest cloudline edge penalty for the holdout`

## Task 3 — Make wave 33 a dedicated Cloudline Holdout

**Files:**

- Modify `js/config.js` (wave 33 and holdout tunables).
- Modify `js/game.js` (Air holdout cadence and messaging).
- Modify `tests/air.test.js`.
- Use `.claude/skills/headless-playtest/SKILL.md` for verification.

**Behavior:**

- Reuse the existing holdout timer, `wallPool`, infinite-spawn anti-farm
  budget, countdown HUD, sigil beat, cross reward, and no-mop-up clear.
- When `cloudlineEdge` is true, use `CLOUDLINE_HOLDOUT.spawnEvery/maxAlive`
  rather than `JH.WALL` values. Older `HOLD THE LINE` remains unchanged.
- Two rightward gust lanes sit at depth 18 and 68, leaving a readable center
  route. The edge, not enemy HP, is the encounter objective pressure.

- [ ] Add failing tests proving:
  - wave 33 is `holdout`, `cloudlineEdge`, 24 seconds, with two rightward
    lanes and no Bidet/super;
  - its reinforcement cap is 4 while the older holdout still uses
    `JH.WALL.maxAlive`;
  - timer expiry clears infinite enemies, edge, and gusts, then awards the
    standard set-piece sigils/cross/XP exactly once.
- [ ] Factor the holdout spawn cadence selection into a small Game helper so
  the update branch does not duplicate the whole encounter loop.
- [ ] Use banner copy `CLOUDLINE HOLDOUT — STAY OFF THE EDGE!`.
- [ ] Headless-drive wave 33 for its full timer with real movement/dashes;
  assert at least one gust cycle, one edge reset, continued play state, and
  a clean transition to free-walk. Capture and inspect a telegraph screenshot.
- [ ] Run `npm test`.
- [ ] Commit explicit paths:
  `feat(air-act): Cloudline Holdout survives gusts at the walkway edge`

## Task 4 — Super Plunger: Triple Latch

**Files:**

- Modify `js/config.js` (`JH.SUPER_PLUNGER`, `SUPER_TUNE.plunger`).
- Modify `js/world.js` (shared ground-wedge geometry).
- Modify `js/entities.js` (Plunger super state + telegraph draw).
- Modify `js/balance.js` (`superEliteDef` doubles `lungeDmg`).
- Modify `tests/air.test.js`, `tests/entities.test.js`, and
  `tests/balance.test.js`.

**Geometry contract:**

- Add `Geo.groundWedgePoints(cx, cy, angle, range, nearHalf, farHalf)` and
  `Geo.inGroundWedge(...)`. Both use the same local forward/lateral
  transform and config dimensions. Drawing consumes the returned polygon;
  hit/pull tests consume `inGroundWedge`.

**State contract:**

- A super in attack range locks an aim angle and holds an explicit 1.2s pull
  windup while keeping its attack ticket.
- Three evenly spaced pulses test the locked wedge. Each successful pulse
  moves Jon at most 20px toward the Plunger, clamped to arena/depth bounds;
  pulses deal no damage and cannot pull through the Plunger.
- After pulse three, the existing lunge/latch state resolves along the locked
  aim. Dash i-frames can still dodge the grab; a dash still breaks a latch.
- Regular Plungers never enter the pull state.

- [ ] Add failing wedge rim tests for near edge, far widening edge, outside
  lateral edge, behind origin, and draw-point/hit agreement.
- [ ] Add failing behavior tests:
  - regular Plunger behavior unchanged;
  - super emits exactly three pulses over `pullWind`;
  - inside target is pulled, outside/behind target is not;
  - pull does not change HP/water;
  - the third pulse transitions to the existing lunge, which can latch;
  - dash dodge and dash break remain valid;
  - super lunge damage doubles in `superEliteDef` without mutating base def.
- [ ] Draw the locked wedge before the actor: translucent fill, exact rim,
  central aim streak, and three pulse beats. Reuse the current `wind.png`;
  generate no new art.
- [ ] Ensure pull state cleans up `usingTicket` on miss, death, or interrupted
  target state.
- [ ] Run targeted tests and `npm test`.
- [ ] Commit explicit paths:
  `feat(air-act): Super Plunger telegraphs a triple vacuum pull before latching`

## Task 5 — Super Gasbag: Fog of War

**Files:**

- Modify `js/config.js` (`JH.SUPER_GASBAG`, `SUPER_TUNE.gasbag`).
- Modify `js/entities.js` (`StinkCloud` instance options, mini Gasbags,
  Gasbag death branch).
- Modify `tests/air.test.js` and `tests/entities.test.js`.

**Interfaces:**

- `StinkCloud` accepts optional per-instance `radius`, `life`,
  `friendlyLife`, and `friendlyDps`; defaults remain `JH.STINK`.
- `Gasbag.makeMini()` clones the regular Gasbag def, applies the configured
  HP/body/sprite scale, and never inherits `superElite`.
- Super death always creates exactly one mega-cloud and two mini Gasbags.
  Before its first successful vent the mega-cloud is friendly; after a vent
  it is hostile. Children are `infinite` for drop-budget purposes and never
  recursively split.

- [ ] Add failing cloud-option tests: radius grows to 60, hit/draw footprint
  still agrees at the rim, custom life expires, defaults remain unchanged.
- [ ] Add failing super-death tests:
  - pre-vent death => one friendly mega-cloud + two minis;
  - post-vent death => one hostile mega-cloud + two minis;
  - children have half base HP, 0.72 scale, first-vent delay, no super flag;
  - child deaths follow regular Gasbag behavior and never split again;
  - regular Gasbag pop-fast behavior is unchanged.
- [ ] Let `Enemy.draw` prefer an optional per-instance `spriteScale` before
  elite/super defaults so mini procedural sprites and their hit bodies agree.
- [ ] Clamp child spawn positions to arena/depth bounds and give 0.5s spawn
  grace so the death burst never creates unavoidable contact damage.
- [ ] Run targeted tests and `npm test`.
- [ ] Commit explicit paths:
  `feat(air-act): Super Gasbag bursts into a mega-cloud and two minis`

## Task 6 — Author waves 34–35 and verify encounter truth

**Files:**

- Modify `js/config.js` (final wave 34–35 data/tuning).
- Modify `js/game.js` only if review exposes placement lifecycle defects.
- Modify `tests/air.test.js` and `tests/entities.test.js`.

- [ ] Turn on the exact authored composition from the table after both super
  implementations exist.
- [ ] Assert wave 34 spawns Super Plunger and wave 35 Super Gasbag, never the
  opposite and never more than one.
- [ ] Assert pre-placed Bidets are live wave members: they block clear until
  killed, are never sprinkled, and disappear through normal death/clear
  lifecycle rather than special cleanup.
- [ ] Assert wave 35's two placements + super reserve three of eight opening
  slots and the seven remaining regulars stay queued for later surges.
- [ ] Assert wave 35 clear is the only temporary final `win()` path.
- [ ] Run `npm test`.
- [ ] Commit explicit paths:
  `feat(air-act): author Porcelain Patrol and Foul Weather pressure waves`

## Task 7 — Quantified threat pass and full headless gate

**Files:**

- Create `tools/air-threat-score.mjs`.
- Modify `js/config.js` only for evidence-backed tuning.
- Modify relevant tests for any tuned config-derived expectation.
- Update `.superpowers/sdd/progress.md` after verification.

**Threat tool output:**

- Print the four regular per-10s calculations from this plan.
- Print Super Plunger ceiling HP, lunge HP/10s, and water/10s.
- Print Super Gasbag ceiling HP, child effective HP, and mega footprint.
- Print each Air wave's authored count, placement count, queued count, peak
  field count, tough fraction, and authored super.
- Exit nonzero if peak field count exceeds `WAVEFLOW.fieldCap[5]`, an Air
  wave contains a non-Air regular, Bidet enters the sprinkle pool, or a wave
  contains more than one super.

- [ ] Run the tool and include its table in the task report.
- [ ] Run full `npm test`.
- [ ] Headless-drive a fresh Air entry through waves 30–35 with real keys:
  - install a telemetry fetch spy before `startGame`;
  - exercise latch/dash break, gas dispersal, and depth dodge;
  - survive wave 33 normally;
  - kill both supers through real damage or controlled HP setup, verifying
    their signature move/death state first;
  - verify the wave 33 sigil/cross and that the existing vendor cadence does
    not create an unintended back-to-back shop;
  - verify wave 35 reaches temporary win and no stale edge/gust/cloud remains.
- [ ] Capture and visually inspect screenshots for the holdout edge,
  Triple Latch wedge, friendly mega-cloud, and both late-wave openings.
- [ ] Review every Plan 2 diff for hardcoded tunables, duplicate geometry,
  reward farming, wave softlocks, stale hazard arrays, and unrelated WIP.
- [ ] Update the ledger: Plan 2 complete, temporary win after wave 35,
  Plan 3 next.
- [ ] Commit only the threat tool/config/tests/ledger paths that changed:
  `test(air-act): quantify and verify waves 33-35 pressure curve`

---

## Done means

- Waves 30–35 play from Air entry without dev-only state edits.
- Wave 33 is a readable timer survival set-piece with an exact drawn edge;
  crossing costs normal HP and resets Jon inward, never instant-kills.
- Wave 34 has one pre-placed Bidet and Super Plunger; wave 35 has two
  pre-placed Bidets and Super Gasbag; peak live field count stays at eight.
- Triple Latch has three visible, dodgeable pull beats and preserves dash as
  the latch counter.
- Fog of War always creates one mega-cloud + two finite minis; pop-fast flips
  only the mega-cloud's allegiance.
- Threat script, full unit suite, and full headless Air run are green.
- No new sprite generation and no Plan 3 scope landed.
- Branch remains held for user playtest. Wave 35 temporarily calls `win()`.
