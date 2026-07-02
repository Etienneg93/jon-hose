# Input Buffer (130ms) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dash and confirm presses stay "pending" for 130ms and are consumed by the first frame that can act on them, so hit-stop/arrival freezes and cooldown edges stop silently eating inputs; neutral dash goes toward facing.

**Architecture:** Timestamp-based edge buffer inside `JH.Input` (`buffered(a)`/`consume(a)`, fake-clock injectable via `Input._now`). `Input.poll()` already runs at the top of `Game.update` on every frame regardless of state (`game.js:977`), so edges recorded there survive the hit-stop early-return (`game.js:1038`), the arrival sequence (`:1035`), and cutscenes. Consumers switch from `pressed()` to `buffered()`+`consume()`: the Player dash (`entities.js:243`) and the three in-play confirm sites in `game.js`. `pressed()` stays untouched for everything else (pause, menu navigation, church).

**Tech Stack:** Vanilla JS IIFEs on `window.JH`; `node --test` + `node:assert`.

**Source spec:** `docs/superpowers/plans/ideas/2026-07-02-controls-accessibility-qol.md` §1 (buffer) + the neutral-dash line of §2.

## Global Constraints

- Work on a new branch `input-buffer` off `main`. Stage files by exact path; never `git add -A`.
- **Playtest gate (user rule):** commits + push to the feature branch are fine, but do NOT merge to main until the user playtests and signs off.
- Buffered actions are **`dash` and `confirm` only** (spec open-question 1 resolved: spray is a hold, no buffering).
- `BUFFER_MS = 130` (spec: tune 100–160 in playtest — keep it a named const).
- Church sites (`church.js` confirm/dash reads) intentionally stay on `pressed()` — no freezes exist there; out of scope.
- Code comments: behavioral/mechanical facts only (CLAUDE.md rule).
- In node tests, `input.js`'s `poll()` dereferences `navigator` and `init()` uses `window.addEventListener` — stub both (`global.navigator = {}`, `window.addEventListener = () => {}`) before use.

---

### Task 1: Edge buffer in `JH.Input`

**Files:**
- Modify: `js/input.js`
- Create: `tests/input.test.js`

