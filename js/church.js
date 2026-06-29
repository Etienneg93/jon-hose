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

  // Draw img if it's a loaded Image (_ready), else run the procedural fallback.
  function blit(ctx, img, x, y, w, h, fallback) {
    if (img && img._ready) ctx.drawImage(img, x, y, w, h);
    else fallback();
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

    // ---- Death-interlude scene -------------------------------------
    enterScene(game) {
      const L = root.JH.CHURCH.layout;
      const firstVisit = !this.state.churchVisited;
      this.state.churchVisited = true;
      this.save();
      this.scene = {
        phase: "walk",
        spiritX: firstVisit ? L.spawnFar : L.spawnNear,
        firstVisit: firstVisit,
        t: 0,
      };
    },

    updateScene(dt, game) {
      const sc = this.scene; if (!sc) return;
      const L = root.JH.CHURCH.layout, In = root.JH.Input;
      sc.t += dt;
      if (sc.phase === "walk") {
        const sp = 70 * dt;
        if (In.held("right")) sc.spiritX += sp;
        if (In.held("left"))  sc.spiritX -= sp;
        if (sc.spiritX < 8) sc.spiritX = 8;
        if (sc.spiritX >= L.altarX) { sc.spiritX = L.altarX; sc.phase = "portal"; sc.t = 0; }
        return;
      }
      if (sc.phase === "portal") {
        if (In.pressed("confirm") && sc.t > 0.25) { this.scene = null; game.respawnAtCheckpoint(); }
        return;
      }
    },

    renderScene(ctx, game) {
      const sc = this.scene; if (!sc) return;
      const JH = root.JH, L = JH.CHURCH.layout, PAL = JH.PAL, ART = JH.ChurchArt || {};
      const VW = JH.VIEW_W, VH = JH.VIEW_H;
      const camX = Math.max(0, Math.min(sc.spiritX - VW / 2, L.length - VW));
      ctx.font = "8px monospace"; ctx.textAlign = "center";

      // Backdrop.
      blit(ctx, ART.backdrop, 0, 0, VW, VH, () => {
        ctx.fillStyle = "#0a0c14"; ctx.fillRect(0, 0, VW, VH);
        ctx.fillStyle = "#11141f"; ctx.fillRect(0, VH - 60, VW, 60);
      });

      // Four shrines; lit by unlocked element.
      JH.CHURCH.shrines.forEach((s, i) => {
        const x = Math.round(120 + i * 90 - camX), lit = this.state.elements[s.element];
        blit(ctx, lit ? ART.shrineLit : ART.shrineDim, x - 10, 52, 20, 44, () => {
          ctx.fillStyle = lit ? PAL.waterHi : "#1c2233"; ctx.fillRect(x - 10, 56, 20, 40);
        });
      });

      // Altar.
      const ax = Math.round(L.altarX - camX);
      blit(ctx, ART.altar, ax - 14, VH - 96, 28, 36, () => {
        ctx.fillStyle = "#39507a"; ctx.fillRect(ax - 12, VH - 92, 24, 32);
      });

      // Portal (only once revealed).
      if (sc.phase === "portal") {
        const px = Math.round(L.portalX - camX);
        blit(ctx, ART.portal, px - 10, VH - 100, 20, 40, () => {
          ctx.fillStyle = "#6cff9a"; ctx.fillRect(px - 8, VH - 96, 16, 36);
        });
      }

      // Spirit.
      const sx = Math.round(sc.spiritX - camX);
      blit(ctx, ART.spirit, sx - 8, VH - 96, 16, 32, () => {
        ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = PAL.waterHi;
        ctx.fillRect(sx - 5, VH - 86, 10, 22); ctx.fillRect(sx - 4, VH - 94, 8, 8); ctx.restore();
      });

      // Phase prompts.
      ctx.fillStyle = "#9fb0c8";
      if (sc.phase === "walk") ctx.fillText("...where am I?  →", VW / 2, 20);
      else if (sc.phase === "portal") ctx.fillText("A portal hums. Press E to return.", VW / 2, 20);
      ctx.textAlign = "left";
    },
  };

  root.JH = root.JH || {};
  root.JH.Church = Church;
  if (typeof module !== "undefined" && module.exports) module.exports = Church;
})(typeof window !== "undefined" ? window : globalThis);
