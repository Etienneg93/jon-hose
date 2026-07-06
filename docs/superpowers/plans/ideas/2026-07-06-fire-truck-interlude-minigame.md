# Fire Truck Interlude — Between-Worlds Minigame (raw idea)

**Date:** 2026-07-06 · **Status: CONCEPT — brainstorm in progress, decisions
locking. No spec yet.** Skeleton agreed with the user in a live brainstorm;
still needs a real spec pass before any build.

## The pitch

A one-off **Fire World victory lap**: beat Slayer, the forge-world collapses,
and Jon guns it out in a high-speed **fire truck**. You drive as it blazes down
the road, and its **super-powerful mounted hose** is the weapon — blast
obstacles and hard enemies out of the way while the world zooms past at "high
speed." A single bespoke ~60s set-piece, not a recurring system.

Reference feel: the **Battletoads Turbo Tunnel / high-speed vehicle stage** —
the speed-dodging fantasy — **but deliberately NOT as punishing.** A
palate-cleanser set-piece, not a rage-quit wall.

**Core design read:** it's the game's own three verbs re-oriented into a
scrolling lane (move = dodge, spray = kill, dash = swerve) — no new player
language. Tonally it's the **release valve**: the main game is *scarcity* (the
dry tank is the early wall); the truck run is *abundance* — you grab a firehose
cannon and just blast.

## Locked so far (live brainstorm, 2026-07-06)

- **When/where — ONE run, after SLAYER.** Fires once, on the Fire World exit:
  beat Slayer → forge-world collapses → flee. Not a recurring motif. Road
  hazards are **the fire roster you just fought** (furnace-chunks, fuse-mooks,
  molten debris, pyro flame) → pure art reuse + narrative payoff.
- **Length — ~60s.** Palate cleanser, not a level. Beat map below.
- **Frame — ESCAPE.** The world comes down behind you and pushes you forward;
  you arrive at the next world's gate.
- **Control — DRIVER (confirmed).** You slide the truck across a few vertical
  lanes; the hose is a big **forward cannon**. Carbon copy of move=dodge /
  spray=kill / dash=swerve.
- **Loadout — FIXED, no carryover.** No benedictions/upgrades/build carry in.
  The truck hose **dwarfs Jon's** (wide, screen-filling vs his careful cone).
  Because the kit is one known value, the stage tunes against it directly — no
  `eliteScale`, no scaling against player power. Big authoring + honesty win.
- **Resource — light tank, refill by SMASHING hydrants** you pass (blast the
  hydrant → top-up burst). Generous; never the dry-tank anxiety of the main
  game. A smashed hydrant also **washes its lane** — an environmental kill you
  can set up by luring enemies next to it (LOCKED IN).
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

## The 60-second beat map

- **0–12s — power moment.** Grab the hose; first blast is huge and wide. Light
  debris only. Learn lanes + blast + dash with no pressure. Sell speed + gun size.
- **12–35s — build.** Fuse-mooks lobbed at the windshield, first hydrant (refuel
  + lane-wash), Holy Essence dangled in the hot lanes so greed costs position.
- **35–52s — climax.** Densest dodging + the road boss (below); collapse wall
  surges close behind, screaming FORWARD.
- **52–60s — arrival.** Punch the gate → banked essence tallies → **benediction
  sigil beat, pick 1 of 3.** Possible "clean run / no dents" bonus.

## Still open

- **Road-boss climax.** Leading idea: **the furnace itself rolls after you** and
  the finale is a *douse-race* — hold the beam on it while dodging its
  ember-spits (drown the forge's corpse on the way out). Fallback: a furnace-chunk
  blocker across two lanes with an HP bar you sustained-beam before you crash it.
- **Destination / sequencing.** Where the road dumps you depends on the air
  world (Ass Man), still a future brainstorm. Either ship this *with* the air
  world as its on-ramp, or land now on a "to be continued" teaser gate as a Fire
  World capstone.
- **Collapse wall** (tentatively settled): *cosmetic terror + soft "keep moving"
  nudge* — stops essence-camping, can lick you for HP, can't kill. Revisit if it
  should be meaner.

## Constraints to honor when this graduates to a spec

- **No jump, no melee** (hard cut) — hose + steering are the whole toolkit.
- Rim-is-hitbox / one-shape-draw-and-hit for every telegraphed hazard (the
  incoming-hazard road-marker IS its hitbox).
- Minimal placeholder-art dependency; hand-cleaned sprites are off-limits to
  bakers (CLAUDE.md art rules). Reuse the departing roster; new chrome (truck,
  road, parallax) needs its own asset plan.
- Honest numbers: the truck's HP is a visible bar; collisions chunk it, no
  hidden soaks.
