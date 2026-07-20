/* =====================================================================
   input.js — unified input state from keyboard + gamepad.
   Read `Input.state` each frame; use Input.pressed(name) for edge events.
   ===================================================================== */
(function () {
  "use strict";
  const JH = (window.JH = window.JH || {});

  // True when a text field is focused; key handlers bail so typing (e.g. the
  // title-screen leaderboard-name box) isn't eaten as gameplay input.
  JH.isTyping = function () {
    const el = document.activeElement;
    if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return false;
    const t = (el.type || "text").toLowerCase();
    return t !== "range" && t !== "checkbox" && t !== "button" && t !== "radio";
  };

  // Logical actions the game cares about.
  const ACTIONS = ["up", "down", "left", "right", "spray", "dash", "confirm", "pause", "toggleStats"];

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
    Tab: "toggleStats",                  // stat/benediction panel (UI chrome, not a verb)
  };

  // Edge-buffered actions: a press stays "pending" for BUFFER_MS and is
  // consumed by the first frame that can act on it — so hit-stop/arrival
  // freezes and cooldown edges can't eat the press. Spray is a hold; only
  // discrete actions buffer.
  const BUFFERED = ["dash", "confirm"];
  const BUFFER_MS = 130;

  const Input = {
    state: {},   // action -> bool (held this frame)
    _prev: {},   // action -> bool (held last frame)
    _keys: {},   // action -> bool (from keyboard)
    _bufAt: {},  // action -> _now() timestamp of the latest unconsumed edge
    // Read-only pointer position in 480x270 logical space (mapped from the
    // canvas's CSS bounding rect, not devicePixelRatio — the ctx transform
    // already absorbs dpr, so client coords only need CSS-pixel scaling).
    // Hover-only: no gameplay code should ever branch on a click here.
    mouse: { x: -1, y: -1, inside: false, click: false, clickEdge: false },
    _now() { return performance.now(); },

    init() {
      ACTIONS.forEach((a) => { this.state[a] = false; this._prev[a] = false; this._keys[a] = false; });
      BUFFERED.forEach((a) => { this._bufAt[a] = null; });

      window.addEventListener("keydown", (e) => {
        if (JH.isTyping()) return;   // let the name field capture its own keys
        const a = KEYMAP[e.code];
        if (a) {
          this._keys[a] = true;
          // Prevent page scroll on arrows/space and focus-cycling on Tab.
          if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code))
            e.preventDefault();
        }
      });
      window.addEventListener("keyup", (e) => {
        if (JH.isTyping()) return;
        const a = KEYMAP[e.code];
        if (a) this._keys[a] = false;
      });
      // Drop all keys if focus is lost (prevents "stuck" movement).
      window.addEventListener("blur", () => {
        for (const k in this._keys) this._keys[k] = false;
      });

      // Mouse tracking (no `document` in the node test harness — guarded).
      if (typeof document !== "undefined") {
        const canvas = document.getElementById("game");
        if (canvas && canvas.addEventListener) {
          canvas.addEventListener("mousemove", (e) => {
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            this.mouse.x = (e.clientX - rect.left) / rect.width * JH.VIEW_W;
            this.mouse.y = (e.clientY - rect.top) / rect.height * JH.VIEW_H;
            this.mouse.inside = true;
          });
          canvas.addEventListener("mouseleave", () => { this.mouse.inside = false; });
          canvas.addEventListener("mousedown", (e) => {
            const rect = canvas.getBoundingClientRect();
            this.mouse.x = (e.clientX - rect.left) / rect.width * JH.VIEW_W;
            this.mouse.y = (e.clientY - rect.top) / rect.height * JH.VIEW_H;
            this.mouse.inside = true;
            this.mouse.click = true;
          });
        }
      }
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
        if (down(0)) { s.spray = true; s.confirm = true; } // A: spray in play, confirm/interact in menus
        if (down(7)) s.spray = true;  // RT
        if (down(1)) s.dash = true;   // B
        if (down(2)) s.confirm = true; // X: confirm/interact
        if (down(8)) s.toggleStats = true; // Back/Select: stat + benediction panel
        if (down(9)) s.pause = true;  // Start
      }

      this.state = s;

      // Record press edges for the buffered actions.
      for (const a of BUFFERED)
        if (this.state[a] && !this._prev[a]) this._bufAt[a] = this._now();

      // Mouse click edge: true for exactly one polled frame per mousedown.
      this.mouse.clickEdge = this.mouse.click;
      this.mouse.click = false;
    },

    // Inject a buffered press programmatically (e.g. mouse click -> confirm).
    bufferPress(a) { this._bufAt[a] = this._now(); },

    // Held this frame.
    held(a) { return !!this.state[a]; },
    // True only on the frame the action went from up -> down.
    pressed(a) { return !!this.state[a] && !this._prev[a]; },
    // Unconsumed press edge within the last BUFFER_MS.
    buffered(a) {
      const t = this._bufAt[a];
      return t != null && this._now() - t <= BUFFER_MS;
    },
    consume(a) { this._bufAt[a] = null; },
  };

  JH.Input = Input;
})();
