# Fire & Ground-Hazard Readability — One Ground-Plane Language

> **STATUS: SHIPPED** (main b2c9926, 2026-07-02). Rim-is-hitbox + Geo.inGroundEllipse are now project contracts.

**Date:** 2026-07-02 · **Priority: Must-explore** (named playtest problem; mostly precision bug-fixes) · **Scope: S**

## Problem statement (grounded — the mismatches are in the code)

Playtest (07-01): *"the fire zone's fire hitbox reads badly against the 2.5D ground plane."* The codebase actually already solved this once — `FirePatch.update` was carefully fixed to test Jon's feet against the **drawn** scorch ellipse in screen space (`entities.js` ~1370–1384, with a comment saying "the flame no longer burns from a depth row away"). But the fix wasn't systematized, so the same class of bug survives in every *other* fire object, and two visual choices undo the FirePatch fix:

1. **FireRing (Slayer dash landing) hits where it isn't drawn.** `FireRing.update` tests `Math.hypot(pl.x - x, pl.y - y)` against the ring radius — a **circle in world coords** — while `draw` renders an ellipse flattened to `ry = 0.45r` (`entities.js` ~2042 vs ~2063). In depth, the hit reaches ~2.2× past the visible ring. This is the exact "burns from a depth row away" bug, reintroduced.
2. **Furnace vent: elliptical telegraph, circular effect.** The wind-up draws a flattened danger ellipse `(R, R*0.4)` (`Furnace.draw`, ~3705) but the knockback/burn applies on circular `dist < bodyW * 4` (~3664). A player who correctly steps *below* the drawn ellipse still gets vented.
3. **SmeltBomb landing burn** is circular world-distance (`~3289`) while the spawned FirePatch it represents uses the flattened screen-space footprint — first-frame burn disagrees with every subsequent frame.
4. **Slayer slam** tests a rectangle (`|dx| < slamRange && |dy| < 24`, ~3470) but draws an ellipse (~3580) — corners of the rect hit outside the drawn oval.
5. **The flames themselves overshoot the footprint.** FirePatch's hit oval is `rx = 0.85r, ry = 0.30r`, but the pack flames are drawn with `fscale = max(0.5, r*1.6/48)` plus two extra offset flames for wide patches (~1403–1408) — and commit `c8d3fb8` made them another ~35% bigger. Tall, wide fire *sprites* read as a volume; the hazard is a thin ground oval. Players judge by the flames and get burned by the oval (or vice versa).

There is already a proven pattern for doing this right: the Bulwark dome shares one `DOME_RY = 0.45` constant between its drawn disc and `insideDome()` (~1271, with a comment explaining exactly this contract).

## The idea — one helper, one ratio, one visual contract

### 1. `Geo.inGroundEllipse(px, py, cx, cy, rx, ry)` (S)
One pure helper in `world.js` beside `inHitArc`, comparing in screen-space via `feetScreenY` exactly the way `FirePatch.update` and `insideDome` already do. Port **every** ground hazard to it: FirePatch (already correct — just deduplicates), FireRing, Furnace vent, SmeltBomb landing, Slayer slam, Fuse drop slam, Quake leap landing (`ldist < leapRadius`, ~2302 — same circular bug vs its drawn `r, r*0.45` telegraph, ~2393). Unit-test it (`tests/`) — it's the same testable shape as `insideDome`.

### 2. `JH.GROUND_RY` — one flattening ratio (S)
Today: dome 0.45, FirePatch scorch 0.28/0.30, FireRing 0.45, Quake stomp telegraph 0.4, Furnace 0.4, Slayer slam ry from depth-projection. Pick **0.40** everywhere (it matches the depth band's actual projection well enough), stated in config next to `DEPTH_MAX`. One number = players learn one shape.

### 3. The visual contract: *the rim is the truth* (S)
Every damaging ground zone draws, always: **(a)** the exact hit ellipse as a base decal (scorch/glow), **(b)** a 1.5px bright rim on that same ellipse, pulsing while active — the rim is the hitbox, full stop. Flame/steam sprites are then free to be tall and dramatic *inside* the rim, but their base width gets clamped to ≤ the footprint width (cap `fscale` so flame width ≤ `2*rx*0.8`; drop the two offset flames when they'd poke outside). This keeps commit `c8d3fb8`'s "bigger flames" intent where it's safe (douse objectives, decorative fire) without lying about hazards.

### 4. First-contact grace tick (S)
`FirePatch` applies a burn stack the frame your feet cross the rim (`patchBurnT` starts at 0). Give patches a **0.2s sizzle grace**: on first overlap play a sharp sizzle SFX + white rim flash, apply the stack only if you're still inside after 0.2s. Reaction-window forgiveness like this is why Hades' lava feels fair — you get one audible warning per patch, not a stealth DoT. (Burn ticks after the first keep the existing 0.4s interval.)

### 5. Depth-shadow for airborne hazards (S, mostly exists)
SmeltBomb already draws a growing landing shadow (~3303) and Fuse drop-ins draw a landing ring — good. Add the same to Slayer fireballs (they sink from `spawnZ` and are depth-aimed; a small ground shadow at their (x,y) makes the 2.5D read instant — currently their height vs. depth is ambiguous, the classic 2.5D projectile problem).

## Why it's fun

Readable danger is the precondition for everything else in this pass — you can't tune difficulty around hazards players can't parse, and the fire zone is the climax act. Hades, Hyper Light Drifter, and every good 2.5D brawler (Streets of Rage 4's shadow discipline) converge on the same rule: ground danger is communicated by a ground-plane decal that *is* the hitbox, and vertical art never substitutes for it. This spec is small, mostly deletion-and-unification, and it retroactively upgrades the Slayer, Quake, Furnace, and Smelt fights for free.

## Scope

**S.** One helper + one constant + call-site ports + flame clamp + grace tick. No new art (rim/decals are procedural). High test coverage for the helper; the rest is the standard playtest gate.

## Open questions

1. Grace tick on *every* patch entry or once per patch instance? (Lean: per instance — re-entering the same fire you just left shouldn't re-warn.)
2. Does the rim-is-truth contract extend to *boss* telegraph fills (they already stroke exact rects/ellipses)? Yes — document it in the boss pattern spec's grammar table.
3. `GROUND_RY = 0.40` changes the dome's 0.45 — retune `domeRadius` +5 to keep its drawn footprint, or accept the slightly flatter bubble?
