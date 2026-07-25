/* =====================================================================
   airentry.js — JH.AirEntry: the Air World arrival set-piece.
   A scripted in-world beat dispatched from game.js during state "play":
   while `game.airEntry` is non-null it owns play input/logic (same idiom
   as game.arrival). It holds its own two actors and never touches the
   Player/enemy/wave systems. All tunables come from JH.AIRENTRY.
   Coordinate model: world x/y like every other actor; actor x offsets in
   config are relative to the hydrant, +x toward the next wave trigger.
   ===================================================================== */
(function (root) {
  "use strict";
  const JH = root.JH;

  // Scripted phases in order. Everything before "release" consumes time from
  // JH.AIRENTRY.phases; "release" is the terminal state and has no duration.
  const ORDER = ["notice", "desecrate", "rage", "reveal", "feud", "depart", "release"];

  // PLACEHOLDER bark lines pending the user's writing pass (same convention
  // as drawAssManCutscene's placeholder dialogue in game.js). One line per
  // actor per phase, keyed by phase then speaker.
  const BARKS = {
    rage: { player: "NOT THE HYDRANT!" },
    feud: { stranger: "MY SKY NOW.", player: "NOT ON MY WATCH." },
  };

  const AirEntry = {
    ORDER,

    // Total scripted seconds (every phase except the terminal "release").
    totalDur(C) {
      let sum = 0;
      for (let i = 0; i < ORDER.length - 1; i++) sum += C.phases[ORDER[i]];
      return sum;
    },

    // Phase name at elapsed time t. Clamps to "release" past the end.
    phaseAt(C, t) {
      let acc = 0;
      for (let i = 0; i < ORDER.length - 1; i++) {
        acc += C.phases[ORDER[i]];
        if (t < acc) return ORDER[i];
      }
      return "release";
    },

    // Quadratic curve for the leash cord between the stranger's hand and the
    // dog's collar. Sags C.leashSag below the straight hand-collar line at
    // rest, easing linearly to 0 as the hand-to-collar distance reaches
    // C.leashTautLen; clamped so it never sags upward past taut.
    leashCurve(C, handX, handY, collarX, collarY) {
      const dx = collarX - handX, dy = collarY - handY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const slack = Math.max(0, 1 - dist / C.leashTautLen);
      return {
        x0: handX, y0: handY,
        cx: (handX + collarX) / 2,
        cy: (handY + collarY) / 2 + C.leashSag * slack,
        x1: collarX, y1: collarY,
      };
    },

    // Start the scene. Requires an explicit arm from enterAirAct(): dev warps
    // and Church returns turn Background.airOn on without arriving, and must
    // not trigger the beat.
    enter(game) {
      if (game.airEntryArmed !== true || game.airEntry) return;
      const C = JH.AIRENTRY;
      const hydrantX = JH.HYDRANTS[JH.HYDRANTS.length - 1].x;
      const self = this;
      const stranger = {
        x: hydrantX + C.strangerDX, y: C.actorY, facing: -1,
        state: "idle", frame: 0, z: 0,
        draw(ctx, cam) {
          JH.Assets.draw(ctx, self._strangerKey(game), this.x - cam,
            JH.Geo.feetScreenY(this.y, this.z), this.facing,
            { state: this.state, frame: this.frame });
          // He holds the leash through notice/desecrate/rage; reveal onward
          // he's let go to tear the hoodie open, and it never shows carried.
          const sc = game.airEntry;
          const held = sc && (sc.phase === "notice" || sc.phase === "desecrate" || sc.phase === "rage");
          if (held && !dog.held) self._drawLeash(ctx, cam, this, dog);
        },
      };
      const dog = {
        x: hydrantX + C.dogStartDX, y: C.actorY, facing: 1,
        state: "idle", frame: 0, z: 0, held: false,
        draw(ctx, cam) {
          JH.Assets.draw(ctx, "collie", this.x - cam,
            JH.Geo.feetScreenY(this.y, this.z), this.facing,
            { state: this.state, frame: this.frame });
        },
      };
      game.airEntry = {
        t: 0, phase: "notice", hydrantX,
        stranger, dog, flashT: 0, flashColor: null, revealed: false,
        hoodieProp: null, stormRing: null,
        windParticles: [], windSpawnT: 0, windSpawnedCount: 0,
      };
    },

    // "assmanPlain" until the rip completes, then the baked hero art.
    _strangerKey(game) {
      const sc = game.airEntry;
      return (sc && sc.revealed) ? "assman" : "assmanPlain";
    },

    // Cord from the stranger's hand to the dog's collar. Drawn after his
    // sprite so it sits over his hand; dark 2px underlay + 1px lighter core
    // (same two-pass idiom as the rest of the codebase's thin lines) so it
    // reads against the pale cloud deck.
    _drawLeash(ctx, cam, stranger, dog) {
      const C = JH.AIRENTRY;
      const handX = (stranger.x - cam) + C.leashHandDX * stranger.facing;
      const handY = JH.Geo.feetScreenY(stranger.y, stranger.z) + C.leashHandDY;
      const collarX = dog.x - cam;
      const collarY = JH.Geo.feetScreenY(dog.y, dog.z) + C.leashCollarDY;
      const curve = this.leashCurve(C, handX, handY, collarX, collarY);
      ctx.save();
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(curve.x0, curve.y0);
      ctx.quadraticCurveTo(curve.cx, curve.cy, curve.x1, curve.y1);
      ctx.strokeStyle = "#241a12"; ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(curve.x0, curve.y0);
      ctx.quadraticCurveTo(curve.cx, curve.cy, curve.x1, curve.y1);
      ctx.strokeStyle = "#c9a874"; ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    },

    actors(game) {
      const sc = game.airEntry;
      return sc ? [sc.stranger, sc.dog] : [];
    },

    // Scene-level fx: full-screen washes, then every world-space prop, then
    // bark text on top. Called once per frame after the world/actor passes.
    drawOverlay(ctx, game) {
      const sc = game.airEntry;
      if (!sc) return;
      const C = JH.AIRENTRY;

      // Rage red wash + reveal white wash. Both share flashT/flashColor
      // (armed in update()) so one timer drives either colour; alpha eases
      // from the configured peak to 0 over flashDur. Screen-space — not
      // translated by camera shake (same convention as game.js's essence-dim
      // veil).
      if (sc.flashT > 0) {
        const peak = sc.flashColor === "reveal" ? C.flashWhitePeak : C.flashRedPeak;
        ctx.save();
        ctx.globalAlpha = peak * (sc.flashT / C.flashDur);
        ctx.fillStyle = sc.flashColor === "reveal" ? "#ffffff" : "#ff2020";
        ctx.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H);
        ctx.restore();
      }

      const cam = JH.Camera.x;

      // Storm ring: expanding, fading ellipse centred on where the stranger
      // stood at reveal. Cosmetic only — no hit test, unlike game.js's other
      // rings (pulseRings/sermonWaves), whose drawn rim doubles as a hitbox.
      if (sc.stormRing) {
        const ring = sc.stormRing;
        const k = ring.t / C.stormRingDur;
        const sx = ring.cx - cam, sy = JH.Geo.feetScreenY(ring.cy, 0);
        ctx.save();
        ctx.globalAlpha = C.stormRingAlpha * Math.max(0, 1 - k);
        ctx.strokeStyle = "#cfe0ff";
        ctx.lineWidth = C.stormRingWidth;
        ctx.beginPath();
        ctx.ellipse(sx, sy, C.stormRingMaxR * k, C.stormRingMaxR * k * JH.GROUND_RY, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Tumbling hoodie scrap: uniform square, rotation only (non-uniform
      // scale is the blit-distortion bug fixed in f145c3d — never repeat it).
      if (sc.hoodieProp) {
        const hp = sc.hoodieProp;
        const sx = hp.x - cam, sy = JH.Geo.feetScreenY(hp.y, hp.z);
        const s = C.hoodieSize;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - hp.t / C.hoodieLife);
        ctx.translate(Math.round(sx), Math.round(sy));
        ctx.rotate(hp.rot);
        ctx.fillStyle = "#3a4a66";
        ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.restore();
      }

      // Wind gust: a handful of streak particles trailing the exit.
      for (const p of sc.windParticles) {
        const sx = p.x - cam, sy = JH.Geo.feetScreenY(p.y, p.z);
        const dir = Math.sign(p.vx) || -1;
        ctx.save();
        ctx.globalAlpha = C.windGustAlpha * Math.max(0, 1 - p.t / C.windGustLife);
        ctx.strokeStyle = "#eaf4ff";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - dir * C.windGustStreakLen, sy);
        ctx.stroke();
        ctx.restore();
      }

      this._drawBarks(ctx, cam, sc, game);
    },

    // PLACEHOLDER bark lines (see BARKS above) drawn above the speaking
    // actor. Same readable-label idiom as the HUD's "E  SHOP" prompt and
    // hold-timer readout in game.js: dark 1px drop-shadow, gold fill on top.
    _drawBarks(ctx, cam, sc, game) {
      const set = BARKS[sc.phase];
      if (!set) return;
      if (set.stranger) this._drawBark(ctx, cam, sc.stranger, set.stranger);
      if (set.player && game.player) this._drawBark(ctx, cam, game.player, set.player);
    },

    _drawBark(ctx, cam, actor, text) {
      const C = JH.AIRENTRY;
      const sx = Math.round(actor.x - cam);
      const sy = Math.round(JH.Geo.feetScreenY(actor.y, actor.z) + C.barkDY);
      ctx.save();
      ctx.font = "bold 6px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#0a0e18";
      ctx.fillText(text, sx + 1, sy + 1);
      ctx.fillStyle = "#ffd23f";
      ctx.fillText(text, sx, sy);
      ctx.restore();
    },

    // Jump straight to the end state. Reachable from any phase.
    skip(game) {
      if (game.airEntry) this._finish(game);
    },

    _finish(game) {
      game.airEntry = null;
      game.airEntryArmed = false;
    },

    update(dt, game) {
      const sc = game.airEntry;
      if (!sc) return;
      const C = JH.AIRENTRY;

      // Confirm skips the whole beat; consume it so it can't leak into play.
      if (game.input && game.input.buffered("confirm")) {
        game.input.consume("confirm");
        this.skip(game);
        return;
      }

      sc.t += dt;
      sc.phase = this.phaseAt(C, sc.t);
      if (sc.flashT > 0) sc.flashT = Math.max(0, sc.flashT - dt);
      const el = this._phaseElapsed(C, sc.t, sc.phase);
      const st = sc.stranger, dog = sc.dog;

      if (sc.phase === "desecrate") {
        // Trot to the hydrant, then lift. Motion is translation only.
        const targetX = sc.hydrantX + C.dogLiftDX;
        if (dog.x < targetX) {
          dog.x = Math.min(targetX, dog.x + C.dogTrotSpeed * dt);
          dog.state = "trot";
          dog.frame = Math.floor(el / C.dogFrameStep) % C.dogTrotFrames;
        } else {
          dog.state = "lift";
        }
        st.facing = 1;   // holds right through desecrate/rage; reveal flips it to -1
      } else if (sc.phase === "rage") {
        dog.state = "idle";
        if (game.player) game.player.facing = 1;
        if (el < dt) { sc.flashT = C.flashDur; sc.flashColor = "rage"; }   // one red flash on entry
      } else if (sc.phase === "reveal") {
        st.facing = -1;
        st.state = "rip";
        st.frame = Math.min(2, Math.floor(el / C.ripFrameStep));
        if (st.frame >= 2 && !sc.revealed) {
          sc.revealed = true;
          sc.flashT = C.flashDur; sc.flashColor = "reveal";
          // Hoodie scrap tumbles off opposite his facing (away from Jon);
          // storm ring centres on where he's standing at this instant.
          sc.hoodieProp = {
            x: st.x, y: st.y, z: C.hoodieSpawnZ,
            vx: -st.facing * C.hoodieOutSpeed, vz: C.hoodiePopSpeed,
            rot: 0, rotSpeed: C.hoodieRotSpeed, t: 0,
          };
          sc.stormRing = { cx: st.x, cy: st.y, t: 0 };
          if (game.shake) game.shake(C.revealShakeMag);
        }
      } else if (sc.phase === "feud") {
        st.state = "idle";
      } else if (sc.phase === "depart") {
        const riseT = C.phases.depart * C.departRiseFrac;
        if (el < riseT) {
          // facing unchanged here (still -1 from reveal/feud).
          st.state = "riseup";
          st.z += C.riseSpeed * dt;
        } else {
          // Turns downrange before soaring: facing must match travel or he
          // flies backwards.
          st.state = "soar";
          st.facing = 1;
          st.z += C.riseSpeed * C.soarRiseFrac * dt;
          st.x += C.soarSpeed * dt;
        }
        // Carried under the free arm — riseup leaves the left arm down and
        // soar tucks it to the chest, so the offset reads as held in both.
        // Picked from st.state (not elapsed time) so a retuned riseT still
        // matches whichever pose is actually on screen this frame.
        dog.held = true;
        dog.state = "idle";
        dog.x = st.x + C.dogCarryDX;
        dog.z = st.z - (st.state === "soar" ? C.dogCarrySoarDY : C.dogCarryDY);
        // Wind gust: windGustCount streaks spread evenly across depart's
        // duration, spawned at his current position and trailing behind.
        sc.windSpawnT += dt;
        const windInterval = C.phases.depart / C.windGustCount;
        if (sc.windSpawnT >= windInterval && sc.windSpawnedCount < C.windGustCount) {
          sc.windSpawnT -= windInterval;
          sc.windSpawnedCount++;
          sc.windParticles.push({
            x: st.x, y: st.y + (Math.random() - 0.5) * C.windGustSpread,
            z: st.z + (Math.random() - 0.5) * C.windGustSpread,
            vx: -st.facing * C.windGustSpeed, t: 0,
          });
        }
      }

      // Reveal/depart cosmetic props: ticked every frame regardless of phase
      // so a prop spawned in one phase keeps animating into the next.
      if (sc.hoodieProp) {
        const hp = sc.hoodieProp;
        hp.t += dt;
        hp.vz -= C.hoodieGrav * dt;
        hp.x += hp.vx * dt;
        hp.z = Math.max(0, hp.z + hp.vz * dt);
        hp.rot += hp.rotSpeed * dt;
        if (hp.t >= C.hoodieLife) sc.hoodieProp = null;
      }
      if (sc.stormRing) {
        sc.stormRing.t += dt;
        if (sc.stormRing.t >= C.stormRingDur) sc.stormRing = null;
      }
      if (sc.windParticles.length) {
        for (const p of sc.windParticles) { p.t += dt; p.x += p.vx * dt; }
        sc.windParticles = sc.windParticles.filter((p) => p.t < C.windGustLife);
      }

      if (sc.phase === "release") this._finish(game);
    },

    // Seconds elapsed inside the current phase.
    _phaseElapsed(C, t, phase) {
      let acc = 0;
      for (let i = 0; i < ORDER.length - 1; i++) {
        if (ORDER[i] === phase) return t - acc;
        acc += C.phases[ORDER[i]];
      }
      return 0;
    },
  };

  root.JH = root.JH || {};
  root.JH.AirEntry = AirEntry;
  if (typeof module !== "undefined" && module.exports) module.exports = AirEntry;
})(typeof window !== "undefined" ? window : globalThis);
