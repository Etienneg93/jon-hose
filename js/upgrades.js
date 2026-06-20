/* =====================================================================
   upgrades.js — a branching SKILL TREE (replaces the old rank system).

   Each node is bought ONCE, costs Suds, and may require earlier nodes in
   its branch. `owned` tracks purchased node ids; computeStats() folds the
   apply() of every owned node onto the base JH.PLAYER block. Some nodes
   set flags (beam / waterReturn / dashPuddle) that
   the player logic reads directly.

   Branches:
     PRESSURE  — damage + beam concentration (garden spray → cutting lance)
     REACH     — stream length + knockback
     TANK      — water capacity, regen, and water-on-hit
     MOBILITY  — speed + dash tech
     VITALITY  — survivability
   ===================================================================== */
(function () {
  "use strict";
  const JH = (window.JH = window.JH || {});

  // tier = vertical position in its branch column (1 = root).
  const NODES = [
    // ---- PRESSURE -----------------------------------------------------
    { id: "pw1", branch: "PRESSURE", tier: 1, req: [], cost: 40,
      name: "Thumb on the Nozzle", desc: "+8 dmg. Stream tightens into a jet.",
      apply: (s) => { s.sprayDamage += 8; s.beam = Math.max(s.beam, 1); } },
    { id: "pw2", branch: "PRESSURE", tier: 2, req: ["pw1"], cost: 80,
      name: "Pressure Washer", desc: "+13 dmg, narrower, harder-hitting beam.",
      apply: (s) => { s.sprayDamage += 13; s.beam = Math.max(s.beam, 2); s.sprayWidth -= 2; } },
    { id: "pw3", branch: "PRESSURE", tier: 3, req: ["pw2"], cost: 140,
      name: "Hydro Lance", desc: "+18 dmg. A cutting beam that punches through the whole line.",
      apply: (s) => { s.sprayDamage += 18; s.beam = 3; s.knockback += 20; } },

    // ---- REACH --------------------------------------------------------
    { id: "rc1", branch: "REACH", tier: 1, req: [], cost: 45,
      name: "Extension Hose", desc: "+26 stream range.",
      apply: (s) => { s.sprayRange += 26; } },
    { id: "rc2", branch: "REACH", tier: 2, req: ["rc1"], cost: 85,
      name: "Fire-Marshal Spec", desc: "+30 range, +30 knockback. Blow 'em back.",
      apply: (s) => { s.sprayRange += 30; s.knockback += 30; } },
    { id: "rc3", branch: "REACH", tier: 3, req: ["rc2"], cost: 140,
      name: "Split Stream", desc: "Hits arc to a nearby enemy for 30% damage.",
      apply: (s) => { s.splitStream = true; } },

    // ---- TANK ---------------------------------------------------------
    { id: "tk1", branch: "TANK", tier: 1, req: [], cost: 25,
      name: "Bladder Pack", desc: "+40 max water.",
      apply: (s) => { s.maxWater += 40; } },
    { id: "tk2", branch: "TANK", tier: 2, req: ["tk1"], cost: 55,
      name: "Quick Prime", desc: "+10 regen/sec, faster recovery after spraying.",
      apply: (s) => { s.waterRegen += 10; s.regenDelay = Math.max(0.15, s.regenDelay - 0.3); } },
    { id: "tk3", branch: "TANK", tier: 3, req: ["tk2"], cost: 95,
      name: "Closed Loop", desc: "-10 water drain/sec while hosing a target.",
      apply: (s) => { s.waterReturn += 10; } },

    // ---- MOBILITY -----------------------------------------------------
    { id: "mb1", branch: "MOBILITY", tier: 1, req: [], cost: 40,
      name: "Gripper Soles", desc: "+18 move speed.",
      apply: (s) => { s.moveSpeed += 18; } },
    { id: "mb2", branch: "MOBILITY", tier: 2, req: ["mb1"], cost: 85,
      name: "Hydro-Dash", desc: "-0.2s dash cooldown. Dash boosts speed +28 for 3s.",
      apply: (s) => { s.dashCd = Math.max(0.2, s.dashCd - 0.2); s.dashPuddle = true; s.dashBoost = 28; s.dashBoostDur = 3; } },
    { id: "mb3", branch: "MOBILITY", tier: 3, req: ["mb2"], cost: 110,
      name: "Kinetic Tap", desc: "+10 water/sec regen while moving.",
      apply: (s) => { s.moveRegen += 10; } },

    // ---- VITALITY -----------------------------------------------------
    { id: "vt1", branch: "VITALITY", tier: 1, req: [], cost: 25,
      name: "Wetsuit", desc: "+30 max HP.",
      apply: (s) => { s.maxHp += 30; } },
    { id: "vt2", branch: "VITALITY", tier: 2, req: ["vt1"], cost: 60,
      name: "Second Wind", desc: "+30 max HP. 5% chance to dodge incoming damage.",
      apply: (s) => { s.maxHp += 30; s.dodgeChance = Math.max(s.dodgeChance, 0.05); } },
    { id: "vt3", branch: "VITALITY", tier: 3, req: ["vt2"], cost: 120,
      name: "Vampiric Hose", desc: "Heal 10% of spray damage dealt.",
      apply: (s) => { s.vampiricRate += 0.10; } },
  ];

  const BRANCHES = ["PRESSURE", "REACH", "TANK", "MOBILITY", "VITALITY"];

  const Upgrades = {
    nodes: NODES,
    branches: BRANCHES,
    owned: {},

    reset() { this.owned = {}; },
    byId(id) { return NODES.find((n) => n.id === id); },
    isOwned(id) { return !!this.owned[id]; },
    cost(id) { return this.byId(id).cost; },

    // A node is available to buy if every prerequisite is owned and it
    // hasn't been bought yet.
    isAvailable(id) {
      const n = this.byId(id);
      if (this.owned[id]) return false;
      return n.req.every((r) => this.owned[r]);
    },
    // Locked = prerequisites not yet met (shown greyed in the shop).
    isLocked(id) { return !this.owned[id] && !this.isAvailable(id); },

    canBuy(id, suds) { return this.isAvailable(id) && suds >= this.cost(id); },

    nodesByBranch(branch) {
      return NODES.filter((n) => n.branch === branch).sort((a, b) => a.tier - b.tier);
    },

    // Fresh effective-stats from the base block + every owned node.
    computeStats(owned) {
      const s = JSON.parse(JSON.stringify(JH.PLAYER));
      NODES.forEach((n) => { if (owned && owned[n.id]) n.apply(s); });
      return s;
    },

    // Attempt purchase; returns true on success. Carries HP/water headroom
    // when a node raises a capacity.
    buy(id, player) {
      if (!this.canBuy(id, player.suds)) return false;
      player.suds -= this.cost(id);
      this.owned[id] = true;
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
