/* =====================================================================
   upgrades.js — the repeatable Overcharge sink + the player stat fold.

   NODES is empty (the three signature purchases live in JH.RELICS now,
   vendor-stock relics). REPEATABLES (Overcharge) unlocks by act via
   overchargeUnlocked(), bought any number of times at rising cost.
   computeStats() builds the player's effective stats fresh each time from
   base JH.PLAYER + owned relics' apply() + repeatable buys + XP-level
   gains + Church pillar ranks + active benedictions.
   ===================================================================== */
(function () {
  "use strict";
  const JH = (window.JH = window.JH || {});

  // tier = vertical position in its branch column (1 = root).
  // The three signature entries retired from here into JH.RELICS (ids
  // hydro_dash/fire_marshal/hydro_lance) — they're now vendor-stock relics.
  const NODES = [];

  // Repeatable "Overcharge" node: bought any number of times, cost rises each
  // buy (JH.Balance.repeatableCost, 1.8x factor). The late-game Suds sink
  // that keeps power creeping to match the elite ramp.
  const REPEATABLES = [
    { id: "ov_dmg",   name: "Overcharge",  baseCost: 60, desc: "+4 spray dmg (repeatable).",
      apply: (s) => { s.sprayDamage += 4; } },
  ];

  const BRANCHES = [];

  const Upgrades = {
    nodes: NODES,
    branches: BRANCHES,
    repeatables: REPEATABLES,
    owned: {},
    // Elite act tier of the current wave (JH.Balance.actLevelForWave): -1 in
    // Act 1, 0 after the first boss, 1 after the second, … Game sets it on
    // every waveIndex change; gates tier-3 nodes below.
    currentActLevel: -1,
    repCount: {},
    levelCount: 0,

    reset() { this.owned = {}; this.repCount = {}; this.levelCount = 0; },
    byId(id) { return NODES.find((n) => n.id === id); },
    isOwned(id) { return !!this.owned[id]; },
    cost(id) { return this.byId(id).cost; },

    // A node is available to buy if every prerequisite is owned and it
    // hasn't been bought yet.
    isAvailable(id) {
      const n = this.byId(id);
      if (this.owned[id]) return false;
      // Tier-3 nodes unlock from Act 2 (actLevel >= 0; Act 1 is -1): the
      // build finishes against the hard content, not before it.
      if (n.tier >= 3 && this.currentActLevel < 0) return false;
      return n.req.every((r) => this.owned[r]);
    },
    // Locked = prerequisites not yet met, or act-gated (shown greyed in the shop).
    isLocked(id) { return !this.owned[id] && !this.isAvailable(id); },

    // `price` (optional) overrides the sticker cost — game.priceOf applies
    // the Punch Card relic discount before calling in.
    canBuy(id, suds, price) { return this.isAvailable(id) && suds >= (price != null ? price : this.cost(id)); },

    // Gates the repeatable OVERCHARGE nodes: unlocked from Act 2 on
    // (currentActLevel >= 0, set by Game after the first boss falls).
    overchargeUnlocked() { return this.currentActLevel >= 0; },

    nodesByBranch(branch) {
      return NODES.filter((n) => n.branch === branch).sort((a, b) => a.tier - b.tier);
    },

    // Fresh effective-stats from the base block + every owned node + repeatables.
    computeStats(owned) {
      const s = JSON.parse(JSON.stringify(JH.PLAYER));
      NODES.forEach((n) => { if (owned && owned[n.id]) n.apply(s); });
      // Owned relics with stat hooks (game.relics lives on the instance;
      // JH.Game is published by main.js). Flag-relics have no apply.
      const relicsOwned = (JH.Game && JH.Game.relics) || {};
      (JH.RELICS || []).forEach((r) => { if (r.apply && relicsOwned[r.id]) r.apply(s); });
      const rc = this.repCount || {};
      REPEATABLES.forEach((n) => {
        const c = rc[n.id] || 0;
        for (let i = 0; i < c; i++) n.apply(s);
      });
      // XP level-ups: fold the gain cycle (see JH.LEVELS).
      if (JH.LEVELS && this.levelCount > 0) {
        const g = JH.Balance.levelGains(this.levelCount, JH.LEVELS.cycle);
        for (const k in g) s[k] += g[k];
      }
      // Permanent Church pillar ranks (survive Upgrades.reset()). Folds each
      // unlocked pillar's ranked effect into the stats.
      if (JH.Pillars && JH.Church && JH.Church.state && JH.PILLARS) {
        JH.Pillars.apply(s, JH.Church.state, JH.PILLARS.defs);
      }
      // In-run benedictions (JH.Benedictions.active); dashSpeed lives in JH.PLAYER.
      if (JH.Benedictions) JH.Benedictions.applyStats(s);
      // Hard cap: dodge never exceeds 25% no matter which sources stack.
      s.dodgeChance = Math.min(s.dodgeChance, 0.25);
      return s;
    },

    // Attempt purchase; returns true on success. Carries HP/water headroom
    // when a node raises a capacity. `price` (optional) overrides the cost
    // charged (see canBuy).
    buy(id, player, price) {
      if (!this.canBuy(id, player.suds, price)) return false;
      player.suds -= (price != null ? price : this.cost(id));
      this.owned[id] = true;
      const fresh = this.computeStats(this.owned);
      const hpGain = fresh.maxHp - player.stats.maxHp;
      const waterGain = fresh.maxWater - player.stats.maxWater;
      player.applyStats(fresh);
      if (hpGain > 0) player.hp = Math.min(fresh.maxHp, player.hp + hpGain);
      if (waterGain > 0) player.water = Math.min(fresh.maxWater, player.water + waterGain);
      return true;
    },

    repById(id) { return REPEATABLES.find((n) => n.id === id); },
    repCost(id) { return JH.Balance.repeatableCost(this.repById(id).baseCost, this.repCount[id] || 0, 1.8); },
    // `price` (optional) overrides the sticker cost (see canBuy).
    canBuyRep(id, suds, price) { return !!this.repById(id) && suds >= (price != null ? price : this.repCost(id)); },
    buyRep(id, player, price) {
      if (!this.canBuyRep(id, player.suds, price)) return false;
      player.suds -= (price != null ? price : this.repCost(id));
      this.repCount[id] = (this.repCount[id] || 0) + 1;
      const fresh = this.computeStats(this.owned);
      const hpGain = fresh.maxHp - player.stats.maxHp;
      const waterGain = fresh.maxWater - player.stats.maxWater;
      player.applyStats(fresh);
      if (hpGain > 0) player.hp = Math.min(fresh.maxHp, player.hp + hpGain);
      if (waterGain > 0) player.water = Math.min(fresh.maxWater, player.water + waterGain);
      return true;
    },
  };

  Upgrades.reset();
  JH.Upgrades = Upgrades;
})();
