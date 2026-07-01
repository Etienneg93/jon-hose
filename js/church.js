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
  // Father Jon's solid-body block: a small circle (px) around his feet —
  // the church's depth lane is only 40px deep (see layout.depthMin/Max), so
  // even a modest box tolerance used to swallow most of the walkable band.
  const FATHER_COLLIDE_R = 9;
  // Father's manifest feet sit this many screen px above the floor row (a
  // fixed visual offset, not a depth-lane position) and he's drawn this tall.
  const FATHER_LIFT = 50, FATHER_H = 69;
  // Convert that fixed screen offset into a world depth so the collision
  // circle always sits where he's actually drawn, not just the lane's
  // midpoint — these two used to drift apart and looked offset from his feet.
  function fatherFootDepth(JH) {
    return (JH.VIEW_H - 14) - FATHER_LIFT - JH.FLOOR_TOP;
  }

  // ---- Player death sequence (pure timing -> {frame, riseY, alpha}) ----
  // `ds` is JH.CHURCH.deathSeq (or an equivalent object) — passed in rather than
  // read from a global so this stays testable without a DOM/window.

  function deathCorpseFrame(t, ds) {
    if (t < ds.fallEnd) return Math.max(0, Math.min(7, Math.floor((t / ds.fallEnd) * 8)));
    return 7; // settled: corpse stays on the ground for the rest of the sequence
  }

  function deathGhostState(t, ds) {
    const ghostStart = ds.fallEnd + ds.lingerDur;
    if (t <= ghostStart) return null;

    const riseEnd = ghostStart + ds.riseDur;
    const standEnd = riseEnd + ds.standDur;
    const alphaMax = ds.ghostAlphaMax;

    if (t <= riseEnd) {
      // Still in the corpse's final (kneeling) pose, lifting straight up out of it.
      const gt = t - ghostStart;
      const k = gt / ds.riseDur;
      return { frame: 7, riseY: k * ds.riseHeight, alpha: Math.min(1, gt / ds.materializeDur) * alphaMax };
    }
    if (t <= standEnd) {
      // Hovering at riseHeight, playing the collapse frames in reverse (7 -> 0).
      const k = (t - riseEnd) / ds.standDur;
      const step = Math.min(7, Math.floor(k * 8));
      return { frame: 7 - step, riseY: ds.riseHeight, alpha: alphaMax };
    }
    // Standing (frame 0): slow drift, then an accelerating beam upward, fading out.
    const at = t - standEnd;
    const extraRise = at <= ds.driftDur
      ? at * 28
      : ds.driftDur * 28 + Math.pow(at - ds.driftDur, 2) * 480;
    const alpha = Math.max(0, 1 - Math.max(0, at - ds.driftDur) / ds.beamFadeDur) * alphaMax;
    return { frame: 0, riseY: ds.riseHeight + extraRise, alpha };
  }

  function deathScreenFadeAlpha(t, ds) {
    const standEnd = ds.fallEnd + ds.lingerDur + ds.riseDur + ds.standDur;
    const beamStart = standEnd + ds.driftDur;
    const fadeStart = beamStart + ds.screenFadeDelay;
    if (t <= fadeStart) return 0;
    return Math.min(1, (t - fadeStart) / ds.screenFadeDur);
  }

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
      blessings: {},                                   // LEGACY id -> count (migrated)
      mirror: {},                                      // node id -> { side:"a"|"b", rank:int }
      elements: { earth: false, fire: false, air: false, water: true }, // water: Jon's own, open
      churchVisited: false,
    };
  }

  function num(v) { return (typeof v === "number" && isFinite(v)) ? v : 0; }

  // One-time migration: old flat blessing counts -> Mirror Water nodes (side a,
  // rank capped at maxRank). Runs only when mirror is empty and blessings exist,
  // so it never double-applies. Keeps the legacy `blessings` field for rollback.
  const BLESSING_TO_NODE = {
    bless_dps: "water_pressure", bless_tank: "water_reservoir", bless_hp: "water_vigor",
  };
  function migrateBlessings(d) {
    if (!d.blessings || Object.keys(d.mirror).length > 0) return;
    const maxRank = (root.JH && root.JH.MIRROR && root.JH.MIRROR.maxRank) || 3;
    for (const bid in BLESSING_TO_NODE) {
      const count = num(d.blessings[bid]);
      if (count > 0) d.mirror[BLESSING_TO_NODE[bid]] = { side: "a", rank: Math.min(count, maxRank) };
    }
  }

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
    d.elements.water = true;  // Water is always unlocked (Jon's own element).
    if (raw.mirror && typeof raw.mirror === "object") {
      for (const id in raw.mirror) {
        const n = raw.mirror[id];
        if (!n || typeof n !== "object") continue;
        d.mirror[id] = { side: n.side === "b" ? "b" : "a", rank: Math.max(0, num(n.rank) | 0) };
      }
    }
    migrateBlessings(d);
    d.churchVisited = !!raw.churchVisited;
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
    deathCorpseFrame,
    deathGhostState,
    deathScreenFadeAlpha,

    serialize() { return JSON.stringify(this.state); },

    // No save system yet — every run starts Church meta-progression fresh.
    // save() still writes localStorage so this can be re-wired once a real
    // save system lands; load() just doesn't read it back yet.
    load() {
      this.state = defaults();
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

    // Recompute effective stats from upgrades + Mirror, apply to the player,
    // and carry HP/water headroom up when a capacity rose. Shared by purchases.
    recarryStats(player) {
      const fresh = root.JH.Upgrades.computeStats(root.JH.Upgrades.owned);
      const hpGain = fresh.maxHp - player.stats.maxHp;
      const waterGain = fresh.maxWater - player.stats.maxWater;
      player.applyStats(fresh);
      if (hpGain > 0) player.hp = Math.min(fresh.maxHp, player.hp + hpGain);
      if (waterGain > 0) player.water = Math.min(fresh.maxWater, player.water + waterGain);
    },

    // ---- Elemental Mirror nodes (the altar) ----
    mirrorDef(id) { return (root.JH.MIRROR.nodes || []).find((n) => n.id === id); },
    mirrorRank(id) { return root.JH.Mirror.nodeState(this.state, id).rank; },
    mirrorSide(id) { return root.JH.Mirror.nodeState(this.state, id).side; },
    mirrorCost(id) { return root.JH.Mirror.cost(this.mirrorRank(id)); },
    mirrorMaxRank() { return root.JH.MIRROR.maxRank; },
    mirrorUnlocked(id) {
      const d = this.mirrorDef(id);
      return !!d && root.JH.Mirror.branchUnlocked(this.state, d.element);
    },
    canBuyMirror(id) {
      return root.JH.Mirror.canBuy(this.state, this.mirrorDef(id), root.JH.MIRROR.maxRank);
    },
    // Buy a rank on the node's active side; recompute + carry the player's stats.
    buyMirror(id, player) {
      if (!root.JH.Mirror.buy(this.state, this.mirrorDef(id), root.JH.MIRROR.maxRank)) return false;
      this.save();
      this.recarryStats(player);
      return true;
    },
    // Flip a node's active side (free); recompute stats (the active effect changed).
    toggleMirror(id, player) {
      const d = this.mirrorDef(id); if (!d) return;
      root.JH.Mirror.toggleSide(this.state, d);
      this.save();
      if (player) this.recarryStats(player);
    },

    // ---- The walkable Church of the Holy Hose ----------------------
    enterScene(game) {
      const JH = root.JH, L = JH.CHURCH.layout;
      const firstVisit = !this.state.churchVisited;
      this.state.churchVisited = true;
      JH.Music.setTrack("church");
      this.save();
      // Reset blessings each visit — no persistent save system yet.
      this.state.blessings = {};
      this.scene = {
        jonX: L.spawnX, jonY: JH.DEPTH_MAX * 0.5, facing: 1, walking: false, frame: 0, t: 0,
        firstVisit: firstVisit,
        intro: true, introT: 0,
        fatherShown: false, fatherT: 0, fatherSpawnX: 0,
        dialogue: null,
        activeStation: null,
        exiting: false, exitT: 0,
      };
    },

    updateScene(dt, game) {
      const sc = this.scene; if (!sc) return;
      const JH = root.JH, L = JH.CHURCH.layout, In = JH.Input;
      sc.t += dt;

      // Intro: backdrop fade-in then spirit descent. No input during this phase.
      if (sc.intro) {
        sc.introT += dt;
        if (sc.introT >= 2.9) sc.intro = false;
        return;
      }

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
          }
        }
        return;
      }

      // Free walk.
      const preX = sc.jonX;
      const sp = WALK_SPEED * dt;
      sc.walking = false;
      if (In.held("right")) { sc.jonX += sp; sc.facing = 1; sc.walking = true; }
      if (In.held("left"))  { sc.jonX -= sp; sc.facing = -1; sc.walking = true; }
      if (In.held("down"))  { sc.jonY += sp * 0.55; sc.walking = true; }
      if (In.held("up"))    { sc.jonY -= sp * 0.55; sc.walking = true; }
      sc.jonX = Math.max(12, Math.min(sc.jonX, L.length - 12));
      sc.jonY = Math.max(L.depthMin, Math.min(L.depthMax, sc.jonY));
      // Father Jon is a solid body once materialized — block walking through
      // his feet; step a little to either side (or up/down) to go around him.
      if (sc.fatherShown) {
        const dx = sc.jonX - sc.fatherSpawnX, dy = sc.jonY - sc.fatherY;
        const dist = Math.hypot(dx, dy);
        if (dist < FATHER_COLLIDE_R) {
          const ang = dist > 0.01 ? Math.atan2(dy, dx) : (preX >= sc.fatherSpawnX ? 0 : Math.PI);
          sc.jonX = sc.fatherSpawnX + Math.cos(ang) * FATHER_COLLIDE_R;
          sc.jonY = Math.max(L.depthMin, Math.min(L.depthMax, sc.fatherY + Math.sin(ang) * FATHER_COLLIDE_R));
        }
      }
      if (sc.walking) sc.frame += dt * 8;

      // Father Jon materializes once you pass the threshold, and speaks.
      if (!sc.fatherShown && sc.jonX >= L.fatherX) {
        sc.fatherShown = true; sc.fatherT = 0; sc.t = 0;
        sc.fatherSpawnX = sc.jonX + 70;
        sc.fatherY = Math.max(L.depthMin, Math.min(L.depthMax, fatherFootDepth(JH)));
        const lines = sc.firstVisit
          ? JH.CHURCH.sermon.first.slice()
          : [JH.CHURCH.sermon.repeat[(Math.random() * JH.CHURCH.sermon.repeat.length) | 0]];
        sc.dialogue = { lines: lines, idx: 0 };
        return;
      }

      // Mirror node stations: active when you stand near an UNLOCKED one.
      // E = buy a rank on the active side; Shift/L = flip the node's side.
      sc.activeStation = null;
      for (const st of L.stations) {
        if (!this.mirrorUnlocked(st.id)) continue;
        if (Math.abs(sc.jonX - st.x) <= L.stationRange) { sc.activeStation = st.id; break; }
      }
      if (sc.activeStation) {
        if (In.pressed("confirm")) {
          if (this.buyMirror(sc.activeStation, game.player)) game.audio.play("upgrade");
          else game.audio.play("hurt");
        } else if (In.pressed("dash")) {
          this.toggleMirror(sc.activeStation, game.player); game.audio.play("buy");
        }
      }

      // Portal: stand near it and press E to return (no accidental walk-into).
      // Gated behind !activeStation so a station's E-buy never doubles as exit.
      sc.nearPortal = sc.jonX >= L.portalX - L.portalReach;
      if (sc.nearPortal && !sc.activeStation && In.pressed("confirm")) {
        sc.exiting = true; sc.exitT = 0;
        game.audio.play("buy");
      }
    },

    renderScene(ctx, game) {
      const sc = this.scene; if (!sc) return;
      const JH = root.JH, L = JH.CHURCH.layout, PAL = JH.PAL, ART = JH.ChurchArt || {};
      const Geo = JH.Geo;
      const VW = JH.VIEW_W, VH = JH.VIEW_H, floorY = VH - 14;
      const jonScreenY = Geo ? Geo.feetScreenY(sc.jonY, 0) : floorY;
      const camX = Math.max(0, Math.min(sc.jonX - VW / 2, L.length - VW));
      ctx.font = "8px monospace"; ctx.textAlign = "center";

      // Backdrop — pans slower than the foreground (parallax) so the altar/
      // shrines/stations feel like they're set against a real back wall
      // rather than floating over a static poster. Image is scaled to fill
      // VH height; BD_PARALLAX of the camera's travel is applied to its x,
      // clamped so the image's edges are never exposed.
      const BD_PARALLAX = 0.35;
      const drawBackdrop = () => {
        const img = ART.backdrop;
        if (!(img && img._ready)) {
          ctx.fillStyle = "#0a0c14"; ctx.fillRect(0, 0, VW, VH);
          ctx.fillStyle = "#11141f"; ctx.fillRect(0, VH - 56, VW, 56);
          return;
        }
        const dw = Math.round(VH * (img.naturalWidth / img.naturalHeight));
        const maxPan = Math.max(0, dw - VW);
        const bx = -Math.max(0, Math.min(maxPan, camX * BD_PARALLAX));
        ctx.drawImage(img, Math.round(bx), 0, dw, VH);
      };

      // ---- Intro sequence: backdrop fades in, then spirit descends to spawn. ----
      if (sc.intro) {
        const it = sc.introT;
        const backdropAlpha = Math.min(1, it / 1.5);
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, VW, VH);
        ctx.save(); ctx.globalAlpha = backdropAlpha;
        drawBackdrop();
        ctx.restore();

        if (it > 1.2) {
          const ft = it - 1.2;
          const BEAM = 0.5, DRIFT = 1.2;
          const totalDrop = jonScreenY - (-60);
          let spiritY;
          if (ft <= BEAM) {
            // Fast beam in from above: quadratic ease-out
            const p = ft / BEAM;
            spiritY = -60 + totalDrop * 0.82 * (1 - (1 - p) * (1 - p));
          } else {
            // Slow drift to floor
            const p = Math.min(1, (ft - BEAM) / DRIFT);
            spiritY = -60 + totalDrop * 0.82 + totalDrop * 0.18 * p;
          }
          const sx = Math.round(sc.jonX - camX);
          ctx.save();
          ctx.globalAlpha = Math.min(1, ft / 0.12) * 0.82;
          ctx.filter = "sepia(1) hue-rotate(150deg) saturate(2.5) brightness(1.3)";
          JH.Assets.draw(ctx, "jon", sx, spiritY, 1, { state: "idle", frame: 0 });
          ctx.restore();
        }
        return;
      }

      // Backdrop.
      drawBackdrop();

      // Altar centerpiece + the four elemental shrines flanking it.
      const ax = Math.round(L.altarX - camX);
      blit(ctx, ART.altar, ax - 16, VH - 96, 32, 40, () => {});
      JH.CHURCH.shrines.forEach((s, i) => {
        const x = Math.round(L.altarX - 135 + i * 90 - camX);
        const lit = this.state.elements[s.element];
        blit(ctx, lit ? ART.shrineLit : ART.shrineDim, x - 10, 48, 20, 44, () => {});
      });

      // Mirror node stations: pedestal + bobbing icon, rank pips; node detail when
      // near. Only UNLOCKED branches render (earth appears once Quake is redeemed).
      const ELCOL = { water: PAL.water, earth: "#e0902f", fire: "#ff8a3c", air: "#cfe9ff" };
      const maxR = this.mirrorMaxRank();
      let nearStation = null;                  // captured, drawn after Jon/Father (stays on top)
      for (const st of L.stations) {
        if (!this.mirrorUnlocked(st.id)) continue;
        const def = this.mirrorDef(st.id); if (!def) continue;
        const x = Math.round(st.x - camX);
        const near = sc.activeStation === st.id;
        const bob = Math.sin(sc.t * 4 + st.x) * 2;
        const col = ELCOL[def.element] || PAL.water;
        blit(ctx, ART["station_" + st.id], x - 9, VH - 50, 18, 34, () => {
          ctx.fillStyle = "#11141f"; ctx.fillRect(x - 7, VH - 50, 14, 34);   // fallback plinth
        });
        if (near) {
          ctx.save(); ctx.globalAlpha = 0.35 + 0.25 * Math.sin(sc.t * 8);
          ctx.fillStyle = col; ctx.fillRect(x - 10, VH - 71 + bob, 20, 20); ctx.restore();
        }
        ctx.fillStyle = col; ctx.fillRect(x - 5, VH - 66 + bob, 10, 10);
        const rank = this.mirrorRank(st.id);
        for (let i = 0; i < maxR; i++) {                                     // rank pips
          ctx.fillStyle = i < rank ? col : "#33384a";
          ctx.fillRect(x - 7 + i * 5, VH - 52 + bob, 3, 3);
        }
        if (near) nearStation = { id: st.id, def, x, bob, rank };
      }

      // Portal at the end of the nave.
      const px = Math.round(L.portalX - camX);
      blit(ctx, ART.portal, px - 12, VH - 104, 24, 48, () => {});
      // "Press E" prompt when Jon is close enough to activate the portal.
      if (sc.nearPortal && !sc.exiting) {
        ctx.save();
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(sc.t * 6);
        ctx.fillStyle = "#9be8ff";
        ctx.font = "bold 8px monospace";
        ctx.fillText("PRESS E TO RETURN", px, VH - 112);
        ctx.restore();
      }

      // Ghost Jon — the real sprite, cyan-shifted and translucent.
      const sx = Math.round(sc.jonX - camX);
      const drawGhostJon = () => {
        const ghostAlpha = sc.exiting ? Math.max(0, 0.65 - sc.exitT) : 0.65;
        ctx.save();
        ctx.globalAlpha = ghostAlpha;
        ctx.filter = "sepia(1) hue-rotate(150deg) saturate(2.5) brightness(1.3)";
        JH.Assets.draw(ctx, "jon", sx, jonScreenY, sc.facing, { state: sc.walking ? "walk" : "idle", frame: sc.frame | 0 });
        ctx.restore();
      };

      // Father Jon: holy godray descends, then he manifests above the floor just ahead of Jon.
      const drawFatherJon = () => {
        if (!sc.fatherShown) return;
        const ft = sc.fatherT;
        const BEAM_DRP = 0.28, BEAM_FD = 0.35, FSTART = 0.18, FDUR = 0.45;
        const fx = Math.round(sc.fatherSpawnX - camX);
        const feetY = floorY - FATHER_LIFT;

        // Beam grows from y=0 down to feetY, then fades out.
        const beamProg = Math.min(1, ft / BEAM_DRP);
        const beamAlpha = ft < BEAM_DRP ? 0.82 : 0.82 * Math.max(0, 1 - (ft - BEAM_DRP) / BEAM_FD);
        if (beamAlpha > 0.01) {
          ctx.save(); ctx.globalAlpha = beamAlpha;
          ctx.fillStyle = "#ffd23f"; ctx.fillRect(fx - 10, 0, 20, feetY * beamProg);
          ctx.fillStyle = "#d6f6ff"; ctx.fillRect(fx - 4,  0,  8, feetY * beamProg);
          ctx.restore();
        }

        // Landing bloom at feetY when beam arrives.
        if (ft >= BEAM_DRP && ft < BEAM_DRP + 0.3) {
          const bloomA = 0.7 * (1 - (ft - BEAM_DRP) / 0.3);
          ctx.save(); ctx.globalAlpha = bloomA;
          ctx.fillStyle = "#fffce0"; ctx.fillRect(fx - 20, feetY - 4, 40, 10);
          ctx.restore();
        }

        // Father Jon fades in as beam lands.
        const a = ft < FSTART ? 0 : Math.min(1, (ft - FSTART) / FDUR);
        if (a > 0) {
          // Faint pulsing halo behind him — independent of the fade-in alpha
          // so it keeps breathing once he's fully manifest.
          const gy = feetY - FATHER_H * 0.55;
          ctx.save();
          ctx.globalAlpha = a * (0.3 + 0.18 * Math.sin(sc.t * 2.4));
          const glow = ctx.createRadialGradient(fx, gy, 2, fx, gy, FATHER_H * 0.85);
          glow.addColorStop(0, "#fff8d6");
          glow.addColorStop(1, "rgba(255,248,214,0)");
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(fx, gy, FATHER_H * 0.85, 0, Math.PI * 2); ctx.fill();
          ctx.restore();

          ctx.save(); ctx.globalAlpha = a;
          const npc = ART.fatherJonNpc;
          if (npc && npc._ready) {
            const scale = FATHER_H / npc.naturalHeight;
            const dw = Math.round(npc.naturalWidth * scale);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(npc, Math.round(fx - dw / 2), feetY - FATHER_H, dw, FATHER_H);
          } else {
            ctx.fillStyle = "#2a2440"; ctx.fillRect(fx - 8, feetY - 48, 16, 48);
            ctx.fillStyle = "#f1c08a"; ctx.fillRect(fx - 5, feetY - 54, 10, 8);
            ctx.fillStyle = "#d6f6ff"; ctx.fillRect(fx - 7, feetY - 61, 14, 8);
          }
          ctx.restore();
        }
      };

      // Depth-sort: whoever's further back (lower lane y) paints first, so
      // passing Father Jon doesn't always clip behind him.
      if (sc.fatherShown && sc.jonY > sc.fatherY) { drawFatherJon(); drawGhostJon(); }
      else { drawGhostJon(); drawFatherJon(); }

      // Pedestal detail text — drawn last so Jon/Father never paint over it.
      if (nearStation) {
        const { id, def, x, bob, rank } = nearStation;
        const side = def[this.mirrorSide(id)];
        ctx.fillStyle = "#ffe9a8"; ctx.fillText(side.name + " — " + side.desc, x, VH - 84 + bob);
        if (rank >= maxR) {
          ctx.fillStyle = "#9be8ff"; ctx.fillText("MAX  ·  Shift: flip side", x, VH - 74 + bob);
        } else {
          ctx.fillStyle = this.canBuyMirror(id) ? "#9be8ff" : "#a66";
          ctx.fillText(this.mirrorCost(id) + " Essence · E: raise · Shift: flip", x, VH - 74 + bob);
        }
      }

      // Holy Essence readout — always visible so the currency reads.
      ctx.textAlign = "right"; ctx.fillStyle = "#d6f6ff";
      ctx.fillText("✦ Essence of Friendship: " + this.state.essence, VW - 8, 14);

      // Father Jon's dialogue box.
      if (sc.dialogue) {
        ctx.fillStyle = "rgba(0,0,0,0.78)"; ctx.fillRect(0, VH - 58, VW, 58);
        // Mouth-flaps for the first 1.6s of each line, then settles closed.
        const talking = sc.t < 1.6;
        const mouthOpen = talking && (Math.floor(sc.t * 7) & 1);
        const portrait = (mouthOpen && ART.fatherJonPortraitOpen._ready)
          ? ART.fatherJonPortraitOpen : ART.fatherJonPortrait;
        blit(ctx, portrait, 8, VH - 56, 44, 50, () => {
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
