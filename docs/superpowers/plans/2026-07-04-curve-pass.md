# v0.26.0 Curve Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the whole game harder and more legible — attack tickets + bigger waves, seven super-elites with signature moves, stalker/fuse base reworks, scaling-leak fixes, light economy gating, the essence-cross event, first-death pity, and a slim stat panel — per `docs/superpowers/specs/2026-07-04-curve-pass-design.md`.

**Architecture:** All new balance math goes into `js/balance.js` as pure functions (dual browser/node export, unit-tested via `node --test`). Behavior changes live in the existing enemy classes in `js/entities.js` branching on `this.superElite`; data changes in `js/config.js`; orchestration (tickets, dim overlay, boss HP, drops) in `js/game.js`. No new files except tests. Super-elites reuse existing `elite_` baked sprites at 1.8x runtime draw scale — **no sprite regeneration** except the furnace heat fix (Task 15, furnace only).

**Tech Stack:** Vanilla JS (IIFE modules on the `JH` global), HTML5 canvas, `node --test` for tests, `npm run dev` (serve on :5173) for smoke testing.

## Global Constraints

- **NEVER re-run sprite bakers over hand-cleaned art**: `sprites/mook/*` (all) and `sprites/fuse/walk0-3.png` are hand-cleaned. Task 15 bakes furnace ONLY, via a new type filter.
- **Comments state behavioral/mechanical facts only** — no design lore in source (CLAUDE.md rule). Design intent goes in commit messages.
- **Playtest gate**: this branch does NOT merge until the user playtests. The final task ends at "ready for playtest", not release.
- Every commit message ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Run tests with `npm test` from the repo root (Windows; PowerShell or Git Bash both fine). Baseline before this plan: 129 passing.
- Numbers marked *(tunable)* are playtest defaults — implement exactly as written; tuning happens at the playtest gate.

## Test-file conventions

- `tests/balance.test.js` requires `../js/balance.js` directly (pure module).
- `tests/entities.test.js` boots a `window` stub then requires `config.js`, stubs `JH.Loader`, requires `world.js`, `upgrades.js`, `entities.js` (that exact order). Real `JH.Enemy` / `JH.Player` / `JH.makeEnemy` instances work. Follow its existing `makePlayer()` and `makeBallGame()` stub patterns.

---

### Task 1: Balance primitives — powerCount, bossHpScale, superEliteDef, ticketBudget, eliteScale cap

**Files:**
- Modify: `js/balance.js` (add 4 functions; change 1 line in `eliteScale`)
- Test: `tests/balance.test.js` (append)

**Interfaces:**
- Produces: `Balance.powerCount(ownedMap, repCountMap, churchState) -> int`
- Produces: `Balance.bossHpScale(baseHp, ownedCount) -> int`
- Produces: `Balance.superEliteDef(def) -> def` (scaled clone; never mutates input)
- Produces: `Balance.ticketBudget(actLevel, budgets) -> int`
- Changes: `Balance.eliteScale` power cap 15 → 24 (signature unchanged)

- [ ] **Step 1: Write the failing tests** — append to `tests/balance.test.js`:

```js
test("powerCount = nodes + repeatable buys + total Mirror ranks", () => {
  const owned = { pw1: true, tk1: true, vt1: true };                       // 3 nodes
  const reps = { ov_dmg: 4, ov_hp: 2 };                                    // 6 buys
  const church = { mirror: { water_vigor: { side: "b", rank: 3 }, earth_stance: { side: "a", rank: 2 } } }; // 5 ranks
  assert.strictEqual(Balance.powerCount(owned, reps, church), 14);
  assert.strictEqual(Balance.powerCount({}, {}, null), 0);
  assert.strictEqual(Balance.powerCount(null, null, undefined), 0);
});

test("eliteScale power term now caps at 24, not 15", () => {
  const at15 = Balance.eliteScale(2, 15);
  const at24 = Balance.eliteScale(2, 24);
  assert.ok(at24.hp > at15.hp);                       // 15 is no longer the ceiling
  assert.deepStrictEqual(Balance.eliteScale(2, 24), Balance.eliteScale(2, 99)); // 24 is
});

test("bossHpScale: +2% base HP per owned power point", () => {
  assert.strictEqual(Balance.bossHpScale(1000, 0), 1000);
  assert.strictEqual(Balance.bossHpScale(1000, 10), 1200);
  assert.strictEqual(Balance.bossHpScale(620, 24), Math.round(620 * 1.48));
});

test("superEliteDef: 7x hp, 2x damage fields, 0.85x speed, 4x suds, 1.6x body — input untouched", () => {
  const base = { hp: 40, speed: 46, touchDmg: 8, meleeDmg: 10, suds: 5, bodyW: 16, bodyH: 28 };
  const d = Balance.superEliteDef(base);
  assert.strictEqual(d.hp, 280);
  assert.strictEqual(d.touchDmg, 16);
  assert.strictEqual(d.meleeDmg, 20);
  assert.strictEqual(d.speed, Math.round(46 * 0.85));
  assert.strictEqual(d.suds, 20);
  assert.strictEqual(d.bodyW, Math.round(16 * 1.6));
  assert.strictEqual(base.hp, 40);                     // clone, not mutation
});

test("ticketBudget indexes budgets by actLevel+1 and clamps", () => {
  const B = [4, 4, 5, 5, 6];
  assert.strictEqual(Balance.ticketBudget(-1, B), 4);  // Act 1
  assert.strictEqual(Balance.ticketBudget(1, B), 5);   // Act 3
  assert.strictEqual(Balance.ticketBudget(3, B), 6);   // Act 5 (fire)
  assert.strictEqual(Balance.ticketBudget(9, B), 6);   // clamped high
});
```

- [ ] **Step 2: Run to verify they fail** — `npm test` → the 5 new tests FAIL (`powerCount is not a function`, etc.). Existing 129 still pass.

- [ ] **Step 3: Implement.** In `js/balance.js`, change the cap in `eliteScale` (line 23):

```js
      const power = 1 + 0.03 * Math.min(ownedCount || 0, 24);
```

Add to the `Balance` object (after `eliteScale`):

```js
    // Total player-power count fed to eliteScale/bossHpScale: one-time nodes
    // + repeatable Overcharge buys + total Mirror ranks. All sources of
    // permanent stat growth count, so the enemy ramp can see them.
    powerCount(owned, repCount, churchState) {
      let n = Object.keys(owned || {}).length;
      const rc = repCount || {};
      for (const k in rc) n += rc[k] || 0;
      const m = (churchState && churchState.mirror) || {};
      for (const k in m) n += (m[k] && m[k].rank) || 0;
      return n;
    },

    // Boss HP at spawn scales with player power (same count as eliteScale).
    bossHpScale(baseHp, ownedCount) {
      return Math.round(baseHp * (1 + 0.02 * (ownedCount || 0)));
    },

    // Super-elite def: scaled clone of a regular def. Runtime draw scale
    // (1.8x) is applied at draw time, not here — body box grows less (1.6x)
    // so the hitbox stays a touch inside the sprite.
    superEliteDef(def) {
      const d = Object.assign({}, def);
      d.hp = Math.round(d.hp * 7);
      d.touchDmg = Math.round(d.touchDmg * 2);
      if (d.meleeDmg)  d.meleeDmg  = Math.round(d.meleeDmg * 2);
      if (d.chargeDmg) d.chargeDmg = Math.round(d.chargeDmg * 2);
      if (d.emberDmg)  d.emberDmg  = Math.round(d.emberDmg * 2);
      if (d.strikeDmg) d.strikeDmg = Math.round(d.strikeDmg * 2);
      if (d.slamDmg)   d.slamDmg   = Math.round(d.slamDmg * 2);
      if (d.speed)     d.speed     = Math.round(d.speed * 0.85);
      d.suds = Math.round((d.suds || 0) * 4);
      d.bodyW = Math.round(d.bodyW * 1.6);
      d.bodyH = Math.round(d.bodyH * 1.6);
      return d;
    },

    // Attack-ticket budget per act; budgets indexed actLevel+1 (like
    // SPRINKLE.counts), clamped to the last entry.
    ticketBudget(actLevel, budgets) {
      const i = Math.max(0, Math.min(budgets.length - 1, (actLevel | 0) + 1));
      return budgets[i];
    },
```

- [ ] **Step 4: Run tests** — `npm test` → all pass (129 + 5).
- [ ] **Step 5: Commit** — `git add js/balance.js tests/balance.test.js && git commit -m "feat(balance): powerCount, bossHpScale, superEliteDef, ticketBudget; eliteScale cap 24"`

---

### Task 2: Wire powerCount into every eliteScale callsite + boss HP scaling

**Files:**
- Modify: `js/game.js:405` (spawnWave), `js/game.js:1246-1248` (wall reinforcements), `js/game.js:1261-1263` (holdout reinforcements), `js/game.js:699-708` (spawnEnemy)

**Interfaces:**
- Consumes: `Balance.powerCount`, `Balance.bossHpScale` (Task 1)
- Produces: every `eliteScale(...)` call receives the full power count; every `e.isBoss` spawn has scaled `hp`/`maxHp`.

