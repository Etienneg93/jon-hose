# Shop & Relics Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signatures become rotation relics with a flat-gear rule, the Reliquary redeems all washed benedictions for an escalating essence cost, and the shop/HUD get their presentation pass (24 baked benediction icons with tier frames, relic slot wheel + Kibble Pack, always-visible character stat block).

**Architecture:** Data/mechanics land first (config + upgrades + balance, pure and unit-tested), presentation second (baked icon atlas extension → runtime frame helper → panel → shop wheel). Every tunable lives in `js/config.js`. Tests use the repo's dual-export pattern (`require("../js/benedictions.js")`) or `global.window = globalThis` stubs.

**Tech Stack:** Vanilla JS IIFE modules on the `JH` namespace, node --test, pngjs bakers in `tools/`, playwright-core + headless msedge for verification.

**Spec:** `docs/superpowers/specs/2026-07-09-shop-relics-pass-design.md`

## Global Constraints

- **Playtest gate:** gameplay commits go to the pass branch; NOTHING merges to main until the user playtests and says so. Ships as minor release "Rummage Sale".
- **Flat-gear rule (permanent):** relic effects are flat, unconditional adders; percent multipliers/conditional/elemental effects are benediction-only.
- **Tunables live in `js/config.js`** — no gameplay constants hardcoded elsewhere.
- **Comment style:** behavioral/mechanical facts only; design rationale goes in commit messages.
- **NEVER run bakers over `sprites/mook/*` or `sprites/fuse/walk*.png`** (hand-cleaned). This pass only creates `sprites/icons/bene_*.png` — new files.
- **Headless testing:** install a telemetry fetch spy BEFORE any `startGame`/dev-menu call (committed config has the LIVE endpoint); hold keys ~120ms.
- **Test numbers derive from config** (e.g. `JH.RELIC_TUNE.brassNozzleAdd`), never repeat literals.
- **Working branch:** create `shop-relics-pass` off the current branch head; do not touch main.

---

### Task 0: Branch + carry the held panel work

The working tree holds the finished, headless-verified benediction stats-panel feature (js/benedictions.js effectText, js/input.js toggleStats + gamepad remap, js/game.js panel + shop-bene-removal, tests). This pass builds on it.

**Files:** none created — branch + commit only.

- [ ] **Step 1:** `git checkout -b shop-relics-pass`
- [ ] **Step 2:** `npm test` → expect 232/232 pass.
- [ ] **Step 3:** Commit the held work (everything except CLAUDE.md, which is local-only):

```bash
git add js/benedictions.js js/game.js js/input.js tests/benedictions.test.js
git commit -m "feat(panel): Tab/gamepad-Back stat panel with benediction effect text; shop bene rows removed

Held from the panel round; playtest gate applies to the eventual main merge."
```

---

### Task 1: Relic data model — ex-signatures, RELIC_TUNE, stat fold

**Files:**
- Modify: `js/config.js` (JH.RELICS array ~371-382; add JH.RELIC_TUNE after it)
- Modify: `js/upgrades.js` (NODES ~15-25, computeStats ~79-102)
- Modify: `js/game.js` `buyRelic` (~938-951)
- Test: `tests/relics.test.js` (create)

**Interfaces:**
- Consumes: `JH.RELICS`, `JH.Upgrades.computeStats(owned)`, `JH.Game.relics` (game instance is published as `window.JH.Game`).
- Produces: relic defs may carry `apply(s)` and `actGate: true`; `JH.RELIC_TUNE = { brassNozzleAdd: 10, spigotHealRate: 15, prayerBeadDur: 8, spongeWindowBonus: 2 }`; `computeStats` folds `apply` of every relic in `JH.Game.relics`. Task 2 relies on `actGate`; Task 3 on `RELIC_TUNE`.

- [ ] **Step 1: Write failing tests** (`tests/relics.test.js`):

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");
global.window = globalThis;
require("../js/config.js");
require("../js/balance.js");
require("../js/upgrades.js");
const JH = globalThis.JH;

test("RELICS: ex-signatures exist with apply hooks and relic costs", () => {
  const byId = (id) => JH.RELICS.find((r) => r.id === id);
  const dash = byId("hydro_dash"), marshal = byId("fire_marshal"), lance = byId("hydro_lance");
  assert.ok(dash && marshal && lance, "all three ex-signatures are relics");
  assert.strictEqual(dash.cost, 200);
  assert.strictEqual(marshal.cost, 220);
  assert.strictEqual(lance.cost, 300);
  assert.ok(lance.actGate, "lance is act-gated");
  for (const r of [dash, marshal, lance]) assert.strictEqual(typeof r.apply, "function");
});

test("computeStats folds owned relic applies (lance +18 dmg, dash cd, no puddle)", () => {
  JH.Game = { relics: { hydro_lance: true, hydro_dash: true } };
  const s = JH.Upgrades.computeStats({});
  assert.strictEqual(s.sprayDamage, JH.PLAYER.sprayDamage + 18);
  assert.strictEqual(s.beam, 3);
  assert.ok(Math.abs(s.dashCd - Math.max(0.2, JH.PLAYER.dashCd - 0.2)) < 1e-9);
  assert.strictEqual(!!s.dashPuddle, false, "Hydro-Dash relic must NOT set dashPuddle");
  JH.Game = null;
});

