# Fire Truck Interlude — Between-Worlds Minigame (raw idea)

**Date:** 2026-07-06 · **Status: CONCEPT — brainstorm in progress, decisions
locking. No spec yet.** Skeleton agreed with the user in a live brainstorm;
still needs a real spec pass before any build.

## The pitch

A between-worlds interstitial: Jon flees a collapsing world in a high-speed
**fire truck**. You drive as it blazes down the road, and its **super-powerful
mounted hose** is the weapon — blast obstacles and hard enemies out of the way
while the world zooms past at "high speed."

Reference feel: the **Battletoads Turbo Tunnel / high-speed vehicle stage** —
the speed-dodging fantasy — **but deliberately NOT as punishing.** A
palate-cleanser set-piece, not a rage-quit wall.

**Core design read:** it's the game's own three verbs re-oriented into a
scrolling lane (move = dodge, spray = kill, dash = swerve) — no new player
language. Tonally it's the **release valve**: the main game is *scarcity* (the
dry tank is the early wall); the truck run is *abundance* — you grab a firehose
cannon and just blast.

## Locked so far (live brainstorm, 2026-07-06)

- **Frame — ESCAPE.** Beat a world's boss → the world collapses → you flee down
  the road. Road hazards are **that departing world's existing roster** (fire
  debris, furnace-chunks, fuse-mooks) → art reuse, and a narrative reason for
  the run. Ends at the next world's gate.
- **Control — DRIVER** *(pending explicit user confirm; everything below
  assumes it).* You slide the truck across a few vertical lanes; the hose is a
  big **forward cannon**. Carbon copy of move=dodge / spray=kill / dash=swerve.
- **Loadout — FIXED, no carryover.** No benedictions/upgrades/build carry in.
  The truck hose **dwarfs Jon's** (wide, screen-filling vs his careful cone).
  Because the kit is one known value, the stage tunes against it directly — no
  `eliteScale`, no scaling against player power. Big authoring + honesty win.
- **Resource — light tank, refill by SMASHING hydrants** you pass (blast the
  hydrant → top-up burst). Generous; never the dry-tank anxiety of the main
  game. Idea: a smashed hydrant also **washes its lane** (environmental kill you
  can set up by luring enemies next to it).
- **Stakes — BONUS GAUNTLET.** You always arrive at the next world. **Holy
  Essence sits in the risky lanes** — how well/greedily you drive = how much you
  bank. 0 HP just means you arrive dented/empty-handed; never a run-ender.
  Skill expression is *greed*, not survival.
- **View — side-scroll + heavy parallax.** Sells "high speed" cheaply and lets
  the existing roster appear on the road with the sprites it already has.
  (Into-the-screen perspective was rejected — needs all-new scaled art.)
- **End beat — plugs into an existing reward.** Arrive → tally banked essence →
  **benediction sigil beat (pick 1 of 3)**. Possible small "clean run / no
  dents" bonus.

## Still open

- Confirm **Driver** vs aiming the hose (Gunner).
- The **collapse wall** chasing from the left edge: leaning *cosmetic terror + a
  soft "keep moving" nudge* (stops essence-camping; can lick you for HP but
  can't kill) rather than a hard timer.
- **Frequency** — every act transition (4 runs, "the road" as a recurring
  motif) vs one or two signature runs. Scope call.
- **Length** — target ~30–60s per run (palate cleanser, not a level).
- The mid/end **"road boss"** — a departing-world super-elite planted across
  lanes you hold-beam to break (the "kill super-hard enemies at speed" beat).
- Whether the **smashed-hydrant lane-wash** weapon idea makes the cut.

## Constraints to honor when this graduates to a spec

- **No jump, no melee** (hard cut) — hose + steering are the whole toolkit.
- Rim-is-hitbox / one-shape-draw-and-hit for every telegraphed hazard (the
  incoming-hazard road-marker IS its hitbox).
- Minimal placeholder-art dependency; hand-cleaned sprites are off-limits to
  bakers (CLAUDE.md art rules). Reuse the departing roster; new chrome (truck,
  road, parallax) needs its own asset plan.
- Honest numbers: the truck's HP is a visible bar; collisions chunk it, no
  hidden soaks.
