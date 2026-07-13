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

    // WYSIWYG stream centerline height above the road at forward distance dx
    // (dx = target.worldX - nozzleX). One ballistic parabola from the muzzle
    // to the road at exactly range — near-flat early (gravity is quadratic:
    // only ~6% dropped by quarter range), sagging mid-flight, diving at the
    // tail. No piecewise knee — the bend IS gravity.
    // Matches the ground-hazard hose hit test 1:1 (see truck.js _hose).
    hoseStreamY(dx, range, cfg) {
      const k = Math.min(1, Math.max(0, dx) / range);
      return Math.max(0, cfg.cannonH * (1 - k * k));
    },

    // Damage falloff along the stream: full dps out to range*(1-endFalloff),
    // then linear down to endFalloffFloor exactly at range, 0 beyond.
    hoseDpsMult(dx, range, cfg) {
      if (dx < 0 || dx > range) return 0;
      const taperStart = range * (1 - cfg.endFalloff);
      if (dx <= taperStart) return 1;
      const span = range - taperStart;
      const k = span > 0 ? (dx - taperStart) / span : 1;
      return 1 - k * (1 - cfg.endFalloffFloor);
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

      // start, end, hazards/sec, kind bag (weighted by repetition). Enemies are
      // fuses only; wrecks are the dodge-obstacles sprinkled in.
      const windows = [
        { s: 0,  e: 12, rate: 0.6, kinds: ["fuse", "wreck"] },
        { s: 12, e: 35, rate: 1.1, kinds: ["fuse", "fuse", "wreck"] },
        { s: 35, e: 52, rate: 1.7, kinds: ["fuse", "fuse", "fuse", "wreck"] },
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

    // ---- Gate Crash finale helpers (all numbers from cfg.finale = F) ----

    // Full-screen white alpha across the finale. phase = the scene phase
    // string; t = seconds into that phase. Ramps up during "whiteout"
    // (holding at 1 past the ramp), fades down during "reveal", else 0.
    finaleWhite(F, phase, t) {
      if (phase === "whiteout") return Math.min(1, t / F.whiteRamp);
      if (phase === "reveal") return Math.max(0, 1 - t / F.whiteFade);
      return 0;
    },

    // Detonation boom cadence/scale, linear in progress (clamped 0..1).
    boomInterval(F, prog) {
      const k = Math.max(0, Math.min(1, prog));
      return F.boomIntStart + (F.boomIntEnd - F.boomIntStart) * k;
    },
    boomScale(F, prog) {
      const k = Math.max(0, Math.min(1, prog));
      return F.boomScaleStart + (F.boomScaleEnd - F.boomScaleStart) * k;
    },

    // Jon's blast-throw: a primary ballistic arc (startX/startY-above-ground
    // → landX on the ground line) then one small bounce hop. Screen coords;
    // groundY is the walkway ground line (caller passes feetScreenY of the
    // walk depth). rot spins `spins` full turns over the primary arc, then
    // holds. Returns { x, y, rot, done }.
    throwArc(F, groundY, t) {
      const T = F.throw;
      const k = Math.min(1, t / T.dur);
      if (k < 1) {
        const y0 = groundY + T.startY;
        return {
          x: T.startX + (T.landX - T.startX) * k,
          y: y0 + (groundY - y0) * k - T.apex * 4 * k * (1 - k),
          rot: T.spins * Math.PI * 2 * k,
          done: false,
        };
      }
      const kb = Math.min(1, (t - T.dur) / T.bounceDur);
      return {
        x: T.landX + T.bounceDX * kb,
        y: groundY - T.bounceH * 4 * kb * (1 - kb),
        rot: T.spins * Math.PI * 2,
        done: kb >= 1,
      };
    },

    // Has Jon walked into the gate mouth?
    gateReached(F, x) { return x >= F.gate.enterX; },
  };

  root.JH = root.JH || {};
  root.JH.TruckBalance = TruckBalance;
  if (typeof module !== "undefined" && module.exports) module.exports = TruckBalance;
})(typeof window !== "undefined" ? window : globalThis);
