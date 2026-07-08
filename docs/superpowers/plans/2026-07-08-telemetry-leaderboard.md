# Telemetry & Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect one telemetry record per run (per-wave reached/died, benedictions, items, outcome, time) into a Google Sheet, and show a fastest-win leaderboard in-game.

**Architecture:** A new `JH.Telemetry` module accumulates a run record in memory via small hooks called from existing sites, then POSTs it once at run end. A Google Apps Script web app appends each record to a Sheet and serves the top-10 fastest wins back via JSONP. All telemetry paths are silent no-ops on failure, when disabled, or when the player's handle is blank (blank = opt-out), so nothing can disturb a frame.

**Tech Stack:** Vanilla ES5-ish browser JS (matches repo style), `node --test` for units, Google Apps Script (`.gs`) backend, GitHub Pages hosting.

## Global Constraints

- **Single source of tunables:** telemetry config lives in `JH.TELEMETRY` in `js/config.js`; no endpoint/version literals elsewhere.
- **Dual-export pattern:** `js/telemetry.js` attaches `JH.Telemetry` in the browser AND `module.exports` for `node:test` — mirror `js/balance.js` exactly (`(function (root) { … })(typeof window !== "undefined" ? window : globalThis)` + `if (typeof module !== "undefined" && module.exports) module.exports = Telemetry;`).
- **Never throw into gameplay:** every hook and transport call is wrapped/guarded; a failure is a no-op, never an exception that reaches the game loop.
- **Opt-out is honest:** blank handle ⇒ `run` stays `null` ⇒ zero hooks record and nothing is ever sent for that player.
- **Run timer:** use the existing `this.elapsed` (game.js:1454) as `timeSec`; do NOT add a new timer — `elapsed` already excludes paused/church/cutscene/menu time.
- **Comment style:** behavioral/mechanical facts only, short (per repo CLAUDE.md).
- **Test suite must stay green:** `npm test` (node --test) after every task.

## File Structure

- Create `js/telemetry.js` — the `JH.Telemetry` client (record engine + browser transport). One responsibility: build & ship the run record, fetch the leaderboard.
- Create `tests/telemetry.test.js` — unit tests for the record engine with an injected transport spy.
- Create `tools/telemetry.gs` — Apps Script backend (doPost append, doGet JSONP top-10, buildMatrix menu).
- Create `docs/telemetry-setup.md` — one-time backend deploy + Sheet steps.
- Modify `js/config.js` — add `JH.TELEMETRY` block.
- Modify `index.html` — add `<script src="js/telemetry.js">`, a leaderboard button + `#screen-leaderboard`, a leaderboard button on the win screen.
- Modify `js/game.js` — init in `bindUI`, `beforeunload`, handle prompt + `startRun` in `startGame`, hooks in `startWave`/`startPlayerDeathSeq`/`win`, item hook in the shop dispatch, `data-action` wiring + render for the leaderboard screen.
- Modify `js/entities.js` — benediction hook in `Sigil.pick`.

---

### Task 1: `JH.Telemetry` record engine + unit tests

**Files:**
- Create: `js/telemetry.js`
- Test: `tests/telemetry.test.js`

**Interfaces:**
- Produces (consumed by later tasks):
  - `JH.Telemetry.configure({ endpoint, enabled, gameVersion })`
  - `JH.Telemetry.setTransport(fn)` — `fn(payload)`; used by tests
  - `JH.Telemetry.installBrowserTransport()` — sets real POST + JSONP (browser only)
  - `JH.Telemetry.startRun(handle)`
  - `JH.Telemetry.waveReached(index, name)`
  - `JH.Telemetry.death(waveIndex)`
  - `JH.Telemetry.benediction(id)` / `.item(id)`
  - `JH.Telemetry.finishWin({ timeSec, kills, deaths, sudsEarned, finalWaveIndex, finalWaveName })`
  - `JH.Telemetry.finishAbandoned()`
  - `JH.Telemetry.buildPayload(outcome, stats)` → flat object or `null`
  - `JH.Telemetry.fetchLeaderboard(cb)` — `cb(arrayOrNull)`

