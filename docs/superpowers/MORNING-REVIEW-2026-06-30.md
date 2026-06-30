# Morning review — next-level-pass (2026-06-30 overnight)

Everything below is on branch **`next-level-pass`** (off `balance-pass`). **Nothing
is deployed** — `main`/live is untouched. Review, playtest, then we merge what you like.

## TL;DR

- Approved the direction, then built the first slice of it. **The Elemental Mirror
  altar (Water + Earth) is implemented, wired, and unit-tested** (28 tests pass).
- Wrote the 3 design docs + a full asset-prompt doc for every missing art piece.
- Added the one juice item that was actually missing (**GUSH combo meter**) — turns
  out hit-stop, hit-flash, death-pops, and pickup magnetism already existed.

## Commits (in order)

1. `docs:` next-level vision + Mirror altar design spec
2. `docs:` asset-generation prompts for all missing art + Slayer prompt entry
3. `feat(church):` Elemental Mirror altar — Water + Earth (v1)
4. `feat(juice):` GUSH combo meter

## What to playtest (dev: backtick on localhost → warp; die to reach the Church)

1. **Mirror altar replaces the flat blessing stations.** Walk up to a station in
   the Church: **E** raises a rank, **Shift/L** flips the node's two sides (e.g.
   Pressure: +dmg ⟷ +range). Rank pips + cost show when near.
2. **Water branch is open from the start** (3 nodes). **Earth branch (2 nodes)
   appears only after you redeem Quake Walker** — that's the "Quake opens the
   altar" payoff (v1: 2 extra stations light up; the full walkable sub-chamber is
   the next increment).
3. **Old saves migrate**: prior blessing levels fold into the Water nodes once.
4. **GUSH combo**: chain kills within 2.5s → a scaling cyan→gold→red "GUSH xN"
   readout top-right, with a milestone shake every 5th. Cosmetic only.

## Key decisions I made (flag if you'd choose differently)

- **Mirror = the meta-upgrade hub** (you chose "replace" the flat blessings). Water
  open; Earth/Fire/Air gate on ally redemption.
- **v1 node effects map to existing stats** (no new combat wiring) so it's fully
  testable now. The *true* elemental effects (burn DoT, knockback-stun, gusts) are
  deliberately deferred to each element's act — see the spec's "out of scope."
- **Rank is shared across a node's two sides; toggling is free** (forgiving; easy to
  rebalance). Hades tracks per-face ranks — easy to switch later if it feels too cheap.
- **UI reuses the walk-up-station pattern** rather than a modal menu (matches the
  church's "player stays in control" ethos). The polished Mirror sub-chamber with
  per-pillar navigation + ally NPCs is the documented next step.
- **Fire/Air nodes exist but are locked** (no Slayer/Ass Man bosses yet).

## Docs to read

- `docs/superpowers/specs/2026-06-30-next-level-vision.md` — the umbrella.
- `docs/superpowers/specs/2026-06-30-elemental-mirror-altar-design.md` — the Mirror.
- `docs/superpowers/specs/2026-06-30-asset-generation-prompts.md` — **all the art to
  make.** Priority order at the bottom. `node tools/imagen-gen.mjs slayer` is wired.

## Suggested next sessions (in build order)

1. **Art pass** from the prompt doc (Mirror chamber pillars + the still-404 church
   props are the highest-leverage — they render immediately).
2. **The Slayer** (Act 3 / Fire) — already broken down in `FEATURE-BREAKDOWN.md`;
   lights the Fire branch on redemption.
3. **Walkable Mirror sub-chamber** + true elemental effects + side-toggle polish.
4. **Ass Man** (Act 4 / Air) — needs a fresh boss design (only one not yet specced).

## Verification done

- `node --test`: **28 pass / 0 fail** (8 new Mirror tests + church migration/validation).
- `node tools/build.mjs`: clean; `js/mirror.js` included + cache-busted.
- Syntax-checked every changed file. **Not** browser-playtested (that's your morning
  pass) — the scene/feel of the Mirror UI and combo readout want human eyes.
