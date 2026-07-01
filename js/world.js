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

  // Debris pile sprite (Act 3 floor dressing). 309×272 source art.
  const _debrisImg = JH.Loader.img("sprites/environment/debris.png");

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
    // Jump the camera straight to where it would settle following `player`,
    // with no lerp — used on Church respawn so the world fades in AT the spot
    // instead of scrolling across the whole map to reach it.
    snapTo(player) {
      const max = Math.max(0, JH.LEVEL_LEN - JH.VIEW_W);
      this.x = Math.max(0, Math.min(max, player.x - JH.VIEW_W * 0.42));
      this.locked = false; this.lockX = 0;
    },
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
        // Act 3: ruined district. The near skyline scrolls at 0.5 parallax, so
        // the foreground zone boundary maps to building-x at HALF scale (plus a
        // screen width so the first broken silhouette enters from the right
        // edge as the player crosses into the district, not two acts later).
        const broken = x > (JH.ZONE2_START - 200) * 0.5 + JH.VIEW_W;
        const b = {
          x, w, h, broken, jag: null, windows: [],
          c: broken ? (rA() > 0.5 ? "#241f24" : "#2b242a")
                    : (rA() > 0.5 ? "#1b2740" : "#202d4a"),
        };
        if (broken) {
          // Collapsed skyline: per-slice top heights, with the odd big gap.
          b.jag = [];
          for (let sx = 0; sx < w; sx += 5) {
            const drop = Math.floor(rA() * 24) + (rA() > 0.85 ? Math.floor(rA() * 34) : 0);
            b.jag.push({ x: sx, w: Math.min(5, w - sx), h: Math.max(7, h - drop) });
          }
        }
        // Windows baked in BUILDING-LOCAL coords so they scroll with the
        // building. Ruined buildings: only lower floors, mostly blown out.
        const wy0 = broken ? Math.floor(h * 0.42) : 6;
        for (let wy = wy0; wy < h - 6; wy += 9) {
          for (let wx = 4; wx < w - 4; wx += 8) {
            if (rA() > (broken ? 0.55 : 0.35))
              b.windows.push({ x: wx, y: wy, lit: broken ? rA() > 0.82 : rA() > 0.5 });
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
      // Debris piles scattered through the ruined district (Act 3).
      this.debris = [];
      const rC = rng(7);
      for (let x = JH.ZONE2_START + 40; x < JH.LEVEL_LEN; ) {
        this.debris.push({ x, y: JH.DEPTH_MIN + rC() * (JH.DEPTH_MAX - JH.DEPTH_MIN), s: 0.7 + rC() * 0.9 });
        x += 70 + rC() * 150;
      }
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

      // Ruined-district smog haze — fades in as you approach Act 3.
      const zoneT = Math.max(0, Math.min(1, (cam + W * 0.5 - (JH.ZONE2_START - 200)) / 500));
      if (zoneT > 0) {
        ctx.fillStyle = "rgba(70,45,30," + (0.5 * zoneT).toFixed(3) + ")";
        ctx.fillRect(0, 0, W, top);
        const g = ctx.createLinearGradient(0, top - 44, 0, top);
        g.addColorStop(0, "rgba(150,70,25,0)");
        g.addColorStop(1, "rgba(150,70,25," + (0.4 * zoneT).toFixed(3) + ")");
        ctx.fillStyle = g; ctx.fillRect(0, top - 44, W, 44);
      }

      // Boiler District (fire world) — hot red sky wash + molten horizon glow.
      // Ramps in past ZONE3_START, same pattern as the Act-3 haze above.
      const fireT = Math.max(0, Math.min(1, (cam + W * 0.5 - (JH.ZONE3_START - 200)) / 500));
      if (fireT > 0) {
        ctx.fillStyle = "rgba(120,20,0," + (0.42 * fireT).toFixed(3) + ")";
        ctx.fillRect(0, 0, W, top);
        const fg = ctx.createLinearGradient(0, top - 60, 0, top);
        fg.addColorStop(0, "rgba(255,90,20,0)");
        fg.addColorStop(1, "rgba(255,110,20," + (0.55 * fireT).toFixed(3) + ")");
        ctx.fillStyle = fg; ctx.fillRect(0, top - 60, W, 60);
      }

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
        if (b.broken && b.jag) {
          for (const s of b.jag) ctx.fillRect(Math.round(sx + s.x), top - s.h, s.w, s.h);
        } else {
          ctx.fillRect(Math.round(sx), top - b.h, b.w, b.h);
        }
        // Windows are anchored to the building, so they scroll with it.
        const by = top - b.h;
        for (const win of b.windows) {
          ctx.fillStyle = win.lit ? "rgba(255,210,63,0.5)"
                                  : (b.broken ? "rgba(38,34,30,0.55)" : "rgba(120,160,220,0.22)");
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

      // Ruined-district floor: dust tint + scattered debris piles.
      if (zoneT > 0) {
        ctx.fillStyle = "rgba(74,64,50," + (0.5 * zoneT).toFixed(3) + ")";
        ctx.fillRect(0, top, W, H - top);
      }
      // Boiler District floor: scorched warm tint.
      if (fireT > 0) {
        ctx.fillStyle = "rgba(120,40,10," + (0.5 * fireT).toFixed(3) + ")";
        ctx.fillRect(0, top, W, H - top);
      }
      if (this.debris) {
        for (const d of this.debris) {
          const dx = d.x - cam;
          if (dx < -30 || dx > W + 30) continue;
          this.drawDebris(ctx, dx, Geo.feetScreenY(d.y, 0), d.s);
        }
      }

      // Props (full parallax, depth-sorted by being part of bg here)
      for (const pr of this.props) {
        const sx = pr.x - cam;
        if (sx < -20 || sx > W + 20) continue;
        JH.Assets.shadow(ctx, sx, Geo.feetScreenY(pr.y, 0), 8);
        JH.Assets.draw(ctx, pr.key, sx, Geo.feetScreenY(pr.y, 0), 1, {});
      }
    },

    // Rubble heap floor dressing for Act 3. Blits debris.png (309×272) at ~1/10
    // scale; falls back to procedural rects if the image isn't loaded yet.
    drawDebris(ctx, sx, sy, s) {
      if (_debrisImg._ready) {
        const dw = Math.round(309 * 0.075 * s);
        const dh = Math.round(272 * 0.075 * s);
        ctx.drawImage(_debrisImg, Math.round(sx - dw / 2), Math.round(sy - dh), dw, dh);
      } else {
        ctx.fillStyle = JH.PAL.rubbleDk;
        ctx.fillRect(Math.round(sx - 9 * s), Math.round(sy - 2), Math.round(18 * s), Math.round(4 * s));
        ctx.fillStyle = JH.PAL.rubble;
        ctx.fillRect(Math.round(sx - 6 * s), Math.round(sy - 6 * s), Math.round(7 * s), Math.round(6 * s));
        ctx.fillRect(Math.round(sx + 1), Math.round(sy - 4 * s), Math.round(5 * s), Math.round(4 * s));
        ctx.fillStyle = "#2c2620";
        ctx.fillRect(Math.round(sx - 1), Math.round(sy - 9 * s), Math.max(1, Math.round(2 * s)), Math.round(9 * s));
      }
    },
  };
  JH.Background = Background;
})();