- [ ] **Step 1: Write the failing test**

Create `tests/telemetry.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert");
const T = require("../js/telemetry.js");

function withSpy() {
  const sent = [];
  T.configure({ endpoint: "https://x/exec", enabled: true, gameVersion: "9.9.9" });
  T.setTransport((p) => sent.push(p));
  return sent;
}

test("builds a full win record from a hook sequence", () => {
  const sent = withSpy();
  T.startRun("Ash");
  T.waveReached(0, "Hosetown");
  T.waveReached(1, "Maple St");
  T.death(1);
  T.death(1);
  T.benediction("eye_of_storm");
  T.item("node:pressure");
  T.finishWin({ timeSec: 123.4, kills: 50, deaths: 2, sudsEarned: 999.7, finalWaveIndex: 1, finalWaveName: "Maple St" });

  assert.strictEqual(sent.length, 1);
  const p = sent[0];
  assert.strictEqual(p.outcome, "win");
  assert.strictEqual(p.handle, "Ash");
  assert.strictEqual(p.gameVersion, "9.9.9");
  assert.deepStrictEqual(p.wavesReached, [0, 1]);
  assert.deepStrictEqual(p.deathsByWave, { 1: 2 });
  assert.deepStrictEqual(p.benedictions, ["eye_of_storm"]);
  assert.deepStrictEqual(p.items, ["node:pressure"]);
  assert.strictEqual(p.timeSec, 123.4);
  assert.strictEqual(p.deaths, 2);
  assert.strictEqual(p.sudsEarned, 999);
  assert.strictEqual(p.finalWaveIndex, 1);
  assert.ok(p.runId && typeof p.runId === "string");
});

test("blank handle disables the run: no record, no send", () => {
  const sent = withSpy();
  T.startRun("   ");
  T.waveReached(0, "Hosetown");
  T.death(0);
  T.finishWin({ timeSec: 10 });
  assert.strictEqual(sent.length, 0);
  assert.strictEqual(T.buildPayload("win", {}), null);
});

test("disabled config disables the run even with a handle", () => {
  const sent = [];
  T.configure({ endpoint: "https://x/exec", enabled: false, gameVersion: "1" });
  T.setTransport((p) => sent.push(p));
  T.startRun("Ash");
  T.finishWin({ timeSec: 10 });
  assert.strictEqual(sent.length, 0);
});

test("missing endpoint disables the run", () => {
  const sent = [];
  T.configure({ endpoint: "", enabled: true, gameVersion: "1" });
  T.setTransport((p) => sent.push(p));
  T.startRun("Ash");
  T.finishWin({ timeSec: 10 });
  assert.strictEqual(sent.length, 0);
});

test("one send per run: double finish does not double-send", () => {
  const sent = withSpy();
  T.startRun("Ash");
  T.finishWin({ timeSec: 5 });
  T.finishWin({ timeSec: 5 });
  T.finishAbandoned();
  assert.strictEqual(sent.length, 1);
});

test("finishAbandoned sends outcome=abandoned when a run is live", () => {
  const sent = withSpy();
  T.startRun("Ash");
  T.waveReached(3, "Elm");
  T.finishAbandoned();
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].outcome, "abandoned");
  assert.strictEqual(sent[0].finalWaveIndex, 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/telemetry.test.js`
Expected: FAIL — `Cannot find module '../js/telemetry.js'`.

- [ ] **Step 3: Write the module**

Create `js/telemetry.js`:

