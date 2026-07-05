/* =====================================================================
   benedictions.js — JH.Benedictions: in-run boon defs, active map, stat
   folding, and the post-boss/set-piece offer algorithm.
   Dual-export like pillars.js/balance.js.

   DEFS entries:
     boon:       {id, element, name, desc, descII, kind:"boon"}
     duo:        {id, name, desc, needs:[el,el], kind:"duo"}
     legendary:  {id, name, desc, element, kind:"legendary"}

   active: id -> rank (1 or 2). Death wipes it (reset()); suds, signatures,
   relics, levels and pillars are untouched by that wipe (handled elsewhere).

   pickOffers(state, rng) is pure and injectable-rng: state = { active,
   pillarRanks, usedOnce, censer }. rng() must return a float in [0,1).
   Returned offers are [{id, deepen}], deepen=true for a rank-1 owned boon
   re-entering as its rank-II upgrade. Rank-2 boons never re-enter.
   usedOnce is caller-managed: mark a duo/legendary id there once it has
   been TAKEN (not merely offered), so it never re-appears that run.
   ===================================================================== */
(function (root) {
  "use strict";

  const DEFS = [
    // Water — control & sustain
    { id: "split_stream", element: "water", kind: "boon", name: "Split Stream",
      desc: "50% of spray damage arcs to one nearby enemy with a visible chain-stream",
      descII: "two extra targets" },
    { id: "baptismal_wake", element: "water", kind: "boon", name: "Baptismal Wake",
      desc: "Dash leaves a puddle (enemy-slowing, 0.7x, 3s)",
      descII: "larger + enemies inside take +10% dmg" },
    { id: "overflow", element: "water", kind: "boon", name: "Overflow",
      desc: "Tank ≥80%: +20% spray dmg",
      descII: "+30%, threshold 70%" },
    { id: "baptize", element: "water", kind: "boon", name: "Baptize",
      desc: "Enemies at wetness >0.3 take +15% spray dmg",
      descII: "+25%" },
    { id: "absolution", element: "water", kind: "boon", name: "Absolution",
      desc: "Wave clear heals 25",
      descII: "40 + clears burn" },

    // Fire — damage & risk
    { id: "scalding_faith", element: "fire", kind: "boon", name: "Scalding Faith",
      desc: "Full-pressure spray applies Scald: 4/s for 2s enemy DoT",
      descII: "6/s, 3s" },
    { id: "backdraft", element: "fire", kind: "boon", name: "Backdraft",
      desc: "Dashing through enemies Scalds them",
      descII: "+8 burst pop" },
    { id: "trial_by_fire", element: "fire", kind: "boon", name: "Trial by Fire",
      desc: "+20% spray dmg to enemies that are burning, Scalded, or standing in a fire patch",
      descII: "+30%" },
    { id: "ash_walk", element: "fire", kind: "boon", name: "Ash Walk",
      desc: "First burn stack per patch ignored; walking a patch douses it with a steam pop (6 dmg nearby), 10s cooldown",
      descII: "6s cd + bigger pop" },

    // Earth — force & interrupts
    { id: "aftershock", element: "earth", kind: "boon", name: "Aftershock",
      desc: "Enemies knocked into arena walls/debris take 15 slam dmg",
      descII: "25 + a small shockwave at the impact" },
    { id: "sure_grip", element: "earth", kind: "boon", name: "Sure Grip",
      desc: "Spray no longer slows your movement",
      descII: "+10% knockback" },
    { id: "bedrock", element: "earth", kind: "boon", name: "Bedrock Vigor",
      desc: "+40 max HP; taking a hit grants +20% knockback for 3s",
      descII: "+60 HP" },
    { id: "landslide", element: "earth", kind: "boon", name: "Landslide",
      desc: "Knocked-back enemies damage enemies they pass through (8)",
      descII: "14 + staggers them" },

    // Air — tempo
    { id: "gale_stride", element: "air", kind: "boon", name: "Gale Stride",
      desc: "Dash travels 40% farther in the same time",
      descII: "60%" },
    { id: "slipstream", element: "air", kind: "boon", name: "Slipstream Draft",
      desc: "0.5s of free-water spray after each dash",
      descII: "0.8s" },
    { id: "tailwind", element: "air", kind: "boon", name: "Tailwind Tithe",
      desc: "+2% move speed per GUSH combo, cap +20%",
      descII: "cap +30%" },
    { id: "eye_of_storm", element: "air", kind: "boon", name: "Eye of the Storm",
      desc: "1s guaranteed dodge at wave start & after sigil pickup",
      descII: "1.5s + 15% move during" },

    // Duos — dual-glyph, needs >=1 owned boon from each listed element
    { id: "steam_sermon", kind: "duo", needs: ["water", "fire"], name: "Steam Sermon",
      desc: "Spraying a FirePatch vents a damaging steam cloud over it (12/s, 1.5s)" },
    { id: "mudslide", kind: "duo", needs: ["water", "earth"], name: "Mudslide",
      desc: "Enemies knocked across a puddle are dragged its full length and slowed" },
    { id: "firestorm", kind: "duo", needs: ["fire", "air"], name: "Firestorm",
      desc: "Dash leaves a short friendly flame trail (patches flagged harmless to Jon)" },

    // Legendaries — one per element, prereq >=2 owned boons of that element
    { id: "pressure_sermon", kind: "legendary", element: "water", name: "Pressure Sermon",
      desc: "Releasing spray after ≥0.8s of continuous full pressure emits a knockback cone (10 water)" },
    { id: "bushfire", kind: "legendary", element: "fire", name: "Bushfire",
      desc: "Scald spreads to enemies within 40px of a Scalded one" },
    { id: "standing_stone", kind: "legendary", element: "earth", name: "Standing Stone",
      desc: "After 0.5s of not moving: no knockback taken, +25% damage, wider spray until you move" },
    { id: "whirlwind_walk", kind: "legendary", element: "air", name: "Whirlwind Walk",
      desc: "Dashing destroys enemy projectiles it touches and gusts non-boss enemies aside (15 dmg + knock)" },
  ];

  const ELEMENTS = ["water", "fire", "earth", "air"];

  // Fisher-Yates-ish weighted pick without replacement: consumes rng() calls
  // one at a time so tests with fixed/seeded rng stay deterministic.
  function weightedPickIndex(weights, rng) {
    let total = 0;
    for (const w of weights) total += w;
    if (total <= 0) return -1;
    let r = rng() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  const Benedictions = {
    DEFS,

    active: {},

    byId(id) { return DEFS.find((d) => d.id === id); },

    rank(id) { return this.active[id] | 0; },

    reset() { this.active = {}; },

    // Rank 1 on first take, rank 2 (capped) on deepen. Returns the new rank.
    take(id) {
      this.active[id] = Math.min(2, (this.active[id] | 0) + 1);
      return this.active[id];
    },

    // Count of owned (rank >=1) boons of a given element.
    ownedOf(element) {
      return Object.keys(this.active).filter((id) => {
        const d = this.byId(id);
        return d && d.kind === "boon" && d.element === element;
      }).length;
    },

    // Stat-type boons fold into computeStats; rule/behavior boons (Scald,
    // Baptize, Overflow, duos, legendaries, etc.) hook at runtime instead.
    applyStats(s) {
      const r = (id) => this.active[id] | 0;
      if (r("bedrock")) s.maxHp += r("bedrock") >= 2 ? 60 : 40;
      if (r("gale_stride")) s.dashSpeed *= r("gale_stride") >= 2 ? 1.6 : 1.4;
      if (r("sure_grip")) {
        s.noSpraySlow = true;
        if (r("sure_grip") >= 2) s.knockback *= 1.1;
      }
      return s;
    },

    // Pure, injectable-rng offer roll. state = {active, pillarRanks, usedOnce, censer}.
    pickOffers(state, rng) {
      const active = (state && state.active) || {};
      const pillarRanks = (state && state.pillarRanks) || {};
      const usedOnce = (state && state.usedOnce) || {};
      const slots = state && state.censer ? 4 : 3;

      const ownedOf = (element) =>
        Object.keys(active).filter((id) => {
          const d = this.byId(id);
          return d && d.kind === "boon" && d.element === element;
        }).length;

      // Per-element candidate pools: unowned boons (fresh) + rank-1 owned (deepen).
      // Rank-2 boons are maxed and excluded entirely.
      const candidatesByElement = {};
      for (const el of ELEMENTS) {
        candidatesByElement[el] = DEFS.filter((d) => d.kind === "boon" && d.element === el).map((d) => {
          const r = active[d.id] | 0;
          if (r >= 2) return null;
          return { id: d.id, deepen: r === 1 };
        }).filter(Boolean);
      }

      const eligibleElements = ELEMENTS.filter((el) => candidatesByElement[el].length > 0);

      // Draw up to `slots` elements without replacement, weighted, preferring
      // distinct elements; only repeat an element once every element has
      // been used at least once (i.e. eligible < slots).
      const drawnElements = []; // element name per slot, for the distinct-first preference
      const offers = [];
      const remaining = {};
      for (const el of eligibleElements) remaining[el] = candidatesByElement[el].slice();

      for (let slot = 0; slot < slots; slot++) {
        const pool = eligibleElements.filter((el) => remaining[el] && remaining[el].length > 0);
        if (pool.length === 0) break;
        // Prefer elements not yet drawn this offer, unless we've exhausted
        // all distinct options and still need more slots.
        const notYetDrawn = pool.filter((el) => !drawnElements.includes(el));
        const choicePool = notYetDrawn.length > 0 ? notYetDrawn : pool;
        const weights = choicePool.map(
          (el) => 1 + 0.5 * (pillarRanks[el] | 0) + 0.25 * ownedOf(el)
        );
        const idx = weightedPickIndex(weights, rng);
        if (idx < 0) break;
        const el = choicePool[idx];
        drawnElements.push(el);
        const cand = remaining[el];
        const cIdx = Math.floor(rng() * cand.length);
        const picked = cand.splice(Math.min(cIdx, cand.length - 1), 1)[0];
        offers.push(picked);
      }

      if (offers.length === 0) return offers;

      // Duo check: replaces the last slot at 25% when both needed elements
      // each have >=1 owned boon and the duo hasn't been used yet. First
      // qualifying duo (in DEFS order) wins.
      let replaced = false;
      const duos = DEFS.filter((d) => d.kind === "duo");
      for (const duo of duos) {
        if (usedOnce[duo.id]) continue;
        const qualifies = duo.needs.every((el) => ownedOf(el) >= 1);
        if (!qualifies) continue;
        if (rng() < 0.25) {
          offers[offers.length - 1] = { id: duo.id, deepen: false };
          replaced = true;
        }
        break;
      }

      // Legendary check: only rolled if no duo replaced the slot this offer.
      if (!replaced) {
        const legendaries = DEFS.filter((d) => d.kind === "legendary");
        for (const leg of legendaries) {
          if (usedOnce[leg.id]) continue;
          if (ownedOf(leg.element) < 2) continue;
          if (rng() < 0.15) {
            offers[offers.length - 1] = { id: leg.id, deepen: false };
          }
          break;
        }
      }

      return offers;
    },
  };

  root.JH = root.JH || {};
  root.JH.Benedictions = Benedictions;
  if (typeof module !== "undefined" && module.exports) module.exports = Benedictions;
})(typeof window !== "undefined" ? window : globalThis);
