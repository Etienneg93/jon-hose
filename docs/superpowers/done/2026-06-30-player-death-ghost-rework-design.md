# Player death sequence — ghost rework

**Date:** 2026-06-30
**Status:** Approved design — to become an implementation plan.
**Context:** Current `playerDeathSeq` (player death → Church transition) plays the 8-frame
death.png collapse, then the corpse vanishes and a cyan-tinted *idle* sprite pops in
instantly as the "ghost," drifts up, and beams off. The pop-in reads as abrupt and the
ghost doesn't visually relate to the corpse it came from.

## Goal

Make the ghost feel like it's actually leaving Jon's body:
1. Linger on the death animation's final (kneeling) frame before anything else happens.
2. The ghost materializes out of the corpse rather than popping in.
3. The ghost's first pose is the corpse's last pose (frame 7), and it visibly **stands
   up** (the collapse animation played in reverse) instead of just drifting away in an
   unrelated idle pose.
4. The corpse stays on the ground for the whole sequence, instead of disappearing the
   moment the ghost appears — so the ghost is seen leaving a body that's still there.

No new art: this reuses the existing 8-frame `sprites/jon/death.png` sheet for both the
corpse and the ghost (cyan-tinted, played in reverse for the stand-up).

## Phase breakdown

All durations live in `JH.CHURCH.deathSeq` (config.js) as named relative durations;
`game.js` derives cumulative timestamps from them instead of hardcoding literals (today
`config.js` already declares `whitenEnd/ghostStart/beamStart/fadeStart/total` fields but
`game.js`'s draw code ignores them and hardcodes `0.5/0.6/0.8/1.6` directly — this rework
fixes that so the config is the single source of truth).

| Phase | Duration | Behavior |
|---|---|---|
| Collapse | `fallEnd` = 0.6s | death.png frames 0→7 play forward (unchanged). Shadow + corpse drawn. |
| Linger | `lingerDur` = 0.4s | Corpse frozen on frame 7 (kneeling). No ghost yet. |
| Rise-out | `riseDur` = 0.35s | Ghost appears at the corpse's position, **still frame 7** (kneeling pose), and lifts straight up by `riseHeight` (16 logical px). Alpha ramps 0 → full over the first `materializeDur` = 0.15s of this phase (materializing, not popping in). |
| Stand-up | `standDur` = 0.45s | Ghost holds at `riseHeight` and plays frames **7 → 0** (reverse of the collapse), i.e. visibly stands up while hovering above the corpse. |
| Drift | `driftDur` = 0.3s | Standing ghost (frame 0) drifts further upward slowly (28 px/s — same rate as today's pre-beam drift). |
| Beam | (uses `beamFadeDur` = 0.4s for the alpha taper) | Upward motion accelerates (same `(t)^2 * 480` easing as today) while the ghost's alpha fades out over `beamFadeDur`. |
| Screen fade | `screenFadeDur` = 0.7s | Fade to black, unchanged mechanic. |

Cumulative: ghost starts at `fallEnd + lingerDur` = 1.0s; stands fully at 1.0+0.35+0.45 =
1.8s; beam-fade window starts at 1.8+0.3 = 2.1s; screen fade starts at 2.1+0.3 = 2.4s;
`total` = 2.4 + 0.7 + 0.1 buffer = **3.2s** (was 2.4s).

**Corpse visibility:** the corpse (shadow + frame-7 death sprite) is drawn for the
*entire* `playerDeathSeq` state once it settles, not just the first 0.6s — it stays on
the ground until the state transitions to the Church.

**Ghost rendering:** all ghost phases reuse `JH.Assets.draw(ctx, "jon", ..., {state:
"death", frame: N})` (the same draw path the corpse uses) with the existing cyan filter
(`sepia(1) hue-rotate(150deg) saturate(3) brightness(2.2)`) and alpha compositing — no new
asset/draw-path code, just different frame/position/alpha math per phase.

## Out of scope

- `jon-death.mp3` timing/duration is untouched; it just plays once at trigger as today.
- No changes to `bossDeathSeq` (separate code path, not part of this request).
- No new sprite frames — reuses death.png exclusively.
