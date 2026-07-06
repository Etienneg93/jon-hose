# Fire-Truck Escape — Implementation Plan

> **STATUS: NOT STARTED.** Feature branch `claude/fire-truck-minigame-concept-2pdlg0`.

> **For agentic workers:** REQUIRED SUB-SKILL — use `superpowers:subagent-driven-development`
> (or `superpowers:executing-plans`) to implement task-by-task. Steps use
> checkbox (`- [ ]`) syntax; keep the ledger `.superpowers/sdd/progress.md` current.

**Goal:** A self-contained ~60s fire-truck escape sub-mode that fires after the
Slayer, bridges the Fire World to the Air World gate, and reuses the game's
three verbs (move=dodge/aim, spray=kill, dash=swerve) plus the fire roster and
the essence/benediction reward plumbing.

**Architecture:** A bespoke scene module `JH.TruckRun` (`js/truck.js`) modeled on
the Church interlude (`js/church.js`) — it owns a `scene` object with an internal
phase machine and is dispatched from `game.js` via a new `state === "truck"`
branch. It does **not** touch the `Player`/`enemies`/wave systems; it holds its
own truck object + lightweight hazard/hydrant/pickup lists. Pure, order-sensitive
logic (spawn timeline, pressure tiers, essence bonus, douse math) lives in a
dual-export helper `js/truckrun.balance.js` so it is unit-tested with `node:test`
the way `balance.js` is. Entry seam: `afterSlayerCutscene` (`js/game.js:618-637`),
today a placeholder `victoryPortal → win()`.

**Tech Stack:** Vanilla JS IIFEs on `window.JH`; `node --test` + `node:assert`;
headless verification via the `headless-playtest` skill (playwright-core + Edge).

**Source spec:** `docs/superpowers/specs/2026-07-06-fire-truck-escape-design.md`.

## Global Constraints

- Work on the existing branch **`claude/fire-truck-minigame-concept-2pdlg0`**.
  Stage files by exact path; never `git add -A`.
- **Playtest gate (user rule):** commit + push to the feature branch freely, but
  **do NOT merge to main** until the user plays the feel and says push. This is a
  **minor** release (full designed pass) when it lands.
- **Config is the single source of truth:** every tunable goes in the new
  `JH.TRUCKRUN` block in `js/config.js`. No gameplay constants hardcoded in
  `truck.js`/`truckrun.balance.js`.
- **Rim-is-hitbox:** every hazard/telegraph derives draw and hit from ONE shape.
  Reuse `Geo.inGroundEllipse` (`js/world.js:53-58`) and `FirePatch.footprint()`
  (`js/entities.js:2072-2076`). Unit-test any new rim.
- **Honest numbers:** truck HP is a visible bar; collision damage is visible; no
  hidden soaks. Fire-roster hazard stats are READ from `JH.ENEMIES`, not copied.
- **No new player buttons.** move / spray (hold) / dash only. Dash reuses the
  input buffer (`Input.buffered("dash")`/`consume`).
- **Art:** procedural-first fallbacks (Firewall-style). NEVER re-run bakers over
  hand-cleaned `sprites/mook/*` or `sprites/fuse/*` (CLAUDE.md §5). New chrome is
  a dedicated later task; earlier tasks may use placeholder rects.
- **Comments:** behavioral/mechanical facts only (units, coord conventions,
  gotchas). Design intent goes in commit messages, not source.
- **New scripts:** register `js/truckrun.balance.js` after `balance.js`
  (`index.html:104`) and `js/truck.js` after `church.js` (`index.html:114`,
  before `game.js`).
- **Headless input gotcha:** a programmatic keypress must span ≥2 frames or the
  edge is lost (inputs buffered 130ms). Fake-clock the pure tests.
- Each task leaves the game **bootable and runnable** (`npm run dev`), degrading
  gracefully (placeholder art, partial hazards) rather than throwing.

---

### Task 1: Config block + pure balance helpers (test-first)

