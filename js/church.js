/* =====================================================================
   church.js — JH.Church: the Church of the Holy Hose.
   Owns permanent meta-progression (Holy Essence, blessings, unlocked
   elements) + its localStorage persistence, AND the death-interlude scene:
   a walkable nave where ghost-Jon strolls, Father Jon materializes to
   explain Holy Essence, blessing shrines are spent at by proximity, and a
   portal at the end returns you to the street. Player stays in control
   throughout (no modal menus). Dual-export (node:test) like balance.js;
   no DOM access at module load.
   ===================================================================== */
(function (root) {
  "use strict";
  const KEY = "jonhose.church.v1";
  const ELEMENTS = ["earth", "fire", "air", "water"];

  // Scene presentation timings (seconds) — render/feel, not balance.
  const WALK_SPEED = 78, FATHER_MAT = 0.5, EXIT_FADE = 0.6;

  function wrapText(ctx, text, x, y, maxW, lh) {
    const words = text.split(" "); let line = "", yy = y;
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = w; yy += lh; }
      else line = test;
    }
    if (line) ctx.fillText(line, x, yy);
  }

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

    // ---- The walkable Church of the Holy Hose ----------------------
    enterScene(game) {
      const JH = root.JH, L = JH.CHURCH.layout;
      const firstVisit = !this.state.churchVisited;
      this.state.churchVisited = true;
      // Elements unlocked but not yet celebrated -> glow their shrine this visit.
      const fresh = JH.CHURCH.shrines
        .filter((s) => this.state.elements[s.element] && !this.state.ceremonyDone[s.element])
        .map((s) => s.element);
      this.save();
      this.scene = {
        jonX: L.spawnX, facing: 1, walking: false, frame: 0, t: 0,
        firstVisit: firstVisit,
        fatherShown: false, fatherT: 0,
        dialogue: null,
        freshShrines: fresh,
        activeStation: null,
        exiting: false, exitT: 0,
      };
    },

    updateScene(dt, game) {
      const sc = this.scene; if (!sc) return;
      const JH = root.JH, L = JH.CHURCH.layout, In = JH.Input;
      sc.t += dt;
      if (sc.fatherShown) sc.fatherT += dt;

      // Exit transition: fade out, then warp back into the world.
      if (sc.exiting) {
        sc.exitT += dt;
        if (sc.exitT >= EXIT_FADE) { this.scene = null; game.respawnFromChurch(); }
        return;
      }

      // Father Jon's dialogue gates movement until he finishes.
      if (sc.dialogue) {
        if (In.pressed("confirm") && sc.t > 0.25) {
          sc.dialogue.idx++; sc.t = 0;
          if (sc.dialogue.idx >= sc.dialogue.lines.length) {
            sc.dialogue = null;
            // Seeing a freshly-redeemed shrine lit counts as its ceremony.
            sc.freshShrines.forEach((el) => { this.state.ceremonyDone[el] = true; });
            this.save();
          }
        }
        return;
      }

      // Free walk.
      const sp = WALK_SPEED * dt;
      sc.walking = false;
      if (In.held("right")) { sc.jonX += sp; sc.facing = 1; sc.walking = true; }
      if (In.held("left"))  { sc.jonX -= sp; sc.facing = -1; sc.walking = true; }
      sc.jonX = Math.max(12, Math.min(sc.jonX, L.length - 12));
      if (sc.walking) sc.frame += dt * 8;

      // Father Jon materializes once you pass the threshold, and speaks.
      if (!sc.fatherShown && sc.jonX >= L.fatherX) {
        sc.fatherShown = true; sc.fatherT = 0; sc.t = 0;
        const lines = sc.firstVisit
          ? JH.CHURCH.sermon.first.slice()
          : [JH.CHURCH.sermon.repeat[(Math.random() * JH.CHURCH.sermon.repeat.length) | 0]];
        sc.dialogue = { lines: lines, idx: 0 };
        return;
      }

      // Blessing stations: active when you stand near one; Press E to spend.
      sc.activeStation = null;
      for (const st of L.stations) {
        if (Math.abs(sc.jonX - st.x) <= L.stationRange) { sc.activeStation = st.id; break; }
      }
      if (sc.activeStation && In.pressed("confirm")) {
        if (this.buyBlessing(sc.activeStation, game.player)) game.audio.play("upgrade");
        else game.audio.play("hurt");
      }

      // Walk into the portal -> begin the exit transition.
      if (sc.jonX >= L.portalX - L.portalReach) { sc.exiting = true; sc.exitT = 0; }
    },

    renderScene(ctx, game) {
      const sc = this.scene; if (!sc) return;
      const JH = root.JH, L = JH.CHURCH.layout, PAL = JH.PAL, ART = JH.ChurchArt || {};
      const VW = JH.VIEW_W, VH = JH.VIEW_H, floorY = VH - 14;
      const camX = Math.max(0, Math.min(sc.jonX - VW / 2, L.length - VW));
      ctx.font = "8px monospace"; ctx.textAlign = "center";

      // Backdrop.
      blit(ctx, ART.backdrop, 0, 0, VW, VH, () => {
        ctx.fillStyle = "#0a0c14"; ctx.fillRect(0, 0, VW, VH);
        ctx.fillStyle = "#11141f"; ctx.fillRect(0, VH - 56, VW, 56);
      });

      // Altar centerpiece + the four elemental shrines flanking it.
      const ax = Math.round(L.altarX - camX);
      blit(ctx, ART.altar, ax - 16, VH - 96, 32, 40, () => {
        ctx.fillStyle = "#39507a"; ctx.fillRect(ax - 14, VH - 92, 28, 36);
      });
      JH.CHURCH.shrines.forEach((s, i) => {
        const x = Math.round(L.altarX - 135 + i * 90 - camX);
        const lit = this.state.elements[s.element];
        const fresh = sc.freshShrines.indexOf(s.element) >= 0;
        blit(ctx, lit ? ART.shrineLit : ART.shrineDim, x - 10, 48, 20, 44, () => {
          ctx.fillStyle = lit ? PAL.waterHi : "#1c2233"; ctx.fillRect(x - 8, 54, 16, 38);
        });
        if (fresh) {
          ctx.save(); ctx.globalAlpha = 0.5 * (0.5 + 0.5 * Math.sin(sc.t * 6));
          ctx.fillStyle = "#d6f6ff"; ctx.fillRect(x - 11, 46, 22, 48); ctx.restore();
        }
      });

      // Blessing stations: pedestal + bobbing icon; glow + prompt when near.
      const ICON = { bless_dps: PAL.hpPk, bless_tank: PAL.water, bless_hp: "#6cff9a" };
      for (const st of L.stations) {
        const x = Math.round(st.x - camX);
        const near = sc.activeStation === st.id;
        const bob = Math.sin(sc.t * 4 + st.x) * 2;
        blit(ctx, ART["station_" + st.id], x - 9, VH - 50, 18, 34, () => {
          ctx.fillStyle = near ? "#46577a" : "#2a3344"; ctx.fillRect(x - 7, VH - 44, 14, 28);
        });
        if (near) {
          ctx.save(); ctx.globalAlpha = 0.35 + 0.25 * Math.sin(sc.t * 8);
          ctx.fillStyle = ICON[st.id]; ctx.fillRect(x - 10, VH - 71 + bob, 20, 20); ctx.restore();
        }
        ctx.fillStyle = ICON[st.id]; ctx.fillRect(x - 5, VH - 66 + bob, 10, 10);
        if (near) {
          const def = JH.CHURCH.blessings.find((b) => b.id === st.id);
          ctx.fillStyle = "#ffe9a8"; ctx.fillText(def.name + " — " + def.desc, x, VH - 82 + bob);
          ctx.fillStyle = this.canBuyBlessing(st.id) ? "#9be8ff" : "#a66";
          ctx.fillText("Lvl " + this.blessingCount(st.id) + "  ·  " + this.blessingCost(st.id) +
            " essence  ·  Press E", x, VH - 72 + bob);
        }
      }

      // Portal at the end of the nave.
      const px = Math.round(L.portalX - camX);
      blit(ctx, ART.portal, px - 12, VH - 104, 24, 48, () => {
        ctx.save(); ctx.globalAlpha = 0.6 + 0.4 * Math.sin(sc.t * 6);
        ctx.fillStyle = "#6cff9a"; ctx.fillRect(px - 7, VH - 96, 14, 40); ctx.restore();
        ctx.strokeStyle = "#bfffd6"; ctx.strokeRect(px - 9, VH - 98, 18, 44);
      });

      // Ghost Jon — the real sprite, translucent + a cyan soul-glow, no water.
      const sx = Math.round(sc.jonX - camX);
      ctx.save(); ctx.globalAlpha = 0.26; ctx.fillStyle = "#6cd3ff";
      ctx.beginPath(); ctx.ellipse(sx, floorY - 18, 12, 22, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      ctx.save();
      ctx.globalAlpha = sc.exiting ? Math.max(0, 0.62 - sc.exitT) : 0.62;
      JH.Assets.draw(ctx, "jon", sx, floorY, sc.facing, { state: sc.walking ? "walk" : "idle", frame: sc.frame | 0 });
      ctx.restore();

      // Father Jon, materializing at his threshold.
      if (sc.fatherShown) {
        const fx = Math.round(L.fatherX + 20 - camX), a = Math.min(1, sc.fatherT / FATHER_MAT);
        ctx.save(); ctx.globalAlpha = a;
        blit(ctx, ART.fatherJonNpc, fx - 12, floorY - 56, 24, 56, () => {
          ctx.fillStyle = "#2a2440"; ctx.fillRect(fx - 8, floorY - 48, 16, 48);   // robe
          ctx.fillStyle = "#f1c08a"; ctx.fillRect(fx - 5, floorY - 54, 10, 8);    // face
          ctx.fillStyle = "#d6f6ff"; ctx.fillRect(fx - 7, floorY - 61, 14, 8);    // mitre
        });
        if (a < 1) { ctx.globalAlpha = (1 - a) * 0.7; ctx.fillStyle = "#d6f6ff"; ctx.fillRect(fx - 12, floorY - 61, 24, 61); }
        ctx.restore();
      } else {
        ctx.fillStyle = "#7f8aa0"; ctx.fillText("→", sx + 18, floorY - 30);
      }

      // Holy Essence readout — always visible so the currency reads.
      ctx.textAlign = "right"; ctx.fillStyle = "#d6f6ff";
      ctx.fillText("✦ Holy Essence: " + this.state.essence, VW - 8, 14);

      // Father Jon's dialogue box.
      if (sc.dialogue) {
        ctx.fillStyle = "rgba(0,0,0,0.78)"; ctx.fillRect(0, VH - 58, VW, 58);
        blit(ctx, ART.fatherJonPortrait, 8, VH - 56, 44, 50, () => {
          ctx.fillStyle = "#1a1530"; ctx.fillRect(8, VH - 56, 44, 50);
          ctx.fillStyle = "#f1c08a"; ctx.fillRect(24, VH - 44, 12, 12);
          ctx.fillStyle = "#d6f6ff"; ctx.fillRect(22, VH - 50, 16, 6);
        });
        ctx.fillStyle = "#ffe9a8"; ctx.textAlign = "left";
        wrapText(ctx, "Father Jon: " + sc.dialogue.lines[sc.dialogue.idx], 60, VH - 44, VW - 72, 10);
        ctx.fillStyle = "#9fb0c8"; ctx.textAlign = "right"; ctx.fillText("Press E", VW - 8, VH - 8);
      }

      // Exit fade-to-black (continues into the world fade-in on respawn).
      if (sc.exiting) {
        ctx.save(); ctx.globalAlpha = Math.min(1, sc.exitT / EXIT_FADE);
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, VW, VH); ctx.restore();
      }
      ctx.textAlign = "left";
    },
  };

  root.JH = root.JH || {};
  root.JH.Church = Church;
  if (typeof module !== "undefined" && module.exports) module.exports = Church;
})(typeof window !== "undefined" ? window : globalThis);
