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
        camX0: JH.Camera.x,   // boarding camera — the backdrop continues from here
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
        hazards: [], firePatches: [], embers: [], spray: [],
        hydrants: [], pickups: [], furnace: null,
        slowT: 0, shakeT: 0,
        wallGap: C.wall.startGap,
        wallTouched: false,
        furnaceDone: false,
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
      // Drift the shared world camera slowly so the fire-world skyline pans
      // (seamless with the boarding scene) instead of cutting to a new backdrop.
      JH.Camera.x = Math.min(JH.LEVEL_LEN - JH.VIEW_W, sc.camX0 + sc.scrollX * 0.12);

      this._drive(dt, C, In);
      if (sc.phase !== "intro") {
        this._hose(dt, C);
        this._updateSpray(dt);
        this._spawnFromTimeline(sc);
        this._updateHazards(dt, C);
        this._updateFurnace(dt, C);
        this._updatePatches(dt, C);
        this._updateEmbers(dt, C);
        this._updatePickups(dt, C);
        if (sc.slowT > 0 && (sc.slowT -= dt) <= 0) sc.speedMult = 1;
        if (sc.shakeT > 0) sc.shakeT -= dt;
        if (sc.washFx && (sc.washFx.t += dt) > 0.4) sc.washFx = null;
        this._updateWall(dt, C);
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

      if (!t.spraying) return;

      const pr = JH.TruckBalance.truckPressure(C, t.water / C.tank);
      const range = C.hoseRange * pr.rangeMult;
      const dps = C.hoseDps * pr.dmgScale;
      const nozzleX = this._nozzleWorldX(sc);

      // Hazards in the beam take damage (shoot pyros/fuses out of the air).
      for (const h of sc.hazards) {
        const dx = h.worldX - nozzleX;
        if (JH.TruckBalance.beamCovers(t.depth, C.hoseBand, h.depth, dx, range)) {
          h.hp -= dps * dt;
          if (h.hp <= 0) { if (h.kind === "hydrant") this._popHydrant(h); h.dead = true; }
        }
      }
      sc.hazards = sc.hazards.filter((h) => !h.dead);

      // The beam puts out fires it sweeps over (only obstacles must be dodged).
      for (const p of sc.firePatches) {
        const dx = p.worldX - nozzleX;
        if (JH.TruckBalance.beamCovers(t.depth, C.hoseBand, p.depth, dx, range))
          p.life = Math.max(0, p.life - C.douseRate * dt);
      }

      // Boss weak-spot douse handled in _updateFurnace's successor (Pass 2).
      if (sc.furnace) {
        const f = sc.furnace, dx = f.worldX - nozzleX;
        if (JH.TruckBalance.beamCovers(t.depth, C.hoseBand, f.depth, dx, range)) {
          f.hp = JH.TruckBalance.douse(f.hp, dps, dt);
          if (f.hp <= 0) this._extinguishFurnace();
        }
      }

      // Emit the hose cone — the SAME contained water-droplet stream as Jon's
      // hose (JH.PAL water colours, cone spread), just longer/denser.
      const nozY = JH.Geo.feetScreenY(t.depth, 0) - 8;
      const sputter = pr.dmgScale < 1;
      const spread = sputter ? 0.5 : 1;
      const count = sputter ? 2 : 4;
      for (let i = 0; i < count; i++) {
        const perp = (Math.random() - 0.5) * C.hoseBand * 1.5 * spread;
        sc.spray.push({
          x: nozzleX - sc.scrollX + Math.random() * 6, y: nozY + perp * 0.35,
          vx: 210 + Math.random() * 150, vy: perp * 0.9,
          life: range / 260 + Math.random() * 0.05,
          size: Math.random() > 0.5 ? 3 : 2,
          color: Math.random() > 0.45 ? JH.PAL.waterHi : JH.PAL.water,
        });
      }
    },

    _updateSpray(dt) {
      const sc = this.scene;
      for (const d of sc.spray) { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 60 * dt; d.life -= dt; }
      sc.spray = sc.spray.filter((d) => d.life > 0);
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
        // Combat kinds + hydrants spawn here; cross pickups are wired in Task 7.
        if (ev.kind === "wreck" || ev.kind === "fuse" || ev.kind === "smelt" ||
            ev.kind === "pyro" || ev.kind === "hydrant")
          this._spawnHazard(ev);
        else if (ev.kind === "cross")
          this._spawnCross(sc.scrollX + JH.VIEW_W + 24, ev.depth, ev.value);
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
      else if (ev.kind === "hydrant") { h.hp = C.hydrantHp; h.dmg = 0; }
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

        // Collision with the truck. Hydrants pop friendly (refuel, no damage);
        // other hazards deal damage + a brief slow unless dashing/i-frames.
        if (Math.abs((h.worldX - sc.scrollX) - t.screenX) < 22 && Math.abs(h.depth - t.depth) < 14) {
          if (h.kind === "hydrant") {
            this._popHydrant(h);
          } else if (t.invulnT <= 0) {
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
      sc.wallGap = Math.max(0, sc.wallGap - C.wall.creepOnHit);   // wall creeps up
    },

    // Collapse wall: a non-lethal rubber-band. Clean driving rebuilds the lead;
    // collisions (via _collide) let it creep up. Contact burns + shoves the
    // truck forward + blocks backing up, but can never kill or halt progress.
    _updateWall(dt, C) {
      const sc = this.scene, W = C.wall, t = sc.truck;
      if (sc.slowT <= 0) sc.wallGap = Math.min(W.startGap, sc.wallGap + W.recoverRate * dt);
      if (sc.wallGap <= 4) {
        sc.wallTouched = true;
        this._damageTruck(JH.FIRE.burnDpsPerStack * W.contactBurnStacks * dt, true);
        if (sc.shakeT < 0.15) sc.shakeT = 0.15;
        t.screenX = Math.max(t.screenX, C.truckScreenX);          // can't brake into it
      }
    },

    _flash(text, dur) { this.scene.banner = text; this.scene.bannerT = dur; },

    // ---- climax: the furnace douse-race ---------------------------------
    // The forge rolls onto the road as a persistent boss that keeps pace ahead
    // of the truck and vents fire-patches into the lanes. Hold the beam on it to
    // extinguish it (TruckBalance.douse) before the gate; breaking it drops a
    // fat essence cross. Failing just means it falls behind (no penalty).
    _updateFurnace(dt, C) {
      const sc = this.scene, t = sc.truck, FU = C.furnace, E = JH.ENEMIES;
      if (!sc.furnace) {
        if (!sc.furnaceDone && sc.t >= FU.atSec) {
          sc.furnace = { worldX: sc.scrollX + t.screenX + 130, depth: C.lanes[1], hp: FU.hp, maxHp: FU.hp, ventT: FU.ventCd };
          this._flash("THE FURNACE! DOUSE IT!", 2.0);
        }
        return;
      }
      const f = sc.furnace;
      f.worldX = sc.scrollX + t.screenX + 130;      // rolls along, staying ahead
      if ((f.ventT -= dt) <= 0) {
        f.ventT = FU.ventCd;
        this._spawnPatch(sc.scrollX + t.screenX + 40 + Math.random() * 90,
          C.lanes[(Math.random() * C.lanes.length) | 0], E.furnace.ventPatchRadius, FU.ventPatchDur);
      }
    },

    _extinguishFurnace() {
      const sc = this.scene, C = JH.TRUCKRUN, f = sc.furnace;
      this._spawnCross(f.worldX, f.depth, C.furnace.essence);
      sc.furnace = null; sc.furnaceDone = true;
      sc.shakeT = 0.4;
      this._flash("FORGE EXTINGUISHED!", 2.0);
    },

    // ---- essence pickups (bank on contact via the Church) ---------------
    _spawnCross(worldX, depth, value) {
      this.scene.pickups.push({ worldX: worldX, depth: depth, value: value || 1, bob: 0 });
    },

    _updatePickups(dt, C) {
      const sc = this.scene, t = sc.truck;
      for (const p of sc.pickups) {
        p.bob += dt;
        if (Math.abs((p.worldX - sc.scrollX) - t.screenX) < 20 && Math.abs(p.depth - t.depth) < 16) {
          sc.essence += p.value;
          if (JH.Church && JH.Church.addEssence) JH.Church.addEssence(p.value);
          p.dead = true;
        }
        if (p.worldX < sc.scrollX - 40) p.dead = true;   // missed — scrolled past
      }
      sc.pickups = sc.pickups.filter((p) => !p.dead);
    },

    // Smashed hydrant: refuel the tank AND wash its lane — kill/soak hazards
    // and extinguish fire-patches within washRadius (ONE ellipse for draw+hit).
    _popHydrant(h) {
      const sc = this.scene, C = JH.TRUCKRUN, t = sc.truck;
      t.water = Math.min(C.tank, t.water + C.hydrantRefill);
      const rx = C.washRadius, ry = rx * JH.GROUND_RY;
      for (const o of sc.hazards) {
        if (o === h || o.kind === "hydrant") continue;
        if (JH.Geo.inGroundEllipse(o.worldX, o.depth, h.worldX, h.depth, rx, ry)) o.dead = true;
      }
      for (const p of sc.firePatches)
        if (JH.Geo.inGroundEllipse(p.worldX, p.depth, h.worldX, h.depth, rx, ry)) p.life = 0;
      sc.washFx = { worldX: h.worldX, depth: h.depth, r: C.washRadius, t: 0 };
    },

    _finish(game) {
      const sc = this.scene, C = JH.TRUCKRUN, t = sc.truck;
      // Clean-Escape bonus: full HP + no wall touch pays the top tier.
      const bonus = JH.TruckBalance.cleanBonus(C, t.hp / C.truckHp, sc.wallTouched);
      if (bonus > 0 && JH.Church && JH.Church.addEssence) JH.Church.addEssence(bonus);
      sc.essence += bonus;
      game.lastTruckEssence = sc.essence;   // for the arrival tally (Task 8)
      this.scene = null;
      JH.Camera.unlock && JH.Camera.unlock();
      game.afterTruckRun();
    },

    // ------------------------------------------------------------- RENDER
    renderScene(ctx, game) {
      const sc = this.scene; if (!sc) return;
      const C = JH.TRUCKRUN, t = sc.truck, A = JH.Assets;

      // Collision shake (small; real trauma model is the play world's).
      if (sc.shakeT > 0) {
        const m = sc.shakeT * 10;
        ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
      }

      // Same fire-world backdrop as the street (seamless with boarding): sky,
      // skyline, moon. The camera drifts in update so it pans, never clips.
      JH.Background.draw(ctx);

      // Road over the floor plane: asphalt + scrolling lane dashes + a fast
      // near strip that sells the speed.
      ctx.fillStyle = "#20140f";
      ctx.fillRect(0, JH.FLOOR_TOP, JH.VIEW_W, JH.VIEW_H - JH.FLOOR_TOP);
      ctx.strokeStyle = "rgba(255,170,90,0.30)";
      ctx.lineWidth = 1;
      for (const d of C.lanes) {
        const y = JH.Geo.feetScreenY(d, 0);
        ctx.beginPath();
        for (let x = -((sc.scrollX * 0.9) % 42); x < JH.VIEW_W; x += 42) { ctx.moveTo(x, y); ctx.lineTo(x + 22, y); }
        ctx.stroke();
      }
      ctx.fillStyle = "#3a2418";
      for (let x = -((sc.scrollX * 1.8) % 36); x < JH.VIEW_W; x += 36) ctx.fillRect(x, JH.VIEW_H - 6, 14, 6);

      // Collapse wall — slides in from the left as the gap closes.
      const wallRight = t.screenX - sc.wallGap;
      if (wallRight > 0) {
        const wg = ctx.createLinearGradient(0, 0, wallRight, 0);
        wg.addColorStop(0, "#ff3a0a"); wg.addColorStop(0.7, "#a51e04"); wg.addColorStop(1, "rgba(120,20,0,0.55)");
        ctx.fillStyle = wg;
        ctx.fillRect(0, 0, wallRight, JH.VIEW_H);
        if (sc.wallGap <= 4) {
          ctx.fillStyle = "#fff"; ctx.font = "bold 14px monospace"; ctx.textAlign = "center";
          ctx.fillText("FORWARD!", JH.VIEW_W / 2, 60); ctx.textAlign = "left";
        }
      }

      // Fire patches → reuse the fire-small FX; the ground-ellipse footprint is
      // still the burn hit test (the flames just sit on it).
      for (const p of sc.firePatches) {
        const px = p.worldX - sc.scrollX;
        if (px < -40 || px > JH.VIEW_W + 40) continue;
        A.drawFx(ctx, "fire-small", px, JH.Geo.feetScreenY(p.depth, 0), sc.t, { scale: 0.5 * (p.r / 28) });
      }

      // Hazards → real fire-roster sprites (fuse/smelt/pyro baked). Wrecks have
      // no sprite yet → charred block + a lick of fire.
      const SPR = { fuse: "fuse", smelt: "smelt", pyro: "pyro" };
      for (const h of sc.hazards) {
        const hx = h.worldX - sc.scrollX;
        if (hx < -40 || hx > JH.VIEW_W + 40) continue;
        const hy = JH.Geo.feetScreenY(h.depth, 0);
        if (h.kind === "hydrant") {
          A.shadow(ctx, hx, hy, 7); A.draw(ctx, "hydrant", hx, hy, 1, {});
        } else if (SPR[h.kind]) {
          A.shadow(ctx, hx, hy, 7); A.draw(ctx, SPR[h.kind], hx, hy, -1, { t: sc.t });
        } else {
          ctx.fillStyle = "#3a2a24"; ctx.fillRect(hx - 9, hy - 13, 18, 13);
          A.drawFx(ctx, "fire-small", hx, hy - 2, sc.t, { scale: 0.4 });
        }
      }

      // Furnace road-boss → the real furnace sprite + a themed HP bar.
      if (sc.furnace) {
        const f = sc.furnace, fx = f.worldX - sc.scrollX, fy = JH.Geo.feetScreenY(f.depth, 0);
        A.shadow(ctx, fx, fy, 14);
        A.draw(ctx, "furnace", fx, fy, -1, { t: sc.t, scale: 1.6 });
        const bw = 48, bf = Math.max(0, f.hp / f.maxHp);
        ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(fx - bw / 2 - 1, fy - 54, bw + 2, 5);
        ctx.fillStyle = "#4aa3ff"; ctx.fillRect(fx - bw / 2, fy - 53, bw * bf, 3);
      }

      // Essence crosses → the real essence_cross icon.
      for (const p of sc.pickups) {
        const px = p.worldX - sc.scrollX;
        if (px < -12 || px > JH.VIEW_W + 12) continue;
        const py = JH.Geo.feetScreenY(p.depth, 0) - Math.sin(p.bob * 4) * 2;
        A.draw(ctx, "essence_cross", px, py, 1, { t: p.bob });
      }

      // Embers (pyro shots).
      ctx.fillStyle = "#ffcf6a";
      for (const e of sc.embers) {
        const ex = e.worldX - sc.scrollX;
        if (ex < -8 || ex > JH.VIEW_W + 8) continue;
        ctx.fillRect(ex - 2, JH.Geo.feetScreenY(e.depth, 0) - 6, 4, 4);
      }

      // Hydrant lane-wash burst (expanding ring).
      if (sc.washFx) {
        const wx = sc.washFx.worldX - sc.scrollX, k = sc.washFx.t / 0.4;
        ctx.strokeStyle = "rgba(120,210,255," + (0.8 * (1 - k)) + ")";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(wx, JH.Geo.feetScreenY(sc.washFx.depth, 0), sc.washFx.r * (0.4 + k), sc.washFx.r * (0.4 + k) * JH.GROUND_RY, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // The truck (placeholder rect) + Jon on the running board.
      const ty = JH.Geo.feetScreenY(t.depth, 0);

      // Hose cone — the same water-droplet stream as Jon's hose.
      for (const d of sc.spray) {
        ctx.fillStyle = d.color;
        ctx.fillRect(d.x | 0, d.y | 0, d.size, d.size);
      }
      // Truck chassis (the one asset with no art yet — a nicer placeholder).
      A.shadow(ctx, t.screenX - 2, ty, 16);
      ctx.fillStyle = t.invulnT > 0 ? "#ffd27a" : "#b23324";
      ctx.fillRect(t.screenX - 28, ty - 16, 50, 16);              // tank body
      ctx.fillStyle = "#8f2a1e"; ctx.fillRect(t.screenX + 4, ty - 24, 18, 10); // cab
      ctx.fillStyle = "#cdd6dd"; ctx.fillRect(t.screenX - 34, ty - 12, 6, 8);  // mounted nozzle
      ctx.fillStyle = "#111";
      ctx.fillRect(t.screenX - 20, ty - 3, 7, 5); ctx.fillRect(t.screenX + 8, ty - 3, 7, 5);
      // Jon manning the nozzle (real sprite; spray pose while firing).
      A.draw(ctx, "jon", t.screenX - 12, ty - 14, 1, {
        state: t.spraying ? "spray" : "idle", frame: 0, t: sc.t, walking: false,
        waterFrac: t.water / C.tank,
      });

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
