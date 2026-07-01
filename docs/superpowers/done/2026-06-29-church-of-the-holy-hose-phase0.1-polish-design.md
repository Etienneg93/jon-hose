# Church of the Holy Hose — Phase 0.1 Polish — Design

**Date:** 2026-06-29
**Status:** Approved (playtest-driven rework of Phase 0).
**Builds on:** `2026-06-29-church-of-the-hose-phase0-death-loop-design.md` (the loop)
and the playtest notes from the first desktop test.

## Why

Phase 0 proved the loop but felt bare and menu-heavy. This pass makes it
**player-in-control and visual**: proximity activations (like the shop),
walk-into transitions, in-world icon stations, a ghosted real-Jon sprite, and a
materializing Father Jon. No new systems — it reworks presentation + the
checkpoint rule. Final art is generated separately (asset list:
`2026-06-29-church-of-the-holy-hose-asset-list.md`) and blits into the seams.

## Changes

### 1. Respawn at the last fire hydrant + "try again" wave re-arm
Replace act-start respawn. Track the **last hydrant the player was near**
(`JH.HYDRANTS` index) during play. On return from the Church, place Jon at that
hydrant (or the level start if none visited), full HP. The wave he died in is
**not** marked cleared — walking back to its trigger re-runs `startWave`, spawning
its enemies fresh: a clean "try again." Build + Suds intact (no `Upgrades.reset`).
- Files: `js/game.js` — track `lastHydrant` in the hydrant-proximity loop;
  rename/replace `respawnAtCheckpoint` → `respawnAtHydrant` (position at hydrant x,
  `waveIndex = diedWave - 1`, `waveActive = false`, enemies cleared).

### 2. Ghost Jon (real sprite, no spray)
The Church "spirit" is the **actual Jon sprite** (`Assets.jon` painter) rendered
**translucent + cyan tint**, with the walk animation — not a placeholder rectangle.
Spray/water are unavailable in the Church (the `church` state never processes spray
input; render shows no water tank). Identity preserved.
- Files: `js/church.js` — scene draws Jon via the existing painter with
  `ctx.globalAlpha` + tint; track a frame counter for the walk cycle.

### 3. Father Jon materializes + explains Holy Essence
When the ghost walks **past a threshold x** (`JH.CHURCH.layout.fatherX`), Father
Jon **materializes** (warp/fade-in FX) and **initiates dialogue automatically**.
First visit: in-character tutorial — what Holy Essence is, how it's earned
(redeeming boss-allies), how it's spent (blessing at the stations). Repeat visits:
a short line. Player keeps walking control otherwise.
- Files: `js/config.js` — `layout.fatherX`, expanded `sermon` copy (tutorial +
  repeats); `js/church.js` — threshold trigger, materialize FX, dialogue overlay
  (reuse portrait/box pattern).

### 4. Proximity blessing stations (no face-menu)
Remove the full-screen altar menu. Place **three in-world stations** at fixed x
(`layout.stations`: dmg / hp / water). Each **glows and animates when the player
is near** (proximity, like the shop NPC). Near a station, show a compact prompt
(icon + name + essence cost + "Press E"); **E** spends essence via
`buyBlessing(id)`. No modal; the player walks freely between stations.
- Files: `js/config.js` — `layout.stations` (id + x per blessing); `js/church.js`
  — station objects, per-station proximity + glow/anim state, E-to-buy, draw
  icon/pedestal (PNG via `JH.ChurchArt`, ctx fallback).

### 5. Walk-into portal + smooth transition
The portal is a **trigger zone** at `layout.portalX`. Walking into it (overlap)
starts an **exit transition**: portal `envelop` FX wraps Jon → **fade to black**
→ `respawnAtHydrant` → **world fades back in**. No prompt, no menu.
- Files: `js/church.js` — `exiting` sub-phase with a transition timer + envelop
  draw, fade-to-black overlay; `js/game.js` — a `worldFadeIn` timer on respawn
  that ramps a black overlay from opaque → clear over ~0.6s.

### 6. Mega Man-style warp on world re-entry
On respawn, Jon **materializes** with a warp-beam/teleport-in animation at the
hydrant (and dematerializes when stepping into the portal). Cosmetic; gates no
input beyond the brief transition.
- Files: `js/game.js` — a `warpInT` timer + render (beam column / materialize),
  played at the start of the world fade-in; `js/assets.js` — `JH.ChurchArt`
  warp-beam frames (PNG; simple ctx fallback).

### 7. Art seams
Extend `JH.ChurchArt` (`js/assets.js`) for the new assets (station base/icon/hover,
portal idle/envelop, warp beam, Father Jon NPC + portraits). All blit-with-fallback
(`neighbor` pattern) so the rework is playable on placeholders until art lands.

## Out of scope
- Final art (user-generated, per the asset list).
- New bosses / elements beyond Earth (Phase 3), gear economy (Phase 1), talent
  tree (Phase 2).
- Difficulty re-tuning around the now-gentler death loop.

## Verification (manual playtest)
- Die mid-wave → return places Jon at the **last hydrant**, full HP; walking back
  re-spawns the wave fresh.
- Church: ghosted real Jon, no spray. Walk past the threshold → Father Jon
  materializes + tutorial (first visit) / short line (repeat).
- Approach a station → it glows/animates + prompt; **E** spends essence, blessing
  persists after reload; can't buy with 0 essence.
- Walk into the portal → envelop → fade out → warp-in at the hydrant → world fades
  in. No menus anywhere in the Church.
