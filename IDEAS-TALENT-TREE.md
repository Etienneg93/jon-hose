# Talent Tree & XP System — Design Ideas

## Overview

Replace (or layer on top of) the current Suds-purchase model with an **XP-driven talent point system**. Instead of — or alongside — spending Suds at Old Spigot's shop, Jon earns **Talent Points (TP)** by accumulating XP from combat. Those points are spent in a deeper talent tree that includes **cross-branch combo talents** unlocked by investing in two branches simultaneously.

---

## Option A — XP Replaces Suds Upgrades

- Enemies drop **XP** instead of (or as well as) Suds.
- Every N XP earned grants **+1 Talent Point**.
- Old Spigot still sells consumables (Patch-Up Kits, one-time ammo pickups) but the permanent upgrade tree is now TP-gated, not Suds-gated.
- Suds become a pure consumable currency; TP is the progression currency.

**Pros:** Cleaner separation. Upgrades feel earned by play rather than grinding drops.  
**Cons:** Removes the tense "do I have enough Suds?" pressure between waves.

---

## Option B — XP Synergizes with Suds (Recommended)

- Enemies still drop Suds for consumable/shop spending.
- Killing enemies also builds an **XP bar** (no need to pick anything up — automatic).
- Every wave clear or boss kill awards a **Talent Point**.
- Talent tree nodes have **no Suds cost** — they cost TP only.
- Old Spigot's shop still exists for Suds-based consumables and maybe cheap early-tier unlocks, but the mid/late-game power comes from TP talents.

**Pros:** Both currencies feel meaningful. Early game stays tense (Suds); mid/late game opens up (TP combos).  
**Cons:** Two systems to explain to new players.

---

## XP Gain Tuning Ideas

| Source | XP |
|---|---|
| Mook killed | 10 |
| Charger killed | 18 |
| Pyro killed (water bonus) | 25 |
| Elite enemy killed | 40 |
| Boss killed | 150 |
| Wave cleared without taking damage | +25 bonus |
| Barricade destroyed | 30 |

TP thresholds: 50 XP → 1 TP, 100 XP → 2 TP, then +75 XP per additional TP (soft scaling to prevent over-accumulation in a single run).

---

## Talent Tree Structure

Each branch has **Tier 1–3** nodes (currently implemented as Suds purchases). Tier 4 nodes are the new **Combo Talents** — they require a minimum investment in **two different branches** and can only be purchased with TP.

```
PRESSURE  REACH  TANK  MOBILITY  VITALITY
   T1       T1    T1      T1        T1
   T2       T2    T2      T2        T2
   T3       T3    T3      T3        T3
    \       /  \  /   \  /    \    /
     [COMBO] [COMBO] [COMBO] [COMBO] ...
               (Tier 4 cross-branch nodes)
```

---

## Tier 4 Combo Talents

Each combo talent requires **Tier 3 in both specified branches** (or at minimum Tier 2 in both, for balance).

### PRESSURE + TANK → **Hydraulic Overdrive**
> *"Req: Hydro Lance (PW3) + Closed Loop (TK3)"*

**Passive:** When your water tank is above 80%, your beam deals **+25% bonus damage** and generates a visible superheated shimmer effect. The payoff for keeping your tank topped up is enormous — fights become a rhythm of burst-fire, back off, top up, burst again.

**Design intent:** Rewards the "discipline" playstyle. Pressure branch pushes raw DPS; Tank branch keeps the tank full; together they enable a damage window that neither branch reaches alone.

---

### PRESSURE + REACH → **Hydro Spear**
> *"Req: Hydro Lance (PW3) + Split Stream (RC3)"*

**Passive:** The beam now has **infinite pierce** (hits every enemy in the line, not just first contact) and its visual narrows to a laser-thin jet. Range cap is lifted by 40. The split-stream arc fires at full damage instead of 30%.

**Design intent:** Turns Jon into a crowd-clearing sniper. Works best in corridor-style choke points and rewards lining up shots carefully.

---

### TANK + MOBILITY → **Adrenaline Siphon**
> *"Req: Closed Loop (TK3) + Kinetic Tap (MB3)"*

**Passive:** Water return now also triggers while **dashing** (not just hosing). Each dash restores 15 water. Dashing at or above 60% tank gives a **+35 speed burst** for 2 seconds (stacks with existing dash boost). 

**Design intent:** Enables a hit-and-run style where you're constantly in motion, never standing still long enough to drain out. The tank fuels mobility; mobility fuels the tank.

---

### REACH + VITALITY → **Splash Zone**
> *"Req: Split Stream (RC3) + Vampiric Hose (VT3)"*