```js
/* =====================================================================
   telemetry.js — per-run gameplay telemetry + leaderboard client.
   Dual export: attaches JH.Telemetry in the browser; module.exports for
   node:test. Never reads gameplay state — only receives values via hooks.
   Every hook is a no-op when telemetry is off (disabled, no endpoint, or
   blank handle). A send failure is swallowed; nothing reaches the frame.
   ===================================================================== */
(function (root) {
  "use strict";

  function newId() {
    try { if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID(); }
    catch (e) { /* ignore */ }
    return "r-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e9).toString(36);
  }

  const Telemetry = {
    endpoint: "",
    enabled: false,
    gameVersion: "0",
    run: null,          // active run record, or null when telemetry is off this run
    _transport: null,   // send(payload); injected by tests or installBrowserTransport
    _fetchLb: null,     // fetchLeaderboard impl; set by installBrowserTransport

    configure(cfg) {
      cfg = cfg || {};
      this.endpoint = cfg.endpoint || "";
      this.enabled = !!cfg.enabled;
      this.gameVersion = cfg.gameVersion || "0";
    },

    setTransport(fn) { this._transport = fn; },

    _live(handle) { return this.enabled && !!this.endpoint && !!handle; },

    startRun(handle) {
      handle = (handle || "").trim();
      if (!this._live(handle)) { this.run = null; return; }
      this.run = {
        runId: newId(), handle: handle, gameVersion: this.gameVersion,
        wavesReached: {}, deathsByWave: {}, benedictions: [], items: [],
        finalWaveIndex: -1, finalWaveName: "",
      };
    },

    waveReached(index, name) {
      const r = this.run; if (!r) return;
      r.wavesReached[index] = true;
      if (index > r.finalWaveIndex) { r.finalWaveIndex = index; r.finalWaveName = name || ""; }
    },

    death(waveIndex) {
      const r = this.run; if (!r) return;
      r.deathsByWave[waveIndex] = (r.deathsByWave[waveIndex] || 0) + 1;
    },

    benediction(id) { const r = this.run; if (!r || !id) return; r.benedictions.push(id); },
    item(id)        { const r = this.run; if (!r || !id) return; r.items.push(id); },

    buildPayload(outcome, stats) {
      const r = this.run; if (!r) return null;
      stats = stats || {};
      const pick = (k, dflt) => (stats[k] != null ? stats[k] : dflt);
      return {
        handle: r.handle, runId: r.runId, gameVersion: r.gameVersion, outcome: outcome,
        finalWaveIndex: pick("finalWaveIndex", r.finalWaveIndex),
        finalWaveName: pick("finalWaveName", r.finalWaveName),
        deaths: stats.deaths | 0, kills: stats.kills | 0,
        timeSec: +(stats.timeSec || 0), sudsEarned: Math.floor(stats.sudsEarned || 0),
        wavesReached: Object.keys(r.wavesReached).map(Number).sort((a, b) => a - b),
        deathsByWave: r.deathsByWave,
        benedictions: r.benedictions.slice(), items: r.items.slice(),
      };
    },

    _finish(outcome, stats) {
      const payload = this.buildPayload(outcome, stats);
      this.run = null;   // one send per run — guards double-finish
      if (!payload) return;
      try { (this._transport || function () {})(payload); } catch (e) { /* never throw */ }
    },

    finishWin(stats) { this._finish("win", stats); },
    finishAbandoned() { if (this.run) this._finish("abandoned", {}); },

    fetchLeaderboard(cb) { if (this._fetchLb) this._fetchLb(cb); else if (cb) cb(null); },

    // Browser-only: real POST (sendBeacon → fetch fallback) + JSONP read.
    installBrowserTransport() {
      const self = this;
      this._transport = function (payload) {
        const body = JSON.stringify(payload);
        try {
          if (root.navigator && root.navigator.sendBeacon) {
            const blob = new root.Blob([body], { type: "text/plain" });
            if (root.navigator.sendBeacon(self.endpoint, blob)) return;
          }
        } catch (e) { /* fall through */ }
        try {
          root.fetch(self.endpoint, { method: "POST", mode: "no-cors", keepalive: true,
            headers: { "Content-Type": "text/plain" }, body: body });
        } catch (e) { /* swallow */ }
      };
      this._fetchLb = function (cb) {
        if (!self.endpoint) { if (cb) cb(null); return; }
        const name = "jhLb_" + Math.floor(Math.random() * 1e9);
        let done = false, s = null;
        const finish = function (data) {
          if (done) return; done = true;
          try { delete root[name]; } catch (e) { root[name] = undefined; }
          if (s && s.parentNode) s.parentNode.removeChild(s);
          if (cb) cb(data);
        };
        root[name] = function (data) { finish(data); };
        s = root.document.createElement("script");
        s.src = self.endpoint + (self.endpoint.indexOf("?") >= 0 ? "&" : "?") + "cb=" + name + "&_=" + Date.now();
        s.onerror = function () { finish(null); };
        root.document.head.appendChild(s);
        root.setTimeout(function () { finish(null); }, 6000);
      };
    },
  };

  root.JH = root.JH || {};
  root.JH.Telemetry = Telemetry;
  if (typeof module !== "undefined" && module.exports) module.exports = Telemetry;
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/telemetry.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS (existing ~214 tests + 6 new).

- [ ] **Step 6: Commit**

```bash
git add js/telemetry.js tests/telemetry.test.js
git commit -m "feat(telemetry): run-record engine with injectable transport + tests"
```

---

### Task 2: Config block + script load + browser init + handle prompt

**Files:**
- Modify: `js/config.js` (add block near top, after the Rendering block ~line 15)
- Modify: `index.html:103` (add script tag after `config.js`)
- Modify: `js/game.js` — `bindUI` (init + beforeunload), add `_playerHandle()` helper

**Interfaces:**
- Consumes: everything from Task 1.
- Produces: `JH.TELEMETRY = { endpoint, enabled, version }`; `Game._playerHandle()` → string (empty = anonymous).

- [ ] **Step 1: Add the config block**

In `js/config.js`, after `JH.MAX_STEPS = 5;` (line 15), add:

```js
  // ---- Telemetry / leaderboard ---------------------------------------
  // Paste the Google Apps Script /exec URL into `endpoint` to enable data
  // collection + the leaderboard. Empty endpoint or enabled:false = inert
  // (no network, game unchanged). `version` is bumped by the release ritual.
  JH.TELEMETRY = {
    endpoint: "",       // e.g. "https://script.google.com/macros/s/AKfy.../exec"
    enabled: true,
    version: "0.28.0",
  };
