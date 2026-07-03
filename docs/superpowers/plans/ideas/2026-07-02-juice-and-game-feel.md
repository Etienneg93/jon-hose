# Juice & Game-Feel Pass — Hit-Stop, Shake Budget, Kill Confirms, Sound Layers

> **STATUS: items 1–5 SHIPPED** (main ba5ba28, 2026-07-02) via docs/superpowers/plans/2026-07-02-juice-pass.md — with playtest-driven divergences (zero combat freezes; wetness hurt read; collapse kill confirm). **Items 6–8 OPEN** (spray audio loop, boss presentation beats, low-HP/water readability).

**Date:** 2026-07-02 · **Priority: Must-explore** · **Scope: M (each numbered item lands independently; most are S)**

## Problem statement (what the code does today)

The foundations exist but are used at maybe 30% of their potential:

- **Hit-stop** exists (`game.hitStop(secs)`, `game.js` ~712; particles/embers keep animating during it — the right architecture) but only two callers use it: enemy death at 0.04s (`Enemy.die`, `entities.js` ~788) and the player taking a hit at 0.06s (`Player.takeHit` ~604). Boss hits, wave-enders, and phase transitions get nothing.
- **Screenshake** is a single accumulator clamped at 12, linear 24/s decay, uniform random translate (`game.js` ~710, ~988, ~1236). Big and small events pool into the same wobble; there's no direction and no per-source discipline — `shake(3)` is sprinkled across ~20 call sites by vibe.
- **Hit reactions:** enemies get a white-silhouette flash (the offscreen-canvas compositor, `assets.js` ~211–262) *plus* an every-other-frame blink (`if (opt.hurt && (f & 1)) return;` in nearly every painter, e.g. `assets.js:383`). The blink deletes the sprite half the time — it reads as flicker, not impact, and fights the nice silhouette flash.
- **Kill confirm** is a 10-particle burst + coin scatter (`Enemy.die`). Regular kills, elite kills, and wave-clearing kills all look identical. The GUSH combo (`game.js` ~676, `drawCombo` ~1765) is deliberately cosmetic and currently feeds back into nothing, not even audio.
- **Sound** is procedural WebAudio blips (`JH.SFX`, `config.js` ~552): spray is a 0.08s noise burst re-triggered every 0.05s (`doSpray` ~396) — an audible machine-gun stutter for the game's *primary verb*. `hit` (220Hz square) fires per spray tick regardless of target. No layering, no pitch variation, no ducking.
- The **FX pack pipeline** (`JH.FX` manifest + `Assets.drawFx` + `FxBurst`) shipped for fire/explosions and is the proven template for everything below — no new art tech needed.

## The ideas (ordered by feel-per-effort)

### 1. Hit-stop tier table (S) — biggest single win
One source of truth, e.g. `JH.JUICE.hitstop`:

| Event | Freeze | Today |
|---|---|---|
| regular kill | 0.05 | 0.04 |
| elite / heavy (bulwark, furnace, smelt) kill | 0.09 | 0.04 |
| **last kill of a wave** | 0.14 + shake 5 | — |
| player hit | 0.07 | 0.06 |
| boss phase transition | 0.20 | — |
| dome pop / wall break | 0.10 | wall: shake only |

Prerequisite: **stop eating inputs during freeze** — `update()` polls then early-returns during hit-stop (`game.js` ~1038), so `pressed()` edges (dash!) vanish. Buffer edge-presses ~130ms (see controls spec). Hit-stop that eats your dodge is anti-juice.

### 2. Trauma-based directional shake (S)
Replace the linear accumulator with the standard trauma model (`shake = trauma²`), add an optional direction bias (kick 60% away from impact), and a per-source budget table so a Quake stomp (11) and a coin pickup can't pool. Add `JH.JUICE.shakeScale` for the accessibility slider. All ~20 `shake(n)` call sites keep working — only the accumulator changes.

### 3. Kill the hurt-blink, keep the flash; add squash (S)
Delete the `(f & 1) return` blink from enemy painters; the white-silhouette flash (already alpha-managed via `HURT_FLASH_MAX_ALPHA`) becomes the one hurt read. Add `opt.squash` driven by a short timer on hit: draw at `scaleX 1.15 / scaleY 0.85` decaying over ~90ms (painters already accept a `scale` hint — elites use 1.08). Fuse drop-ins get a landing squash for free.

