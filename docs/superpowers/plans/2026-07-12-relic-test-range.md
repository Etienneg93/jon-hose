# Relic Test Range Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every relic effect testable on demand in the dev TARGET RANGE — a 22-relic toggle rack plus staged scenario props — per `docs/superpowers/specs/2026-07-12-relic-test-range-design.md`.

**Architecture:** Everything lives in the existing dev-only range surfaces in `js/game.js`: `devGotoRange` (setup), `tickRangeStations` (interaction + per-frame prop logic), `drawRangeStations` (render), plus a sigil-card-style info card. The rack reuses the `rangeStations` list with a new `kind: "relic"`. Two small Game methods (`toggleRelic`, `procSuperEliteArrival`) are unit-tested; the rest is dev staging verified headlessly.

**Tech Stack:** Vanilla JS (IIFE + `JH` namespace), `node --test`, headless Edge via playwright-core (`headless-playtest` project skill).

## Global Constraints

- Branch `shop-relics-pass`. Suite baseline 276; must stay green after every task.
- **Dev-only:** no production-path behavior changes. `rangeStations` stays null in real runs; every new prop/station exists only when `devGotoRange` created it. `toggleRelic`/`procSuperEliteArrival` are plain Game methods but only the range (and `startWave`, for the proc) call them.
- **SPEC DEVIATION (approved rationale):** the spec's "respawning kill dummies" prop is replaced by a **mook spawner station** — `TargetDummy` is unkillable by design (entities.js `TargetDummy.takeDamage` floors hp at 1; `die()` is a no-op), so on-kill effects need real enemies. The spawner covers the same effects (GUSH farming, dowsing_rod drops, collection_plate, squeegee kills).
- Range-setup literals (coordinates, radii, spawn values) are dev staging, NOT gameplay tunables — they follow the file's existing precedent (`devGotoRange` hardcodes positions and `suds = 999`) and do not go in config.
- Comments: behavioral facts only.
- Working tree holds the user's unrelated uncommitted WIP: stage ONLY the files each task touches, never `git add -A` / `git add .` / bare `commit -am`. No commit trailers.
- Headless runs: install the telemetry endpoint spy BEFORE pressing Backquote (committed config posts real telemetry rows).

## Range layout after this plan (all y in depth units, DEPTH_MAX = 86; py = 43)

```
x:  140        180     230    270      390        460-500     520      560      600
    SUPER-EL   KIBBLE  GUSH   —        charge     pierce grp  MOOK     (mook +  FIREPATCH
    button     stn     stn    dummy@320 dummy     3 dummies   SPAWNER  patch    stn
                              (isolated)(cycles)  + hydrant   stn      land here)
x:  380/y70: slow puddle (SlowZone r 26, permanent)
x:  140-646 / y 58+80: benediction sigil rows (existing)
x:  700-1060 / y 58+80: RELIC RACK — 22 stations, 2 rows of 11, roster order
x:  1220 / y 43: dome pair (permanent DeployedShield + dummy inside, dummy outside)
```

---

### Task 1: Relic rack — toggleRelic + stations + draw + info card

**Files:**
- Modify: `js/game.js` — `devGotoRange` (rack stations), `tickRangeStations` (relic kind), `drawRangeStations` (relic draw), new `toggleRelic` method near `devGotoRange`, new `drawRelicRackCard` beside `drawSigilCard` (~2822) + its call site (~2373)
- Test: `tests/entities.test.js`

**Interfaces:**
- Consumes: `JH.RELICS[i].{id,tier,name,desc}`, `Assets.gearFrame(ctx,x,y,scale,tier,t)`, `Assets.icon(ctx,id,x,y,scale)`, `JH.Upgrades.computeStats(owned)`, `player.applyStats(s)` — all existing.
- Produces: `Game.toggleRelic(id)` → boolean (true = now owned). Rack stations are `{ kind: "relic", relic: id, x, y, near }` entries in `this.rangeStations`.

