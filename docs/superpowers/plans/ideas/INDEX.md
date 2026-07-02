# Idea Specs — 2026-07-02 Pass (juice, agency, depth, fixes)

Ten specs from a full read of `js/` (main loop, entities, config, balance, church/mirror, upgrades, world, input) and every doc under `docs/superpowers/`. Brief: *"improvements, polish, juice, agency… inspired by Hades and other top-tier games; fix its problems."* All specs respect the hard constraints: **no jump, no melee**, no elaborate placeholder-art dependencies, and they build on (not duplicate) the Church death loop.

Every spec has: a problem statement with file citations, the design, why-it's-fun precedent, S/M/L scope, and open questions.

## Priority order

| # | Spec | Label | Scope | One-line pitch |
|---|------|-------|-------|----------------|
| 1 | [Bulwark bubble-fortress redesign](2026-07-02-bulwark-dome-fortress.md) | **Must-explore** | M | The named top open task. Dome gets rim HP (pop it from outside) or duel inside; breach-stagger payoff window; fixes five citable failure modes in the shipped dome code (safe annulus, hose shoves it out of its own dome, pure pierce-negation, ~80% dome uptime, corner planting). |
| 2 | [Difficulty & pacing + "Overpressure" dial](2026-07-02-difficulty-pacing-overpressure.md) | **Must-explore** | M | Fixes brutal-early (wave-2 charger, attack-ticket cap, first-death pity) and three *citable scaling leaks* behind trivial-late (Overcharge & Mirror invisible to `eliteScale`; economy maxes the tree mid-run). Then a Pact-of-Punishment PSI dial built from existing levers, paying Holy Essence. |
| 3 | [Juice & game-feel pass](2026-07-02-juice-and-game-feel.md) | **Must-explore** | M | Hit-stop tier table, trauma-based directional shake, kill the hurt-*blink* (keep the flash), squash-stretch, scaling kill confirms, wave-ender loot vacuum, GUSH audio pitch-ladder + capped water refund, looping pressure-tracking spray sound, boss slow-mo. Mostly S items on existing infrastructure. |
| 4 | [Fire & ground-hazard readability](2026-07-02-fire-and-hazard-readability.md) | **Must-explore** | S | The named fire-hitbox problem, root-caused: FireRing/Furnace-vent/SmeltBomb/Slayer-slam/Quake-leap all *test circles but draw flattened ellipses* (FirePatch was already fixed once — systematize it). One `Geo.inGroundEllipse` helper, one `GROUND_RY`, rim-is-the-hitbox contract, sizzle grace tick. Quick win. |
| 5 | [Boss multi-phase pattern language](2026-07-02-boss-pattern-language.md) | **Must-explore** | L (per-boss S/M) | Shape⇒dodge-verb grammar (the game already teaches 4 verbs — the fights just never recombine them), 3-phase skeleton with transition rituals + bar pips, and concrete P2/P3 sketches per boss (Big Drip drips; Slayer plays bank shots and runs the table). |
| 6 | [Benedictions — in-run boons](2026-07-02-benedictions-run-boons.md) | **Must-explore** | L | Hades boons as element-flavored pick-1-of-3 at boss/set-piece beats, washed on death (real stakes for the unloseable loop). 16 launch boons + duos, all hung off dormant code hooks; the "charged blast" arrives as a release-burst — zero new buttons. |
| 7 | [Church meta-progression & narrative](2026-07-02-church-meta-and-narrative.md) | **Strong** (item 1 Must) | M | **`Church.load()` currently discards the save every boot — wire persistence first.** Then: Essence tithe on death, allies populate the nave with hints + keepsakes, reactive Father Jon, and Dark Jon as the undecided Water-shrine answer. |
| 8 | [Hose Aspects — run-start customization](2026-07-02-hose-aspects-run-start.md) | **Strong** | M | The argued alternative to the reconsidered Mirror altar: ally light-ups unlock weapon *aspects* (wide fan / all-or-nothing burst / holy-water sustain) — verbs, not stat floors. Essence sinks into aspect ranks; Mirror demotes to a small Vigor font with existing migration plumbing. |
| 9 | [Economy, drops & shop](2026-07-02-economy-drops-and-shop.md) | **Strong** | S/M | Drop *pity timer* + need-weighted drops + legible kibble (fixes "drops feel low" without inflation), wave-clear loot beat, Overcharge → one-per-run **Relics**, act-rotating supplies from the vetted talent-doc list, wave-1 starter vendor. |
| 10 | [Enemy roster & threat mix](2026-07-02-enemy-roster-and-threat-mix.md) | **Strong** | M | Chargers are authored into 14/23 encounters — de-author + per-act sprinkle weights + feint retune; elite *affixes* over stat inflation; two gap-filling archetypes (Siphon attacks your **water**; Gutter Choir swarm-column); Soaked status as shared infrastructure. |
| 11 | [Controls, accessibility & QoL](2026-07-02-controls-accessibility-qol.md) | **Strong** | S/M | Found bug: edge-presses (dash!) are eaten during hit-stop/arrival freezes — 130ms input buffer fixes feel *and* difficulty. Neutral dash, gamepad A=confirm + remap, settings panel (shake/flash/hit-stop/spray-toggle), colorblind telegraph patterns, training range, delete dead jump/melee code. |

## Suggested sequencing (dependency-aware)

1. **Quick wins first (1–2 sessions each):** #4 fire readability, #11 §1 input buffer, #7 §1 persistence, #2 Part 1 curve fixes. All small, all fix named playtest complaints, and several are prerequisites (buffer before hit-stop; persistence before any meta work).
2. **The headline fight:** #1 Bulwark dome-fortress.
3. **Feel layer:** #3 juice pass (items 1–5), riding on the input buffer.
4. **Depth layer:** #6 benedictions system + first water/earth batch → #8 aspects (shares Church/station plumbing) → #5 boss phases (Big Drip + Slayer first) → #2 Part 2 Overpressure (wants boss phases for "Sunday Service").
5. **Sustain layer:** #9 economy, #10 roster, #7 items 3–5, #11 settings — interleave as palate cleansers.

## Cross-cutting notes

- **Shared infrastructure to build once:** enemy status container (Soaked/Scald — spec #10 §4, consumed by #6/#8), `Geo.inGroundEllipse` (#4, consumed by #1/#5), walk-up-sigil choice UI (#6, reused by #8), `JH.JUICE` constants block (#3, exposed by #11's settings).
- **Speculative items are marked inline** (Bulwark Prime, Dark Jon, nave renovations, Gutter Choir) — everything else is designed to land on current code with the project's standard playtest gate.
- Several real defects surfaced during the read and are folded into specs rather than filed separately: the hit-vs-visual ellipse mismatches (#4), eaten inputs during freezes (#11), Overcharge/Mirror invisible to `eliteScale` (#2), hose knockback ejecting the Bulwark from its own dome (#1), church save never loading (#7).