### 4. Kill confirms that scale with the kill (S/M)
- Regular: current burst + a 1-frame white silhouette pop at 1.3× scale (the boss strobe in `game.js` ~1279 proves the filter trick; per-enemy it's one draw call).
- Heavy/elite: `boom-small`/`boom-mid` FxBurst (already used by Fuse/Smelt deaths — extend to elite deaths) + a lingering **wet ground splat decal** (flattened ellipse, fades ~2s). Water kills leaving puddles is on-theme and later hooks benediction synergies.
- **Wave-ender:** the 0.14 hit-stop above + all pickups' magnet radius briefly jumps from 30px (`Pickup.update`, `entities.js` ~1610) to arena-wide, vacuuming loot to Jon. Reward beat + kills the post-wave coin-walk.

### 5. GUSH combo: audio ladder + a capped mechanical crumb (S)
Kill sounds pitch up a semitone per combo step (procedural SFX make this trivial — scale `freq` by `2^(n/12)`, cap +12), resetting on drop; every 5th kill milestone (already shakes, `game.js` ~683) refunds **+10 water and skips the regen delay once**. Small enough to stay honest to the "cosmetic feedback" comment, big enough that the meter matters. The vision doc already flags "tie GUSH to an ability later" — this is the minimum version.

### 6. Spray sound done right (M — biggest audio win)
Replace the re-triggered noise burst with a **looping noise node** started/stopped on spray, with a lowpass filter that tracks pressure tier (full = bright hiss, low = choked sputter — the audio *is* the pressure gauge), plus a separate impact layer (soft splatter loop) only while the stream is actually hitting something (`didHit` is already computed in `doSpray`). Curate a small audio pack the same way `tools/curate-fx.mjs` curated the fire pack.

### 7. Boss presentation beats (M)
- **Intro:** 0.8s camera punch-in on the boss (scale ctx transform around boss ~1.15× and ease back — render-only, no sim change) + name banner already exists.
- **Final blow:** before `startBossDeathSeq`, run 0.5s at 0.25× timescale (scale `dt` in the fixed-step accumulator — one multiplier in `frame()`), then the existing strobe/fade sequence. Music duck to 40% during the death seq (`JH.Music.setVolume` exists).
- **Phase transition:** hit-stop 0.20 + white flash + pattern-preview beat (see boss-pattern spec).

### 8. Player-state readability (S)
Low-HP (<25%): soft red vignette + 0.8Hz heartbeat blip. Low-water (<25%): stream droplets visibly thin (density already scales with beam tier — scale with pressure too, one factor in the emitter at `doSpray` ~394). Both gated behind the accessibility flash-intensity setting.

## Why it's fun

Hades' celebrated "chunk" is exactly this stack — tiered hit-stop, flash, squash, pitch-laddered kill audio — applied to *one* attack verb, which is also all Jon has. Because the hose is a continuous stream, discrete punctuation (kill pops, wave-ender freeze, pressure-tracking hiss) matters even more than in a melee game: it converts a fire-hose drone into readable beats. Nuclear Throne and Vlambeer's canon ("add hit-stop until it feels wrong, then halve it") are the tuning reference.

## Scope & sequencing

1 → 3 → 2 → 4 → 5 (each S, playtest-gated) → 6 → 7 (M). Everything except 6 is code-only against existing systems; no new art beyond one splat decal + optional audio pack.

## Open questions

1. Hit-stop during multi-kill frames (one spray tick kills 3 fuses): sum, cap, or take max? (Lean: max — sums get mushy.)
2. Timescale-based slow-mo interacts with `MAX_STEPS` spiral guard — clamp slow-mo dt scaling to ≥0.2 to stay safe?
3. Does the wet-splat decal need culling (array cap ~40, oldest-first) on holdout waves? Yes — same budget pattern as `dropBudget`.
4. Semitone ladder vs. Hades-style shimmer layers for combo audio — test both with the procedural synth before curating samples.