```

- [ ] **Step 2: Add the script tag**

In `index.html`, after line 103 (`<script src="js/config.js"></script>`), add:

```html
  <script src="js/telemetry.js"></script>
```

- [ ] **Step 3: Init telemetry + abandon-on-unload in bindUI**

In `js/game.js`, inside `bindUI()` (starts at line 63), immediately after `const startAudio = ...;` (line 64), add:

```js
      // Telemetry: configure from JH.TELEMETRY, install the real transport,
      // and flush an "abandoned" record if the tab closes mid-run.
      if (JH.Telemetry) {
        JH.Telemetry.configure({
          endpoint: JH.TELEMETRY.endpoint, enabled: JH.TELEMETRY.enabled,
          gameVersion: JH.TELEMETRY.version,
        });
        JH.Telemetry.installBrowserTransport();
        window.addEventListener("beforeunload", () => {
          try { JH.Telemetry.finishAbandoned(); } catch (e) { /* ignore */ }
        });
      }
```

- [ ] **Step 4: Add the handle helper**

In `js/game.js`, add a method near `startGame` (before line 319):

```js
    // Leaderboard handle, prompted ONCE ever (localStorage). A blank answer
    // is stored and honored — telemetry stays fully off for that player.
    _playerHandle() {
      try {
        let h = window.localStorage.getItem("jh_handle");
        if (h === null) {
          const raw = window.prompt(
            "Enter a name for the leaderboard\n(leave blank to play anonymously — no data sent):", "") || "";
          window.localStorage.setItem("jh_handle", raw.trim().slice(0, 20));
          h = window.localStorage.getItem("jh_handle");
        }
        return h || "";
      } catch (e) { return ""; }
    },