test("upgrades NODES no longer contain signatures", () => {
  assert.strictEqual(JH.Upgrades.nodes.length, 0);
});
```

- [ ] **Step 2:** `npm test -- tests/relics.test.js` → FAIL (no hydro_dash relic).
- [ ] **Step 3: Implement.** In `js/config.js`, replace the two retired desc lines and append to `JH.RELICS` (final array — brass/spigot/sponge/bead descs change in Task 3, leave them for now):

```js
    { id: "hydro_dash",   name: "Hydro-Dash",        cost: 200,
      desc: "-0.2s dash cooldown; dash boosts speed +28 for 3s",
      apply: (s) => { s.dashCd = Math.max(0.2, s.dashCd - 0.2); s.dashBoost = 28; s.dashBoostDur = 3; } },
    { id: "fire_marshal", name: "Fire-Marshal Spec", cost: 220,
      desc: "+30 range, +30 knockback",
      apply: (s) => { s.sprayRange += 30; s.knockback += 30; } },
    { id: "hydro_lance",  name: "Hydro Lance",       cost: 300, actGate: true,
      desc: "+18 dmg; a cutting beam that pierces the whole line",
      apply: (s) => { s.sprayDamage += 18; s.beam = 3; s.knockback += 20; } },
```

After the array add:

```js
  // Relic behavior tunables (flat-gear rule: adders only, no multipliers).
  JH.RELIC_TUNE = {
    brassNozzleAdd: 10,     // + spray dmg to the primary stream target
    spigotHealRate: 15,     // hp/s restored while a hydrant is refilling you
    prayerBeadDur: 8,       // s of pressure buff at a boss's first enrage
    spongeWindowBonus: 2,   // s added to GUSH regen windows
  };
```

In `js/upgrades.js`: `const NODES = [];` (delete the three entries; keep NODES/BRANCHES exports — BRANCHES becomes `[]` too so drawShop's branch loop renders nothing). In `computeStats`, after the NODES fold add:

```js
      // Owned relics with stat hooks (game.relics lives on the instance;
      // JH.Game is published by main.js). Flag-relics have no apply.
      const relicsOwned = (JH.Game && JH.Game.relics) || {};
      (JH.RELICS || []).forEach((r) => { if (r.apply && relicsOwned[r.id]) r.apply(s); });
```

In `js/game.js` `buyRelic`, after `this.relics[id] = true;` add the same HP/water headroom carry `Upgrades.buy` uses:

```js
      const fresh = JH.Upgrades.computeStats(JH.Upgrades.owned);
      const hpGain = fresh.maxHp - this.player.stats.maxHp;
      const waterGain = fresh.maxWater - this.player.stats.maxWater;
      this.player.applyStats(fresh);
      if (hpGain > 0) this.player.hp = Math.min(fresh.maxHp, this.player.hp + hpGain);
      if (waterGain > 0) this.player.water = Math.min(fresh.maxWater, this.player.water + waterGain);
```

Note: `dashBoost`/`dashBoostDur`/`dashPuddle` are existing JH.PLAYER keys — verify with `grep -n "dashBoost\|dashPuddle" js/config.js js/entities.js`; the puddle flag simply stays false now.

- [ ] **Step 4:** `npm test` → relics tests pass; if any old upgrades tests assert the 3 nodes, update them to derive from `JH.Upgrades.nodes` (they should now expect empty; check `grep -rn "sig_dash\|sig_marshal\|sig_lance" tests/`).
- [ ] **Step 5:** Commit: `git add -A tests/relics.test.js js/config.js js/upgrades.js js/game.js && git commit -m "feat(relics): signatures join the relic pool with stat-fold applies"`

---

### Task 2: Gates + powerCount — Lance act-gate, Overcharge act-gate, stat-relics count

**Files:**
- Modify: `js/balance.js` `powerCount` (~35-43)
- Modify: `js/game.js` `spawnVendor` (~934-937), powerCount call sites (~432, ~912), `shopSelectables`/confirm gating for Overcharge, `drawShop` rows (~2573-2583)
- Modify: `js/upgrades.js` (add `overchargeUnlocked()`)
- Test: `tests/relics.test.js` (extend), `tests/balance.test.js` (extend if present — check `ls tests/`)

**Interfaces:**
- Consumes: `JH.RELICS[].actGate`, `JH.Upgrades.currentActLevel` (set by game per wave; -1 = Act 1).
- Produces: `Balance.powerCount(owned, repCount, churchState, levelCount, statRelicCount)` (5th arg, default 0); `Upgrades.overchargeUnlocked()`; `Game.statRelicCount()`; `spawnVendor` filters `actGate` relics until `currentActLevel >= 0`.

- [ ] **Step 1: Failing tests** (append to `tests/relics.test.js`):

```js
test("powerCount counts stat relics via 5th arg", () => {
  const base = JH.Balance.powerCount({}, {}, null, 0);
  assert.strictEqual(JH.Balance.powerCount({}, {}, null, 0, 3), base + 3);
});