- [ ] **Step 1: spawnWave (game.js:405).** Replace

```js
        const ownedCount = Object.keys(JH.Upgrades.owned).length;
```

with

```js
        const ownedCount = JH.Balance.powerCount(
          JH.Upgrades.owned, JH.Upgrades.repCount, JH.Church && JH.Church.state);
```

- [ ] **Step 2: Wall + holdout reinforcements (game.js:1247 and :1262).** Both lines read
`Object.keys(JH.Upgrades.owned).length` inside a `JH.Balance.eliteScale(...)` call — replace that argument with the same `JH.Balance.powerCount(JH.Upgrades.owned, JH.Upgrades.repCount, JH.Church && JH.Church.state)` expression (both places).

- [ ] **Step 3: Boss HP. In `spawnEnemy` (game.js:699)**, after the `opts` block and before `this.enemies.push(e)`:

```js
      // Boss HP respects player power: a maxed build sees all the phases
      // instead of deleting them.
      if (e.isBoss) {
        const pc = JH.Balance.powerCount(
          JH.Upgrades.owned, JH.Upgrades.repCount, JH.Church && JH.Church.state);
        e.hp = e.maxHp = JH.Balance.bossHpScale(e.maxHp, pc);
      }
```

- [ ] **Step 4: Verify** — `npm test` (all pass; this is wiring of tested functions). Then launch `npm run dev`, Backquote → dev menu → Enter on a `tough` wave (e.g. WAVE 5) — elites spawn, no console errors.
- [ ] **Step 5: Commit** — `git commit -am "feat(scaling): enemy ramp counts repeatables + Mirror ranks; boss HP scales with power"`

---

### Task 3: Player-side scaling fixes — vamp 5% base, half-rate vs elites, dodge cap

**Files:**
- Modify: `js/upgrades.js:74-76` (vt3), `js/upgrades.js:125-140` (computeStats), `js/entities.js:548` (vampiric half-rate)
- Test: `tests/entities.test.js` (append)

**Interfaces:**
- Produces: `computeStats(...)` result always has `dodgeChance <= 0.25`.
- Produces: vampiric heal factor is 0.5 when target `isBoss || elite || superElite`.

- [ ] **Step 1: Failing test** — append to `tests/entities.test.js`:

```js
test("computeStats caps dodgeChance at 25%", () => {
  JH.Upgrades.reset();
  // Force an over-cap contribution through a repeatable-free path: fake a
  // Mirror application by monkey-patching (Mirror isn't loaded in tests).
  global.window.JH.Mirror = { apply: (s) => { s.dodgeChance = 0.4; } };
  global.window.JH.Church = { state: {} };
  const s = JH.Upgrades.computeStats({});
  assert.ok(s.dodgeChance <= 0.25, "dodge capped, got " + s.dodgeChance);
  delete global.window.JH.Mirror; delete global.window.JH.Church;
});

test("Vampiric Hose (vt3) grants 5% lifesteal", () => {
  JH.Upgrades.reset();
  const s = JH.Upgrades.computeStats({ vt1: true, vt2: true, vt3: true });
  assert.ok(Math.abs(s.vampiricRate - 0.05) < 1e-9);
});
```

- [ ] **Step 2: Run to verify both FAIL** (`vampiricRate` is 0.10; no cap exists).
- [ ] **Step 3: Implement.**
  - `js/upgrades.js` vt3 node: `desc: "Heal 5% of spray damage dealt."` and `apply: (s) => { s.vampiricRate += 0.05; }`.
  - `js/upgrades.js` `computeStats`: after the `JH.Mirror.apply(...)` block, before `return s;`:

```js
      // Hard cap: dodge never exceeds 25% no matter which sources stack.
      s.dodgeChance = Math.min(s.dodgeChance, 0.25);
```

  - `js/entities.js:548`: replace `(e.isBoss ? 0.5 : 1)` with `((e.isBoss || e.elite || e.superElite) ? 0.5 : 1)` and update the comment above it to say bosses **and elites** (their HP pools also gave sustain near-permanent uptime).
- [ ] **Step 4: Run tests** — all pass.
- [ ] **Step 5: Commit** — `git commit -am "feat(scaling): vamp base 5% + half-rate vs elites; dodge capped at 25%"`

---

### Task 4: Economy — tier-3 act gate (Act 2+) and +20% tier-3 prices

**Files:**
- Modify: `js/upgrades.js` (prices, `currentActLevel`, `isAvailable`), `js/game.js` `spawnWave` + `respawnFromChurch` (set the act level)
- Test: `tests/entities.test.js` (append — upgrades.js is loaded there)

**Interfaces:**
- Produces: `JH.Upgrades.currentActLevel` (int, -1 default) — game sets it whenever `waveIndex` changes; `isAvailable(id)` returns false for `tier >= 3` nodes while `currentActLevel < 1`.

- [ ] **Step 1: Failing test:**

```js
test("tier-3 nodes are act-gated: locked before Act 2, available from Act 2", () => {
  JH.Upgrades.reset();
  JH.Upgrades.owned = { pw1: true, pw2: true };
  JH.Upgrades.currentActLevel = -1;                     // Act 1
  assert.strictEqual(JH.Upgrades.isAvailable("pw3"), false);
  JH.Upgrades.currentActLevel = 1;                      // Act 3 (>= Act 2 gate)
  assert.strictEqual(JH.Upgrades.isAvailable("pw3"), true);
  JH.Upgrades.reset(); JH.Upgrades.currentActLevel = -1;
});
```

- [ ] **Step 2: Run — FAILS** (available in Act 1 today).
- [ ] **Step 3: Implement.**
  - Prices (+20%, rounded): `pw3` 140→168, `rc3` 140→168, `tk3` 95→114, `mb3` 110→132, `vt3` 120→144.
  - In the `Upgrades` object literal add `currentActLevel: -1,` next to `owned: {}`.
  - `isAvailable(id)`:

```js
    isAvailable(id) {
      const n = this.byId(id);
      if (this.owned[id]) return false;
      // Tier-3 nodes unlock from Act 2 (actLevel >= 1): the build finishes
      // against the hard content, not before it.
      if (n.tier >= 3 && this.currentActLevel < 1) return false;
      return n.req.every((r) => this.owned[r]);
    },
```

  - `js/game.js`: first line inside `spawnWave()` add
    `JH.Upgrades.currentActLevel = JH.Balance.actLevelForWave(this.waveIndex, JH.ACT_STARTS);`
    and in `respawnFromChurch()` after `this.waveIndex = next - 1;` add
    `JH.Upgrades.currentActLevel = JH.Balance.actLevelForWave(next, JH.ACT_STARTS);`
    Also in the game's run-start reset (the function that sets `this.waveIndex = -1`/0 at `startGame` — search `waveIndex = ` in game.js init), reset `JH.Upgrades.currentActLevel = -1;`.
- [ ] **Step 4: Run tests; then dev-server check**: fresh run → shop before wave 3 shows tier-3 nodes 🔒-locked even with prereqs owned.
- [ ] **Step 5: Commit** — `git commit -am "feat(economy): tier-3 nodes act-gated to Act 2+ and priced +20%"`

---

### Task 5: Attack tickets

**Files:**
- Modify: `js/config.js` (add `JH.TICKETS`), `js/game.js` (canAttack helper), `js/entities.js` (mook/charger/stalker gates)
- Test: `tests/entities.test.js` (append)

**Interfaces:**
- Produces: `game.canAttack() -> bool` — true while ticketed attackers < act budget.
- Produces: `enemy.usingTicket` (bool) — true from windup start until the attack resolves. Set/cleared ONLY by mook (base `Enemy.think`), `Charger`, `Stalker`. Pyro/smelt/bulwark/fuse/bosses never ticket (ranged cadence and set-piece patterns are exempt in v1).

- [ ] **Step 1: config.js** — after `JH.WAVECAP`:

```js
  // Attack tickets: max enemies simultaneously in a melee windup/attack,
  // indexed by actLevel+1 (like SPRINKLE.counts). Readability cap, not a
  // mercy rule — ticketless melee enemies hold at approach range instead.
  JH.TICKETS = { budgets: [4, 4, 5, 5, 6] };
```

- [ ] **Step 2: Failing test:**

```js
// Minimal game stub for enemy think() tests.
function makeThinkGame(px, py) {
  return {
    player: Object.assign(makePlayer(), { x: px, y: py }),
    enemies: [], embers: [], particles: [], firePatches: [], shields: [],
    bounds: { minX: 0, maxX: 480 },
    audio: { play() {} }, shake() {}, hitStop() {}, defer() {},
    killJuice() {}, dropLoot() {}, onEnemyKilled() {}, spawnEnemy() {},
    canAttack() { return this._tickets !== false; }, _tickets: true,
  };
}

test("mook holds its windup when no attack ticket is free", () => {
  const g = makeThinkGame(60, 40);
  const m = new JH.Enemy("mook", 62, 40);           // inside meleeRange (20)
  m.spawnGrace = 0;
  g._tickets = false;
  m.think(1 / 60, g);
  assert.strictEqual(m.windTimer, 0, "no windup without a ticket");
  assert.notStrictEqual(m.state, "wind");
  g._tickets = true;
  m.think(1 / 60, g);
  assert.ok(m.windTimer > 0, "winds up once a ticket frees");
  assert.strictEqual(m.usingTicket, true);
});
```