**Passive:** The split-stream arc now fires a **spread cone** instead of a single arc hit, hitting up to 3 nearby enemies for 40% damage each. Vampiric healing applies to **all hits** including arc/cone — a crowd of enemies in your cone becomes a significant sustain source.

**Design intent:** Converts the single-target vampiric heal into a mass-sustain tool. Rewards aggressive positioning in the middle of groups.

---

### PRESSURE + VITALITY → **Scalding Steam**
> *"Req: Hydro Lance (PW3) + Vampiric Hose (VT3)"*

**Passive:** At max beam level, the hose deals a **burn-DoT** (5 dmg/sec for 3 sec) on top of direct damage. Burn ticks also trigger vampiric healing at 10% rate. Enemies on fire (Pyros) get the DoT amplified to 12 dmg/sec.

**Design intent:** Anti-Pyro specialisation + a damage-over-time layer that rewards sustained fire. Synergises brutally with Pyro fights.

---

### TANK + VITALITY → **Iron Flask**
> *"Req: Closed Loop (TK3) + Vampiric Hose (VT3)"*

**Passive:** Your **max HP scales with current water level** — at full tank you gain +20 bonus HP (shown as an orange bar above the HP bar). If your tank drops below 30%, you lose the bonus HP (you don't die, it just removes the buffer). Wave clear restores both tank and the bonus HP buffer.

**Design intent:** A defensive cohesion talent — it makes running dry feel genuinely scary. Playing carefully around water management is now rewarded with a survivability buffer.

---

### MOBILITY + VITALITY → **Slip Draft**
> *"Req: Kinetic Tap (MB3) + Vampiric Hose (VT3)"*

**Passive:** After every dash that passes **through an enemy** (overlapping their hitbox during i-frames), Jon heals **8 HP** and instantly gains **+12 water**. A brief golden ring pulses from the enemy to signal the proc.

**Design intent:** Rewards aggressive, daring dashes through enemy groups rather than safe sideways dodges. High skill ceiling, high payoff.

---

### REACH + TANK → **Hydrant Aura**
> *"Req: Fire-Marshal Spec (RC2+) + Closed Loop (TK3)"* *(requires only RC2 — entry-point combo)*

**Passive:** Jon's effective range now includes a **2-tile aura** of slow water spread on the floor around him. Enemies in the puddle take 3 dmg/sec and have 20% reduced movement speed. The water economy cost is zero — it's free pressure from the existing tank loop.

**Design intent:** Crowd control / area denial. A shorter-range alternative to the Hydro Spear combo for players who prefer close-quarters pressure.

---

### PRESSURE + MOBILITY → **Turbo Nozzle**
> *"Req: Hydro Lance (PW3) + Hydro-Dash (MB2+)"* *(requires only MB2 — entry-point combo)*

**Passive:** Dashing **while spraying** no longer locks your facing — you can **dash sideways and keep the beam on target** (normally spraying locks facing). A 1-second cooldown prevents abuse.

**Design intent:** The most "advanced tech" feeling talent. Enables strafing attacks, dramatically raises the skill ceiling on movement, and feels uniquely satisfying to pull off.

---

## UI / UX Ideas for the Combo System

- **Branch investment indicators:** In the shop UI, each branch column shows a small colored pip (e.g. 3 blue pips for 3 Pressure nodes owned). Combo talent unlock conditions show both branch pip requirements grayed out until met.
- **Combo nodes sit in a separate Tier 4 row** at the bottom of the shop, between the two branch columns they bridge. Connecting lines animate when the requirements are met.
- **Unlock animation:** First time a combo unlocks, a brief "COMBO UNLOCKED" flash appears on the HUD with the talent name — makes reaching it feel like an achievement moment.
- **Tooltip wording:** Each combo talent's tooltip shows the two branch requirement icons: `[⚡ Hydro Lance] + [💧 Closed Loop] → Hydraulic Overdrive`.

---

## Balancing Notes

- Combo talents are intentionally powerful — they're meant to define a run's identity.
- A player should realistically unlock **1–2 combo talents per full run** (not all of them), forcing a playstyle commitment.
- Combo talents should NOT make the base branches feel mandatory. If every run converges to Pressure+Tank, reduce Hydraulic Overdrive's power or buff other combos.
- Consider a **soft-lock prevention**: if a player has T3 in only one branch by mid-game, Old Spigot offers a one-time TP discount on adjacent branches so they can reach a combo before the final boss.

---

## Store Consumables

### Input Philosophy First

The current in-combat kit is three actions: **Move, Spray (hold), Dash**. That's the whole game — and it's intentionally tight. Any consumable design should respect that. The guiding rule:

> **Default to passive or auto-trigger. Only add a button if the active moment genuinely can't be replicated any other way — and if we do, it's ONE button total.**

Three tiers of "how active is this?":

| Tier | Mechanism | New button needed? |
|---|---|---|
| **Passive** | Always-on stat or auto-triggers on a condition | No |
| **Context E** | Press `E` when NOT near a vendor | No (reuses existing key) |
| **Quick-Use slot** | One equippable active item, one new key (`K` / gamepad `X`) | Yes — but only one, ever |

---

### Passive Consumables (bought at shop, apply immediately or carry silently)

These are the safest to add — zero new inputs, zero HUD clutter beyond an icon.

**Patch-Up Kit** *(already exists — 15 Suds → 35% HP)*
Keep as-is. The gold standard for the model.

**Pressure Canister** *(~20 Suds)*
Instantly tops the tank to 100%. Like a pocket hydrant. Buy it between waves, it fires the moment you hand over the Suds. No button. Useful before a boss.

**Repair Tape** *(~30 Suds)*
A passive carry item: the first time HP drops below 15% this wave, auto-heals 25 HP. Consumed on use. Only one can be held at a time. No button — the trigger is the damage threshold.

**Overflow Valve** *(~25 Suds)*
Passive carry: if you'd top up water past max (e.g. at a hydrant when already at 90%), the overflow is stored and added as a flat +20 damage bonus on your next 3 spray ticks before draining. Rewards greedy hydrant use rather than wasting it.

**Anti-Ember Wrap** *(~20 Suds)*
Passive: reduces incoming Pyro ember damage by 40% for the next wave. A situational buy when you know a Pyro wave is coming. Consumed at wave end.

---

### Context-E Consumables (use `E` when away from vendor)

`E` already means "talk to vendor." When no vendor is in range, `E` is dead — that's a free hook for a single active item without adding a button.

**Stim Canteen** *(~35 Suds)*
Carried active. Press `E` in the field to drink: +20% spray damage for 8 seconds, small visual indicator (brief glow on the beam). One per purchase, can carry one at a time. The HUD shows a canteen icon when you have one.

**Emergency Splice** *(~40 Suds)*
Carried active. Press `E` to trigger: instantly resets dash cooldown and grants 1.5 seconds of i-frames without moving. Panic button for when you're cornered and the dash is on cooldown. One use.

> **Risk with context-E:** if the player is near a vendor they can't accidentally "drink" — but the UI tooltip should make the context crystal clear ("E: Talk" vs "E: Use Canteen"). Only one context-E item can be carried at a time to avoid a selection problem.

---

### Quick-Use Slot (one new button: `K` keyboard / `X` gamepad)

Only introduce this if there's demand for more than one active consumable type simultaneously. The slot holds **one item** — no inventory screen, no cycling. What's equipped is what fires.

**Soap Bomb** *(~50 Suds)*
Throw a soap grenade at the nearest enemy (auto-aims to closest target in range). On hit: applies a slippery puddle that lasts 4 seconds — enemies in the zone move 30% slower and take 5% more knockback. A single throw, one use. Works brilliantly with Reach builds.

**Hydrant Tab** *(~45 Suds)*
Drop a portable mini-hydrant at Jon's feet. Lasts 6 seconds, refills water at half the rate of a real hydrant. Useful when you've run past the last real hydrant and need a top-up in a fight.

> If the quick-use slot is added, the HUD gets a small slot icon (bottom-right corner, near the water meter). It shows the item icon + a use count. Nothing else changes in the control layout.

---

### What to Avoid

- **Multi-item inventory with a cycle button.** Picking from 3 consumables mid-fight kills focus. If it needs a menu, it belongs in the shop only.
- **Timed-window inputs** (hold Dash + Spray to activate a consumable). Chord inputs collide with the core game feel — spraying and dashing are already load-bearing.
- **Per-wave auto-resupply.** If consumables refill for free each wave they stop being decisions. They should feel like a resource spend, not a cooldown.
- **More than one active button total.** If both Context-E and Quick-Use exist simultaneously, document clearly that only one active item can be held of each type. The player should never have to think "which button fires my consumable."

---

### Suggested Shop Layout at Old Spigot

```
┌─────────────────── OLD SPIGOT ───────────────────┐
│  SKILL TREE          │  SUPPLIES (Suds)           │
│  [existing nodes]    │  Patch-Up Kit      15 Suds │
│                      │  Pressure Canister 20 Suds │
│                      │  Repair Tape       30 Suds │
│                      │  Stim Canteen      35 Suds │
│                      │  Soap Bomb         50 Suds │
│                      │  (stock varies by act)     │
└──────────────────────────────────────────────────-┘
```

Stock rotates by act — not every item is available every wave. This keeps the shop feeling fresh without adding items to the permanent pool all at once.

---

## World Travel — Jon Becomes a Remote

When Jon moves between levels (the inter-level transition screen), he **transforms into a TV remote control** and navigates the level select map in that form. Think of it as diegetic in-universe logic: the Jon Hose Cinematic Universe runs on cable infrastructure, and the remote is how you change the channel to a new world.

### Transition Sequence Idea
1. Level-clear screen fades. Jon does a brief "warping out" animation — his sprite flickers and compresses into a chunky TV remote shape (pixel art, same color palette as Jon's gear).
2. The remote slides across a schematic **"channel map"** — a horizontal strip of level thumbnails styled like a TV guide grid. The remote's cursor blinks on the next level.
3. Remote zips into the next thumbnail. Cut to Jon re-materializing on the new street, remote shape expanding back into his sprite.

### Mechanical Hook (optional)
During the remote travel screen, the player could steer the remote left/right across the channel map to **pick which level to tackle next** (if a non-linear level select is added to the roadmap). Pressing a wrong channel could land on a **bonus/secret level** — a scrapped broadcast, a shopping channel fight, a test pattern dungeon.

### Remote as a Buff Carrier
Any **passive buffs or consumables** active when Jon enters a transition carry over as "saved channels" — shown as small indicator lights on the remote sprite. Purely cosmetic, but rewards players who notice it.

### Visual Design Notes
- Remote sprite: rectangular, 3 buttons visible (matches Jon's 3-action kit — spray, dash, move), antenna on top. Fits the pixel resolution cleanly at ~12×24px.
- Could flicker between channels briefly to convey "surfing" — a short static/noise particle burst before landing on the destination.
- The channel map background: scanlines, a vignette, the level names styled as TV show titles ("ACT 1: STREET BEAT", "ACT 2: PIPE DREAM").

---

## The Cauliflower Whisperer (NPC)

A second roaming NPC alongside Old Spigot — a deeply strange street sage who communes with cauliflowers and translates their wisdom into combat buffs. He appears less predictably than Old Spigot: sometimes at the back of a wave-clear zone, sometimes just... standing in the street mid-fight, unbothered.

### Identity
- **Name:** The Cauliflower Whisperer (no other name given — Old Spigot just calls him "that vegetable man")
- **Appearance:** Elderly, trench coat covered in cauliflower pin badges, always holding a single raw cauliflower head like a talisman. Speaks in reverent hushed tones about what the cauliflower told him.
- **Interaction:** Walk up, press `E`. He doesn't sell anything — he **grants one free buff per encounter**, chosen from a small pool. You can't pick; the cauliflower decides.

### Buff Pool (randomised per visit)

| Buff | Effect | Duration |
|---|---|---|
| **The Floret's Blessing** | +15% spray damage | Current wave |
| **Dense Core** | +25 max HP, healed immediately | Permanent (this run) |
| **Pressurised Prophecy** | Tank regen doubled | 2 waves |
| **The Curd Speaks** | Next hit you take deals 0 damage (one absorb) | Until triggered |
| **Brassica Sprint** | +22 move speed | 3 waves |
| **Pale Wisdom** | Dash cooldown reduced by 0.3s | Permanent (this run) |
| **The Whisperer's Curse** *(rare)* | -10 max HP, but all damage dealt +30% | Permanent (this run) — he looks apologetic |

### Dialogue Flavour (a few lines)

> *"She told me… you will face water that fears itself. I don't know what it means. She rarely explains."*

> *"The inner florets spoke of pressure. I have passed their message to your hose."*

> *"Do not thank me. Thank the cauliflower. I am merely the vessel."*

> *"She was quiet today. But she looked at you. That's enough."*

### Design Notes
- He never repeats the same buff twice per run — cross off each one as it's given.
- He disappears immediately after granting the buff (walks off-screen, no fanfare).
- If the player tries to find him again mid-fight, he's gone. He appears when the cauliflower wills it.
- **No Suds exchange** — he's purely a luck/encounter reward, not a shop. Keeps him feeling special and distinct from Old Spigot.
- Could tie into a hidden achievement: receive all 7 buffs across multiple runs = "Understood the Cauliflower."

---

## Open Questions

1. Should TP carry over between levels (persistent run progression) or reset per level (roguelite feel per run)?
2. Should there be a **respec** option (costs Suds, resets TP allocations)? Useful for experimentation but complicates balance.
3. Could a future "mastery" tier unlock a single **ultra talent** per run after all combos are taken? (e.g. "Hose God Mode" — purely cosmetic/bragging rights.)
4. XP visual feedback — floating "+XP" numbers on kills, or keep it quiet with just a bar fill?
