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
  };
  root.JH = root.JH || {};
  root.JH.Balance = Balance;
  if (typeof module !== "undefined" && module.exports) module.exports = Balance;
})(typeof window !== "undefined" ? window : globalThis);