```

- [ ] **Step 5: Verify the game still boots (no telemetry yet wired to runs)**

Run: `npm test`
Expected: PASS (no test regressions; this task adds no unit tests — it is wiring verified in Task 3's headless step).

- [ ] **Step 6: Commit**

```bash
git add js/config.js index.html js/game.js
git commit -m "feat(telemetry): config block, script load, browser init + handle prompt"
```

---

### Task 3: Wire gameplay hooks + headless verification

**Files:**
- Modify: `js/game.js` — `startGame` (start hook), `startWave` (reached), `startPlayerDeathSeq` (death), `win` (finishWin), shop dispatch (item)
- Modify: `js/entities.js` — `Sigil.pick` (benediction)

**Interfaces:**
- Consumes: `JH.Telemetry.*` (Task 1), `Game._playerHandle()` (Task 2).

- [ ] **Step 1: Start-run hook in `startGame`**

In `js/game.js` `startGame()`, after `this.state = "play";` (line 349), add:

```js
      if (JH.Telemetry) JH.Telemetry.startRun(this._playerHandle());
```

- [ ] **Step 2: Wave-reached hook in `startWave`**

In `js/game.js` `startWave(i)`, after `this.waveIndex = i;` (line 366), add:

```js
      if (JH.Telemetry) JH.Telemetry.waveReached(i, (JH.LEVEL1.waves[i] || {}).name || "");
```

- [ ] **Step 3: Death hook in `startPlayerDeathSeq`**

In `js/game.js` `startPlayerDeathSeq()`, after `this.deathCount = (this.deathCount || 0) + 1;` (line 1314), add:

```js
      if (JH.Telemetry) JH.Telemetry.death(this.waveIndex);
```

- [ ] **Step 4: Win hook in `win`**

In `js/game.js` `win()`, after `this.state = "win";` (line 1293), add:

```js
      if (JH.Telemetry) JH.Telemetry.finishWin({
        timeSec: this.elapsed, kills: this.kills, deaths: this.deathCount || 0,
        sudsEarned: this.player.sudsEarned, finalWaveIndex: this.waveIndex,
        finalWaveName: (JH.LEVEL1.waves[this.waveIndex] || {}).name || "",
      });
```

- [ ] **Step 5: Item hook in the shop dispatch**

In `js/game.js`, the purchase dispatch sets `ok` across `node`/`rep`/`consumable`/`relic` branches (lines 1445–1460). Immediately after the closing `}` of that `if/else if` chain (the line after the relic branch closes, ~1461), add:

```js
              if (ok && JH.Telemetry) JH.Telemetry.item(e.kind + ":" + e.id);
```

(Record the kind-qualified id so `node:pressure` and `relic:pressure` never collide.)

- [ ] **Step 6: Benediction hook in `Sigil.pick`**

In `js/entities.js` `Sigil.pick(game)`, after `JH.Benedictions.take(this.offer.id);` (line 2641), add:

```js
      if (JH.Telemetry) JH.Telemetry.benediction(this.offer.id);
```

- [ ] **Step 7: Headless verification with a transport spy**

Use the `headless-playtest` skill. Drive a short run and assert the payload. Minimal harness assertions to run in-page after starting a game, killing enough to trigger `win()` via the dev jump (or `Game.devGotoWallBoss` path), OR simply call the hooks through real play and force a win:

In the page context (via the headless harness), before starting:

```js
window.__tel = [];
JH.Telemetry.configure({ endpoint: "https://example.invalid/exec", enabled: true, gameVersion: "test" });
JH.Telemetry.setTransport((p) => window.__tel.push(p));
localStorage.setItem("jh_handle", "Tester");
```

Then start a run, advance at least one wave (`Game.startWave(0)` fires the hook), trigger a death (`Game.startPlayerDeathSeq()`), then `Game.win()`. Assert:

```js
const p = window.__tel[window.__tel.length - 1];
console.assert(p && p.outcome === "win", "win payload sent");
console.assert(p.handle === "Tester", "handle attributed");
console.assert(Array.isArray(p.wavesReached) && p.wavesReached.length >= 1, "wave recorded");
console.assert(typeof p.timeSec === "number", "timeSec present");
```

Also verify opt-out: `localStorage.setItem("jh_handle","")`, restart, `Game.win()` → `window.__tel` gains no new entry.

Confirm the run boots and plays normally with the default empty endpoint (telemetry inert).

- [ ] **Step 8: Run full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add js/game.js js/entities.js
git commit -m "feat(telemetry): wire run/wave/death/win/item/benediction hooks"
```

