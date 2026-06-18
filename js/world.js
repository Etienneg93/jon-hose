/* =====================================================================
   world.js — the 2.5-D playfield: depth math, camera, collision helpers,
   and the parallax street background.

   Coordinate model:
     worldX  horizontal position along the level (0 .. LEVEL_LEN)
     worldY  DEPTH on the floor plane (DEPTH_MIN .. DEPTH_MAX)
     z       jump height above the floor (0 = grounded)
   Screen position:
     screenX = worldX - camera.x
     screenY = FLOOR_TOP + worldY - z      (feet baseline)
   ===================================================================== */
(function () {
  "use strict";
  const JH = (window.JH = window.JH || {});

  // ----------------------------------------------------------- geometry
  const Geo = {
    feetScreenY: (worldY, z) => JH.FLOOR_TOP + worldY - (z || 0),
    clampDepth: (y) => Math.max(JH.DEPTH_MIN, Math.min(JH.DEPTH_MAX, y)),
    clampX: (x) => Math.max(8, Math.min(JH.LEVEL_LEN - 8, x)),

    // Axis-aligned overlap of two entities in the (x, depth) plane.
    bodiesOverlap(a, b) {
      const ax = Math.abs(a.x - b.x);
      const ay = Math.abs(a.y - b.y);
      return ax < (a.bodyW + b.bodyW) * 0.5 && ay < 14;
    },

    // Is `target` inside a melee/spray hit originating at `src` facing `dir`?
    // Measured EDGE-TO-EDGE using body widths so hits line up with the
    // sprites: `range` is the reach past the attacker's own body, and a
    // hit connects once it reaches the target's NEAR edge.
    inHitArc(src, target, dir, range, band) {
      const srcHalf = (src.bodyW || 14) * 0.5;
      const tgtHalf = (target.bodyW || 14) * 0.5;
      const forward = (target.x - src.x) * dir;     // + = in front of attacker
      if (forward < -srcHalf) return false;         // target is behind us
      const gap = forward - srcHalf - tgtHalf;      // edge-to-edge distance
      if (gap > range) return false;                // out of reach
      if (Math.abs(target.y - src.y) > band) return false;          // depth band
      if (Math.abs((target.z || 0) - (src.z || 0)) > 22) return false; // height
      return true;
    },
  };
  JH.Geo = Geo;

  // ------------------------------------------------------------- camera
  const Camera = {
    x: 0,
    locked: false,     // during a fight the camera stops scrolling
    lockX: 0,
    follow(player) {
      const target = this.locked
        ? this.lockX
        : player.x - JH.VIEW_W * 0.42;
      const max = Math.max(0, JH.LEVEL_LEN - JH.VIEW_W);
      this.x += (Math.max(0, Math.min(max, target)) - this.x) * 0.12;
      if (this.x < 0) this.x = 0;
      if (this.x > max) this.x = max;
    },
    lock() { this.locked = true; this.lockX = this.x; },
    unlock() { this.locked = false; },
    reset() { this.x = 0; this.locked = false; this.lockX = 0; },
  };
  JH.Camera = Camera;

  // --------------------------------------------------------- background
  // Deterministic pseudo-random so the skyline is stable across frames.
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  const Background = {
    buildings: [],
    farBuildings: [],
    props: [],
    init() {
      this.buildings = [];
      this.farBuildings = [];
      const rA = rng(1337);
      for (let x = -40; x < JH.LEVEL_LEN + 200; ) {
        const w = 24 + Math.floor(rA() * 30);
        const h = 40 + Math.floor(rA() * 70);
        const b = { x, w, h, c: rA() > 0.5 ? "#1b2740" : "#202d4a", windows: [] };
        // Bake the window grid in BUILDING-LOCAL coords (offset from the
        // building's top-left) with a fixed lit/dark pattern, so the lights
        // scroll smoothly with the building instead of shimmering in place.
        for (let wy = 6; wy < h - 6; wy += 9) {
          for (let wx = 4; wx < w - 4; wx += 8) {
            if (rA() > 0.35) b.windows.push({ x: wx, y: wy, lit: rA() > 0.5 });
          }
        }
        this.buildings.push(b);
        x += w + 6;
      }
      const rB = rng(99);
      for (let x = -40; x < JH.LEVEL_LEN + 200; ) {
        const w = 30 + Math.floor(rB() * 26);
        const h = 60 + Math.floor(rB() * 60);
        this.farBuildings.push({ x, w, h, c: "#121a2e" });
        x += w + 10;
      }
      // Hydrants are interactive now and drawn by the Game layer (so their
      // active-refill FX can sort with actors); none drawn here.
      this.props = [];
    },

    draw(ctx) {
      const cam = Camera.x;
      const W = JH.VIEW_W, H = JH.VIEW_H, top = JH.FLOOR_TOP;

      // Sky
      const sky = ctx.createLinearGradient(0, 0, 0, top);
      sky.addColorStop(0, "#0c1226");
      sky.addColorStop(1, "#27375e");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, top);

      // Moon
      ctx.fillStyle = "#dfe8ff";
      ctx.beginPath();
      ctx.arc(W - 64, 40, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#27375e";
      ctx.beginPath();
      ctx.arc(W - 58, 36, 12, 0, Math.PI * 2);
      ctx.fill();

      // Far skyline (slow parallax)
      const pFar = cam * 0.25;
      for (const b of this.farBuildings) {
        const sx = b.x - pFar;
        if (sx + b.w < 0 || sx > W) continue;
        ctx.fillStyle = b.c;
        ctx.fillRect(Math.round(sx), top - b.h, b.w, b.h);
      }
      // Near skyline (medium parallax) + lit windows
      const pNear = cam * 0.5;
      for (const b of this.buildings) {
        const sx = b.x - pNear;
        if (sx + b.w < 0 || sx > W) continue;
        ctx.fillStyle = b.c;
        ctx.fillRect(Math.round(sx), top - b.h, b.w, b.h);
        // Windows are anchored to the building, so they scroll with it.
        const by = top - b.h;
        for (const win of b.windows) {
          ctx.fillStyle = win.lit ? "rgba(255,210,63,0.5)" : "rgba(120,160,220,0.22)";
          ctx.fillRect(Math.round(sx + win.x), by + win.y, 3, 4);
        }
      }

      // Street floor (perspective bands)
      ctx.fillStyle = "#2a2f3d";
      ctx.fillRect(0, top, W, H - top);
      ctx.fillStyle = "#222633";
      ctx.fillRect(0, top, W, 4);
      // Lane lines scrolling with camera (full parallax = 1.0)
      ctx.fillStyle = "#3a4154";
      const lane = top + (H - top) * 0.55;
      for (let x = -((cam) % 40); x < W; x += 40) {
        ctx.fillRect(Math.round(x), Math.round(lane), 18, 3);
      }
      // Sidewalk edge at the back
      ctx.fillStyle = "#39405440";
      ctx.fillRect(0, top + 2, W, 6);

      // Props (full parallax, depth-sorted by being part of bg here)
      for (const pr of this.props) {
        const sx = pr.x - cam;
        if (sx < -20 || sx > W + 20) continue;
        JH.Assets.shadow(ctx, sx, Geo.feetScreenY(pr.y, 0), 8);
        JH.Assets.draw(ctx, pr.key, sx, Geo.feetScreenY(pr.y, 0), 1, {});
      }
    },
  };
  JH.Background = Background;
})();
