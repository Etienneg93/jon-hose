/* =====================================================================
   benedictions.js — JH.Benedictions: in-run boon defs, active map, stat
   folding, and the post-boss/set-piece offer algorithm.
   Dual-export like pillars.js/balance.js.

   DEFS entries:
     boon:       {id, element, verb, name, desc, descII, kind:"boon"}
                 verb: "stream" | "dash" | "body" — categorizes which
                 player action the boon rides (used by pillar gating).
                 Duos/legendaries carry no verb.
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
    // Copy style (all kinds): trigger first, effect second, every magnitude
    // in {g:}, stats as {i:} icons, durations "for {g:Xs}", cooldowns and
    // requirements as trailing "(...)" tags. descII states only the delta,
    // in the same slot order as the base sentence.
    { id: "split_stream", verb: "stream", element: "water", kind: "boon", name: "Split Stream",
      desc: "Your spray arcs {g:35%} of its {i:dmg} to {g:1} nearby enemy",
      descII: "arcs {g:50%}, to {g:2} enemies" },
    { id: "baptismal_wake", verb: "dash", element: "water", kind: "boon", name: "Baptismal Wake",
      desc: "Your dash lays a puddle that {g:pulls} enemies in and slows them {g:30%} for {g:3s}",
      descII: "stronger {g:pull}, {g:+40%} puddle size" },
    { id: "overflow", verb: "stream", element: "water", kind: "boon", name: "Overflow",
      desc: "While your tank is above {g:80%}: {g:+20%} {i:dmg}. Below {g:20%}: {g:2×} {i:water} regen",
      descII: "above {g:70%}: {g:+30%} {i:dmg}. Below {g:30%}: {g:3×} regen" },
    { id: "baptize", verb: "stream", element: "water", kind: "boon", name: "Baptize",
      desc: "The more Soaked your target, the harder your spray hits: up to {g:+15%} {i:dmg} at full drench",
      descII: "up to {g:+25%} {i:dmg}" },
    { id: "absolution", verb: "body", element: "water", kind: "boon", name: "Absolution",
      desc: "Clearing a wave heals {g:25} {i:hp}",
      descII: "heals {g:40} {i:hp} and puts out burning" },

    // Fire — damage & risk
    { id: "scalding_faith", verb: "stream", element: "fire", kind: "boon", name: "Scalding Faith",
      desc: "Your full-pressure spray Scalds: {g:10%} of {i:dmg} per second for {g:2s}",
      descII: "{g:18%} per second for {g:3s}" },
    { id: "backdraft", verb: "dash", element: "fire", kind: "boon", name: "Backdraft",
      desc: "Your dash Scalds every enemy you pass through",
      descII: "also pops them for {g:20%} {i:dmg}" },
    { id: "trial_by_fire", verb: "stream", element: "fire", kind: "boon", name: "Trial by Fire",
      desc: "Your spray deals {g:+20%} {i:dmg} to enemies that are burning, Scalded, or standing in a fire patch (requires a Scald source)",
      descII: "{g:+30%} {i:dmg}" },
    { id: "ash_walk", verb: "body", element: "fire", kind: "boon", name: "Ash Walk",
      desc: "The first tick of any ground hazard is ignored; stepping in clears the patch with a {g:30%} {i:dmg} steam pop ({g:10s} cooldown)",
      descII: "{g:50%} {i:dmg} pop ({g:6s} cooldown)" },

    // Earth — force & interrupts
    { id: "aftershock", verb: "stream", element: "earth", kind: "boon", name: "Aftershock",
      desc: "Spraying the same target for {g:2s} straight erupts a shockwave at their feet: {g:40%} {i:dmg} to them and enemies nearby",
      descII: "every {g:1.5s}, {g:60%} {i:dmg}, and it staggers" },
    { id: "sure_grip", verb: "body", element: "earth", kind: "boon", name: "Sure Grip",
      desc: "Spraying slows your movement {g:half} as much",
      descII: "no spray slow at all, and {g:+10%} {i:knockback}" },
    { id: "bedrock", verb: "body", element: "earth", kind: "boon", name: "Bedrock Vigor",
      desc: "{g:+25} max {i:hp}; taking a hit grants {g:+20%} {i:knockback} for {g:3s}",
      descII: "{g:+45} max {i:hp}" },
    { id: "landslide", verb: "stream", element: "earth", kind: "boon", name: "Gravel Spray",
      desc: "Every {g:3s} of continuous spraying, a rock rides the stream: {g:60%} {i:dmg} and heavy {i:knockback} to the first enemy hit",
      descII: "every {g:2s}" },

    // Air — tempo
    { id: "gale_stride", verb: "dash", element: "air", kind: "boon", name: "Gale Stride",
      desc: "Your dash travels {g:+25%} farther",
      descII: "{g:+40%} farther" },
    { id: "slipstream", verb: "dash", element: "air", kind: "boon", name: "Slipstream Draft",
      desc: "After each dash, spraying costs no {i:water} for {g:0.5s}",
      descII: "for {g:0.8s}" },
    { id: "tailwind", verb: "body", element: "air", kind: "boon", name: "Tailwind Tithe",
      desc: "The wind carries your water: {g:+20%} {i:range} and {g:+20%} {i:knockback}",
      descII: "{g:+30%} {i:range} and {g:+30%} {i:knockback}" },
    { id: "eye_of_storm", verb: "body", element: "air", kind: "boon", name: "Eye of the Storm",
      desc: "Below {g:30%} {i:hp}, the next hit is blocked by a {g:1.5s} immunity shield ({g:30s} cooldown)",
      descII: "below {g:40%} {i:hp}, {g:2s} shield" },

    // Duos — dual-glyph, needs >=1 owned boon from each listed element
    { id: "steam_sermon", kind: "duo", needs: ["water", "fire"], name: "Steam Sermon",
      desc: "Scalded enemies vent steam: {g:15%} {i:dmg} per second to OTHER enemies near them" },
    { id: "mudslide", kind: "duo", needs: ["water", "earth"], name: "Mud Spray",
      desc: "Your stream runs muddy: sprayed enemies slow, stacking up to {g:50%}" },
    { id: "firestorm", kind: "duo", needs: ["fire", "air"], name: "Steam Devil",
      desc: "Your dash spins off a traveling steam vortex that Scalds and shoves whatever it touches" },

    // Legendaries — one per element, prereq >=2 owned boons of that element
    { id: "pressure_sermon", kind: "legendary", element: "water", name: "Pressure Sermon",
      desc: "Releasing {g:0.8s}+ of full-pressure spray fires a wavefront: {g:40%} {i:dmg} and heavy {i:knockback}" },
    { id: "bushfire", kind: "legendary", element: "fire", name: "Boilover",
      desc: "Scald burns {g:+50%} hotter and spreads to enemies near a Scalded one while it lasts" },
    { id: "standing_stone", kind: "legendary", element: "earth", name: "Standing Stone",
      desc: "After standing still for {g:0.5s}: immune to {i:knockback}, {g:+25%} {i:dmg}, wider spray — until you move" },
    { id: "whirlwind_walk", kind: "legendary", element: "air", name: "Whirlwind Walk",
      desc: "Your dash destroys enemy projectiles ({g:10%} {i:dmg} droplet pop) and gusts enemies for {g:25%} {i:dmg}" },
  ];

  const ELEMENTS = ["water", "fire", "earth", "air"];

  // trial_by_fire only offers/ranks up if a Scald source (something that
  // applies the Scald DoT) is already owned — Steam Devil keeps id "firestorm".
  const SCALD_SOURCES = ["scalding_faith", "backdraft", "firestorm"];

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
    SCALD_SOURCES,

    active: {},

    // Boons lost to death, reclaimable at the Church Reliquary (id → rank).
    washed: {},

    byId(id) { return DEFS.find((d) => d.id === id); },

    rank(id) { return this.active[id] | 0; },

    // Rank-aware effect text for an owned/inspected boon (the tooltip body).
    // rank 0/1 -> base desc; rank 2 -> base desc + the descII upgrade line so
    // a maxed boon reads what rank II actually grants, not just a "II" badge.
    // Duos/legendaries have no descII, so they always return their single desc.
    effectText(id, rank) {
      const d = this.byId(id);
      if (!d) return "";
      let t = d.desc || "";
      if ((rank | 0) >= 2 && d.descII) t += "  ▲ II: " + d.descII;
      return t;
    },

    // Full wipe (new run): clears both live boons, the reliquary, and the
    // redeem-all cost escalation.
    reset() { this.active = {}; this.washed = {}; this.redeemCount = 0; },

    // Death: live boons move to the reliquary instead of vanishing. Dying
    // again with unreclaimed boons keeps the higher rank of each.
    wash() {
      for (const id in this.active)
        this.washed[id] = Math.max(this.washed[id] | 0, this.active[id]);
      this.active = {};
    },

    washedCount() { return Object.keys(this.washed).length; },

    // Reliquary redemptions this run; each redeem-all costs 1 + prior count.
    redeemCount: 0,

    redeemAllCost() { return 1 + this.redeemCount; },

    // Restore EVERY washed boon at its washed rank. Charges nothing itself —
    // the church station checks/charges essence first. Returns boons restored.
    redeemAll() {
      const ids = Object.keys(this.washed);
      if (!ids.length) return 0;
      for (const id of ids) this.active[id] = this.washed[id];
      this.washed = {};
      this.redeemCount++;
      return ids.length;
    },

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
      // Looked up live (not via the closed-over `root`) so it resolves
      // correctly regardless of module require order in tests.
      const T = (typeof window !== "undefined" ? window : globalThis).JH.BENE_TUNE;
      if (r("bedrock")) s.maxHp += r("bedrock") >= 2 ? T.bedrockHpII : T.bedrockHp;
      if (r("gale_stride")) s.dashSpeed *= 1 + (r("gale_stride") >= 2 ? T.galeStrideII : T.galeStride);
      if (r("tailwind")) {
        s.sprayRange *= 1 + (r("tailwind") >= 2 ? T.tailwindRangeII : T.tailwindRange);
        s.knockback *= 1 + (r("tailwind") >= 2 ? T.tailwindKnockII : T.tailwindKnock);
      }
      if (r("sure_grip") >= 2) s.knockback *= 1.1;   // rank 1's spray-slow removal is computed live off beneRank (entities.js)
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
          if (d.id === "trial_by_fire" && !SCALD_SOURCES.some((id) => active[id])) return null;
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
      // Single 15% roll over ALL eligible legendaries, then a uniform pick —
      // DEFS order must not starve later elements when several are eligible.
      if (!replaced) {
        const eligible = DEFS.filter(
          (d) => d.kind === "legendary" && !usedOnce[d.id] && ownedOf(d.element) >= 2
        );
        if (eligible.length > 0 && rng() < 0.15) {
          const li = Math.min(Math.floor(rng() * eligible.length), eligible.length - 1);
          offers[offers.length - 1] = { id: eligible[li].id, deepen: false };
        }
      }

      return offers;
    },
  };

  root.JH = root.JH || {};
  root.JH.Benedictions = Benedictions;
  if (typeof module !== "undefined" && module.exports) module.exports = Benedictions;
})(typeof window !== "undefined" ? window : globalThis);
