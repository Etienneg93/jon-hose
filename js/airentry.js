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
        st.facing = 1;   // looking away down the street — oblivious
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
          // Still holding Jon's eye as he lifts off — facing stays left.
          st.state = "riseup";
          st.z += C.riseSpeed * dt;
        } else {
          // Turns downrange before soaring: facing must match travel or he
          // flies backwards.
          st.state = "soar";
          st.facing = 1;
          st.z += C.riseSpeed * 0.35 * dt;
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
