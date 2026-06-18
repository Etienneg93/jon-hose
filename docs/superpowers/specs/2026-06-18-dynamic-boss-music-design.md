# Dynamic Boss Music — Design

**Date:** 2026-06-18
**Status:** Approved

## Summary

Jon Hose currently plays a single looping high-intensity track
(`audio/jon-hose-rush.mp3`) via `JH.Music` for the whole game. We are adding a
**new slower-paced level theme** (generated in Suno) as the default music, and
**repurposing the existing rush track as shared boss music** for both boss
encounters. The audio cross-switches with a fast ("cut-ish") fade when a boss
fight starts and ends.

There are two boss waves:
- Mid-boss **The Big Drip** (`js/config.js:144`, `boss: true`)
- Final boss **The Switch of Doom** (`js/config.js:149`, `boss: true, bossType: "switch"`)

## Decisions

- **Tracks:** one new slow level theme + the existing rush track reused for
  bosses. The rush track plays **only during the two boss fights**; the slow
  theme plays during all exploration and regular combat waves.
- **Transition:** quick fade (~0.3s), minimal overlap — fade current out, then
  start the other and fade it in.
- **Post-boss:** mid-boss cleared → fade back to the level theme. Final boss →
  `win()` fades back to the level theme for a calmer victory screen.

## Part 1 — Suno prompt (new slow level theme)

Goal: a slower, relaxed track in the **same NES chiptune world** as the rush
track so the quick-fade feels like the same game intensifying. Lower tempo,
sparser drums, more melodic lead, same timbres, compatible key.

Style prompt:

> Relaxed NES chiptune overworld theme, mid-slow tempo around 100 BPM, mellow
> square-wave lead playing a catchy laid-back melody, gentle triangle-bass
> groove, soft pulse arpeggios, light restrained drum-machine with airy hats and
> soft kicks; easygoing strolling feel with room to breathe, occasional cheerful
> chip glide and soft noise sweep; same bright crunchy arcade-clean 8-bit palette
> but calmer and warmer, loopable.

Cohesion tips: instrumental, Title "Jon Hose Stroll," nudge toward the same key
as the rush track if possible. Trim to a clean loop and export as
`audio/jon-hose-stroll.mp3`.

## Part 2 — Code design

### `JH.Music` refactor (`js/assets.js:82`)

Convert the single-element player into a two-track player with a fader.

- **Tracks:** `level` → `audio/jon-hose-stroll.mp3`, `boss` →
  `audio/jon-hose-rush.mp3`. Both `loop = true`, `preload = "auto"`.
- **Master volume/mute unchanged:** `volume` and `muted` remain the master
  controls and are still read by SFX (`js/assets.js:42-43`) and the HUD volume UI
  (`js/game.js:67-76`). localStorage key `jh_audio` unchanged.
- **Per-track gain:** each track has a `gain` (0→1 fade factor). Effective
  element volume = `muted ? 0 : volume * track.gain`.
- **`current`:** name of the track that should be playing; defaults to `level`.
- **`setTrack(name)`:** quick fade (~0.3s). Fade current track gain 1→0, pause
  it, set `current = name`, play target, fade its gain 0→1. No-op if `name`
  is already current (and not mid-fade to it). Driven by a small self-contained
  timer (e.g. `setTimeout`/`performance.now`), independent of the game loop so it
  works on any screen.
- **`start()`:** marks started and plays the `current` track.
- **`apply()`, `setVolume()`, `toggleMute()`, `save()`, `load()`:** preserved,
  updated to apply across both track elements.
- **Graceful degrade:** if `jon-hose-stroll.mp3` is missing, level audio is
  silent (`play().catch`) but the game and boss music still work.

### Hook points (`js/game.js`)

- Boss wave begins — `wave.boss` branch (`js/game.js:148`): `JH.Music.setTrack("boss")`.
- Mid-boss cleared — `waveCleared_` (`js/game.js:169`): `JH.Music.setTrack("level")`
  (no-op for non-boss waves, already on level).
- Final boss — `win()`: `JH.Music.setTrack("level")` for a calmer victory.
- New game / reset (`js/game.js:108-113`): ensure `current = "level"` before
  `start()`.

### Build

Confirm `tools/build.mjs` cache-busts `audio/jon-hose-stroll.mp3` the same way it
already handles `audio/jon-hose-rush.mp3`.

## Out of scope (YAGNI)

- Beat-synced / seamless musical transitions.
- Distinct per-boss themes.
- WebAudio rewrite of music playback.
