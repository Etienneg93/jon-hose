# v0.27.0 Progression Pass — design

**Date:** 2026-07-05 · **Builds on:** curve-pass → switch-gk-art (branch
`progression-pass`). Draws on the idea docs
`2026-07-02-benedictions-run-boons.md` and `2026-07-02-economy-drops-and-shop.md`.

**Sequencing note (user, 2026-07-05):** super-elite balance can't be finished
until this pass raises player power — the compound playtest tunes v0.26 +
v0.27 together.

## The shape

Three growth layers, each with one job:

| Layer | Job | Cadence |
|---|---|---|
| **XP levels** | numbers (stat growth) | ~13 auto level-ups/run |
| **Benedictions** | rules (build identity) | 9 pick-beats/run |
| **Church pillars** | element favor (meta stats + boon direction) | essence spends at the Church |

The Suds shop stops selling stat paste and becomes an event: signatures,
relics, consumables, every ~3rd wave.

## 1. XP & levels

- **XP per kill = the enemy's `def.suds` value** (elite/super scaling
  included — a super-elite kill is a visible chunk). Set-piece clears grant
  +30. No new per-enemy data.
- **Curve:** `Balance.xpForLevel(n) = 20 + 12n` (pure, tested). Against a
  full run's kill value this yields **~13 levels** — steady, front-loaded
  slightly by early wave density.
- **Level-up moment (no pause, no pick):** golden flash ring on Jon,
  LEVEL UP sting, +10% max water & HP topped up, stat gain applied
  instantly — the stat panel's existing delta-flash shows what grew.
- **Fixed 6-step gain cycle** (repeats; no RNG): `+3 spray dmg → +8 max
  water → +8 max HP → +4 spray range → +3 spray dmg → +2 water regen`.
  Budget over 13 levels ≈ the retired stat nodes' totals, so the v0.26
  difficulty math holds *(cycle values tunable)*.
- **HUD:** thin XP sliver under the water bar + small `LV n`.
- Levels are run-scoped like the old tree (kept through Church respawn,
  reset by `startGame`).

## 2. Benedictions (in-run boons)

**Beats:** after each boss kill and set-piece clear (9/run). Three floating
element sigils appear in the cleared arena — walk up + E (Church station
pattern; no modal, no new button). Walk on to skip; they despawn when the
next wave arms. **Death washes all benedictions** (suds, signatures,
relics, levels, pillars are kept) — the death loop's real stake.

**Offer algorithm** (pure, injectable RNG, unit-tested):
- 3 sigils from 3 distinct elements when possible.
- Element weight = `1 + 0.5·pillarRank(element) + 0.25·ownedBoons(element)`
  — pillar favor and build momentum pull their god back to you.
- A **duo sigil** (dual glyph, visibly special) replaces one slot when its
  two-element prerequisites are held (25% chance, each duo offered once).
- A **legendary sigil** (gold) replaces one slot when its element
  prerequisite (≥2 owned boons of that element) is held (15% chance, each
  offered once; duo takes priority if both roll).
- **Deepen offers**: owned boons re-enter the pool as rank II upgrades —
  late beats never show dregs (the Pom of Power role).
- The **Censer** relic adds a 4th sigil.

**No cast button — recorded decision:** the hose is an analog verb; the
"cast" is *releasing the trigger* (Pressure Sermon). If playtests want more
active tech, the expansion route is elemental release-burst variants, never
a new binding.

### The vetted pool — 17 boons + 3 duos + 4 legendaries (boons have rank II)

Vetting standard (user, 2026-07-05): every option must be a good pick —
each entry lists its genre precedent, verb, synergies, and why it can't be
a trap. The one failure found in the draft (*Undertow*: pulling enemies
onto a contact-damage player) is reworked below as *Eddy*.

**💧 Water — control & sustain**

| Boon | Effect (rank II) | Precedent / verb | Synergy / trap-check |
|---|---|---|---|
| **Split Stream** | 50% of spray damage arcs to one nearby enemy with a visible chain-stream (II: two extra targets) | Chain damage (Zeus bolts) / Stream | Promoted from the shop tree per vetting — pure damage spread, zero positioning risk. (Eddy was cut: pulling fights the knockback-is-safety design) |
| **Baptismal Wake** | Dash leaves a puddle (reuses `SlowZone`, enemy-slowing variant, 0.7×, 3s) (II: larger + enemies inside take +10% dmg) | Dead Cells oil trail / Dash | Dash becomes control; purely positive |
| **Overflow** | Tank ≥80%: +20% spray dmg (II: +30%, threshold 70%) | RoR full-HP items, Aphrodite privilege / Stream+Tank | Pairs with Closed Loop + water pillar; teaches burst discipline |
| **Baptize** | Enemies at wetness >0.3 take +15% spray dmg (II: +25%) | Hades curse-amp (Weak) / Stream | Makes the existing soak mechanical — the status web's hub |
| **Absolution** | Wave clear heals 25 (II: 40 + clears burn) | Dead Cells recovery / Body | Sustain identity; no downside |

