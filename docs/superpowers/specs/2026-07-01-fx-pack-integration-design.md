# FX Pack Integration — Design

Date: 2026-07-01
Status: Design (approved in session; portal addendum included)
Branch: next-level-pass

## Problem

Fire and explosion feedback is procedural placeholder (bezier flame tongues,
particle bursts) everywhere it appears. The user sourced itch.io effect packs
into `sprites/effects/` (local, untracked):

- **Pixel Fire Asset Pack** (Colored + Floored): 7 colors × 20 flame variants
  ("Group 4..7 - 1..5") × 8 frames, 32×48 pre-sliced PNGs + strip sheets +
  preview GIFs. "Floored" flames sit on the ground.
- **Explosions**: 8 variants — a (8f 32×32), b (8f 64×64), c (10f 128×80),
  d (12f 128×128), e (22f 192×192), f (8f 48×48), g (7f 48×48),
  2-b (12f 80×48) — pre-sliced + sheets.
- **Blue portal**: 6 frames, 32×32, pre-sliced (`portal-spritesheetblue1..6.png`).

The fire may read "campfire-tame" at native size/speed; drawn small, fast
(12–15fps), and layered on large patches it reads as ground fire. Speed/scale
are per-use dials, not per-asset.

## Goals

- Replace the procedural fire/explosion placeholders with the pack animations
  at every fire surface, plus the church return portal.
- Keep the repo lean: track only curated frames actually used.
- Make variant choice a one-line swap so the user can re-pick by eye in playtest.

## Non-goals

- No gameplay/mechanics changes — visuals only (hit boxes, radii, timings all
  unchanged).
- No elemental recolor work yet (blue/green/purple flames stay in the local
  pack for future use).
- The Slayer fireball keeps its new 8-ball + halo look (already shipped).

## Design

### 1. Asset curation + git hygiene

Copy ONLY the chosen variants into a tracked `sprites/fx/` tree:

| Dir | Source | Frames | Use |
|---|---|---|---|
| `sprites/fx/fire-small/` | Floored red/yellow, small-extent group | 8 | FirePatch tongues |
| `sprites/fx/fire-big/` | Floored red/yellow, wide-extent group | 8 | Douse objective flames |
| `sprites/fx/fire-jon/` | Colored (free-floating), small group | 8 | Burning player |
| `sprites/fx/boom-small/` | explosion-1-a or -f (~32–48px) | 7–8 | Fuse death |
| `sprites/fx/boom-mid/` | explosion-2-b or -c (~80px) | 10–12 | Smelt bomb impact, furnace vent |
| `sprites/fx/boom-big/` | explosion-1-d or -e (128–192px) | 12–22 | Boss deaths |
| `sprites/fx/portal/` | portal-spritesheetblue1..6 | 6 | Church return portal |

Frames are renamed on copy to `1.png..N.png` (uniform loader paths). Variant
defaults are picked by measuring each candidate group's non-transparent flame
extents (objective small/wide proxy); the user re-picks by eye via preview GIFs
during playtest.

`.gitignore` gains `sprites/effects/` (raw packs stay local as the picking
library — same policy as `sprites/**/gen/`). NOTE: the user's pending local
`.gitignore` edit (ignoring `generated-art/`) rides along in that commit,
acknowledged.

### 2. FX frame-player (the one new engine piece)

In `js/assets.js`:

- `Assets.registerFx(key, dir, frameCount, fps)` — loads `dir/1.png..N.png`
  via `JH.Loader.img`, stores `{ frames, fps }` in an fx registry.
- `Assets.drawFx(ctx, key, sx, sy, t, opt)` — frame = `t * fps`, **looping**
  (`opt.loop`, default true) or clamped one-shot; draws centered-bottom at
  (sx, sy) scaled by `opt.scale` (default 1), `opt.alpha`, optional
  `opt.flipX`. Skips silently while frames load (callers keep their existing
  procedural fallback until `img.complete`, or simply draw nothing for
  explosions).
- All variant path choices live in ONE map at the top of the FX block —
  one-line swaps.
- `JH.FxBurst` (`js/entities.js`) — one-shot entity riding `game.embers`
  (same pipeline as BossCore): `new JH.FxBurst(x, y, key, { scale })`, plays
  once at the registered fps, `dead` when the animation completes. Spawning
  an explosion anywhere is one `game.embers.push(...)`.

### 3. Surface wiring (visuals only; logic untouched)

| Surface | Change |
|---|---|
| **FirePatch.draw** | Keep scorch oval + shrink/extinguish fade; replace the procedural tongues with looping `fire-small` scaled to the patch radius (~0.5× source → 16×24 logical; 2 offset draws on large patches). Upgrades fuse deaths, smelt bombs, Slayer trail, furnace vents at once. |
| **Douse GardenBox** | Replace the placeholder bezier flame with `fire-big`, scaled by remaining extinguish fraction (shrinks as doused). Progress bar/prompts unchanged. |
| **Fuse death** | `FxBurst('boom-small')` at the death point + existing FirePatch; particle burst trimmed, not removed. |
| **Smelt bomb impact** | `FxBurst('boom-mid')` on landing (FirePatch unchanged). |
| **Furnace vent** | `FxBurst('boom-mid')` at vent fire (steam/ring FX and knockback unchanged). |
| **Boss deaths** | `FxBurst('boom-big')` in each death path (Big Drip, Switch, Quake, GK, Slayer) on top of existing coin fountain/core ejection. |
| **Jon burning** | Replace procedural tongues with 1–3 small `fire-jon` flames matching burn stacks (same offsets/count logic); the burn-glow priority rule stays. |
| **Church portal** | Replace the procedural rift at `layout.portalX` with the looping 6-frame blue portal (~32 logical tall, matching the walk-in interaction spot). |

Scale discipline (canvas-resolution rule): sources are drawn at or below native
pixel density — patch flames ~0.5×, douse ~1×, explosions scaled to their
existing gameplay radius, never upscaled past source density.

## Testing

- No unit harness for canvas draws. Automated coverage: a headless loader
  smoke (fx registry paths all resolve to existing files — guards against
  rename/typo drift) if cheap; otherwise none.
- Manual playtest per project rule: each surface eyeballed (patch fire
  readability at small scale, douse flame shrink, explosion timing/size per
  site, portal loop in the Church), plus the "tame fire" check — bump per-use
  fps/scale if patches read sleepy.

## Open questions

None — variant re-picks happen by eye in playtest via the one-line path map.
