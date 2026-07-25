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
        stranger, dog, flashT: 0, revealed: false,
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
          dog.frame = Math.floor(el / C.dogFrameStep) & 3;
        } else {
          dog.state = "lift";
        }
        st.facing = 1;   // holds right through desecrate/rage; reveal flips it to -1
      } else if (sc.phase === "rage") {
        dog.state = "idle";
        if (game.player) game.player.facing = 1;
        if (el < dt) sc.flashT = C.flashDur;     // one red flash on entry
      } else if (sc.phase === "reveal") {
        st.facing = -1;
        st.state = "rip";
        st.frame = Math.min(2, Math.floor(el / C.ripFrameStep));
        if (st.frame >= 2 && !sc.revealed) { sc.revealed = true; sc.flashT = C.flashDur; }
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
        dog.held = true;
        dog.state = "idle";
        dog.x = st.x + C.dogCarryDX;
        dog.z = st.z - C.dogCarryDY;
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