**Interfaces:**
- Produces: `Input.buffered(a) → boolean` (an up→down edge on `a` happened within the last `BUFFER_MS` and wasn't consumed), `Input.consume(a)` (clears the pending edge), `Input._now() → ms` (clock hook, defaults to `performance.now()`, overridable in tests). `pressed()`/`held()` semantics unchanged.

- [ ] **Step 1: Write the failing tests**

Create `tests/input.test.js`:

```js
"use strict";
const test = require("node:test");
const assert = require("node:assert");

global.window = global.window || {};
global.window.addEventListener = global.window.addEventListener || (() => {});
global.navigator = global.navigator || {};   // poll() reads navigator.getGamepads
require("../js/input.js");
const Input = global.window.JH.Input;

// Fake clock + fresh input state per test.
let now = 0;
function reset() {
  now = 0;
  Input.init();
  Input._now = () => now;
}
function frame(ms) { now += ms; Input.poll(); }

test("buffered: press edge stays pending within 130ms", () => {
  reset();
  Input._keys.dash = true; frame(16);        // edge lands
  assert.ok(Input.buffered("dash"));
  Input._keys.dash = false;
  frame(50); frame(50);                      // 116ms after the edge
  assert.ok(Input.buffered("dash"), "still pending inside the window");
});

test("buffered: expires after 130ms", () => {
  reset();
  Input._keys.dash = true; frame(16);
  Input._keys.dash = false;
  frame(140);
  assert.ok(!Input.buffered("dash"));
});

test("consume clears the pending edge", () => {
  reset();
  Input._keys.confirm = true; frame(16);
  assert.ok(Input.buffered("confirm"));
  Input.consume("confirm");
  assert.ok(!Input.buffered("confirm"));
});

test("holding does not re-arm the buffer after consume", () => {
  reset();
  Input._keys.dash = true; frame(16);
  Input.consume("dash");
  frame(16); frame(16);                      // still held — no new edge
  assert.ok(!Input.buffered("dash"));
});

test("re-press after release re-arms", () => {
  reset();
  Input._keys.dash = true; frame(16);
  Input.consume("dash");
  Input._keys.dash = false; frame(16);
  Input._keys.dash = true; frame(16);
  assert.ok(Input.buffered("dash"));
});

test("pressed() edge semantics unchanged", () => {
  reset();
  Input._keys.spray = true; frame(16);
  assert.ok(Input.pressed("spray"));
  frame(16);
  assert.ok(!Input.pressed("spray"), "only true on the edge frame");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/input.test.js`
Expected: FAIL — `Input.buffered is not a function`.

- [ ] **Step 3: Implement**

In `js/input.js`, after the `KEYMAP` table, add:

```js
  // Edge-buffered actions: a press stays "pending" for BUFFER_MS and is
  // consumed by the first frame that can act on it — so hit-stop/arrival
  // freezes and cooldown edges can't eat the press. Spray is a hold; only
  // discrete actions buffer.
  const BUFFERED = ["dash", "confirm"];
  const BUFFER_MS = 130;
```

In the `Input` object, add the fields/methods (state fields near `_keys`, methods after `pressed`):

```js
    _bufAt: {},  // action -> _now() timestamp of the latest unconsumed edge
    _now() { return performance.now(); },
```

At the end of `poll()`, after `this.state = s;`:

```js
      // Record press edges for the buffered actions.
      for (const a of BUFFERED)
        if (this.state[a] && !this._prev[a]) this._bufAt[a] = this._now();
```

After `pressed(a)`:

```js
    // Unconsumed press edge within the last BUFFER_MS.
    buffered(a) {
      const t = this._bufAt[a];
      return t != null && this._now() - t <= BUFFER_MS;
    },
    consume(a) { this._bufAt[a] = null; },
```

In `init()`, alongside the existing per-action reset, add:

```js
      BUFFERED.forEach((a) => { this._bufAt[a] = null; });
```

- [ ] **Step 4: Run the full suite**

Run: `npm test` — capture the exit code (`ec=$?`), do not rely on grep.
Expected: all pass (82 existing + 6 new).

- [ ] **Step 5: Commit**

```bash
git checkout -b input-buffer
git add js/input.js tests/input.test.js
git commit -m "feat(input): 130ms edge buffer for dash/confirm

poll() runs every frame even during hit-stop and the arrival sequence,
so recording press edges with timestamps lets the first frame that can
act consume them — presses landing inside a freeze are no longer lost."
```

---

### Task 2: Dash consumes the buffer + neutral dash

**Files:**
- Modify: `js/entities.js:242-251` (dash block in `Player.update`)
- Test: `tests/entities.test.js`

**Interfaces:**
- Consumes: `Input.buffered("dash")` / `Input.consume("dash")` (Task 1); real `JH.Input` driven with the fake clock in tests.
- Produces: dash fires when `dashCdTimer <= 0` AND a buffered press exists; a neutral press (no direction held) dashes toward `this.facing`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/entities.test.js` (it already requires config/world/upgrades/entities and defines `makePlayer()`):

```js
// ---- input buffer: dash ----
// Uses the real JH.Input with a fake clock so Player.update sees genuine
// buffered() semantics.
require("../js/input.js");
function makeBufferedInput() {
  global.window.addEventListener = global.window.addEventListener || (() => {});
  global.navigator = global.navigator || {};
  const In = JH.Input;
  In.init();
  let now = 0;
  In._now = () => now;
  return {
    In,
    frame(ms) { now += ms; In.poll(); },
  };
}
function dashStubGame(In) {
  return {
    input: In,
    audio: { play() {} },
    particles: [], embers: [], enemies: [], shields: [], firePatches: [], pickups: [],
    bounds: { minX: 0, maxX: 600 },
    shake() {}, hitStop() {},
  };
}

test("dash pressed during cooldown fires when the cooldown expires (buffer)", () => {
  const sim = makeBufferedInput();
  const p = makePlayer();
  const g = dashStubGame(sim.In);
  p.dashCdTimer = 0.05;                    // still cooling down
  sim.In._keys.right = true;               // direction held
  sim.In._keys.dash = true; sim.frame(16); // press lands during cooldown
  p.update(0.016, g);
  assert.strictEqual(p.dashTimer, 0, "cooldown still active — no dash yet");
  sim.In._keys.dash = false;
  for (let i = 0; i < 5; i++) { sim.frame(16); p.update(0.016, g); }  // ~80ms later
  assert.ok(p.dashTimer > 0, "buffered dash fires once the cooldown expires");
});

test("dash press older than the buffer window is dropped", () => {
  const sim = makeBufferedInput();
  const p = makePlayer();
  const g = dashStubGame(sim.In);
  p.dashCdTimer = 0.3;                     // long cooldown
  sim.In._keys.right = true;
  sim.In._keys.dash = true; sim.frame(16);
  p.update(0.016, g);
  sim.In._keys.dash = false;
  for (let i = 0; i < 20; i++) { sim.frame(16); p.update(0.016, g); }  // ~320ms
  assert.strictEqual(p.dashTimer, 0, "stale press must not fire");
});

test("neutral dash goes toward facing", () => {
  const sim = makeBufferedInput();
  const p = makePlayer();
  const g = dashStubGame(sim.In);
  p.facing = -1;
  sim.In._keys.dash = true; sim.frame(16); // no direction held
  p.update(0.016, g);
  assert.ok(p.dashTimer > 0, "neutral press should still dash");
  assert.strictEqual(p._dashX, -1, "dashes toward facing");
  assert.strictEqual(p._dashY, 0);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/entities.test.js`
Expected: FAIL — cooldown-edge press is eaten (`pressed()` was true only on the frozen frame) and neutral press does nothing.

If `Player.update` touches a `game` field the stub lacks, add it to `dashStubGame` — same convention as `stubGame`.

- [ ] **Step 3: Implement**

In `js/entities.js`, replace the dash trigger:

```js
      // ---- dash
      if (In.pressed("dash") && this.dashCdTimer <= 0 && (mx || my)) {
        this.dashTimer = S.dashTime; this.dashCdTimer = S.dashCd;
        this.invulnTimer = Math.max(this.invulnTimer, S.dashTime + 0.05);
        this._dashX = mx; this._dashY = my;
```

with:

```js
      // ---- dash
      // Buffered edge: a press during hit-stop or the last 130ms of cooldown
      // fires on the first frame that can act. Neutral press dashes toward
      // facing (a direction is no longer required).
      if (this.dashCdTimer <= 0 && In.buffered("dash")) {
        In.consume("dash");
        this.dashTimer = S.dashTime; this.dashCdTimer = S.dashCd;
        this.invulnTimer = Math.max(this.invulnTimer, S.dashTime + 0.05);
        this._dashX = (mx || my) ? mx : this.facing;
        this._dashY = my;
```

(The rest of the block — audio, dashBoost, puddle — is unchanged.)

- [ ] **Step 4: Run the full suite**

Run: `npm test` (check exit code).
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add js/entities.js tests/entities.test.js
git commit -m "feat(player): dash consumes the input buffer; neutral dash uses facing

Fixes the two eaten-dash cases from the playtest-informed QoL spec: a
press inside hit-stop now fires on unfreeze, and a press up to 130ms
before the cooldown expires comes out at the edge. A neutral press
dashes toward facing instead of doing nothing."
```

---

### Task 3: Confirm sites consume the buffer

**Files:**
- Modify: `js/game.js:1018-1027` (cutscene advance), `js/game.js:1072` (victory portal), `js/game.js:1085` (shop buy)

**Interfaces:**
- Consumes: `Input.buffered("confirm")` / `Input.consume("confirm")` (Task 1).
- Produces: nothing downstream; `pressed("confirm")` remains in `church.js` and shop cursor navigation stays on `pressed("up"/"down")` by design.

- [ ] **Step 1: Implement (three call-site swaps)**

Cutscene advance (`game.js:1018`) — replace:

```js
          if (this.input.pressed("confirm") && (cs.timer || 0) > 0.3) {
            cs.phase++;
```

with:

```js
          if (this.input.buffered("confirm") && (cs.timer || 0) > 0.3) {
            this.input.consume("confirm");
            cs.phase++;
```

Victory portal (`game.js:1072`) — replace:

```js
        if (vp.near && this.input.pressed("confirm")) { this.win(); return; }
```

with:

```js
        if (vp.near && this.input.buffered("confirm")) { this.input.consume("confirm"); this.win(); return; }
```

Shop buy (`game.js:1085`) — replace:

```js
            if (this.input.pressed("confirm")) {
              const e = sel[this.shopCursor];
```

with:

```js
            if (this.input.buffered("confirm")) {
              this.input.consume("confirm");
              const e = sel[this.shopCursor];
```

- [ ] **Step 2: Run the full suite**

Run: `npm test` (check exit code).
Expected: all pass (no unit coverage for game.js — DOM-bound; verified in Step 3).

- [ ] **Step 3: Browser smoke check**

Start `npm run dev` (background), then drive headless Chrome with the playwright pattern from the fire-readability pass (`chromium.launch({ channel: "chrome", headless: true })`, script in the scratchpad; `require` playwright by absolute path `D:/Projects/jon-hose/node_modules/playwright`):

1. Boot to title, press Enter, wait for `play` state — no `pageerror`s.
2. In-page eval: set `JH.Game.hitStopTimer = 0.5`, dispatch a `keydown` for `ShiftLeft` (dash) during the freeze, wait 600ms, assert via eval that `JH.Game.player.dashTimer > 0 || JH.Game.player.dashCdTimer > 0` (the buffered dash fired on unfreeze).
3. Screenshot for the record; kill the dev server after.

Note: the freeze is 0.5s but the buffer is 130ms — dispatch the keydown ~100ms before the freeze ends (e.g. set `hitStopTimer = 0.12` then dispatch immediately) so the press is still fresh on unfreeze.

- [ ] **Step 4: Commit + push branch**

```bash
git add js/game.js
git commit -m "feat(game): cutscene/portal/shop confirm reads the input buffer

An E pressed a beat early (during a freeze or a frame before arrival)
now lands instead of being eaten by the one-frame edge."
git push -u origin input-buffer
```

---

### Task 4: Handoff

- [ ] **Step 1:** Re-run `npm test` (exit-code checked) and summarize.
- [ ] **Step 2:** STOP — no merge. Hand to the user for playtest (their gate). Playtest focus: mash dash right as a hit lands (hit-stop), dash out of cooldown rhythm ("dash-dash" chains), neutral dash, E at the victory portal/cutscenes. Tuning knob: `BUFFER_MS` in `input.js` (spec suggests 100–160).

---

## Self-review notes

- **Spec §1 coverage:** buffer core (Task 1), freeze-eaten presses fixed structurally by poll-side recording (Task 1) + consumers (Tasks 2–3), cooldown-edge dash (Task 2). Spray deliberately unbuffered (open Q1). §2 neutral dash included (Task 2); the 40ms spray dash-cancel window is NOT included (separate juice-adjacent change).
- **Judgment calls:** church sites stay `pressed()` (no freezes); shop *navigation* stays `pressed()` (buffered up/down would feel laggy); `consume()` makes confirm exclusive per press across sites, which prevents one press triggering two consumers.
- **Type consistency:** `buffered(a)`, `consume(a)`, `_now()`, `_bufAt` used identically across tasks.
