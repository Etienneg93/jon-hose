# Air World entry cutscene (design spec)

*Date: 2026-07-24 · Status: user-approved in brainstorm · Branch: `air-act`
(base `fa0d825`) · Replaces the banner-beat stub in `enterAirAct()`.*

## Summary

The Air World arrival becomes the entry half of the Ass Man bookend pair.
The outro shipped in `dba0ee8`; this is its opening.

Jon steps out of the truck portal onto the cloudline street with normal
control. Ahead, a man in a hoodie and sunglasses stands by the holy hydrant
walking a black-and-white border collie. The collie desecrates the hydrant.
Jon rages. The stranger rips the hoodie off — he was wearing the suit the
whole time, gold boots and all — the feud is declared face to face, and he
scoops the dog under one arm and flies off. Control returns; the existing
WAVE 30 walk trigger is untouched.

The beat is played **in the world**, not in the MGS codec box the other three
cutscenes use. The transformation is the point, so it has to be seen.

## Locked decisions (user, this brainstorm)

- **In-world staged scene**, not a codec box. Precedent is the Gate Crash
  finale in `truck.js` — a scripted phase machine that owns its own fades.
- **Proximity trigger on the existing free-walk.** Jon keeps control on
  arrival and walks into the insult; the scene is not handed to him.
- **Art is generated before the build**, not after. The frame list below is
  therefore fixed at spec time.
- **The stranger is barely disguised**: hoodie + sunglasses pulled over the
  costume, gold boots still on, cape corner out the back. The joke is that
  he is not hiding and Jon does not notice. Reveal is a rip, not a whiteout
  swap.
- **The dog is a black-and-white border collie.**
- **Exit**: feud declared, dog scooped under one arm, `riseup` into `soar`
  out the top of frame. The dog leaves with him and returns at the outro to
  be deputized, so nothing has to persist through waves 30–35.
- **Animation tier 2** (see Art): keyframes plus code-driven motion, with
  real frames spent only where a static pose would visibly tell.

## Staging — existing geometry, no new props

| Thing | x | Source |
|---|---:|---|
| Jon's arrival | 11540 | `enterAirAct()`: `JH.ZONE4_START + 40` |
| Holy hydrant | 11740 | `JH.HYDRANTS[10]`, already commented "Air World entry (before WAVE 30)" |
| Scene trigger | 11660 | new, `JH.AIRENTRY.triggerX` |
| WAVE 30 | 11840 | `WAVE_TRIGGERS[29]` — **unchanged** |

The hydrant sits 200px ahead of the spawn point, inside the 480px view, so
both actors are on screen before anything happens. After `release` Jon has
~150px of walk left to reach WAVE 30.

Jon arrives at depth `JH.DEPTH_MAX * 0.6` (51.6); the hydrant is at depth 74.
The stranger stands hydrant-side of Jon, the collie between stranger and
hydrant, leash drawn as a live curve between them.

## Phase machine

`JH.AirEntry` owns one phase machine. Every duration is a named value in
`JH.AIRENTRY`; no literals in the module.

| Phase | Beat | Actors |
|---|---|---|
| `notice` | Input locks, camera settles on the two-shot. | Both idle, leash slack. |
| `desecrate` | Collie trots to the hydrant and lifts a leg. Stream fx. | Collie `trot0-3` → `lift`. Stranger idles, facing away — oblivious. |
| `rage` | Jon's outrage: red flash, bark line, squares up. | Jon existing frames. |
| `reveal` | Stranger rips the hoodie; it tumbles off as a prop and despawns. Sprite swaps to baked `idle.png`. Storm ring, one beat of hold. | `plain_rip0-2` → `assman/baked/idle.png`. |
| `feud` | Face-to-face bark lines, both facing each other. | Both idle. |
| `depart` | `riseup` with the collie composited under the free left arm, then `soar` out the top of frame with a wind gust. | Baked poses + composite. |
| `release` | Control returns. | Actors despawned. |

## Art — 10 sprites, generated before the build

Generated through the `codex-image` skill: single-image gens only, UTF-8
prompt files, user verifies one at a time, standard postprocess (4-conn
floods, two-tone checker key, slab-kill, colour-bleed → LANCZOS → alpha
≥128).

**Stranger** → `sprites/assman/plain_*.png`. Generated facing left, toward
Jon. `plain_idle` is canvas-flipped for the oblivious look-away during
`desecrate`; the hoodie covers the chest lettering, so the flip is safe. The
**rip frames are never flipped** — `plain_rip1` and `plain_rip2` expose the
"ASS MAN" lettering, and the rip always plays facing Jon.

| Frame | Content |
|---|---|
| `plain_idle` | Hoodie + sunglasses over the navy suit, gold boots below the hem, cape corner out the back. Same face and hair as the poster canon. |
| `plain_rip0` | Hands grab the hoodie hem. |
| `plain_rip1` | Hoodie splitting, "ASS MAN" chest emerging. |
| `plain_rip2` | Shredding off the shoulders, arms wide, near-full suit. |

