/* =====================================================================
   church.js — JH.Church: the Church of the Hose.
   Owns permanent meta-progression (Holy Essence, blessings, unlocked
   elements) + its localStorage persistence, AND the death-interlude scene
   (scene state machine + render are added in later Phase-0 tasks).
   Dual-export (node:test) like balance.js; no DOM access at module load.
   ===================================================================== */
(function (root) {
  "use strict";
  const KEY = "jonhose.church.v1";
  const ELEMENTS = ["earth", "fire", "air", "water"];

  function defaults() {
    return {
      essence: 0,
      blessings: {},                                   // id -> count
      elements: { earth: false, fire: false, air: false, water: false },
      churchVisited: false,
      ceremonyDone: {},                                // element -> bool
    };
  }

  function num(v) { return (typeof v === "number" && isFinite(v)) ? v : 0; }

  function sanitize(raw) {
    const d = defaults();
    if (!raw || typeof raw !== "object") return d;
    d.essence = num(raw.essence);
    if (raw.blessings && typeof raw.blessings === "object") {
      for (const k in raw.blessings) d.blessings[k] = num(raw.blessings[k]);
    }
    if (raw.elements && typeof raw.elements === "object") {
      ELEMENTS.forEach((e) => { d.elements[e] = !!raw.elements[e]; });
    }
    d.churchVisited = !!raw.churchVisited;
    if (raw.ceremonyDone && typeof raw.ceremonyDone === "object") {
      ELEMENTS.forEach((e) => { if (raw.ceremonyDone[e]) d.ceremonyDone[e] = true; });
    }
    return d;
  }

  const Church = {
    KEY,
    state: defaults(),
    defaults,
    sanitize,

    serialize() { return JSON.stringify(this.state); },

    load() {
      try { this.state = sanitize(JSON.parse(root.localStorage.getItem(KEY))); }
      catch (e) { this.state = defaults(); }
    },
    save() {
      try { root.localStorage.setItem(KEY, this.serialize()); } catch (e) { /* ignore */ }
    },

    addEssence(n) { this.state.essence += n; this.save(); },

    // Boss defeated/redeemed: +essence, and light its element shrine if mapped.
    markBossDefeated(type) {
      const JH = root.JH;
      this.state.essence += (JH && JH.CHURCH ? JH.CHURCH.essencePerBoss : 1);
      const sh = JH && JH.CHURCH && JH.CHURCH.shrines.find((s) => s.boss === type);
      if (sh) this.state.elements[sh.element] = true;
      this.save();
    },

    blessingCount(id) { return this.state.blessings[id] || 0; },
    blessingCost(id) { return root.JH.Balance.blessingCost(this.blessingCount(id)); },
    canBuyBlessing(id) { return this.state.essence >= this.blessingCost(id); },

    // Spend essence, bump the count, recompute + carry the player's stats.
    buyBlessing(id, player) {
      if (!this.canBuyBlessing(id)) return false;
      this.state.essence -= this.blessingCost(id);
      this.state.blessings[id] = this.blessingCount(id) + 1;
      this.save();
      const fresh = root.JH.Upgrades.computeStats(root.JH.Upgrades.owned);
      const hpGain = fresh.maxHp - player.stats.maxHp;
      const waterGain = fresh.maxWater - player.stats.maxWater;
      player.applyStats(fresh);
      if (hpGain > 0) player.hp = Math.min(fresh.maxHp, player.hp + hpGain);
      if (waterGain > 0) player.water = Math.min(fresh.maxWater, player.water + waterGain);
      return true;
    },
  };

  root.JH = root.JH || {};
  root.JH.Church = Church;
  if (typeof module !== "undefined" && module.exports) module.exports = Church;
})(typeof window !== "undefined" ? window : globalThis);
