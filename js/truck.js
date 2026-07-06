/* =====================================================================
   truck.js — JH.TruckRun: the post-Slayer fire-truck escape set-piece.
   A self-contained scrolling scene (modeled on the Church interlude): it
   owns a `scene` object with an internal phase machine and is dispatched
   from game.js via state === "truck". It does NOT touch the Player/enemies/
   wave systems — it holds its own truck object + hazard/hydrant/pickup lists.
   All tunables come from JH.TRUCKRUN; pure math from JH.TruckBalance.
   Coordinate model: the road scrolls left→right under a truck fixed near
   screen-left. Depth (JH.DEPTH_MIN..MAX) is the dodge/aim axis; the hose is
   a forward swath centred on the truck's depth.
   ===================================================================== */
(function (root) {
  "use strict";
  const JH = root.JH;

  // Phase timing (seconds). intro settle → run (hazards) → arrive (gate).
  const INTRO_T = 1.5;
  const ARRIVE_T = 2.0;

  const TruckRun = {
    enter(game) {
      const C = JH.TRUCKRUN;
      game.state = "truck";
      const hud = document.getElementById("hud");
      if (hud) hud.classList.add("hidden");
      const banner = document.getElementById("banner");
      if (banner) banner.classList.add("hidden");
      JH.Camera.lock && JH.Camera.lock();

      this.scene = {
        t: 0,                 // elapsed run time (drives phase + timeline)
        phase: "intro",       // intro → run → arrive
        scrollX: 0,           // world px scrolled (own coordinate space)
        speedMult: 1,         // scroll multiplier (collisions slow it — Task 4)
        truck: {
          depth: JH.DEPTH_MAX * 0.5,
          screenX: C.truckScreenX,
          hp: C.truckHp,
          water: C.tank,
          spraying: false,
          regenLock: 0,
          dashTimer: 0, dashCdTimer: 0, dashDir: 0,
          invulnT: 0, burnT: 0,
        },
        // Hazards/patches/embers (T4); hydrants (T5); pickups/furnace (T7).
        hazards: [], firePatches: [], embers: [],
        hydrants: [], pickups: [], furnace: null,
        slowT: 0, shakeT: 0,
        wallGap: C.wall.startGap,
        wallTouched: false,
        essence: 0,
        // Deterministic-enough schedule; consumed from the front in Task 4.
        timeline: JH.TruckBalance.buildTimeline(C, Math.random),
        cursor: 0,
        banner: null, bannerT: 0,
      };
      this._banner(game, "PUNCH IT!", 1.6);
    },

    _banner(game, text, dur) {
      this.scene.banner = text;
      this.scene.bannerT = dur;
    },

    update(dt, game) {
      const sc = this.scene; if (!sc) return;
      const C = JH.TRUCKRUN, In = JH.Input;
      sc.t += dt;
      if (sc.bannerT > 0) sc.bannerT -= dt;

      // ---- phase machine
      if (sc.phase === "intro") {
        if (sc.t >= INTRO_T) { sc.phase = "run"; this._banner(game, "ESCAPE THE FIRE!", 1.6); }
      } else if (sc.phase === "run") {
        if (sc.t >= C.runDuration - ARRIVE_T) { sc.phase = "arrive"; this._banner(game, "THE GATE!", 2.0); }
      } else if (sc.phase === "arrive") {
        if (sc.t >= C.runDuration) { this._finish(game); return; }
      }

      // ---- scroll (paused during the intro settle)
      if (sc.phase !== "intro") sc.scrollX += C.scrollSpeed * sc.speedMult * dt;

      this._drive(dt, C, In);
      if (sc.phase !== "intro") {
        this._hose(dt, C);
        this._spawnFromTimeline(sc);
        this._updateHazards(dt, C);
        this._updatePatches(dt, C);
        this._updateEmbers(dt, C);
        if (sc.slowT > 0 && (sc.slowT -= dt) <= 0) sc.speedMult = 1;
        if (sc.shakeT > 0) sc.shakeT -= dt;
      }
      // Hydrants/pickups/furnace/wall are advanced by later tasks.
    },

    // Truck movement: depth = dodge/aim axis, screen-x = throttle/brake,
    // dash = swerve (buffered edge + i-frames), spray = hold (used in Task 3).
    _drive(dt, C, In) {
      const t = this.scene.truck;
      const mx = (In.held("right") ? 1 : 0) - (In.held("left") ? 1 : 0);
      const my = (In.held("down") ? 1 : 0) - (In.held("up") ? 1 : 0);

      // Dash: buffered edge, off cooldown → depth burst with i-frames.
      if (t.dashCdTimer > 0) t.dashCdTimer -= dt;
      if (t.dashTimer > 0) t.dashTimer -= dt;
      if (t.invulnT > 0) t.invulnT -= dt;
      if (In.buffered("dash") && t.dashCdTimer <= 0) {
        In.consume("dash");
        t.dashTimer = JH.PLAYER.dashTime;
        t.dashCdTimer = JH.PLAYER.dashCd;
        t.invulnT = Math.max(t.invulnT, JH.PLAYER.dashTime + 0.05);
        t.dashDir = my || (t.depth < JH.DEPTH_MAX * 0.5 ? 1 : -1);
      }

      if (t.dashTimer > 0) {
        t.depth += t.dashDir * JH.PLAYER.dashSpeed * dt;
      } else {
        t.depth += my * C.moveSpeed * dt;
      }
      t.depth = JH.Geo.clampDepth(t.depth);

      t.screenX += mx * C.throttleSpeed * dt;
      t.screenX = Math.max(C.truckScreenX - C.throttleBand,
                    Math.min(C.truckScreenX + C.throttleBand, t.screenX));

      t.spraying = In.held("spray");
    },

    // Nozzle world-x (front of the truck) in the scroll coordinate space.
    _nozzleWorldX(sc) { return sc.scrollX + sc.truck.screenX + 20; },

    // The oversized forward hose: hold spray → drain tank, two-tier pressure,
    // damage every hazard inside the forward swath (ONE shape shared with the
    // beam render — rim-is-hitbox). Runs dry into a weak sputter, never fully off.
    _hose(dt, C) {
      const sc = this.scene, t = sc.truck;

      // Tank: drain while spraying (with regen lock), else passive regen.
      if (t.spraying && t.water > 0) {
        t.water = Math.max(0, t.water - C.drain * dt);
        t.regenLock = C.regenDelay;
      } else if (t.regenLock > 0) {
        t.regenLock -= dt;
      } else {
        t.water = Math.min(C.tank, t.water + C.regen * dt);
      }

      if (!t.spraying) { sc.beam = null; return; }

      const pr = JH.TruckBalance.truckPressure(C, t.water / C.tank);
      const range = C.hoseRange * pr.rangeMult;
      const dps = C.hoseDps * pr.dmgScale;
      sc.beam = { range: range, sputter: pr.dmgScale < 1 };  // for render

      const nozzleX = this._nozzleWorldX(sc);
      for (const h of sc.hazards) {
        const dx = h.worldX - nozzleX;
        if (JH.TruckBalance.beamCovers(t.depth, C.hoseBand, h.depth, dx, range)) {
          h.hp -= dps * dt;
          if (h.hp <= 0) h.dead = true;
        }
      }
      sc.hazards = sc.hazards.filter((h) => !h.dead);
    },

    // Dev/headless: drop a stub target `aheadPx` in front of the truck.
    _debugSpawnHazard(depth, aheadPx, hp) {
      const sc = this.scene; if (!sc) return;
      sc.hazards.push({ worldX: this._nozzleWorldX(sc) + aheadPx, depth: depth, hp: hp, kind: "dummy" });
    },

    // ---- hazards (fire roster reused; stats READ from JH.ENEMIES) --------
    _spawnFromTimeline(sc) {
      while (sc.cursor < sc.timeline.length && sc.t >= sc.timeline[sc.cursor].at) {
        const ev = sc.timeline[sc.cursor++];
        // Combat kinds spawn here; hydrant/cross are wired in Tasks 5/7.
        if (ev.kind === "wreck" || ev.kind === "fuse" || ev.kind === "smelt" || ev.kind === "pyro")
          this._spawnHazard(ev);
      }
    },

    _spawnHazard(ev) {
      const sc = this.scene, C = JH.TRUCKRUN, E = JH.ENEMIES;
      const h = {
        kind: ev.kind, depth: ev.depth, dead: false, cd: 0,
        worldX: sc.scrollX + JH.VIEW_W + 24,   // enters from the right edge
      };
      if (ev.kind === "wreck") { h.hp = C.wreckHp; h.dmg = C.wreckDmg; }
      else if (ev.kind === "fuse") { h.hp = E.fuse.hp; h.dmg = E.fuse.blastDmg; h.speed = E.fuse.speed; }
      else if (ev.kind === "smelt") { h.hp = E.smelt.hp; h.dmg = E.smelt.touchDmg; }
      else if (ev.kind === "pyro") { h.hp = E.pyro.hp; h.dmg = E.pyro.touchDmg; }
      sc.hazards.push(h);
    },

    _updateHazards(dt, C) {
      const sc = this.scene, t = sc.truck, E = JH.ENEMIES;
      const truckWorldX = sc.scrollX + t.screenX;
      for (const h of sc.hazards) {
        // Movement: wrecks/smelt/pyro are static in road space (scroll carries
        // them past); fuse chases the windshield.
        if (h.kind === "fuse") {
          h.worldX -= h.speed * dt;                       // closes faster than scroll
          h.depth += Math.sign(t.depth - h.depth) * Math.min(Math.abs(t.depth - h.depth), h.speed * 0.6 * dt);
        } else if (h.kind === "smelt") {
          if ((h.cd -= dt) <= 0) {                        // lob a fire-patch ahead
            h.cd = E.smelt.lobCd;
            this._spawnPatch(sc.scrollX + t.screenX + 90 + Math.random() * 60,
              C.lanes[(Math.random() * C.lanes.length) | 0], E.smelt.lobBombRadius, E.smelt.lobBombDur);
          }
        } else if (h.kind === "pyro") {
          if ((h.cd -= dt) <= 0 && h.worldX - sc.scrollX < JH.VIEW_W) {
            h.cd = E.pyro.shootCd;
            this._spawnEmber(h, t, E.pyro.emberSpeed, E.pyro.emberDmg);
          }
        }

        // Collision with the truck (unless dashing/i-frames). Consumables and
        // rammed wrecks are destroyed; damage + brief slow.
        if (Math.abs((h.worldX - sc.scrollX) - t.screenX) < 22 && Math.abs(h.depth - t.depth) < 14) {
          if (t.invulnT <= 0) {
            this._damageTruck(h.dmg);
            if (h.kind === "fuse") this._spawnPatch(h.worldX, h.depth, E.fuse.blastPatchRadius, E.fuse.blastPatchDur);
            this._collide(C);
          }
          h.dead = true;
        }
        if (h.worldX < sc.scrollX - 60) h.dead = true;    // passed behind
      }
      sc.hazards = sc.hazards.filter((h) => !h.dead);
    },

    _spawnPatch(worldX, depth, r, dur) {
      this.scene.firePatches.push({ worldX: worldX, depth: depth, r: r, life: dur, maxLife: dur });
    },

    _updatePatches(dt, C) {
      const sc = this.scene, t = sc.truck, F = JH.FIRE;
      const truckWorldX = sc.scrollX + t.screenX;
      let inFire = false;
      for (const p of sc.firePatches) {
        p.life -= dt;
        const rx = p.r * 0.85, ry = rx * JH.GROUND_RY;
        if (p.life > 0 && JH.Geo.inGroundEllipse(truckWorldX, t.depth, p.worldX, p.depth, rx, ry)) inFire = true;
      }
      sc.firePatches = sc.firePatches.filter((p) => p.life > 0);
      if (inFire) t.burnT = F.burnDuration;               // refresh lingering burn
      if (t.burnT > 0) { this._damageTruck(F.burnDpsPerStack * dt, true); t.burnT -= dt; }
    },

    _spawnEmber(from, truck, speed, dmg) {
      const sc = this.scene;
      const sx = from.worldX, sy = from.depth;
      const tx = sc.scrollX + truck.screenX, ty = truck.depth;
      const dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy) || 1;
      sc.embers.push({ worldX: sx, depth: sy, vx: (dx / d) * speed, vy: (dy / d) * speed, dmg: dmg, life: 2.5 });
    },

    _updateEmbers(dt, C) {
      const sc = this.scene, t = sc.truck;
      for (const e of sc.embers) {
        e.worldX += e.vx * dt; e.depth += e.vy * dt; e.life -= dt;
        if (Math.abs((e.worldX - sc.scrollX) - t.screenX) < 12 && Math.abs(e.depth - t.depth) < 10) {
          if (t.invulnT <= 0) this._damageTruck(e.dmg);
          e.life = 0;
        }
        if (e.worldX < sc.scrollX - 40) e.life = 0;
      }
      sc.embers = sc.embers.filter((e) => e.life > 0);
    },

    // Honest, NON-LETHAL truck HP: clamps at 0, feeds shake, never ends the run.
    _damageTruck(amount, quiet) {
      const t = this.scene.truck;
      t.hp = Math.max(0, t.hp - amount);
      if (!quiet) this.scene.shakeT = 0.25;
    },

    _collide(C) {
      const sc = this.scene;
      sc.speedMult = C.collideSlow;
      sc.slowT = C.collideSlowDur;
    },

    _finish(game) {
      this.scene = null;
      JH.Camera.unlock && JH.Camera.unlock();
      game.afterTruckRun();
    },

    // ------------------------------------------------------------- RENDER
    renderScene(ctx, game) {
      const sc = this.scene; if (!sc) return;
      const C = JH.TRUCKRUN, t = sc.truck;

      // Collision shake (small; real trauma model is the play world's).
      if (sc.shakeT > 0) {
        const m = sc.shakeT * 10;
        ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
      }

      // Placeholder art (real chrome is Task 9). Fiery sky + scrolling road.
      const sky = ctx.createLinearGradient(0, 0, 0, JH.FLOOR_TOP);
      sky.addColorStop(0, "#2a0d06"); sky.addColorStop(1, "#7a2b0e");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, JH.VIEW_W, JH.FLOOR_TOP);
      ctx.fillStyle = "#241a17";
      ctx.fillRect(0, JH.FLOOR_TOP, JH.VIEW_W, JH.VIEW_H - JH.FLOOR_TOP);

      // Scrolling lane stripes (parallax by scrollX).
      ctx.strokeStyle = "rgba(255,180,90,0.35)";
      ctx.lineWidth = 1;
      for (const d of C.lanes) {
        const y = JH.Geo.feetScreenY(d, 0);
        ctx.beginPath();
        for (let x = -((sc.scrollX * 0.6) % 40); x < JH.VIEW_W; x += 40) {
          ctx.moveTo(x, y); ctx.lineTo(x + 20, y);
        }
        ctx.stroke();
      }

      // Fire patches — ONE ellipse shared with the burn hit test.
      for (const p of sc.firePatches) {
        const px = p.worldX - sc.scrollX;
        if (px < -40 || px > JH.VIEW_W + 40) continue;
        const rx = p.r * 0.85, ry = rx * JH.GROUND_RY;
        ctx.fillStyle = "rgba(255,120,40," + (0.25 + 0.35 * (p.life / p.maxLife)) + ")";
        ctx.beginPath();
        ctx.ellipse(px, JH.Geo.feetScreenY(p.depth, 0), rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Hazards (placeholder blocks tinted by kind; real sprites in Task 9).
      const HCOL = { wreck: "#8a5a3a", fuse: "#ff7a3c", smelt: "#c98a3a", pyro: "#ff5a4a", dummy: "#8a5a3a" };
      for (const h of sc.hazards) {
        const hx = h.worldX - sc.scrollX;
        if (hx < -40 || hx > JH.VIEW_W + 40) continue;
        const hy = JH.Geo.feetScreenY(h.depth, 0);
        const w = h.kind === "smelt" ? 20 : 16;
        ctx.fillStyle = HCOL[h.kind] || "#8a5a3a";
        ctx.fillRect(hx - w / 2, hy - 14, w, 14);
      }

      // Embers (pyro shots).
      ctx.fillStyle = "#ffcf6a";
      for (const e of sc.embers) {
        const ex = e.worldX - sc.scrollX;
        if (ex < -8 || ex > JH.VIEW_W + 8) continue;
        ctx.fillRect(ex - 2, JH.Geo.feetScreenY(e.depth, 0) - 6, 4, 4);
      }

      // The truck (placeholder rect) + Jon on the running board.
      const ty = JH.Geo.feetScreenY(t.depth, 0);

      // Forward hose swath — ONE shape with the beamCovers hit test.
      if (sc.beam) {
        const nx = t.screenX + 20;
        const y0 = JH.Geo.feetScreenY(t.depth - C.hoseBand, 0);
        const y1 = JH.Geo.feetScreenY(t.depth + C.hoseBand, 0);
        const g = ctx.createLinearGradient(nx, 0, nx + sc.beam.range, 0);
        g.addColorStop(0, sc.beam.sputter ? "rgba(120,180,255,0.55)" : "rgba(150,210,255,0.75)");
        g.addColorStop(1, "rgba(150,210,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(nx, Math.min(y0, y1), sc.beam.range, Math.abs(y1 - y0));
      }
      ctx.fillStyle = t.invulnT > 0 ? "#ffd27a" : "#c0392b";
      ctx.fillRect(t.screenX - 26, ty - 18, 46, 18);
      ctx.fillStyle = "#e8e8e8";
      ctx.fillRect(t.screenX - 30, ty - 10, 8, 10);   // Jon at the nozzle
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(t.screenX - 22, ty - 3, 6, 6);
      ctx.fillRect(t.screenX + 8, ty - 3, 6, 6);

      // HP + water bars (honest, visible).
      this._bar(ctx, 8, 8, 90, t.hp / C.truckHp, "#e74c3c", "HP");
      this._bar(ctx, 8, 20, 90, t.water / C.tank, "#4aa3ff", "H2O");

      // Phase banner.
      if (sc.bannerT > 0 && sc.banner) {
        ctx.fillStyle = "#fff";
        ctx.font = "bold 16px monospace";
        ctx.textAlign = "center";
        ctx.fillText(sc.banner, JH.VIEW_W / 2, 40);
        ctx.textAlign = "left";
      }
    },

    _bar(ctx, x, y, w, frac, col, label) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(x - 1, y - 1, w + 2, 8);
      ctx.fillStyle = col;
      ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), 6);
      ctx.fillStyle = "#fff";
      ctx.font = "6px monospace";
      ctx.fillText(label, x + w + 4, y + 6);
    },
  };

  root.JH = root.JH || {};
  root.JH.TruckRun = TruckRun;
})(typeof window !== "undefined" ? window : globalThis);