**🔥 Fire — damage & risk**

| Boon | Effect (rank II) | Precedent / verb | Synergy / trap-check |
|---|---|---|---|
| **Scalding Faith** | Full-pressure spray applies Scald: 4/s for 2s enemy DoT (II: 6/s, 3s) | Ares Doom / Stream | The enemy-side status; new small `Enemy` status mirroring burn |
| **Backdraft** | Dashing through enemies Scalds them (II: +8 burst pop) | Athena/Artemis dash boons / Dash | Dash-through-crowds is already the movement design (no body collision); i-frames cover the risk |
| **Trial by Fire** | +20% spray dmg to enemies that are burning, Scalded, or standing in a fire patch (II: +30%) | Bonus-vs-status amps (Artemis vs marked) / Stream | Works standalone from Act 1 (enemy fire is everywhere post-v0.26), scales with a fire build; never requires Jon to be on fire (Stoke the Boiler cut in vetting for exactly that) |
| **Ash Walk** | First burn stack per patch ignored (passive); walking a patch douses it with a steam pop (6 dmg nearby), douse on a **10s cooldown** (II: 6s cd + bigger pop) | Fire-immunity boots (DC) / Body | One free douse per engagement, not a fire vacuum; act-agnostic now that supers/fuses spread fire from Act 1 |

**🪨 Earth — force & interrupts**

| Boon | Effect (rank II) | Precedent / verb | Synergy / trap-check |
|---|---|---|---|
| **Aftershock** | Enemies knocked into arena walls/debris take 15 slam dmg (II: 25 + a small shockwave at the impact) | Hades Poseidon wall-slam — direct precedent / Stream | Stacks the knockback identity into damage; the arena x-clamp already exists in-engine. Works vs supers (giants aren't bosses, so they slam). (Stone Nozzle's stagger cut per vetting) |
| **Sure Grip** | Spray no longer slows your movement (II: +10% knockback) | Hermes utility / Body | Pure QoL upside — the trade was cut in vetting |
| **Bedrock Vigor** | +40 max HP; taking a hit grants +20% knockback for 3s (II: +60 HP) | Tank identity picks / Body | Downside removed in vetting; getting hit now has a payoff |
| **Landslide** | Knocked-back enemies damage enemies they pass through (8) (II: 14 + staggers them) | Hades Poseidon + Breaking Wave — direct precedent / Stream | Clumps (Eddy!) become bowling; push = safety + damage |

**🌬️ Air — tempo**