- [ ] **Step 1: Write the failing tests** — in `tests/entities.test.js`, next to the existing relic-gate tests (follow the file's `JH.Game` global idiom used by the fire_marshal test):

```js
test("toggleRelic: grant folds apply() stats in, revoke folds out + clamps hp + clears relic state", () => {
  const stats = [];
  const g = {
    relics: {}, rosaryBonus: 7,
    player: {
      hp: 120, stats: { maxHp: 100 },
      boilerTarget: {}, boilerHeat: 1.5, boilerGapT: 0.1,
      applyStats(s) { this.stats = s; stats.push(s); },
    },
  };
  const toggle = (id) => JH.Game.toggleRelic.call(g, id);
  const realGame = JH.Game;
  JH.Game = g;                                  // computeStats reads JH.Game.relics (known idiom)
  try {
    assert.strictEqual(toggle("rubber_boots"), true);
    assert.strictEqual(g.relics.rubber_boots, true);
    assert.strictEqual(g.player.stats.maxHp, JH.PLAYER.maxHp + JH.RELIC_TUNE.bootsHp);
    g.player.hp = g.player.stats.maxHp;         // full hp with boots on
    assert.strictEqual(toggle("rubber_boots"), false);
    assert.ok(!g.relics.rubber_boots);
    assert.strictEqual(g.player.stats.maxHp, JH.PLAYER.maxHp);
    assert.ok(g.player.hp <= g.player.stats.maxHp, "hp clamped after boots revoke");
    // relic-state cleanup on revoke
    g.relics.rosary_chain = true; g.rosaryBonus = 7;
    toggle("rosary_chain");                     // revoke
    assert.strictEqual(g.rosaryBonus, 0);
    g.relics.boiler_coil = true; g.player.boilerHeat = 2;
    toggle("boiler_coil");                      // revoke
    assert.strictEqual(g.player.boilerTarget, null);
    assert.strictEqual(g.player.boilerHeat, 0);
  } finally { JH.Game = realGame; }
});
```

(Adjust the stub to whatever `applyStats`/`computeStats` actually require — read both first. If `computeStats` needs `JH.Upgrades.owned`, pass `{}` the way `Sigil.pick` does: `JH.Upgrades.computeStats(JH.Upgrades.owned)`.)

- [ ] **Step 2: Run to verify failure** — `node --test --test-name-pattern="toggleRelic" tests/entities.test.js` → FAIL (`toggleRelic` is not a function).

- [ ] **Step 3: Implement `toggleRelic` in js/game.js** (place next to `devGotoRange`; it is range tooling):

```js
// Dev range: toggle a relic on/off and re-fold stats (apply() relics need
// computeStats to run both ways). Revoking also clears the relic's live
// state so an A/B toggle can't leave stale bonuses behind.
toggleRelic(id) {
  const owned = !!this.relics[id];
  if (owned) delete this.relics[id];
  else this.relics[id] = true;
  const p = this.player;
  p.applyStats(JH.Upgrades.computeStats(JH.Upgrades.owned));
  if (p.hp > p.stats.maxHp) p.hp = p.stats.maxHp;
  if (!this.relics.rosary_chain) this.rosaryBonus = 0;
  if (!this.relics.boiler_coil) { p.boilerTarget = null; p.boilerHeat = 0; p.boilerGapT = 0; }
  return !owned;
},
```

- [ ] **Step 4: Rack stations in `devGotoRange`** — after the benediction sigil block (which ends setting `beneMaxX`):

```js
// Relic rack: one toggle station per relic, roster order (common → rare →
// relic-grade reads left to right), two rows right of the sigil rows.
const rackX0 = 700, rackDX = 36, rackRowY = [58, 80];
let rackMaxX = 0;
JH.RELICS.forEach((r, i) => {
  const rx = rackX0 + (i % 11) * rackDX;
  this.rangeStations.push({ kind: "relic", relic: r.id, x: rx, y: rackRowY[i < 11 ? 0 : 1], near: false });
  rackMaxX = Math.max(rackMaxX, rx);
});
this.bounds.maxX = Math.max(this.bounds.maxX, rackMaxX + 80);
```

- [ ] **Step 5: Interaction in `tickRangeStations`** — add a branch to the existing E-handler chain:

```js
} else if (st.kind === "relic") {
  const on = this.toggleRelic(st.relic);
  this.audio.play(on ? "buy" : "hurt", { pitch: on ? 1 : 0.8 });
  const rd = JH.RELICS.find((r) => r.id === st.relic);
  if (this.float) this.float(st.x, st.y - 30, (on ? "+ " : "− ") + rd.name.toUpperCase(), on ? "#80ff80" : "#8fa8c8");
}
```

- [ ] **Step 6: Draw in `drawRangeStations`** — in the per-station loop, relic stations replace the pedestal block (icon in tier frame instead of pedestal; keep the near-"E" bob):

```js
if (st.kind === "relic") {
  const rd = JH.RELICS.find((r) => r.id === st.relic);
  const owned = !!this.relics[st.relic];
  ctx.globalAlpha = owned ? 1 : 0.5;
  JH.Assets.gearFrame(ctx, sx, sy - 12, 1, rd && rd.tier, this.player ? this.player.t : 0);
  JH.Assets.icon(ctx, st.relic, sx, sy - 12, 1);
  ctx.globalAlpha = 1;
  if (owned) { ctx.fillStyle = "#80ff80"; ctx.fillRect(sx + 7, sy - 20, 2, 2); }
} else {
  // ...existing pedestal + kind label drawing, unchanged...
}
```

(The near-"E" prompt block at the bottom of the loop applies to all kinds — leave it shared.)

- [ ] **Step 7: Info card** — new `drawRelicRackCard(ctx)` modeled line-for-line on `drawSigilCard` (~2822: nearest within 30, 300×34 box, name left / tag right / desc wrapped). Differences: iterate `this.rangeStations` filtering `kind === "relic"`; title `rd.name + (owned ? "  [ON]" : "")`; right tag = `rd.tier.toUpperCase()` colored `#8fa8c8` common / `#c9924a` rare / `#ffd23f` relic; bottom-right prompt `"E: TOGGLE RELIC"`; and for the three range-gap relics append to the desc line:

```js
const RANGE_GAP = { alarm_bell: 1, sunday_suit: 1, censer: 1 };  // effects that only fire in real runs
const desc = rd.desc + (RANGE_GAP[rd.id] ? "  (needs real run)" : "");
```

Call it right after the `drawSigilCard` call site (~2373), gated so only one card shows: `if (this.rangeMode) this.drawRelicRackCard(ctx);` and inside it, return early if a sigil is nearer than the nearest rack station (compare the two distances, sigil wins ties).

- [ ] **Step 8: Run the new test → PASS, then full suite** — `npm test` → 277 (276 + 1). Fix fallout.
- [ ] **Step 9: Headless smoke** — enter range (dev menu → TARGET RANGE), walk to the rack, toggle one relic of each tier, read `JH.Game.relics` + `player.stats` deltas via eval; screenshot the rack + card. LOOK at the screenshot: frames/icons/card legible, [ON] state reads.
- [ ] **Step 10: Commit** — `git add js/game.js tests/entities.test.js && git commit -m "feat(dev): relic rack in target range — 22 toggle stations with tier frames, stat refold + state cleanup on revoke"`

---

### Task 2: Scenario props — fire patch, slow puddle, dome pair, super-elite button, mook spawner

**Files:**
- Modify: `js/game.js` — `devGotoRange` (props + stations), `tickRangeStations` (new kinds), `drawRangeStations` (labels), `startWave` (~596, extract proc), new `procSuperEliteArrival` method
- Test: `tests/entities.test.js`

**Interfaces:**
- Consumes: `JH.spawnFirePatch(game, x, y, radius, dur, opts)` (entities.js ~2341, returns null if overlapping a live patch), `new JH.SlowZone(x, y, r, dur, opts)` (dur-based lifetime), `new JH.DeployedShield(x, y, owner)` (domeT counts down from `ENEMIES.bulwark.domeDur`), `JH.Balance.prayerBeadProc(pl, tune)`, `this.spawnEnemy(type, x, y, opts)`.
- Produces: `Game.procSuperEliteArrival()` — the prayer-bead arrival grant + floater, shared by `startWave` and the button station.

- [ ] **Step 1: Write the failing test** for the extracted proc:

```js
test("procSuperEliteArrival: grants pressure buff + floater only with prayer_bead and a live player", () => {
  const floats = [];
  const g = { relics: { prayer_bead: true },
              player: { alive: true, x: 0, y: 0, pressureBuffT: 0 },
              float(x, y, txt) { floats.push(txt); } };
  JH.Game.procSuperEliteArrival.call(g);
  assert.strictEqual(g.player.pressureBuffT, JH.RELIC_TUNE.prayerBeadDur);
  assert.strictEqual(floats.length, 1);
  const g2 = { relics: {}, player: { alive: true, pressureBuffT: 0 }, float() { floats.push("x"); } };
  JH.Game.procSuperEliteArrival.call(g2);
  assert.strictEqual(g2.player.pressureBuffT, 0);
  assert.strictEqual(floats.length, 1);
});
```

- [ ] **Step 2: Run to verify failure** — `node --test --test-name-pattern="procSuperEliteArrival" tests/entities.test.js` → FAIL.

- [ ] **Step 3: Extract the proc** — in js/game.js add:

```js
// Prayer Bead: a super-elite's arrival grants the pressure buff. Real path
// runs from startWave; the range's SUPER-ELITE button fires the same code.
procSuperEliteArrival() {
  if (this.relics && this.relics.prayer_bead && this.player && this.player.alive) {
    JH.Balance.prayerBeadProc(this.player, JH.RELIC_TUNE);
    this.float(this.player.x, this.player.y - 40, "PRESSURE", "#ffd23f");
  }
},
```

and replace the identical inline block in `startWave` (~596-600) with `this.procSuperEliteArrival();` (behavior-preserving — the guard moves into the helper).

- [ ] **Step 4: Props in `devGotoRange`** — after the existing dummy/hydrant setup:

```js
// Scenario props (relic testing) --------------------------------------
// Slow puddle: permanent player-slow zone (rubber_boots immunity test).
this.slowZones.push(new JH.SlowZone(380, 70, 26, 1e9));
// Dome pair: permanent dome, one dummy sheltered + one outside
// (deputy_sprinkler shelter check, lance blocker feel).
const dome = new JH.DeployedShield(1220, py, null);
dome.domeDur = dome.domeT = 1e9;
this.shields.push(dome);
this.spawnEnemy("dummy", 1220, py);                       // sheltered
this.spawnEnemy("dummy", 1220 + dome.radius + 26, py);    // outside
this.bounds.maxX = Math.max(this.bounds.maxX, 1220 + dome.radius + 110);
// Generous drop budget so spawner-mook kills pay out (dowsing_rod / plate).
this.dropBudget = { suds: 999, items: 99 };
// Stations: super-elite proc button, mook spawner, fire patch spawner.
this.rangeStations.push(
  { kind: "superelite", x: 140, y: py, near: false },
  { kind: "mook",       x: 520, y: py, near: false },
  { kind: "firepatch",  x: 600, y: py, near: false },
);
```

(Verify the shields array name by reading how DeployedShield instances are stored/updated in game.js — `this.shields` per doSpray's blocker scan; if the real name differs, follow the real one. Same for `dropBudget` — mirror `devGotoWallBoss` ~309.)

- [ ] **Step 5: Station kinds in `tickRangeStations`** — extend the E-handler chain:

```js
} else if (st.kind === "superelite") {
  this.procSuperEliteArrival();
  this.audio.play("buy");
} else if (st.kind === "mook") {
  // Real killable enemy: on-kill relics (squeegee/rosary/plate/dowsing) need
  // actual deaths — TargetDummy is unkillable by design.
  const m = this.spawnEnemy("mook", 560, st.y);
  m.spawnGrace = 0.5;
  this.audio.play("buy");
} else if (st.kind === "firepatch") {
  // Lands where spawner mooks stand, so a kill-on-patch is easy to stage.
  JH.spawnFirePatch(this, 560, st.y, 16, 3);
  this.audio.play("sizzle");
}
```

- [ ] **Step 6: Labels in `drawRangeStations`** — the pedestal branch currently labels only kibble/gush; make the label a lookup:

```js
const RANGE_LABELS = { kibble: "KIBBLE", gush: "GUSH", superelite: "SUPER-ELITE", mook: "SPAWN MOOK", firepatch: "FIRE PATCH" };
```

and use `RANGE_LABELS[st.kind] || st.kind.toUpperCase()` in the existing `fillText`. Pick distinct pedestal glyph colors: superelite `#ff5a5a`, mook `#cc5c18`, firepatch `#ff9040` (rect same size as kibble's).

- [ ] **Step 7: Full suite** — `npm test` → 278 (277 + 1). The startWave extraction must not break any wave test.
- [ ] **Step 8: Headless verify** — in the range: press each new station via eval-driven walk + E (hold ~120ms); assert `firePatches.length` grows, a mook spawns and dies to spray, pressure buff appears with prayer_bead toggled on (rack from Task 1) and NOT without; stand in the puddle with/without boots and compare effective speed; toggle deputy_sprinkler and confirm the sheltered dummy's hp holds while the outside dummy's drains. Screenshot the prop area.
- [ ] **Step 9: Commit** — `git add js/game.js tests/entities.test.js && git commit -m "feat(dev): range scenario props — fire patch/mook/super-elite stations, permanent puddle + dome pair, shared arrival proc"`

---

### Task 3: Charge dummy + full-range headless sweep

**Files:**
- Modify: `js/game.js` — `devGotoRange` (charge dummy), `tickRangeStations` (cycle logic), `drawRangeStations` (label)
- Test: headless verification (no new unit test — per-frame dev staging)

**Interfaces:**
- Consumes: dummies are `TargetDummy` (entities.js ~4493) whose `update` never writes `state`, so an external per-frame write sticks for that frame; dog_leash reads `e.state === "charge"` in doSpray's apply pass.
- Produces: nothing further.

- [ ] **Step 1: Charge dummy in `devGotoRange`** — beside the isolated dummy:

```js
// Charge-cycling dummy: state flips to "charge" 1.2s of every 4s so the
// Dog Leash bonus window is visible on demand (no real charger AI).
const cd = this.spawnEnemy("dummy", 390, py);
cd.rangeChargeCycle = true;
```

- [ ] **Step 2: Cycle + label** — at the top of `tickRangeStations` (after the null guard):

```js
for (const e of this.enemies) {
  if (!e.rangeChargeCycle || e.dead) continue;
  e.state = (e.t % 4) < 1.2 ? "charge" : "idle";
}
```

In `drawRangeStations`' gallery-label loop, also label cycle dummies: extend the filter to `if (!e.isGallery && !e.rangeChargeCycle) continue;` and draw `e.rangeChargeCycle ? (e.state === "charge" ? "CHARGING!" : "CHARGE DUMMY") : e.type.toUpperCase()`; color the CHARGING! state `#ff5a5a`.

- [ ] **Step 3: Full suite** — `npm test` → stays 278.
- [ ] **Step 4: Full-range headless sweep (the plan's exit gate)** — one scripted session: enter range → toggle a relic of each tier on the rack (stats delta assert) → leash check (spray the charge dummy in both phases, hp-loss ratio ≈ `(sprayDamage + leashLungeBonus)/sprayDamage` during CHARGING!) → patch + mook + kill-on-patch with squeegee on (patch douses) → GUSH farm 2 milestones off spawner mooks with valve+spigot on (2 rings) → sprinkler dome check → super-elite button with bead on (buff) → puddle with/without boots. Assert each via eval reads; 0 pageerrors. Capture 3 screenshots (rack, prop row, dome pair) and LOOK at them.
- [ ] **Step 5: Commit** — `git add js/game.js && git commit -m "feat(dev): charge-cycling dummy + range sweep — every relic effect stageable in the target range"`

---

## Self-review notes (already applied)

- Spec's "respawning dummies" → mook spawner station: TargetDummy is unkillable (die() no-op) — flagged as a spec deviation in Global Constraints; the user approved the spec's intent (farmable kills), not the mechanism.
- Spec's "rack below the sigil rows" → rack RIGHT of the sigil rows at the same two depths (58/80): DEPTH_MAX is 86, there is no room below 80.
- `toggleRelic` deliberately does NOT touch wheel stock / suds (spec: wallet-free) and is safe outside the range (plain relics-dict toggle) though nothing outside calls it.
- The three RANGE_GAP relics stay toggleable on the rack (their passive listing in the panel is itself testable); only their card line marks the gap.