**Files:**
- Modify: `js/config.js` (add `JH.TRUCKRUN`)
- Create: `js/truckrun.balance.js` (dual-export like `balance.js`)
- Create: `tests/truckrun.test.js`
- Modify: `index.html` (register `truckrun.balance.js` after line 104)

**Interfaces (produced):**
- `JH.TruckBalance.buildTimeline(cfg, rng) → [{at, kind, depth, ...}]` — the
  deterministic ~60s spawn schedule (sorted by `at`). Density follows the beat
  map (§8 of spec): sparse 0–12s, build 12–35s, dense 35–52s, none after 52s.
- `JH.TruckBalance.truckPressure(cfg, waterFrac) → {dmgScale, rangeMult}` — the
  two-tier pressure (full at/above floor; dry sputter otherwise).
- `JH.TruckBalance.douse(hp, dps, dt) → hp'` — furnace extinguish step.
- `JH.TruckBalance.cleanBonus(cfg, hpFrac, wallTouched) → essence` — the
  Clean-Escape reward tier.
- `JH.TruckBalance.gapExists(events, atWindow) → bool` — invariant helper: at
  every moment a passable depth lane exists (used by tests, and by the spawner to
  reject impossible walls).

**`JH.TRUCKRUN` fields** (values from spec §"Config"; keep them named):

```
runDuration:60, scrollSpeed:320, truckScreenX:140, throttleBand:40,
truckHp:200, tank:100, drain:20, regen:6, pressureFloor:0.06,
hoseDps:120, hoseRange:200, hoseBand:28, dryDpsMult:0.25, dryRangeMult:0.5,
knockback:180,
hydrantHp:30, hydrantRefill:60, washRadius:40, hydrantEverySec:9,
wreckHp:50, wreckDmg:15, collideSlow:0.8, collideSlowDur:0.6,
wall: { startGap:220, creepOnHit:60, recoverRate:35, contactBurnStacks:1 },
furnace: { atSec:35, hp:850, ventCd:2.4, ventPatchDur:2.6, essence:2 },
crossVal:1, crossCount:6, cleanBonusTiers:[1,2],
lanes:[16,43,70]
```

- [ ] **Step 1: Write the failing tests** — `tests/truckrun.test.js`. Mirror the
  `balance.js` test bootstrap (`require("../js/config.js"); require("../js/truckrun.balance.js")`;
  read `JH.TRUCKRUN`). Cases:
  - `buildTimeline` is **deterministic** for a fixed seeded rng (two calls equal).
  - Density curve: count events in `[0,12)`, `[12,35)`, `[35,52)`, `[52,60]` is
    increasing then zero; assert monotonic build and empty tail.
  - `gapExists` true across the whole timeline (no impossible walls) — derive the
    truck's traversable depth speed from `scrollSpeed`/geometry and assert every
    overlapping-hazard cluster leaves ≥1 lane.
  - `truckPressure`: `frac >= pressureFloor` → `{1.0, 1.0}`; `frac <= 0` →
    `{dryDpsMult, dryRangeMult}`.
  - `douse`: `douse(850, 120, 1) === 730`; clamps at 0.
  - `cleanBonus`: full HP + no wall touch → `cleanBonusTiers[1]`; mid HP → `[0]`;
    low/ wall-touched → 0. Derive expectations from `JH.TRUCKRUN`, not literals.
- [ ] **Step 2: Run to verify FAIL** — `node --test tests/truckrun.test.js`
  (`JH.TruckBalance is not defined`).
- [ ] **Step 3: Implement** the config block and the pure module (seeded rng
  passed in — no `Math.random` in the module, mirroring `benedictions.pickOffers`
  injectable rng). `buildTimeline` composes per-window spawn tables; each event
  carries `kind` ∈ {`wreck`,`fuse`,`smelt`,`pyro`,`hydrant`,`cross`} + `depth`
  from `lanes` + kind-specific fields.
- [ ] **Step 4:** `npm test` (capture `ec=$?`; ~214 existing + new all pass).
- [ ] **Step 5: Commit** `js/config.js js/truckrun.balance.js tests/truckrun.test.js index.html`
  — `feat(truck): config block + pure timeline/pressure/reward helpers`.