| Boon | Effect (rank II) | Precedent / verb | Synergy / trap-check |
|---|---|---|---|
| **Gale Stride** | Dash travels 40% farther in the same time (II: 60%) | Mobility reach (Hermes) / Dash | Dash cd is already low — air's identity is stride length and weave, not cd spam (Second Coming cut per vetting) |
| **Slipstream Draft** | 0.5s of free-water spray after each dash (II: 0.8s) | Momentum weaves / Dash+Stream | Weaves the two verbs; always useful |
| **Tailwind Tithe** | +2% move speed per GUSH combo, cap +20% (II: cap +30%) | Combo-speed scalars / Body | First mechanical GUSH hook; capped |
| **Eye of the Storm** | 1s guaranteed dodge at wave start & after sigil pickup (II: 1.5s + 15% move during) | Opener protection (Hades' Divine Protection) / Body | Covers the exact spawn-rush moment the ticket system creates |

**Duos** (dual-glyph sigil, needs ≥1 boon from each element):
- **Steam Sermon** (💧🔥) — spraying a FirePatch vents a damaging steam
  cloud over it (12/s, 1.5s). Extinguishing becomes offense.
- **Mudslide** (💧🪨) — enemies knocked across a puddle are dragged its
  full length and slowed.
- **Firestorm** (🔥🌬️) — dash leaves a short *friendly* flame trail
  (patches flagged harmless to Jon).

**Legendaries — one per element** (gold sigil; prerequisite: own ≥2 boons
of that element; each offered once per run, 15% slot chance when eligible):
- 💧 **Pressure Sermon** — releasing spray after ≥0.8s of continuous full
  pressure emits a knockback cone (10 water). The cast that needs no
  button (`sprayHeldT` exists).
- 🔥 **Bushfire** — Scald spreads to enemies within 40px of a Scalded one
  (contagion; Hades' spread-Doom chase, needs a Scald source which the
  prereq guarantees in practice).
- 🪨 **Standing Stone** — after 0.5s of not moving: no knockback taken,
  +25% damage, wider spray until you move. Turret-mode playstyle flip;
  dash out any time.
- 🌬️ **Whirlwind Walk** — dashing destroys enemy projectiles it touches
  and gusts non-boss enemies aside (15 dmg + knock). The anti-pyro/smelt/
  Slayer skill pick.

**HUD:** element-colored sigil strip near the buff auras; rank-II boons get
a bright pip. Stat panel lists them by name.

## 3. Church pillars (replaces the Mirror altar)

The nine two-sided Mirror nodes retire (this resolves the "Mirror model
under reconsideration" note from 2026-07-01). The nave holds **four element
pillars**; locked ones display their nemesis's silhouette.

| Pillar | Gate | Per rank (1/2/3 essence) | Rank 3 capstone |
|---|---|---|---|
| 💧 Water | always open | +15 max water, +3 water regen | spray never drops below the mid-pressure tier |
| 🪨 Earth | redeem Quake | +12 max HP, +15 knockback | wall-slammed enemies are staggered |
| 🔥 Fire | redeem Slayer | +3 spray dmg, burn ticks on Jon −25% | full-pressure spray Scalds baseline |
| 🌬️ Air | redeem Ass Man (future act) | +5 move speed, −0.05s dash cd | +0.1s dash i-frames |

- **Favor:** pillar ranks feed the benediction offer weights (§2) — the
  Church is where you choose which god walks with you.
- ~10 essence per session vs ~6 to max one pillar = a real choice; every
  pillar is a legible, chunky package *(numbers tunable)*.
- Spend beat (the essence-feel fix): station flare + element ring burst,
  church-bell chime, rank pips animate, Father Jon turns his head.
- Legacy: `mirror.js` node model retired; walk-up station plumbing reused;
  old save migration is moot (no persistence yet).

## 4. Shop & economy

**Cadence:** vendor appears every **3rd wave clear** (~9 visits/run),
guaranteed in each post-boss corridor. The vendor arriving is an event, and
relic rotation makes each visit a decision.

**Stock per visit:**
- *Lifeline (always):* Med Kit 45 · Pressure Charge 70.
- *Signatures (listed until bought):* **Hydro-Dash** 160 (available from
  the start) · **Fire-Marshal Spec** 200 (+30 range, +30 knockback — the
  safety-through-knockback big buy) and **Hydro Lance** 220 (from Act 2 —
  the old tier-3 gate, reused). Split Stream moved to the benediction pool
  per vetting; the 12 stat nodes retire (their budget lives in the level
  cycle).
- *Relics — 3 of 10 rotate per visit, one-per-run each, 150–300:*

| Relic | Effect |
|---|---|
| Brass Nozzle | +1 pierce target below Hydro Lance tier |
| Spigot Key | hydrant touch grants 15s of +10% dmg |
| Loaded Sponge | GUSH milestone refunds doubled |
| Prayer Bead Clamp | free Pressure Charge after every boss phase |
| Collection Plate | +2 suds per kill |
| **Censer** | benediction beats offer a 4th sigil |
| **Sunday Suit** | +1 Essence per boss |
| **Punch Card** | shop prices −20% |
| **Dowsing Rod** | pickup magnet radius ×2, water cans +50% |
| **Alarm Bell** | every wave clear drops the bonus item (not just tough) |

- *Paste sink:* one Overcharge (damage) at ×1.8ⁿ.

**Drop feel:** pity timer (6 dry kills → guaranteed item, streak survives
budgeted fights), need-weighted health/water split (hp <50% → health ×2;
water <30% → water ×2), kibble shows green +HP ticks while healing, and
tough-wave clears drop one bonus need-weighted item with the AREA CLEAR
banner.

## 5. Integration

- `powerCount` becomes nodes(signatures) + relics + overcharge buys +
  **player level** + **pillar ranks** — the v0.26 enemy ramp keeps seeing
  all power (mirror-rank term swaps to pillar ranks).
- All selection/curve math (`xpForLevel`, gain cycle, offer weights, pity
  rolls) = pure functions in `balance.js`, injectable RNG, unit-tested.
- Logic boons (Scald, stagger caps, Baptize, Overflow) unit-tested;
  feel boons smoke-tested in the range gallery.
- Death-wash test: die with boons → respawn keeps suds/signatures/relics/
  levels/pillars, loses benedictions only.
- Ships behind the standing compound playtest gate (v0.26 curve + boss art
  + this, tuned together; super-elite numbers finalize *after* this pass
  per the sequencing note).

## Deferred / recorded

- Elemental release-burst family (the "cast is letting go" expansion).
- Hades-2-style infusion boons (reward mono/multi-element counts).
- Act-rotating consumables; starter-deal pricing (early game no longer
  needs it).
- v0.28 Areas & World pass (between-level choices + background/floor art).
- Church persistence still parked; pillars are session-scoped until it
  unparks.
