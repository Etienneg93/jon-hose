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

  // PLACEHOLDER dialogue pending the user's writing pass (same convention as
  // drawAssManCutscene's placeholder lines in game.js).
  //
  // ALL speech in this beat is codec dialogue — there is no in-world text.
  // A phase may hold SEVERAL beats, played in order across equal slices of the
  // phase's duration, which is how `feud` reads as a back-and-forth. `who`
  // selects a portrait accessor; the Ass Man wardrobe tracks what the player
  // can currently see (casual before the reveal, costumed after).
  const CODEC = {
    notice:    [{ who: "assmanCasual", name: "???",     lines: ["Nice day for it.", "Go on, Mario."] }],
    desecrate: [{ who: "mario",        name: "MARIO",   lines: ["BARK BARK"] }],
    rage:      [{ who: "jon",          name: "JON",     lines: ["NOT THE HYDRANT!"] }],
    feud:      [{ who: "assman",       name: "ASS MAN", lines: ["These skies are mine,", "hose boy."] },
                { who: "jon",          name: "JON",     lines: ["NOT ON MY WATCH."] }],
  };

  const PORTRAIT_FN = {
    assman:       (m) => JH.getAssManPortrait && JH.getAssManPortrait(m),
    assmanCasual: (m) => JH.getAssManCasualPortrait && JH.getAssManCasualPortrait(m),
    mario:        (m) => JH.getMarioPortrait && JH.getMarioPortrait(m),
    jon:          (m) => JH.getJonPortrait && JH.getJonPortrait(m),
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
        codecIdx: 0, codecT: 0,   // dialogue cursor + hold timer (player-paced)
        actedPhase: null,         // last phase whose ACTION has begun (see update)
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

      this._drawVignette(ctx, C);
      this.drawCodec(ctx, game);   // last: the box sits over the fx and barks
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

      const confirmed = !!(game.input && game.input.buffered("confirm"));
      if (confirmed) game.input.consume("confirm");   // never leaks into resumed play

      // Dialogue GATES the clock. A phase plays its codec lines first — one at
      // a time, each waiting on confirm, exactly like the Quake/Slayer/Ass Man
      // boxes — and only then runs its staged action. The scene clock is frozen
      // meanwhile, so a line can never be missed or race the choreography, and
      // confirm advances one line rather than skipping the beat.
      const beats = CODEC[sc.phase];
      if (beats && (sc.codecIdx || 0) < beats.length) {
        sc.codecT = (sc.codecT || 0) + dt;           // drives the mouth flap
        if (confirmed && sc.codecT >= C.codecMinHold) {
          sc.codecIdx = (sc.codecIdx || 0) + 1;
          sc.codecT = 0;
        }
        return;                                       // clock and staging held
      }

      sc.t += dt;
      const nextPhase = this.phaseAt(C, sc.t);
      if (nextPhase !== sc.phase) {
        // Crossing into a phase resets its dialogue cursor and yields, so the
        // new phase's lines play BEFORE its action. Resetting here (rather than
        // at the top of the next frame) is load-bearing: sc.phase is assigned
        // in this half, so a top-of-frame comparison would always find them
        // equal and silently skip that phase's dialogue.
        sc.phase = nextPhase;
        sc.codecIdx = 0;
        sc.codecT = 0;
        // Yield ONLY if the new phase actually speaks. Returning
        // unconditionally would stall a frame on every silent transition —
        // including the terminal `release`, which must finish the scene the
        // moment it is reached rather than lingering a frame as a live phase.
        if (CODEC[nextPhase]) return;
      }
      // Jon holds the outrage pose from the desecration through the face-off.
      sc.playerShock = (sc.phase === "rage" || sc.phase === "feud");
      if (sc.flashT > 0) sc.flashT = Math.max(0, sc.flashT - dt);
      // First ACTION frame of this phase — i.e. the frame after its dialogue is
      // answered. Phase-entry effects hang off this rather than an `el < dt`
      // edge: the frame that crosses a boundary returns early to show the
      // phase's lines, so by the time action resumes `el` has already stepped
      // past zero and such an edge never fires.
      const firstActionFrame = sc.actedPhase !== sc.phase;
      sc.actedPhase = sc.phase;

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
          this._emitStream(dt, sc, game, C);
        }
        st.facing = 1;   // holds right through desecrate/rage; reveal flips it to -1
      } else if (sc.phase === "rage") {
        dog.state = "idle";
        if (game.player) game.player.facing = 1;
        if (firstActionFrame) { sc.flashT = C.flashDur; sc.flashColor = "rage"; }   // one red flash
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
    // Dog stream. Built from the same JH.Particle the player's hose emits, so
    // it reads as a miniature of that mechanic; only the palette and scale
    // differ. Particle bounces at z=0, which gives the splash at the hydrant
    // base for free. Emits along -facing (out the cocked rear leg).
    _emitStream(dt, sc, game, C) {
      if (!game.particles || !JH.Particle) return;
      sc.streamT = (sc.streamT || 0) + dt;
      const dog = sc.dog;
      const back = -dog.facing;
      while (sc.streamT >= C.streamRate) {
        sc.streamT -= C.streamRate;
        const j = () => (Math.random() - 0.5) * C.streamJitter;
        game.particles.push(new JH.Particle({
          x: dog.x + dog.facing * C.streamDX,
          y: dog.y + j(),
          z: C.streamDZ + j(),
          vx: back * (C.streamSpeed + j() * 4),
          vy: 0,
          vz: C.streamRise + j() * 2,
          grav: C.streamGrav,
          life: C.streamLife,
          color: Math.random() > 0.45 ? JH.PAL.peeHi : JH.PAL.pee,
          size: C.streamSize,
        }));
      }
    },

    // Cinematic push-in factor at elapsed time t. Eases up over zoomInDur,
    // holds, then eases back to 1 across the last zoomOutDur so the world is
    // at native scale by the time control returns. Pure — unit-tested.
    zoomK(C, t) {
      const total = this.totalDur(C);
      const inK = C.zoomInDur > 0 ? Math.min(1, t / C.zoomInDur) : 1;
      const outK = C.zoomOutDur > 0 ? Math.min(1, Math.max(0, total - t) / C.zoomOutDur) : 1;
      const ease = (u) => u * u * (3 - 2 * u);        // smoothstep
      return 1 + (C.zoomMax - 1) * ease(Math.min(inK, outK));
    },

    // Screen-space focal point + scale for the world pass. Framed on the
    // midpoint of the player and the dog so both stay in shot as it tightens.
    zoom(game) {
      const sc = game.airEntry;
      const C = JH.AIRENTRY;
      if (!sc) return { k: 1, fx: JH.VIEW_W / 2, fy: JH.VIEW_H / 2 };
      const cam = JH.Camera.x;
      const px = game.player ? game.player.x : sc.dog.x;
      const midX = (px + sc.dog.x) / 2 - cam;
      const midY = JH.Geo.feetScreenY(sc.dog.y, 0);
      return { k: this.zoomK(C, sc.t), fx: midX, fy: midY };
    },

    // Edge dim. Screen-space (drawOverlay runs after the world transform is
    // restored), so the zoom never stretches it.
    _drawVignette(ctx, C) {
      if (!(C.vignetteAlpha > 0) || !ctx.createRadialGradient) return;
      const cx = JH.VIEW_W / 2, cy = JH.VIEW_H / 2;
      const outer = Math.sqrt(cx * cx + cy * cy);
      const g = ctx.createRadialGradient(cx, cy, outer * C.vignetteInner, cx, cy, outer);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(0,0,0,${C.vignetteAlpha})`);
      ctx.save();
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H);
      ctx.restore();
    },

    // The beat a phase shows at cursor `idx`, or null once its lines are spent
    // (or if it has none). Dialogue is player-paced, so the cursor — not
    // elapsed time — decides what is on screen.
    codecBeat(phase, idx) {
      const beats = CODEC[phase];
      if (!beats || idx >= beats.length) return null;
      return { beat: beats[idx], idx, remaining: beats.length - idx - 1 };
    },

    // True while a scripted codec beat is on screen. game.js reads this to
    // suppress the stat panel, which shares the portrait's top-left rect.
    codecActive(game) {
      const sc = game.airEntry;
      return !!(sc && this.codecBeat(sc.phase, sc.codecIdx || 0));
    },

    // Intro codec box. Same geometry and palette as the Quake/Slayer/Ass Man
    // boxes in game.js, but drawn over the LIVE scene behind a partial veil
    // instead of a full blackout — the staged action is the point of this beat,
    // so it must stay visible. Box sits in the upper band; both actors render
    // below it at this camera.
    drawCodec(ctx, game) {
      const sc = game.airEntry;
      if (!sc) return;
      const C = JH.AIRENTRY;
      const beats = CODEC[sc.phase];
      const idx = sc.codecIdx || 0;
      if (!beats || idx >= beats.length) return;
      const beat = beats[idx];

      const PX = 10, PY = 10, PW = 96, PH = 108;

      ctx.save();
      ctx.globalAlpha = C.codecDim;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H);
      ctx.restore();

      // Portrait, with the procedural fallback the other boxes use: an
      // undecoded PNG must not leave an empty frame.
      ctx.fillStyle = "#141017";
      ctx.fillRect(PX, PY, PW, PH);
      ctx.strokeStyle = "#e8b23a";
      ctx.lineWidth = 2;
      ctx.strokeRect(PX, PY, PW, PH);

      // Mouth flaps for a moment after the line appears, then settles — the
      // line itself waits on the player, so this cannot be tied to a slice.
      const held = sc.codecT || 0;
      const talking = held < C.codecTalkDur;
      const mouth = talking && (Math.floor(held * C.codecMouthHz) & 1);
      const fn = PORTRAIT_FN[beat.who];
      const img = fn ? fn(mouth) : null;
      if (img && img.complete && img.naturalWidth) {
        ctx.drawImage(img, PX, PY, PW, PH);
      } else {
        ctx.fillStyle = "#2a2438";
        ctx.fillRect(PX + 8, PY + 8, PW - 16, PH - 16);
      }

      ctx.fillStyle = "#e8b23a";
      ctx.font = "bold 7px monospace";
      ctx.textAlign = "left";
      ctx.fillText(beat.name, PX, PY + PH + 9);

      const DX = PX + PW + 8, DY = PY, DW = JH.VIEW_W - DX - 10, DH = PH;
      ctx.fillStyle = "#0b0810";
      ctx.fillRect(DX, DY, DW, DH);
      ctx.strokeStyle = "#3a2e12";
      ctx.lineWidth = 1;
      ctx.strokeRect(DX, DY, DW, DH);

      ctx.fillStyle = "#f0e0c0";
      ctx.font = "6px monospace";
      for (let i = 0; i < beat.lines.length; i++)
        ctx.fillText(beat.lines[i], DX + 6, DY + 18 + i * 12);

      // Blinking advance prompt, same idiom and wording as the Quake/Slayer/
      // Ass Man boxes. Only once the line can actually be advanced.
      if ((sc.codecT || 0) >= C.codecMinHold && Math.floor(performance.now() / 500) % 2) {
        ctx.fillStyle = "#7a6a3a";
        ctx.font = "5px monospace";
        ctx.textAlign = "right";
        ctx.fillText("[ E ]  ADVANCE", DX + DW - 4, DY + DH - 5);
        ctx.textAlign = "left";
      }
    },

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