---

### Task 4: Apps Script backend + deploy doc

**Files:**
- Create: `tools/telemetry.gs`
- Create: `docs/telemetry-setup.md`

**Interfaces:**
- Consumes: the payload schema from Task 1 (`buildPayload`).
- Produces: a `/exec` URL the user pastes into `JH.TELEMETRY.endpoint`; JSONP `doGet` returns `[{handle,timeSec,deaths}]` (top 10 wins).

- [ ] **Step 1: Write the Apps Script**

Create `tools/telemetry.gs`:

```js
// telemetry.gs — Google Apps Script Web App bound to a Sheet.
// Deploy: Extensions > Apps Script > paste this > Deploy > New deployment
//   > type Web app > Execute as: Me > Who has access: Anyone > copy /exec.
// See docs/telemetry-setup.md. Column order MUST match the client payload.

var SHEET = "runs";
var HEADERS = ["ts", "handle", "runId", "gameVersion", "outcome",
  "finalWaveIndex", "finalWaveName", "deaths", "kills", "timeSec",
  "sudsEarned", "wavesReached", "deathsByWave", "benedictions", "items"];

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET);
  if (!sh) { sh = ss.insertSheet(SHEET); sh.appendRow(HEADERS); }
  return sh;
}

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    sheet_().appendRow([
      new Date(), d.handle || "", d.runId || "", d.gameVersion || "", d.outcome || "",
      d.finalWaveIndex, d.finalWaveName || "", d.deaths || 0, d.kills || 0,
      d.timeSec || 0, d.sudsEarned || 0,
      JSON.stringify(d.wavesReached || []), JSON.stringify(d.deathsByWave || {}),
      JSON.stringify(d.benedictions || []), JSON.stringify(d.items || [])
    ]);
  } catch (err) { /* drop malformed */ }
  return ContentService.createTextOutput("ok").setMimeType(ContentService.MimeType.TEXT);
}

function doGet(e) {
  var cb = (e && e.parameter && e.parameter.cb) ? e.parameter.cb : "";
  var top = [];
  try {
    var rows = sheet_().getDataRange().getValues();
    var idx = {}; HEADERS.forEach(function (h, i) { idx[h] = i; });
    var wins = [];
    for (var i = 1; i < rows.length; i++) {
      var r = rows[i];
      if (r[idx.outcome] === "win") {
        wins.push({ handle: r[idx.handle], timeSec: Number(r[idx.timeSec]), deaths: Number(r[idx.deaths]) });
      }
    }
    wins.sort(function (a, b) { return a.timeSec - b.timeSec; });
    top = wins.slice(0, 10);
  } catch (err) { /* empty board on error */ }
  var json = JSON.stringify(top);
  var out = cb ? (cb + "(" + json + ")") : json;
  return ContentService.createTextOutput(out)
    .setMimeType(cb ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

// Spreadsheet menu: Telemetry > Rebuild matrix — per-wave reached/deaths/rate.
function onOpen() {
  SpreadsheetApp.getUi().createMenu("Telemetry")
    .addItem("Rebuild matrix", "buildMatrix").addToUI();
}

function buildMatrix() {
  var rows = sheet_().getDataRange().getValues();
  var idx = {}; HEADERS.forEach(function (h, i) { idx[h] = i; });
  var reached = {}, deaths = {}, maxW = 0;
  for (var i = 1; i < rows.length; i++) {
    var wr = [], db = {};
    try { wr = JSON.parse(rows[i][idx.wavesReached] || "[]"); } catch (e) {}
    try { db = JSON.parse(rows[i][idx.deathsByWave] || "{}"); } catch (e) {}
    wr.forEach(function (w) { reached[w] = (reached[w] || 0) + 1; maxW = Math.max(maxW, Number(w)); });
    for (var k in db) { deaths[k] = (deaths[k] || 0) + Number(db[k]); maxW = Math.max(maxW, Number(k)); }
  }
  var out = [["wave", "reached", "deaths", "deathRate"]];
  for (var w = 0; w <= maxW; w++) {
    var rc = reached[w] || 0, dc = deaths[w] || 0;
    out.push([w, rc, dc, rc ? dc / rc : 0]);
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var m = ss.getSheetByName("matrix"); if (!m) m = ss.insertSheet("matrix"); else m.clear();
  m.getRange(1, 1, out.length, 4).setValues(out);
}
```

