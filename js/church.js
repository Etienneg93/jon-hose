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
  // Element accent colors (water matches JH.PAL.water; literal so this module
  // stays loadable without config.js in tests).
  const ELCOL = { water: "#6cd3ff", earth: "#e0902f", fire: "#ff8a3c", air: "#cfe9ff" };
  // Locked-pillar nemesis: gateBoss -> Assets painter key (null = no painter
  // exists yet; draw a "?" instead).
  const NEMESIS_PAINTER = { quake: "quake", slayer: "slayer", assman: null };
  const NEMESIS_NAME = { quake: "QUAKE WALKER", slayer: "THE SLAYER", assman: "ASS MAN" };
  const ROMAN = ["I", "II", "III"];

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

  // Outlined fillText: the nave backdrop is busy, so free-floating text
  // draws a near-black rim (4 offsets) under the current fillStyle to stay
  // legible. Respects globalAlpha (outline fades with the text).
  function otext(ctx, str, x, y) {
    const col = ctx.fillStyle;
    ctx.fillStyle = "rgba(4,8,14,0.9)";
    ctx.fillText(str, x - 1, y); ctx.fillText(str, x + 1, y);
    ctx.fillText(str, x, y - 1); ctx.fillText(str, x, y + 1);
    ctx.fillStyle = col;
    ctx.fillText(str, x, y);
  }

  function wrapText(ctx, text, x, y, maxW, lh) {
    const words = text.split(" "); let line = "", yy = y;
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) { otext(ctx, line, x, yy); line = w; yy += lh; }
      else line = test;
    }
    if (line) otext(ctx, line, x, yy);
  }

  function defaults() {
    return {
      essence: 0,
      blessings: {},                                   // LEGACY id -> count (no longer applied)
      pillars: { water: 0, earth: 0, fire: 0, air: 0 }, // element -> rank (0..3)
      elements: { earth: false, fire: false, air: false, water: true }, // water: Jon's own, open
      churchVisited: false,
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
    d.elements.water = true;  // Water is always unlocked (Jon's own element).
    if (raw.pillars && typeof raw.pillars === "object") {
      ELEMENTS.forEach((e) => {
        d.pillars[e] = Math.max(0, Math.min(3, num(raw.pillars[e]) | 0));
      });
    }
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

    // Boss defeated/redeemed: light its element shrine if mapped. Essence
    // itself now arrives only via the cross pickup game.js spawns on kill.
    markBossDefeated(type) {
      const JH = root.JH;
      const sh = JH && JH.CHURCH && JH.CHURCH.shrines.find((s) => s.boss === type);
      if (sh) this.state.elements[sh.element] = true;
      this.save();
    },

    blessingCount(id) { return this.state.blessings[id] || 0; },
    blessingCost(id) { return root.JH.Balance.blessingCost(this.blessingCount(id)); },
    canBuyBlessing(id) { return this.state.essence >= this.blessingCost(id); },

    // Recompute effective stats from upgrades + pillars, apply to the player,
    // and carry HP/water headroom up when a capacity rose. Shared by purchases.
    recarryStats(player) {
      const fresh = root.JH.Upgrades.computeStats(root.JH.Upgrades.owned);
      const hpGain = fresh.maxHp - player.stats.maxHp;
      const waterGain = fresh.maxWater - player.stats.maxWater;
      player.applyStats(fresh);
      if (hpGain > 0) player.hp = Math.min(fresh.maxHp, player.hp + hpGain);
      if (waterGain > 0) player.water = Math.min(fresh.maxWater, player.water + waterGain);
    },

    // ---- The four element pillars ----
    pillarDef(element) {
      return (root.JH.PILLARS.defs || []).find((d) => d.element === element);
    },
    pillarUnlocked(element) {
      const d = this.pillarDef(element);
      return !!d && root.JH.Pillars.unlocked(this.state, d);
    },
    // Buy one rank; recompute + carry the player's stats. Returns success.
    buyPillar(element, player) {
      const d = this.pillarDef(element);
      if (!d || !root.JH.Pillars.buy(this.state, d)) return false;
      this.save();
      this.recarryStats(player);
      return true;
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
        // Pillar-buy juice: ring burst + staggered pip refill + rising text.
        ringFx: null,                   // { x, color, t }
        pipAnim: null,                  // { element, t } — pips refill staggered
        buyFloat: null,                 // { text, x, color, t } — rises + fades
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

      // Pillar-buy juice timers (run even while dialogue is up).
      if (sc.ringFx && (sc.ringFx.t += dt) > 0.5) sc.ringFx = null;
      if (sc.pipAnim && (sc.pipAnim.t += dt) > 0.6) sc.pipAnim = null;
      if (sc.buyFloat && (sc.buyFloat.t += dt) > 0.9) sc.buyFloat = null;

      // Exit transition: fade out, then warp back into the world.
      if (sc.exiting) {
        sc.exitT += dt;
        if (sc.exitT >= EXIT_FADE) { this.scene = null; game.respawnFromChurch(); }
        return;
      }

      // Father Jon's dialogue gates movement until he finishes.
      if (sc.dialogue) {
        // The pity voucher pops into being on the line where he offers it.
        if (sc.pityLineIdx != null && sc.dialogue.idx >= sc.pityLineIdx) {
          sc.pityLineIdx = null;
          sc.pityVoucher = { x: sc.fatherSpawnX - 32, y: sc.fatherY };
          game.audio.play("buy");
        }
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
        if (this.pendingPity) {
          this.pendingPity = false;
          // Voucher beat comes AFTER the sermon proper — and the ticket only
          // materializes on the line where he offers it (see dialogue gate).
          lines.push(
            "One more thing, child. The vendor on that street — an old friend of this parish. He appears wherever the faithful struggle.",
            "Present him this voucher: half off his next ware. You are a member of this church now."
          );
          sc.pityLineIdx = lines.length - 1;
        }
        sc.dialogue = { lines: lines, idx: 0 };
        return;
      }

      // Father Jon's pity voucher: walk over it to collect — 50% off the
      // next shop purchase (game.voucher50, consumed by priceOf's buyer).
      if (sc.pityVoucher &&
          Math.hypot(sc.jonX - sc.pityVoucher.x, sc.jonY - sc.pityVoucher.y) < 14) {
        game.voucher50 = true;
        game.audio.play("upgrade");
        sc.buyFloat = { text: "+50% SHOP VOUCHER", x: sc.pityVoucher.x, color: "#6cd3ff", t: 0 };
        sc.pityVoucher = null;
      }

      // Reliquary: benedictions washed away by death wait here; E redeems
      // ALL of them at once for an escalating Essence cost (1, 2, 3… per run).
      const B = root.JH.Benedictions;
      sc.nearReliquary = !!(B && B.washedCount() > 0 &&
        Math.abs(sc.jonX - L.reliquaryX) <= L.stationRange);
      if (sc.nearReliquary && In.pressed("confirm")) {
        const cost = B.redeemAllCost();
        if (this.state.essence >= cost) {
          this.state.essence -= cost; this.save();
          const n = B.redeemAll();
          game.audio.play("bell");
          sc.ringFx = { x: L.reliquaryX, color: "#ffd23f", t: 0 };
          sc.buyFloat = { text: "+" + n + " BENEDICTION" + (n === 1 ? "" : "S"), x: L.reliquaryX, color: "#ffd23f", t: 0 };
        } else {
          game.audio.play("hurt");   // can't afford
        }
      }

      // Pillar stations: active when near ANY pillar (locked ones still show
      // their info; E only buys on unlocked ones).
      sc.activeStation = null;
      for (const st of L.stations) {
        if (Math.abs(sc.jonX - st.x) <= L.stationRange) { sc.activeStation = st.pillar; break; }
      }
      if (sc.activeStation && In.pressed("confirm") && this.pillarUnlocked(sc.activeStation)) {
        const el = sc.activeStation;
        if (this.buyPillar(el, game.player)) {
          game.audio.play("bell");
          const st = L.stations.find((s) => s.pillar === el);
          const col = ELCOL[el] || "#9be8ff";
          const rank = root.JH.Pillars.rank(this.state, el);
          sc.ringFx = { x: st.x, color: col, t: 0 };
          sc.pipAnim = { element: el, t: 0 };
          sc.buyFloat = { text: "+RANK " + (ROMAN[rank - 1] || rank), x: st.x, color: col, t: 0 };
        } else {
          game.audio.play("hurt");   // can't afford / already MAX
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

      // The four element pillars: tall columns along the nave. Unlocked ones
      // carry a glowing element core + rank pips; locked ones stand dark with
      // their nemesis silhouette. Detail text when near (drawn after Jon).
      let nearStation = null;                  // captured, drawn after Jon/Father (stays on top)
      for (const st of L.stations) {
        const def = this.pillarDef(st.pillar); if (!def) continue;
        const unlocked = this.pillarUnlocked(st.pillar);
        const x = Math.round(st.x - camX);
        const near = sc.activeStation === st.pillar;
        const col = ELCOL[st.pillar] || PAL.water;
        const baseY = VH - 18, topY = VH - 82;                  // shaft footprint
        // Base + capital + shaft.
        ctx.fillStyle = unlocked ? "#1c2130" : "#0d0f16";
        ctx.fillRect(x - 8, baseY, 16, 4);                      // base slab
        ctx.fillRect(x - 8, topY - 4, 16, 4);                   // capital
        ctx.fillRect(x - 6, topY, 12, baseY - topY);            // shaft
        if (unlocked) {
          // Element core: a lit stripe up the shaft, breathing; brighter near.
          ctx.save();
          ctx.globalAlpha = (near ? 0.75 : 0.5) + 0.2 * Math.sin(sc.t * 3 + st.x);
          ctx.fillStyle = col;
          ctx.fillRect(x - 2, topY + 3, 4, baseY - topY - 6);
          ctx.restore();
          ctx.fillStyle = col; ctx.fillRect(x - 6, topY - 2, 12, 2);  // capital trim
          // Element icon set into the top of the shaft (silent until loaded).
          JH.Assets.icon(ctx, "el_" + st.pillar, x, topY + 12, 1);
        } else {
          // Nemesis silhouette over the dark column — someone's missing here.
          const painter = NEMESIS_PAINTER[def.gateBoss];
          ctx.save(); ctx.globalAlpha = 0.35;
          if (painter && JH.Assets.has(painter)) {
            // Shrink via a ctx transform: opt.scale only reaches procedural
            // fallback painters — the atlas/fixed-height paths blit at native
            // size and ignore it. Draw at local (0,0) so the translate
            // anchors the feet at the column base.
            ctx.translate(x, baseY); ctx.scale(0.55, 0.55);
            JH.Assets.draw(ctx, painter, 0, 0, 1, { state: "idle", t: sc.t, frame: 0 });
          } else {
            ctx.fillStyle = "#3a4055"; ctx.font = "bold 22px monospace";
            ctx.fillText("?", x, baseY - 22);
            ctx.font = "8px monospace";
          }
          ctx.restore();
          ctx.save(); ctx.globalAlpha = near ? 0.9 : 0.4;
          ctx.fillStyle = "#8a93ad";
          otext(ctx, "SEALED", x, topY - 8);
          ctx.restore();
        }
        // Rank pips under the column (staggered refill for 0.4s after a buy).
        const rank = root.JH.Pillars.rank(this.state, st.pillar);
        const maxR = def.maxRank || 3;
        const anim = sc.pipAnim && sc.pipAnim.element === st.pillar ? sc.pipAnim : null;
        for (let i = 0; i < maxR; i++) {
          let filled = i < rank, flash = false;
          if (anim && filled) {
            const fillAt = (i + 1) * (0.4 / maxR);
            filled = anim.t >= fillAt;
            flash = filled && anim.t < fillAt + 0.15;
          }
          ctx.fillStyle = flash ? "#ffffff" : (filled ? col : "#33384a");
          ctx.fillRect(x - 8 + i * 6, baseY + 6, 4, 4);
        }
        if (near) nearStation = { pillar: st.pillar, def, x, unlocked, rank, maxR };
      }

      // Reliquary: a low chest on the nave floor. Washed benedictions hover
      // above it as gold motes; empty, it sits dark and quiet.
      {
        const B = root.JH.Benedictions;
        const nWashed = B ? B.washedCount() : 0;
        const rx = Math.round(L.reliquaryX - camX);
        const ry = VH - 20;
        ctx.fillStyle = "#1c2130"; ctx.fillRect(rx - 10, ry - 8, 20, 8);   // chest body
        ctx.fillStyle = nWashed ? "#ffd23f" : "#33384a";
        ctx.fillRect(rx - 10, ry - 10, 20, 2);                             // lid trim
        if (nWashed > 0) {
          ctx.save();
          for (let i = 0; i < Math.min(nWashed, 5); i++) {
            const bob = Math.sin(sc.t * 2.2 + i * 1.7);
            ctx.globalAlpha = 0.55 + 0.35 * Math.sin(sc.t * 3 + i * 2.1);
            ctx.fillStyle = "#ffe9a8";
            ctx.fillRect(rx - 8 + i * 4, ry - 18 - i * 3 + bob * 2, 2, 2);
          }
          ctx.restore();
        }
      }

      // Father Jon's pity voucher: a little bobbing ticket beside him.
      if (sc.pityVoucher) {
        const cx = Math.round(sc.pityVoucher.x - camX);
        const cy = Geo ? Geo.feetScreenY(sc.pityVoucher.y, 0) : floorY;
        const bob = Math.sin(sc.t * 3) * 2;
        JH.Assets.shadow(ctx, cx, cy, 5);
        ctx.save();
        ctx.translate(cx, cy - 10 + bob);
        ctx.rotate(-0.12);
        ctx.fillStyle = "#f5ead2"; ctx.fillRect(-8, -5, 16, 10);   // ticket paper
        ctx.fillStyle = "#6cd3ff"; ctx.fillRect(-8, -5, 2, 10);    // stub edge
        ctx.fillStyle = "#2a3346";
        ctx.font = "bold 5px monospace"; ctx.textAlign = "center";
        ctx.fillText("50%", 1, 2);
        ctx.restore();
      }

      // Pillar-buy ring burst: an expanding element-color ring at the station.
      if (sc.ringFx) {
        const k = sc.ringFx.t / 0.5;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.strokeStyle = sc.ringFx.color; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(Math.round(sc.ringFx.x - camX), VH - 50, 4 + k * 30, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Portal at the end of the nave.
      const px = Math.round(L.portalX - camX);
      // Animated blue return portal (sprites/fx/portal), scene timer drives it.
      JH.Assets.drawFx(ctx, "portal", px, VH - 56, sc.t, { scale: 1.5 });
      // "Press E" prompt when Jon is close enough to activate the portal.
      if (sc.nearPortal && !sc.exiting) {
        ctx.save();
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(sc.t * 6);
        ctx.fillStyle = "#9be8ff";
        ctx.font = "bold 8px monospace";
        otext(ctx, "PRESS E TO RETURN", px, VH - 112);
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

      // Pillar detail text — drawn last so Jon/Father never paint over it.
      if (nearStation) {
        const { pillar, def, x, unlocked, rank, maxR } = nearStation;
        if (!unlocked) {
          ctx.fillStyle = "#8a93ad";
          otext(ctx, "SEALED — " + (NEMESIS_NAME[def.gateBoss] || "???"), x, VH - 104);
          ctx.fillStyle = "#5a6178";
          otext(ctx, "Redeem thy nemesis to open this pillar.", x, VH - 94);
        } else {
          ctx.fillStyle = "#ffe9a8";
          otext(ctx, def.name + (rank > 0 ? " " + (ROMAN[rank - 1] || rank) : ""), x, VH - 114);
          ctx.fillStyle = "#c8d2e8";
          wrapText(ctx, def.desc, x, VH - 104, 190, 10);
          if (rank >= maxR) {
            ctx.fillStyle = "#9be8ff"; otext(ctx, "MAX", x, VH - 84);
          } else {
            ctx.fillStyle = root.JH.Pillars.canBuy(this.state, def) ? "#9be8ff" : "#a66";
            otext(ctx, root.JH.Pillars.cost(rank) + " Essence · E: raise", x, VH - 84);
          }
        }
      }

      // Reliquary detail text when near (and holding washed boons).
      if (sc.nearReliquary) {
        const B = root.JH.Benedictions;
        const nWashed = B.washedCount();
        const cost = B.redeemAllCost();
        const rx = Math.round(L.reliquaryX - camX);
        ctx.fillStyle = "#ffe9a8";
        otext(ctx, "RELIQUARY — " + nWashed + " washed benediction" + (nWashed === 1 ? "" : "s"), rx, VH - 114);
        ctx.fillStyle = this.state.essence >= cost ? "#9be8ff" : "#a66";
        otext(ctx, cost + " Essence · E: redeem all", rx, VH - 94);
      }

      // Rising "+RANK" float after a buy (church draws its own overlays).
      if (sc.buyFloat) {
        const bf = sc.buyFloat;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - bf.t / 0.9);
        ctx.fillStyle = bf.color; ctx.font = "bold 8px monospace";
        // Starts above the station detail block (top row VH-114) so the rise
        // never ghosts through the text underneath it.
        otext(ctx, bf.text, Math.round(bf.x - camX), VH - 122 - bf.t * 22);
        ctx.restore();
        ctx.font = "8px monospace";
      }

      // Holy Essence readout — always visible so the currency reads.
      // Baked cross icon before the text ("✦" prefix until it loads).
      ctx.textAlign = "right"; ctx.fillStyle = "#d6f6ff";
      const etxt = "Holy Essence: " + this.state.essence;
      const eicon = JH.Assets.icon(ctx, "essence", VW - 14 - ctx.measureText(etxt).width, 10, 1);
      otext(ctx, (eicon ? "" : "✦ ") + etxt, VW - 8, 14);

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