---

### Task 2: Scene skeleton + state wiring + debug entry

**Files:**
- Create: `js/truck.js` (`JH.TruckRun = { enter, update, renderScene }`)
- Modify: `js/game.js` (state dispatch + `afterTruckRun`; debug hook)
- Modify: `index.html` (register `truck.js` after line 114)

**Interfaces:**
- Consumes: `JH.TRUCKRUN`, `JH.Input`, `JH.Camera`/`JH.Background` patterns.
- Produces: `JH.TruckRun.enter(game)` builds `scene` (truck at mid-depth,
  `hp=truckHp`, `water=tank`, `scrollX=0`, `phase="intro"`, `timeline` from
  Task 1, `cursor=0`); `update(dt, game)` advances scroll + truck movement + phase
  machine; `renderScene(ctx, game)` draws parallax + road + truck (placeholder
  rects OK this task); on `t >= runDuration` calls `game.afterTruckRun()`.
- `game.afterTruckRun()` (new): for now → `this.win()` (air-world stub); the
  benediction beat is added in Task 8.

- [ ] **Step 1: Implement the scene + dispatch.**
  - `js/game.js` update cascade (beside the church branch ~`:1352`):
    `if (this.state === "truck") { JH.TruckRun.update(dt, this); return; }`
  - render cascade (beside church render ~`:1670`):
    `if (this.state === "truck") { JH.TruckRun.renderScene(this.ctx, this); return; }`
  - **Movement:** vertical input → truck `depth` clamped `[DEPTH_MIN, DEPTH_MAX]`
    (reuse `Geo.clampDepth`); horizontal input → `screenX` within
    `truckScreenX ± throttleBand`. Dash → depth burst using `dashSpeed/dashTime/dashCd`
    + i-frames, reading `Input.buffered("dash")`/`consume` (matches Player).
  - **Phase machine:** `intro` (0–~1.5s camera/settle, banner "PUNCH IT!") →
    `run` (spawns from timeline) → `arrive` (last ~2s, gate slides in) → exit.
- [ ] **Step 2: Debug entry hook** — `JH.Game` gains `debugEnterTruck()` that
  sets `state="truck"` + `JH.TruckRun.enter(this)` (guard behind a `?truck=1`
  query param in `main.js`, or a console-callable method). Needed for headless
  verification without a full run to Slayer.
- [ ] **Step 3:** `npm test` (no new unit coverage — DOM-bound; exit code clean).
- [ ] **Step 4: Verify headless** (`headless-playtest` skill): boot with
  `?truck=1`, assert no `pageerror`; drive Up/Down/Left/Right for ~2s and assert
  `JH.Game.scene.truck.depth` changes and `scene.scrollX` increases; let it run
  60s (or fast-forward `scene.t`) and assert it reaches `win`. Screenshot.
- [ ] **Step 5: Commit** `js/truck.js js/game.js index.html`
  — `feat(truck): scene skeleton, state dispatch, debug entry`.

---

### Task 3: The truck hose — big blast, tank, two-tier pressure

**Files:** Modify `js/truck.js`; (optional) `tests/truckrun.test.js` for the
swath hit-test.

**Interfaces:**
- Produces: `scene.spraying` (hold), water drain/regen, `TruckBalance.truckPressure`
  applied to `hoseDps`/`hoseRange`; a **forward swath** hit test
  `truckBeamHits(hazard)` = `hazard.worldX` within `[nozzleX, nozzleX+range]` AND
  `|hazard.depth − truck.depth| <= hoseBand` (ONE shape shared with the beam
  render — rim-is-hitbox).

- [ ] **Step 1** (optional test): pure `beamCovers(truckDepth, hoseBand, targetDepth, dx, range)`
  in `truckrun.balance.js` + tests (edge depths in/out; beyond range out).
