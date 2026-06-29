# The Church of the Hose — Progression Overhaul (North-Star Vision)

**Date:** 2026-06-29
**Status:** Approved vision / north star. Not an implementation spec — this is the
umbrella document. Each phase below gets its own brainstorm → design spec → plan.
**First phase to spec:** Phase 0 (the Church & the death loop).

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