Then `sprites/assman/baked/idle.png` takes over — no new full-suit art.

**Collie** → `sprites/dog/*.png`. One generated facing, canvas-flipped at
draw time.

| Frame | Content |
|---|---|
| `idle` | Standing, leash slack. |
| `trot0-3` | Four-frame trot, matching the repo's `walk0-3` convention. |
| `lift` | The leg-lift. |

One idle frame per actor, not a breathing pair: at ~16px a breathing bob is
invisible as art and code does it for free. Frames are spent on the trot and
the rip because those are the two places a static pose visibly tells.

**Canvas flip is acceptable here, with one exception.** Ass Man's left-facing
variants had to be generated because his chest lettering cannot mirror. A
collie carries no lettering, and the hoodie covers the stranger's chest — so
both flip cleanly. The exception is `plain_rip1`/`plain_rip2`, where the
lettering is emerging: those draw only at their generated facing. If seams
appear at the flip, the fallback is a generated second facing for the collie
only.

**No new exit pose.** `riseup.png` is a Superman take-off with the right arm
up and the **left arm down at the side**; `soar.png` flies right-arm-forward
with the **left arm tucked against the chest**. Both leave the negative space
a carried dog needs, so the collie is composited at a hip offset with a
slight rotation rather than baked into a new pose.

## Motion that comes from code, not frames

Leash as a live curve that swings and goes taut; collie translation and bob;
hoodie tumbling with rotation on despawn; whiteout flash and storm ring on
the reveal; camera push; wind gust on the exit; Jon's red rage flash. This is
the same division of labour the Ass Man fight already uses — 14 static poses
that read as fully animated because the code moves them.

Transforms must stay **proportion-honest**. Non-uniform stretching is exactly
the blit-height distortion bug fixed in `f145c3d`; translate and rotate are
fine, squash is not.

## Integration seams

- **`js/airentry.js`** (new) — the phase machine. Plain `JH` IIFE with the
  `balance.js` dual-export tail so node tests can require it. Public surface:
  `AirEntry.enter(game)`, `AirEntry.update(dt, game)`,
  `AirEntry.draw(ctx, cam, game)`, `AirEntry.skip(game)`. Mirrors the
  existing `JH.TruckRun.enter/update/renderScene` wiring.
- **`js/config.js`** — new `JH.AIRENTRY` block: `triggerX`, per-phase
  durations, actor offsets, leash params, gust params, rage-flash values.
- **`js/game.js`** — three call sites plus actor placement in
  `enterAirAct()`. The stub comment at `game.js:1124` is removed.
- **`js/assets.js`** — 10 image slots with procedural fallbacks. Plain
  `Assets.register`, **not** `registerBaked`: neither actor is an `Enemy`,
  there is no elite variant and no pose function. Precedent is the wind
  hazard slot.
- **`index.html`** — script tag for `airentry.js`.
- **`tests/airentry.test.js`** (new).

## Out of scope

- No balance, wave-data, `checkpointWave` or `WAVE_TRIGGERS` change.
- No K-9 Unit relic. The dog leaves with Ass Man; the deputization is the
  outro's job and remains unbuilt.
- No Assvengers tease.
- No change to the three existing codec-box cutscenes.
- Rim-is-hitbox does not apply — nothing in this scene damages.

## Failure and edge handling

- **Missing art** → procedural fallbacks draw. The scene never hard-depends
  on the PNGs landing, so a failed generation round cannot block the build.
- **Skippable** — a confirm press jumps straight to `release`. Mandatory: this
  plays on every run.
- **Fires once per run** — a run-state flag, so death/respawn and Church
  returns do not replay it. `checkpointWave` stays `airStart`.
- **Pause mid-scene** freezes and resumes, the way `TruckRun.renderScene`
  holds the frozen scene behind the pause menu.
- **Dev-menu entry** to jump straight into the scene. Required — without it
  headless verification means playing 29 waves.

## Testing

**Pure node tests** (`tests/airentry.test.js`), no canvas:

- Phase order and total duration derive from `JH.AIRENTRY`, never literals.
- `skip()` from any phase lands in `release`.
- Re-entry is idempotent — a second `enter()` on the same run is a no-op.
- Control is locked for every phase before `release` and free after.
- Zero mutation of `waveIndex`, `checkpointWave`, `waveActive`, `sigils`.

**Headless** (`headless-playtest` skill, port 8123, real keys): a capture of
every phase, plus an assertion that WAVE 30 still rolls after `release` and
that the skip path reaches the same end state.

## Acceptance

The scene plays once on Air World arrival, shows the desecration and the
transformation in-world, returns control, and leaves WAVE 30 and every
balance number exactly as they were. Full suite green. Held for user
playtest — no merge, no release.
