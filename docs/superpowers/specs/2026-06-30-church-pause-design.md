# Pausing in the Church

**Date:** 2026-06-30
**Status:** Approved design — to become an implementation plan.
**Context:** Escape (or gamepad Start) already opens a pause overlay (RESUME +
volume/mute) during regular play, freezing the world. The Church of the Holy
Hose (the death-interlude nave scene) has no pause support at all — `update()`
calls `JH.Church.updateScene(dt, this)` and returns early without ever
checking for the pause input, so Escape does nothing there.

## Goal

Pressing Escape while in the Church freezes the scene (Jon stops moving,
Father Jon's dialogue stops advancing, the exit fade stops) and shows the
existing pause overlay (RESUME + volume/mute) — exactly the same overlay used
in regular play, no new UI.

## Design

Add a new game state, `"churchPause"`, mirroring the existing
`"play"` <-> `"pause"` pair:

- **`togglePause()`** (`js/game.js:760`): add two branches —
  `"church"` -> `"churchPause"` (show `screen-pause`), and
  `"churchPause"` -> `"church"` (hide `screen-pause`). The return path does
  **not** call `showScreen("hud")` like the play-state resume does — Church
  hides the gameplay HUD on entry (`enterChurch()`, raw DOM call) and that
  must stay hidden, so resuming just removes the `hidden` class from
  `screen-pause` directly.
- **Pause-key gate** (`js/game.js:786`): the condition currently reads
  `this.state === "play" || this.state === "pause"`; extend it to also match
  `"church"` and `"churchPause"`.
- **`update()`** (`js/game.js:810` area): the existing
  `if (this.state === "church") { JH.Church.updateScene(dt, this); return; }`
  block gets a sibling — when state is `"churchPause"`, return immediately
  without calling `updateScene`. This is the actual freeze: every bit of
  Church motion (walking, dialogue timers, the exit fade) lives inside
  `updateScene`, so simply not calling it freezes the whole scene.
- **`render()`** (`js/game.js:963` area): the existing
  `if (this.state === "church") { ... JH.Church.renderScene(ctx, this); ... }`
  branch's condition is widened to `this.state === "church" || this.state ===
  "churchPause"`, so the last-rendered frame keeps being redrawn (static)
  underneath the pause overlay — matching how regular pause shows the frozen
  street scene behind the menu.

## Out of scope

- No new pause-menu options (confirmed: reuse the existing RESUME +
  volume/mute overlay as-is).
- No music/SFX pausing — regular pause doesn't stop `JH.Music` either, so
  Church pause won't either, for consistency.
- No changes to `JH.Church.updateScene`/`renderScene` themselves — they stay
  unaware that pausing exists; `game.js` simply stops calling one of them.

## Testing

This is pure state-machine wiring inside `game.js`'s `update`/`render`/
`togglePause`, which aren't unit-testable in isolation without a browser
(`game.js` depends on `window`/canvas at load, unlike the dual-exported
`church.js`/`balance.js`). Verification is a manual check: enter the Church,
press Escape, confirm the scene freezes and the pause overlay shows; press
Escape again (or click RESUME), confirm the scene resumes exactly where it
left off (including mid-dialogue and mid-exit-fade).
