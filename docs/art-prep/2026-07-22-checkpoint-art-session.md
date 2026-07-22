# Checkpoint art session — brief for the local codex run

**Date:** 2026-07-22 · **Branch:** `claude/jon-hose-checkpoint-jq5pyi`

Everything below is **already code-wired with a procedural fallback**, so the
game runs right now without any of this art. Generate on the local machine
(codex-image), process to the paths listed, and each asset lights up on the next
load. No code changes are needed after the art lands (the one exception —
re-baking Ass Man pose masters — is called out explicitly).

Prompt files (UTF-8, one per subject) are in `docs/art-prep/prompts/`.

## Pipeline (from CLAUDE.md — the load-bearing rules)

- **Single-image gens only.** Recover outputs from `~/.codex/generated_images`.
- **Processing chain:** 4-connected flood from the corners → two-tone checker
  key → slab-kill (neutral-light rectangles touching transparency) → color-bleed
  cleanup → LANCZOS downscale → harden alpha (≥128 → 255, else 0).
- **NEVER re-run bakers over `sprites/mook/*` or `sprites/fuse/walk*`** — those
  are hand-cleaned. Nothing in this session touches them.
- Prompts specify a **flat magenta `#FF00FF`** cutout background (the project
  convention); swap it for whatever your codex-image key step expects.

## 1. Ass Man cutscene portrait  ✅ wired (procedural placeholder live)

The ally-cutscene now runs at the end of the fight (kneel → portrait dialogue →
win). It draws a blocky navy/gold **procedural portrait** until these two files
exist, then uses them automatically (`JH.getAssManPortrait`, `js/assets.js`).

| File | Notes |
|---|---|
| `sprites/assman/assman-portrait-mouthclosed.png` | opaque codec bust, ~200×230, scales into a 96×108 box |
| `sprites/assman/assman-portrait-mouthopen.png` | identical pose, mouth open — flips as the talking frame |

Prompts: `prompts/assman-portrait-mouthclosed.txt`, `prompts/assman-portrait-mouthopen.txt`.
No bake, no cutout — drop the PNGs in. (These are the JHCU-hero busts; the
cutscene dialogue treats him as joining your side.)

## 2. Gasbag  ✅ wired (procedural sack live)

`registerBaked("gasbag", …)` loads five frames and falls back to the procedural
green sack until they exist. **No bake step** — registerBaked scales the source
PNGs at runtime (draws at 28×29 logical, feet at 28).

| Files | Poses |
|---|---|
| `sprites/gasbag/{idle0,idle1,wind0,wind1,vent}.png` | idle breath (2), vent inflate (2), venting (1) |

Prompt + frame-derivation notes: `prompts/gasbag.txt`. Transparent hard-alpha
cutout, generate ~160px tall.

## 3. Church props  ✅ wired (procedural fallback live)

`JH.ChurchArt` (`js/assets.js`) already loads these; they 404 today and the
church renders procedural stand-ins. Four real gaps:

| File | Prompt | State |
|---|---|---|
| `sprites/church/altar.png` | `prompts/church-altar.txt` | hose-worship altar |
| `sprites/church/shrine_dim.png` | `prompts/church-shrine_dim.txt` | dormant niche |
| `sprites/church/shrine_lit.png` | `prompts/church-shrine_lit.txt` | awakened niche (same silhouette as dim) |
| `sprites/church/portal.png` | `prompts/church-portal.txt` | return rift |

Transparent hard-alpha cutout. `backdrop/nave/ground/father_jon*` already exist —
regenerate those only if you want a refinement pass (not gaps).

## 4. Ass Man pose-height tuning  ⚙️ your eye, no art needed

"Sprite size differences between poses" lives entirely in **`AM_POSE_H`**
(`js/assets.js:1460`) — feet-anchored logical draw heights. All masters bake to
232px native; the on-screen scale is `drawH / 232`, so these numbers are the
only knob. Current values vs the master aspect ratios:

| pose | native | drawH | draws (w×h) | note |
|---|---|---|---|---|
| idle | 107×232 | 58 | 27×58 | reference standing height |
| hover | 104×232 | 56 | 25×56 | ground-drift, matches idle ✓ |
| riseup | 69×232 | 66 | 20×66 | stretched up — tallest |
| slam | 175×232 | 44 | 33×44 | crouched impact |
| kneel | 268×232 | 40 | 46×40 | oversized-head master (drawn 40 to compensate — regen candidate) |
| clapwind | 214×232 | 56 | 52×56 | |
| charge | 158×232 | 54 | 37×54 | |
| clap | 137×232 | 56 | 33×56 | |
| hipcheck | 246×232 | 50 | 53×50 | |
| toss | 147×232 | 60 | 38×60 | |
| airclap | 186×232 | 54 | 43×54 | shooting pose |
| exhaust | 143×232 | 46 | 28×46 | bent-over recovery |
| **soar** | **957×232** | **19** | **78×19** | horizontal flight — looks proportionate in-flight, but verify against idle |
| flight | 190×232 | 56 | 46×56 | diagonal (unused fallback) |

Tune by eye during playtest; the headless harness (`headless-playtest` skill)
can drop the boss into any pose for A/B shots. `soar: 19` is the one to sanity-
check first — it's the biggest scale jump.

## What already shipped in this checkpoint (code, verified)

- **Ass Man ally outro cutscene** — portrait + 3-phase dialogue + `[E]` advance,
  navy/gold theme, resolves into `win()`. Mirrors Quake/Slayer. Draft dialogue
  in `drawAssManCutscene` (`js/game.js`) — swap the lines freely.
- **Unified ranged muzzle** — beam and bolt-volley now emit from one hand anchor
  (`AM_MUZZLE` / `AssManBoss.muzzle()`, `js/entities.js`); was beam-from-hand
  vs bolts-from-body-center.
- Suite 457/457; cutscene + live P2 combat headless-verified, zero pageerrors.

## Priority

1. Ass Man portrait (2 files) — completes the new cutscene.
2. Gasbag (5 frames) — most-seen new enemy still procedural.
3. Church props (4 files) — polish the death-loop hub.
4. Pose-height tuning — quick, playtest-driven, no gen.