- [ ] **Step 2: Implement** spray: on hold, drain `drain*dt`, lock regen briefly
  (mirror `regenDelay`); when not spraying and past the lock, `+regen*dt` to tank.
  Beam damages any hazard passing `truckBeamHits` by
  `hoseDps*dmgScale*dt`; applies `knockback` shove. Dry tank → sputter tier.
  Render a wide translucent water swath from the nozzle (placeholder OK; polished
  in Task 9).
- [ ] **Step 3:** `npm test`.
- [ ] **Step 4: Verify headless** — spawn one stub hazard ahead in the truck's
  lane (via a debug helper), hold Space, assert its `hp` drops and it dies; hold
  Space ~6s and assert `scene.truck.water` bottoms out then sputters (dps drops).
- [ ] **Step 5: Commit** — `feat(truck): oversized forward hose + light tank/pressure`.

---

### Task 4: Hazards — fire roster reuse + collisions + honest HP

**Files:** Modify `js/truck.js`; reuse `js/entities.js` `FirePatch`/`spawnFirePatch`.

**Interfaces:**
- Produces: hazard spawns consumed from `scene.timeline` as `scrollX` passes each
  `at`; hazard kinds:
  - `wreck` — static in a lane, `hp=wreckHp`; beam breaks it; un-broken contact
    with the truck = `-wreckDmg` HP + `collideSlow` speed mult for `collideSlowDur`.
  - `fuse` — reads `JH.ENEMIES.fuse` (`hp 65`, `blastDmg 18`); rushes the truck;
    beam pops it; contact = `-blastDmg` + a `FirePatch` (existing behavior).
  - `smelt` — reads `JH.ENEMIES.smelt`; roadside, lobs a `FirePatch` (via
    `JH.spawnFirePatch`) into a lane ahead; driving the truck through the patch
    footprint = burn stacks (`applyBurn`-equivalent on the truck); beam douses the
    patch (reuse `sprayProgress` douse math).
  - `pyro` — reads `JH.ENEMIES.pyro` (`emberDmg 9`); roadside spitter; embers
    cross lanes; dodge or kill.
- Truck HP is **non-lethal**: it clamps at 0, feeds shake + speed loss, and is
  read by the Clean-Escape bonus (Task 7) — it never ends the run.

- [ ] **Step 1: Implement** hazard structs + spawn + per-kind update/collision +
  render (placeholder shapes; sprite hookup in Task 9). Collision test reuses
  `Geo.inGroundEllipse`/AABB in truck-depth space (rim-is-hitbox). Fire-patch
  contact on the truck reuses `FirePatch.footprint()`.
- [ ] **Step 2:** `npm test` (timeline-consumption ordering can get a pure test:
  events fire in `at` order, none skipped).
- [ ] **Step 3: Verify headless** — full 60s drive-through: assert hazards of each
  kind appear, beam kills reduce their count, an intentional collision drops
  `scene.truck.hp`, and a fire-patch drive-through applies burn. Screenshot mid-run.
- [ ] **Step 4: Commit** — `feat(truck): fire-roster road hazards + honest collision HP`.

---

### Task 5: Hydrants — refuel + lane-wash weapon

**Files:** Modify `js/truck.js`.

**Interfaces:** hydrant = smashable prop (`hp=hydrantHp`); beam-break →
`+hydrantRefill` water AND a one-shot friendly wash AoE (reuse the `FirePatch`
*friendly* pattern, `js/entities.js:2081-2094`) that kills/soaks hazards within
`washRadius` and extinguishes overlapped patches. Placed from timeline
(`hydrantEverySec`), often one lane off the safe line.

- [ ] **Step 1: Implement.** Wash uses `Geo.inGroundEllipse(washRadius)` — ONE
  shape for draw + hit.
- [ ] **Step 2:** `npm test`.
- [ ] **Step 3: Verify headless** — drive into a hydrant lane, blast it, assert
  `scene.truck.water` jumps by `hydrantRefill` and a nearby stub hazard dies.
- [ ] **Step 4: Commit** — `feat(truck): smashable hydrants (refuel + lane-wash)`.

---

### Task 6: Collapse-wall pressure loop (non-lethal)