- [ ] **Step 3: Run — FAILS** (mook winds up regardless; `usingTicket` undefined).
- [ ] **Step 4: Implement.**
  - `js/entities.js` `Enemy` constructor: add `this.usingTicket = false;` next to `this.windTimer = 0;`.
  - `js/game.js` — add methods next to `separate()`:

```js
    // Attack tickets: cap simultaneous melee windups so crowds stay readable
    // even at the bigger wave sizes. Enemies flag usingTicket during their
    // windup/attack; the count is live (dead enemies drop out via the flag
    // check in their own think/die paths going quiet).
    canAttack() {
      let used = 0;
      for (const e of this.enemies) if (!e.dead && e.usingTicket) used++;
      const act = JH.Balance.actLevelForWave(this.waveIndex, JH.ACT_STARTS);
      return used < JH.Balance.ticketBudget(act, JH.TICKETS.budgets);
    },
```

  - Mook (base `Enemy.think`, entities.js ~948): windup trigger becomes

```js
      if (dist < d.meleeRange && this.spawnGrace <= 0 && game.canAttack()) {
        this.windTimer = d.meleeWind; this.windDur = d.meleeWind; this.state = "wind";
        this.usingTicket = true;
      } else if (dist > 12) {
```

  and in the windup-resolve block (`if (this.windTimer <= 0) {` inside `if (this.windTimer > 0)`), add `this.usingTicket = false;` next to `this.cdTimer = 0.6;`.
  - Charger (`Charger.think`): the windup trigger at `if (Math.abs(dy) < 14 && dist < 170 && this.spawnGrace <= 0)` gains `&& game.canAttack()`, sets `this.usingTicket = true;`; the charge-end line `if (this.attackTimer <= 0) { this.state = "idle"; this.cdTimer = d.chargeCd; }` gains `this.usingTicket = false;`.
  - Stalker (`Stalker.think`): the blink trigger `this.windTimer = d.blinkTell; this.state = "wind";` is gated by `game.canAttack()` (if no ticket, fall through to the chase code below — it already runs after the cooldown branch), sets `this.usingTicket = true;`; the strike-resolve block (`this.state = "idle"; this.cdTimer = d.blinkCd;`) gains `this.usingTicket = false;`.
- [ ] **Step 5: Run tests** (all pass) **+ dev smoke**: dev menu → OVERRUN; visibly some enemies orbit while ≤budget attack.
- [ ] **Step 6: Commit** — `git commit -am "feat(combat): attack tickets — per-act cap on simultaneous melee windups"`

---

### Task 6: Bigger waves + super-elite placements (data only)

**Files:**
- Modify: `js/config.js` — `JH.LEVEL1.waves`, `JH.SPRINKLE.counts`, `JH.WAVECAP`

**Interfaces:**
- Produces: `wave.superElite: "<type>"` — optional field consumed by Task 7's `spawnWave` change.

- [ ] **Step 1: Replace the waves list** (keep boss/set-piece lines untouched except where shown) with the counts below — regulars up ~50% mid/late, one `superElite` per act *(all tunable)*:

```js
    waves: [
      { name: "WAVE 1", spawns: [{ type: "mook", count: 4 }] },
      { name: "WAVE 2", spawns: [{ type: "mook", count: 4 }, { type: "charger", count: 1 }] },
      { name: "WAVE 3", superElite: "mook", spawns: [{ type: "mook", count: 4 }, { type: "pyro", count: 1 }] },
      { name: "WAVE 4", spawns: [{ type: "mook", count: 3 }, { type: "charger", count: 2 }] },
      { name: "BOSS", boss: true },                          // mid-boss: The Big Drip
      // ---- Act 2: ELITE ----
      { name: "WAVE 5", tough: true, spawns: [{ type: "pyro", count: 3 }, { type: "charger", count: 2 }] },
      { name: "STREET SWARM", tough: true, superElite: "charger", spawns: [{ type: "mook", count: 6 }, { type: "charger", count: 2 }] },
      { name: "BARRICADE", wall: true, tough: true, wallHp: 360,
        spawns: [{ type: "mook", count: 3 }, { type: "charger", count: 2 }] },
      { name: "CROSSFIRE", tough: true, spawns: [{ type: "pyro", count: 3 }, { type: "mook", count: 4 }] },
      { name: "THE SWITCH", boss: true, bossType: "switch" },
      // ---- Act 3: the ruined district ----
      { name: "RUBBLE ROW", tough: true, superElite: "pyro", spawns: [{ type: "charger", count: 2 }, { type: "pyro", count: 2 }, { type: "mook", count: 4 }] },
      { name: "DEBRIS RUN", tough: true, spawns: [{ type: "charger", count: 3 }, { type: "mook", count: 4 }] },
      { name: "HOLD THE LINE", holdout: true, tough: true, holdDur: 22,
        spawns: [{ type: "mook", count: 3 }, { type: "pyro", count: 2 }, { type: "charger", count: 1 }] },
      { name: "ASH CHARGE", tough: true, spawns: [{ type: "charger", count: 3 }, { type: "pyro", count: 2 }, { type: "mook", count: 2 }] },
      { name: "LAST STAND", tough: true, spawns: [{ type: "pyro", count: 3 }, { type: "mook", count: 4 }, { type: "charger", count: 2 }] },
      { name: "QUAKE WALKER", boss: true, bossType: "quake" },
      // ---- Act 4: the aftermath ----
      { name: "THE BULWARK LINE", spawns: [{ type: "bulwark", count: 1 }, { type: "pyro", count: 4 }, { type: "mook", count: 2 }] },
      { name: "STALKER AMBUSH", superElite: "stalker", spawns: [{ type: "stalker", count: 3 }, { type: "charger", count: 1 }, { type: "mook", count: 2 }] },
      { name: "WAVE 6", tough: true, spawns: [{ type: "mook", count: 5 }, { type: "pyro", count: 2 }, { type: "charger", count: 2 }] },
      { name: "THE GARDEN", garden: true },
      { name: "WAVE 7", tough: true, superElite: "bulwark", spawns: [{ type: "charger", count: 3 }, { type: "pyro", count: 3 }, { type: "mook", count: 3 }] },
      { name: "OVERRUN", tough: true, spawns: [{ type: "mook", count: 6 }, { type: "charger", count: 2 }, { type: "pyro", count: 2 }] },
      { name: "GATEWAY KRUSHER 9000", boss: true, bossType: "gatewaykrusher" },
      // ---- Fire World (curated, un-tough) ----
      { name: "FIRE INTRO", spawns: [{ type: "fuse", count: 4 }, { type: "smelt", count: 1 }] },
      { name: "EMBER RUSH", superElite: "fuse", spawns: [{ type: "fuse", count: 5 }, { type: "smelt", count: 2 }] },
      { name: "DOUSE THE FLAMES", douse: true, spawns: [{ type: "smelt", count: 2 }] },
      { name: "FURNACE TRIAL", spawns: [{ type: "furnace", count: 1 }, { type: "fuse", count: 3 }] },
      { name: "MELTDOWN", superElite: "smelt", spawns: [{ type: "smelt", count: 2 }, { type: "fuse", count: 4 }] },
      { name: "THE SLAYER", boss: true, bossType: "slayer" },
    ],
```

- [ ] **Step 2:** `JH.WAVECAP = { charger: 3 };` and `JH.SPRINKLE.counts = [1, 2, 3, 3, 4];`
- [ ] **Step 3:** `npm test` (existing wave-independent tests still pass). The `superElite` field is inert until Task 7 — dev-smoke a couple of waves for size feel.
- [ ] **Step 4: Commit** — `git commit -am "feat(waves): bigger regular counts, sprinkle up, charger cap 3, super-elite placements"`

---

### Task 7: Super-elite core — makeSuper, spawn, draw treatment, drops

**Files:**
- Modify: `js/entities.js` (`Enemy.makeSuper`, `Enemy.draw` scale/label), `js/game.js` (`spawnEnemy` opts.super, `spawnWave` superElite spawn, `dropLoot` kibble)
- Test: `tests/entities.test.js` (append)

**Interfaces:**
- Consumes: `Balance.superEliteDef` (Task 1), `wave.superElite` (Task 6)
- Produces: `enemy.superElite` (bool), `enemy.makeSuper()`, `spawnEnemy(type, x, y, { super: true })`. **Every signature-move task (8–14) branches on `this.superElite`.**

- [ ] **Step 1: Failing test:**

