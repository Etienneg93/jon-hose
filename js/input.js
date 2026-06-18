/* =====================================================================
   input.js — unified input state from keyboard + gamepad.
   Read `Input.state` each frame; use Input.pressed(name) for edge events.
   ===================================================================== */
(function () {
  "use strict";
  const JH = (window.JH = window.JH || {});

  // Logical actions the game cares about.
  const ACTIONS = ["up", "down", "left", "right", "spray", "whack", "dash", "jump", "confirm", "pause"];

  // Keyboard map (multiple keys per action).
  const KEYMAP = {
    ArrowUp: "up", KeyW: "up",
    ArrowDown: "down", KeyS: "down",
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
    KeyJ: "spray", Space: "spray",
    ShiftLeft: "dash", ShiftRight: "dash", KeyL: "dash",
    Enter: "confirm", KeyE: "confirm",   // confirm doubles as "interact" with the shop NPC
    Escape: "pause",
  };

  const Input = {
    state: {},   // action -> bool (held this frame)
    _prev: {},   // action -> bool (held last frame)
    _keys: {},   // action -> bool (from keyboard)

    init() {
      ACTIONS.forEach((a) => { this.state[a] = false; this._prev[a] = false; this._keys[a] = false; });

      window.addEventListener("keydown", (e) => {
        const a = KEYMAP[e.code];
        if (a) {
          this._keys[a] = true;
          // Prevent page scroll on arrows/space.
          if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code))
            e.preventDefault();
        }
      });
      window.addEventListener("keyup", (e) => {
        const a = KEYMAP[e.code];
        if (a) this._keys[a] = false;
      });
      // Drop all keys if focus is lost (prevents "stuck" movement).
      window.addEventListener("blur", () => {
        for (const k in this._keys) this._keys[k] = false;
      });
    },

    // Call once per frame BEFORE reading state, to fold in gamepad + edges.
    poll() {
      // Snapshot previous frame for edge detection.
      for (const a of ACTIONS) this._prev[a] = this.state[a];

      // Start from keyboard.
      const s = {};
      for (const a of ACTIONS) s[a] = this._keys[a];

      // Gamepad (first connected pad).
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = pads && pads[0];
      if (gp) {
        const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
        const DZ = 0.4;
        if (ax < -DZ) s.left = true; if (ax > DZ) s.right = true;
        if (ay < -DZ) s.up = true;   if (ay > DZ) s.down = true;
        const b = gp.buttons;
        const down = (i) => b[i] && b[i].pressed;
        if (down(12)) s.up = true;    // d-pad
        if (down(13)) s.down = true;
        if (down(14)) s.left = true;
        if (down(15)) s.right = true;
        if (down(0)) s.spray = true;  // A
        if (down(7)) s.spray = true;  // RT
        if (down(1)) s.dash = true;   // B
        if (down(9)) { s.confirm = true; s.pause = true; } // Start
      }

      this.state = s;
    },

    // Held this frame.
    held(a) { return !!this.state[a]; },
    // True only on the frame the action went from up -> down.
    pressed(a) { return !!this.state[a] && !this._prev[a]; },
  };

  JH.Input = Input;
})();
