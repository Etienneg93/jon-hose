# CLAUDE.md — working notes for this repo

(Tracked in git. The companion is `docs/HANDBOOK.md`: design principles,
systems map, and the future vision. Read it once per session before
touching gameplay code.)

## The four load-bearing rules

1. **Playtest before commit.** All gameplay/feel changes stay UNCOMMITTED
   until the user has played them and said so ("push this", "commit as X").
   Code correctness ≠ feel correctness. Batch related uncommitted changes
   and release them together on their word.
2. **Release ritual — every merge to main is a named release.**
   Bump `package.json` + add a `CHANGELOG.md` entry + title the merge
   `release: v{version} - {Patch Name}`. Use the `release` project skill
   for the details. **Minor (0.X.0) is ONLY for a full designed pass** (own
   brainstorm/spec: "Juice Pass", "Benedictions"); live-playtest follow-up
   rounds are PATCH bumps even when they add real mechanics (user corrected
   v0.28/v0.29 prefires back to v0.27.1/.2 — don't repeat that).
3. **Never force-push main.** It's live for external playtesters (GitHub
   Pages deploys from it). If a merge fast-forwards past the ritual title,
   add an empty release-marker commit instead of rewriting history.
4. **Verify headlessly before claiming anything works.** Use the
   `headless-playtest` project skill — it has the working harness pattern
   and the input gotchas that silently break naive attempts.

## Design principles (details + rationale in docs/HANDBOOK.md)

- **Honest numbers**: survivability lives in the visible HP bar. waterMult
  stays 1 on most enemies (pyro 1.5 / neighbor 1.3 are thematic BONUS
  damage; furnace phases are a mechanic). No hidden soaks.
- **Rim is hitbox**: every damaging zone hits exactly the ellipse/band it
  draws. Any new AoE/telegraph must share ONE shape between draw and hit
  test (see FirePatch.footprint, SwitchBoss.lineHits).
- **No jump, no melee** — cut from design; never suggest them.
- **Don't soften the game** without an explicit user call; recent history
  is pressure UP (0-death playtest → the Giants pass). Tune tedium down
  (HP, shelter duty cycles), not challenge.
- **World-element theming**: each act's enemy roster matches its boss's
  element (Act 3 earth/bulwark; Fire World fire). The future air act needs
  a NEW air roster, designed in its brainstorm.
- **Threat vocabulary is three-step**: regular → elite (gold bar) →
  super-elite (red frame, late-game only, one per wave, signature move).

## Code-comment style

Committed comments carry **behavioral/mechanical facts only** (units,
coordinate conventions, gotchas, wiring). Design intent, lore, and "why the
number changed" go in **commit messages** and docs/HANDBOOK.md — narrative
in source rots. Keep comments short; describe what the code does.

## Balance changes — where numbers live

`js/config.js` is the single source of truth for tunables; no other file
hardcodes gameplay constants. Several arrays are act-indexed by
`actLevel+1` via `Balance.ticketBudget(actLevel, arr)` (actLevelForWave
returns -1..3): SPRINKLE.counts, TICKETS.budgets, WAVEFLOW.fieldCap,
SUPER_TUNE.hpByAct. Attack tickets meter ATTACKERS, not spawns; spawn flow
is JH.WAVEFLOW (field cap + trickle + 3-5 batch surges).

## Art pipeline — HARD safety rules

- `sprites/mook/*` (12-frame idle, wind1-4) and `sprites/fuse/walk0-3.png`
  are HAND-CLEANED. **Never re-run bakers over them** (tools/mook-sprite.mjs,
  tools/enemy-sprites.mjs overwrite blindly). Fuse idle0/1 wick still
  inconsistent (known, queued).
- `registerBaked()` in assets.js is the wiring pattern (poseFn + procedural
  fallback + overlay; overlays skip the silhouette offscreen). Switch/GK
  use baked chassis + runtime LEDs (tools/boss-sprites.mjs). Firewall
  (wall boss) is still procedural.
- Canvas sizing: `JH.VIEW_W/H` (480×270) and per-entity heights are LOGICAL
  units; the buffer is devicePixelRatio-scaled to native. Generate art at
  ~4x+ the logical target (JON_H 53 → ~212 real px at 1080p).
- imagen-gen.mjs is 429-dead (credits); hand-bake via node tools instead.

## Test suite

`npm test` (node --test, ~214 tests). Tests import modules directly
(`require("../js/benedictions.js")` — dual-export pattern like balance.js);
game.js/entities.js tests go through `global.window = globalThis` stubs
(see tests/entities.test.js makeThinkGame). If a test stubs
`document.getElementById`, the fake element needs `style: {}` (banner()
touches it). When a config number moves, tests should derive from config
(e.g. `JH.LEVELS.cycle[1].maxWater`), not repeat the literal.

## Branch chain

Historic chain: main ← curve-pass ← switch-gk-art ← progression-pass, with
fixes committed on the lowest applicable branch and merged upward. All are
currently synced to main; new passes get new branches off main. After any
release, sync the working branch back (`git merge main`).

## Working with this user

- Iterates via rapid live-playtest feedback; expects fixes built + verified
  + held for their playtest, then released on their word.
- Makes design calls quickly and specifically — implement their stated
  mechanic (e.g. "3-5 batch spawns", "fires run out after 5-10s") rather
  than a watered-down interpretation; propose numbers with the math shown.
- Owns balance feel; you own correctness + verification. When they say
  something is "too much"/"unbeatable", quantify WHY (effective-HP math,
  shelter duty-cycle percentages) before turning knobs, and report those
  numbers in the reply.
- Big passes run through superpowers skills: brainstorming → spec →
  writing-plans → subagent-driven-development, with the ledger at
  `.superpowers/sdd/progress.md`. Small live-support rounds are done inline.