```js
test("makeSuper: 7x hp, superElite + elite flags, def untouched globally", () => {
  const m = new JH.Enemy("mook", 0, 0);
  const baseHp = JH.ENEMIES.mook.hp;
  m.makeSuper();
  assert.strictEqual(m.superElite, true);
  assert.strictEqual(m.elite, true);          // reuses elite art/palette
  assert.strictEqual(m.maxHp, baseHp * 7);
  assert.strictEqual(JH.ENEMIES.mook.hp, baseHp);  // shared def not mutated
});
```

- [ ] **Step 2: Run — FAILS.**
- [ ] **Step 3: Implement.**
  - `js/entities.js`, after `makeElite`:

```js
    // Super-elite: rare apex tier above elites — huge stats + a signature
    // move (subclasses branch on this.superElite). Reuses the elite_ baked
    // frames at 1.8x draw scale.
    makeSuper() {
      this.superElite = true;
      this.elite = true;
      this.def = JH.Balance.superEliteDef(this.def);
      this.hp = this.maxHp = this.def.hp;
      this.bodyW = this.def.bodyW;
      this.bodyH = this.def.bodyH;
    }
```

  - `Enemy.draw` (entities.js:964-970): the scale line becomes
    `scale: this.superElite ? 1.8 : this.elite ? 1.08 : 1,`
    and after the existing hp-pip block append a name label + heavier bar for supers:

```js
      if (this.superElite) {
        const w = this.bodyW + 4;
        const by = Math.round(sy - this.bodyH - 8);
        ctx.fillStyle = "#f0b830";
        ctx.font = "bold 6px monospace"; ctx.textAlign = "center";
        ctx.fillText(this.def.name.toUpperCase(), Math.round(sx), by - 4);
        ctx.textAlign = "left";
      }
```

    (The elite gold bar frame already renders since `elite` is true; `bodyW` is 1.6x so the bar is visibly heavier.)
  - `js/game.js` `spawnEnemy` opts block: add `if (opts.super && e.makeSuper) e.makeSuper();` AFTER the `opts.elite` line (act ramp applies first, super multiplies on top).
  - `spawnWave` — after the `types.forEach(...)` loop, still inside the `else` (normal wave) branch:

```js
        // Rare apex: at most ONE super-elite, spawned by wave data.
        if (wave.superElite) {
          const ex = (Math.random() < 0.5) ? left + 24 : right - 24;
          const ey = JH.DEPTH_MIN + 10 + Math.random() * (depthSpan - 4);
          const se = this.spawnEnemy(wave.superElite, ex, ey,
            { elite: eliteScale, super: true });
          se.spawnGrace = 0.6;
        }
```

  - `dropLoot` (game.js:755): first line inside, add

```js
      // Super-elite kills pay: guaranteed kibble on top of their 4x suds.
      if (e.superElite) this.spawnPickup("health", e.x + 8, e.y, 25);
```

- [ ] **Step 4: Run tests + dev smoke** — dev menu → WAVE 3: one huge gold-labeled mook spawns; kill pays a kibble.
- [ ] **Step 5: Commit** — `git commit -am "feat(enemies): super-elite tier — 1.8x draw scale, labeled, guaranteed kibble"`

---

### Task 8: Super mook — lunging haymaker

**Files:**
- Modify: `js/entities.js` (base `Enemy.think`), `js/assets.js` (mook painter maps "lunge" pose)
- Test: `tests/entities.test.js` (append)

**Interfaces:**
- Consumes: `this.superElite` (Task 7), `game.canAttack` stub pattern (Task 5)
- Produces: state `"lunge"` on the mook.

- [ ] **Step 1: Failing test:**

```js
test("super mook windup resolves into a forward lunge, not a standing hit", () => {
  const g = makeThinkGame(120, 40);
  const m = new JH.Enemy("mook", 60, 40);
  m.makeSuper(); m.spawnGrace = 0; m.facing = 1;
  m.windTimer = 0.01; m.state = "wind";
  const x0 = m.x;
  m.think(0.02, g);                       // windup expires
  assert.strictEqual(m.state, "lunge");
  m.think(0.05, g);                       // lunging
  assert.ok(m.x > x0, "carries forward during the lunge");
});
```

- [ ] **Step 2: Run — FAILS** (state goes idle, no movement).
- [ ] **Step 3: Implement** in base `Enemy.think`. At the top, before the `if (this.windTimer > 0)` branch:

```js
      // Super mook: haymaker resolves as a forward LUNGE with a ground-shock
      // band on landing.
      if (this.state === "lunge") {
        this.attackTimer -= dt;
        this.x += this.facing * 380 * dt;
        if (!this.lungeHit && Geo.inHitArc(this, pl, this.facing, d.meleeRange + 14, 22)) {
          pl.takeHit(d.meleeDmg, game, this.x);
          this.lungeHit = true;
        }
        if (this.attackTimer <= 0) {
          game.shake(4); game.audio.play("whack");
          if (!this.lungeHit && Geo.inHitArc(this, pl, this.facing, d.meleeRange + 26, 26))
            pl.takeHit(Math.round(d.meleeDmg * 0.6), game, this.x);  // shock band
          this.state = "idle"; this.cdTimer = 0.9; this.usingTicket = false;
        }
        return;
      }
```

In the windup-resolve block, the hit branch becomes:

```js
        if (this.windTimer <= 0) {
          if (this.superElite) {
            this.state = "lunge"; this.attackTimer = 0.16; this.lungeHit = false;
            return;
          }
          if (Geo.inHitArc(this, pl, this.facing, d.meleeRange + 6, 16))
            pl.takeHit(d.meleeDmg, game, this.x);
          this.cdTimer = 0.6;
          this.usingTicket = false;
        }
```

(Note: super keeps its ticket through the lunge; released at lunge end above.)
  - `js/assets.js` mook painter pose fn: extend the wind branch —
    `(opt.state === "wind" || opt.wind) ? ... : opt.state === "lunge" ? (opt.elite ? "wind" : "wind4") : ...`
- [ ] **Step 4: Run tests + commit** — `git commit -am "feat(super-mook): lunging haymaker with ground-shock band"`

---

### Task 9: Super charger — diagonal ricochet charge

**Files:**
- Modify: `js/entities.js` (`Charger.think`, `Charger.prototype.draw`)
- Test: `tests/entities.test.js` (append)

- [ ] **Step 1: Failing test:**

```js
test("super charger ricochets off the arena x-bounds and keeps momentum", () => {
  const g = makeThinkGame(200, 80);
  const c = JH.makeEnemy("charger", 470, 40);
  c.makeSuper(); c.spawnGrace = 0;
  c.state = "charge"; c.attackTimer = 2;
  c.chargeVX = 200; c.chargeVY = 30; c.bounces = 3;
  c.think(0.1, g);                          // crosses maxX=480 → bounce
  assert.ok(c.chargeVX < 0, "x velocity reflected");
  assert.strictEqual(c.state, "charge", "still charging after bounce");
});
```

- [ ] **Step 2: Run — FAILS** (base charge path has no chargeVX).
- [ ] **Step 3: Implement** in `Charger.think`:
  - Charge state block becomes:

```js
      if (this.state === "charge") {
        this.attackTimer -= dt;
        if (this.superElite) {
          // Diagonal Slayer-style charge; ricochets off walls, keeps momentum.
          this.x += this.chargeVX * dt; this.y += this.chargeVY * dt;
          this.facing = this.chargeVX >= 0 ? 1 : -1;
          if ((this.x <= game.bounds.minX + 4 && this.chargeVX < 0) ||
              (this.x >= game.bounds.maxX - 4 && this.chargeVX > 0)) {
            if (--this.bounces < 0) this.attackTimer = 0;
            else { this.chargeVX = -this.chargeVX; game.audio.play("whack"); game.shake(3); }
          }
          if ((this.y <= JH.DEPTH_MIN + 2 && this.chargeVY < 0) ||
              (this.y >= JH.DEPTH_MAX - 2 && this.chargeVY > 0)) this.chargeVY = -this.chargeVY;
          if (this.chargeHitT > 0) this.chargeHitT -= dt;
          if ((this.chargeHitT || 0) <= 0 &&
              Math.hypot(pl.x - this.x, pl.y - this.y) < 18) {
            pl.takeHit(d.chargeDmg, game, this.x); this.chargeHitT = 0.6;
          }
        } else {
          this.x += this.facing * d.chargeSpeed * dt;
          if (Geo.inHitArc(this, pl, this.facing, 16, 18)) {
            pl.takeHit(d.chargeDmg, game, this.x); this.attackTimer = 0;
          }
        }
        if (this.attackTimer <= 0) { this.state = "idle"; this.cdTimer = d.chargeCd; this.usingTicket = false; }
        return;
      }
```

  - Windup-resolve gains the aim:

