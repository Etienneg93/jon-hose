/* =====================================================================
   pillars.js — JH.Pillars: the four element pillars in the Church nave.
   Pure logic + stat application; dual-export like balance.js.
   state shape (on JH.Church.state):
     { essence:int, elements:{...}, pillars:{water,earth,fire,air:int} }
   Rank r costs r+1 essence (1, 2, 3). Water has no gate; the others
   unlock when their nemesis is redeemed (state.elements[element]).
   ===================================================================== */
(function (root) {
  "use strict";
  function ranks(state) { return (state && state.pillars) || {}; }
  const Pillars = {
    rank(state, element) { return ranks(state)[element] | 0; },
    unlocked(state, def) {
      return !def.gateBoss || !!(state && state.elements && state.elements[def.element]);
    },
    cost(rank) { return (rank | 0) + 1; },
    canBuy(state, def) {
      if (!this.unlocked(state, def)) return false;
      const r = this.rank(state, def.element);
      if (r >= (def.maxRank || 3)) return false;
      return (state.essence || 0) >= this.cost(r);
    },
    buy(state, def) {
      if (!this.canBuy(state, def)) return false;
      if (!state.pillars) state.pillars = {};
      const r = this.rank(state, def.element);
      state.essence -= this.cost(r);
      state.pillars[def.element] = r + 1;
      return true;
    },
    apply(s, state, defs) {
      if (!s || !state || !defs) return s;
      for (const def of defs) {
        if (!this.unlocked(state, def)) continue;
        const r = this.rank(state, def.element);
        if (r > 0) def.apply(s, r);
      }
      return s;
    },
    totalRanks(state) {
      const p = ranks(state);
      let n = 0;
      for (const k in p) n += p[k] | 0;
      return n;
    },
  };
  root.JH = root.JH || {};
  root.JH.Pillars = Pillars;
  if (typeof module !== "undefined" && module.exports) module.exports = Pillars;
})(typeof window !== "undefined" ? window : globalThis);
