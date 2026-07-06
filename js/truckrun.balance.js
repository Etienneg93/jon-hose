/* =====================================================================
   truckrun.balance.js — pure, side-effect-free math for the fire-truck
   escape set-piece. Dual export: attaches JH.TruckBalance in the browser;
   module.exports for node:test. All numbers come from the passed `cfg`
   (JH.TRUCKRUN) — nothing is hardcoded here.
   ===================================================================== */
(function (root) {
  "use strict";
  const round2 = (n) => Math.round(n * 100) / 100;

  const TruckBalance = {
    // Two-tier hose pressure by tank fraction: full power at/above the floor,
    // dry sputter below it. (Deliberately blunter than Jon's 4-tier curve —
    // the truck run is a power-fantasy, not a rationing test.)
    truckPressure(cfg, waterFrac) {
      if (waterFrac >= cfg.pressureFloor) return { dmgScale: 1, rangeMult: 1 };
      return { dmgScale: cfg.dryDpsMult, rangeMult: cfg.dryRangeMult };
    },

    // One extinguish step against the climax Furnace. Clamps at 0.
    douse(hp, dps, dt) {
      return Math.max(0, hp - dps * dt);
    },

    // Clean-Escape essence bonus. cleanBonusTiers = [decent, flawless].
    // Flawless needs full HP AND no wall contact; a wall touch caps to decent.
    cleanBonus(cfg, hpFrac, wallTouched) {
      const [low, high] = cfg.cleanBonusTiers;
      if (hpFrac >= 0.99 && !wallTouched) return high;
      if (hpFrac >= 0.6) return low;
      return 0;
    },

    // Does the forward hose swath cover a target? dx = target.worldX - nozzleX.
    // ONE shape shared with the beam render (rim-is-hitbox): a forward band of
    // half-width hoseBand in depth, out to hoseRange.
    beamCovers(truckDepth, hoseBand, targetDepth, dx, range) {
      return dx >= 0 && dx <= range && Math.abs(targetDepth - truckDepth) <= hoseBand;
    },

    // Deterministic ~60s spawn schedule, sorted by `at`. rng is injectable for
    // tests (defaults to Math.random). Combat hazards ramp across three windows
    // and stop before the arrival tail; hydrants and crosses are laid over the
    // whole run. Wrecks are the only static full-lane blockers, so they're
    // capped to never fill every lane in one 0.5s bucket (gapExists holds).
    buildTimeline(cfg, rng) {
      const r = rng || Math.random;
      const lanes = cfg.lanes;
      const pick = (arr) => arr[Math.floor(r() * arr.length)];
      const events = [];

      // Track wreck lanes per 0.5s bucket so a gap always exists.
      const wreckBucket = {};
      const bucketKey = (at) => Math.round(at * 2) / 2;
      const wreckFits = (at, depth) => {
        const set = wreckBucket[bucketKey(at)];
        if (!set) return true;
        if (set.has(depth)) return true;           // same lane already blocked
        return set.size < lanes.length - 1;         // keep ≥1 lane open
      };
      const noteWreck = (at, depth) => {
        const k = bucketKey(at);
        (wreckBucket[k] = wreckBucket[k] || new Set()).add(depth);
      };

      // start, end, hazards/sec, kind bag (weighted by repetition).
      const windows = [
        { s: 0,  e: 12, rate: 0.5, kinds: ["wreck"] },
        { s: 12, e: 35, rate: 1.1, kinds: ["wreck", "fuse", "smelt", "pyro"] },
        { s: 35, e: 52, rate: 1.8, kinds: ["wreck", "fuse", "fuse", "pyro", "smelt"] },
      ];
      for (const w of windows) {
        let t = w.s;
        while (t < w.e) {
          t += (0.6 + r() * 0.8) / w.rate;   // jittered interval, scaled by rate
          if (t >= w.e) break;
          let kind = pick(w.kinds);
          let depth = pick(lanes);
          if (kind === "wreck" && !wreckFits(t, depth)) {
            // find a lane that keeps a gap; else demote to a non-blocking fuse.
            const free = lanes.filter((d) => wreckFits(t, d));
            if (free.length) depth = free[Math.floor(r() * free.length)];
            else kind = "fuse";
          }
          if (kind === "wreck") noteWreck(t, depth);
          events.push({ at: round2(t), kind: kind, depth: depth });
        }
      }

      // Hydrants — evenly spaced with light jitter, clear of the tail.
      for (let ht = cfg.hydrantEverySec; ht < cfg.runDuration - 6; ht += cfg.hydrantEverySec) {
        events.push({ at: round2(ht + (r() - 0.5) * 1.5), kind: "hydrant", depth: pick(lanes) });
      }

      // Crosses — strewn across the build+climax stretch (the risky lanes).
      for (let i = 0; i < cfg.crossCount; i++) {
        events.push({ at: round2(10 + r() * 38), kind: "cross", depth: pick(lanes), value: cfg.crossVal });
      }

      events.sort((a, b) => a.at - b.at);
      return events;
    },

    // Invariant used by tests (and mirrored by buildTimeline's guard): no 0.5s
    // bucket has a static wreck in every lane, so a passable lane always exists.
    gapExists(events, lanes) {
      const byAt = {};
      for (const e of events) {
        if (e.kind !== "wreck") continue;
        const k = Math.round(e.at * 2) / 2;
        (byAt[k] = byAt[k] || new Set()).add(e.depth);
      }
      for (const k in byAt) if (byAt[k].size >= lanes.length) return false;
      return true;
    },
  };

  root.JH = root.JH || {};
  root.JH.TruckBalance = TruckBalance;
  if (typeof module !== "undefined" && module.exports) module.exports = TruckBalance;
})(typeof window !== "undefined" ? window : globalThis);
