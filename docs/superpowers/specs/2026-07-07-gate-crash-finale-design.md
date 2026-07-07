# Gate Crash — post-Firewall finale for the Fire-Truck Escape

**Date:** 2026-07-07
**Branch:** `claude/fire-truck-minigame-concept-2pdlg0`
**Replaces:** the current instant Firewall despawn + flat 2s `arrive` timer
(`truck.js _breakFirewall` / `ARRIVE_T`).

## Overview

When the Firewall's weak spot breaks, the boss doesn't vanish — it detonates.
The explosion grows over a short authored sequence into a full whiteout; the
white fades back in on a transformed tableau: the Firewall is gone, a
cloud-lined walkway crosses the screen, and the Air World gate stands at the
far end. Jon has been thrown clear of the truck by the blast and lands on the
clouds; the empty truck keeps going, crashes into the gate, explodes, and
blows the gate open. The player then walks Jon up the walkway and through the
open gate, which hands off to the existing win stub (`afterTruckRun`).

Everything lives inside `js/truck.js` (the scene's own phase machine); no
`game.js` changes. All tunables live in a new `JH.TRUCKRUN.finale` config
block.

## Sequence — phase machine

`boss` now transitions into five new phases (the `arrive` phase and
`ARRIVE_T` are removed):

`boss → detonate → whiteout → reveal → crash → walk → _finish`

Timings below are the proposed starting values; every number goes in
`JH.TRUCKRUN.finale`.

### detonate (~1.8s)

Fires when `fw.hp <= 0` (replaces `_breakFirewall`'s despawn):

- The Firewall object stays on screen but goes **inert**: weak-spot cycle,
  SLAM, and SURGE all stop; its telegraphs clear.
- **Truck input locks** from here until the `walk` phase hands control back
  as Jon (no move, no spray; spray state forced off). Scroll speed eases to
  0 over ~0.8s.
- **Essence auto-banks** at the kill moment (`C.firewall.essence` →
  `sc.essence` + `JH.Church.addEssence`, with the +essence flash). No road
  pickup — the truck never drives past the kill point again.
- `_flash("FIREWALL DOWN!", 2.0)` as today.
- **Growing explosion:** `boom-mid` FxBursts pop at random points on the
  chassis at an accelerating cadence (~0.30s apart ramping to ~0.10s) with
  scale ramping up; screen shake ramps with the cadence.

### whiteout (~0.9s)

- One `boom-big` at the Firewall core.
- Full-screen white overlay alpha ramps 0 → 1 over 0.5s, then holds pure
  white for 0.4s.
- Behind the full white, the scene is restaged: hazards, fire patches,
  pickups, wash FX, and collapse-wall state all clear; the walkway tableau
  state is initialized (truck launch position, Jon's throw arc, gate closed).
- Truck HUD (water tank / HP readout) hides from the whiteout on.

### reveal (~1.4s)

White fades 1 → 0 over 1.2s onto the tableau (see composition below).
Already in motion as the white lifts:

- **The truck** (empty-cab `board.png` strip, wheels spinning fast) is
  speeding right along the walkway from ~x 140.
- **Jon** is mid-air, thrown from the blast: a ballistic arc entering from
  the upper-left, sprite rotating through the arc. He bounces once and
  settles in the lying pose (the `jon` painter's `death` state — he's fine)
  at ~x 110, with a small cloud poof on landing.

### crash (~1.6s)

The reveal → crash transition is **position-driven, not timed**: the crash
phase begins the moment the truck's x reaches the gate (≈1.2s after the
reveal starts at the proposed launch x/speed, i.e. right as the white
finishes lifting). On impact:

- Impact: a cluster of `boom-big` bursts + hard shake + brief micro-flash.
- The gate doors fling open (rotate/fall outward).
- The truck is replaced by the **wreck sprite** (`sprites/firetruck/wreck.png`,
  baked from `truck-broken.png`) at the gate's foot, dressed with `fire-small`
  licks and drifting smoke puffs.
- The **portal glow** (curated `portal` FX frames, looped) burns inside the
  open gate from now on.
- Jon lifts his head at the boom, then stands (lying → standing over ~0.6s).

### walk (untimed — player control)

- Prompt after Jon stands (e.g. "WALK ON →" via the scene banner).
- Input: **left/right only** (`JH.Input.held`), fixed walkway depth. Walk
  speed ≈ Jon's overworld speed; facing follows input; `jon` painter walk
  frames cycle while moving. Clamped to the walkway span (can't walk off the
  left edge).
- Walking into the gate glow (x ≥ gate threshold) **auto-enters**: a short
  blue-white fade (~0.6s), then `_finish(game)` → `afterTruckRun()` → the
  existing win stub. No E press required.
- The clean-escape bonus in `_finish` still applies (HP is frozen from the
  moment of the kill).

## Tableau composition (one 480px screen, no camera pan)

- **Backdrop:** truck.js draws its own pale Air World sky — soft dawn
  gradient, distant cloud banks, sun glow. `JH.Background` (fire world) is
  NOT drawn after the whiteout; the palette contrast is the point.
- **Left edge:** Firewall rubble — broken chassis chunks in the
  `JH.PAL.wallboss*` palette + smoke wisps.
- **Walkway:** a light cloud band across the former road area, lined top and
  bottom with procedural cloud puffs that bob and drift slowly.
- **Right edge (~x 430):** the Air World gate — procedural marble/cloud arch
  with two doors (closed until the crash), matching the "Firewall is
  procedural" precedent. After the crash: doors open, portal glow inside,
  wreck smoking at its foot.
- **Distances:** Jon lands ~x 110; gate threshold ~x 415 → roughly 300px of
  player walk.

## Art & FX

- **One new bake:** extend `tools/truck-sprite.mjs` to also bake
  `sprites/firetruck/wreck.png` from `truck-broken.png` (798×778, same
  pixel-aligned canvas as the other layers; already transparent). Needs a
  **dark-matte defringe** (the source has a near-black fringe ring + stray
  opaque near-black specks, including border pixels) — the existing cleanup
  targets white mattes. Single frame, no wheel animation (the art has the
  wheel off). Scale with the **same px-per-source-px factor as
  drive/board.png** so the wreck reads as the same truck, not renormalized to
  its own bbox height.
- **No new truck strip:** the empty-cab `board.png` drive strip already
  exists and is the runaway truck.
- Explosions: existing `boom-mid` / `boom-big` FX strips via `FxBurst`.
- Gate glow: existing curated `portal` FX frames, drawn in a manual loop
  (FxBurst is one-shot).
- Fire licks on the wreck: `fire-small` frames.
- Jon: existing `jon` painter (walk frames, `death` state for the landing,
  canvas rotation for the tumble). No new Jon art.

## Config

New `JH.TRUCKRUN.finale` block in `js/config.js` — the single home for every
number above: phase durations, boom cadence ramp, whiteout ramp/hold/fade
times, truck launch x/speed, Jon throw arc (launch point, apex, landing x),
gate x + threshold, walk speed, enter-fade time. No literals in truck.js.

## Tests & verification

- Pure helpers in `js/truckrun.balance.js` + `tests/truckrun.test.js`:
  - whiteout/white-in alpha curve (0→1 ramp, hold, 1→0 fade) as a pure
    function of phase time;
  - Jon's throw arc: position(t) lands at the configured x at the configured
    time;
  - detonate boom cadence ramp (interval as a function of phase progress);
  - walk clamp + gate-enter threshold predicate.
  - Tests derive from `JH.TRUCKRUN.finale`, not repeated literals.
- **Headless playtest** (project skill): drive the run, break the Firewall,
  screenshot each phase (detonate booms, full white, reveal tableau, wreck +
  open gate, Jon walking), assert the game reaches `afterTruckRun`.
- Per the playtest gate: gameplay changes stay uncommitted until the user
  plays them; this is part of the same fire-truck feature branch release.

## Out of scope

- The Air World itself (gate leads to the win stub until the Ass Man act).
- The Ass Man arrival teaser (still open in the assets/polish plan; the gate
  vista is a natural future home for it, but it is not part of this beat).
- Audio polish beyond reusing existing SFX (engine/impact sounds are in the
  assets/polish plan).
- Road/fire parallax, hydrant, wreck-obstacle art for the main run (separate
  plan).