- [ ] **Step 2: Write the deploy doc**

Create `docs/telemetry-setup.md`:

```markdown
# Telemetry / Leaderboard — backend setup (one-time)

1. Create a new Google Sheet (any name).
2. Extensions → Apps Script. Delete the stub, paste `tools/telemetry.gs`, Save.
3. Deploy → New deployment → gear ⚙ → **Web app**.
   - Description: "jon-hose telemetry"
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Deploy → authorize when prompted → copy the **Web app URL** (ends `/exec`).
4. Paste that URL into `JH.TELEMETRY.endpoint` in `js/config.js`, commit, deploy.
5. Reload the Sheet once — a **Telemetry** menu appears (from `onOpen`).

## Reading the data
- **Raw log:** the `runs` tab — one row per run.
- **Death-rate matrix:** Telemetry menu → **Rebuild matrix** → writes/refreshes
  the `matrix` tab (`wave, reached, deaths, deathRate`). Re-run to refresh.
- **Leaderboard:** the game reads top-10 fastest wins live via the same URL; to
  eyeball it, sort `runs` by `timeSec` ascending, filtered to `outcome = win`.

## Changing the deployment
Re-deploy as a **new version** of the SAME deployment so the `/exec` URL is
stable. A brand-new deployment mints a new URL and would need a config update.

## Privacy
Only what the client sends (handle + gameplay stats) is stored. A blank handle
means the client sends nothing at all.
```

- [ ] **Step 3: Verify the doc + script are self-consistent**

Manually confirm `HEADERS` order in `telemetry.gs` matches the keys in Task 1's `buildPayload` (handle, runId, gameVersion, outcome, finalWaveIndex, finalWaveName, deaths, kills, timeSec, sudsEarned, then the four JSON columns). No code to run.

- [ ] **Step 4: Commit**

```bash
git add tools/telemetry.gs docs/telemetry-setup.md
git commit -m "feat(telemetry): Apps Script backend + one-time setup doc"
```

---

### Task 5: In-game leaderboard screen

**Files:**
- Modify: `index.html` — add a leaderboard button to the title menu + win screen, and a `#screen-leaderboard` overlay
- Modify: `js/game.js` — `data-action` wiring for `leaderboard`/`close-leaderboard`, and `openLeaderboard()` render

**Interfaces:**
- Consumes: `JH.Telemetry.fetchLeaderboard(cb)` (Task 1), `showScreen` (existing).

- [ ] **Step 1: Add the leaderboard button + screen to `index.html`**

In the title menu (`index.html`, inside `<div class="menu">`, after the start button line 22):

```html
          <button class="btn" data-action="leaderboard">LEADERBOARD</button>
```

On the win screen, after the "PLAY AGAIN" button (line 74):

```html
        <button class="btn" data-action="leaderboard">LEADERBOARD</button>
```

After the win `</section>` (line 75), add the overlay:

```html
      <!-- LEADERBOARD -->
      <section id="screen-leaderboard" class="overlay hidden">
        <h2>FASTEST WINS</h2>
        <ol id="lb-list" class="stats"><li>Loading…</li></ol>
        <button class="btn" data-action="close-leaderboard">BACK</button>
      </section>
```

