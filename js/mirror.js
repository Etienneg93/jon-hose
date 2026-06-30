/* =====================================================================
   mirror.js — JH.Mirror: the Elemental Mirror altar.

   Mirror-of-Night-style permanent meta-upgrades, organized into four
   element branches. Pure logic + stat application; dual-export (node:test)
   like balance.js/church.js. No DOM and no JH globals read at module load.

   churchState shape (owned by JH.Church.state):
     { essence:int, elements:{water,earth,fire,air:bool}, mirror:{ [id]:{side,rank} } }
   nodeDef shape (from JH.MIRROR.nodes):
     { id, element, name, a:{name,desc,apply(s,rank)}, b:{name,desc,apply(s,rank)} }

   Model notes:
   - A node has two sides (a/b). RANK IS SHARED across sides; toggling side is
     free and keeps rank (v1 decision — forgiving, easy to rebalance).
   - Water is Jon's own element: always unlocked. Earth/Fire/Air gate on
     `elements[element]` (set true when that ally-boss is redeemed).
   ===================================================================== */
(function (root) {
  "use strict";

  const DEFAULT_MAX_RANK = 3;

  // Essence to go from `rank` -> `rank+1`. Matches Balance.blessingCost (1,2,3,...).
  function cost(rank) { return (rank | 0) + 1; }

  function branchUnlocked(state, element) {
    return element === "water" ||
      !!(state && state.elements && state.elements[element]);
  }

  // Current {side,rank} for a node id; defaults to side "a", rank 0.
  function nodeState(state, id) {
    const m = (state && state.mirror) || {};
    const n = m[id];
    const side = (n && n.side === "b") ? "b" : "a";
    const rank = (n && typeof n.rank === "number" && isFinite(n.rank))
      ? Math.max(0, n.rank | 0) : 0;
    return { side, rank };
  }

  function canBuy(state, def, maxRank) {
    if (!def) return false;
    maxRank = maxRank || DEFAULT_MAX_RANK;
    if (!branchUnlocked(state, def.element)) return false;
    const rank = nodeState(state, def.id).rank;
    if (rank >= maxRank) return false;
    return (state.essence || 0) >= cost(rank);
  }

  // Spend essence + bump rank. Mutates state.mirror. Returns true on success.
  function buy(state, def, maxRank) {
    if (!canBuy(state, def, maxRank)) return false;
    if (!state.mirror) state.mirror = {};
    const cur = nodeState(state, def.id);
    state.essence -= cost(cur.rank);
    state.mirror[def.id] = { side: cur.side, rank: cur.rank + 1 };
    return true;
  }

  // Flip the active side; rank preserved (shared across sides). Returns new side.
  function toggleSide(state, def) {
    if (!state.mirror) state.mirror = {};
    const cur = nodeState(state, def.id);
    const side = cur.side === "a" ? "b" : "a";
    state.mirror[def.id] = { side, rank: cur.rank };
    return side;
  }

  // Fold every owned, unlocked node's active side into a stats block. Mutates s.
  function apply(s, state, nodeDefs) {
    if (!s || !state || !nodeDefs) return s;
    for (const def of nodeDefs) {
      if (!branchUnlocked(state, def.element)) continue;
      const ns = nodeState(state, def.id);
      if (ns.rank <= 0) continue;
      const face = def[ns.side] || def.a;
      if (face && typeof face.apply === "function") face.apply(s, ns.rank);
    }
    return s;
  }

  const Mirror = {
    DEFAULT_MAX_RANK, cost, branchUnlocked, nodeState,
    canBuy, buy, toggleSide, apply,
  };

  root.JH = root.JH || {};
  root.JH.Mirror = Mirror;
  if (typeof module !== "undefined" && module.exports) module.exports = Mirror;
})(typeof window !== "undefined" ? window : globalThis);
