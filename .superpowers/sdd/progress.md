# SDD Progress — Fire-Truck Escape

Plan: `docs/superpowers/plans/2026-07-06-fire-truck-escape.md`
Spec: `docs/superpowers/specs/2026-07-06-fire-truck-escape-design.md`
Branch: `claude/fire-truck-minigame-concept-2pdlg0`

| # | Task | Status |
|---|------|--------|
| 1 | Config block + pure balance helpers | ☑ done (224/224 tests) |
| 2 | Scene skeleton + state wiring + debug entry | ☑ done (headless-verified) |
| 3 | Truck hose (big blast, tank, pressure) | ☑ done (headless-verified) |
| 4 | Fire-roster hazards + collisions + honest HP | ☑ done (headless-verified) |
| 5 | Hydrants (refuel + lane-wash) | ☑ done (headless-verified) |
| 6 | Collapse-wall pressure loop | ☑ done (headless-verified) |
| 7 | Furnace climax + essence + clean bonus | ☑ done (headless-verified) |
| 8 | Arrival → benediction beat + Slayer entry + air handoff | ☑ done (headless-verified) |
| 8b | Boarding beat (crumbling world + drive-in truck, press E) | ☑ done (user request, headless-verified) |
| 8c | Reorder: Slayer benediction FIRST → pick triggers rumble+dread+truck-in (right edge) → board | ☑ done (user request, headless-verified) |
| 9 | Procedural art pass | ◐ in progress |
| 9a | Seamless world backdrop (shared Background) + real sprite swap | ☑ done (user request, headless-verified) |
| 9b | Hose-style spray cone, douse fires, big tank + hydrant refill | ☑ done (user request, headless-verified) |
| 9c | Boss changed Furnace → Firewall (WALLBOSS mechanics on the road) | ☑ done (user request, headless-verified) |
| 10 | Handoff (test, headless capture, STOP for playtest) | ☐ not started |

## Log

- 2026-07-06: plan + spec written.
- 2026-07-06: Task 1 done — JH.TRUCKRUN config block, js/truckrun.balance.js
  (truckPressure/douse/cleanBonus/beamCovers/buildTimeline/gapExists, pure +
  dual-export), tests/truckrun.test.js (10 tests). Full suite 224/224. Committed
  to feature branch.
- 2026-07-06: Task 2 done — js/truck.js JH.TruckRun scene (intro→run→arrive
  phase machine, depth/throttle/dash driving, placeholder render), state="truck"
  dispatch in game.js (update+render), afterTruckRun()→win() stub, debugEnterTruck
  + ?truck=1 hook in main.js, truck.js registered in index.html. Headless
  (chromium /opt/pw-browsers): entry→truck state, phase reaches run, Down moves
  depth 43→86, scroll advances, dash fires, scene end→win, 0 pageerrors.
  Screenshot scratchpad/t2-run.png. Suite 224/224. Next: Task 3 (hose).

## Gate Crash finale (plan: docs/superpowers/plans/2026-07-07-gate-crash-finale.md)

- Task 1: complete (commits b5556d1..53e89c0, review clean). Minor (for final review): finale config lead comment narrates the beat (plan-mandated text); several finale keys unconsumed until Task 3 (by design).
- Task 2: complete (commits 53e89c0..eb1b694, review clean incl. approved cleanDarkMatte border+maxC extension for a source matte bar). Minor (for final review): border+maxC drop rule is unsafe for future wholly-dark border-touching source art (documented in baker comment); baker comment at ~349 leans rationale-ish.
- Task 3: complete (working-tree only, playtest-held — js/truck.js finale machine + walkway render; headless: all 5 phases + win reached, 0 pageerrors; review clean). Minor (for final review): banner painted under full-white in road path (cosmetic); reveal→crash has no timeout beyond truck travel; standDelay clocks from crash start not landing.
- Task 4: complete (docs-only commit; no new game code). Honest end-to-end headless run (msedge): fast-forwarded to the boss (only rig), then really FOUGHT the Firewall with held keys (depth-match the roaming weak spot + spray wind/open windows) — killed in ~10s, hp 1360→0, NO hp-cut needed. Finale played untouched: detonate→whiteout→reveal→crash→walk all in order, essence +3, Jon walked into the gate, scene torn down, Game.state==="win". Zero pageerrors/JS errors; only console noise = known sprites/church/* 404s. npm test 229/229. 8-screenshot pack captured (t4-01..t4-08 in the session scratchpad) + read/described. Docs updated: fire-truck-art-handoff §3 marked done + §5 finale summary. EVERYTHING feel-bearing (js/truck.js, js/assets.js) stays UNCOMMITTED for the user's playtest — do NOT merge/release until they play.