**Files:** Modify `js/truck.js`; config `JH.TRUCKRUN.wall`.

**Interfaces:** `scene.wallGap` (world px behind the truck). Collisions
(speed loss) let the wall creep (`creepOnHit`); clean driving restores
(`recoverRate`). Wall contact (`wallGap <= 0`) = burn stacks
(`contactBurnStacks`) + heavy shake + blocks the rearmost lanes + "FORWARD!"
banner — but **cannot kill** and cannot stop forward progress (rubber-band).

- [ ] **Step 1: Implement** the gap integrator + render the wall at the left edge
  (placeholder gradient; art in Task 9).
- [ ] **Step 2:** pure test for the gap integrator (`wallStep(gap, hitThisTick, dt)`
  monotone within bounds; never past the truck permanently).
- [ ] **Step 3: Verify headless** — force repeated collisions, assert `wallGap`
  shrinks and wall-contact applies burn but `scene.truck.hp > 0` path still
  reaches `win` (non-lethal).
- [ ] **Step 4: Commit** — `feat(truck): collapse-wall rubber-band pressure`.

---

### Task 7: Furnace douse-race climax + essence + Clean-Escape bonus

**Files:** Modify `js/truck.js`; reuse `js/entities.js` Furnace vent + `Pickup`.

**Interfaces:**
- At `furnace.atSec`, spawn the climax Furnace (`hp` from config, reads real
  Furnace vent behavior). Beam holds → `TruckBalance.douse` reduces HP while it
  spits vent-fire patches into lanes. HP→0 = extinguished pop + a **fat `"cross"`
  Pickup** (`value = furnace.essence`). If not broken by `arrive`, it falls behind
  (no penalty beyond lost essence).
- Roadside **`"cross"` pickups** (`crossCount`, `crossVal`) strewn in risky lanes
  from the timeline; reuse the existing `Pickup` `"cross"` (banks on contact via
  `JH.Church.addEssence`, `js/entities.js:2601-2606`).
- On exit, `TruckBalance.cleanBonus(cfg, hp/truckHp, scene.wallTouched)` grants
  bonus essence via `JH.Church.addEssence`.

- [ ] **Step 1: Implement** furnace spawn/douse/vent + cross strew + collect +
  clean bonus. Crosses can reuse the real `Pickup` class or a scene-local
  equivalent that calls `Church.addEssence` — prefer reusing `Pickup` for the
  bob/collect juice.
- [ ] **Step 2:** `npm test` (cleanBonus + douse already covered in Task 1;
  extend if the integration reveals edge cases).
- [ ] **Step 3: Verify headless** — reach the climax (fast-forward `scene.t` to
  `furnace.atSec`), hold beam, assert furnace HP falls to 0 and
  `JH.Church.getEssence()` (or equivalent) increases by furnace + collected +
  clean bonus. Screenshot the climax.
- [ ] **Step 4: Commit** — `feat(truck): furnace douse-race + essence score + clean bonus`.

---

### Task 8: Arrival → benediction beat + Slayer entry + air handoff

**Files:** Modify `js/game.js` (`afterSlayerCutscene`, `afterTruckRun`, Slayer
sigil suppression, `js/truck.js` exit).

**Interfaces:**
- `afterTruckRun()` opens the **existing sigil trio** at the gate:
  `JH.Benedictions.pickOffers({active, pillarRanks, usedOnce, censer})` →
  `new JH.Sigil(...)` row, banner "BENEDICTION — CHOOSE ONE" (mirror
  `js/game.js:531-542`). One pick clears the trio (existing `Sigil.pick`); then
  the air-world entrance — for now `this.win()` (`js/game.js:1243-1252`), a
  clearly-commented swap point for the Ass Man act intro.
- **Real entry:** replace the `victoryPortal` block in `afterSlayerCutscene`
  (`js/game.js:627-634`) with `this.state="truck"; JH.TruckRun.enter(this)`.
- **Suppress the Slayer's own post-boss sigil** so there is exactly one
  benediction beat (at the truck arrival): skip the `pickOffers` path for the
  Slayer wave in `waveCleared_`.