```js
        if (this.windTimer <= 0) {
          this.state = "charge";
          if (this.superElite) {
            const ang = Math.atan2(pl.y - this.y, pl.x - this.x);
            this.chargeVX = Math.cos(ang) * d.chargeSpeed;
            this.chargeVY = Math.sin(ang) * d.chargeSpeed * 0.6;
            this.bounces = 3; this.chargeHitT = 0;
            this.attackTimer = d.chargeDur * 2.5;
          } else this.attackTimer = d.chargeDur;
          game.audio.play("whack");
        }
```

  - Windup trigger: `if ((this.superElite ? dist < 210 : (Math.abs(dy) < 14 && dist < 170)) && this.spawnGrace <= 0 && game.canAttack())`.
  - Telegraph draw (`Charger.prototype.draw`): when `this.superElite && this.state === "wind"`, draw the flashing band rotated along the aim: wrap the existing rect in `ctx.translate(sx, sy); ctx.rotate(Math.atan2((game-less) aimY, aimX))` — since draw has no player ref, store the aim at windup start (`this.aimAng = ang` — compute the angle in think when the windup STARTS, updating each frame of windup: add `this.aimAng = Math.atan2(dy, dx);` in the windup branch) and rotate by `this.aimAng`, length `d.chargeSpeed * d.chargeDur * 2.5`.
- [ ] **Step 4: Run tests + dev smoke** (STREET SWARM) **+ commit** — `git commit -am "feat(super-charger): diagonal ricochet charge"`

---

### Task 10: Super pyro — triple lob, embers leave small patches

**Files:**
- Modify: `js/entities.js` (`Pyro.think`, `Ember`)
- Test: `tests/entities.test.js` (append)

- [ ] **Step 1: Failing test:**

```js
test("super pyro fires a 3-ember fan; embers carry a patch spec", () => {
  const g = makeThinkGame(150, 40);
  const p = JH.makeEnemy("pyro", 60, 40);
  p.makeSuper(); p.spawnGrace = 0;
  p.windTimer = 0.01; p.state = "wind";
  p.think(0.02, g);
  assert.strictEqual(g.embers.length, 3);
  assert.ok(g.embers.every((e) => e.patch && e.patch.r === 14));
});
```

- [ ] **Step 2: Run — FAILS** (1 ember, no patch field).
- [ ] **Step 3: Implement.**
  - `Ember` constructor gains an options tail: `constructor(x, y, z, vx, vy, dmg, opts)` → `this.patch = (opts && opts.patch) || null;`. In `Ember.update`, wherever the ember dies from life expiry (find `this.life -= dt` / the `return`-false path — NOT the player-hit path), before it dies:

```js
      if (this.patch) game.firePatches.push(
        new JH.FirePatch(this.x, this.y, this.patch.r, this.patch.dur));
```

  - `Pyro.think` windup-resolve block:

```js
        if (this.windTimer <= 0) {
          const ang = Math.atan2(dy, dx);
          const spreads = this.superElite ? [-0.35, 0, 0.35] : [0];
          for (const off of spreads)
            game.embers.push(new Ember(this.x + this.facing * 8, this.y, this.z + 14,
              Math.cos(ang + off) * d.emberSpeed, Math.sin(ang + off) * d.emberSpeed * 0.6,
              d.emberDmg,
              this.superElite ? { patch: { r: 14, dur: 1.2 } } : undefined));
          this.cdTimer = d.shootCd * (this.superElite ? 1.4 : 1);
        }
```

- [ ] **Step 4: Run tests + commit** — `git commit -am "feat(super-pyro): triple-lob fan, embers gutter into small fire patches"`

---

### Task 11: Stalker blink-STRIKE (all tiers) + super fakeout

**Files:**
- Modify: `js/config.js` (stalker def), `js/entities.js` (`Stalker.think`)
- Test: `tests/entities.test.js` (append)

- [ ] **Step 1: config** — stalker def: `strikeWind: 0.3` → `0.12`, `strikeRange: 22` → `26` *(tunable)*. The pre-blink `blinkTell: 0.35` stays — that's the fairness window now.
- [ ] **Step 2: Failing test (fakeout):**

```js
test("super stalker feints in FRONT first, then blinks behind and strikes", () => {
  const g = makeThinkGame(240, 40);
  g.player.facing = 1;
  const s = JH.makeEnemy("stalker", 100, 40);
  s.makeSuper(); s.spawnGrace = 0;
  s.windTimer = 0.01; s.state = "wind";
  s.think(0.02, g);                              // first blink = feint
  assert.ok(s.x > g.player.x, "feint lands in FRONT of the player (facing side)");
  assert.notStrictEqual(s.state, "strike", "no strike off the feint");
  assert.ok(s.windTimer > 0, "re-telegraphs for the real blink");
  s.windTimer = 0.01;
  s.think(0.02, g);                              // second blink = real
  assert.ok(s.x < g.player.x, "real blink lands BEHIND");
  assert.strictEqual(s.state, "strike");
});
```

- [ ] **Step 3: Run — FAILS.**
- [ ] **Step 4: Implement** — in `Stalker.think`, the wind-resolve block becomes:

```js
        if (this.windTimer <= 0) {
          const bounds = { minX: game.bounds.minX, maxX: game.bounds.maxX,
                           depthMin: JH.DEPTH_MIN, depthMax: JH.DEPTH_MAX };
          if (this.superElite && !this.feinted) {
            // Fakeout: first blink lands IN FRONT (facing side) with no
            // strike, then immediately re-telegraphs the real one.
            const f = JH.Balance.stalkerBlinkTarget(pl.x, pl.y, -pl.facing, d.blinkDist, bounds);
            this.x = f.x; this.y = f.y;
            this.facing = pl.x >= this.x ? 1 : -1;
            this.feinted = true;
            this.windTimer = 0.25;
            game.audio.play("jump");
            return;
          }
          this.feinted = false;
          const t = JH.Balance.stalkerBlinkTarget(pl.x, pl.y, pl.facing, d.blinkDist, bounds);
          this.x = t.x; this.y = t.y;
          this.facing = pl.x >= this.x ? 1 : -1;
          this.attackTimer = d.strikeWind;
          this.state = "strike";
          game.audio.play("jump");
        }
```

  and the strike hit at the top widens its band: `Geo.inHitArc(this, pl, this.facing, d.strikeRange, 20)` (was 16).
- [ ] **Step 5: Run tests + commit** — `git commit -am "feat(stalker): blink-strike lands in one beat; super fakeout double-blink"`

---

### Task 12: Fuse lit-fuse timer + spark overlay + elite/super death spawns

**Files:**
- Modify: `js/config.js` (fuse def), `js/entities.js` (`Fuse`)
- Test: `tests/entities.test.js` (append)

**Interfaces:**
- Produces: `fuse.lit` (bool). Death-splitting: elite → 1 child fuse, super → 3, regardless of cause of death.

- [ ] **Step 1: config** — fuse def gains *(all tunable)*:

```js
      igniteRange: 70,       // px from Jon at which the head-fuse lights
      litDrainFrac: 0.20,    // fraction of maxHp burned off per second while lit
      blastRadius: 40,       // self-destruct AoE (ground ellipse rx)
      blastDmg: 18,
      blastPatchRadius: 26, blastPatchDur: 2.0,
```

- [ ] **Step 2: Failing tests:**

