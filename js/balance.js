/* =====================================================================
   balance.js — pure, side-effect-free balance math. Dual export:
   attaches JH.Balance in the browser; module.exports for node:test.
   Game files consume JH.Balance.*; tests require() it directly.
   ===================================================================== */
(function (root) {
  "use strict";
  const Balance = {
    // Elite difficulty tier by wave index. -1 = no elites (Act 1).
    // Act 2 = waves 5-7 (0), Act 3 = 8-9 (1), Act 4 = 10+ (2).
    actLevelForWave(waveIndex) {
      if (waveIndex < 5) return -1;
      if (waveIndex < 8) return 0;
      if (waveIndex < 10) return 1;
      return 2;
    },

    // Elite stat multipliers: ramp by act tier and by player power
    // (owned-upgrade count, capped at 15) so late fights stay tense.
    eliteScale(actLevel, ownedCount) {
      const lvl = Math.max(0, actLevel);
      const power = 1 + 0.03 * Math.min(ownedCount || 0, 15);
      const round3 = (n) => Math.round(n * 1000) / 1000;
      return {
        hp: round3((1.3 + 0.25 * lvl) * power),
        dmg: round3(1.2 + 0.12 * lvl),
        speed: round3(1.08 + 0.03 * lvl),
      };
    },

    // Clamp total count of `type` to `cap`; excess becomes `fallback` enemies
    // (merged into an existing fallback group if present). Pure: returns a new
    // list, never mutates the input.
    capEnemyType(spawns, type, cap, fallback) {
      let total = 0;
      spawns.forEach((g) => { if (g.type === type) total += g.count; });
      if (total <= cap) return spawns.map((g) => ({ type: g.type, count: g.count }));
      let excess = total - cap;
      const out = [];
      let capped = false;
      spawns.forEach((g) => {
        if (g.type === type) {
          if (!capped) { out.push({ type, count: cap }); capped = true; }
          // drop additional `type` groups (their counts folded into excess)
        } else {
          out.push({ type: g.type, count: g.count });
        }
      });
      const fb = out.find((g) => g.type === fallback);
      if (fb) fb.count += excess;
      else out.push({ type: fallback, count: excess });
      return out;
    },

    // Cumulative loot-roll thresholds vs Math.random(), scaled by an enemy's
    // dropMult. Base rates (mult 1): 18% health, 27% water can.
    // The 0.9 cap applies to the cumulative water threshold, not per-item.
    dropThresholds(dropMult) {
      const m = dropMult || 1;
      const health = Math.min(0.45, 0.18 * m);
      const waterChance = 0.27 * m;
      const water = Math.min(0.9, health + waterChance);
      return { health, water };
    },
  };
  root.JH = root.JH || {};
  root.JH.Balance = Balance;
  if (typeof module !== "undefined" && module.exports) module.exports = Balance;
})(typeof window !== "undefined" ? window : globalThis);
