/* =====================================================================
   balance.js — pure, side-effect-free balance math. Dual export:
   attaches JH.Balance in the browser; module.exports for node:test.
   Game files consume JH.Balance.*; tests require() it directly.
   ===================================================================== */
(function (root) {
  "use strict";
  const Balance = {
    // Elite difficulty tier by wave index, derived from act-start markers.
    // Returns -1 for Act 1 (no elites), then 0,1,2,… per crossed boundary.
    actLevelForWave(waveIndex, actStarts) {
      let level = -1;
      for (let i = 0; i < actStarts.length; i++) {
        if (waveIndex >= actStarts[i]) level = i - 1;
      }
      return level;
    },

    // Elite stat multipliers: ramp by act tier and by player power
    // (owned-upgrade count, capped at 24) so late fights stay tense.
    eliteScale(actLevel, ownedCount) {
      const lvl = Math.max(0, actLevel);
      const power = 1 + 0.03 * Math.min(ownedCount || 0, 24);
      const round3 = (n) => Math.round(n * 1000) / 1000;
      return {
        hp: round3((1.3 + 0.25 * lvl) * power),
        dmg: round3(1.2 + 0.12 * lvl),
        speed: round3(1.08 + 0.03 * lvl),
      };
    },

    // Total player-power count fed to eliteScale/bossHpScale: one-time nodes
    // + repeatable Overcharge buys + total pillar ranks + XP levels + owned
    // stat-bearing relics (5th arg, default 0). All sources of permanent
    // stat growth count, so the enemy ramp can see them.
    powerCount(owned, repCount, churchState, levelCount, statRelicCount) {
      let n = Object.keys(owned || {}).length;
      const rc = repCount || {};
      for (const k in rc) n += rc[k] || 0;
      const p = (churchState && churchState.pillars) || {};
      for (const k in p) n += p[k] | 0;
      n += levelCount | 0;
      n += statRelicCount | 0;
      return n;
    },

    // Vendor relic pool: minAct-gated by actLevel; optional tier filter.
    // Pure — takes the relic defs array, doesn't read JH.RELICS itself.
    relicPoolIds(relicDefs, actLevel, tier) {
      return (relicDefs || [])
        .filter((r) => (r.minAct == null || actLevel >= r.minAct) && (!tier || r.tier === tier))
        .map((r) => r.id);
    },

    // Tiered 3-slot wheel roll: slot 1 common, slot 2 rare, slot 3 rare that
    // upgrades to relic-grade with act-indexed odds (JH.SHOP.relicGradeOdds).
    // Exhausted tiers fall back down the chain; fully-exhausted slots are null.
    // Never rolls duplicates. Pure aside from the injected rng.
    rollWheelStock(relicDefs, ownedMap, actLevel, rng) {
      const owned = ownedMap || {}, r = rng || Math.random;
      const pools = {};
      for (const t of ["common", "rare", "relic"])
        pools[t] = this.relicPoolIds(relicDefs, actLevel, t).filter((id) => !owned[id]);
      const draw = (chain) => {
        for (const t of chain) {
          const p = pools[t];
          if (p.length) return p.splice(Math.floor(r() * p.length), 1)[0];
        }
        return null;
      };
      const shop = (root.JH && root.JH.SHOP) || {};
      const oddsArr = shop.relicGradeOdds || [0, 0, 0, 0];
      const odds = oddsArr[Math.max(0, Math.min(3, actLevel + 1))] || 0;
      const slot3Chain = (pools.relic.length && r() < odds)
        ? ["relic", "rare", "common"] : ["rare", "common", "relic"];
      const s1 = draw(["common", "rare", "relic"]);
      const s2 = draw(["rare", "common", "relic"]);
      const s3 = draw(slot3Chain);
      return [s1, s2, s3];
    },

    // Boss HP at spawn scales with player power (same count as eliteScale).
    bossHpScale(baseHp, ownedCount) {
      return Math.round(baseHp * (1 + 0.02 * (ownedCount || 0)));
    },

    // Super-elite def: scaled clone of a regular def. Runtime draw scale
    // (1.8x) is applied at draw time, not here — body box grows less (1.6x)
    // so the hitbox stays a touch inside the sprite.
    // `tune` (optional) overrides multipliers per type — {hp} for now.
    superEliteDef(def, tune) {
      const d = Object.assign({}, def);
      d.hp = Math.round(d.hp * ((tune && tune.hp) || 7));
      d.touchDmg = Math.round(d.touchDmg * 2);
      if (d.meleeDmg)  d.meleeDmg  = Math.round(d.meleeDmg * 2);
      if (d.chargeDmg) d.chargeDmg = Math.round(d.chargeDmg * 2);
      if (d.emberDmg)  d.emberDmg  = Math.round(d.emberDmg * 2);
      if (d.strikeDmg) d.strikeDmg = Math.round(d.strikeDmg * 2);
      if (d.slamDmg)   d.slamDmg   = Math.round(d.slamDmg * 2);
      if (d.speed)     d.speed     = Math.round(d.speed * 0.85);
      d.suds = Math.round((d.suds || 0) * 4);
      d.bodyW = Math.round(d.bodyW * 1.6);
      d.bodyH = Math.round(d.bodyH * 1.6);
      return d;
    },

    // Attack-ticket budget per act; budgets indexed actLevel+1 (like
    // SPRINKLE.counts), clamped to the last entry.
    ticketBudget(actLevel, budgets) {
      const i = Math.max(0, Math.min(budgets.length - 1, (actLevel | 0) + 1));
      return budgets[i];
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

    // Cost of the next purchase of a repeatable node (factor per prior buy,
    // default 1.5x; Overcharge passes 1.8x for a steeper late-game curve).
    repeatableCost(base, timesBought, factor) {
      return Math.round(base * Math.pow(factor || 1.5, timesBought || 0));
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

    // Per-visit relic stock: filter already-owned ids out of the pool,
    // Fisher-Yates shuffle the rest with the injected rng, take the first n.
    // Pure — never mutates poolIds. May return fewer than n if the pool is
    // thin (most owned).
    pickRelics(poolIds, ownedMap, n, rng) {
      const owned = ownedMap || {};
      const r = rng || Math.random;
      const pool = poolIds.filter((id) => !owned[id]);
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
      }
      return pool.slice(0, n);
    },

    // Slot-wheel entries for the shop's relic row: 3 stock cards + a 4th
    // fixed Kibble Pack card. `stock` is the vendor's spawn-time snapshot,
    // so slots never shift: a bought relic keeps its slot with sold=true.
    // id is null only when the pool was thin at spawn (renders empty).
    // Pure — never mutates stock.
    shopWheelEntries(stock, relicsOwned) {
      const owned = relicsOwned || {};
      const out = [];
      for (let i = 0; i < 3; i++) {
        const id = (stock && stock[i]) || null;
        out.push({ kind: "wheel", slot: i, id, sold: !!(id && owned[id]) });
      }
      out.push({ kind: "wheel", slot: 3, id: "kibble", sold: false });
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

    // Should the Furnace enter its vent wind-up? True when the player has
    // sprayed it continuously past the heat threshold and the post-vent
    // cooldown has expired. Pure — inputs are all passed in.
    furnaceShouldVent(continuousSprayT, heatThreshold, ventCdT) {
      return continuousSprayT >= heatThreshold && ventCdT <= 0;
    },

    // Enemy types introduced by authored waves up to and including waveIndex
    // (from their `spawns` lists — bosses have none). dummy/neighbor excluded.
    // Order = first-seen order. Pure.
    unlockedPool(waves, waveIndex) {
      const seen = [];
      const last = Math.min(waveIndex, waves.length - 1);
      for (let i = 0; i <= last; i++) {
        (waves[i].spawns || []).forEach((g) => {
          if (g.type === "dummy" || g.type === "neighbor") return;
          if (!seen.includes(g.type)) seen.push(g.type);
        });
      }
      return seen;
    },

    // Weighted sprinkle picks from an unlocked pool. opts (all optional):
    //   weights  — {type: weight}; unlisted types weigh 1
    //   heavies  — types sharing one combined heavyCap
    //   heavyCap — max TOTAL heavy picks (default 1)
    //   typeCaps — {type: max picks} hard per-type caps
    //   rng      — injectable () => [0,1) for deterministic tests
    // May return fewer than `count` when nothing is eligible. Pure.
    pickSprinkles(pool, count, opts) {
      const o = opts || {};
      const rng = o.rng || Math.random;
      const heavies = o.heavies || [];
      const heavyCap = o.heavyCap != null ? o.heavyCap : 1;
      const typeCaps = o.typeCaps || {};
      const weights = o.weights || {};
      const w = (t) => (weights[t] != null ? weights[t] : 1);
      const picks = [];
      let heavyN = 0;
      for (let n = 0; n < count; n++) {
        const eligible = pool.filter((t) => {
          if (heavies.includes(t) && heavyN >= heavyCap) return false;
          const cap = typeCaps[t];
          if (cap != null && picks.filter((p) => p === t).length >= cap) return false;
          return true;
        });
        if (!eligible.length) break;
        let total = 0;
        eligible.forEach((t) => { total += w(t); });
        let r = rng() * total;
        let picked = eligible[eligible.length - 1];
        for (const t of eligible) {
          r -= w(t);
          if (r <= 0) { picked = t; break; }
        }
        picks.push(picked);
        if (heavies.includes(picked)) heavyN++;
      }
      return picks;
    },

    // XP needed to climb from level n-1 to n.
    xpForLevel(n) { return 20 + 12 * (n | 0); },

    // Summed stat deltas for `levelCount` level-ups walking the repeating
    // gain cycle. Returns {statKey: total}.
    levelGains(levelCount, cycle) {
      const out = {};
      for (let i = 0; i < (levelCount | 0); i++) {
        const step = cycle[i % cycle.length];
        for (const k in step) out[k] = (out[k] || 0) + step[k];
      }
      return out;
    },

    // One drop decision per kill. Pity: 6+ dry kills guarantees an item.
    // Need-weighting doubles the low resource's share of the item roll.
    rollDrop(dropMult, dryStreak, hpFrac, waterFrac, rng) {
      rng = rng || Math.random;
      const t = this.dropThresholds(dropMult);
      const itemChance = (dryStreak >= 6) ? 1 : t.water;   // t.water = cumulative item chance
      if (rng() >= itemChance) return null;
      let wh = t.health, ww = t.water - t.health;
      if (hpFrac < 0.5) wh *= 2;
      if (waterFrac < 0.3) ww *= 2;
      return rng() < wh / (wh + ww) ? "health" : "water";
    },

    // Combined spray-damage multiplier from the water/fire dmg-amp boons.
    // ranks: {overflow, baptize, trial} boon ranks (0/1/2). t: {waterFrac,
    // wet, burning} target/attacker state. Stacks multiplicatively. Pure.
    beneDmgMult(ranks, t) {
      let m = 1;
      if (ranks.overflow && t.waterFrac >= (ranks.overflow >= 2 ? 0.7 : 0.8)) m *= ranks.overflow >= 2 ? 1.3 : 1.2;
      if (ranks.baptize && t.wet > 0.3) m *= ranks.baptize >= 2 ? 1.25 : 1.15;
      if (ranks.trial && t.burning) m *= ranks.trial >= 2 ? 1.3 : 1.2;
      return m;
    },

    // Kibble grant: extend the regen window, reset the rate (same semantics
    // as the health-pickup collect path and the shop's Kibble Pack buy).
    kibbleGrant(pl, pack) {
      pl.kibbleTimer += pack.dur;
      pl.kibbleRegen = pack.heal / pack.dur;
    },

    // Prayer Bead grant: extend-only pressure buff (boss enrage + super-elite arrival).
    prayerBeadProc(pl, tune) {
      pl.pressureBuffT = Math.max(pl.pressureBuffT || 0, (tune || root.JH.RELIC_TUNE).prayerBeadDur);
    },

    // Burn dps on the player: per-stack rate, Asbestos Socks flat cut (floored).
    burnTickDps(stacks, socksOwned) {
      const per = socksOwned
        ? Math.max(root.JH.RELIC_TUNE.socksBurnDpsFloor, root.JH.FIRE.burnDpsPerStack - root.JH.RELIC_TUNE.socksBurnDpsCut)
        : root.JH.FIRE.burnDpsPerStack;
      return stacks * per;
    },

    // Deepdive time-scale ramp: advances toward maxScale (deepdiving) or 1 (not)
    // at the constant rate that crosses the full span in rampUp/rampDown seconds
    // of REAL time. Pure; clamps at both ends.
    deepdiveRamp(cur, deepdiving, dtReal, D) {
      const target = deepdiving ? D.maxScale : 1;
      const rate = (D.maxScale - 1) / (deepdiving ? D.rampUp : D.rampDown);
      const step = rate * dtReal;
      return target > cur ? Math.min(target, cur + step) : Math.max(target, cur - step);
    },
  };
  root.JH = root.JH || {};
  root.JH.Balance = Balance;
  if (typeof module !== "undefined" && module.exports) module.exports = Balance;
})(typeof window !== "undefined" ? window : globalThis);