```js
test("fuse ignites on proximity and drains its own hp while lit", () => {
  const g = makeThinkGame(60, 40);
  const f = JH.makeEnemy("fuse", 100, 40);     // 40px away < igniteRange 70
  f.spawnGrace = 0; f.dropping = false;
  f.update(1 / 60, g);
  assert.strictEqual(f.lit, true);
  const hp0 = f.hp;
  f.update(0.5, g);
  assert.ok(f.hp < hp0, "lit fuse burns its own hp");
});

test("lit fuse reaching 0 hp self-destructs: blast patch + player damage in range", () => {
  const g = makeThinkGame(110, 40);
  const f = JH.makeEnemy("fuse", 100, 40);
  f.spawnGrace = 0; f.dropping = false; f.lit = true; f.hp = 0.01;
  const hpBefore = g.player.hp;
  f.update(0.5, g);
  assert.strictEqual(f.dead, true);
  assert.ok(g.firePatches.length >= 1, "blast leaves a fire patch");
  assert.ok(g.player.hp < hpBefore, "player inside blastRadius takes the hit");
});

test("elite fuse spawns 1 child on death; super spawns 3", () => {
  const spawned = [];
  const g = makeThinkGame(400, 40);
  g.spawnEnemy = (type, x, y, opts) => { const c = JH.makeEnemy(type, x, y); spawned.push(c); return c; };
  const e = JH.makeEnemy("fuse", 100, 40); e.makeElite(); e.die(g);
  assert.strictEqual(spawned.length, 1);
  const s = JH.makeEnemy("fuse", 100, 40); s.makeSuper(); s.die(g);
  assert.strictEqual(spawned.length, 4);
});
```

  (Note: `makeThinkGame`'s default `spawnEnemy() {}` no-op keeps other tests unaffected.)
- [ ] **Step 3: Run — all three FAIL.**
- [ ] **Step 4: Implement in `Fuse`.**
  - `update(dt, game)` — after the dropping block, before `super.update`:

```js
      // Proximity-lit fuse: within igniteRange the wick lights; while lit it
      // burns the fuse's OWN hp — at 0 (by drain or damage) it self-destructs.
      const d = this.def, pl = game.player;
      if (!this.lit && this.spawnGrace <= 0 &&
          Math.hypot(pl.x - this.x, pl.y - this.y) < d.igniteRange) {
        this.lit = true;
        if (game.audio) game.audio.play("sizzle");
      }
      if (this.lit && !this.dead) {
        this.hp -= this.maxHp * d.litDrainFrac * dt;
        if (Math.random() < 8 * dt)
          burst(game, this.x, this.y, this.bodyH + 2, JH.PAL.firePatchHi, 1,
            { speed: 25, life: 0.25, up: 40, size: 1 });
        if (this.hp <= 0) { this.die(game); return; }
      }
      super.update(dt, game);
```

    (Delete the plain `super.update(dt, game);` that was there.)
  - `die(game)` — replace the body:

```js
    die(game) {
      const d = this.def;
      if (this.lit) {
        // Self-destruct: real AoE + a bigger, longer patch.
        game.firePatches.push(new JH.FirePatch(this.x, this.y, d.blastPatchRadius, d.blastPatchDur));
        game.embers.push(new JH.FxBurst(this.x, this.y, "boom-mid", { scale: 0.55 }));
        game.shake(5);
        const pl = game.player;
        if (pl.alive && Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, d.blastRadius)) {
          pl.takeHit(d.blastDmg, game, this.x);
          pl.applyBurn(1);
        }
      } else {
        game.firePatches.push(new JH.FirePatch(this.x, this.y, d.deathPatchRadius, d.deathPatchDur));
        game.embers.push(new JH.FxBurst(this.x, this.y, "boom-small", { scale: 1 }));
        game.shake(3);
        if (Geo.inGroundEllipse(game.player.x, game.player.y, this.x, this.y, d.deathBurnRange))
          game.player.applyBurn(1);
      }
      burst(game, this.x, this.y, 5, JH.PAL.firePatch, 16, { speed: 130, life: 0.5, up: 70, size: 3 });
      // Elite: 1 child fuse lobbed out; super: 3 — however it died.
      const n = this.superElite ? 3 : this.elite ? 1 : 0;
      for (let i = 0; i < n; i++) {
        const ang = (i / Math.max(1, n)) * Math.PI * 2 + Math.random();
        const cx = clamp(this.x + Math.cos(ang) * 26, game.bounds.minX, game.bounds.maxX);
        const cy = clamp(this.y + Math.sin(ang) * 14, JH.DEPTH_MIN, JH.DEPTH_MAX);
        const child = game.spawnEnemy("fuse", cx, cy, { infinite: true });
        if (child) { child.z = 24; child.vz = 90; child.spawnGrace = 0.5; }
      }
      super.die(game);
    }
```

  - Spark overlay — in `Fuse.prototype.draw`, after the base-draw call path (the non-dropping branch), append:

```js
    if (this.lit && !this.dead) {
      const sx = this.x - cam;
      Assets.drawFx(ctx, "fire-small", sx + this.facing * 2,
        Geo.feetScreenY(this.y, this.z) - this.bodyH - 3, this.t, { scale: 0.35 });
    }
```

    (The walk frames' wick is position-consistent now, so one head offset works. This runtime overlay replaces the spec's "baked fuse-lit animation" — same read, zero rebake risk to the hand-cleaned frames.)
- [ ] **Step 5: Run tests + dev smoke** (FIRE INTRO — walk near a fuse, watch the spark + suicide) **+ commit** — `git commit -am "feat(fuse): proximity-lit self-destruct timer; elite/super death-split fuses"`

---

### Task 13: Super smelt — two bouncing slag lobs

**Files:**
- Modify: `js/entities.js` (`Smelt.think`, `SmeltBomb`)
- Test: `tests/entities.test.js` (append)

- [ ] **Step 1: Failing test:**

```js
test("SmeltBomb with bounces re-arcs once, leaving a patch at EACH touchdown", () => {
  const g = makeThinkGame(200, 40);
  const bomb = new JH.SmeltBomb(100, 40, 140, 40, JH.ENEMIES.smelt, { bounces: 1 });
  for (let i = 0; i < 400 && !bomb.dead; i++) bomb.update(1 / 60, g);
  assert.strictEqual(bomb.dead, true);
  assert.ok(g.firePatches.length >= 2, "patch at first landing AND bounce landing, got " + g.firePatches.length);
});
```
- [ ] **Step 2: Run — FAILS** (`JH.SmeltBomb` undefined).
- [ ] **Step 3: Implement.**
  - Export: after the `SmeltBomb` class body add `JH.SmeltBomb = SmeltBomb;`.
  - Constructor: `constructor(x, y, tx, ty, d, opts)` → add `this.bounces = (opts && opts.bounces) || 0;`.
  - Landing block (`if (this.z <= 0)`): after the existing patch/boom/burn code, replace `this.dead = true;` with:

```js
        if (this.bounces > 0) {
          // Bounce: shorter re-arc toward the player's CURRENT position;
          // every touchdown has already left its patch above.
          this.bounces--;
          const hop = Math.max(30, Math.hypot(pl.x - this.x, pl.y - this.y) * 0.7);
          const ang2 = Math.atan2(pl.y - this.y, pl.x - this.x);
          const ty2 = Math.max(JH.DEPTH_MIN, Math.min(JH.DEPTH_MAX, this.y + Math.sin(ang2) * hop));
          const flightT = Math.max(0.35, hop / d.lobBombSpeed);
          this.vx = Math.cos(ang2) * hop / flightT;
          this.vy = (ty2 - this.y) / flightT;
          this.z = 0.01;
          this.vz = 0.5 * d.lobGravity * flightT;
        } else {
          this.dead = true;
        }
```
  - `Smelt.think` windup-resolve:

```js
        if (this.windTimer <= 0) {
          if (this.superElite) {
            game.embers.push(new SmeltBomb(this.x, this.y, pl.x - 24, pl.y, d, { bounces: 1 }));
            game.embers.push(new SmeltBomb(this.x, this.y, pl.x + 24, pl.y, d, { bounces: 1 }));
          } else {
            game.embers.push(new SmeltBomb(this.x, this.y, pl.x, pl.y, d));
          }
          this.cdTimer = d.lobCd;
        }
```

- [ ] **Step 4: Run tests + commit** — `git commit -am "feat(super-smelt): twin slag lobs that bounce once, patch at every touchdown"`

---

### Task 14: Super bulwark — shield lob + slow zone

**Files:**
- Modify: `js/entities.js` (`Bulwark.think` super branch, new `SlowZone` + `ShieldLob` classes), `js/game.js` (slowZones array: init/update/draw/clear), Player movement slow
- Test: `tests/entities.test.js` (append)

**Interfaces:**
- Produces: `JH.SlowZone(x, y, r, dur)` — `update(dt, game) -> bool alive`, `slowMult = 0.55`; `game.slowZones` array; `player.zoneSlow` (movement multiplier, default 1) applied in the Player's walk-speed code.

- [ ] **Step 1: Failing test:**

```js
test("SlowZone slows the player inside, expires after dur", () => {
  const g = makeThinkGame(100, 40);
  const z = new JH.SlowZone(100, 40, 30, 5);
  z.update(1 / 60, g);
  assert.strictEqual(g.player.zoneSlow, 0.55);
  const z2 = new JH.SlowZone(400, 40, 30, 5);   // far away
  g.player.zoneSlow = 1; z2.update(1 / 60, g);
  assert.strictEqual(g.player.zoneSlow, 1);
  z.t = 99; assert.strictEqual(z.update(1 / 60, g), false);
});
```

- [ ] **Step 2: Run — FAILS.**
- [ ] **Step 3: Implement.**
  - New classes in entities.js (near `FirePatch`):

```js
  // Ground denial left by a super-Bulwark's thrown shield: slows Jon while
  // he stands inside. Ellipse footprint like every ground zone.
  class SlowZone {
    constructor(x, y, r, dur) {
      this.x = x; this.y = y; this.r = r; this.dur = dur;
      this.t = 0; this.dead = false; this.slowMult = 0.55;
    }
    update(dt, game) {
      this.t += dt;
      if (this.t >= this.dur) { this.dead = true; return false; }
      const pl = game.player;
      if (pl && pl.alive && Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, this.r))
        pl.zoneSlow = this.slowMult;
      return true;
    }
    draw(ctx, cam) {
      const sx = Math.round(this.x - cam), sy = Math.round(Geo.feetScreenY(this.y, 0));
      const k = Math.max(0, 1 - this.t / this.dur);
      ctx.save();
      ctx.globalAlpha = 0.28 * k + 0.1;
      ctx.fillStyle = JH.PAL.bulwarkShield;
      ctx.beginPath();
      ctx.ellipse(sx, sy, this.r, this.r * JH.GROUND_RY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.6 * k + 0.2;
      ctx.strokeStyle = JH.PAL.bulwark;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // The grounded shield itself, planted in the middle.
      ctx.globalAlpha = 1;
      ctx.fillStyle = JH.PAL.bulwarkShield;
      ctx.fillRect(sx - 5, sy - 16, 10, 16);
      ctx.strokeStyle = JH.PAL.bulwarkDk;
      ctx.strokeRect(sx - 5, sy - 16, 10, 16);
      ctx.restore();
    }
  }
  JH.SlowZone = SlowZone;
```

  - `ShieldLob` — arc projectile (SmeltBomb-shaped, no fire):

```js
  // Super-Bulwark's thrown shield: smelt-style arc; lands as a SlowZone.
  class ShieldLob {
    constructor(x, y, tx, ty, owner) {
      this.x = x; this.y = y; this.z = 26; this.owner = owner;
      const dist = Math.max(1, Math.hypot(tx - x, ty - y));
      const flightT = Math.max(0.45, dist / 150);
      this.vx = (tx - x) / flightT; this.vy = (ty - y) / flightT;
      this.vz = 0.5 * 300 * flightT - this.z / flightT;
      this.t = 0; this.dead = false;
    }
    update(dt, game) {
      this.t += dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.vz -= 300 * dt; this.z += this.vz * dt;
      if (this.z <= 0) {
        const zone = new JH.SlowZone(this.x, this.y, 30, 5);
        game.slowZones.push(zone);
        if (this.owner) this.owner.thrownZone = zone;
        game.shake(3); if (game.audio) game.audio.play("whack");
        this.dead = true;
      }
      return !this.dead;
    }
    draw(ctx, cam) {
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, this.z);
      ctx.save();
      ctx.translate(sx, sy); ctx.rotate(this.t * 9);
      ctx.fillStyle = JH.PAL.bulwarkShield;
      ctx.fillRect(-6, -8, 12, 16);
      ctx.strokeStyle = JH.PAL.bulwarkDk; ctx.strokeRect(-6, -8, 12, 16);
      ctx.restore();
    }
  }
  JH.ShieldLob = ShieldLob;
```

  - `Bulwark.think` — first line, divert supers:

```js
      if (this.superElite) return this.superThink(dt, game);
```

    and add the method (inside the class):

```js
    // Super: no dome cycle. Lob the shield AT Jon (slow zone), brawl
    // shieldless while it's down, reclaim it when the zone expires.
    superThink(dt, game) {
      const pl = game.player, d = this.def;
      const dx = pl.x - this.x, dy = pl.y - this.y, dist = Math.hypot(dx, dy);
      this.facing = dx >= 0 ? 1 : -1;
      if (this.strikeFx > 0) this.strikeFx -= dt;

      if (this.phase === "slam") {          // reuse the standard slam resolve
        this.slam.t -= dt; this.windTimer = this.slam.t; this.state = "wind";
        if (this.slam.t <= 0) {
          if (Geo.inHitArc(this, pl, this.facing, this.slam.range, this.slam.band))
            pl.takeHit(this.slam.dmg, game, this.x);
          game.shake(9); game.audio.play("whack");
          this.strikeFx = 0.2; this.cdTimer = 0.9; this.phase = "brawl";
        }
        return;
      }
      if (this.phase === "throwWind") {
        this.windTimer -= dt; this.state = "wind";
        if (this.windTimer <= 0) {
          game.embers.push(new JH.ShieldLob(this.x, this.y, pl.x, pl.y, this));
          this.hasShield = false;
          this.phase = "brawl"; this.cdTimer = 0.6;
        }
        return;
      }
      if (this.phase === "brawl") {
        if (this.thrownZone && this.thrownZone.dead) {
          this.thrownZone = null; this.hasShield = true;
          this.phase = "approach"; this.cdTimer = d.redeployCd;
          return;
        }
        if (this.cdTimer > 0) this.cdTimer -= dt;
        if (this.cdTimer <= 0 && dist < d.slamRange && this.spawnGrace <= 0) {
          this.slam = { range: d.slamRange, band: d.slamBand, dmg: d.slamDmg, dur: d.slamWind, t: d.slamWind };
          this.phase = "slam"; game.audio.play("jump");
          return;
        }
        this._chase(dt, dx, dy, dist, 1.3);
        return;
      }
      // approach: throw when in the lob band and holding the shield
      if (this.cdTimer > 0) this.cdTimer -= dt;
      if (this.hasShield && this.cdTimer <= 0 && this.spawnGrace <= 0 &&
          dist > 50 && dist < 170) {
        this.windTimer = 0.5; this.phase = "throwWind";
        return;
      }
      this._chase(dt, dx, dy, dist, 1);
    }
```

  - `js/game.js` — `slowZones` lifecycle, mirroring `firePatches` exactly:
    - init `this.slowZones = [];` everywhere `this.firePatches = []` is set (startGame reset, `respawnFromChurch` line 964, dev-jump resets — search `firePatches = []`, add alongside each).
    - update: next to `this.firePatches = this.firePatches.filter((fp) => !fp.dead);` add `this.slowZones = this.slowZones.filter((z) => !z.dead);`, and in the update pass where firePatches update (search `for (const fp of this.firePatches) fp.update(dt, this)` or `.update(dt`) add — **before player movement is consumed next frame is fine**:

```js
      this.player.zoneSlow = 1;
      for (const z of this.slowZones) z.update(dt, this);
```

    - draw: where firePatches draw in the world pass, add `for (const z of this.slowZones) z.draw(ctx, cam);` (before enemies so bodies stand on it).
  - **Player slow:** in `js/entities.js` Player constructor add `this.zoneSlow = 1;`. In `Player.update`, find the walking-speed application (search `stats.moveSpeed` inside `Player`) and multiply the applied speed by `this.zoneSlow` (dash speed intentionally NOT slowed — dashing out is the counterplay).
- [ ] **Step 4: Run tests + dev smoke** (WAVE 7 super bulwark) **+ commit** — `git commit -am "feat(super-bulwark): shield lob lands a slow zone; shieldless brawler while it's down"`

---

### Task 15: Furnace — death slag + heat-tint bake fix (furnace ONLY)

**Files:**
- Modify: `js/entities.js` (`Furnace.die`), `tools/enemy-sprites.mjs` (type filter + furnace heat tint)
- Regenerates: `sprites/furnace/*.png` ONLY

- [ ] **Step 1: Death slag.** `Furnace` class — override `die(game)` (it may not have one; add after its `think`):

```js
    die(game) {
      // The death explosion hurls one slag at Jon's position — a last spiteful
      // lob using the smelt-bomb arc (small patch on landing).
      const pl = game.player;
      game.embers.push(new JH.SmeltBomb(this.x, this.y, pl.x, pl.y, {
        lobBombSpeed: 120, lobGravity: 300, lobBombRadius: 24, lobBombDur: 1.8,
      }));
      super.die(game);
    }
```

  (Requires `JH.SmeltBomb` export from Task 13.)
- [ ] **Step 2: Baker type filter.** In `tools/enemy-sprites.mjs`, find the top-level loop that iterates enemy specs (each spec bakes one `sprites/<name>/` dir). Before it:

```js
const only = process.argv.slice(2);   // e.g. `node tools/enemy-sprites.mjs furnace`
```

and inside the loop, first line: `if (only.length && !only.includes(spec.name)) continue;` (adapt the property to the actual spec-name field in the file).
- [ ] **Step 3: Heat tint fix.** In the same file, locate the furnace painter (search `furnace`). The heat-step tint (`h0..h3`) currently keys the hot color to the torso/body region only. Extend the tint mapping so the SAME heat lerp applies to the arm and leg pixel runs (whatever structure the painter uses — trace which draw calls take the heat-lerped palette and apply it to the limb calls too). Acceptance: h3 frames differ from h0 in the limbs, not just the torso.
- [ ] **Step 4: Bake furnace only + verify blast radius:**

```
node tools/enemy-sprites.mjs furnace
git status --short sprites/
```

Expected: ONLY `sprites/furnace/*.png` modified. If anything under `sprites/mook/` or `sprites/fuse/` shows modified: `git checkout -- sprites/mook sprites/fuse` immediately and fix the filter.
- [ ] **Step 5: Visual check** — dev range gallery (Backquote → ↑↑ → Enter): furnace statue; then dev-jump FURNACE TRIAL, heat it, confirm limbs glow with the body.
- [ ] **Step 6: Commit** — `git commit -am "art(furnace): heat tint reaches arms/legs; death explosion lobs a slag at Jon"` (include the tool + PNGs).

---

### Task 16: Holy Essence cross — hover + world dim

**Files:**
- Modify: `js/entities.js` (`Pickup.update` cross hover), `js/game.js` (essenceDim state + overlay draw)

- [ ] **Step 1: Hover.** In `Pickup.update`, at the top of the grounded physics section, add a cross-specific branch:

```js
      if (this.kind === "cross") {
        // Essence crosses HOVER: no ground physics, a slow bob.
        this.grounded = true;
        this.z = 8 + Math.sin(this.t * 2.2) * 3;
      } else if (!this.grounded) {
```

  (i.e. the existing `if (!this.grounded) { ... }` becomes the `else if`.) Magnet/collect code below stays shared.
- [ ] **Step 2: Dim state.** `js/game.js` — init `this.essenceDim = 0;` next to the other game fields (search `lootVacuumT` init). In `update()` near the pickups update pass:

```js
      // Essence-cross event: while a cross is uncollected the world dims.
      const crossOut = this.pickups.some((p) => !p.dead && p.kind === "cross");
      this.essenceDim += ((crossOut ? 1 : 0) - this.essenceDim) * Math.min(1, 3 * dt);
```

- [ ] **Step 3: Overlay.** In `draw()`, AFTER the world/entity pass and BEFORE HUD-layer calls (anchor: insert just before the `if (this.nearShop && this.state === "play") this.drawHoverShop(this.ctx);` line at game.js:1538):

```js
      // Essence dim: darken the world, then re-draw the cross(es) above the
      // veil so the beat reads as "something is over there".
      if (this.essenceDim > 0.02 && this.state === "play") {
        const ctx = this.ctx, cam = JH.Camera.x;
        ctx.save();
        ctx.fillStyle = "rgba(8,6,20," + (0.35 * this.essenceDim).toFixed(3) + ")";
        ctx.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H);
        ctx.restore();
        for (const p of this.pickups) {
          if (p.dead || p.kind !== "cross") continue;
          JH.Assets.glow(this.ctx, p.x - cam, JH.Geo.feetScreenY(p.y, p.z) - 4,
            18, "#ffd23f", 0.5 * this.essenceDim);
          p.draw(this.ctx, cam);
        }
      }
```

  (Check how `draw()` obtains the camera in surrounding code — reuse the same local, e.g. `const cam = JH.Camera.x` may already exist in scope; don't shadow it.)
- [ ] **Step 4: Dev smoke** — dev-jump a set-piece (BARRICADE), clear it: cross drops → world dims, cross hovers/bobs, glows above the veil; collect → dim eases out. `npm test` still green.
- [ ] **Step 5: Commit** — `git commit -am "feat(essence): cross hovers and dims the world until collected"`

---

### Task 17: First-death pity

**Files:**
- Modify: `js/game.js` (`startPlayerDeathSeq` — death counter + pity flag), `js/church.js` (pity line in the sermon)

- [ ] **Step 1:** `js/game.js` `startPlayerDeathSeq()` (search the name; it routes death → Church) — add at the top:

```js
      // First death of the RUN: bank a pity Essence and cue Father Jon's line.
      this.deathCount = (this.deathCount || 0) + 1;
      if (this.deathCount === 1 && JH.Church) {
        JH.Church.addEssence(1);
        JH.Church.pendingPity = true;
      }
```

  Also reset `this.deathCount = 0;` in the run-start reset (same function that resets `waveIndex` — see Task 4 Step 3).
- [ ] **Step 2:** `js/church.js` — where sermon lines are assembled (church.js:299-301):

```js
        const lines = sc.firstVisit
          ? JH.CHURCH.sermon.first.slice()
          : [JH.CHURCH.sermon.repeat[(Math.random() * JH.CHURCH.sermon.repeat.length) | 0]];
        if (this.pendingPity) {
          this.pendingPity = false;
          lines.unshift("Take this, child — the water keeps what it takes.");
        }
```

  (`this` must be the Church object in that scope — it is inside the Church methods; verify the enclosing function is a Church method, else use `JH.Church.pendingPity`.)
- [ ] **Step 3: Dev smoke** — die on purpose (wave 2 + K doesn't kill Jon; just stand in fire): Church shows the pity line first, essence readout +1. `npm test` green.
- [ ] **Step 4: Commit** — `git commit -am "feat(church): first death of the run grants a pity Essence with its own line"`

---

### Task 18: Slim stat panel

**Files:**
- Modify: `js/entities.js` (`Player.applyStats` diff-tracking + decay), `js/game.js` (`drawStatPanel` + call from `drawHoverShop`)

**Interfaces:**
- Produces: `player.statFlash` — `{statKey: secondsRemaining}` set on any change via `applyStats`.

- [ ] **Step 1:** `Player.applyStats(fresh)` (entities.js — search `applyStats(`): before the existing assignment logic, add:

```js
      // Track which displayed stats changed so the shop panel can flash them.
      const KEYS = ["sprayDamage", "sprayRange", "maxWater", "waterRegen",
                    "moveSpeed", "dodgeChance", "vampiricRate", "maxHp"];
      if (this.stats) {
        this.statFlash = this.statFlash || {};
        for (const k of KEYS)
          if (fresh[k] !== this.stats[k]) this.statFlash[k] = 2.0;
      }
```

  In `Player.update`, decay: 

```js
      if (this.statFlash)
        for (const k in this.statFlash)
          if ((this.statFlash[k] -= dt) <= 0) delete this.statFlash[k];
```

- [ ] **Step 2:** `js/game.js` — new method next to `drawHoverShop`:

```js
    // Slim stat readout beside the hover shop: the numbers the scaling pass
    // moves, flashing green for 2s after any purchase changes them.
    drawStatPanel(ctx) {
      const S = this.player.stats, F = this.player.statFlash || {};
      const rows = [
        ["DMG",    Math.round(S.sprayDamage), "sprayDamage"],
        ["RANGE",  Math.round(S.sprayRange),  "sprayRange"],
        ["WATER",  Math.round(S.maxWater),    "maxWater"],
        ["REGEN",  Math.round(S.waterRegen + (S.moveRegen || 0)), "waterRegen"],
        ["HP",     Math.round(S.maxHp),       "maxHp"],
        ["SPEED",  Math.round(S.moveSpeed),   "moveSpeed"],
        ["DODGE",  Math.round(S.dodgeChance * 100) + "%", "dodgeChance"],
        ["VAMP",   Math.round(S.vampiricRate * 100) + "%", "vampiricRate"],
      ];
      const X = 10, Y = 60, ROW = 9, W = 74;
      ctx.save();
      ctx.fillStyle = "rgba(10,14,24,0.85)";
      ctx.fillRect(X - 4, Y - 10, W, rows.length * ROW + 16);
      ctx.strokeStyle = "#2a3550"; ctx.strokeRect(X - 4, Y - 10, W, rows.length * ROW + 16);
      ctx.font = "bold 6px monospace"; ctx.textAlign = "left";
      ctx.fillStyle = "#8fa8c8";
      ctx.fillText("JON", X, Y - 3);
      ctx.font = "6px monospace";
      rows.forEach(([label, val, key], i) => {
        const y = Y + 6 + i * ROW;
        const hot = F[key] > 0 && (Math.floor(this.elapsed * 6) & 1) === 0;
        ctx.fillStyle = "#667788";
        ctx.fillText(label, X, y);
        ctx.textAlign = "right";
        ctx.fillStyle = hot ? "#80ff80" : "#dfe8f5";
        ctx.fillText(String(val) + (F[key] > 0 ? " ▲" : ""), X + W - 10, y);
        ctx.textAlign = "left";
      });
      ctx.restore();
    },
```

- [ ] **Step 3:** First line of `drawHoverShop(ctx)`: `this.drawStatPanel(ctx);`
- [ ] **Step 4: Dev smoke** — stand at the vendor: panel shows; buy a node: its stats flash green with ▲ for ~2s. `npm test` green.
- [ ] **Step 5: Commit** — `git commit -am "feat(ui): slim stat panel at the shop, flashes stats that just grew"`

---

### Task 19: Full verification + playtest handoff (NO release yet)

**Files:** none (verification only)

- [ ] **Step 1:** `npm test` — full suite green (~145+ tests).
- [ ] **Step 2:** `npm run build` — completes without error.
- [ ] **Step 3:** Browser sweep (`npm run dev`, dev menu):
  - WAVE 3: super mook (label, 1.8x, lunge telegraph feels dodgeable).
  - STREET SWARM / RUBBLE ROW / STALKER AMBUSH / WAVE 7 / EMBER RUSH / MELTDOWN: each super-elite's move fires; no console errors.
  - OVERRUN: tickets visibly meter the crowd.
  - Any set-piece: cross hover + dim + collect.
  - Fuse proximity: spark, drain, self-destruct; kill an elite fuse (sprinkles may provide one) → child fuse pops out.
  - Shop: tier-3 locked in Act 1; stat panel flashes on buy.
  - Die once: pity line + essence.
- [ ] **Step 4:** Push the branch: `git push -u origin curve-pass`.
- [ ] **Step 5:** STOP. Report ready-for-playtest to the user. The release ritual (version 0.26.0 + CHANGELOG + `release: v0.26.0 - <name>` merge) happens ONLY after the user playtests and approves — numbers marked *(tunable)* are expected to move.

---

## Self-review notes (already applied)

- Spec §3 fuse "baked fuse-lit animation" is implemented as a runtime FX overlay (Task 12) — same visual read, zero risk to hand-cleaned frames; flagged in the task.
- Spec §4 "heavier outline glow" is implemented as label + heavier gold bar + 1.8x scale in v1 (Task 7); a true silhouette-ring glow can ride the playtest feedback.
- Task 14 Player-slow and Task 4/17 reset-point edits reference search anchors instead of line numbers where the exact line wasn't surveyed — the anchors are unique strings verified to exist.
