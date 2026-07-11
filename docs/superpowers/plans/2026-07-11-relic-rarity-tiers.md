# Relic Rarity Tiers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the relic roster into three rarity tiers (common/rare/relic-grade) with tiered wheel rolls, trim Hydro Lance's pierce with a falloff ladder, and add 9 new items — per `docs/superpowers/specs/2026-07-11-relic-rarity-tiers-design.md`.

**Architecture:** All tunables land in `js/config.js` (`JH.RELICS` gains `tier`, new numbers join `JH.RELIC_TUNE`, wheel odds in `JH.SHOP.relicGradeOdds`). Pure roll logic lives in `js/balance.js` (dual-export, unit-testable). Item effects hook the existing sites: `Player.doSpray` (entities.js), `Game.onEnemyKilled` / super-elite spawn (game.js), `SlowZone`/`FirePatch`/burn ticks (entities.js). Visual tier grades extend `Assets.gearFrame`; icons bake via `tools/icon-sprites.mjs`.

**Tech Stack:** Vanilla JS (no modules in js/ — IIFE + `JH` namespace), `node --test` suite, headless Edge via playwright-core for visual verification (`headless-playtest` project skill).

## Global Constraints

- Branch: `shop-relics-pass`. Commit per task; the release gate is the user's playtest, not the commit.
- **Flat-gear rule:** relic effects are flat adders / flag mechanics only. Percent multipliers belong to benedictions. (Lance falloff multiplies *its own* pierce output down, which is legal — it's a trim, not a buff.)
- **Rim is hitbox:** any new damaging zone (GUSH pulse rings, boiler splash) hits exactly the shape it draws — one shared shape for draw + hit test.
- **No jump, no melee.** Never introduce either.
- **Config is the single source of truth:** no gameplay literals in game/entities code; everything reads `JH.RELIC_TUNE` / `JH.SHOP` / def fields. Tests derive expected values from config, never repeat literals.
- Tests: `npm test` must stay green after every task (254 pass today; count grows).
- Comments carry behavioral facts only (units, conventions, gotchas) — no design narrative.
- Icon PNGs are generated files: bake with the tool, commit the PNGs, never hand-edit.
- HARD: never run bakers over `sprites/mook/*` or `sprites/fuse/walk*` (irrelevant here, but absolute).

---

### Task 1: Config — tiers, prices, new defs, tunables

**Files:**
- Modify: `js/config.js` (RELICS block ~384-413, ICONS.keys ~112-125, SHOP block near `JH.SHOP`)
- Test: `tests/relics.test.js`

**Interfaces:**
- Produces: `JH.RELICS[i].tier` ∈ `"common" | "rare" | "relic"`; `JH.RELICS[i].minAct` (number, replaces boolean `actGate`); `JH.SHOP.relicGradeOdds = [0, 0.25, 0.5, 0.75]`; `JH.RELIC_TUNE` keys listed below. Ids of the 9 new relics: `rubber_boots, asbestos_socks, squeegee, rosary_chain, backdraft_valve, dog_leash, deputy_sprinkler, big_spigot, boiler_coil`.

- [ ] **Step 1: Write the failing tests** — replace the literal-pinned costs in `tests/relics.test.js` ("RELICS: ex-signatures..." test) and add tier-shape tests:

```js
test("RELICS: every relic has a tier and a price inside its band", () => {
  const bands = { common: [60, 100], rare: [250, 350], relic: [500, Infinity] };
  assert.strictEqual(JH.RELICS.length, 22);
  for (const r of JH.RELICS) {
    const b = bands[r.tier];
    assert.ok(b, r.id + " has a known tier");
    assert.ok(r.cost >= b[0] && r.cost <= b[1], r.id + " cost " + r.cost + " in " + r.tier + " band");
  }
  const count = (t) => JH.RELICS.filter((r) => r.tier === t).length;
  assert.strictEqual(count("common"), 8);
  assert.strictEqual(count("rare"), 10);
  assert.strictEqual(count("relic"), 4);
});

test("RELIC_TUNE: rarity-pass tunables exist", () => {
  const T = JH.RELIC_TUNE;
  assert.deepStrictEqual(T.lanceFalloff, [1, 0.7, 0.5, 0.35, 0.25]);
  for (const k of ["socksBurnDpsCut", "socksBurnDpsFloor", "socksGraceBonus", "leashLungeBonus",
                   "rosaryPerKill", "rosaryCap", "pulseRadius", "valveKnockback", "spigotDamage",
                   "sprinklerRange", "sprinklerDps", "boilerHeatTime", "boilerBonus",
                   "boilerSplash", "boilerSplashR", "boilerGap", "bootsHp"])
    assert.strictEqual(typeof T[k], "number", k);
});

test("SHOP.relicGradeOdds is act-indexed 0..3", () => {
  assert.deepStrictEqual(JH.SHOP.relicGradeOdds, [0, 0.25, 0.5, 0.75]);
});

test("minAct gates: lance from act 2 (>=0), boiler one act later (>=1)", () => {
  const byId = (id) => JH.RELICS.find((r) => r.id === id);
  assert.strictEqual(byId("hydro_lance").minAct, 0);
  assert.strictEqual(byId("boiler_coil").minAct, 1);
});
```

Also update the existing "ex-signatures" test: replace `assert.strictEqual(dash.cost, 200)` etc. with band membership (`dash.tier === "rare"`), and `assert.ok(lance.actGate)` with `assert.strictEqual(lance.minAct, 0)`.

- [ ] **Step 2: Run to verify failure** — `npm test -- --test-name-pattern="RELICS"` → FAIL (no `tier` fields, 13 relics).

- [ ] **Step 3: Implement in `js/config.js`** — rewrite the `JH.RELICS` array with `tier` + new prices, migrate `actGate: true` → `minAct: 0`, and append the 9 new defs:

```js
JH.RELICS = [
  // -- common (steel frame, 60-100): one honest felt effect --------------
  { id: "dowsing_rod",   tier: "common", name: "Dowsing Rod",    cost: 80,  desc: "Pickups magnet from farther away; water cans +50% value" },
  { id: "alarm_bell",    tier: "common", name: "Alarm Bell",     cost: 80,  desc: "Non-elite wave clears also roll the bonus item drop" },
  { id: "spigot_key",    tier: "common", name: "Spigot Key",     cost: 90,  desc: "A hydrant refill also restores 15 HP/s while filling" },
  { id: "brass_nozzle",  tier: "common", name: "Brass Nozzle",   cost: 90,  desc: "+10 spray dmg to the first enemy the stream hits" },
  { id: "loaded_sponge", tier: "common", name: "Loaded Sponge",  cost: 100, desc: "GUSH refund doubled and regen windows +2s" },
  { id: "rubber_boots",  tier: "common", name: "Rubber Boots",   cost: 90,
    desc: "+20 max HP; slow zones and puddles don't slow you",
    apply: (s) => { s.maxHp += JH.RELIC_TUNE.bootsHp; } },
  { id: "asbestos_socks",tier: "common", name: "Asbestos Socks", cost: 80,  desc: "Burn ticks hurt less; burn i-frames last +1s" },
  { id: "squeegee",      tier: "common", name: "Squeegee",       cost: 80,  desc: "An enemy killed on a fire patch douses the patch" },
  // -- rare (brass frame, 250-350): a combat-moment mechanic -------------
  { id: "punch_card",    tier: "rare", name: "Punch Card",       cost: 250, desc: "All shop prices are 20% cheaper" },
  { id: "censer",        tier: "rare", name: "Censer",           cost: 270, desc: "Sigil offers include an extra choice" },
  { id: "dog_leash",     tier: "rare", name: "Dog Leash",        cost: 270, desc: "+15 spray dmg to charging or lunging enemies" },
  { id: "hydro_dash",    tier: "rare", name: "Hydro-Dash",       cost: 270,
    desc: "-0.2s dash cooldown; dash boosts speed +28 for 3s",
    apply: (s) => { s.dashCd = Math.max(0.2, s.dashCd - 0.2); s.dashBoost = 28; s.dashBoostDur = 3; } },
  { id: "sunday_suit",   tier: "rare", name: "Sunday Suit",      cost: 300, desc: "Bosses drop a second Holy Essence cross" },
  { id: "fire_marshal",  tier: "rare", name: "Fire-Marshal Spec", cost: 300,
    desc: "+30 range, +30 knockback",
    apply: (s) => { s.sprayRange += 30; s.knockback += 30; } },
  { id: "prayer_bead",   tier: "rare", name: "Prayer Bead",      cost: 300, desc: "Boss enrages AND super-elite arrivals grant an 8s pressure buff" },
  { id: "collection_plate", tier: "rare", name: "Collection Plate", cost: 320, desc: "+2 bonus suds per kill" },
  { id: "rosary_chain",  tier: "rare", name: "Rosary Chain",     cost: 320, desc: "Each GUSH combo kill: +1 spray dmg (max +10) until the chain breaks" },
  { id: "backdraft_valve", tier: "rare", name: "Backdraft Valve", cost: 320, desc: "GUSH milestones blast a knockback ring that douses fires" },
  // -- relic-grade (gold frame, 500+, minAct-gated build-arounds) --------
  { id: "deputy_sprinkler", tier: "relic", name: "Deputy Sprinkler", cost: 500, minAct: 0,
    desc: "A tank-mounted sprinkler auto-sprays the nearest enemy" },
  { id: "hydro_lance",   tier: "relic", name: "Hydro Lance",     cost: 520, minAct: 0,
    desc: "+18 dmg; a cutting beam that pierces the line, fading down it",
    apply: (s) => { s.sprayDamage += 18; s.beam = 3; s.knockback += 20; } },
  { id: "big_spigot",    tier: "relic", name: "The Big Spigot",  cost: 540, minAct: 0,
    desc: "GUSH milestones detonate a 360° water blast around Jon" },
  { id: "boiler_coil",   tier: "relic", name: "Boiler Coil",     cost: 560, minAct: 1,
    desc: "2s of focused spray superheats: +30 dmg and splash to neighbors" },
];
```

Extend `JH.RELIC_TUNE` (keep the 5 existing keys):

```js
JH.RELIC_TUNE = {
  brassNozzleAdd: 10, spigotHealRate: 15, prayerBeadDur: 8,
  spongeWindowBonus: 2, prayerBeadMult: 1.5,
  lanceFalloff: [1, 0.7, 0.5, 0.35, 0.25], // pierce dmg mult by hit order; last entry repeats
  bootsHp: 20,
  socksBurnDpsCut: 2,       // subtracted from FIRE.burnDpsPerStack
  socksBurnDpsFloor: 1,     // per-stack dps never below this
  socksGraceBonus: 1,       // s added to burn i-frames
  leashLungeBonus: 15,      // flat dmg vs charging/lunging enemies
  rosaryPerKill: 1, rosaryCap: 10,
  pulseRadius: 70,          // GUSH pulse ring radius (world px)
  valveKnockback: 40, spigotDamage: 30,
  sprinklerRange: 80, sprinklerDps: 8,
  boilerHeatTime: 2,        // s of same-target spray to superheat
  boilerBonus: 30,          // flat dps added on the heated target
  boilerSplash: 12, boilerSplashR: 24,
  boilerGap: 0.3,           // s of no-spray that resets the heat
};
```

Add to the `JH.SHOP` object: `relicGradeOdds: [0, 0.25, 0.5, 0.75],  // slot-3 upgrade chance by actLevel+1`.
Append to `JH.ICONS.keys`: `"rubber_boots", "asbestos_socks", "squeegee", "rosary_chain", "backdraft_valve", "dog_leash", "deputy_sprinkler", "big_spigot", "boiler_coil"` (icons bake in Task 11; `Assets.icon` returns false and call sites fall back until then).

- [ ] **Step 4: Fix every `actGate` reference** — `grep -rn actGate js/ tests/` and migrate each to `minAct` semantics (`r.minAct == null || actLevel >= r.minAct`). Known site: `js/balance.js:51` (`relicPoolIds`); Task 2 rewrites it, so here just make it `minAct`-aware verbatim: `.filter((r) => r.minAct == null || actLevel >= r.minAct)`.

- [ ] **Step 5: Run the full suite** — `npm test` → all pass (fix any other literal price pins the run exposes by deriving from `JH.RELICS.find(...).cost`).

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(config): relic rarity tiers — 22-item roster, tier prices, minAct gates, rarity tunables"`

---

### Task 2: Balance — tiered wheel roll

**Files:**
- Modify: `js/balance.js` (`relicPoolIds` ~50, add `rollWheelStock` beside `pickRelics` ~135)
- Modify: `js/game.js:1005-1014` (`spawnVendor`)
- Test: `tests/relics.test.js`

**Interfaces:**
- Consumes: `JH.RELICS[i].tier/minAct`, `JH.SHOP.relicGradeOdds` (Task 1).
- Produces: `Balance.relicPoolIds(relicDefs, actLevel, tier)` — tier param optional (omitted = all, back-compat); `Balance.rollWheelStock(relicDefs, ownedMap, actLevel, rng)` → array of exactly 3 ids/nulls `[commonSlot, rareSlot, jackpotSlot]`, no duplicates. `pickRelics` stays exported unchanged.

- [ ] **Step 1: Write the failing tests**

```js
test("relicPoolIds: optional tier filter + minAct gating", () => {
  const ids = (act, tier) => JH.Balance.relicPoolIds(JH.RELICS, act, tier);
  assert.ok(ids(-1, "relic").length === 0, "no relic-grade before act 2");
  assert.ok(ids(0, "relic").includes("hydro_lance"));
  assert.ok(!ids(0, "relic").includes("boiler_coil"), "boiler gated one act later");
  assert.ok(ids(1, "relic").includes("boiler_coil"));
  assert.strictEqual(ids(3, "common").length, 8);
});

test("rollWheelStock: slot tiers, upgrade odds, no dupes", () => {
  const tierOf = (id) => id && JH.RELICS.find((r) => r.id === id).tier;
  // rng -> 0.99: slot-3 upgrade never procs => [common, rare, rare]
  let s = JH.Balance.rollWheelStock(JH.RELICS, {}, 3, () => 0.99);
  assert.strictEqual(tierOf(s[0]), "common");
  assert.strictEqual(tierOf(s[1]), "rare");
  assert.strictEqual(tierOf(s[2]), "rare");
  assert.strictEqual(new Set(s.filter(Boolean)).size, s.filter(Boolean).length);
  // rng -> 0: upgrade always procs at act 3 => slot 3 is relic-grade
  s = JH.Balance.rollWheelStock(JH.RELICS, {}, 3, () => 0);
  assert.strictEqual(tierOf(s[2]), "relic");
  // act -1: odds[0] = 0, so even rng 0 stays rare AND no relic-grade exists anyway
  s = JH.Balance.rollWheelStock(JH.RELICS, {}, -1, () => 0);
  assert.notStrictEqual(tierOf(s[2]), "relic");
});

test("rollWheelStock: exhaustion falls back across tiers, then null", () => {
  const own = (tiers) => { const o = {}; JH.RELICS.forEach((r) => { if (tiers.includes(r.tier)) o[r.id] = true; }); return o; };
  // all commons owned -> slot 1 falls back to a rare
  let s = JH.Balance.rollWheelStock(JH.RELICS, own(["common"]), 3, () => 0.99);
  assert.strictEqual(JH.RELICS.find((r) => r.id === s[0]).tier, "rare");
  // everything owned -> all null
  s = JH.Balance.rollWheelStock(JH.RELICS, own(["common", "rare", "relic"]), 3, () => 0.5);
  assert.deepStrictEqual(s, [null, null, null]);
});
```

- [ ] **Step 2: Run to verify failure** — `npm test -- --test-name-pattern="rollWheelStock"` → FAIL (`rollWheelStock` undefined).

- [ ] **Step 3: Implement in `js/balance.js`** — extend `relicPoolIds` and add the roller:

```js
// Vendor relic pool: minAct-gated by actLevel; optional tier filter.
// Pure — takes the relic defs array, doesn't read JH.RELICS itself.
relicPoolIds(relicDefs, actLevel, tier) {
  return (relicDefs || [])
    .filter((r) => (r.minAct == null || actLevel >= r.minAct) && (!tier || r.tier === tier))
    .map((r) => r.id);
},

// Tiered 3-slot wheel roll: slot 1 common, slot 2 rare, slot 3 rare that
// upgrades to relic-grade with act-indexed odds (JH.SHOP.relicGradeOdds).
// Exhausted tiers fall back down the chain; fully-exhausted slots are null.
// Never rolls duplicates. Pure aside from the injected rng.
rollWheelStock(relicDefs, ownedMap, actLevel, rng) {
  const owned = ownedMap || {}, r = rng || Math.random;
  const pools = {};
  for (const t of ["common", "rare", "relic"])
    pools[t] = this.relicPoolIds(relicDefs, actLevel, t).filter((id) => !owned[id]);
  const draw = (chain) => {
    for (const t of chain) {
      const p = pools[t];
      if (p.length) return p.splice(Math.floor(r() * p.length), 1)[0];
    }
    return null;
  };
  const oddsArr = (JH.SHOP && JH.SHOP.relicGradeOdds) || [0, 0, 0, 0];
  const odds = oddsArr[Math.max(0, Math.min(3, actLevel + 1))] || 0;
  const slot3Chain = (pools.relic.length && r() < odds)
    ? ["relic", "rare", "common"] : ["rare", "common", "relic"];
  const s1 = draw(["common", "rare", "relic"]);
  const s2 = draw(["rare", "common", "relic"]);
  const s3 = draw(slot3Chain);
  return [s1, s2, s3];
},
```

Note the gate order: the upgrade proc rolls only when the relic pool is non-empty, so a thin/gated pool never eats the proc (spec requirement).

- [ ] **Step 4: Wire `spawnVendor` (`js/game.js:1005-1014`)** — replace the two roll lines:

```js
this.relicStock = JH.Balance.rollWheelStock(JH.RELICS, this.relics, JH.Upgrades.currentActLevel, Math.random);
```

(delete the separate `relicPoolIds` + `pickRelics` lines; `wheelStock = this.relicStock.slice(0, 3)` stays).

- [ ] **Step 5: Run the full suite** — `npm test` → all pass.
- [ ] **Step 6: Headless smoke** — with the headless-playtest boilerplate, eval `JH.Game.spawnVendor(JH.Game.player.x + 30)` then read `JH.Game.wheelStock` and assert 3 entries with tiers common/rare/(rare|relic) via `JH.RELICS`. Screenshot the open shop.
- [ ] **Step 7: Commit** — `git commit -am "feat(balance): tiered wheel roll — per-slot pools, act-indexed relic-grade odds, exhaustion fallback"`

---

### Task 3: Hydro Lance pierce falloff

**Files:**
- Modify: `js/entities.js` doSpray damage loop (~757-812)
- Test: `tests/relics.test.js` (or `tests/entities.test.js` if the game stub lives there — follow `makeThinkGame`)

**Interfaces:**
- Consumes: `JH.RELIC_TUNE.lanceFalloff` (Task 1).
- Produces: pierce targets sorted nearest-first; each later hit multiplied by the ladder (last entry repeats). Also produces `targets` array + `primary` (nearest hit enemy) local structure that Task 9 (Boiler) reuses — keep the variable names `targets` and `primary`.

- [ ] **Step 1: Write the failing test** — three enemies in a line, pierce on, damage ratios must follow the ladder. Use the existing entities-test game stub pattern (`global.window = globalThis`, `makeThinkGame`-style fake game with `enemies`, `particles`, `shields: []`, `audio: {play(){}}`). Spray for one fixed dt and compare `hp` losses:

```js
test("lance falloff: pierce damage fades down the line per RELIC_TUNE.lanceFalloff", () => {
  const g = makeSprayGame();            // stub with player beam=3 facing right
  const [a, b, c] = placeEnemiesInLine(g, [30, 60, 90]);  // fwd order a,b,c
  sprayOnce(g, 0.1);
  const L = JH.RELIC_TUNE.lanceFalloff;
  const lossA = a.maxHp - a.hp, lossB = b.maxHp - b.hp, lossC = c.maxHp - c.hp;
  assert.ok(Math.abs(lossB / lossA - L[1]) < 0.01);
  assert.ok(Math.abs(lossC / lossA - L[2]) < 0.01);
});
```

(Write `makeSprayGame`/`placeEnemiesInLine`/`sprayOnce` helpers in the test file following the stub idioms already in `tests/entities.test.js` — fake enemies need `def: { waterMult: 1 }`, `takeDamage(d) { this.hp -= d; }`, `applyKnockback(){}`, `bodyW`, and positions the `Geo.inHitArc` check accepts.)

- [ ] **Step 2: Run to verify failure** — losses currently equal (no falloff) → FAIL.

- [ ] **Step 3: Implement** — restructure the damage loop in `doSpray`: gather-then-apply. The current `for (const e of game.enemies)` with early `continue`s becomes a filter pass building `targets` (each entry `{ e, fwd }`), then:

```js
if (pierce) targets.sort((p, q) => p.fwd - q.fwd);
const LF = JH.RELIC_TUNE.lanceFalloff;
targets.forEach(({ e }, idx) => {
  const falloff = pierce ? LF[Math.min(idx, LF.length - 1)] : 1;
  // ...existing per-enemy body, with the damage line becoming:
  const dmg = flatDmg * falloff * dmgScale * mult * pressureMult * beneMult * ssMult * dt;
  // ...rest of the body unchanged (scald, knockback, particles, vampiric)...
});
const primary = targets.length ? targets[0].e : null;  // nearest hit enemy (Boiler Coil hooks this)
```

All the existing filters (dead/dropping/arc/blocker/dome-shelter) move verbatim into the gather pass. `didHit`, `hitEnemies`, `healAmt` accumulation stay in the apply pass.

- [ ] **Step 4: Run the full suite** — `npm test` → all pass (brass-nozzle and spray tests must still pass — the restructure must not change non-pierce behavior).
- [ ] **Step 5: Headless verify** — dev-menu start, eval `JH.Game.relics.hydro_lance = true; JH.Game.player.applyStats(JH.Upgrades.computeStats(JH.Upgrades.owned))`, spawn 6 mooks in a line via eval, hold ArrowRight-facing spray, assert the far mook's hp loss ≈ 25% of the near mook's.
- [ ] **Step 6: Commit** — `git commit -am "feat(relics): lance pierce falloff ladder — packed lines ~3x, not 10x"`

---

### Task 4: Prayer Bead — super-elite arrivals also proc

**Files:**
- Modify: `js/game.js:587-593` (super-elite spawn in `startWave`)
- Test: `tests/relics.test.js`

**Interfaces:**
- Consumes: `JH.RELIC_TUNE.prayerBeadDur`.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing test** — extract-and-call is impractical for `startWave`; test the helper instead. Add `Balance.prayerBeadProc(player, tune)` (pure, mirrors `kibbleGrant`):

```js
test("prayerBeadProc tops up pressureBuffT without shortening it", () => {
  const pl = { pressureBuffT: 2 };
  JH.Balance.prayerBeadProc(pl, JH.RELIC_TUNE);
  assert.strictEqual(pl.pressureBuffT, JH.RELIC_TUNE.prayerBeadDur);
  pl.pressureBuffT = 20;
  JH.Balance.prayerBeadProc(pl, JH.RELIC_TUNE);
  assert.strictEqual(pl.pressureBuffT, 20);
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** — in `js/balance.js`:

```js
// Prayer Bead grant: extend-only pressure buff (boss enrage + super-elite arrival).
prayerBeadProc(pl, tune) {
  pl.pressureBuffT = Math.max(pl.pressureBuffT || 0, (tune || JH.RELIC_TUNE).prayerBeadDur);
},
```

Route the three existing boss-enrage sites through it (`js/entities.js:2484, 2800, 3405` — replace the inline `Math.max` line with `JH.Balance.prayerBeadProc(game.player, JH.RELIC_TUNE)` inside the same relic check). Add the new proc in `js/game.js` right after the super-elite `spawnEnemy` call (~line 593):

```js
if (this.relics && this.relics.prayer_bead && this.player && this.player.alive) {
  JH.Balance.prayerBeadProc(this.player, JH.RELIC_TUNE);
  this.float(this.player.x, this.player.y - 40, "PRESSURE", "#ffd23f");
}
```

- [ ] **Step 4: Run the full suite** — pass. **Step 5: Commit** — `git commit -am "feat(relics): prayer bead procs on super-elite arrivals too, via shared Balance.prayerBeadProc"`

---

### Task 5: Rubber Boots + Asbestos Socks

**Files:**
- Modify: `js/entities.js` — burn grace (~243-244), burn tick (~283), SlowZone player-slow (~2313)
- Test: `tests/relics.test.js`

**Interfaces:**
- Consumes: `RELIC_TUNE.bootsHp/socksBurnDpsCut/socksBurnDpsFloor/socksGraceBonus`; `rubber_boots.apply` already folds maxHp (Task 1).
- Produces: nothing for later tasks.

- [ ] **Step 1: Write the failing tests**

```js
test("rubber boots: +bootsHp maxHp via computeStats", () => {
  JH.Game = { relics: { rubber_boots: true } };
  const s = JH.Upgrades.computeStats({});
  assert.strictEqual(s.maxHp, JH.PLAYER.maxHp + JH.RELIC_TUNE.bootsHp);
  JH.Game = null;
});
```

Burn-tick math is a pure expression — extract it to `Balance.burnTickDps(stacks, socksOwned)` and test:

```js
test("asbestos socks: per-stack burn dps cut with floor", () => {
  const F = JH.FIRE, T = JH.RELIC_TUNE;
  assert.strictEqual(JH.Balance.burnTickDps(3, false), 3 * F.burnDpsPerStack);
  assert.strictEqual(JH.Balance.burnTickDps(3, true),
    3 * Math.max(T.socksBurnDpsFloor, F.burnDpsPerStack - T.socksBurnDpsCut));
});
```

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** —

`js/balance.js`:
```js
// Burn dps on the player: per-stack rate, Asbestos Socks flat cut (floored).
burnTickDps(stacks, socksOwned) {
  const per = socksOwned
    ? Math.max(JH.RELIC_TUNE.socksBurnDpsFloor, JH.FIRE.burnDpsPerStack - JH.RELIC_TUNE.socksBurnDpsCut)
    : JH.FIRE.burnDpsPerStack;
  return stacks * per;
},
```

`js/entities.js` burn tick (line ~283) — replace `this.burnStacks * F.burnDpsPerStack` with `JH.Balance.burnTickDps(this.burnStacks, !!(JH.Game && JH.Game.relics && JH.Game.relics.asbestos_socks))`.

Burn grace (line ~244): `this.burnGraceT = this.stats.invuln + ((JH.Game && JH.Game.relics && JH.Game.relics.asbestos_socks) ? JH.RELIC_TUNE.socksGraceBonus : 0);`

SlowZone (line ~2313): gate the player-slow write: `if (!(JH.Game && JH.Game.relics && JH.Game.relics.rubber_boots)) pl.zoneSlow = this.slowMult;` (enemy `_puddleSlow` path untouched — boots are player-only). Check the surrounding `update` for a `game` parameter and prefer it over `JH.Game` if present.

- [ ] **Step 4: Full suite** → pass. **Step 5: Commit** — `git commit -am "feat(relics): rubber boots (+hp, slow-zone immunity) + asbestos socks (burn cut + longer burn i-frames)"`

---

### Task 6: Squeegee + Dog Leash

**Files:**
- Modify: `js/game.js` `onEnemyKilled` (~1065); `js/entities.js` doSpray flat-damage line (~781)
- Test: `tests/relics.test.js`

**Interfaces:**
- Consumes: `FirePatch.footprint()` `{rx, ry}` + `sprayProgress/extinguishDur` snuff idiom (see Ash Walk, entities.js:2181-2183); enemy `state === "charge"` (charger) / `"lunge"` (mook/stalker melee); `Geo.inGroundEllipse`.
- Produces: nothing for later tasks.

- [ ] **Step 1: Failing tests** — Squeegee via a game-stub `onEnemyKilled` call with a fake patch (`{ x, y, dead: false, sprayProgress: 0, extinguishDur: 5, footprint: () => ({ rx: 20, ry: 8 }) }`) and a dead enemy on it → `sprayProgress === extinguishDur`; a far enemy → unchanged. Dog Leash via the Task 3 spray harness: enemy with `state: "charge"` takes `(S.sprayDamage + leashLungeBonus) / S.sprayDamage` more than a `state: "walk"` twin.

- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** —

`js/game.js` `onEnemyKilled`, after the combo block:
```js
// Squeegee: a kill standing in a fire patch snuffs that patch.
if (this.relics && this.relics.squeegee && this.firePatches) {
  for (const fp of this.firePatches) {
    if (fp.dead) continue;
    const f = fp.footprint();
    if (JH.Geo.inGroundEllipse(e.x, e.y, fp.x, fp.y, f.rx, f.ry)) {
      fp.sprayProgress = fp.extinguishDur;
      this.audio.play("sizzle");
    }
  }
}
```

`js/entities.js` doSpray, in the apply pass (Task 3 structure):
```js
const leashAdd = (game.relics && game.relics.dog_leash && (e.state === "charge" || e.state === "lunge"))
  ? JH.RELIC_TUNE.leashLungeBonus : 0;
const flatDmg = S.sprayDamage + (e === nozzleTarget ? nozzleAdd : 0) + leashAdd;
```

- [ ] **Step 4: Full suite** → pass. **Step 5: Headless spot-check** — Fire World patch + kill on it → patch dies with sizzle. **Step 6: Commit** — `git commit -am "feat(relics): squeegee (kill-on-patch douses) + dog leash (flat bonus vs charging/lunging)"`

---

### Task 7: Rosary Chain

**Files:**
- Modify: `js/game.js` — `onEnemyKilled` (~1070), combo decay (~1641), `resetRun` (~412), GUSH readout (~2989-3010); `js/entities.js` doSpray flat-damage line
- Test: `tests/relics.test.js`

**Interfaces:**
- Consumes: `RELIC_TUNE.rosaryPerKill/rosaryCap`; `game.combo`/`comboTimer` lifecycle.
- Produces: `game.rosaryBonus` (number, 0 when chain broken) — read by doSpray.

- [ ] **Step 1: Failing test** — game-stub: call `onEnemyKilled` 12× with the relic → `rosaryBonus === rosaryCap`; simulate combo expiry (the decay branch that zeroes `combo`) → `rosaryBonus === 0`; without the relic it stays 0.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** — in `onEnemyKilled` right after `this.comboTimer = JH.COMBO_WINDOW;`:

```js
if (this.relics && this.relics.rosary_chain)
  this.rosaryBonus = Math.min(JH.RELIC_TUNE.rosaryCap, (this.rosaryBonus || 0) + JH.RELIC_TUNE.rosaryPerKill);
```

In the combo-decay site (game.js ~1641, where `comboTimer` runs out and the combo resets) add `this.rosaryBonus = 0;`. In `resetRun` (~415, beside `this.relics = {}`) add `this.rosaryBonus = 0;`.

doSpray flat-damage line grows one more adder: `+ ((game.relics && game.relics.rosary_chain && game.rosaryBonus) ? game.rosaryBonus : 0)`.

GUSH readout (~3003): under the `"GUSH x" + n` label, when `this.rosaryBonus > 0`, draw `"+" + this.rosaryBonus + " DMG"` in the same style one row lower (gold, small font, same fade).

- [ ] **Step 4: Full suite** → pass. **Step 5: Headless screenshot** of the readout mid-chain with the relic granted. **Step 6: Commit** — `git commit -am "feat(relics): rosary chain — combo kills bank flat spray dmg until the chain breaks"`

---

### Task 8: GUSH pulse — Backdraft Valve + The Big Spigot

**Files:**
- Modify: `js/game.js` — `onEnemyKilled` milestone branches (~1080-1105), game update (add ring update), world draw pass (~2064 area, with firePatches/slowZones), `resetRun`
- Test: `tests/relics.test.js`

**Interfaces:**
- Consumes: `RELIC_TUNE.pulseRadius/valveKnockback/spigotDamage`; `Geo.inGroundEllipse`; enemy `takeDamage/applyKnockback`.
- Produces: `game.pulseRings` array of `{ x, y, r, targetR, dur, t, dmg, kb, douse, hit: Set }` — expanding ring, **rim is hitbox**: an enemy/patch is affected the frame the ring's radius reaches it, exactly once.

- [ ] **Step 1: Failing test** — stub game with `pulseRings: []`, call `spawnGushPulse()` with both relics owned → one ring with `dmg === spigotDamage && kb === valveKnockback`; with neither → no ring. Then step `updatePulseRings(dt)` until `r >= targetR` with one near + one far enemy: near enemy damaged exactly once (hp loss = spigotDamage), enemy beyond `pulseRadius` untouched, fake patch inside doused.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** — in `js/game.js`:

```js
// GUSH milestone pulse (Backdraft Valve / Big Spigot). Rim is hitbox: the
// ring damages/knocks each target the frame its expanding rim reaches it.
spawnGushPulse() {
  const valve = this.relics && this.relics.backdraft_valve;
  const spigot = this.relics && this.relics.big_spigot;
  if (!valve && !spigot) return;
  const T = JH.RELIC_TUNE, p = this.player;
  this.pulseRings.push({
    x: p.x, y: p.y, r: 0, targetR: T.pulseRadius, dur: 0.25, t: 0,
    dmg: spigot ? T.spigotDamage : 0, kb: valve ? T.valveKnockback : 0,
    douse: true, hit: new Set(),
  });
  this.audio.play("gush");
},
updatePulseRings(dt) {
  if (!this.pulseRings || !this.pulseRings.length) return;
  for (const ring of this.pulseRings) {
    ring.t += dt;
    ring.r = Math.min(ring.targetR, ring.targetR * (ring.t / ring.dur));
    const ry = ring.r * 0.34;                       // same ground flatten as shadows
    for (const e of this.enemies) {
      if (e.dead || ring.hit.has(e)) continue;
      if (!JH.Geo.inGroundEllipse(e.x, e.y, ring.x, ring.y, ring.r, ry)) continue;
      ring.hit.add(e);
      const dir = Math.sign(e.x - ring.x) || 1;
      if (ring.dmg) e.takeDamage(ring.dmg, this, dir, 0);
      if (ring.kb) e.applyKnockback(dir, ring.kb, (e.y - ring.y) * 0.02);
    }
    if (ring.douse && this.firePatches)
      for (const fp of this.firePatches) {
        if (fp.dead || ring.hit.has(fp)) continue;
        if (!JH.Geo.inGroundEllipse(fp.x, fp.y, ring.x, ring.y, ring.r, ry)) continue;
        ring.hit.add(fp); fp.sprayProgress = fp.extinguishDur;
      }
  }
  this.pulseRings = this.pulseRings.filter((r) => r.t < r.dur + 0.15);  // brief fade tail
}
```

Call `this.spawnGushPulse()` inside BOTH milestone branches (`combo === 3` and the `% 5 === 0` branch). Call `this.updatePulseRings(dt)` from the play-state update near the combo decay. Init `this.pulseRings = []` in `resetRun`. Draw in the world pass beside `slowZones` (~2067): for each ring, stroke an ellipse at `(x - cam, feetScreenY(y, 0))` with radii `(r, r * 0.34)` in `JH.PAL.waterHi`, `globalAlpha = 1 - t / (dur + 0.15)`, lineWidth 2 — the drawn rim IS the hit rim (same `r`, same flatten).

- [ ] **Step 4: Full suite** → pass. **Step 5: Headless verify** — grant both relics, build a 5-chain near a mook pack + patch; assert pack knocked/damaged once each and patch dead; screenshot mid-ring. **Step 6: Commit** — `git commit -am "feat(relics): GUSH milestone pulse — backdraft valve knockback + big spigot blast, expanding rim-is-hitbox ring"`

---

### Task 9: Deputy Sprinkler

**Files:**
- Modify: `js/entities.js` — `Player.update` (after timer block ~298-307) + a small draw hook in `Player.draw`
- Test: `tests/relics.test.js`

**Interfaces:**
- Consumes: `RELIC_TUNE.sprinklerRange/sprinklerDps`.
- Produces: nothing for later tasks.

- [ ] **Step 1: Failing test** — spray-harness stub: enemy at distance < range loses `sprinklerDps * dt * waterMult` hp per update with the relic owned (no spraying involved); enemy beyond range untouched; nothing happens without the relic.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** — in `Player.update`, gated on `this.alive && game.enemies`:

```js
// Deputy Sprinkler: tank-mounted auto-jet — flat dps on the nearest enemy
// in short range. Free (no water); depth counts double like the hit band.
if (game.relics && game.relics.deputy_sprinkler && this.alive) {
  const T = JH.RELIC_TUNE;
  let best = null, bestD = T.sprinklerRange;
  for (const e of game.enemies) {
    if (e.dead || e.dropping) continue;
    const d = Math.hypot(e.x - this.x, (e.y - this.y) * 2.4);
    if (d < bestD) { bestD = d; best = e; }
  }
  if (best) {
    best.takeDamage(T.sprinklerDps * (best.def ? (best.def.waterMult || 1) : 1) * dt,
      game, Math.sign(best.x - this.x) || 1, 0);
    this.sprinklerT = (this.sprinklerT || 0) + dt;
    if (this.sprinklerT > 0.06) {                     // droplet arc toward the target
      this.sprinklerT = 0;
      game.particles.push(new Particle({
        x: this.x - this.facing * 6, y: this.y, z: this.z + 36,
        vx: (best.x - this.x) * 2.2, vy: (best.y - this.y) * 2.2,
        vz: 30, life: 0.4, color: JH.PAL.water, size: 2, grav: 160,
      }));
    }
  }
}
```

- [ ] **Step 4: Full suite** → pass. **Step 5: Headless verify** — grant relic, idle beside a mook (no keys held), assert its hp drains ~`sprinklerDps`/s; screenshot the droplet arc. **Step 6: Commit** — `git commit -am "feat(relics): deputy sprinkler — auto-jet flat dps on the nearest enemy in short range"`

---

### Task 10: Boiler Coil

**Files:**
- Modify: `js/entities.js` — doSpray (heat tracking + bonus/splash in the Task 3 apply pass), `Player.update` (gap reset), player field init/reset (~183-267)
- Test: `tests/relics.test.js`

**Interfaces:**
- Consumes: Task 3's `targets`/`primary`; `RELIC_TUNE.boilerHeatTime/boilerBonus/boilerSplash/boilerSplashR/boilerGap`.
- Produces: player fields `boilerTarget`, `boilerHeat`, `boilerGapT`.

- [ ] **Step 1: Failing test** — spray harness: spray one enemy for `boilerHeatTime + 0.2s` in small dt steps → its dps jumps by `boilerBonus` after the threshold and a second enemy within `boilerSplashR` starts taking `boilerSplash * dt`; switching targets resets (`boilerHeat` back near 0); a `boilerGap`+ pause resets too.
- [ ] **Step 2: Run to verify failure.**
- [ ] **Step 3: Implement** —

doSpray, after `primary` is known (end of the apply pass, only when `!dry`):
```js
// Boiler Coil: heat builds while the stream stays on one target.
if (game.relics && game.relics.boiler_coil) {
  const T = JH.RELIC_TUNE;
  if (primary === this.boilerTarget && primary) this.boilerHeat += dt;
  else { this.boilerTarget = primary; this.boilerHeat = 0; }
  this.boilerGapT = 0;
  if (primary && this.boilerHeat >= T.boilerHeatTime) {
    primary.takeDamage(T.boilerBonus * dmgScale * dt, game, this.facing, 0);
    for (const e of game.enemies) {                    // splash: same radius the FX shows
      if (e.dead || e === primary) continue;
      if (JH.Geo.inGroundEllipse(e.x, e.y, primary.x, primary.y, T.boilerSplashR, T.boilerSplashR * 0.34))
        e.takeDamage(T.boilerSplash * dmgScale * dt, game, this.facing, 0);
    }
    if (Math.random() < 12 * dt)                       // steam/ember flecks mark the superheat
      burst(game, primary.x, primary.y, primary.z + 14, JH.PAL.flame, 2, { speed: 40, life: 0.3, up: 30 });
  }
}
```

`Player.update` timer block: `if (this.boilerGapT != null) { this.boilerGapT += dt; if (this.boilerGapT > JH.RELIC_TUNE.boilerGap) { this.boilerTarget = null; this.boilerHeat = 0; } }` — init `boilerTarget = null; boilerHeat = 0; boilerGapT = 0` in the constructor field block (~183) and the respawn reset (~262).

Rim-is-hitbox note: the splash ellipse gets a matching one-frame steam ring only via the burst above (no persistent drawn zone, no persistent hit zone — symmetric).

- [ ] **Step 4: Full suite** → pass. **Step 5: Headless verify** — grant relic, hold spray on a bulwark for 3s next to a mook: bulwark dps steps up, mook bleeds splash. **Step 6: Commit** — `git commit -am "feat(relics): boiler coil — sustained same-target spray superheats with neighbor splash"`

---

### Task 11: Gear frame grades (steel/brass/gold)

**Files:**
- Modify: `js/assets.js:555-565` (`gearFrame`); `js/game.js:2728` (panel grid) and `~2893` (wheel card)
- Test: screenshot-verified (no unit test — pure rendering)

**Interfaces:**
- Consumes: `JH.RELICS[i].tier`.
- Produces: `Assets.gearFrame(ctx, x, y, scale, tier, t)` — `tier` optional (default `"common"`), `t` optional seconds for the gold shimmer.

- [ ] **Step 1: Implement** — replace the body keeping the current steel look as the `"common"` default:

```js
// Relic gear frame, graded by rarity tier. Riveted metal — deliberately
// square/industrial so it never reads as a benediction tier frame:
// common = steel edge + bronze rivets; rare = brass edge + light rivets;
// relic = double gold edge, slow shimmer, NO pulse glow (that's legendary's).
Assets.gearFrame = function (ctx, x, y, scale, tier, t) {
  const s = Math.round((scale || 1) * (JH.ICONS.size + 4)) / 2;
  const grades = {
    common: { edge: "#8fa8c8", rivet: "#b08a5c" },
    rare:   { edge: "#c9924a", rivet: "#ffd9a0" },
    relic:  { edge: "#d4af37", rivet: "#fff7c2" },
  };
  const g = grades[tier] || grades.common;
  ctx.save();
  ctx.lineWidth = 1; ctx.strokeStyle = g.edge;
  ctx.strokeRect(x - s, y - s, s * 2, s * 2);
  if (tier === "relic") {
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin((t || 0) * 2);   // slow shimmer
    ctx.strokeRect(x - s - 2, y - s - 2, s * 2 + 4, s * 2 + 4);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = g.rivet;
  [[-s, -s], [s - 1, -s], [-s, s - 1], [s - 1, s - 1]].forEach(([dx, dy]) =>
    ctx.fillRect(x + dx, y + dy, 1, 1));
  ctx.restore();
};
```

- [ ] **Step 2: Wire the call sites** — both pass the def's tier: at the wheel card (game.js ~2893) look up `const rd = JH.RELICS.find((x) => x.id === en.id);` (already nearby for label/desc) and call `JH.Assets.gearFrame(ctx, cx + 22, cy2 + 10, 1, rd && rd.tier, this.t)`; same pattern at the panel grid (~2728). Kibble/SOLD cards keep the default steel (no tier arg).
- [ ] **Step 3: Also surface the tier on the wheel card price color** — relic-grade price text in gold `#ffd23f`, rare in `#c9924a`, common unchanged (one-line fillStyle switch where the price renders).
- [ ] **Step 4: Full suite** → pass (a test stubs `gearFrame`? grep `gearFrame` in tests/ — extra args are backward-compatible, nothing should break).
- [ ] **Step 5: Headless screenshots** — force `wheelStock` to one id of each tier via eval, open the shop, screenshot the wheel; grant three relics of different tiers, screenshot the Tab panel grid. LOOK at both: three visibly distinct frames, gold ≠ benediction legendary.
- [ ] **Step 6: Commit** — `git commit -am "feat(ui): gear frame rarity grades — steel/brass/gold with relic shimmer, wheel + panel wiring"`

---

### Task 12: Bake the 9 new icons

**Files:**
- Modify: `tools/icon-sprites.mjs` (BAKERS map)
- Create: `sprites/icons/{rubber_boots,asbestos_socks,squeegee,rosary_chain,backdraft_valve,dog_leash,deputy_sprinkler,big_spigot,boiler_coil}.png`

**Interfaces:**
- Consumes: `JH.ICONS.keys` already lists the 9 (Task 1); `Assets.icon` picks the PNGs up automatically.

- [ ] **Step 1: Add 9 painters to BAKERS** following the file's `l(x, y, w, h, color)` logical-rect idiom and its palette constants. Concrete starting compositions (adjust freely for readability at 12px — judge by the contact sheet, not the code):

```js
rubber_boots(l) {   // green wellington: shaft + foot + pale sole
  l(4, 2, 3, 5, GREEN); l(4, 7, 6, 2, GREEN); l(4, 9, 6, 1, STEEL);
  l(4, 2, 1, 5, "#b0ffb0");
},
asbestos_socks(l) { // grey sock pair, red heat flecks
  l(3, 2, 2, 5, STEEL); l(2, 7, 3, 3, STEEL_DK);
  l(7, 2, 2, 5, STEEL); l(8, 7, 3, 3, STEEL_DK);
  l(4, 4, 1, 1, RED); l(8, 5, 1, 1, RED);
},
squeegee(l) {       // T-handle + blade + water streaks below
  l(5, 1, 2, 5, WOOD); l(2, 6, 8, 2, STEEL); l(2, 8, 8, 1, STEEL_DK);
  l(3, 10, 1, 1, WATER); l(6, 10, 1, 1, WATER); l(9, 10, 1, 1, WATER);
},
rosary_chain(l) {   // bead ring + hanging cross
  for (const [x, y] of [[4,2],[7,2],[3,4],[8,4],[4,6],[7,6]]) l(x, y, 1, 1, GOLD);
  l(5, 7, 2, 1, GOLD_DK); l(5, 8, 2, 3, GOLD); l(4, 9, 4, 1, GOLD);
},
backdraft_valve(l) {// red valve wheel on a pipe
  l(5, 8, 2, 3, STEEL_DK);
  l(3, 3, 6, 6, RED); l(5, 2, 2, 8, RED); l(2, 5, 8, 2, RED);
  l(5, 5, 2, 2, RED_HI);
},
dog_leash(l) {      // collar loop + taut lead
  l(2, 6, 4, 4, EARTH); l(3, 7, 2, 2, null); l(3, 7, 2, 2, GOLD);  // collar + tag
  l(6, 5, 1, 1, WOOD); l(7, 4, 1, 1, WOOD); l(8, 3, 1, 1, WOOD); l(9, 2, 1, 1, WOOD);
},
deputy_sprinkler(l) {// sprinkler head + droplet fan
  l(4, 6, 4, 4, STEEL); l(5, 4, 2, 2, STEEL_DK);
  l(2, 2, 1, 1, WATER); l(5, 1, 1, 1, WATER); l(9, 2, 1, 1, WATER);
  l(1, 4, 1, 1, WATER_HI); l(10, 4, 1, 1, WATER_HI);
},
big_spigot(l) {     // fat faucet + gush below
  l(3, 3, 6, 3, STEEL); l(8, 6, 2, 2, STEEL_DK); l(5, 1, 2, 2, STEEL_DK);
  l(8, 8, 2, 3, WATER); l(7, 10, 4, 1, WATER_HI);
},
boiler_coil(l) {    // heating coil + flame tip
  for (let i = 0; i < 3; i++) l(3, 3 + i * 2, 6, 1, FIRE);
  l(3, 3, 1, 5, FIRE); l(8, 4, 1, 5, FIRE);
  l(5, 1, 2, 2, FIRE_HI); l(4, 9, 4, 1, RED_DK);
},
```

(`dog_leash` note: the file's `l` helper has no eraser — drop the `null` line and draw the collar as four 1px edge strips instead.)

- [ ] **Step 2: Bake** — `node tools/icon-sprites.mjs rubber_boots asbestos_socks squeegee rosary_chain backdraft_valve dog_leash deputy_sprinkler big_spigot boiler_coil` → 9 PNGs in `sprites/icons/`.
- [ ] **Step 3: LOOK at them** — `node tools/icon-contact-sheet.mjs` (or Read the PNGs directly); each glyph must read at a glance and not collide with an existing icon's silhouette. Iterate painters until they do.
- [ ] **Step 4: Headless verify** — open the shop with forced stock containing new items; icons render on cards (no procedural fallback).
- [ ] **Step 5: Commit** — `git add tools/icon-sprites.mjs sprites/icons/ && git commit -m "art(icons): bake 9 rarity-pass relic glyphs"`

---

### Task 13: Economy measurement + final sweep

**Files:**
- Create: scratchpad script only (not committed)
- Modify: none expected (numbers report to the user; no self-directed retuning)

- [ ] **Step 1: Full suite** — `npm test` → everything green.
- [ ] **Step 2: Measure per-run suds income headlessly** — boilerplate + a wave-sweep loop: for each wave `JH.Game.devGotoWave(i)`, eval-kill every enemy (`e.hp = 0; e.die ? e.die(g) : e.dead = true;`), teleport the player onto each pickup until collected, force objective waves complete (`gardens[i].done`, `wall.dead`, cap `holdoutTimer`). At the end read `player.sudsEarned`. **Telemetry gotcha:** install the endpoint spy BEFORE `Backquote` (committed config posts real rows).
- [ ] **Step 3: Report** — total income vs the tier sheet (commons 60-100, rares 250-350, relic-grade 500-560): how many of each tier a full clear can afford, with and without Punch Card. **Report the numbers to the user and stop — pricing adjustments are their call.**
- [ ] **Step 4: Wheel-feel screenshots** — one shop visit per act (devGotoWave to an act boundary, spawn vendor, screenshot wheel) showing the tier spread and act-scaling jackpot slot.
- [ ] **Step 5: Update the SDD ledger** (`.superpowers/sdd/progress.md`) and hold everything on the branch for the user's playtest. NO release steps — "Rummage Sale" ships on their word only.

---

## Self-review notes (already applied)

- Spec's "GUSH activation" maps to the combo milestone branches (`combo === 3`, `% 5 === 0`) — GUSH has no pressed activation; milestones are its "moments". Valve/Spigot fire there.
- Spec's Prayer Bead raise ("every enrage") was a no-op as written — bosses enrage once and the latch is already per-boss. Substituted: super-elite arrivals also proc (Task 4). **Flag to user at kickoff.**
- `actGate: true` → `minAct: 0` migration is Task 1; `minAct: 0` must not be treated as falsy (use `== null` checks).
- Boiler splash keeps rim-is-hitbox symmetry by having no persistent drawn zone and no persistent hit zone (per-frame flecks only).