- [ ] **Step 2: Wire the buttons in `bindUI`**

In `js/game.js` `bindUI`, extend the `data-action` dispatch (lines 73–75) — add two branches:

```js
          else if (a === "leaderboard") this.openLeaderboard();
          else if (a === "close-leaderboard") this.showScreen(this.state === "win" ? "screen-win" : "screen-title");
```

- [ ] **Step 3: Add `openLeaderboard` render**

In `js/game.js`, add a method (near `win`, ~line 1300):

```js
    openLeaderboard() {
      const list = document.getElementById("lb-list");
      list.innerHTML = "<li>Loading…</li>";
      this.showScreen("screen-leaderboard");
      const render = (rows) => {
        if (!rows || !rows.length) { list.innerHTML = "<li>No wins yet — be the first.</li>"; return; }
        list.innerHTML = rows.map((r, i) =>
          "<li>" + (i + 1) + ". " + escapeHtml(r.handle || "anon") +
          " — " + Number(r.timeSec).toFixed(1) + "s (" + (r.deaths | 0) + " deaths)</li>").join("");
      };
      if (JH.Telemetry && JH.Telemetry.fetchLeaderboard) JH.Telemetry.fetchLeaderboard(render);
      else render(null);
    },
```

Add a small local helper near the top of `game.js` (module scope, after `const JH = ...` at file top) if no HTML-escaper exists:

```js
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
```

(First grep `game.js` for an existing `escapeHtml`/`escape` helper; reuse it if present rather than adding a duplicate.)

- [ ] **Step 4: Headless verification (screenshot + empty/failure states)**

Use the `headless-playtest` skill:
- Stub `JH.Telemetry.fetchLeaderboard = (cb) => cb([{handle:"Ash",timeSec:88.4,deaths:0},{handle:"Bo",timeSec:96.1,deaths:2}])`, click LEADERBOARD from the title, screenshot — expect two ranked rows.
- Stub `fetchLeaderboard = (cb) => cb(null)` → expect the "No wins yet" empty state.
- Confirm BACK returns to the title, and (from a win) returns to the win screen.

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html js/game.js
git commit -m "feat(telemetry): in-game fastest-win leaderboard screen"
```

---

## Post-implementation

- **Playtest gate (CLAUDE.md rule 1):** hold the whole stack for the user's playtest — do NOT merge to `main` until they say so. The default empty `endpoint` keeps the shipped game behavior-identical until the user completes the one-time backend deploy and pastes the URL.
- **Release (CLAUDE.md rule 2):** this is a designed pass with its own spec → **minor bump 0.28.0**, patch name (e.g. "Field Notes"). Bump `package.json` + `JH.TELEMETRY.version` + `CHANGELOG.md`, titled merge, via the `release` skill.
- **Branch:** `telemetry-leaderboard` (off `main`).

## Self-Review

- **Spec coverage:** backend (T4) ✓, matrix metric reached-vs-died (T1 payload + T4 buildMatrix) ✓, fastest-win leaderboard write+read+UI (T1/T4/T5) ✓, handle prompt + blank opt-out (T2/T1 tests) ✓, run timer = elapsed (T3 win hook) ✓, transport/CORS no-cors+JSONP (T1 installBrowserTransport) ✓, GitHub Pages static-safe (no CSP; T2 script tag only) ✓, config master switch (T2) ✓, abandoned-on-unload (T2/T1) ✓, testing unit+headless (T1/T3/T5) ✓.
- **Placeholder scan:** none — every code step contains full content.
- **Type consistency:** `finishWin` stats keys (`timeSec,kills,deaths,sudsEarned,finalWaveIndex,finalWaveName`) match `buildPayload`'s `pick`/reads; `item` id format `kind:id` used in T3 and asserted in T1 test; `fetchLeaderboard(cb)` shape `[{handle,timeSec,deaths}]` matches `doGet` output and T5 render; `HEADERS` order matches `buildPayload` field order.
