# The Church of the Hose — Progression Overhaul (North-Star Vision)

**Date:** 2026-06-29 (corrected-flow section added 2026-07-01)
**Status:** North star, **partially revised**. Phase 0/0.1 (the death loop) shipped.
The **elemental-progression half got ahead of itself** — the "Elemental Mirror
altar / two-sided talent-tree pillars" (`2026-06-30-elemental-mirror-altar-design.md`,
v1 built) was speced before the church flow was nailed down, and the user is **not
sold on it**. The authoritative church flow is now the "Corrected flow" section
below; the Mirror-altar node model is **under reconsideration** and should not be
extended until this is re-decided.
**First phase to spec:** Phase 0 (the Church & the death loop) — done.

## Corrected flow (2026-07-01 — authoritative over the pillars/Mirror model)

The intended church loop, as decided by the user:

1. **Die → Church of the Hose → try again.** (Shipped — Phase 0/0.1.)
2. **Ally reveal cutscenes gate the elemental chamber.** After you redeem an
   ally, the *next* time you enter the Church that ally is **present in the
   church**, and on that visit performs a reveal beat:
   - **Quake Walker (Earth):** the first ally redeemed. On his church appearance
     he does his **signature stomp**, which **cracks open a doorway to a new
     room — the elemental chamber**. He then **lights up the Earth section**.
   - **The Slayer (Fire):** next visit after redeeming him, he's in the church and
     **lights the Fire section**.
   - **Ass Man (Air):** lights the **Air section**.
   - **Water:** **undecided.** Candidate: **Jon must face his inner demon** — a
     Dark/corrupted Jon — to light his own (Water) section.
3. **What the light-ups DO is undecided.** They may power Jon up in some way —
   mechanic TBD. This is the open design question, *not* the two-sided
   Essence-node talent tree (that model is parked).

**Implication for the Mirror-altar spec:** the *chamber* and the *ally-lights-its-
section* framing survive; the specific **"Mirror of Night two-sided leveled nodes"
upgrade mechanic does not** (parked pending the light-up-effect decision).

The remainder of this doc is the original 2026-06-29 vision, kept for context.

## Why this exists

Jon Hose today is a 14-wave linear arcade brawler where **death is a total wipe**:
`gameOver()` → `startGame()` calls `JH.Upgrades.reset()` and dumps you back at
wave 1 with nothing (`js/game.js:246`, `:655`). The playtest (2026-06-28) and the
v1.0 balance spec both diagnose the same disease — a brutal-early / trivial-late
curve and a **dead-end economy** (the skill tree *cannot not* be maxed). The
balance pass treats the symptom with number-tuning + a Suds sink. This overhaul
treats the cause: it makes **death meaningful** and gives progression somewhere
to go, the way a meta-progression roguelike (Hades) does — without throwing away
the fact that Jon Hose is a *completable campaign you can beat in one sitting*.

## The core idea

When you die, you wake in the **Church of the Hose** — a sacred space where a
**Bishop version of Jon Hose** receives you, delivers a sermon on why you must
keep going, and lets you spend what your death earned before sending you back.
Four **elemental shrines** line the nave; each lights up as you redeem its
boss-ally. Death is no longer a fail-screen — it's a *scene*, and it's *progress*.

This realizes the **"elemental shrine system"** already reserved-but-unbuilt in
`FEATURE-BREAKDOWN.md` (the `{ fire: { ally: "slayer", unlocked: false } }` stub).

## Pillars

1. **Death is progress, never a wipe.** You return to the Church, bank essence,
   choose a reward, and resume from a checkpoint — you do not restart at wave 1.
2. **Two economies: Material vs. Spiritual.**
   - **Suds → Gear** (in-run, material): nozzles, tanks, hose mods. Bought during
     a run; roguelike — resets per run. Your *kit for this attempt*.
   - **Holy Essence → Spirit** (permanent, in the Church): a talent tree + boon
     system, banked on death, spent at Bishop Jon's altar. Your *identity across
     attempts*. Nozzles & tanks for the body; talents & blessings for the soul.
3. **Agency at the altar.** The Bishop offers a *choice* (deepen a lit shrine, or
   take a blessing) — not an automatic buff. Death is a decision point.
4. **The four allies are the four elemental branches.** Redeeming each boss-ally
   unlocks that element's path/archetype in the spiritual talent tree.
5. **Expansion-first.** Designed so new worlds/bosses plug in more shrines/tiers;
   no throwaway work as content grows.

## Genre decision

**Persistent campaign with Church checkpoints** (the "Option B" of the framing
discussion), *not* a from-scratch roguelike run loop. You keep campaign progress
across deaths; the Church is the between-deaths meta layer. This preserves the
existing 14-wave spine and the "you WIN" finale while layering replay/meta on top.
The full meta payoff scales up as more worlds/bosses are added (the campaign is
currently a ~13-min clear — too short for a deep meta loop on its own, by design
acknowledged up front).

## The four elements / allies

| Element | Ally | Status today | Signature flavor |
|---|---|---|---|
| **Earth** | Quake Walker | **Implemented** boss→ally (`js/config.js` `JH.QUAKE`) | Stomp shockwaves |
| **Fire** | The Slayer | **Planned, not built** (`FEATURE-BREAKDOWN.md:212`) | Flaming lobs / ignite / burn |
| **Air** | Ass Man | **Planned**, art in progress (`sprites/assman/`, `ASEPRITE-WORKFLOW.md`) | Mobility / gust / dash |
| **Water** | You (Jon) | The hose itself | Max-pressure surge / capstone |

Each redeemed ally lights its shrine and unlocks its archetype branch in the
spiritual talent tree. Earth ships first (boss exists); Fire and Air light up as
those bosses are built.

## Phased build order

This is **four interlocking subsystems**; two depend on unbuilt bosses. It is
deliberately decomposed — each phase is its own spec + plan.

| Phase | Ships | Depends on |
|---|---|---|
| **0 — The Church & the death loop** | Die → Church of the Hose → Bishop Jon sermon → bank essence → spend at a minimal altar → resume from checkpoint. The keystone: kills "death = wipe" on its own. | Nothing (no new bosses) |
| **1 — Gear economy** | Replace the fixed Suds skill tree with per-run hose **gear/upgrades** that reset each run (nozzles, tanks, hose mods). | Phase 0 |
| **2 — Spiritual talent tree + boons** | Holy essence spent at the altar on a permanent talent tree + boon system (the full "agency at the altar"). | Phases 0–1 |
| **3 — Elemental archetypes** | Each ally-boss unlocks its archetype branch. Earth (Quake) first; Fire/Air as the Slayer & Ass Man bosses land. | Phase 2 + Slayer/Ass Man bosses |

## Relationship to existing work

- **Balance pass (`balance-pass` branch / v1.0 spec):** complementary, not
  replaced. Tier-A/B number tuning still applies inside a run. The dead-end
  economy this overhaul fixes structurally is the same one the sink half-addresses.
- **Super-elites (Bulwark/Stalker):** unaffected — in-run enemy design.
- **The Slayer / Ass Man (`FEATURE-BREAKDOWN.md`, `ASEPRITE-WORKFLOW.md`):** their
  boss/ally + art work is the content dependency for Phase 3's Fire/Air branches.

## Out of scope for this vision doc

Per-phase mechanics, UI layouts, data schemas, checkpoint granularity, essence
formulas, and Bishop dialogue — all defined in each phase's own design spec,
starting with Phase 0.