- [ ] **Step 1: Implement** the three wiring changes.
- [ ] **Step 2:** `npm test`.
- [ ] **Step 3: Verify headless — full seam:** drive (or debug-jump) to Slayer
  defeat → cutscene confirm → truck run → arrival → assert the Sigil trio exists,
  pick one, assert benediction applied and state reaches `win`; assert NO duplicate
  sigil fired at the Slayer wave. Screenshot the arrival + sigils.
- [ ] **Step 4: Commit** — `feat(truck): wire Slayer→truck→benediction→air handoff`.

---

### Task 9: Art pass — procedural chrome (bake later)

**Files:** `js/truck.js` render; possibly `js/assets.js` (`registerBaked` pattern)
+ `tools/*.mjs` if baking; new `sprites/` only if baked.

**Interfaces:** replace placeholder shapes with: fire-truck side sprite (Jon at
the nozzle), road/highway foreground + fire-palette parallax layers (adapt
`JH.Background`), hydrant prop, collapse-wall, molten-wreck. **Procedural-first**
(Firewall-style); a baked truck sprite is optional and, if done, via node tools
(imagen is 429-dead) — NEVER rebake hand-cleaned `sprites/mook|fuse/*`.

- [ ] **Step 1: Implement** procedural painters (parallax palette, road, truck,
  props). Keep draw shapes identical to the Task 3–7 hit shapes (rim-is-hitbox).
- [ ] **Step 2:** `npm test` (asset wiring must not break the suite;
  `registerBaked` fallbacks stay).
- [ ] **Step 3: Verify headless** — screenshot the full run (intro, build,
  climax, arrival) for the record; confirm 60fps-ish (no per-frame allocation
  storms) and no `pageerror`.
- [ ] **Step 4: Commit** — `feat(truck): procedural art pass (truck, road, props, wall)`.

---

### Task 10: Handoff

- [ ] **Step 1:** Full `npm test` (exit-code checked) + a clean headless full-run
  capture. Summarize numbers: hose dps vs Jon, tank seconds, essence range, HP
  budget.
- [ ] **Step 2:** STOP — **no merge.** Hand to the user for the playtest gate.
  Playtest focus: does the beam feel *huge*; is dodging readable at speed; is the
  furnace douse-race a satisfying climax; is essence-greed tempting without being
  mandatory; is the collapse wall pressure-not-punishment. Tuning knobs all in
  `JH.TRUCKRUN` (scrollSpeed, hoseDps/Band, drain/regen, hazard density via the
  timeline windows, wall creep/recover, essence values).
- [ ] **Step 3:** On the user's word: release ritual (`release` skill) — **minor**
  bump, CHANGELOG entry, `release: v0.X.0 - {Patch Name}` merge title.

---

## Self-review notes

- **Spec coverage:** sub-mode wiring (T2/T8), Driver control + swath-as-aim (T2/T3),
  fixed loadout + light tank (T1/T3), hydrant refuel+wash (T5), fire-roster hazards
  + honest non-lethal HP (T4), collapse wall (T6), furnace climax + essence + clean
  bonus (T7), benediction beat + air handoff (T8), art (T9).
- **Testability:** all order-sensitive/number logic is pushed into
  `truckrun.balance.js` (pure, seeded-rng, dual-export) so it is unit-tested; the
  DOM-bound scene is verified headlessly per task, matching the input-buffer and
  fire-readability precedents.
- **Judgment calls:** truck HP starts **non-lethal** (spec Open-Q 2) — collisions
  cost speed→wall pressure, not death; escalation to lethal is a later one-liner.
  No charge/ram move (spec Open-Q 6) — beam + furnace cover the "big thing" beat.
  Air handoff stubs to `win()` (spec Open-Q 1) with a marked swap point.
- **Risk:** Task 9 art is the largest unknown (new chrome, procedural-first).
  Earlier tasks intentionally ship on placeholder shapes so the *feel* is
  playtestable before art time is spent.
