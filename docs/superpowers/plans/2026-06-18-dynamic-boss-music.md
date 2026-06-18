# Dynamic Boss Music Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new slower-paced level theme as the default music and reuse the existing high-intensity track as shared boss music, cross-switching with a fast (~0.3s) fade when a boss fight starts and ends.

**Architecture:** Refactor `JH.Music` (`js/assets.js`) from a single `<audio>` element into a two-track player (`level` + `boss`) with a per-track fade gain and a self-contained fade timer. `js/game.js` calls `JH.Music.setTrack("boss")` / `setTrack("level")` at boss-start, boss-clear, win, and new-game reset points. Master volume/mute behavior (shared with SFX) is preserved.

**Tech Stack:** Plain ES5-ish JS on a single global `JH` namespace, HTML `<audio>` elements, no bundler, no modules. Game runs from `file://` or `npm run dev`.

## Global Constraints

- No bundler / no ES modules / no new dependencies — plain `<script>` globals on `window.JH`.
- **No test framework exists.** Verification is manual: `npm run dev` → http://localhost:5173, observe behavior. Each task lists exact manual checks.
- Single source of truth for tunables is `js/config.js`; do not hardcode balance numbers elsewhere. (Audio file paths and fade duration live in the `JH.Music` object, consistent with the existing code.)
- `volume` and `muted` on `JH.Music` are the **master** controls and are read by SFX (`js/assets.js:42-43`) and the HUD volume UI (`js/game.js:67-76`). Keep their names and semantics.
- localStorage key for audio prefs stays `jh_audio`.
- New level theme file path: `audio/jon-hose-stroll.mp3`. Boss track stays `audio/jon-hose-rush.mp3`.
- Code must degrade gracefully if an audio file is missing (no thrown errors; `play()` rejections swallowed).

---

### Task 1: Two-track `JH.Music` player with fader

**Files:**
- Modify: `js/assets.js:82-119` (replace the `Music` object)

**Interfaces:**
- Consumes: nothing new.
- Produces (relied on by Task 2 and existing code):
  - `JH.Music.volume` (number 0..1, master) — unchanged.
  - `JH.Music.muted` (bool, master) — unchanged.
  - `JH.Music.init()`, `JH.Music.start()`, `JH.Music.setVolume(v)`, `JH.Music.toggleMute()` — unchanged signatures.
  - `JH.Music.setTrack(name)` — NEW. `name` is `"level"` or `"boss"`. Quick-fades to that track. No-op if already current.
  - `JH.Music.reset()` — NEW. Resets to the `level` track at full gain, stops/rewinds the boss track, cancels any in-progress fade.
  - `JH.Music.current` — NEW. String name of the track that should be playing.

- [ ] **Step 1: Replace the `Music` object**

In `js/assets.js`, replace the entire current `Music` object (lines 82-118, from `const Music = {` through its closing `};`, but NOT the `JH.Music = Music;` line at 119) with:

```js
  const Music = {
    volume: 0.5, muted: false, started: false,
    current: "level",
    fadeDur: 0.3,                 // seconds — quick "cut-ish" fade
    _timer: null,                 // active fade interval handle
    tracks: {
      level: { src: "audio/jon-hose-stroll.mp3", el: null, gain: 1 },
      boss:  { src: "audio/jon-hose-rush.mp3",   el: null, gain: 0 },
    },

    init() {
      this.load();
      for (const name in this.tracks) {
        const t = this.tracks[name];
        try {
          t.el = new Audio(t.src);
          t.el.loop = true;
          t.el.preload = "auto";
        } catch (e) { t.el = null; }
      }
      this.current = "level";
      this.tracks.level.gain = 1;
      this.tracks.boss.gain = 0;
      this.apply();
    },

    // Effective element volume = master * per-track fade gain (0 when muted).
    apply() {
      for (const name in this.tracks) {
        const t = this.tracks[name];
        if (t.el) t.el.volume = this.muted ? 0 : this.volume * t.gain;
      }
    },

    _play(t) {
      if (!t || !t.el || !t.el.paused) return;
      const p = t.el.play();
      if (p && p.catch) p.catch(() => {});   // ignore autoplay rejections
    },

    start() {
      this.started = true;
      if (this.muted) return;
      this._play(this.tracks[this.current]);
    },

    // Quick fade (~0.3s): fade the current track out, then start the target.
    // Minimal overlap; no-op if already on `name`.
    setTrack(name) {
      if (!this.tracks[name] || name === this.current) return;
      const from = this.tracks[this.current];
      const to = this.tracks[name];
      this.current = name;
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      const t0 = performance.now();
      this._timer = setInterval(() => {
        const k = Math.min(1, (performance.now() - t0) / (this.fadeDur * 1000));
        if (from) from.gain = 1 - k;
        this.apply();
        if (k >= 1) {
          clearInterval(this._timer); this._timer = null;
          if (from && from.el && from !== to && !from.el.paused) from.el.pause();
          if (from) from.gain = 0;
          if (to) {
            to.gain = 1;
            if (to.el) { try { to.el.currentTime = 0; } catch (e) {} }
            if (this.started && !this.muted) this._play(to);
          }
          this.apply();
        }
      }, 16);
    },

    // Back to the level theme at full gain; stop/rewind boss; cancel fades.
    reset() {
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      this.current = "level";
      this.tracks.level.gain = 1;
      this.tracks.boss.gain = 0;
      const b = this.tracks.boss.el;
      if (b && !b.paused) { try { b.currentTime = 0; } catch (e) {} b.pause(); }
      this.apply();
    },

    setVolume(v) {
      this.volume = Math.max(0, Math.min(1, v));
      if (this.volume > 0) this.muted = false;
      this.apply();
      if (this.started) this.start();
      this.save();
    },
    toggleMute() {
      this.muted = !this.muted;
      this.apply();
      if (!this.muted && this.started) this.start();
      this.save();
    },
    save() { try { localStorage.setItem("jh_audio", JSON.stringify({ v: this.volume, m: this.muted })); } catch (e) {} },
    load() { try { const s = JSON.parse(localStorage.getItem("jh_audio")); if (s) { if (typeof s.v === "number") this.volume = s.v; this.muted = !!s.m; } } catch (e) {} },
  };
```

- [ ] **Step 2: Verify it loads without errors**

Run: `npm run dev`
Open http://localhost:5173, open the browser devtools Console.
Expected: no red errors on load. Title screen appears with its "build" tag.
Note: `audio/jon-hose-stroll.mp3` does not exist yet — the `level` track will be silent, but there must be **no thrown errors** (graceful degrade). The existing rush track file is present but `boss` starts at gain 0, so you will hear nothing yet. This is correct for this task.

- [ ] **Step 3: Verify master volume/mute UI still works**

Temporarily, to confirm playback wiring, in the Console run: `JH.Music.tracks.level.gain = 0; JH.Music.tracks.boss.gain = 1; JH.Music.apply(); JH.Music.start();`
Expected: the existing rush track plays. Then drag the on-screen volume slider and click the mute button.
Expected: slider changes loudness; mute button silences/restores it and toggles the 🔊/🔇 icon.
Reload the page afterward to discard the manual override.

- [ ] **Step 4: Commit**

```bash
git add js/assets.js
git commit -m "feat(audio): two-track Music player with quick-fade transition"
```

---

### Task 2: Wire boss/level transitions into the game flow

**Files:**
- Modify: `js/game.js:113` (startGame — reset to level), `js/game.js:148-153` (boss wave begins), `js/game.js:169-191` (waveCleared_ — back to level after mid-boss), `js/game.js:294-301` (win — back to level)

**Interfaces:**
- Consumes from Task 1: `JH.Music.setTrack("boss"|"level")`, `JH.Music.reset()`, `JH.Music.start()`.
- Produces: nothing new (pure wiring).

- [ ] **Step 1: Reset to the level theme on new game**

In `js/game.js`, in `startGame()`, change the music start (currently `js/game.js:113`) from:

```js
      JH.Music.start();
```

to:

```js
      JH.Music.reset();
      JH.Music.start();
```

- [ ] **Step 2: Switch to boss music when a boss wave begins**

In `js/game.js`, in `startWave(i)`, the `else if (wave.boss) {` branch (currently `js/game.js:148`), add the track switch right after the branch opens. Change:

```js
      } else if (wave.boss) {
        const bt = wave.bossType || "boss";
```

to:

```js
      } else if (wave.boss) {
        JH.Music.setTrack("boss");
        const bt = wave.bossType || "boss";
```

- [ ] **Step 3: Return to the level theme when a (mid-)boss area is cleared**

In `js/game.js`, in `waveCleared_()` (currently `js/game.js:169`), add the level switch at the very top of the method, right after `waveCleared_() {`. It is a no-op for non-boss waves because `setTrack` returns early when already on `"level"`. Change:

```js
    waveCleared_() {
      this.waveActive = false;
```

to:

```js
    waveCleared_() {
      JH.Music.setTrack("level");
      this.waveActive = false;
```

- [ ] **Step 4: Return to the level theme on victory**

In `js/game.js`, in `win()` (currently `js/game.js:294`), add the level switch at the top. Change:

```js
    win() {
      this.state = "win";
```

to:

```js
    win() {
      JH.Music.setTrack("level");
      this.state = "win";
```

- [ ] **Step 5: Verify transitions manually**

Run: `npm run dev` and open http://localhost:5173.
To make the (still-missing) level theme audible for testing, temporarily point it at the existing file: in the Console run `JH.Music.tracks.level.src = "audio/jon-hose-rush.mp3"; JH.Music.init(); JH.Music.start();` BEFORE starting a run is not enough since init recreates elements — instead just verify by ear using the boss track which exists, plus the gain values:
- Start a game. In Console, watch `JH.Music.current` — expect `"level"`.
- Walk to the **mid-boss** (The Big Drip). When the boss banner shows, `JH.Music.current` becomes `"boss"` and the rush track is audible within ~0.3s.
- Defeat / clear the mid-boss area → `JH.Music.current` returns to `"level"`.
- Reach and start the **final boss** (The Switch of Doom) → `JH.Music.current` is `"boss"`.
- Defeat it → win screen shows and `JH.Music.current` is `"level"`.
Expected: no console errors at any transition; `current` tracks the fights as described.

- [ ] **Step 6: Commit**

```bash
git add js/game.js
git commit -m "feat(audio): switch to boss music during boss fights"
```

---

### Task 3: Integrate the Suno level-theme asset and verify the build

**Files:**
- Create: `audio/jon-hose-stroll.mp3` (exported from Suno; binary asset)

**Interfaces:**
- Consumes from Task 1: `JH.Music.tracks.level.src === "audio/jon-hose-stroll.mp3"`.
- Produces: the playable level theme.

- [ ] **Step 1: Generate and place the track**

In Suno, generate an instrumental track using the style prompt from the spec (`docs/superpowers/specs/2026-06-18-dynamic-boss-music-design.md`, "Part 1"). Trim it to a clean loop, export as MP3, and save it as `audio/jon-hose-stroll.mp3` in the repo. (This is a manual creative step performed by the user; it does not block Tasks 1-2, which degrade gracefully without the file.)

- [ ] **Step 2: Verify the level theme plays and transitions for real**

Run: `npm run dev`, open http://localhost:5173, press a key to unlock audio.
Expected: the slow level theme loops during exploration and regular waves; it quick-fades to the rush track at each boss and quick-fades back after the mid-boss and on victory. No console errors.

- [ ] **Step 3: Verify the build includes the new audio**

Run: `npm run build`
Then confirm the file copied: `ls dist/audio`
Expected output includes both `jon-hose-rush.mp3` and `jon-hose-stroll.mp3`.
Run: `npm run preview` and open http://localhost:5174 — confirm music plays the same as in dev.

- [ ] **Step 4: Commit**

```bash
git add audio/jon-hose-stroll.mp3
git commit -m "feat(audio): add slow-paced level theme track"
```

---

## Notes for the implementer

- The order matters only loosely: Tasks 1 and 2 are pure code and can be done and committed before the audio file exists (they degrade gracefully). Task 3 finalizes the asset.
- Do not change `tools/build.mjs` — it already copies all of `audio/` recursively (`tools/build.mjs:36-38`) and only cache-busts JS/CSS URLs, which is exactly how the existing track already works.
- Keep the `JH.Music = Music;` line at `js/assets.js:119` intact when replacing the object.
