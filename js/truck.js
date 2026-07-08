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

  // Phase timing (seconds). intro settle → run (hazards) → boss (Firewall).
  const INTRO_T = 1.5;

  // Gate Crash finale phases (after the Firewall breaks). The road sim is
  // fully off during these; JH.TRUCKRUN.finale carries every number.
  const FINALE_PHASES = { detonate: 1, whiteout: 1, reveal: 1, crash: 1, walk: 1 };

  // Hero truck sprite lives in the "truck" painter (assets.js): a 5-frame
  // wheel-spin strip. CANNON_* is the spray origin offset from the draw anchor
  // (horizontal centre, feet on the road) to the roof cannon's barrel tip; the
  // wheel frame advances every DRIVE_STEP px of scroll.
  const CANNON_DX = 32, CANNON_DY = -69, DRIVE_STEP = 12;

  const TruckRun = {
    enter(game) {
      const C = JH.TRUCKRUN;
      game.state = "truck";
      const hud = document.getElementById("hud");
      if (hud) hud.classList.add("hidden");
      const banner = document.getElementById("banner");
      if (banner) banner.classList.add("hidden");
      JH.Camera.lock && JH.Camera.lock();
      if (JH.Music && JH.Music.setTrack) JH.Music.setTrack("escape");   // win() hands back to "level"

      this.scene = {
        t: 0,                 // elapsed run time (drives phase + timeline)
        phase: "intro",       // intro → run → boss → finale (Gate Crash)
        fadeIn: 0.35,         // s of black-in continuing the boarding fade-out
        camX0: JH.Camera.x,   // boarding camera — the backdrop continues from here
        scrollX: 0,           // world px scrolled (own coordinate space)
        speedMult: 1,         // scroll multiplier (collisions slow it — Task 4)
        truck: {
          depth: JH.DEPTH_MAX * 0.5,
          screenX: -70,       // slides in from off-screen left during the intro
          hp: C.truckHp,
          water: C.tank,
          spraying: false,
          regenLock: 0,
          dashTimer: 0, dashCdTimer: 0, dashDir: 0,
          invulnT: 0, burnT: 0, hitFlashT: 0,
        },
        // Hazards/patches/embers, hydrants, pickups; firewall is the climax.
        hazards: [], firePatches: [], embers: [], spray: [],
        hydrants: [], pickups: [], firewall: null,
        slowT: 0, shakeT: 0,
        wallGap: C.wall.startGap,
        wallTouched: false,
        firewallDone: false,
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
      if (sc.fadeIn > 0) sc.fadeIn -= dt;

      // ---- Wrecked: blast beat + fade, then a fresh run (never the Church).
      if (sc.phase === "wrecked") {
        sc.wreckedT += dt;
        if (sc.shakeT > 0) sc.shakeT -= dt;
        if (sc.wreckedT >= C.deathBeat) { this.enter(game); }
        return;
      }

      // ---- Gate Crash finale: its own update; road sim + input are off.
      if (FINALE_PHASES[sc.phase]) { this._updateFinale(dt, game, C); return; }

      // ---- phase machine: intro → run (hazards) → boss (Firewall) → finale (Gate Crash)
      if (sc.phase === "intro") {
        // Ease the truck in from off-screen left to its resting screen-x.
        const k = Math.min(1, sc.t / INTRO_T);
        sc.truck.screenX = -70 + (C.truckScreenX + 70) * (k * (2 - k));
        if (sc.t >= INTRO_T) { sc.phase = "run"; this._banner(game, "ESCAPE THE FIRE!", 1.6); }
      } else if (sc.phase === "run") {
        if (!sc.firewall && !sc.firewallDone && sc.t >= C.firewall.atSec) {
          this._spawnFirewall(C);
          sc.phase = "boss";
          this._banner(game, "THE FIREWALL BLOCKS THE ROAD!", 2.2);
        }
      }

      // ---- scroll (paused during the intro settle)
      if (sc.phase !== "intro") sc.scrollX += C.scrollSpeed * sc.speedMult * dt;
      // Drift the shared world camera slowly so the fire-world skyline pans
      // (seamless with the boarding scene) instead of cutting to a new backdrop.
      JH.Camera.x = Math.min(JH.LEVEL_LEN - JH.VIEW_W, sc.camX0 + sc.scrollX * 0.12);

      if (sc.phase !== "intro") this._drive(dt, C, In);   // intro owns screenX (slide-in)
      if (sc.phase !== "intro") {
        this._hose(dt, C);
        this._updateSpray(dt);
        if (sc.phase === "run") this._spawnFromTimeline(sc);   // no new traffic at the boss
        this._updateHazards(dt, C);
        if (sc.phase === "boss") this._updateFirewall(dt, C);
        this._updatePatches(dt, C);
        this._updateEmbers(dt, C);
        this._updatePickups(dt, C);
        if (sc.slowT > 0 && (sc.slowT -= dt) <= 0) sc.speedMult = 1;
        if (sc.shakeT > 0) sc.shakeT -= dt;
        if (sc.washFx && (sc.washFx.t += dt) > 0.4) sc.washFx = null;
        if (sc.phase === "run") this._updateWall(dt, C);       // collapse recedes at the boss
      }
    },

    // Truck movement: depth = dodge/aim axis, screen-x = throttle/brake,
    // dash = swerve (buffered edge + i-frames), spray = hold (used in Task 3).
    _drive(dt, C, In) {
      const sc = this.scene, t = sc.truck;
      const mx = (In.held("right") ? 1 : 0) - (In.held("left") ? 1 : 0);
      const my = (In.held("down") ? 1 : 0) - (In.held("up") ? 1 : 0);

      // Dash: buffered edge, off cooldown → depth burst with i-frames.
      if (t.dashCdTimer > 0) t.dashCdTimer -= dt;
      if (t.dashTimer > 0) t.dashTimer -= dt;
      if (t.invulnT > 0) t.invulnT -= dt;
      if (t.hitFlashT > 0) t.hitFlashT -= dt;
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
      // Left/right limits. The right limit is normally the throttle band, but
      // during the Firewall it becomes the boss's BODY (its chassis face) —
      // no invisible wall. Crowding the body chips HP on a contact cooldown.
      const leftLim = C.truckScreenX - C.throttleBand;
      const fw = sc.firewall;
      let rightLim = C.truckScreenX + C.throttleBand;
      if (fw && !fw.dying) rightLim = fw.screenX - C.firewall.bodyFront;
      t.screenX = Math.max(leftLim, Math.min(rightLim, t.screenX));
      if (t.bodyCd > 0) t.bodyCd -= dt;
      if (fw && !fw.dying && t.screenX >= rightLim - 0.5 && (t.bodyCd || 0) <= 0) {
        t.bodyCd = C.firewall.bodyContactCd;
        this._bodyBump(C);
      }

      t.spraying = In.held("spray");
    },

    // Small chip for grinding the Firewall's body. No i-frames (unlike a real
    // hit) so it can't be used to tank SLAM/SURGE — it's a nudge, not a shield.
    _bodyBump(C) {
      const sc = this.scene, t = sc.truck;
      t.hp = Math.max(0, t.hp - C.firewall.bodyDmg);
      if (t.hp <= 0 && sc.phase !== "wrecked") { this._wreckTruck(); return; }
      t.hitFlashT = Math.max(t.hitFlashT, 0.12);
      sc.shakeT = Math.max(sc.shakeT, 0.12);
      if (JH.AudioFX && JH.AudioFX.play) JH.AudioFX.play("whack");
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

      // The hose clears the road: any shootable enemy IN FRONT dies, across all
      // lanes (no lane-match needed). Wrecks are obstacles (dodge them) and
      // hydrants are positional (pop on contact) — both beam-immune.
      for (const h of sc.hazards) {
        if (h.kind === "wreck" || h.kind === "hydrant") continue;
        const dx = h.worldX - nozzleX;
        if (dx >= 0 && dx <= range) {
          h.hp -= dps * dt;
          // Same feedback as Jon's hose: wetness soak + hurt flash + knockback
          // (stronger here — truck-mounted cannon). Shoves the enemy forward.
          h.wet = Math.min(1, h.wet + JH.JUICE.wetPerHit);
          h.hurtT = 0.18;
          h.knockVX += C.knockback * dt * 2.2;
          if (h.hp <= 0) h.dead = true;
        }
      }
      sc.hazards = sc.hazards.filter((h) => !h.dead);

      // The beam puts out any fire in front of the truck.
      for (const p of sc.firePatches) {
        const dx = p.worldX - nozzleX;
        if (dx >= 0 && dx <= range) p.life = Math.max(0, p.life - C.douseRate * dt);
      }

      // Firewall: the beam only bites the WEAK SPOT, and only while it's OPEN
      // and lane-matched (armored body is immune) — the boss keeps its strict
      // depth-match skill. dx in screen space.
      const fw = sc.firewall;
      if (fw && fw.wsState === "open") {
        const dx = fw.screenX - (t.screenX + 20);
        if (JH.TruckBalance.beamCovers(t.depth, C.firewall.wsBand, fw.wsDepth, dx, range)) {
          fw.hp -= dps * C.firewall.dmgMult * dt;
          fw.hitFlash = 0.1;
          // Kill → finale starts; skip this frame's droplet emission (they'd
          // hang frozen — the finale update doesn't tick spray).
          if (fw.hp <= 0) { this._breakFirewall(); return; }
        }
      }

      // Emit the hose cone from the TOP-mounted cannon — same water-droplet
      // stream as Jon's hose (JH.PAL colours, cone spread), arcing forward down
      // onto the road ahead.
      const gunX = t.screenX + CANNON_DX, gunY = JH.Geo.feetScreenY(t.depth, 0) + CANNON_DY;
      const sputter = pr.dmgScale < 1;
      const spread = sputter ? 0.5 : 1;
      const count = sputter ? 2 : 4;
      for (let i = 0; i < count; i++) {
        const perp = (Math.random() - 0.5) * C.hoseBand * 1.5 * spread;
        sc.spray.push({
          x: gunX + Math.random() * 4, y: gunY + perp * 0.35,
          vx: 210 + Math.random() * 150, vy: perp * 0.9 + 18,   // downward bias → arcs onto the lane
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
        wet: 0, knockVX: 0, hurtT: 0,          // normal-game spray feedback
      };
      if (ev.kind === "wreck") { h.hp = C.wreckHp; h.dmg = C.wreckDmg; }
      else if (ev.kind === "fuse") { h.hp = E.fuse.hp; h.dmg = E.fuse.blastDmg; h.speed = E.fuse.speed; }
      else if (ev.kind === "smelt") { h.hp = E.smelt.hp; h.dmg = E.smelt.touchDmg; }
      else if (ev.kind === "pyro") { h.hp = E.pyro.hp; h.dmg = E.pyro.touchDmg; }
      else if (ev.kind === "hydrant") { h.hp = C.hydrantHp; h.dmg = 0; }
      h.maxHp = h.hp;
      sc.hazards.push(h);
    },

    _updateHazards(dt, C) {
      const sc = this.scene, t = sc.truck, E = JH.ENEMIES;
      const truckWorldX = sc.scrollX + t.screenX;
      for (const h of sc.hazards) {
        // Spray feedback physics: knockback drift (decays), wetness dries, hurt
        // flash ticks — same model as the normal game's enemies.
        if (h.knockVX) {
          h.worldX += h.knockVX * dt;
          h.knockVX *= Math.pow(0.0001, dt);
          if (Math.abs(h.knockVX) < 2) h.knockVX = 0;
        }
        if (h.wet > 0) h.wet = Math.max(0, h.wet - JH.JUICE.wetDryPerSec * dt);
        if (h.hurtT > 0) h.hurtT -= dt;

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

    // Honest truck HP: clamps at 0, and 0 WRECKS the truck (run restarts —
    // see _wreckTruck). Real hits get Jon's on-hit effect — white flash +
    // i-frames + "hurt" sound + screen kick (no hitstop, same as the player).
    // `quiet` (burn/wall tick) just chips HP but can still wreck.
    _damageTruck(amount, quiet) {
      const sc = this.scene, t = sc.truck;
      t.hp = Math.max(0, t.hp - amount);
      if (t.hp <= 0 && sc.phase !== "wrecked") { this._wreckTruck(); return; }
      if (quiet) return;
      t.hitFlashT = 0.18;
      t.invulnT = Math.max(t.invulnT, JH.PLAYER.invuln);
      sc.shakeT = 0.35;
      if (JH.AudioFX && JH.AudioFX.play) JH.AudioFX.play("hurt");
    },

    // hp 0: blast beat + fade to black, then the escape restarts fresh via
    // enter() — no Church during the truck level. Banked essence stays banked
    // (crosses pay on contact, same as the road fiction).
    _wreckTruck() {
      const sc = this.scene;
      sc.phase = "wrecked";
      sc.wreckedT = 0;
      sc.speedMult = 0;
      sc.truck.hitFlashT = 0.4;
      sc.shakeT = 0.6;
      this._flash("WRECKED!", 1.4);
      if (JH.AudioFX && JH.AudioFX.play) JH.AudioFX.play("die");
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

    // ---- climax: The Firewall (JH.WALLBOSS mechanics on the road) --------
    // Armored wall pinned ahead. Only the WEAK SPOT takes damage, and only
    // while OPEN (it cycles closed→wind→open) and lane-matched (it roams in
    // depth). SURGE rolls a bolt down its lane (dodge by lane); PORT SLAM
    // punches the forward zone (don't crowd it). Break it → the road opens.
    _spawnFirewall(C) {
      const FW = C.firewall;
      this.scene.firewall = {
        hp: FW.hp, maxHp: FW.hp, screenX: FW.screenX,
        wsDepth: C.lanes[1], wsTarget: C.lanes[1],
        wsState: "closed", wsT: FW.wsClosed, wsRetargetT: FW.wsRetarget,
        surgeT: FW.surgeCd, surge: null,
        slamT: FW.slamCd, slamState: null, slamStateT: 0,
        tslT: FW.tslCd, tslState: null, tslStateT: 0, tslHit: 0, tslDepth: 0, tslX: 0,
        hitFlash: 0,
      };
    },

    _updateFirewall(dt, C) {
      const sc = this.scene, t = sc.truck, FW = C.firewall, fw = sc.firewall;
      if (!fw) return;
      if (fw.hitFlash > 0) fw.hitFlash -= dt;

      // Weak-spot cycle: closed → wind (opening tell) → open (vulnerable).
      if ((fw.wsT -= dt) <= 0) {
        if (fw.wsState === "closed") { fw.wsState = "wind"; fw.wsT = FW.wsWind; }
        else if (fw.wsState === "wind") { fw.wsState = "open"; fw.wsT = FW.wsOpen; }
        else { fw.wsState = "closed"; fw.wsT = FW.wsClosed; }
      }
      // Weak spot roams in depth — line up your lane to hit it.
      if ((fw.wsRetargetT -= dt) <= 0) { fw.wsRetargetT = FW.wsRetarget; fw.wsTarget = C.lanes[(Math.random() * C.lanes.length) | 0]; }
      fw.wsDepth += Math.sign(fw.wsTarget - fw.wsDepth) * Math.min(Math.abs(fw.wsTarget - fw.wsDepth), FW.wsRoam * dt);

      // SURGE: a bolt rolls left down the core's lane — dodge by changing lane.
      if (!fw.surge && (fw.surgeT -= dt) <= 0) { fw.surgeT = FW.surgeCd; fw.surge = { x: fw.screenX, depth: fw.wsDepth }; this._flash("SURGE!", 0.7); }
      if (fw.surge) {
        const s = fw.surge; s.x -= FW.surgeSpeed * dt;
        if (Math.abs(s.x - t.screenX) < 14 && Math.abs(s.depth - t.depth) < 12 && t.invulnT <= 0) {
          this._damageTruck(FW.surgeDmg); this._collide(C); fw.surge = null;
        } else if (s.x < -10) fw.surge = null;
      }

      // PORT SLAM: telegraph → forward slab. Back off the wall to dodge.
      if (!fw.slamState && (fw.slamT -= dt) <= 0) { fw.slamState = "wind"; fw.slamStateT = FW.slamWind; }
      if (fw.slamState === "wind" && (fw.slamStateT -= dt) <= 0) {
        fw.slamState = "strike"; fw.slamStateT = 0.3;
        if (t.screenX > fw.screenX - FW.slamReach && t.invulnT <= 0) { this._damageTruck(FW.slamDmg); this._collide(C); }
      } else if (fw.slamState === "strike" && (fw.slamStateT -= dt) <= 0) {
        fw.slamState = null; fw.slamT = FW.slamCd;
      }

      // TENTACLE SLAM: a triple overhead spot-slam (callback to the Switch/GK
      // cable slam), unlocked once the Firewall is weakened. Locks a spot,
      // telegraphs, strikes ×3 with a gap between — leave the spot each time.
      if (fw.tslState == null && fw.hp <= fw.maxHp * FW.tslHpFrac && (fw.tslT -= dt) <= 0) {
        fw.tslState = "wind"; fw.tslStateT = FW.tslWind; fw.tslHit = 0;
        fw.tslDepth = t.depth; fw.tslX = t.screenX;
        this._flash("TENTACLE SLAM!", 0.7);
      }
      if (fw.tslState === "wind" && (fw.tslStateT -= dt) <= 0) {
        fw.tslState = "strike"; fw.tslStateT = FW.tslStrike;
        if (Math.abs(t.screenX - fw.tslX) < FW.tslBand * 1.6 &&
            Math.abs(t.depth - fw.tslDepth) < FW.tslBand && t.invulnT <= 0) {
          this._damageTruck(FW.tslDmg); this._collide(C);
        }
        sc.shakeT = Math.max(sc.shakeT, 0.3);
        if (JH.AudioFX && JH.AudioFX.play) JH.AudioFX.play("whack");
      } else if (fw.tslState === "strike" && (fw.tslStateT -= dt) <= 0) {
        if (++fw.tslHit >= 3) { fw.tslState = null; fw.tslT = FW.tslCd; }
        else { fw.tslState = "gap"; fw.tslStateT = FW.tslGap; }
      } else if (fw.tslState === "gap" && (fw.tslStateT -= dt) <= 0) {
        fw.tslState = "wind"; fw.tslStateT = FW.tslWind;
        fw.tslDepth = t.depth; fw.tslX = t.screenX;   // retarget the spot each hit
      }
    },

    // The kill: the Firewall doesn't despawn — it detonates. Essence banks
    // immediately (the truck never drives past the kill point), input locks,
    // and the finale chain starts: detonate → whiteout → reveal → crash → walk.
    _breakFirewall() {
      const sc = this.scene, C = JH.TRUCKRUN, fw = sc.firewall;
      fw.dying = true; fw.surge = null; fw.slamState = null; fw.tslState = null; fw.wsState = "closed";
      sc.spray = [];   // in-flight droplets would hang frozen (finale skips _updateSpray)
      sc.essence += C.firewall.essence;
      if (JH.Church && JH.Church.addEssence) JH.Church.addEssence(C.firewall.essence);
      sc.firewallDone = true;
      sc.shakeT = 0.5;
      sc.phase = "detonate";
      sc.finale = {
        t: 0, nextBoom: 0, booms: [], staged: false,
        truckX: 0, crashed: false, gateOpen: false,
        jon: null, jonT: 0, standT: 0, enterT: 0,
        walkFrame: 0, walkDist: 0, facing: 1,
      };
      this._flash("FIREWALL DOWN!  +" + C.firewall.essence + " ESSENCE", 2.0);
      if (JH.AudioFX && JH.AudioFX.play) JH.AudioFX.play("blast");
    },

    // ---- Gate Crash finale update -----------------------------------------
    _walkGroundY() { return JH.Geo.feetScreenY(JH.DEPTH_MAX * 0.5, 0); },

    _updateFinale(dt, game, C) {
      const sc = this.scene, F = C.finale, fin = sc.finale, TB = JH.TruckBalance;
      fin.t += dt;
      if (sc.shakeT > 0) sc.shakeT -= dt;
      if (fin.landPoofT != null) fin.landPoofT += dt;
      if (fin.flashT > 0) fin.flashT -= dt;

      if (sc.phase === "detonate") {
        // Road scroll eases to a stop while the chassis cooks off.
        sc.speedMult = Math.max(0, 1 - fin.t / F.scrollEase);
        sc.scrollX += C.scrollSpeed * sc.speedMult * dt;
        JH.Camera.x = Math.min(JH.LEVEL_LEN - JH.VIEW_W, sc.camX0 + sc.scrollX * 0.12);
        const prog = fin.t / F.detonateT;
        if ((fin.nextBoom -= dt) <= 0) {
          fin.nextBoom = TB.boomInterval(F, prog);
          fin.booms.push({
            x: sc.firewall.screenX + Math.random() * 70,
            y: JH.Geo.feetScreenY(JH.DEPTH_MAX, 0) - Math.random() * 150,
            born: sc.t, kind: "boom-mid", scale: TB.boomScale(F, prog),
          });
          sc.shakeT = Math.max(sc.shakeT, 0.15 + 0.3 * prog);
          if (JH.AudioFX && JH.AudioFX.play) JH.AudioFX.play("blast");
        }
        if (fin.t >= F.detonateT) {
          sc.phase = "whiteout"; fin.t = 0;
          fin.booms.push({
            x: sc.firewall.screenX + 30, y: this._walkGroundY() - 60,
            born: sc.t, kind: "boom-big", scale: 1.6,
          });
          sc.shakeT = 0.6;
          if (JH.AudioFX && JH.AudioFX.play) JH.AudioFX.play("blast");
        }
      } else if (sc.phase === "whiteout") {
        if (!fin.staged && fin.t >= F.whiteRamp) this._stageWalkway(C);
        if (fin.t >= F.whiteRamp + F.whiteHold) { sc.phase = "reveal"; fin.t = 0; }
      } else if (sc.phase === "reveal") {
        this._advanceWalkwayActors(dt, C);
      } else if (sc.phase === "crash") {
        this._advanceWalkwayActors(dt, C);   // Jon may still be bouncing in
        if (fin.jon.state === "down" && fin.t >= F.standDelay) {
          fin.standT += dt;
          if (fin.standT >= F.standDur) {
            fin.jon.state = "stand";
            sc.phase = "walk"; fin.t = 0;
            this._flash("WALK ON →", 3.0);
          }
        }
      } else if (sc.phase === "walk") {
        this._walkJon(dt, game, C);
        if (!this.scene) return;             // _finish() tears the scene down
      }

      fin.booms = fin.booms.filter((b) => sc.t - b.born < 0.9);
    },

    // Restaged behind the full white: the road becomes the walkway tableau.
    _stageWalkway(C) {
      const sc = this.scene, F = C.finale, fin = sc.finale;
      fin.staged = true;
      sc.hazards = []; sc.firePatches = []; sc.embers = []; sc.spray = [];
      sc.pickups = []; sc.washFx = null; sc.firewall = null;
      fin.truckX = F.truckStartX;
      fin.jon = { state: "air", x: F.throw.startX, y: 0, rot: 0 };
      fin.jonT = 0;
    },

    // Reveal/crash actors: Jon's blast-throw arc + the runaway truck.
    _advanceWalkwayActors(dt, C) {
      const sc = this.scene, F = C.finale, fin = sc.finale, TB = JH.TruckBalance;
      if (fin.jon.state === "air") {
        fin.jonT += dt;
        const a = TB.throwArc(F, this._walkGroundY(), fin.jonT);
        fin.jon.x = a.x; fin.jon.y = a.y; fin.jon.rot = a.rot;
        if (a.done) {
          fin.jon.state = "down"; fin.jon.rot = 0;
          fin.landPoofT = 0;   // landing cloud poof timer
          if (JH.AudioFX && JH.AudioFX.play) JH.AudioFX.play("whack");
        }
      }
      if (!fin.crashed) {
        fin.truckX += F.truckSpeed * dt;
        if (fin.truckX >= F.gate.x - F.gate.crashPad) {
          fin.crashed = true; fin.gateOpen = true;
          sc.phase = "crash"; fin.t = 0; fin.standT = 0;
          fin.flashT = 0.12;   // impact micro-flash
          const gy = this._walkGroundY();
          for (let i = 0; i < 3; i++) fin.booms.push({
            x: F.gate.x - F.gate.crashPad + 10 + Math.random() * 40,
            y: gy - 20 - Math.random() * 60,
            born: sc.t + i * 0.08, kind: "boom-big", scale: 1 + Math.random() * 0.4,
          });
          sc.shakeT = 0.6;
          if (JH.AudioFX && JH.AudioFX.play) JH.AudioFX.play("blast");
        }
      }
    },

    // Player-controlled walk to the gate; contact with the gate mouth enters.
    _walkJon(dt, game, C) {
      const sc = this.scene, F = C.finale, fin = sc.finale, In = JH.Input;
      if (fin.enterT > 0) {
        fin.enterT += dt;
        if (fin.enterT >= F.enterFade) this._finish(game);
        return;
      }
      const mx = (In.held("right") ? 1 : 0) - (In.held("left") ? 1 : 0);
      if (mx !== 0) {
        fin.jon.x = Math.max(F.walkMinX, fin.jon.x + mx * F.walkSpeed * dt);
        fin.facing = mx;
        fin.walkDist += Math.abs(mx) * F.walkSpeed * dt;
        fin.walkFrame = Math.floor(fin.walkDist / 8);
        fin.jon.state = "walk";
      } else fin.jon.state = "stand";
      if (JH.TruckBalance.gateReached(F, fin.jon.x)) {
        fin.enterT = 0.0001;
        if (JH.AudioFX && JH.AudioFX.play) JH.AudioFX.play("upgrade");
      }
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

    // Doc-Ock cables fanning off the wall over the road; count grows as HP
    // falls (2 → cableMax). Idle dressing — the TENTACLE SLAM is the threat.
    _drawFirewallCables(ctx, fw, wx, floorBottom, sc, C) {
      const P = JH.PAL;
      const hpFrac = Math.max(0, fw.hp / fw.maxHp);
      const n = Math.min(C.firewall.cableMax, 2 + Math.round((C.firewall.cableMax - 2) * (1 - hpFrac)));
      ctx.save();
      ctx.strokeStyle = P.cable; ctx.lineWidth = 2; ctx.lineCap = "round";
      for (let i = 0; i < n; i++) {
        const ph = sc.t * 3 + i * 1.3;
        const baseX = wx + 8, baseY = floorBottom - 26 - (i % 5) * 30;
        const reach = 26 + (i % 3) * 16;
        const ex = baseX - reach - Math.sin(ph) * 7;      // wave out LEFT, over the road
        const ey = baseY + Math.cos(ph) * 12;
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.quadraticCurveTo(baseX - reach * 0.5, baseY + Math.sin(ph) * 14, ex, ey);
        ctx.stroke();
        ctx.fillStyle = (Math.floor(sc.t * 6 + i) % 2) ? "#ff5a5a" : P.wallbossCoreHi;
        ctx.fillRect(Math.round(ex - 1.5), Math.round(ey - 1.5), 3, 3);
      }
      ctx.restore();
    },

    // TENTACLE SLAM: a thick cable raised over a locked floor spot (wind) that
    // drives down onto it (strike). The floor ellipse IS the hit region.
    _drawFirewallTentacle(ctx, fw, wx, floorBottom, sc, C) {
      const FW = C.firewall, P = JH.PAL;
      const sx = fw.tslX, sy = JH.Geo.feetScreenY(fw.tslDepth, 0);
      const rx = FW.tslBand * 1.6, ry = FW.tslBand * JH.GROUND_RY * 1.2;
      const strike = fw.tslState === "strike";
      ctx.save();
      if (strike) {
        ctx.fillStyle = "rgba(120,240,255,0.65)";
        ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#dffaff"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      } else if (fw.tslState === "wind") {
        const prog = 1 - fw.tslStateT / FW.tslWind;
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = (Math.floor(sc.t * 12) & 1) ? "#ff5a5a" : "#ffd23f"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.12 + 0.3 * prog;
        ctx.fillStyle = "#ff5a5a";
        ctx.beginPath(); ctx.ellipse(sx, sy, rx * prog, ry * prog, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (fw.tslState !== "gap") {
        const baseX = wx + 10, baseY = floorBottom - 120;
        const prog = strike ? 1 : 1 - fw.tslStateT / FW.tslWind;
        const tipY = strike ? sy : baseY + (sy - baseY) * (0.12 + 0.18 * prog);
        ctx.strokeStyle = P.cable; ctx.lineWidth = strike ? 5 : 4; ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.quadraticCurveTo((baseX + sx) / 2 + Math.sin(sc.t * 8) * 6, (baseY + tipY) / 2, sx, tipY);
        ctx.stroke();
        ctx.fillStyle = strike ? "#dffaff" : "#ff5a5a";
        ctx.beginPath(); ctx.ellipse(sx, tipY, 4, 4, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
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

      // ---- Gate Crash walkway phases render their own tableau.
      if (sc.phase === "reveal" || sc.phase === "crash" || sc.phase === "walk") {
        this._renderWalkway(ctx, sc, C);
        // Enter-the-gate fade (blue-white) rides on top of the tableau.
        if (sc.finale.enterT > 0) {
          const k = Math.min(1, sc.finale.enterT / C.finale.enterFade);
          ctx.fillStyle = "rgba(214,235,255," + k + ")";
          ctx.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H);
        }
        // White-in: the whiteout keeps fading as the reveal starts.
        const wA = JH.TruckBalance.finaleWhite(C.finale, sc.phase, sc.finale.t);
        if (wA > 0) { ctx.fillStyle = "rgba(255,255,255," + wA + ")"; ctx.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H); }
        if (sc.bannerT > 0 && sc.banner) {
          ctx.fillStyle = "#fff"; ctx.font = "bold 16px monospace"; ctx.textAlign = "center";
          ctx.fillText(sc.banner, JH.VIEW_W / 2, 40); ctx.textAlign = "left";
        }
        return;
      }

      // Same fire-world backdrop as the street (seamless with boarding): sky,
      // skyline, moon. The camera drifts in update so it pans, never clips.
      JH.Background.draw(ctx);

      // Same street floor as the overworld, anchored to the road scroll: at
      // scrollX 0 it matches the boarding street pixel-for-pixel, then races.
      // Drive-lane guides + a fast near strip sell the speed on top.
      JH.Background.drawFloor(ctx, sc.camX0 + sc.scrollX * 0.9);
      ctx.strokeStyle = "rgba(255,170,90,0.30)";
      ctx.lineWidth = 1;
      for (const d of C.lanes) {
        const y = JH.Geo.feetScreenY(d, 0);
        ctx.beginPath();
        for (let x = -((sc.scrollX * 0.9) % 42); x < JH.VIEW_W; x += 42) { ctx.moveTo(x, y); ctx.lineTo(x + 22, y); }
        ctx.stroke();
      }
      ctx.fillStyle = "#3a4154";
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
      // The world coming down behind you: ember haze + falling debris on the
      // left edge (always), spreading across the wall face when it's on screen
      // — same crumble language as the overworld's drawCrumble.
      {
        const crumbleW = Math.max(28, wallRight + 16);
        ctx.fillStyle = "rgba(140,28,0,0.10)";
        ctx.fillRect(0, 0, Math.min(crumbleW, 90), JH.VIEW_H);
        ctx.fillStyle = "#4a3a34";
        for (let i = 0; i < 14; i++) {
          const seed = i * 97.13;
          const x = (seed * 7.7) % crumbleW;
          const speed = 60 + (i % 5) * 26;
          const y = ((sc.t * speed + seed * 13) % (JH.VIEW_H + 20)) - 10;
          const s = 2 + (i % 3);
          ctx.fillRect(x, y, s, s);
        }
      }

      // Fire patches → reuse the fire-small FX; the ground-ellipse footprint is
      // still the burn hit test (the flames just sit on it).
      for (const p of sc.firePatches) {
        const px = p.worldX - sc.scrollX;
        if (px < -40 || px > JH.VIEW_W + 40) continue;
        A.drawFx(ctx, "fire-small", px, JH.Geo.feetScreenY(p.depth, 0), sc.t, { scale: 0.5 * (p.r / 28) });
      }

      // Hazards → real sprites with the normal-game hurt read (wetness tint) +
      // a health bar when damaged. Wrecks are charred obstacles.
      const SPR = { fuse: "fuse", smelt: "smelt", pyro: "pyro" };
      for (const h of sc.hazards) {
        const hx = h.worldX - sc.scrollX;
        if (hx < -40 || hx > JH.VIEW_W + 40) continue;
        const hy = JH.Geo.feetScreenY(h.depth, 0);
        if (h.kind === "hydrant") {
          A.shadow(ctx, hx, hy, 7); A.draw(ctx, "hydrant", hx, hy, 1, {});
        } else if (SPR[h.kind]) {
          A.shadow(ctx, hx, hy, 7); A.draw(ctx, SPR[h.kind], hx, hy, -1, { t: sc.t, wet: h.wet });
        } else {
          ctx.fillStyle = "#3a2a24"; ctx.fillRect(hx - 9, hy - 13, 18, 13);
          A.drawFx(ctx, "fire-small", hx, hy - 2, sc.t, { scale: 0.4 });
        }
        if (h.hp < h.maxHp && h.kind !== "wreck" && h.kind !== "hydrant") {
          const w = 18, bx = Math.round(hx - w / 2), by = Math.round(hy - 26);
          ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(bx, by, w, 3);
          ctx.fillStyle = "#ff5a5a"; ctx.fillRect(bx, by, Math.round(w * (h.hp / h.maxHp)), 3);
        }
      }

      // The Firewall — the real wallboss chassis + iris core (JH.WALLBOSS art).
      if (sc.firewall) {
        const fw = sc.firewall, FW = C.firewall, wx = fw.screenX, P = JH.PAL;
        const floorBottom = JH.Geo.feetScreenY(JH.DEPTH_MAX, 0);
        // PORT SLAM — the boss's own crush telegraph: a red zone punching
        // forward from the face (back off to dodge).
        if (fw.slamState === "wind" || fw.slamState === "strike") {
          const prog = fw.slamState === "strike" ? 1 : Math.max(0, 1 - fw.slamStateT / FW.slamWind);
          const yT = JH.Geo.feetScreenY(JH.DEPTH_MIN, 0) - 40, yB = floorBottom + 6;
          ctx.fillStyle = "rgba(255,60,40," + (fw.slamState === "strike" ? 0.5 : 0.12 + 0.30 * prog) + ")";
          ctx.fillRect(wx - FW.slamReach, yT, FW.slamReach, yB - yT);
          ctx.strokeStyle = (Math.floor(sc.t * 12) & 1) ? "#ff5a5a" : "#ffd23f";
          ctx.lineWidth = 1.5; ctx.strokeRect(wx - FW.slamReach, yT, FW.slamReach, yB - yT);
        }
        // Real armored wall chassis (face at wx); short dark-fill to the edge.
        A.draw(ctx, "wallboss", wx + 42, floorBottom, 1, { t: sc.t });
        ctx.fillStyle = P.wallbossDk;
        ctx.fillRect(wx + 84, floorBottom - 178, JH.VIEW_W - (wx + 84), JH.VIEW_H - (floorBottom - 178));

        // Doc-Ock cables writhing out of the chassis — more of them the lower
        // its HP (dressing; the TENTACLE SLAM is the one that bites).
        if (!fw.dying) this._drawFirewallCables(ctx, fw, wx, floorBottom, sc, C);

        // Roaming weak-spot EYE — the shared boss reactor-core glyph (matches
        // Switch/GK so it reads consistently). Iris shutters slide over it
        // off-cycle; only OPEN exposes the weak point.
        const coreX = wx, coreY = JH.Geo.feetScreenY(fw.wsDepth, 0) - 30;
        const openAmt = fw.wsState === "open" ? 1 : fw.wsState === "wind" ? Math.max(0, 1 - fw.wsT / FW.wsWind) : 0;
        ctx.save();
        ctx.fillStyle = "#0d0f15"; ctx.fillRect(coreX - 9, coreY - 12, 18, 24);      // eye backplate
        A.bossCore(ctx, coreX, coreY, 5, sc.t, { flash: fw.hitFlash > 0 });
        const shut = Math.round(12 * (1 - openAmt));                                  // iris lids
        ctx.fillStyle = P.wallbossShut;
        ctx.fillRect(coreX - 9, coreY - 12, 18, shut);
        ctx.fillRect(coreX - 9, coreY + 12 - shut, 18, shut);
        ctx.fillStyle = P.wallbossHi; ctx.fillRect(coreX - 9, coreY - 12, 18, 1); ctx.fillRect(coreX - 9, coreY + 11, 18, 1);
        if (fw.wsState === "wind" || fw.wsState === "open") {
          ctx.strokeStyle = fw.wsState === "open" ? "#ffe6a0" : ((Math.floor(sc.t * 12) & 1) ? "#ff5a5a" : "#ffd23f");
          ctx.lineWidth = 1.5; ctx.strokeRect(coreX - 10, coreY - 13, 20, 26);
        }
        ctx.restore();

        // TENTACLE SLAM telegraph + strike (floor spot in front of the wall).
        if (fw.tslState) this._drawFirewallTentacle(ctx, fw, wx, floorBottom, sc, C);

        // SURGE — the boss's own lightning bolt rolling down the core's lane
        // (cyan/green/white jagged column + glow). Dodge by changing lane.
        if (fw.surge) {
          const sxb = Math.round(fw.surge.x), sy = JH.Geo.feetScreenY(fw.surge.depth, 0), tt = sc.t;
          const pulse = 0.55 + 0.45 * Math.abs(Math.sin(tt * 22));
          ctx.save();
          ctx.globalAlpha = 0.2; ctx.fillStyle = "#00d8ff";
          ctx.beginPath(); ctx.ellipse(sxb, sy - 8, 9, 24, 0, 0, Math.PI * 2); ctx.fill();
          const segs = 9, segH = 3, startY = sy - Math.floor(segs * segH * 0.5);
          ctx.lineCap = "round"; ctx.lineJoin = "round";
          const bolt = () => { ctx.beginPath(); ctx.moveTo(sxb, startY); for (let i = 1; i <= segs; i++) ctx.lineTo(sxb + Math.sin(tt * 24 + i * 2.3) * 5, startY + i * segH); ctx.stroke(); };
          ctx.globalAlpha = 0.78 * pulse; ctx.strokeStyle = "#00f0ff"; ctx.lineWidth = 2.5; bolt();
          ctx.globalAlpha = 0.4 * pulse; ctx.strokeStyle = "#80ff80"; ctx.lineWidth = 1.5; bolt();
          ctx.globalAlpha = 0.92 * pulse; ctx.strokeStyle = "#e8ffff"; ctx.lineWidth = 0.8; bolt();
          ctx.restore();
        }
        // HP bar (hidden once the boss is detonating).
        if (!fw.dying) {
          const bw = 160, bf = Math.max(0, fw.hp / fw.maxHp);
          ctx.fillStyle = "#fff"; ctx.font = "6px monospace"; ctx.textAlign = "center";
          ctx.fillText("THE FIREWALL", JH.VIEW_W / 2, 50);
          ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(JH.VIEW_W / 2 - bw / 2 - 1, 53, bw + 2, 6);
          ctx.fillStyle = "#c0392b"; ctx.fillRect(JH.VIEW_W / 2 - bw / 2, 54, bw * bf, 4);
          ctx.textAlign = "left";
        }
      }

      // Gate Crash detonation booms — one-shot FX strips at screen points.
      if (sc.finale) for (const b of sc.finale.booms)
        if (sc.t - b.born >= 0)
          A.drawFx(ctx, b.kind, b.x, b.y, sc.t - b.born, { scale: b.scale, loop: false });

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
      // The fire-truck hero sprite (Jon + cannon baked in). Wheels spin by
      // scroll distance; the on-hit white flash rides opt.hurt (silhouette-
      // accurate, handled by the "truck" painter in assets.js).
      A.shadow(ctx, t.screenX, ty, 26);
      A.draw(ctx, "truck", t.screenX, ty, 1, {
        // screenX term keeps the wheels turning through the intro slide-in.
        frame: Math.floor((sc.scrollX + t.screenX + 70) / DRIVE_STEP),
        hurt: t.hitFlashT > 0, hurtAlpha: t.hitFlashT / 0.18,
      });

      // HP + water bars (honest, visible) — hidden once the whiteout begins.
      if (sc.phase !== "whiteout") {
        this._bar(ctx, 8, 8, 90, t.hp / C.truckHp, "#e74c3c", "HP");
        this._bar(ctx, 8, 20, 90, t.water / C.tank, "#4aa3ff", "H2O");
      }

      // Phase banner.
      if (sc.bannerT > 0 && sc.banner) {
        ctx.fillStyle = "#fff";
        ctx.font = "bold 16px monospace";
        ctx.textAlign = "center";
        ctx.fillText(sc.banner, JH.VIEW_W / 2, 40);
        ctx.textAlign = "left";
      }

      // Full-screen white — the explosion whiteout (road phases only; the
      // walkway fork above handles its own white-in).
      if (sc.finale) {
        const wA = JH.TruckBalance.finaleWhite(C.finale, sc.phase, sc.finale.t);
        if (wA > 0) { ctx.fillStyle = "rgba(255,255,255," + wA + ")"; ctx.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H); }
      }

      // Wrecked beat: staggered booms on the truck, then fade to black (the
      // restarted scene's fadeIn picks up from full black).
      if (sc.phase === "wrecked") {
        const w = sc.wreckedT, gy = JH.Geo.feetScreenY(t.depth, 0);
        const B = [[0, -18, 0], [-26, -40, 0.2], [24, -30, 0.42]];
        for (const [bx, by, b0] of B)
          if (w >= b0) A.drawFx(ctx, "boom-mid", t.screenX + bx, gy + by, w - b0, { scale: 1.0, loop: false });
        const k = Math.min(1, Math.max(0, (w - 0.8) / 0.6));
        if (k > 0) { ctx.fillStyle = "rgba(0,0,0," + k + ")"; ctx.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H); }
      }

      // Black-in at scene start — continues the boarding fade-out seamlessly.
      if (sc.fadeIn > 0) {
        ctx.fillStyle = "rgba(0,0,0," + Math.min(1, sc.fadeIn / 0.35) + ")";
        ctx.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H);
      }
    },

    // ---- the Gate Crash tableau: pale Air World sky, cloud-lined walkway,
    // Firewall rubble (left), the Air World gate (right). One 480px screen;
    // everything anchors to the walk ground line (former truck lane).
    _renderWalkway(ctx, sc, C) {
      const F = C.finale, fin = sc.finale, A = JH.Assets, P = JH.PAL;
      const W = JH.VIEW_W, H = JH.VIEW_H, gy = this._walkGroundY();

      // Sky — soft dawn gradient + sun glow. Deliberately NOT the fire world.
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#8fb8e8"); sky.addColorStop(0.55, "#cfe0f2"); sky.addColorStop(1, "#f2ead8");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      const sun = ctx.createRadialGradient(W * 0.78, 40, 4, W * 0.78, 40, 90);
      sun.addColorStop(0, "rgba(255,244,214,0.9)"); sun.addColorStop(1, "rgba(255,244,214,0)");
      ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);

      // Distant cloud banks, drifting slowly.
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      for (let i = 0; i < 5; i++) {
        const cx = ((i * 113 + sc.t * 3) % (W + 120)) - 60, cy = 60 + (i % 3) * 26;
        ctx.beginPath(); ctx.ellipse(cx, cy, 46, 10, 0, 0, Math.PI * 2); ctx.fill();
      }

      // The walkway: a bright cloud deck where the road was; haze below.
      ctx.fillStyle = "#b8cbe0"; ctx.fillRect(0, gy + 18, W, H - gy - 18);
      ctx.fillStyle = "#eef3fa"; ctx.fillRect(0, gy - 26, W, 44);
      ctx.fillStyle = "rgba(160,180,205,0.5)"; ctx.fillRect(0, gy + 14, W, 4);

      // Cloud puffs lining both edges (deterministic per index, gentle bob).
      for (let i = 0; i < 16; i++) {
        const px = (i * 63 + 17) % (W + 40) - 20;
        const top = i % 2 === 0;
        const py = (top ? gy - 26 : gy + 20) + Math.sin(sc.t * 0.8 + i * 1.7) * 1.5;
        const r = 10 + (i * 7) % 9;
        ctx.fillStyle = top ? "rgba(255,255,255,0.92)" : "rgba(244,248,255,0.95)";
        ctx.beginPath();
        ctx.ellipse(px, py, r, r * 0.55, 0, 0, Math.PI * 2);
        ctx.ellipse(px + r * 0.7, py + 2, r * 0.7, r * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      // Firewall rubble — charred chassis chunks (wallboss palette) + smoke.
      ctx.fillStyle = P.wallbossDk;
      ctx.fillRect(0, gy - 34, 26, 48); ctx.fillRect(14, gy - 12, 30, 26);
      ctx.fillStyle = P.wallboss;
      ctx.fillRect(4, gy - 28, 14, 10); ctx.fillRect(24, gy - 6, 16, 8);
      ctx.fillStyle = P.wallbossHi; ctx.fillRect(6, gy - 30, 10, 2);
      for (let i = 0; i < 3; i++) {
        const k = (sc.t * 0.35 + i * 0.33) % 1;
        ctx.fillStyle = "rgba(90,90,100," + (0.35 * (1 - k)) + ")";
        ctx.beginPath(); ctx.ellipse(18 + i * 9, gy - 30 - k * 34, 5 + k * 7, 4 + k * 5, 0, 0, Math.PI * 2); ctx.fill();
      }

      // The Air World gate — marble arch + doors; blown open after the crash.
      const gx = F.gate.x;
      ctx.fillStyle = "#dfe6f0";
      ctx.fillRect(gx - 34, gy - 96, 12, 100); ctx.fillRect(gx + 22, gy - 96, 12, 100);
      ctx.fillStyle = "#c8d2e2";
      ctx.fillRect(gx - 34, gy - 96, 12, 4); ctx.fillRect(gx + 22, gy - 96, 12, 4);
      ctx.beginPath(); ctx.arc(gx, gy - 92, 34, Math.PI, 0);
      ctx.lineWidth = 10; ctx.strokeStyle = "#dfe6f0"; ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = "#aab6c8"; ctx.stroke();
      if (!fin.gateOpen) {
        ctx.fillStyle = "#9fb3cc";
        ctx.fillRect(gx - 22, gy - 88, 21, 92); ctx.fillRect(gx + 1, gy - 88, 21, 92);
        ctx.fillStyle = "#8aa0bc"; ctx.fillRect(gx - 3, gy - 88, 2, 92);
      } else {
        // Portal glow inside + the doors blown flat onto the deck.
        A.drawFx(ctx, "portal", gx, gy + 2, sc.t, { scale: 1.4 });
        ctx.fillStyle = "#9fb3cc";
        ctx.fillRect(gx - 60, gy - 2, 24, 6); ctx.fillRect(gx + 38, gy, 22, 5);
      }

      // The runaway truck (empty cab), or its wreck at the gate's foot.
      if (!fin.crashed) {
        A.shadow(ctx, fin.truckX, gy, 26);
        A.draw(ctx, "truckBoard", fin.truckX, gy, 1, { frame: Math.floor(fin.truckX / DRIVE_STEP) });
      } else {
        const wx = F.gate.x - F.gate.crashPad;
        A.shadow(ctx, wx, gy, 26);
        A.draw(ctx, "truckWreck", wx, gy, 1, {});
        A.drawFx(ctx, "fire-small", wx - 18, gy - 30, sc.t, { scale: 0.4 });
        A.drawFx(ctx, "fire-small", wx + 22, gy - 44, sc.t + 0.4, { scale: 0.35 });
        for (let i = 0; i < 3; i++) {
          const k = (sc.t * 0.3 + i * 0.33) % 1;
          ctx.fillStyle = "rgba(70,70,80," + (0.4 * (1 - k)) + ")";
          ctx.beginPath(); ctx.ellipse(wx + 8 + i * 7, gy - 60 - k * 40, 6 + k * 8, 5 + k * 6, 0, 0, Math.PI * 2); ctx.fill();
        }
      }

      // Jon: blast-thrown (spinning), face-down (death sheet frame 7; the
      // stand-up plays it BACKWARD), standing, or walking.
      const j = fin.jon;
      if (j) {
        if (j.state === "air") {
          ctx.save(); ctx.translate(j.x, j.y - 26); ctx.rotate(j.rot);
          A.draw(ctx, "jon", 0, 26, 1, { state: "idle" });
          ctx.restore();
        } else if (j.state === "down") {
          const df = fin.standT > 0
            ? Math.max(0, Math.round(7 * (1 - fin.standT / F.standDur))) : 7;
          A.draw(ctx, "jon", j.x, gy, 1, { state: "death", frame: df });
        } else {
          A.shadow(ctx, j.x, gy, 10);
          A.draw(ctx, "jon", j.x, gy, fin.facing, j.state === "walk"
            ? { state: "walk", frame: fin.walkFrame } : { state: "idle" });
        }
        // Landing cloud poof — expanding, fading puffs at the touchdown point.
        if (fin.landPoofT != null && fin.landPoofT < 0.4) {
          const k = fin.landPoofT / 0.4, pr = 8 + k * 14;
          ctx.fillStyle = "rgba(255,255,255," + (0.7 * (1 - k)) + ")";
          ctx.beginPath();
          ctx.ellipse(j.x - 4, gy, pr, pr * 0.45, 0, 0, Math.PI * 2);
          ctx.ellipse(j.x + 6, gy + 1, pr * 0.8, pr * 0.45 * 0.8, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Crash booms ride on the tableau.
      for (const b of fin.booms)
        if (sc.t - b.born >= 0)
          A.drawFx(ctx, b.kind, b.x, b.y, sc.t - b.born, { scale: b.scale, loop: false });

      // Crash impact micro-flash (covers the tableau; phase white-in rides above).
      if (fin.flashT > 0) {
        ctx.fillStyle = "rgba(255,255,255," + (0.55 * fin.flashT / 0.12) + ")";
        ctx.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H);
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