test("overcharge unlocks by act, not node ownership", () => {
  JH.Upgrades.currentActLevel = -1;
  assert.strictEqual(JH.Upgrades.overchargeUnlocked(), false);
  JH.Upgrades.currentActLevel = 0;
  assert.strictEqual(JH.Upgrades.overchargeUnlocked(), true);
  JH.Upgrades.currentActLevel = -1;
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implement.**
  - balance.js: add param `statRelicCount` and `n += statRelicCount | 0;`.
  - upgrades.js: `overchargeUnlocked() { return this.currentActLevel >= 0; },`
  - game.js: add near buyRelic:

```js
    // Stat-bearing relics owned (defs with apply) — feeds Balance.powerCount.
    statRelicCount() {
      let n = 0;
      (JH.RELICS || []).forEach((r) => { if (r.apply && this.relics && this.relics[r.id]) n++; });
      return n;
    },
```

  - Both powerCount call sites gain the 5th arg `this.statRelicCount()`.
  - `spawnVendor`: `const pool = JH.RELICS.filter((r) => !r.actGate || JH.Upgrades.currentActLevel >= 0).map((r) => r.id); this.relicStock = JH.Balance.pickRelics(pool, this.relics, 3, Math.random);`
  - drawShop rows (~2577-2579): replace `if (U.allNodesOwned()) ... else rows.push({ t: "lock", label: "Max the skill tree to unlock" });` with `if (U.overchargeUnlocked()) U.repeatables.forEach((n) => rows.push({ t: "rep", n })); else rows.push({ t: "lock", label: "Unlocks after the first boss" });`. Mirror the same gate wherever `shopSelectables`/confirm builds rep entries (`grep -n "allNodesOwned" js/game.js` — replace every use).
- [ ] **Step 4:** `npm test` → pass. **Step 5:** Commit `feat(relics): lance act-gate, overcharge act unlock, powerCount sees stat relics`.

---

### Task 3: Relic retunes — Brass Nozzle, Spigot Key, Prayer Bead, Loaded Sponge

**Files:**
- Modify: `js/entities.js` (~183, ~264, ~304 spigotT removal; ~531-545 hydrant; ~656-690 blocker2 removal; ~761, ~781-782 damage loop; ~2460-2464 prayer bead)
- Modify: `js/config.js` (4 desc strings in JH.RELICS; JH.HYDRANT comment)
- Modify: `js/game.js` (~993-997 gush window)
- Test: `tests/relics.test.js` (extend)

**Interfaces:**
- Consumes: `JH.RELIC_TUNE` (Task 1).
- Produces: no new API — behavior changes only. Damage loop shape for Task 10's assertions: primary target takes `(S.sprayDamage + brassNozzleAdd) * chain`, chain hits unchanged.

- [ ] **Step 1: Failing tests** (these are pure-ish; the entities changes are verified headlessly in Task 10, but the config/desc contract is unit-testable):

```js
test("retuned relic descs match the flat-gear effects", () => {
  const d = (id) => JH.RELICS.find((r) => r.id === id).desc;
  assert.match(d("brass_nozzle"), /\+10 spray dmg .* first enemy/i);
  assert.match(d("spigot_key"), /hydrant .* (restores|heals)/i);
  assert.match(d("prayer_bead"), /8s|8 s/i);
  assert.match(d("loaded_sponge"), /doubled .* regen window/i);
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implement.**
  - config.js RELICS descs:
    - brass_nozzle: `"+10 spray dmg to the first enemy the stream hits"`
    - spigot_key: `"Hydrant refills also restore 15 HP/s while filling"`
    - prayer_bead: `"A boss's first enrage grants an 8s pressure buff"`
    - loaded_sponge: `"GUSH refund doubled; regen windows +2s"`
  - entities.js:
    - Delete `this.spigotT` init (183), reset (264), decrement (304).
    - Hydrant block (~539-542): replace the spigotT line with `if (game.relics && game.relics.spigot_key) this.hp = Math.min(S.maxHp, this.hp + JH.RELIC_TUNE.spigotHealRate * dt);` and update the config comment on `JH.HYDRANT` to `// water refill; HP only via Spigot Key relic`.
    - Delete the whole Brass Nozzle blocker2 block (~656-690: `let blocker2 = null;` stays as `const blocker2 = null;`? No — remove blocker2 entirely: delete the block and change line ~761 `if (!pierce && e !== blocker && e !== blocker2) continue;` to `if (!pierce && e !== blocker) continue;`).
    - Damage line (~781-782): remove `spigotMult`; add above the loop `const nozzleAdd = (game.relics && game.relics.brass_nozzle) ? JH.RELIC_TUNE.brassNozzleAdd : 0;` and change to:

```js
        const flatDmg = S.sprayDamage + (e === blocker ? nozzleAdd : 0);
        const dmg = flatDmg * dmgScale * mult * pressureMult * beneMult * ssMult * dt;
```

  Split Stream chain hits (~832) keep using bare `S.sprayDamage` — untouched.
    - Prayer Bead (~2463): `game.player.pressureBuffT = Math.max(game.player.pressureBuffT, JH.RELIC_TUNE.prayerBeadDur);`
  - game.js GUSH (~986 and ~993): `const winBonus = (this.relics && this.relics.loaded_sponge) ? JH.RELIC_TUNE.spongeWindowBonus : 0; p.gushRegenT = J.gushRegenDur + winBonus;` (both the x3 and x5 branches).
- [ ] **Step 4:** `npm test` → pass (also re-run full suite; the spigotT removal must not break entities tests — `grep -rn "spigotT" tests/ js/` must return nothing).
- [ ] **Step 5:** Commit `feat(relics): flat-gear retunes — nozzle +10 primary, spigot heals at hydrant, bead 8s, sponge +2s windows`.

---

### Task 4: Reliquary redeem-all with escalating cost

**Files:**
- Modify: `js/benedictions.js` (~128-169: washed block; ~147-148 reset)
- Modify: `js/church.js` (~332-345 interaction; ~677-692 detail text)
- Test: `tests/benedictions.test.js` (extend)

**Interfaces:**
- Consumes: `Benedictions.washed`, `wash()`, `washedCount()`.
- Produces: `Benedictions.redeemCount` (number), `redeemAllCost()` → `1 + redeemCount`, `redeemAll()` → number of boons restored (0 = nothing to do; caller charges essence BEFORE calling). `reclaimNext()` is REMOVED — grep for callers first.

- [ ] **Step 1: Failing tests** (append to `tests/benedictions.test.js`; `B` is the required module):

```js
test("reliquary: redeemAll restores every washed boon at rank, cost escalates, reset clears", () => {
  B.reset();
  B.take("split_stream"); B.take("split_stream"); B.take("ash_walk");
  B.wash();
  assert.strictEqual(B.redeemAllCost(), 1);
  const n = B.redeemAll();
  assert.strictEqual(n, 2);
  assert.strictEqual(B.rank("split_stream"), 2);
  assert.strictEqual(B.rank("ash_walk"), 1);
  assert.strictEqual(B.washedCount(), 0);
  assert.strictEqual(B.redeemAllCost(), 2, "second redemption costs 2");
  B.wash();                      // death does NOT reset the counter
  assert.strictEqual(B.redeemAllCost(), 2);
  B.reset();
  assert.strictEqual(B.redeemAllCost(), 1, "new run resets the counter");
  assert.strictEqual(typeof B.reclaimNext, "undefined", "per-boon reclaim retired");
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implement** in benedictions.js (replace `reclaimNext`):

```js
    // Reliquary redemptions this run; each redeem-all costs 1 + prior count.
    redeemCount: 0,

    redeemAllCost() { return 1 + this.redeemCount; },

    // Restore EVERY washed boon at its washed rank. Charges nothing itself —
    // the church station checks/charges essence first. Returns boons restored.
    redeemAll() {
      const ids = Object.keys(this.washed);
      if (!ids.length) return 0;
      for (const id of ids) this.active[id] = this.washed[id];
      this.washed = {};
      this.redeemCount++;
      return ids.length;
    },
```

  `reset()` gains `this.redeemCount = 0;`. In church.js the confirm handler
  (~337-343; essence is `this.state.essence`, persisted with `this.save()` —
  the existing block at 338-339 shows the exact pattern) becomes:

```js
      if (sc.nearReliquary && In.pressed("confirm")) {
        const cost = B.redeemAllCost();
        if (this.state.essence >= cost) {
          this.state.essence -= cost; this.save();
          const n = B.redeemAll();
          sc.ringFx = { x: L.reliquaryX, color: "#ffd23f", t: 0 };
          sc.buyFloat = { text: "+" + n + " BENEDICTION" + (n === 1 ? "" : "S"), x: L.reliquaryX, color: "#ffd23f", t: 0 };
        }
        // afford-fail: fall through silently — the station line below already
        // renders the cost in the red "can't afford" tint (line ~690 pattern).
      }
```

  Detail text (~685-691): `RELIQUARY — {n} washed benediction(s)` / drop the
  "Next:" line (all come back) / `{cost} Essence · E: redeem all`, with the
  existing ≥-cost color flip (`#9be8ff` / `#a66`) reading `this.state.essence >= cost`.
- [ ] **Step 4:** `npm test` → pass. **Step 5:** Commit `feat(reliquary): redeem-all for escalating essence (1,2,3…) — bank essence vs pillars`.

---

### Task 5: Kibble Pack — config + buy path

**Files:**
- Modify: `js/config.js` (add JH.KIBBLE_PACK after JH.CONSUMABLES ~364)
- Modify: `js/game.js` (add `buyKibble()` next to `buyConsumable` ~2357)
- Test: `tests/relics.test.js` (extend)

**Interfaces:**
- Consumes: player kibble fields (`kibbleTimer`, `kibbleRegen` — grant semantics IDENTICAL to the health-pickup collect at entities.js:2616: `kibbleTimer += dur; kibbleRegen = heal / dur`).
- Produces: `JH.KIBBLE_PACK = { cost: 30, heal: 25, dur: 6 }`; `Game.buyKibble()` → bool. Task 9's wheel card calls `buyKibble()`.

- [ ] **Step 1: Failing test:**

```js
test("kibble pack: charges suds, extends kibble timer, resets rate", () => {
  const pl = { suds: 100, kibbleTimer: 3, kibbleRegen: 0, stats: { maxHp: 100 } };
  const g = Object.create(JH.Game || {});   // if Game isn't loadable pure, test via a thin stub:
  const buy = require("../js/game.js") && null;  // see step 3 note
});
```

  Note for implementer: `js/game.js` is NOT pure-requirable — follow the `tests/entities.test.js` `makeThinkGame` stub pattern (`global.window = globalThis`, `document.getElementById` fake with `style: {}`) OR extract the grant math as `JH.Balance.kibbleGrant(pl, pack)` in balance.js (pure, preferred):

```js
    // Kibble grant: extend the regen window, reset the rate (same semantics
    // as the health-pickup collect path).
    kibbleGrant(pl, pack) {
      pl.kibbleTimer += pack.dur;
      pl.kibbleRegen = pack.heal / pack.dur;
    },
```

  Then the test is pure:

```js
test("kibble grant matches pickup semantics", () => {
  const pl = { kibbleTimer: 3, kibbleRegen: 0 };
  JH.Balance.kibbleGrant(pl, JH.KIBBLE_PACK);
  assert.strictEqual(pl.kibbleTimer, 3 + JH.KIBBLE_PACK.dur);
  assert.ok(Math.abs(pl.kibbleRegen - JH.KIBBLE_PACK.heal / JH.KIBBLE_PACK.dur) < 1e-9);
});
```

- [ ] **Step 2:** FAIL → **Step 3:** config + balance as above, and in game.js:

```js
    // Buy a Kibble Pack (fixed wheel card, repeatable); returns true on success.
    buyKibble() {
      const K = JH.KIBBLE_PACK, price = this.priceOf(K.cost);
      if (this.player.suds < price) return false;
      this.player.suds -= price;
      JH.Balance.kibbleGrant(this.player, K);
      return true;
    },
```

  Also update the health-pickup collect (entities.js:2616-2617) to call `JH.Balance.kibbleGrant(pl, { dur: 6.0, heal: this.value })` so the semantics stay single-sourced.
- [ ] **Step 4:** `npm test` → pass. **Step 5:** Commit `feat(shop): kibble pack staple — 30 suds, 25 HP over 6s, stacks`.

---

### Task 6: Benediction icon baker — 24 glyphs + keys + contact sheet

**Files:**
- Create: `tools/bene-icon-sprites.mjs`
- Create: `tools/icon-contact-sheet.mjs`
- Modify: `js/config.js` JH.ICONS.keys (~102-109)
- Test: `tests/benedictions.test.js` (extend)

**Interfaces:**
- Consumes: the grid/outline/save helpers pattern from `tools/icon-sprites.mjs` (copy them — bakers are standalone by convention) and its palette constants.
- Produces: `sprites/icons/bene_<id>.png` for every `Benedictions.DEFS` id; `JH.ICONS.keys` includes each `bene_<id>`; `scratchpad`-independent contact sheet at `sprites/icons/_bene_sheet.png` (gitignored? NO — keep out of git: write it to the OS temp dir the tool prints).

- [ ] **Step 1: Failing test** (derives from DEFS — future benedictions without icons fail the suite):

```js
test("every benediction has a baked icon key", () => {
  for (const d of B.DEFS)
    assert.ok(JH.ICONS.keys.includes("bene_" + d.id), "missing icon key bene_" + d.id);
});
```

  (This test file must `require("../js/config.js")` — check its header; add if absent.)
- [ ] **Step 2:** FAIL → **Step 3: Implement the baker.** Copy the header/helpers of `tools/icon-sprites.mjs` verbatim (makeGrid/set/rect/outline/save/icon/SIZE/palettes — see that file's lines 1-80). Element palettes: WATER/FIRE/EARTH/AIR + GOLD constants already defined there. Add per-glyph draw functions keyed `bene_<id>`. The `l(x, y, w, h, color)` rect language draws in 12×12 logical units. Three complete references (match this level of craft for the rest):

```js
  // Split Stream — a stream that forks into a Y.
  bene_split_stream: icon((l) => {
    l(5, 1, 2, 5, WATER);              // trunk
    l(4, 5, 2, 2, WATER_DK);           // fork joint
    l(3, 6, 2, 4, WATER); l(2, 9, 2, 2, WATER_HI);   // left branch + tip
    l(7, 6, 2, 4, WATER); l(8, 9, 2, 2, WATER_HI);   // right branch + tip
  }),
  // Steam Sermon (duo water+fire) — steam cloud over an open book.
  bene_steam_sermon: icon((l) => {
    l(3, 2, 6, 2, WATER_HI); l(2, 3, 3, 2, WATER); l(7, 3, 3, 2, WATER);  // cloud
    l(2, 8, 4, 3, FIRE); l(6, 8, 4, 3, FIRE_HI);    // open book halves
    l(5, 7, 2, 4, GOLD_DK);                          // spine
  }),
  // Standing Stone (earth legendary) — a monolith with a gold crown notch.
  bene_standing_stone: icon((l) => {
    l(4, 2, 4, 9, EARTH); l(5, 2, 2, 9, EARTH_HI);   // slab + face light
    l(3, 10, 6, 1, EARTH_DK);                        // base
    l(5, 1, 2, 1, GOLD);                             // crown notch
  }),
```

  Remaining 21 use the motif table from the spec §2a (one function each, element palette of the DEF, duos two-tone, legendaries element+GOLD accents). Keep glyphs readable at 12px: 2-3 colors + one highlight, big silhouettes, no single-pixel detail except accents.
- [ ] **Step 4:** Bake + wire: `node tools/bene-icon-sprites.mjs` → 24 PNGs; append all 24 `"bene_<id>"` keys to `JH.ICONS.keys` (one line per element group, matching the existing grouping style).
- [ ] **Step 5: Contact sheet** — `tools/icon-contact-sheet.mjs`: read every `sprites/icons/bene_*.png` with pngjs, blit into a labeled grid (6 columns, 3px gutters, 2x scale), write to `<os.tmpdir()>/bene_sheet.png`, print the path. Run it and VIEW the sheet (Read tool) — every glyph must be identifiable and on-motif; iterate any that read as mush.
- [ ] **Step 6:** `npm test` → pass. Commit `feat(icons): 24 baked benediction glyphs + contact-sheet tool` (add `sprites/icons/bene_*.png`, both tools, config).

---

### Task 7: Tier frame/glow helper + sigil swap

**Files:**
- Modify: `js/assets.js` (add `Assets.tierFrame` + `Assets.gearFrame` near `Assets.icon` ~470-490)
- Modify: `js/entities.js` `Sigil.draw` (~2684-2745)
- Modify: `js/config.js` (remove `"frame_duo", "frame_legendary"` from ICONS.keys)
- Delete: `sprites/icons/frame_duo.png`, `sprites/icons/frame_legendary.png`
- Test: none new (draw-only; Task 10 screenshots gate it)

**Interfaces:**
- Consumes: `Assets.icon(ctx, key, x, y, scale)` (returns false until the PNG streams in); `JH.SIGIL_COLORS`.
- Produces: `Assets.tierFrame(ctx, x, y, d, rank, scale, t)` — d = benediction def, rank 0-2, scale ~1 (frame hugs a 12px icon × scale), t = seconds for pulse; draws boon/duo/legendary frame + glow per spec §2b. `Assets.gearFrame(ctx, x, y, scale)` — steel/bronze square frame, no glow. Tasks 8-9 consume both.

- [ ] **Step 1: Implement the helpers** (assets.js, after Assets.icon):

```js
  // Benediction tier frame + glow around a baked 12px icon at (x, y) center.
  // Boon I: thin element frame. Boon II: double frame + soft glow.
  // Duo: split two-tone frame + glow. Legendary: gold + corner studs + pulse.
  Assets.tierFrame = function (ctx, x, y, d, rank, scale, t) {
    const s = Math.round((scale || 1) * (JH.ICONS.size + 4)) / 2;  // half-extent
    const el = d.element || (d.needs && d.needs[0]) || "water";
    const c1 = JH.SIGIL_COLORS[el] || "#ffd23f";
    const c2 = d.needs ? (JH.SIGIL_COLORS[d.needs[1]] || c1) : c1;
    ctx.save();
    const glow = d.kind === "legendary" ? 0.5 + 0.2 * Math.sin((t || 0) * 3)
               : d.kind === "duo" ? 0.35 : rank >= 2 ? 0.3 : 0;
    if (glow > 0) {
      const g = ctx.createRadialGradient(x, y, s * 0.4, x, y, s * 2.1);
      const gc = d.kind === "legendary" ? "255,210,63" : hexRgb(c1);
      g.addColorStop(0, "rgba(" + gc + "," + glow.toFixed(3) + ")");
      g.addColorStop(1, "rgba(" + gc + ",0)");
      ctx.fillStyle = g; ctx.fillRect(x - s * 2.1, y - s * 2.1, s * 4.2, s * 4.2);
    }
    ctx.lineWidth = 1;
    if (d.kind === "duo") {
      ctx.strokeStyle = c1; ctx.strokeRect(x - s, y - s, s, s * 2);
      ctx.strokeStyle = c2; ctx.strokeRect(x, y - s, s, s * 2);
    } else if (d.kind === "legendary") {
      ctx.strokeStyle = "#ffd23f"; ctx.strokeRect(x - s, y - s, s * 2, s * 2);
      ctx.fillStyle = "#fff7c2";
      [[-s, -s], [s - 1, -s], [-s, s - 1], [s - 1, s - 1]].forEach(([dx, dy]) =>
        ctx.fillRect(x + dx, y + dy, 2, 2));
    } else {
      ctx.strokeStyle = c1; ctx.strokeRect(x - s, y - s, s * 2, s * 2);
      if (rank >= 2) ctx.strokeRect(x - s - 2, y - s - 2, s * 2 + 4, s * 2 + 4);
    }
    ctx.restore();
  };
  // hexRgb helper: "#6cd3ff" -> "108,211,255" (add above tierFrame).
  function hexRgb(h) {
    return parseInt(h.slice(1, 3), 16) + "," + parseInt(h.slice(3, 5), 16) + "," + parseInt(h.slice(5, 7), 16);
  }

  // Relic gear frame: uniform steel square with bronze corners, no glow.
  Assets.gearFrame = function (ctx, x, y, scale) {
    const s = Math.round((scale || 1) * (JH.ICONS.size + 4)) / 2;
    ctx.save();
    ctx.lineWidth = 1; ctx.strokeStyle = "#8fa8c8";
    ctx.strokeRect(x - s, y - s, s * 2, s * 2);
    ctx.fillStyle = "#b08a5c";
    [[-s, -s], [s - 1, -s], [-s, s - 1], [s - 1, s - 1]].forEach(([dx, dy]) =>
      ctx.fillRect(x + dx, y + dy, 1, 1));
    ctx.restore();
  };
```

- [ ] **Step 2: Sigil swap** (entities.js Sigil.draw): replace `Assets.icon(ctx, "el_" + this.element, sx, sy, 1)` with `Assets.icon(ctx, "bene_" + this.offer.id, sx, sy, 1)` (keep the diamond fallback). Replace the two `frame_duo`/`frame_legendary` blocks (~2713-2725 and ~2729-2736) with a single call `Assets.tierFrame(ctx, sx, sy, d, this.offer.deepen ? 2 : 1, 1.1, this.t);` placed after the icon draw (delete both fallback ring blocks — tierFrame needs no streaming fallback, it's procedural). Keep verbMark and the II/deepen text.
- [ ] **Step 3:** Remove the two frame keys from ICONS.keys, `git rm sprites/icons/frame_duo.png sprites/icons/frame_legendary.png`, and grep `frame_duo\|frame_legendary` across js/ — no references may remain.
- [ ] **Step 4:** `npm test` (icon-key test still green — it checks bene_ keys, not frames). Quick headless smoke (Task 10 does the full pass): boot, `devGotoRange()`, screenshot the benediction sigil rows — glyphs + frames render, no console errors.
- [ ] **Step 5:** Commit `feat(icons): runtime tier frames + gear frame; sigils show unique glyphs`.

---

### Task 8: Character panel — always-on block, Tab sheet with icons + relic grid

**Files:**
- Modify: `js/game.js` `drawStatPanel` (~2389-2484) and its call site (~2095)
- Test: none new (layout; Task 10 screenshots gate it)

**Interfaces:**
- Consumes: `Assets.icon`, `Assets.tierFrame`, `Assets.gearFrame`, `Benedictions.effectText`, `this.wrapText(str, 36, 4)`, `this.showStats`, `this.nearShop`, `this.elapsed` (pulse t).
- Produces: the panel render contract Task 10 screenshots: collapsed always in play; expanded via Tab.

- [ ] **Step 1: Call site** (~2095): change `if (this.state === "play" && (this.nearShop || this.showStats)) this.drawStatPanel(ctx);` to `if (this.state === "play") this.drawStatPanel(ctx);` — the panel now draws every play frame (collapsed by default).
- [ ] **Step 2: Rework drawStatPanel.** Keep the `rows` construction (drop the `["LV", …]` row — delete that line; the HUD top bar owns LV). Three modes derived at top:

```js
      const expanded = this.showStats;                 // Tab / gamepad Back
      const inlineDesc = expanded && !this.nearShop;   // descriptions unless the shop needs the space
      const named = expanded || this.nearShop;         // stat labels
```

  Layout: `const X = 10, Y = 30, ROW = 9; const W = inlineDesc ? 152 : named ? 74 : 46;`
  - Collapsed row render: icon at `X + 3` (`Assets.icon(ctx, ik, X + 3, y - 2, 0.5)`), value right-aligned at `X + W - 6`, NO label text.
  - Named row render: as today (icon + label + value).
  - Benediction section (expanded only): per boon — `Assets.icon(ctx, "bene_" + id, X + 8, by + 1, 1)` + `Assets.tierFrame(ctx, X + 8, by + 1, d, rank, 1, this.elapsed)`, name at `X + 18` in element color with the existing tag suffix, wrapped lines below at `X + 4` (`wrapText(effectText, 36, 4)`, 5px `#8090a4`, 6px leading). Row advance: `by += 14 + lines.length * 6 + 2` (12px icon needs the taller row).
  - Relic section (expanded only, after benedictions): header `RELICS` in `#667788` 5px; grid of owned relic icons — `ids = Object.keys(this.relics || {})`, 9 per row, cell 16px: `Assets.icon(ctx, id, gx, gy, 1)` + `Assets.gearFrame(ctx, gx, gy, 1)`. Height contribution `12 + Math.ceil(ids.length / 9) * 16`.
  - Height `H` sums: named/collapsed rows block + (expanded ? bene section (14 + lines*6 + 2 each, or 12 for the "no benedictions yet" hint) + relic section (0 when no relics) : 0). EVERY section contributes to H before the backdrop `fillRect` — nothing may draw below `Y - 10 + H`.
- [ ] **Step 3:** `npm test` (suite must stay green — panel has no unit tests but game.js must still parse: `node -e "new Function(require('fs').readFileSync('js/game.js','utf8'))"`).
- [ ] **Step 4:** Headless smoke: boot → play → screenshot (collapsed block visible, ~46px, icons + numbers only); Tab → screenshot (names + benedictions with framed icons + relic grid); grant relics via `game.relics = { censer: true, hydro_lance: true }` page-eval before the Tab shot.
- [ ] **Step 5:** Commit `feat(panel): always-on stat block; Tab expands to full character sheet with icon tiers + relic grid`.

---

### Task 9: Shop rework — bigger rows, relic slot wheel, kibble card

**Files:**
- Modify: `js/game.js`: `spawnVendor` (add spin state), `shopSelectables` (~2350-2355), shop confirm/nav input block (~1619-1660), `drawShop` (~2520-2734)
- Test: `tests/relics.test.js` (selectables shape — see Step 1)

**Interfaces:**
- Consumes: `buyRelic(id)`, `buyKibble()`, `Assets.icon/gearFrame`, `this.relicStock`, `JH.KIBBLE_PACK`.
- Produces: `shopSelectables()` returns wheel entries as `{ kind: "wheel", slot: 0..3 }` (slots 0-2 = relicStock indices, slot 3 = kibble); `this.wheelSpinT` (seconds since vendor spawn, drives the reel animation); `this.shopWheelSlot` (0-3 cursor within the wheel row).

- [ ] **Step 1: Failing test** (selectables contract — testable with the makeThinkGame stub pattern from tests/entities.test.js; if that proves too heavy, extract `JH.Balance.shopWheelEntries(relicStock)` pure and test that):

```js
test("wheel entries: three stock slots + fixed kibble slot", () => {
  const entries = JH.Balance.shopWheelEntries(["censer", "punch_card"]);
  assert.deepStrictEqual(entries, [
    { kind: "wheel", slot: 0, id: "censer" },
    { kind: "wheel", slot: 1, id: "punch_card" },
    { kind: "wheel", slot: 2, id: null },          // exhausted stock renders empty
    { kind: "wheel", slot: 3, id: "kibble" },
  ]);
});
```

- [ ] **Step 2:** FAIL → **Step 3: Implement.**
  - balance.js: `shopWheelEntries(stock) { const out = []; for (let i = 0; i < 3; i++) out.push({ kind: "wheel", slot: i, id: (stock && stock[i]) || null }); out.push({ kind: "wheel", slot: 3, id: "kibble" }); return out; }`
  - `spawnVendor`: add `this.wheelSpinT = 0;` (ticked `+= dt` in the shop update block); keep the stock roll as in Task 2.
  - `shopSelectables`: replace the relic push with ONE entry `out.push({ kind: "wheelRow" });` — the vertical cursor treats the wheel as a single row; `this.shopWheelSlot` (init 0 in startGame + spawnVendor) picks the card.
  - Input block: when the cursor is on the wheelRow entry, ←→ move `this.shopWheelSlot = Math.max(0, Math.min(3, slot ± 1))` (use `input.pressed("left"/"right")`); confirm dispatches: slot 3 → `this.buyKibble()`, slot 0-2 with non-null id → `this.buyRelic(id)`, null id → deny sound. Keep the voucher/float feedback path identical to other buys.
  - `drawShop`: rows list — `IROW` 11 → 14; consumable/rep/node rows draw `Assets.icon(ctx, iconKey, PX + 10, ry + 5, 1)` (full 12px; existing icon-key mapping at ~2639 already resolves relic/consumable keys — reuse it). Replace the RELICS header + per-relic rows with one `{ t: "wheel" }` row of height 34. Its renderer draws 4 cards, card width 44, gap 3, starting `PX + 6`:

```js
        if (r.t === "wheel") {
          const entries = JH.Balance.shopWheelEntries(this.relicStock);
          entries.forEach((en, i) => {
            const cx = PX + 6 + i * 47, cy = ry + 2, focused = isCurRow(r) && this.shopWheelSlot === i;
            ctx.fillStyle = focused ? "rgba(255,210,63,0.14)" : "rgba(20,28,44,0.9)";
            ctx.fillRect(cx, cy, 44, 30);
            ctx.strokeStyle = focused ? "#ffd23f" : "#2a3550"; ctx.strokeRect(cx, cy, 44, 30);
            // Reel spin: for slots 0-2, before this reel's settle time show a
            // cycling icon instead of the real one (staggered left->right).
            const settle = 0.6 + i * 0.3;
            let iconKey = en.id === "kibble" ? "hp" /* placeholder key; see kibble icon note */ : en.id;
            let label, price;
            if (en.id === "kibble") { label = "KIBBLE PACK"; price = this.priceOf(JH.KIBBLE_PACK.cost); }
            else if (en.id) { const rd = JH.RELICS.find((x) => x.id === en.id); label = rd.name.toUpperCase(); price = this.priceOf(rd.cost); }
            else { label = this.relics && Object.keys(this.relics).length ? "SOLD" : "—"; price = null; }
            if (i < 3 && this.wheelSpinT < settle && en.id) {
              const pool = JH.RELICS; iconKey = pool[Math.floor(this.wheelSpinT * 14 + i * 3) % pool.length].id;
              label = "· · ·"; price = null;
            }
            if (iconKey) { Assets.icon(ctx, iconKey, cx + 22, cy + 10, 1); Assets.gearFrame(ctx, cx + 22, cy + 10, 1); }
            ctx.font = "5px monospace"; ctx.textAlign = "center"; ctx.fillStyle = en.id ? "#dfe8f5" : "#556070";
            ctx.fillText(label.slice(0, 12), cx + 22, cy + 23);
            if (price != null) { ctx.fillStyle = this.player.suds >= price ? "#ffd23f" : "#775533"; ctx.fillText(price + "", cx + 22, cy + 29); }
          });
          ctx.textAlign = "left";
          return;
        }
```

    Play a `"coin"` pitch-stepped SFX once as each reel settles (track `this._wheelSettled = [false,false,false]`, compare `wheelSpinT` to each settle time in the shop update block).
  - **Kibble icon note:** bake a `kibble` key into the icon atlas in this task (one more glyph in `tools/bene-icon-sprites.mjs` or a tiny addition to `tools/icon-sprites.mjs` BAKERS — a kibble bowl, WOOD + STEEL palette) and use `iconKey = "kibble"`; add `"kibble"` to ICONS.keys.
  - Description panel (~2703-2725): when the cursor is on the wheel row, desc = focused card's relic `.desc` / `"25 HP over 6s. Stacks."` for kibble / `""` for empty.
  - Delete the old `{ t: "relic" }` row renderer and its isCurRow clause; `cur.kind === "relic"` handling in the confirm block is replaced by the wheel dispatch.
- [ ] **Step 4:** `npm test` → pass; parse-check game.js.
- [ ] **Step 5:** Commit `feat(shop): relic slot wheel with spin-in + fixed kibble pack card, 12px item icons`.

---

### Task 10: Headless verification + ledger close + STOP

**Files:**
- Create: driver script in the session scratchpad (not committed)
- Modify: `.superpowers/sdd/progress.md` (ledger)

- [ ] **Step 1:** Full suite: `npm test` → all pass, count recorded.
- [ ] **Step 2:** Headless run (headless-playtest skill, msedge channel; TELEMETRY SPY FIRST):
  1. Boot → dev range: benediction sigil rows show unique glyphs + tier frames (screenshot).
  2. Play state: collapsed stat block always visible (screenshot); Tab → full sheet with framed benedictions (grant `split_stream:2, steam_sermon:1, standing_stone:1` + `ash_walk:2` worst-case text) + relic grid (grant 4 relics incl. an ex-signature) (screenshot).
  3. Vendor: wheel spin frames at t≈0.2/0.5/1.0 (3 screenshots); ←→ card focus; buy a relic card → suds drop + SOLD state; buy kibble twice → `kibbleTimer` ≈ 12, suds −60; buy Hydro Lance (force-stock it via page-eval at actLevel ≥ 0) → `player.stats.sprayDamage` +18 and `beam` 3.
  4. Overcharge locked at wave 1 ("Unlocks after the first boss" row), unlocked after page-eval `JH.Upgrades.currentActLevel = 0`.
  5. Reliquary: grant boons, kill Jon, enter church → station shows "redeem all: 1✝"; redeem → boons restored, essence −1; die again, station shows 2✝ (screenshots).
  6. Brass Nozzle: dev-range dummy — damage rate with/without nozzle differs by `RELIC_TUNE.brassNozzleAdd * dmgScale` on the primary only (assert via dummy hp deltas over a fixed spray window).
  7. Zero pageerrors (known sprites/church 404 noise excluded).
- [ ] **Step 3:** Read every screenshot; fix what reads wrong; re-run.
- [ ] **Step 4:** Update `.superpowers/sdd/progress.md` with the pass ledger; final entry: **STOP — awaiting user playtest on branch `shop-relics-pass`; release ritual (minor, "Rummage Sale") only on their word.**

---

## Self-Review Notes

- Spec coverage: §1a→Tasks 1-2, §1b→Task 3, §1c→Task 4, §1d→Tasks 5+9, §2a→Task 6, §2b→Task 7, §2c→Task 8, §2d→Task 9, testing→each task + Task 10. Future-work items are recorded in the spec, not planned here.
- Signature migration wipes nothing mid-run: relics and Upgrades.owned are both per-run state; no save data exists.
- `sig_dash/sig_marshal/sig_lance` ids die with NODES; new relic ids are `hydro_dash/fire_marshal/hydro_lance` — Task 1 Step 4 greps tests for the old ids.
- Icon glyph artistry is deliberately delegated to the implementer within the motif table + 3 reference glyphs + contact-sheet review gate (visual work can't be pre-written as exact rects honestly).
