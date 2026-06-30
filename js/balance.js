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

    // Cost of the next purchase of a repeatable node (1.5x per prior buy).
    repeatableCost(base, timesBought) {
      return Math.round(base * Math.pow(1.5, timesBought || 0));
    },

    // Act-start checkpoint for a wave: largest actStarts entry <= waveIndex
    // (clamped to the first act for pre-start indices). Pure.
    actStartForWave(waveIndex, actStarts) {
      let start = actStarts[0];
      for (let i = 0; i < actStarts.length; i++) {
        if (actStarts[i] <= waveIndex) start = actStarts[i];
      }
      return start;
    },

    // Cost of the next blessing purchase: 1, 2, 3, ... (timesBought + 1). Pure.
    blessingCost(timesBought) {
      return (timesBought || 0) + 1;
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

    // Is the player within throwRange of the Bulwark? Pure distance check —
    // facing/angle doesn't matter since Bulwark.facing now updates freely
    // every frame (no turn-cooldown), so it's already oriented correctly.
    bulwarkShouldThrow(bulwarkX, bulwarkY, playerX, playerY, throwRange) {
      const dist = Math.hypot(playerX - bulwarkX, playerY - bulwarkY);
      return dist <= throwRange;
    },

    // Where a Stalker reappears after a blink: directly behind the player
    // relative to their current facing, offset by `blinkDist`, clamped into
    // the arena bounds. Pure — bounds/inputs are all passed in.
    stalkerBlinkTarget(playerX, playerY, playerFacing, blinkDist, bounds) {
      const x = Math.max(bounds.minX, Math.min(bounds.maxX, playerX - playerFacing * blinkDist));
      const y = Math.max(bounds.depthMin, Math.min(bounds.depthMax, playerY));
      return { x, y };
    },
  };
  root.JH = root.JH || {};
  root.JH.Balance = Balance;
  if (typeof module !== "undefined" && module.exports) module.exports = Balance;
})(typeof window !== "undefined" ? window : globalThis);
