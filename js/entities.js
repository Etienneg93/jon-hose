/* =====================================================================
   entities.js — Player, enemies, boss, projectiles, pickups, particles.

   Every entity implements update(dt, game) and draw(ctx, cam).
   `game` exposes: player, enemies, embers, pickups, particles, bounds
   {minX,maxX}, audio, shake(n), spawnEnemy(type,x,y), burst(...).
   ===================================================================== */
(function () {
  "use strict";
  const JH = (window.JH = window.JH || {});
  const Geo = JH.Geo, Assets = JH.Assets;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------------------------------------------------- particle helpers
  function burst(game, x, y, z, color, n, opt) {
    opt = opt || {};
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (opt.speed || 60) * (0.4 + Math.random() * 0.6);
      game.particles.push(new Particle({
        x, y, z,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.5,
        vz: (opt.up || 40) * Math.random(),
        life: opt.life || 0.4,
        color, size: opt.size || 2, grav: opt.grav != null ? opt.grav : 220,
      }));
    }
  }
  JH.burst = burst;

  // Forgiving floor collision with Act-3 rubble. Treats each pile as a small
  // ellipse on the floor plane (scaled by the pile's own size `s`) and slides
  // the actor out to the nearest edge. Used by the player and walking enemies;
  // bosses override update() and skip this, so they crush rubble underfoot.
  // Small radii + the depth axis let actors step around piles, not get walled.
  function resolveDebris(ent) {
    const D = JH.DEBRIS, list = JH.Background && JH.Background.debris;
    if (!D || !D.collide || !list) return;
    for (const d of list) {
      const dx = ent.x - d.x;
      if (dx > 48 || dx < -48) continue;             // cheap x cull
      const rx = D.rx * d.s, ry = D.ry * d.s;
      const nx = dx / rx, ny = (ent.y - d.y) / ry;   // position in ellipse space
      const dist = Math.hypot(nx, ny);
      if (dist >= 1 || dist === 0) continue;         // outside (or dead-centre: skip)
      ent.x = d.x + (nx / dist) * rx;                // snap to the ellipse boundary
      ent.y = d.y + (ny / dist) * ry;
    }
  }
  JH.resolveDebris = resolveDebris;

  function denominateCoins(total) {
    const coins = []; let rem = total;
    while (rem >= 10) { coins.push(10); rem -= 10; }
    while (rem >= 5)  { coins.push(5);  rem -= 5;  }
    while (rem >= 1)  { coins.push(1);  rem -= 1;  }
    return coins;
  }

  // Regular enemy drop: staggered scatter on the ground
  function spawnSudsCoins(game, x, y, total) {
    denominateCoins(total).forEach((val, i) => {
      const ox = (Math.random() - 0.5) * 40;
      const oy = (Math.random() - 0.5) * 20;
      setTimeout(() => game.spawnPickup("suds", x + ox, y + oy, val), i * 45);
    });
  }
  JH.spawnSudsCoins = spawnSudsCoins;

  // Boss kill: coins arc upward and land
  function spawnCoinFountain(game, x, y, total) {
    denominateCoins(total).forEach((val, i) => {
      setTimeout(() => {
        const angle = Math.random() * Math.PI * 2;
        const speed = 70 + Math.random() * 110;
        const p = new JH.Pickup("suds", x, y, val);
        p.z = 10; p.vz = 220 + Math.random() * 140;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed * 0.35;
        game.pickups.push(p);
      }, i * 30);
    });
  }

  class Particle {
    constructor(o) { Object.assign(this, o); this.t = 0; this.maxLife = o.life; }
    update(dt) {
      this.t += dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.z += this.vz * dt;
      this.vz -= this.grav * dt;
      if (this.z < 0) { this.z = 0; this.vz *= -0.3; this.vx *= 0.6; }
      return this.t < this.maxLife;
    }
    draw(ctx, cam) {
      const sx = this.x - cam;
      const sy = Geo.feetScreenY(this.y, this.z);
      ctx.globalAlpha = clamp(1 - this.t / this.maxLife, 0, 1);
      ctx.fillStyle = this.color;
      const s = this.size;
      ctx.fillRect(Math.round(sx - s / 2), Math.round(sy - s / 2), s, s);
      ctx.globalAlpha = 1;
    }
  }
  JH.Particle = Particle;

  // ======================================================== BASE ENTITY
  class Entity {
    constructor(x, y) {
      this.x = x; this.y = y; this.z = 0; this.vz = 0;
      this.facing = -1; this.dead = false;
      this.hurtTimer = 0; this.flashTimer = 0;
      this.knockVX = 0; this.knockVY = 0;
      this.frame = 0; this.animTimer = 0; this.state = "idle";
      this.t = 0;
    }
    // Shared physics: jump arc + knockback decay + depth clamp.
    basePhysics(dt) {
      this.t += dt;
      if (this.z > 0 || this.vz !== 0) {
        this.vz -= JH.PLAYER.gravity * dt;
        this.z += this.vz * dt;
        if (this.z <= 0) { this.z = 0; this.vz = 0; }
      }
      // Knockback impulse decays exponentially.
      this.x += this.knockVX * dt;
      this.y += this.knockVY * dt;
      this.knockVX *= Math.pow(0.0001, dt);
      this.knockVY *= Math.pow(0.0001, dt);
      if (Math.abs(this.knockVX) < 2) this.knockVX = 0;
      if (Math.abs(this.knockVY) < 2) this.knockVY = 0;
      this.y = Geo.clampDepth(this.y);
      this.x = Geo.clampX(this.x);
      if (this.hurtTimer > 0) this.hurtTimer -= dt;
      if (this.flashTimer > 0) this.flashTimer -= dt;
    }
    animate(dt, moving) {
      this.animTimer += dt;
      if (this.animTimer > 0.12) { this.animTimer = 0; this.frame = (this.frame + 1) & 3; }
      if (!moving) this.frame = this.frame & 1; // settle
    }
    applyKnockback(dirX, force, dirY) {
      this.knockVX += dirX * force;
      if (dirY != null) this.knockVY += dirY * force * 0.4;
    }
    hurt() { this.flashTimer = 0.18; }
  }
  JH.Entity = Entity;

  // ============================================================ PLAYER
  class Player extends Entity {
    constructor(x, y) {
      super(x, y);
      this.facing = 1;
      this.applyStats(JH.Upgrades.computeStats(JH.Upgrades.owned));
      this.hp = this.stats.maxHp;
      this.water = this.stats.maxWater;
      this.suds = 0;
      this.sudsEarned = 0;
      this.dashTimer = 0; this.dashCdTimer = 0; this.dashBoostTimer = 0;
      this.meleeTimer = 0; this.meleeCdTimer = 0;
      this.invulnTimer = 0;
      this.regenLock = 0;
      this.spraying = false;
      this.sprayDry = false;
      this.sprayTick = 0;
      this.sprayEmitAcc = 0;       // fractional particle emitter for the stream
      this.meleeFxTimer = 0;       // drives the melee swing arc
      this.concertaTimer = 0;      // Concerta pill: unlimited water while > 0
      this.kibbleTimer = 0;        // Kibble: HP regen over 6 s while > 0
      this.kibbleRegen = 0;        // HP/s during regen
      this.bodyW = this.stats.bodyW;
      this.alive = true;
      this.nearShop = false;
    }
    applyStats(s) { this.stats = s; this.bodyW = s.bodyW; if (this.hp > s.maxHp) this.hp = s.maxHp; }

    update(dt, game) {
      const In = game.input, S = this.stats;
      this.basePhysics(dt);
      if (this.invulnTimer > 0) this.invulnTimer -= dt;
      if (this.dashCdTimer > 0) this.dashCdTimer -= dt;
      if (this.meleeCdTimer > 0) this.meleeCdTimer -= dt;
      if (this.regenLock > 0) this.regenLock -= dt;

      // ---- movement vector
      const wantSpray = In.held("spray") && this.dashTimer <= 0;
      let mx = (In.held("right") ? 1 : 0) - (In.held("left") ? 1 : 0);
      // Suppress vertical movement when near shop — up/down is used for shop navigation.
      let my = this.nearShop ? 0 : ((In.held("down") ? 1 : 0) - (In.held("up") ? 1 : 0));
      // Facing is LOCKED while spraying so you can back-pedal and keep aim.
      if (mx !== 0 && !wantSpray) this.facing = mx > 0 ? 1 : -1;
      if (this.meleeFxTimer > 0) this.meleeFxTimer -= dt;

      // ---- dash boost timer + trailing particles
      if (this.concertaTimer > 0) {
        this.concertaTimer -= dt;
        // Concerta refills the tank really fast for its whole duration —
        // spraying or not (the spray drain is also suppressed while active).
        this.water = Math.min(S.maxWater, this.water + S.maxWater * dt);
      }
      if (this.kibbleTimer > 0) {
        this.kibbleTimer -= dt;
        this.hp = Math.min(this.stats.maxHp, this.hp + this.kibbleRegen * dt);
      }

      if (this.dashBoostTimer > 0) {
        this.dashBoostTimer -= dt;
        if (this.dashTimer <= 0 && Math.random() < 0.4)
          burst(game, this.x - this.facing * 4, this.y, 4, JH.PAL.water, 1,
            { speed: 28, life: 0.35, up: 8, grav: 150, size: 2 });
      }

      // ---- dash
      if (In.pressed("dash") && this.dashCdTimer <= 0 && (mx || my)) {
        this.dashTimer = S.dashTime; this.dashCdTimer = S.dashCd;
        this.invulnTimer = Math.max(this.invulnTimer, S.dashTime + 0.05);
        this._dashX = mx; this._dashY = my;
        game.audio.play("jump");
        if (S.dashBoostDur > 0) this.dashBoostTimer = S.dashBoostDur;
        if (S.dashPuddle)   // Hydro-Dash leaves a slick splash
          burst(game, this.x, this.y, 1, JH.PAL.water, 7, { speed: 38, life: 0.55, up: 4, grav: 0, size: 2 });
      }
      let speed = S.moveSpeed;
      if (this.dashTimer > 0) {
        this.dashTimer -= dt;
        mx = this._dashX; my = this._dashY; speed = S.dashSpeed;
      } else if (this.spraying) {
        speed *= 0.55; // slow while hosing
      } else if (this.dashBoostTimer > 0 && S.dashBoost > 0) {
        speed += S.dashBoost;
      }
      const len = Math.hypot(mx, my) || 1;
      this.x += (mx / len) * speed * dt;
      this.y += (my / len) * speed * dt;

      // ---- jump
      if (In.pressed("jump") && this.z === 0) { this.vz = S.jumpV; game.audio.play("jump"); }

      // ---- melee whack
      if (In.pressed("whack") && this.meleeCdTimer <= 0) {
        this.meleeCdTimer = S.meleeCd; this.meleeTimer = 0.18;
        this.doMelee(game);
      }
      if (this.meleeTimer > 0) this.meleeTimer -= dt;

      // ---- spray hose (held)
      this.spraying = false;
      if (wantSpray) this.doSpray(dt, game);

      // ---- water regen (after a short delay since last spray)
      if (!this.spraying && this.regenLock <= 0 && this.water < S.maxWater) {
        const moveBon = ((mx !== 0 || my !== 0) && S.moveRegen > 0) ? S.moveRegen : 0;
        this.water = Math.min(S.maxWater, this.water + (S.waterRegen + moveBon) * dt);
      }

      // ---- hydrant: stand next to one to refill water and (out of combat) heal HP.
      this.nearHydrant = null;
      if (game.hydrants) {
        for (const h of game.hydrants) {
          if (Math.abs(this.x - h.x) < JH.HYDRANT.range && Math.abs(this.y - h.y) < 24) {
            this.nearHydrant = h;
            if (this.water < S.maxWater) {
              this.water = Math.min(S.maxWater, this.water + JH.HYDRANT.refill * dt);
              if (Math.random() < 0.5)
                game.particles.push(new Particle({
                  x: h.x + (Math.random() - 0.5) * 6, y: h.y, z: 8 + Math.random() * 8,
                  vx: (this.x - h.x) * 1.5, vy: 0, vz: 30,
                  life: 0.4, color: JH.PAL.waterHi, size: 2, grav: 120,
                }));
            }
            if (!game.waveActive && this.hp < S.maxHp) {
              this.hp = Math.min(S.maxHp, this.hp + JH.HYDRANT.healRate * dt);
              if (Math.random() < 0.5)
                game.particles.push(new Particle({
                  x: h.x + (Math.random() - 0.5) * 8, y: h.y, z: 8 + Math.random() * 12,
                  vx: (this.x - h.x) * 1.2, vy: 0, vz: 25,
                  life: 0.5, color: "#44ff88", size: 2, grav: 100,
                }));
            }
            break;
          }
        }
      }

      // ---- debris (Act 3): soft push-out of rubble piles, then re-clamp.
      resolveDebris(this);

      // ---- bounds (game gates rightward progress during fights)
      this.x = clamp(this.x, game.bounds.minX, game.bounds.maxX);
      this.y = Geo.clampDepth(this.y);

      // ---- animation
      const moving = (mx || my) && this.dashTimer <= 0;
      this.walking = moving;
      this.state = (this.spraying && !moving) ? "fire" : (moving ? "walk" : "idle");
      this.animate(dt, moving);
    }

    doSpray(dt, game) {
      const S = this.stats;
      const dry = this.water <= 0 && this.concertaTimer <= 0;
      this.spraying = true;
      this.sprayDry = dry;
      this.regenLock = S.regenDelay;

      // Water PRESSURE tiers:
      //   80–100% bonus power · 25–80% full · <25% low · empty = sputter
      const frac = S.maxWater > 0 ? this.water / S.maxWater : 0;
      let dmgScale, rangeMult;
      if (dry)               { dmgScale = 0.18; rangeMult = 0.35; }
      else if (frac >= 0.80) { dmgScale = 1.20; rangeMult = 1.00; }
      else if (frac >= 0.25) { dmgScale = 1.00; rangeMult = 1.00; }
      else                   { dmgScale = 0.40; rangeMult = 0.55; }
      if (!dry && this.concertaTimer <= 0) this.water = Math.max(0, this.water - S.waterDrain * dt);
      // (Concerta refill is handled in update() so the tank fills whether or not spraying.)

      const ox = this.x + this.facing * 12;   // nozzle x (world)
      const oy = this.y;                       // nozzle depth
      const oz = this.z + (this.state === "walk" ? 28 : 34); // lower when walk-firing
      const reach = S.sprayRange * rangeMult;  // range shrinks with pressure
      const beam = S.beam | 0;                 // concentration tier 0..3

      // Hydro Lance (beam=3) pierces the whole line; default stops at first target.
      const pierce = beam >= 3;
      let blocker = null;
      if (!pierce) {
        let minFwd = Infinity;
        for (const e of game.enemies) {
          if (e.dead) continue;
          if (!Geo.inHitArc(this, e, this.facing, reach, S.sprayHitBand)) continue;
          const fwd = (e.x - ox) * this.facing;
          if (fwd < minFwd) { minFwd = fwd; blocker = e; }
        }
      }
      // Particles die at the blocker's near face so the stream visually stops there.
      const blockDist = blocker
        ? Math.max(4, (blocker.x - ox) * this.facing - (blocker.bodyW || 14) * 0.5)
        : reach;

      // Emit a CONTAINED stream of droplets shaped like a beam. Climbing the
      // Pressure branch makes it DENSER (more particles) and TIGHTER (less
      // spread) — a loose hose spray sharpens into a concentrated jet.
      const density = 1 + beam * 1.0;          // each Pressure (damage) tier visibly thickens the stream
      const spread = 1 - Math.min(beam, 3) * 0.22;   // 1.0 → ~0.34
      this.sprayTick += dt;
      if (this.sprayTick > 0.05) { this.sprayTick = 0; if (!dry) game.audio.play("spray"); }
      this.sprayEmitAcc += (dry ? 70 : 150 * density) * dt;
      while (this.sprayEmitAcc >= 1) {
        this.sprayEmitAcc -= 1;
        const perpY = (Math.random() - 0.5) * S.sprayWidth * spread;  // depth jitter
        const perpZ = (Math.random() - 0.5) * 6 * spread;             // vertical jitter
        game.particles.push(new Particle({
          x: ox + this.facing * Math.random() * 8,
          y: oy + perpY * 0.35,
          z: oz + perpZ,
          vx: this.facing * (170 + Math.random() * 110),
          vy: perpY * 0.9,                     // gentle outward drift = soft cone
          vz: perpZ * 0.4 - 4,
          life: blockDist / 210 + Math.random() * (pierce ? 0.12 : 0.04),
          color: Math.random() > 0.45 ? JH.PAL.waterHi : JH.PAL.water,
          size: dry ? 1 : (beam >= 2 ? 3 : 2),         // chunkier droplets at high Pressure
          grav: dry ? 220 : 70,
        }));
      }

      // Damage enemies: non-pierce hits only the closest (blocker), pierce hits all.
      let didHit = false;
      const hitEnemies = [];
      let healAmt = 0;
      for (const e of game.enemies) {
        if (e.dead) continue;
        if (!Geo.inHitArc(this, e, this.facing, reach, S.sprayHitBand)) continue;
        if (!pierce && e !== blocker) continue;
        const mult = e.def ? (e.def.waterMult || 1) : 1;
        const dmg = S.sprayDamage * dmgScale * mult * dt;
        e.takeDamage(dmg, game, this.facing, 0);
        e.applyKnockback(this.facing, S.knockback * dt * 2.2, (e.y - this.y) * 0.02);
        if (Math.random() < 0.5)
          burst(game, e.x - this.facing * e.bodyW * 0.4, e.y, e.z + 12, JH.PAL.waterHi, 1,
            { speed: 70, life: 0.25, size: 2 });
        // Splash: water drips down at the impact point when the stream stops here.
        if (!pierce) {
          for (let i = 0; i < 3; i++) {
            game.particles.push(new Particle({
              x: e.x + (Math.random() - 0.5) * 8,
              y: e.y + (Math.random() - 0.5) * 6,
              z: e.z + 10 + Math.random() * 8,
              vx: this.facing * (8 + Math.random() * 24) + (Math.random() - 0.5) * 18,
              vy: (Math.random() - 0.5) * 20,
              vz: 12 + Math.random() * 22,
              life: 0.22 + Math.random() * 0.14,
              color: Math.random() > 0.4 ? JH.PAL.waterHi : JH.PAL.water,
              size: 1,
              grav: 290,
            }));
          }
        }
        didHit = true;
        if (S.vampiricRate > 0) healAmt += dmg * S.vampiricRate;
        if (S.splitStream) hitEnemies.push(e);
      }
      // Vampiric Hose: convert a fraction of spray damage into HP.
      if (healAmt > 0) this.hp = Math.min(S.maxHp, this.hp + healAmt);
      // Split Stream: 30% damage arc to all nearby enemies of each hit enemy.
      if (S.splitStream && hitEnemies.length > 0) {
        for (const primary of hitEnemies) {
          for (const e of game.enemies) {
            if (e.dead || e === primary || hitEnemies.includes(e)) continue;
            const d = Math.hypot(e.x - primary.x, e.y - primary.y);
            if (d > 80) continue;
            const m2 = e.def ? (e.def.waterMult || 1) : 1;
            e.takeDamage(S.sprayDamage * dmgScale * m2 * dt * 0.30, game, this.facing, 0);
            // Chain visual: thin stream of particles from primary to secondary.
            const cx = e.x - primary.x, cy = e.y - primary.y;
            const chainLen = Math.hypot(cx, cy) || 1;
            const nx = cx / chainLen, ny = cy / chainLen;
            for (let i = 0; i < 3; i++) {
              const t = Math.random();
              game.particles.push(new Particle({
                x: primary.x + cx * t + (Math.random() - 0.5) * 4,
                y: primary.y + cy * t + (Math.random() - 0.5) * 4,
                z: primary.z + 8 + (Math.random() - 0.5) * 5,
                vx: nx * (40 + Math.random() * 35),
                vy: ny * (40 + Math.random() * 35),
                vz: (Math.random() - 0.5) * 12,
                life: 0.14 + Math.random() * 0.09,
                color: Math.random() > 0.3 ? JH.PAL.waterHi : JH.PAL.water,
                size: 1,
                grav: 50,
              }));
            }
            burst(game, e.x, e.y, e.z + 8, JH.PAL.waterHi, 2,
              { speed: 40, life: 0.18, size: 1 });
          }
        }
      }
      // Closed Loop: reduce effective drain while hosing a target.
      if (didHit && !dry && S.waterReturn > 0)
        this.water = Math.min(S.maxWater, this.water + S.waterReturn * dt);

      // Barricade takes spray damage (depth-independent — it spans the street).
      const wall = game.wall;
      if (wall && !wall.dead) {
        const fwd = (wall.x - this.x) * this.facing;
        if (fwd > 0 && fwd - this.bodyW * 0.5 - wall.bodyW * 0.5 <= reach)
          wall.takeDamage(S.sprayDamage * dmgScale * dt, game);
      }
      // Garden boxes: face each box and match its depth to water it.
      if (game.gardens) {
        for (const garden of game.gardens) {
          if (garden.done) continue;
          const fwd = (garden.x - this.x) * this.facing;
          if (fwd > 0 && fwd - this.bodyW * 0.5 - 21 <= reach
              && Math.abs(garden.y - this.y) < S.sprayWidth + 8)
            garden.addGrow(S.sprayDamage * dmgScale * dt, game);
        }
      }
    }

    doMelee(game) {
      const S = this.stats;
      game.audio.play("whack");
      this.meleeFxTimer = 0.18;   // drives the swing-arc visual (shows reach)
      let hit = false;
      for (const e of game.enemies) {
        if (e.dead) continue;
        if (Geo.inHitArc(this, e, this.facing, S.meleeRange, 16)) {
          e.takeDamage(S.meleeDamage, game, this.facing, S.meleeKnock);
          e.applyKnockback(this.facing, S.meleeKnock, (e.y - this.y) * 0.1);
          burst(game, e.x, e.y, e.z + 14, "#fff", 4, { speed: 90, life: 0.2 });
          hit = true;
        }
      }
      // Barricade also takes melee hits.
      const wall = game.wall;
      if (wall && !wall.dead) {
        const fwd = (wall.x - this.x) * this.facing;
        if (fwd > 0 && fwd - this.bodyW * 0.5 - wall.bodyW * 0.5 <= S.meleeRange) {
          wall.takeDamage(S.meleeDamage, game); hit = true;
        }
      }
      game.shake(hit ? 3 : 1);
    }

    takeHit(dmg, game, fromX) {
      if (this.invulnTimer > 0 || this.dashTimer > 0) return;
      if (this.stats.dodgeChance > 0 && Math.random() < this.stats.dodgeChance) {
        burst(game, this.x, this.y, this.z + 10, "#aaddff", 8, { speed: 80, life: 0.35, up: 20 });
        this.invulnTimer = 0.3;
        return;
      }
      this.hp -= dmg;
      this.invulnTimer = this.stats.invuln;
      this.hurt();
      const dir = this.x < fromX ? -1 : 1;
      this.applyKnockback(dir, 90);
      game.audio.play("hurt");
      game.shake(5);
      if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    }

    draw(ctx, cam) {
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, 0);
      Assets.shadow(ctx, sx, sy, this.stats.bodyW * 0.7);
      if (this.kibbleTimer > 0) {
        ctx.save();
        ctx.shadowColor = "#44ee66";
        ctx.shadowBlur = 6 + 3 * Math.sin(this.t * 5);
      }
      if (this.concertaTimer > 0) {
        ctx.save();
        ctx.shadowColor = "#cc44ff";
        ctx.shadowBlur = 6 + 3 * Math.sin(this.t * 6);
      }
      Assets.draw(ctx, "jon", sx, Geo.feetScreenY(this.y, this.z), this.facing, {
        state: this.state, frame: this.frame, t: this.t,
        hurt: this.invulnTimer > 0 && this.flashTimer > 0,
        waterFrac: Math.max(0, Math.min(1, this.water / this.stats.maxWater)),
        walking: this.walking,
      });
      if (this.concertaTimer > 0) ctx.restore();
      if (this.kibbleTimer > 0) ctx.restore();
      if (this.meleeFxTimer > 0) this.drawMeleeArc(ctx, cam);

      // DEBUG: collision box
      if (JH.DEBUG_HITBOX) {
        const bw = this.stats.bodyW, bh = this.stats.bodyH, lift = 3;
        ctx.strokeStyle = "#ff00ff"; ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(sx - bw / 2), Math.round(sy - bh - lift), bw, bh);
        ctx.strokeStyle = "#00ffff"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx - 3, sy - lift); ctx.lineTo(sx + 3, sy - lift);
        ctx.moveTo(sx, sy - lift - 3); ctx.lineTo(sx, sy - lift + 3);
        ctx.stroke();
      }

      // Overhead HP + H₂O bars
      const barW = 28;
      const bx = Math.round(sx - barW / 2);
      const hpFrac = Math.max(0, this.hp / this.stats.maxHp);
      const wFrac  = Math.max(0, this.water / this.stats.maxWater);
      const barTop = Math.round(sy - this.stats.bodyH - 34);
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(bx - 1, barTop - 1, barW + 2, 9);
      // HP
      ctx.fillStyle = "#442222";
      ctx.fillRect(bx, barTop, barW, 3);
      ctx.fillStyle = hpFrac > 0.5 ? "#44cc44" : hpFrac > 0.25 ? "#ddaa22" : "#ee3333";
      ctx.fillRect(bx, barTop, Math.round(barW * hpFrac), 3);
      // H₂O
      ctx.fillStyle = "#1a3344";
      ctx.fillRect(bx, barTop + 4, barW, 3);
      if (this.concertaTimer > 0) {
        ctx.fillStyle = (Math.floor(this.t * 8) & 1) ? "#ff88ff" : "#cc44cc";
      } else {
        ctx.fillStyle = "#66bbff";
      }
      ctx.fillRect(bx, barTop + 4, Math.round(barW * wFrac), 3);
      // Status indicators above bars — stacked if both active
      let indY = barTop - 2;
      if (this.kibbleTimer > 0) {
        ctx.fillStyle = "#44ff77";
        ctx.font = "bold 5px monospace"; ctx.textAlign = "center";
        ctx.fillText("KIBBLE " + this.kibbleTimer.toFixed(1) + "s", sx, indY);
        indY -= 7;
      }
      if (this.concertaTimer > 0) {
        ctx.fillStyle = "#ff88ff";
        ctx.font = "bold 5px monospace"; ctx.textAlign = "center";
        ctx.fillText("FOCUSED " + this.concertaTimer.toFixed(1) + "s", sx, indY);
      }
      // label
      ctx.font = "bold 6px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#9be8ff";
      ctx.fillText("H₂O", sx, barTop + 13);
      ctx.textAlign = "left";

      // Floating coin count above bars when standing near the vendor
      if (this.nearShop) {
        const coinY = barTop - 12;
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.fillRect(bx - 1, coinY - 1, barW + 2, 9);
        ctx.fillStyle = "#ffd23f";
        ctx.fillRect(bx + 1, coinY, 5, 5);
        ctx.fillStyle = "#caa015";
        ctx.fillRect(bx + 1, coinY + 3, 5, 1);
        ctx.fillStyle = "#fff7c2";
        ctx.fillRect(bx + 2, coinY + 1, 2, 2);
        ctx.font = "bold 6px monospace";
        ctx.textAlign = "left";
        ctx.fillStyle = "#ffd23f";
        ctx.fillText(Math.floor(this.suds), bx + 8, coinY + 6);
        ctx.textAlign = "left";
      }
    }

    // Hose-whip swing arc that visualises melee reach.
    drawMeleeArc(ctx, cam) {
      const prog = 1 - this.meleeFxTimer / 0.18;       // 0..1 through the swing
      const cx = this.x - cam, cy = Geo.feetScreenY(this.y, this.z) - 14;
      const r = this.stats.meleeRange + this.stats.bodyW * 0.5;
      const a0 = -1.1, a1 = 1.1;                        // top -> bottom sweep
      const a = a0 + (a1 - a0) * prog;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(this.facing, 1);
      ctx.globalAlpha = 0.85 * (1 - prog * 0.5);
      ctx.strokeStyle = "#dff3ff";
      ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.arc(0, 0, r, a - 0.5, a + 0.4); ctx.stroke();
      // a couple of speed lines
      ctx.globalAlpha *= 0.6; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, r - 4, a - 0.4, a + 0.3); ctx.stroke();
      ctx.restore();
    }
  }
  JH.Player = Player;

  // ============================================================ ENEMIES
  class Enemy extends Entity {
    constructor(type, x, y) {
      super(x, y);
      this.type = type;
      this.def = JH.ENEMIES[type];
      this.hp = this.maxHp = this.def.hp;
      this.bodyW = this.def.bodyW; this.bodyH = this.def.bodyH;
      this.contactTimer = 0;
      this.windTimer = 0; this.attackTimer = 0; this.cdTimer = 0;
      this.state = "walk";
      this.spawnGrace = 0.2;
    }

    takeDamage(dmg, game, dirX, knock) {
      if (this.dead) return;
      this.hp -= dmg;
      this.hurt();
      if (knock) this.applyKnockback(dirX, knock);
      if (this.hp <= 0) this.die(game);
    }

    die(game) {
      if (this.dead) return;
      this.dead = true;
      game.audio.play("die");
      burst(game, this.x, this.y, this.z + 12, this.colorOf(), 10, { speed: 100, life: 0.5, up: 80 });
      game.dropLoot(this);   // anti-farm aware (infinite spawns share a budget)
      game.onEnemyKilled(this);
    }
    colorOf() { return JH.PAL[this.def.color] || "#fff"; }

    // Act-2 "elite" — a tougher clone of the def (never mutate the shared one).
    makeElite() {
      this.elite = true;
      const d = Object.assign({}, this.def);
      d.hp = Math.round(d.hp * 1.7);
      d.touchDmg = Math.round(d.touchDmg * 1.3);
      if (d.meleeDmg)  d.meleeDmg  = Math.round(d.meleeDmg * 1.3);
      if (d.chargeDmg) d.chargeDmg = Math.round(d.chargeDmg * 1.3);
      if (d.emberDmg)  d.emberDmg  = Math.round(d.emberDmg * 1.3);
      if (d.speed)     d.speed    *= 1.12;
      if (d.bodyW)     d.bodyW = Math.round(d.bodyW * 1.22);
      if (d.bodyH)     d.bodyH = Math.round(d.bodyH * 1.16);
      d.suds = Math.round(d.suds * 1.4);
      this.def = d;
      this.hp = this.maxHp = d.hp;
      this.bodyW = d.bodyW;
      this.bodyH = d.bodyH;
    }

    // Generic chase toward the player; subclasses override think().
    update(dt, game) {
      this.basePhysics(dt);
      if (this.spawnGrace > 0) this.spawnGrace -= dt;
      if (this.contactTimer > 0) this.contactTimer -= dt;
      this.think(dt, game);
      resolveDebris(this);   // walking enemies bump rubble too (bosses skip this)
      // contact damage
      const pl = game.player;
      if (!this.dead && pl.alive && Geo.bodiesOverlap(this, pl) && this.contactTimer <= 0
          && Math.abs((this.z) - (pl.z)) < 20) {
        pl.takeHit(this.def.touchDmg, game, this.x);
        this.contactTimer = this.def.contactCd;
      }
      const moving = this.state === "walk" || this.state === "charge";
      this.animate(dt, moving);
    }

    // Default melee chaser (mook).
    think(dt, game) {
      const pl = game.player;
      const dx = pl.x - this.x, dy = pl.y - this.y;
      const dist = Math.hypot(dx, dy);
      this.facing = dx >= 0 ? 1 : -1;
      const d = this.def;

      if (this.windTimer > 0) {            // winding up an attack
        this.windTimer -= dt; this.state = "wind";
        if (this.windTimer <= 0) {
          if (Geo.inHitArc(this, pl, this.facing, d.meleeRange + 6, 16))
            pl.takeHit(d.meleeDmg, game, this.x);
          this.cdTimer = 0.6;
        }
        return;
      }
      if (this.cdTimer > 0) { this.cdTimer -= dt; this.state = "idle"; return; }

      if (dist < d.meleeRange && this.spawnGrace <= 0) {
        this.windTimer = d.meleeWind; this.state = "wind";
      } else {
        // approach
        const sp = d.speed;
        this.x += (dx / (dist || 1)) * sp * dt;
        this.y += (dy / (dist || 1)) * sp * dt * 0.8;
        this.state = "walk";
      }
    }

    draw(ctx, cam) {
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, 0);
      Assets.shadow(ctx, sx, sy, this.bodyW * 0.7);
      Assets.draw(ctx, this.type, sx, Geo.feetScreenY(this.y, this.z), this.facing, {
        state: this.state, frame: this.frame, t: this.t,
        hurt: this.flashTimer > 0, wind: this.state === "wind", elite: this.elite,
        scale: this.elite ? 1.08 : 1,
      });
      // tiny hp pip when damaged
      if (this.hp < this.maxHp) {
        const w = this.bodyW + 4;
        const bx = Math.round(sx - w / 2), by = Math.round(sy - this.bodyH - 8);
        if (this.elite) {
          ctx.fillStyle = "#f0b830";
          ctx.fillRect(bx - 1, by - 1, w + 2, 5);
        }
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(bx, by, w, 3);
        ctx.fillStyle = "#ff5a5a";
        ctx.fillRect(bx, by, Math.round(w * (this.hp / this.maxHp)), 3);
      }
    }
  }
  JH.Enemy = Enemy;

  // ---- Charger: telegraphed rush ----
  class Charger extends Enemy {
    think(dt, game) {
      const pl = game.player, d = this.def;
      const dx = pl.x - this.x, dy = pl.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (this.state !== "charge") this.facing = dx >= 0 ? 1 : -1;

      if (this.state === "charge") {
        this.attackTimer -= dt; this.x += this.facing * d.chargeSpeed * dt;
        if (Geo.inHitArc(this, pl, this.facing, 16, 18)) {
          pl.takeHit(d.chargeDmg, game, this.x); this.attackTimer = 0;
        }
        if (this.attackTimer <= 0) { this.state = "idle"; this.cdTimer = d.chargeCd; }
        return;
      }
      if (this.windTimer > 0) {
        this.windTimer -= dt; this.state = "wind";
        if (this.windTimer <= 0) { this.state = "charge"; this.attackTimer = d.chargeDur; game.audio.play("whack"); }
        return;
      }
      if (this.cdTimer > 0) { this.cdTimer -= dt; this.state = "idle"; return; }

      if (Math.abs(dy) < 14 && dist < 170 && this.spawnGrace <= 0) {
        this.windTimer = d.chargeWind; this.state = "wind";
      } else {
        this.x += (dx / (dist || 1)) * d.speed * dt;
        this.y += (dy / (dist || 1)) * d.speed * dt * 0.9;
        this.state = "walk";
      }
    }
  }
  JH.Charger = Charger;
  // Add draw override to Charger after class definition
  Charger.prototype.draw = function(ctx, cam) {
    if (this.state === "wind") {
      const d = this.def;
      const range = d.chargeSpeed * d.chargeDur;
      const band  = 18;
      const sx = this.x - cam;
      const sy = Geo.feetScreenY(this.y, 0);
      const x0 = sx + this.facing * this.bodyW * 0.5;
      const x1 = x0 + this.facing * range;
      const xL = Math.min(x0, x1), xW = Math.abs(x1 - x0);
      const yT = sy - band, yH = band * 2;
      const flash = (Math.floor(this.t * 10) & 1);
      ctx.save();
      ctx.fillStyle = "rgba(160,80,240,0.10)";
      ctx.fillRect(xL, yT, xW, yH);
      ctx.strokeStyle = flash ? "#c080ff" : "rgba(160,80,240,0.30)";
      ctx.lineWidth = 1;
      ctx.strokeRect(xL, yT, xW, yH);
      ctx.restore();
    }
    JH.Enemy.prototype.draw.call(this, ctx, cam);
  };

  // ---- Pyro: ranged ember thrower, flammable ----
  class Pyro extends Enemy {
    think(dt, game) {
      const pl = game.player, d = this.def;
      const dx = pl.x - this.x, dy = pl.y - this.y;
      const dist = Math.hypot(dx, dy);
      this.facing = dx >= 0 ? 1 : -1;
      if (this.cdTimer > 0) this.cdTimer -= dt;

      if (this.windTimer > 0) {
        this.windTimer -= dt; this.state = "wind";
        if (this.windTimer <= 0) {
          // fire an ember toward player's position
          const ang = Math.atan2(dy, dx);
          game.embers.push(new Ember(this.x + this.facing * 8, this.y, this.z + 14,
            Math.cos(ang) * d.emberSpeed, Math.sin(ang) * d.emberSpeed * 0.6, d.emberDmg));
          this.cdTimer = d.shootCd;
        }
        return;
      }
      if (dist < d.shootRange && this.cdTimer <= 0 && this.spawnGrace <= 0) {
        this.windTimer = 0.35; this.state = "wind";
      } else if (dist > d.shootRange * 0.7) {
        this.x += (dx / (dist || 1)) * d.speed * dt;
        this.y += (dy / (dist || 1)) * d.speed * dt * 0.8;
        this.state = "walk";
      } else {
        // back away to keep range
        this.x -= (dx / (dist || 1)) * d.speed * dt * 0.6;
        this.state = "walk";
      }
    }
  }
  JH.Pyro = Pyro;

  // ---- Ember projectile (enemy → player) ----
  class Ember {
    constructor(x, y, z, vx, vy, dmg) {
      Object.assign(this, { x, y, z, vx, vy, dmg, life: 2.2, t: 0, dead: false });
    }
    update(dt, game) {
      this.t += dt;
      this.x += this.vx * dt; this.y += this.vy * dt; this.z -= 8 * dt;
      this.y = clamp(this.y, JH.DEPTH_MIN, JH.DEPTH_MAX);
      const pl = game.player;
      if (pl.alive && Math.abs(pl.x - this.x) < 12 && Math.abs(pl.y - this.y) < 12) {
        pl.takeHit(this.dmg, game, this.x); this.dead = true;
        burst(game, this.x, this.y, this.z, JH.PAL.flame, 5, { speed: 70, life: 0.3 });
      }
      if (this.t > this.life) this.dead = true;
      // water particles passing could douse embers — handled in game loop
      return !this.dead;
    }
    draw(ctx, cam) {
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, this.z);
      const flash = (Math.floor(this.t * 12) & 1);
      ctx.save();
      ctx.strokeStyle = flash ? "#ff8800" : "#cc2200";
      ctx.lineWidth = flash ? 1.5 : 1;
      ctx.globalAlpha = flash ? 1.0 : 0.5;
      ctx.strokeRect(sx - 5, sy - 7, 10, 9);
      ctx.restore();
      Assets.draw(ctx, "ember", sx, sy, 1, { size: 4, t: this.t });
    }
  }
  JH.Ember = Ember;

  // ============================================================== BOSS
  class Boss extends Enemy {
    constructor(x, y, def, type) {
      super("mook", x, y); // borrow base; override def
      def = def || JH.BOSS;
      this.def = def;
      this.type = type || "boss";
      this.hp = this.maxHp = def.hp;
      this.bodyW = def.bodyW; this.bodyH = def.bodyH;
      this.summonTimer = def.summonCd;
      this.summonType = def.summonType || "mook";
      this.phase = 1;
      this.isBoss = true;
      this.atk = null;        // current telegraphed attack {kind,range,band,dmg,dur,t}
      this.strikeFx = 0;      // brief flash timer when an attack lands
    }
    think(dt, game) {
      const pl = game.player, d = this.def;
      const dx = pl.x - this.x, dy = pl.y - this.y;
      const dist = Math.hypot(dx, dy);
      const enraged = this.hp / this.maxHp < d.enrageAt;
      const spd = enraged ? d.speed * 1.6 : d.speed;
      if (this.strikeFx > 0) this.strikeFx -= dt;

      // Summon reinforcements occasionally.
      this.summonTimer -= dt;
      if (this.summonTimer <= 0 && game.enemies.filter((e) => !e.isBoss && !e.dead).length < 3) {
        this.summonTimer = enraged ? d.summonCd * 0.6 : d.summonCd;
        game.spawnEnemy(this.summonType, this.x - this.facing * 40, this.y + 10, { infinite: true });
      }

      // --- WIND-UP: hold the raised-arm pose + show the danger zone, then hit.
      if (this.state === "tele") {
        const a = this.atk;
        a.t -= dt;
        if (a.t > a.dur * 0.45) this.facing = dx >= 0 ? 1 : -1;  // aims early, locks late
        if (a.t <= 0) {
          // Strike resolves against the exact zone we telegraphed.
          if (Geo.inHitArc(this, pl, this.facing, a.range, a.band))
            pl.takeHit(a.dmg, game, this.x);
          this.strikeFx = 0.2;
          game.shake(9); game.audio.play("whack");
          const front = this.x + this.facing * this.bodyW * 0.5;
          for (let i = 0; i < 12; i++)
            burst(game, front + this.facing * Math.random() * a.range,
              this.y + (Math.random() - 0.5) * a.band * 2, 2, "#fff", 1,
              { speed: 130, life: 0.32, up: 30 });
          this.state = "strike";
          this.cdTimer = enraged ? 0.7 : 1.3;
        }
        return;
      }
      if (this.state === "strike") { if (this.strikeFx <= 0) this.state = "idle"; return; }
      if (this.cdTimer > 0) { this.cdTimer -= dt; this.state = "idle"; this.facing = dx >= 0 ? 1 : -1; return; }

      // --- approach, or commit to an attack when close AND roughly aligned ---
      this.facing = dx >= 0 ? 1 : -1;
      if (dist < d.sweepRange && Math.abs(dy) < 40 && this.spawnGrace <= 0) {
        const slam = dist < d.slamRange;
        this.atk = slam
          ? { kind: "slam",  range: d.slamRange,  band: 18, dmg: d.slamDmg,  dur: d.slamWind,  t: d.slamWind }
          : { kind: "sweep", range: d.sweepRange, band: 26, dmg: d.sweepDmg, dur: d.sweepWind, t: d.sweepWind };
        this.state = "tele";
        game.audio.play("jump");   // audible wind-up tell
      } else {
        this.x += (dx / (dist || 1)) * spd * dt;
        this.y += (dy / (dist || 1)) * spd * dt * 0.7;
        this.state = "walk";
      }
    }

    draw(ctx, cam) {
      if (this.state === "tele" || this.strikeFx > 0) this.drawTelegraph(ctx, cam);
      JH.Enemy.prototype.draw.call(this, ctx, cam);   // boss sprite + hp pip
      if (this.state === "tele") {                    // flashing "!" over the boss
        const sx = this.x - cam, sy = Geo.feetScreenY(this.y, this.z) - this.bodyH - 8;
        ctx.fillStyle = (Math.floor(this.t * 10) & 1) ? "#ff5a5a" : "#fff";
        ctx.font = "bold 13px monospace"; ctx.textAlign = "center";
        ctx.fillText("!", sx, sy); ctx.textAlign = "left";
      }
    }

    // Draws the exact area the pending attack will hit, filling toward impact.
    drawTelegraph(ctx, cam) {
      const a = this.atk; if (!a) return;
      const baseY = Geo.feetScreenY(this.y, 0);
      const x0 = (this.x - cam) + this.facing * this.bodyW * 0.5;   // boss front edge
      const x1 = x0 + this.facing * a.range;                       // reach
      const xL = Math.min(x0, x1), xW = Math.abs(x1 - x0);
      const yT = baseY - a.band, yH = a.band * 2;                  // depth band
      const strike = this.strikeFx > 0;
      const prog = strike ? 1 : 1 - a.t / a.dur;
      ctx.save();
      ctx.fillStyle = strike ? "rgba(255,255,255,0.55)" : "rgba(255,60,60,0.16)";
      ctx.fillRect(xL, yT, xW, yH);
      if (!strike) {                                               // fill grows from the boss outward
        const fx = this.facing > 0 ? xL : xL + xW * (1 - prog);
        ctx.fillStyle = "rgba(255,60,60,0.40)";
        ctx.fillRect(fx, yT, xW * prog, yH);
      }
      ctx.strokeStyle = strike ? "#fff" : ((Math.floor(this.t * 12) & 1) ? "#ff5a5a" : "#ffd23f");
      ctx.lineWidth = 1.5;
      ctx.strokeRect(xL, yT, xW, yH);
      ctx.restore();
    }
    die(game) {
      if (this.dead) return;
      this.dead = true;
      game.audio.play("win");
      // His summoned goons collapse with him.
      for (const e of game.enemies) {
        if (e !== this && !e.dead && !e.isBoss) {
          e.dead = true;
          burst(game, e.x, e.y, e.z + 12, e.colorOf ? e.colorOf() : "#fff", 8, { speed: 90, life: 0.4, up: 60 });
        }
      }
      for (let i = 0; i < 5; i++)
        setTimeout(() => burst(game, this.x + (Math.random() - 0.5) * 40, this.y, Math.random() * 30, "#fff", 14, { speed: 140, life: 0.6, up: 120 }), i * 90);
      spawnCoinFountain(game, this.x, this.y, this.def.suds);
      game.onEnemyKilled(this);
    }
  }
  JH.Boss = Boss;

  // ============================================================ PICKUP
  class Pickup {
    constructor(kind, x, y, value) {
      this.kind = kind; this.x = x; this.y = y; this.z = 30; this.vz = 60;
      this.vx = 0; this.vy = 0;
      this.value = value; this.dead = false; this.t = 0; this.life = 12; this.grounded = false;
    }
    update(dt, game) {
      this.t += dt;
      if (!this.grounded) {
        this.vz -= 360 * dt; this.z += this.vz * dt;
        this.x += this.vx * dt;
        this.y = Math.max(JH.DEPTH_MIN, Math.min(JH.DEPTH_MAX, this.y + this.vy * dt));
        if (this.z <= 0) {
          this.z = 0; this.vz *= -0.4;
          this.vx *= 0.25; this.vy *= 0.25;
          if (Math.abs(this.vz) < 12) { this.z = 0; this.grounded = true; }
        }
      }
      const pl = game.player;
      // gentle magnet when close
      const dx = pl.x - this.x, dy = pl.y - this.y, dist = Math.hypot(dx, dy);
      if (dist < 30) { this.x += dx * 4 * dt; this.y += dy * 4 * dt; }
      if (dist < 12) { this.collect(game); return false; }
      if (this.t > this.life) {
        if (this.t > this.life + 2) return false;        // blink then vanish
      }
      return true;
    }
    collect(game) {
      this.dead = true;
      const pl = game.player;
      if (this.kind === "suds") { pl.suds += this.value; pl.sudsEarned += this.value; game.audio.play("coin"); }
      else if (this.kind === "health") {
        pl.kibbleTimer = 6.0;
        pl.kibbleRegen = this.value / 6.0;
        game.audio.play("buy");
        game.banner("KIBBLE REGEN!", 1.6);
        burst(game, pl.x, pl.y, pl.z + 10, JH.PAL.hpPk, 10, { speed: 70, life: 0.45, up: 50 });
      }
      else if (this.kind === "water_can") { pl.water = Math.min(pl.stats.maxWater, pl.water + this.value); game.audio.play("buy"); }
      else if (this.kind === "pill") {
        pl.concertaTimer = Math.max(pl.concertaTimer, JH.CONCERTA.dur);
        game.audio.play("pill");
        burst(game, pl.x, pl.y, pl.z + 10, JH.PAL.pill, 14, { speed: 90, life: 0.55, up: 60 });
      }
      if (this.kind !== "pill" && this.kind !== "health")
        burst(game, this.x, this.y, this.z + 6, this.kind === "suds" ? JH.PAL.suds : JH.PAL.water, 6, { speed: 60, life: 0.3 });
    }
    draw(ctx, cam) {
      if (this.t > this.life && (Math.floor(this.t * 8) & 1)) return; // blink before despawn
      const key = this.kind === "suds"
        ? (this.value >= 10 ? "suds_gold" : this.value >= 5 ? "suds_silver" : "suds_bronze")
        : this.kind === "health" ? "health" : this.kind === "pill" ? "pill" : "water_can";
      Assets.shadow(ctx, this.x - cam, Geo.feetScreenY(this.y, 0), 5);
      Assets.draw(ctx, key, this.x - cam, Geo.feetScreenY(this.y, this.z), 1, { t: this.t });
    }
  }
  JH.Pickup = Pickup;

  // ====================================================== SHOP VENDOR
  // A walk-up merchant ("Old Spigot") that appears between fights. Not an
  // enemy — purely a world prop you stand next to to open the shop.
  class ShopNPC {
    constructor(x, y) { this.x = x; this.y = y; this.z = 0; this.facing = -1; this.t = 0; this.bodyW = 18; }
    update(dt) { this.t += dt; }
    draw(ctx, cam) {
      const sx = this.x - cam;
      Assets.shadow(ctx, sx, Geo.feetScreenY(this.y, 0), 14);
      Assets.draw(ctx, "shopkeeper", sx, Geo.feetScreenY(this.y, 0), this.facing, { t: this.t });
    }
  }
  JH.ShopNPC = ShopNPC;

  // ============================================ SWITCH OF DOOM (boss 2)
  // 8-port switch with Doc-Ock cable tentacles. Fires telegraphed FULL-WIDTH
  // line attacks along a depth row — dodge by changing lane (up/down) or
  // jumping over. Distinct from the Big Drip's positional zone attack.
  class SwitchBoss extends Enemy {
    constructor(x, y) {
      super("mook", x, y);
      this.def = JH.SWITCH;
      this.type = "switch";
      this.hp = this.maxHp = JH.SWITCH.hp;
      this.bodyW = JH.SWITCH.bodyW; this.bodyH = JH.SWITCH.bodyH;
      this.isBoss = true;
      this.state = "hover";
      this.lines = [];          // active danger-line depths
      this.whipTargets = [];    // active column X positions
      this._doLine = false; this._doWhip = false;
      this._atkPhase = 0;
      this._bounds = null;
      this.windTimer = 0; this.atkDur = 0; this.cdTimer = 1.4; this.fireFx = 0;
    }
    think(dt, game) {
      this._bounds = game.bounds;
      const pl = game.player, d = this.def;
      const enraged = this.hp / this.maxHp < d.enrageAt;
      if (this.fireFx > 0) this.fireFx -= dt;

      // Hover near the right of the arena, drifting slowly to track depth.
      const hoverX = (game.bounds.minX + game.bounds.maxX) / 2 + 80;
      const mv = d.speed * dt;
      this.x += Math.max(-mv, Math.min(mv, hoverX - this.x));
      this.y += (pl.y - this.y) * 0.5 * dt;
      this.y = Geo.clampDepth(this.y);
      this.facing = pl.x >= this.x ? 1 : -1;

      if (this.state === "tele") {
        this.windTimer -= dt;
        // Track player during first 60% of wind-up, then lock aim
        if (this.windTimer > this.atkDur * 0.4) {
          if (this._doLine && this.lines.length > 0) this.lines[0] = { x: pl.x, y: Geo.clampDepth(pl.y) };
          if (this._doWhip && this.whipTargets.length > 0) this.whipTargets[0] = pl.x;
        }
        if (this.windTimer <= 0) {
          if (this._doLine) {
            for (const lt of this.lines)
              if (Math.abs(pl.x - lt.x) <= d.whipBand && (pl.z || 0) < 18)
                pl.takeHit(d.lineDmg, game, this.x);
          }
          if (this._doWhip) {
            for (const wx of this.whipTargets)
              if (Math.abs(pl.x - wx) <= d.whipBand && (pl.z || 0) < 18)
                pl.takeHit(d.whipDmg, game, this.x);
          }
          this.fireFx = 0.22; game.shake(7); game.audio.play("whack");
          this.state = "fire"; this.cdTimer = enraged ? 1.0 : 1.8;
        }
        return;
      }
      if (this.state === "fire") { if (this.fireFx <= 0) this.state = "hover"; return; }
      if (this.cdTimer > 0) { this.cdTimer -= dt; this.state = "hover"; return; }
      if (this.spawnGrace <= 0) {
        this._atkPhase++;
        if (!enraged) {
          // Alternate: vertical cable slam (line) and horizontal cable whip (column)
          if (this._atkPhase % 2 !== 0) {
            this._doLine = true; this._doWhip = false;
            this.lines = [{ x: pl.x, y: Geo.clampDepth(pl.y) }]; this.whipTargets = [];
            this.atkDur = this.windTimer = d.lineWind;
          } else {
            this._doLine = false; this._doWhip = true;
            this.lines = []; this.whipTargets = [pl.x];
            this.atkDur = this.windTimer = d.whipWind;
          }
        } else {
          // Enraged: randomly pick two verticals, two horizontals, or one of each
          const r = Math.floor(Math.random() * 3);
          if (r === 0) {
            this._doLine = true; this._doWhip = false;
            const off = Math.random() < 0.5 ? -30 : 30;
            this.lines = [
              { x: pl.x, y: Geo.clampDepth(pl.y) },
              { x: pl.x + (Math.random() < 0.5 ? -50 : 50), y: Geo.clampDepth(pl.y + off) },
            ];
            this.whipTargets = [];
          } else if (r === 1) {
            this._doLine = false; this._doWhip = true;
            this.lines = [];
            this.whipTargets = [pl.x, pl.x + (Math.random() < 0.5 ? -50 : 50)];
          } else {
            this._doLine = true; this._doWhip = true;
            this.lines = [{ x: pl.x, y: Geo.clampDepth(pl.y) }]; this.whipTargets = [pl.x];
          }
          this.atkDur = this.windTimer = d.lineWind * 0.72;
        }
        this.state = "tele"; game.audio.play("jump");
      }
    }
    draw(ctx, cam) {
      this.drawCables(ctx, cam);
      if (this._doLine && (this.state === "tele" || this.fireFx > 0)) this.drawLines(ctx, cam);
      if (this._doWhip && (this.state === "tele" || this.fireFx > 0)) this.drawColumns(ctx, cam);
      JH.Enemy.prototype.draw.call(this, ctx, cam);
      // shared boss core glyph
      const cx = this.x - cam, cy = Geo.feetScreenY(this.y, this.z) - this.bodyH * 0.5;
      Assets.bossCore(ctx, cx, cy, 4, this.t, { flash: this.fireFx > 0 });
    }
    // Doc-Ock cables waving out of the chassis.
    drawCables(ctx, cam) {
      const cx = this.x - cam, cy = Geo.feetScreenY(this.y, this.z) - this.bodyH * 0.5;
      ctx.save();
      ctx.strokeStyle = JH.PAL.cable; ctx.lineWidth = 2; ctx.lineCap = "round";
      for (let i = 0; i < 4; i++) {
        const dir = i < 2 ? -1 : 1;
        const ph = this.t * 3 + i;
        const ex = cx + dir * (22 + i * 7);
        const ey = cy + Math.sin(ph) * 10 + (i % 2 ? 6 : -6);
        ctx.beginPath();
        ctx.moveTo(cx + dir * 10, cy);
        ctx.quadraticCurveTo(cx + dir * 22, cy + Math.cos(ph) * 12, ex, ey);
        ctx.stroke();
        ctx.fillStyle = (Math.floor(this.t * 6 + i) % 2) ? "#ff5a5a" : JH.PAL.switchLed;
        ctx.fillRect(Math.round(ex - 1.5), Math.round(ey - 1.5), 3, 3);
      }
      ctx.restore();
    }
    // Floor-spot slam — tentacle drives to the locked (x,y) position on the ground.
    drawLines(ctx, cam) {
      const cx = this.x - cam;
      const cy = Geo.feetScreenY(this.y, this.z) - this.bodyH * 0.5;
      const band = this.def.lineBand, strike = this.fireFx > 0;
      const prog = this.atkDur ? 1 - this.windTimer / this.atkDur : 1;
      ctx.save();
      // Danger zone: floor ellipse at each locked position
      for (const lt of this.lines) {
        const sx = lt.x - cam;
        const sy = Geo.feetScreenY(lt.y, 0);
        const rx = this.def.whipBand * 2, ry = band;
        if (strike) {
          ctx.fillStyle = "rgba(120,240,255,0.65)";
          ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#dffaff"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
        } else {
          const blink = (Math.floor(this.t * 12) & 1);
          ctx.globalAlpha = 0.55;
          ctx.strokeStyle = blink ? "#ff5a5a" : "#ffd23f"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = 0.12 + 0.22 * prog;
          ctx.fillStyle = "#ff5a5a";
          ctx.beginPath(); ctx.ellipse(sx, sy, rx * prog, ry * prog, 0, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      // Arm animation
      if (!strike) {
        // 0–20%: raise up; 20–55%: hold at peak; 55–100%: slam diagonally to target
        ctx.strokeStyle = JH.PAL.cable; ctx.lineCap = "round";
        for (const lt of this.lines) {
          const sx = lt.x - cam;
          const sy = Geo.feetScreenY(lt.y, 0);
          let armEndX, armEndY, ctrlX, ctrlY;
          if (prog < 0.20) {
            armEndX = cx; armEndY = cy - 50 * (prog / 0.20);
            ctrlX = cx + Math.sin(this.t * 9) * 8; ctrlY = (cy + armEndY) / 2;
          } else if (prog < 0.55) {
            armEndX = cx; armEndY = cy - 50;
            ctrlX = cx + Math.sin(this.t * 7) * 4; ctrlY = cy - 25;
          } else {
            const sp = (prog - 0.55) / 0.45;
            armEndX = cx + (sx - cx) * sp;
            armEndY = (cy - 50) + (sy - (cy - 50)) * sp;
            // Control point stays near raised position — creates whip arc toward target
            ctrlX = cx; ctrlY = cy - 30;
          }
          ctx.lineWidth = prog >= 0.55 ? 3 : 2;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.quadraticCurveTo(ctrlX, ctrlY, armEndX, armEndY);
          ctx.stroke();
          ctx.fillStyle = (Math.floor(this.t * 6) % 2) ? "#ff5a5a" : JH.PAL.switchLed;
          const hs = prog >= 0.55 ? 2 : 1.5;
          ctx.fillRect(Math.round(armEndX - hs), Math.round(armEndY - hs), hs * 2, hs * 2);
        }
      }
      ctx.restore();
    }
    // Full-height danger column(s) at the targeted world X.
    drawColumns(ctx, cam) {
      const cx = this.x - cam;
      const cy = Geo.feetScreenY(this.y, this.z) - this.bodyH * 0.5;
      const band = this.def.whipBand, strike = this.fireFx > 0;
      const prog = this.atkDur ? 1 - this.windTimer / this.atkDur : 1;
      ctx.save();
      const floorY0 = Geo.feetScreenY(JH.DEPTH_MIN, 0) - 20;
      const floorH = Geo.feetScreenY(JH.DEPTH_MAX, 0) - floorY0;
      for (const wx of this.whipTargets) {
        const sx = wx - cam;
        ctx.fillStyle = strike ? "rgba(255,200,60,0.65)" : "rgba(255,130,0," + (0.10 + 0.28 * prog) + ")";
        ctx.fillRect(sx - band, floorY0, band * 2, floorH);
        ctx.strokeStyle = strike ? "#ffe880" : ((Math.floor(this.t * 12) & 1) ? "#ff8800" : "#ffd23f");
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx - band, floorY0, band * 2, floorH);
      }
      if (!strike) {
        // Phase 0–20 %: arm retracts right (pull-back)
        // Phase 20–55 %: arm HOLDS at pull-back peak (telegraph pause)
        // Phase 55–100%: arm WHIPS left to target column
        const retractX = cx + this.bodyW * 0.5 + 20;
        ctx.strokeStyle = JH.PAL.cable; ctx.lineWidth = 2; ctx.lineCap = "round";
        for (const wx of this.whipTargets) {
          const tx = wx - cam;
          let armEndX, ctrlY;
          if (prog < 0.20) {
            armEndX = cx + (retractX - cx) * (prog / 0.20);
            ctrlY = cy + Math.sin(this.t * 9) * 6;
          } else if (prog < 0.55) {
            armEndX = retractX;
            ctrlY = cy + Math.sin(this.t * 7) * 4;    // gentle sway at rest
          } else {
            const wp = (prog - 0.55) / 0.45;
            armEndX = retractX + (tx - retractX) * wp;
            ctrlY = cy;                                 // straight horizontal on whip
          }
          ctx.lineWidth = prog >= 0.55 ? 3 : 2;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.quadraticCurveTo((cx + armEndX) / 2, ctrlY, armEndX, cy);
          ctx.stroke();
          ctx.fillStyle = (Math.floor(this.t * 6) % 2) ? "#ff5a5a" : JH.PAL.switchLed;
          const hs = prog >= 0.55 ? 2 : 1.5;
          ctx.fillRect(Math.round(armEndX - hs), Math.round(cy - hs), hs * 2, hs * 2);
        }
      }
      ctx.restore();
    }
    die(game) {
      if (this.dead) return;
      this.dead = true;
      game.audio.play("win");
      for (const e of game.enemies) if (e !== this && !e.dead && !e.isBoss) e.dead = true;
      for (let i = 0; i < 6; i++)
        setTimeout(() => burst(game, this.x + (Math.random() - 0.5) * 50, this.y, Math.random() * 30, "#9be8ff", 14, { speed: 150, life: 0.6, up: 120 }), i * 90);
      spawnCoinFountain(game, this.x, this.y, this.def.suds);
      ejectBossCore(game, this);   // non-final form: eject the surviving core (cosmetic)
      game.onEnemyKilled(this);
    }
  }
  JH.SwitchBoss = SwitchBoss;

  // ================================================== DESTRUCTIBLE WALL
  // A barricade across the street. Not an enemy (no AI/contact) — the player
  // sprays/melees it down. While it stands, the zone keeps spawning foes.
  class Wall {
    constructor(x, hp) {
      this.x = x; this.y = JH.DEPTH_MAX * 0.5; this.z = 0;
      this.hp = this.maxHp = hp; this.bodyW = 14; this.dead = false; this.t = 0;
      this.hitFx = 0;
    }
    takeDamage(dmg, game) {
      if (this.dead) return;
      this.hp -= dmg; this.hitFx = 0.08;
      if (this.hp <= 0) {
        this.hp = 0; this.dead = true;
        game.audio.play("die"); game.shake(8);
        for (let i = 0; i < 18; i++)
          burst(game, this.x + (Math.random() - 0.5) * 14, JH.DEPTH_MIN + Math.random() * JH.DEPTH_MAX,
            Math.random() * 30, JH.PAL.wallHi, 1, { speed: 130, life: 0.5, up: 80 });
      }
    }
    update(dt) { this.t += dt; if (this.hitFx > 0) this.hitFx -= dt; }
    draw(ctx, cam) {
      const sx = this.x - cam;
      const flash = this.hitFx > 0;
      // Barricade spanning the full depth band of the street.
      const yTop = Geo.feetScreenY(JH.DEPTH_MIN, 0) - 44;
      const yBot = Geo.feetScreenY(JH.DEPTH_MAX, 0);
      for (let yy = yTop; yy < yBot; yy += 8) {
        for (let r = 0; r < 2; r++) {
          ctx.fillStyle = flash ? "#fff" : ((((yy + r) >> 3) & 1) ? JH.PAL.wall : JH.PAL.wallDk);
          ctx.fillRect(Math.round(sx - 7 + r * 7), Math.round(yy), 7, 7);
          ctx.fillStyle = "rgba(0,0,0,0.25)";
          ctx.fillRect(Math.round(sx - 7 + r * 7), Math.round(yy + 6), 7, 1);
        }
      }
      // HP bar above the barricade.
      const w = 46, bx = sx - w / 2, by = yTop - 8;
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(bx - 1, by - 1, w + 2, 6);
      ctx.fillStyle = "#5c4327"; ctx.fillRect(bx, by, w, 4);
      ctx.fillStyle = JH.PAL.wallHi; ctx.fillRect(bx, by, w * Math.max(0, this.hp / this.maxHp), 4);
      ctx.fillStyle = "#fff"; ctx.font = "6px monospace"; ctx.textAlign = "center";
      ctx.fillText("BARRICADE", sx, by - 3); ctx.textAlign = "left";
    }
  }
  JH.Wall = Wall;

  // ============================================== QUAKE SHOCKWAVE
  // A tremor that rolls along the FLOOR from a stomp. Spans the whole depth
  // band and only hits a GROUNDED player — jump over it. Runs through the
  // game.embers pipeline (update(dt,game)->keep, draw(ctx,cam)).
  class Shockwave {
    constructor(x, dir, speed, def) {
      this.x = x; this.dir = dir; this.speed = speed;
      this.dmg = def.waveDmg; this.range = def.waveRange;
      this.traveled = 0; this.t = 0; this.dead = false; this.hit = false;
    }
    update(dt, game) {
      this.t += dt;
      const step = this.speed * dt * this.dir;
      this.x += step; this.traveled += Math.abs(step);
      const pl = game.player;
      // Sweeps across all lanes — DASH through it (dash i-frames) to dodge.
      if (!this.hit && pl.alive && Math.abs(pl.x - this.x) < 11) {
        pl.takeHit(this.dmg, game, this.x); this.hit = true; game.shake(4);
      }
      if (Math.random() < 0.7)
        burst(game, this.x, JH.DEPTH_MIN + Math.random() * (JH.DEPTH_MAX - JH.DEPTH_MIN), 0,
          Math.random() < 0.5 ? JH.PAL.rubble : "#caa470", 1, { speed: 45, life: 0.35, up: 70, grav: 240 });
      if (this.traveled > this.range) this.dead = true;
      return !this.dead;
    }
    draw(ctx, cam) {
      const sx = this.x - cam;
      if (sx < -20 || sx > JH.VIEW_W + 20) return;
      const yT = Geo.feetScreenY(JH.DEPTH_MIN, 0) - 4;
      const yB = Geo.feetScreenY(JH.DEPTH_MAX, 0) + 4;
      const fade = Math.max(0.15, 1 - this.traveled / this.range);
      const pulse = 0.65 + 0.35 * Math.abs(Math.sin(this.t * 24));
      const sxi = Math.round(sx);
      ctx.save();
      // Wide amber glow — tapered (floor perspective: wider at screen bottom)
      ctx.globalAlpha = 0.28 * fade;
      ctx.fillStyle = "#e0902f";
      ctx.beginPath();
      ctx.moveTo(sxi - 1, yT); ctx.lineTo(sxi + 1, yT);
      ctx.lineTo(sxi + 7, yB); ctx.lineTo(sxi - 7, yB);
      ctx.closePath(); ctx.fill();
      // Mid orange
      ctx.globalAlpha = 0.68 * pulse * fade;
      ctx.fillStyle = "#ff6a18";
      ctx.beginPath();
      ctx.moveTo(sxi - 0.5, yT); ctx.lineTo(sxi + 0.5, yT);
      ctx.lineTo(sxi + 3, yB); ctx.lineTo(sxi - 3, yB);
      ctx.closePath(); ctx.fill();
      // Bright white-yellow core
      ctx.globalAlpha = 0.95 * pulse * fade;
      ctx.fillStyle = "#fff8b0";
      ctx.beginPath();
      ctx.moveTo(sxi, yT); ctx.lineTo(sxi, yT);
      ctx.lineTo(sxi + 1.5, yB); ctx.lineTo(sxi - 1.5, yB);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  JH.Shockwave = Shockwave;

  // ============================================== ESCAPING BOSS CORE
  // A red core that ejects from a defeated boss, bounces off the floor and
  // skitters left across the arena before fading. Cosmetic only: rides the
  // game.embers pipeline (update(dt,game)->keep, draw(ctx,cam)), so it never
  // affects wave-clear or collision. Spawned via ejectBossCore().
  class BossCore {
    constructor(x, y, z) {
      this.x = x; this.y = y; this.z = z != null ? z : 26;
      this.vx = -70 - Math.random() * 40;        // flee left, past the player
      this.vz = 150 + Math.random() * 40;
      this.t = 0; this.life = 3.0; this.dead = false; this.bounces = 0;
      this.wob = Math.random() * Math.PI * 2;
    }
    update(dt, game) {
      this.t += dt;
      this.vz -= 380 * dt; this.z += this.vz * dt;
      this.x += this.vx * dt;
      this.y += Math.sin(this.t * 12 + this.wob) * 14 * dt;   // scuttle wobble
      this.y = Geo.clampDepth(this.y);
      if (this.z <= 0) {                          // bounce, scrambling faster each time
        this.z = 0; this.vz = Math.abs(this.vz) * 0.5;
        this.bounces++; this.vx *= 1.08;
        if (this.bounces === 1) game.audio.play("hit");
      }
      if (Math.random() < 0.7)
        burst(game, this.x, this.y, this.z + 4, Math.random() < 0.5 ? JH.PAL.wallbossCore : "#ff8a3c", 1,
          { speed: 36, life: 0.3, up: 16, grav: 120 });
      if (this.t > this.life || this.x < (game.bounds ? game.bounds.minX - 40 : -40)) this.dead = true;
      return !this.dead;
    }
    draw(ctx, cam) {
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, this.z);
      // fade out in the final 0.5s
      const fade = this.t > this.life - 0.5 ? Math.max(0, (this.life - this.t) / 0.5) : 1;
      if (fade < 1 && (Math.floor(this.t * 16) & 1)) return;   // flicker as it vanishes
      Assets.shadow(ctx, sx, Geo.feetScreenY(this.y, 0), 4);
      // little skittering legs
      ctx.save();
      ctx.strokeStyle = "#0d0f15"; ctx.lineWidth = 1;
      const lh = 4 + Math.sin(this.t * 20) * 1.5;
      for (const dx of [-3, 3]) {
        ctx.beginPath(); ctx.moveTo(sx + dx, sy - 3); ctx.lineTo(sx + dx * 1.6, sy + lh - 3); ctx.stroke();
      }
      ctx.restore();
      Assets.bossCore(ctx, sx, sy - 5, 4, this.t);
    }
  }
  JH.BossCore = BossCore;

  // Spawn an escaping BossCore from a defeated boss (cosmetic).
  function ejectBossCore(game, boss) {
    const z = (boss.bodyH || 30) * 0.5;
    game.embers.push(new BossCore(boss.x, boss.y, z));
    game.audio.play("hurt");
    game.banner("…THE CORE SURVIVES", 1.6);
  }
  JH.ejectBossCore = ejectBossCore;

  // ================================================ QUAKE WALKER (boss 3)
  class QuakeBoss extends Enemy {
    constructor(x, y) {
      super("mook", x, y);
      this.def = JH.QUAKE;
      this.type = "quake";
      this.hp = this.maxHp = JH.QUAKE.hp;
      this.bodyW = JH.QUAKE.bodyW; this.bodyH = JH.QUAKE.bodyH;
      this.isBoss = true;
      this.state = "walk";
      this.windTimer = 0; this.atkDur = 0; this.cdTimer = 1.2; this.strikeFx = 0;
      this._atkPhase = 0; this.leapTarget = null;
      this._leapStartX = 0; this._leapStartY = 0; this._leapProgress = 0;
    }
    think(dt, game) {
      // Keep boss inside the wave arena — spray knockback uses global level bounds.
      this.x = clamp(this.x, game.bounds.minX + 24, game.bounds.maxX - 24);

      const pl = game.player, d = this.def;
      const dx = pl.x - this.x, dy = pl.y - this.y, dist = Math.hypot(dx, dy);
      const enraged = this.hp / this.maxHp < d.enrageAt;
      const spd = enraged ? d.speed * 1.4 : d.speed;
      if (this.strikeFx > 0) this.strikeFx -= dt;

      // --- STOMP WIND-UP ---
      if (this.state === "tele") {
        this.windTimer -= dt;
        if (this.windTimer > this.atkDur * 0.4) this.facing = dx >= 0 ? 1 : -1;
        if (this.windTimer <= 0) {
          game.shake(11); game.audio.play("whack");
          if (Math.abs(pl.x - this.x) < d.stompRadius && Math.abs(dy) < 26)
            pl.takeHit(d.stompDmg, game, this.x);
          const ws = enraged ? d.waveSpeed * 1.3 : d.waveSpeed;
          game.embers.push(new Shockwave(this.x, -1, ws, d));
          game.embers.push(new Shockwave(this.x, 1, ws, d));
          if (enraged) {
            game.embers.push(new Shockwave(this.x, -1, ws * 0.55, d));
            game.embers.push(new Shockwave(this.x, 1, ws * 0.55, d));
          }
          for (let i = 0; i < 16; i++)
            burst(game, this.x + (Math.random() - 0.5) * 34, this.y + (Math.random() - 0.5) * 30, 2,
              Math.random() < 0.5 ? JH.PAL.rubble : "#caa470", 1, { speed: 130, life: 0.45, up: 60 });
          this.strikeFx = 0.24;
          this.state = "strike";
          this.cdTimer = enraged ? 1.0 : 1.8;
        }
        return;
      }
      if (this.state === "strike") { if (this.strikeFx <= 0) this.state = "walk"; return; }

      // --- LEAP WIND-UP: target circle appears at landing spot ---
      if (this.state === "leapWind") {
        this.windTimer -= dt;
        if (this.windTimer > this.atkDur * 0.3)
          this.facing = (this.leapTarget.x - this.x) >= 0 ? 1 : -1;
        if (this.windTimer <= 0) {
          this._leapStartX = this.x; this._leapStartY = this.y;
          this._leapProgress = 0;
          this.state = "leaping";
          game.audio.play("jump");
        }
        return;
      }

      // --- LEAPING: parabolic arc across the arena ---
      if (this.state === "leaping") {
        this._leapProgress += dt / d.leapDur;
        const prog = Math.min(1, this._leapProgress);
        this.x = this._leapStartX + (this.leapTarget.x - this._leapStartX) * prog;
        this.y = this._leapStartY + (this.leapTarget.y - this._leapStartY) * prog;
        this.z = d.leapPeak * 4 * prog * (1 - prog);
        this.facing = (this.leapTarget.x - this._leapStartX) >= 0 ? 1 : -1;
        if (prog >= 1) {
          this.z = 0;
          game.shake(14); game.audio.play("whack");
          const ldist = Math.hypot(pl.x - this.x, pl.y - this.y);
          if (ldist < d.leapRadius) pl.takeHit(d.leapDmg, game, this.x);
          for (let i = 0; i < 22; i++)
            burst(game, this.x + (Math.random() - 0.5) * 28, this.y + (Math.random() - 0.5) * 22, 0,
              Math.random() < 0.4 ? JH.PAL.rubble : "#d8a860", 1, { speed: 190, life: 0.6, up: 100, grav: 250 });
          this.strikeFx = 0.32;
          this.state = "leapLand";
          this.cdTimer = enraged ? 1.1 : 1.9;
        }
        return;
      }

      // --- LEAP LANDING: brief recovery pose ---
      if (this.state === "leapLand") { if (this.strikeFx <= 0) this.state = "walk"; return; }

      // --- walk toward player, then pick next attack ---
      this.facing = dx >= 0 ? 1 : -1;
      if (this.cdTimer > 0) {
        this.cdTimer -= dt;
        this.x += (dx / (dist || 1)) * spd * dt;
        this.y += (dy / (dist || 1)) * spd * dt * 0.6;
        this.state = "walk";
        return;
      }

      this._atkPhase++;
      const doLeap = enraged ? (this._atkPhase % 2 === 0) : (this._atkPhase % 3 === 0);
      if (doLeap) {
        const mid = (game.bounds.minX + game.bounds.maxX) * 0.5;
        const tx = clamp(
          this.x < mid ? game.bounds.maxX - 50 : game.bounds.minX + 50,
          game.bounds.minX + 30, game.bounds.maxX - 30
        );
        this.leapTarget = { x: tx, y: pl.y };
        this.atkDur = this.windTimer = enraged ? d.leapWind * 0.75 : d.leapWind;
        this.state = "leapWind";
      } else {
        this.atkDur = this.windTimer = enraged ? d.stompWind * 0.7 : d.stompWind;
        this.state = "tele";
        game.audio.play("jump");
      }
    }

    draw(ctx, cam) {
      if (this.state === "tele") this.drawTelegraph(ctx, cam);
      if (this.state === "leapWind" && this.leapTarget) this.drawLeapTelegraph(ctx, cam);
      // Ghost shadow at landing spot while airborne
      if (this.state === "leaping" && this.leapTarget) {
        const tsx = this.leapTarget.x - cam;
        const tsy = Geo.feetScreenY(this.leapTarget.y, 0);
        const w = this.bodyW * 0.65;
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        ctx.beginPath();
        ctx.ellipse(Math.round(tsx), Math.round(tsy), w, w * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      JH.Enemy.prototype.draw.call(this, ctx, cam);
      if (this.state === "tele" || this.state === "leapWind") {
        const sx = this.x - cam, sy = Geo.feetScreenY(this.y, this.z) - this.bodyH - 8;
        ctx.fillStyle = (Math.floor(this.t * 10) & 1) ? "#ff5a5a" : "#fff";
        ctx.font = "bold 13px monospace"; ctx.textAlign = "center";
        ctx.fillText(this.state === "leapWind" ? "!!" : "!", sx, sy);
        ctx.textAlign = "left";
      }
    }
    drawTelegraph(ctx, cam) {
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, 0);
      const prog = this.atkDur ? 1 - this.windTimer / this.atkDur : 1;
      const r = this.def.stompRadius;
      ctx.save();
      ctx.strokeStyle = (Math.floor(this.t * 12) & 1) ? "#ff5a5a" : "#ffd23f";
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.ellipse(sx, sy, r, r * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#ff5a5a";
      ctx.beginPath(); ctx.ellipse(sx, sy, r * prog, r * 0.4 * prog, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    drawLeapTelegraph(ctx, cam) {
      const tx = this.leapTarget.x - cam;
      const ty = Geo.feetScreenY(this.leapTarget.y, 0);
      const prog = this.atkDur > 0 ? 1 - this.windTimer / this.atkDur : 1;
      const r = this.def.leapRadius;
      const blink = (Math.floor(this.t * 14) & 1);
      ctx.save();
      ctx.strokeStyle = blink ? "#ff5a5a" : "#ffd23f";
      ctx.lineWidth = 1.5;
      // Outer ring
      ctx.globalAlpha = 0.65;
      ctx.beginPath(); ctx.ellipse(tx, ty, r, r * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
      // Crosshair
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(tx - r - 6, ty); ctx.lineTo(tx + r + 6, ty);
      ctx.moveTo(tx, ty - r * 0.5 - 6); ctx.lineTo(tx, ty + r * 0.5 + 6);
      ctx.stroke();
      // Fill progress
      ctx.globalAlpha = 0.18 + 0.2 * prog;
      ctx.fillStyle = "#ff5a5a";
      ctx.beginPath(); ctx.ellipse(tx, ty, r * prog, r * 0.45 * prog, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    die(game) {
      if (this.dead) return;
      this.dead = true;
      game.audio.play("win");
      for (let i = 0; i < 7; i++)
        setTimeout(() => burst(game, this.x + (Math.random() - 0.5) * 56, this.y, Math.random() * 36, "#e0902f", 14, { speed: 150, life: 0.7, up: 130 }), i * 90);
      spawnCoinFountain(game, this.x, this.y, this.def.suds);
      game.onEnemyKilled(this);
    }
  }
  JH.QuakeBoss = QuakeBoss;

  // ============================================= ROCK (neighbor projectile)
  // Arcs from neighbor to a LOCKED target position (similar to Switch cable hits).
  // A blinking ellipse telegraphs the landing spot during flight.
  class Rock {
    constructor(x, y, targetX, targetY, dmg, travelTime, startZ) {
      this.startX = x; this.startY = y;
      this.x = x; this.y = y;
      this.startZ = startZ || 0;
      this.z = this.startZ;
      this.targetX = targetX; this.targetY = targetY;
      this.dmg = dmg; this.travelTime = travelTime || 0.7;
      this.variant = Math.floor(Math.random() * 6);
      this.t = 0; this.dead = false; this.hit = false;
    }
    update(dt, game) {
      this.t += dt;
      const prog = Math.min(1, this.t / this.travelTime);
      this.x = this.startX + (this.targetX - this.startX) * prog;
      this.y = this.startY + (this.targetY - this.startY) * prog;
      // Arc descends from startZ to 0, with a gentle bonus peak early in flight
      this.z = this.startZ * (1 - prog) + 20 * 4 * prog * (1 - prog);
      if (prog >= 1 && !this.hit) {
        this.hit = true;
        burst(game, this.targetX, this.targetY, 0, JH.PAL.rock, 6, { speed: 70, life: 0.4, up: 28 });
        game.shake(3);
        const pl = game.player;
        if (pl.alive && Math.abs(pl.x - this.targetX) < 18 && Math.abs(pl.y - this.targetY) < 18)
          pl.takeHit(this.dmg, game, this.targetX);
        this.dead = true;
        return false;
      }
      return !this.dead;
    }
    draw(ctx, cam) {
      if (this.dead) return;
      const prog = Math.min(1, this.t / this.travelTime);
      // Telegraph ellipse at target position
      const tx = this.targetX - cam, ty = Geo.feetScreenY(this.targetY, 0);
      const blink = Math.floor(this.t * 10) & 1;
      ctx.save();
      ctx.strokeStyle = blink ? "#ff8800" : "#ffd23f"; ctx.lineWidth = 1;
      ctx.globalAlpha = 0.25 + 0.5 * prog;
      ctx.beginPath(); ctx.ellipse(tx, ty, 10, 4, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.10 + 0.12 * prog; ctx.fillStyle = "#ff8800";
      ctx.beginPath(); ctx.ellipse(tx, ty, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      // Rock sprite travelling in arc
      JH.Assets.draw(ctx, "rock", this.x - cam, Geo.feetScreenY(this.y, this.z), 1, { t: this.t, variant: this.variant });
      ctx.restore();
    }
  }
  JH.Rock = Rock;

  // ============================================= SOUNDWAVE (neighbor speaker attack)
  // Travels horizontally in the facing direction. Damages player once per arc if
  // they are within the locked depth band (soundwaveBand) when the arc passes.
  class Soundwave {
    constructor(x, y, facing, def) {
      this.originX = x; this.y = y; this.facing = facing;
      this.def = def;
      this.speed = def.soundwaveSpeed;
      this.band = def.soundwaveBand;
      const n = def.soundwaveArcs;
      // Each arc starts at the origin and is staggered by a launch delay so they
      // all visually originate from the speaker before fanning out.
      this.arcs = [];
      for (let i = 0; i < n; i++) {
        this.arcs.push({ offset: 0, delay: (n - 1 - i) * 0.09, hit: false });
      }
      this.t = 0;
      this.dead = false;
      this.maxReach = 300;
    }
    update(dt, game) {
      this.t += dt;
      const pl = game.player;
      for (const arc of this.arcs) {
        if (this.t < arc.delay) continue;
        arc.offset += this.speed * dt * this.facing;
        const arcX = this.originX + arc.offset;
        if (!arc.hit && pl.alive) {
          const dx = Math.abs(pl.x - arcX);
          const dy = Math.abs(pl.y - this.y);
          if (dx < 8 && dy < this.band) {
            arc.hit = true;
            pl.takeHit(this.def.soundwaveDmg, game, arcX);
          }
        }
      }
      if (Math.abs(this.arcs[this.arcs.length - 1].offset) > this.maxReach) this.dead = true;
      return !this.dead;
    }
    draw(ctx, cam) {
      if (this.dead) return;
      ctx.save();
      for (let i = 0; i < this.arcs.length; i++) {
        const arc = this.arcs[i];
        if (this.t < arc.delay) continue;
        const ax = this.originX + arc.offset - cam;
        const ay = Geo.feetScreenY(this.y, 0);
        const frac = Math.abs(arc.offset) / 300;
        const alpha = arc.hit ? 0 : Math.max(0, 0.85 - frac * 0.7);
        const width = 3 + i * 1;
        const arcH = 10 + i * 4;
        ctx.save();
        ctx.translate(Math.round(ax), Math.round(ay - 6));
        ctx.scale(this.facing, 1);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = JH.PAL.soundwave;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.ellipse(0, 0, 6, arcH, 0, -Math.PI * 0.6, Math.PI * 0.6);
        ctx.stroke();
        ctx.globalAlpha = alpha * 0.35;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }
  JH.Soundwave = Soundwave;

  // ================================================= GARDEN BOX
  class GardenBox {
    constructor(x, y, idx) {
      this.x = x; this.y = (y != null) ? y : JH.DEPTH_MAX * 0.5; this.z = 0;
      this.idx = idx || 0;
      this.grow = 0; this.growMax = JH.GARDEN.growMax;
      this.bodyW = 42; this.dead = false; this.done = false; this.t = 0; this.hitFx = 0;
      this.doneFx = 0;   // countdown that drives the "GREAT!" pop on completion
    }
    addGrow(amt, game) {
      if (this.done) return;
      this.grow = Math.min(this.growMax, this.grow + amt);
      this.hitFx = 0.12;
      if (this.grow >= this.growMax) {
        this.done = true;
        this.doneFx = 1.6;
        game.audio.play("win"); game.shake(4);
        burst(game, this.x, this.y, 20, "#5a9a40", 18, { speed: 80, life: 0.7, up: 60 });
        burst(game, this.x, this.y, 10, "#fff7a0", 10, { speed: 60, life: 0.5, up: 40 });
        // Every box drops a pill; first box also unlocks elite drops and shows banner
        if (!game.concertaUnlocked) {
          game.concertaUnlocked = true;
          game.banner("CONCERTA UNLOCKED!", 4.0);
        }
        game.spawnPickup("pill", this.x, this.y, 1);
        game.gardensCleared = (game.gardensCleared || 0) + 1;
      }
    }
    update(dt) { this.t += dt; if (this.hitFx > 0) this.hitFx -= dt; if (this.doneFx > 0) this.doneFx -= dt; }
    draw(ctx, cam) {
      const sx = this.x - cam;
      const sy = Geo.feetScreenY(this.y, 0) - 4;
      const gf = this.grow / this.growMax;
      JH.Assets.draw(ctx, "garden_box", sx, sy, 1, { growFrac: gf });
      // Growth bar (rises with the plants)
      const w = 44, bx = sx - w / 2, by = sy - 28 - Math.round(gf * 16);
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(bx - 1, by - 1, w + 2, 7);
      ctx.fillStyle = "#1a3a10"; ctx.fillRect(bx, by, w, 5);
      ctx.fillStyle = this.done ? "#55cc44" : (this.hitFx > 0 ? "#aaffaa" : "#3a9a28");
      ctx.fillRect(bx, by, this.done ? w : Math.round(w * gf), 5);

      // Floating prompt centred on the plant: encouragement while watering,
      // then a "GREAT!" pop that rises and fades on completion.
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "bold 7px monospace";
      if (this.done && this.doneFx > 0) {
        const k = this.doneFx / 1.6;                 // 1 → 0
        const ty = by - 6 - (1 - k) * 14;            // rises as it fades
        ctx.globalAlpha = Math.min(1, k * 1.4);
        ctx.fillStyle = "#0a2a08"; ctx.fillText("GREAT!", sx + 1, ty + 1);
        ctx.fillStyle = "#7dff5a"; ctx.fillText("GREAT!", sx, ty);
      } else if (!this.done && this.hitFx > 0) {
        const ty = by - 6 + Math.sin(this.t * 6) * 1.5;
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = "#062033"; ctx.fillText("Keep watering!", sx + 1, ty + 1);
        ctx.fillStyle = "#bfefff"; ctx.fillText("Keep watering!", sx, ty);
      }
      ctx.restore();
    }
  }
  JH.GardenBox = GardenBox;

  // ============================================= NEIGHBOR NPC
  // Rock-thrower / speaker-blaster hybrid. Ghosts between throws; materialises
  // for both attacks. Rock: 3-frame wind-up (rockReach→rockRaise) then flies.
  // Speaker: raise speaker (telegraph depth band) → blast (stay visible ~0.8s
  // while soundwaves travel) → vanish. 66/33 rock/speaker, never speaker twice.
  class NeighborNPC extends Enemy {
    constructor(x, y) {
      super("neighbor", x, y);
      this.facing = 1;
      this.state = "idle";           // idle | rockReady | rockReach | rockRaise | speakerRaise | speakerBlast
      this.cdTimer = 1.8;
      this._windTimer = 0;
      this._windDur = 0;
      this._rockTarget = null;
      this._lastWasSpeaker = false;
      this._speakerHoldTimer = 0;
      this._speakerDepth = 0;        // locked y-row for soundwave telegraph
    }
    think(dt, game) {
      const pl = game.player;
      this.facing = pl.x >= this.x ? 1 : -1;

      if (this.cdTimer > 0) { this.cdTimer -= dt; this.state = "idle"; return; }

      // ---- speaker raise wind-up ----
      if (this.state === "speakerRaise") {
        this._windTimer -= dt;
        if (this._windTimer <= 0) {
          this.state = "speakerBlast";
          this._speakerHoldTimer = this.def.speakerHold;
          game.embers.push(new Soundwave(
            this.x + this.facing * 10, this._speakerDepth, this.facing, this.def
          ));
          game.audio.play("blast");
        }
        return;
      }

      // ---- speaker hold (visible while arcs travel) ----
      if (this.state === "speakerBlast") {
        this._speakerHoldTimer -= dt;
        if (this._speakerHoldTimer <= 0) {
          this.cdTimer = this.def.rockCd;
          this.state = "idle";
          this._lastWasSpeaker = true;
        }
        return;
      }

      // ---- rock wind-up (3 frames: rockReady → rockReach → rockRaise) ----
      if (this.state === "rockReady" || this.state === "rockReach" || this.state === "rockRaise") {
        this._windTimer -= dt;
        const frac = this._windTimer / this._windDur;
        // rockReady (idle pose) for first third, rockReach for middle, rockRaise for last third
        if (this.state === "rockReady" && frac < 0.67) this.state = "rockReach";
        if (this.state === "rockReach" && frac < 0.33) this.state = "rockRaise";
        // Track player for first 60% of wind-up, lock aim after
        if (this._windTimer > this._windDur * 0.4)
          this._rockTarget = { x: pl.x, y: pl.y };
        if (this._windTimer <= 0) {
          const tgt = this._rockTarget || { x: pl.x, y: pl.y };
          const dist = Math.max(1, Math.hypot(tgt.x - this.x, tgt.y - this.y));
          game.embers.push(new Rock(
            this.x + this.facing * 10, this.y,
            tgt.x, tgt.y, this.def.rockDmg,
            Math.max(0.42, dist / this.def.rockSpeed),
            52  // startZ: hand height when arm is raised
          ));
          game.audio.play("whack");
          this.cdTimer = this.def.rockCd;
          this.state = "idle";
          this._lastWasSpeaker = false;
        }
        return;
      }

      // ---- choose next attack and teleport ----
      const b = game.bounds;
      const MIN_DIST = 90;
      let tx, ty, tries = 0;
      do {
        tx = b.minX + 20 + Math.random() * (b.maxX - b.minX - 40);
        ty = JH.DEPTH_MIN + 8 + Math.random() * (JH.DEPTH_MAX - JH.DEPTH_MIN - 16);
      } while (Math.hypot(tx - pl.x, ty - pl.y) < MIN_DIST && ++tries < 12);
      this.x = tx; this.y = ty;
      this.facing = pl.x >= this.x ? 1 : -1;

      const doSpeaker = !this._lastWasSpeaker && Math.random() < this.def.speakerChance;
      if (doSpeaker) {
        this._windDur = this._windTimer = this.def.speakerWindup;
        this._speakerDepth = this.y;  // blast along neighbor's own depth row
        this.state = "speakerRaise";
      } else {
        this._windDur = this._windTimer = 0.66;
        this._rockTarget = { x: pl.x, y: pl.y };
        this.state = "rockReady";
      }
    }
    draw(ctx, cam) {
      const visible = this.state !== "idle";
      if (!visible) return;
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, 0);
      JH.Assets.shadow(ctx, sx, sy, 11);
      JH.Assets.draw(ctx, "neighbor", sx, Geo.feetScreenY(this.y, this.z), this.facing, {
        state: this.state, t: this.t, hurt: this.flashTimer > 0,
      });

      // Rock wind-up: telegraph ellipse at locked target
      if ((this.state === "rockReady" || this.state === "rockReach" || this.state === "rockRaise") && this._rockTarget && this._windDur > 0) {
        const tx = this._rockTarget.x - cam, ty = Geo.feetScreenY(this._rockTarget.y, 0);
        const prog = Math.min(1, 1 - this._windTimer / this._windDur);
        const blink = Math.floor(this.t * 10) & 1;
        ctx.save();
        ctx.strokeStyle = blink ? "#ff8800" : "#ffd23f"; ctx.lineWidth = 1;
        ctx.globalAlpha = 0.35 + 0.45 * prog;
        ctx.beginPath(); ctx.ellipse(tx, ty, 10, 4, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.15 * prog; ctx.fillStyle = "#ff8800";
        ctx.beginPath(); ctx.ellipse(tx, ty, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1; ctx.restore();
      }

      // Speaker wind-up: telegraph a blinking horizontal depth band
      if (this.state === "speakerRaise" && this._windDur > 0) {
        const blink = Math.floor(this.t * 10) & 1;
        const bandY = Geo.feetScreenY(this._speakerDepth, 0);
        const prog = Math.min(1, 1 - this._windTimer / this._windDur);
        ctx.save();
        ctx.strokeStyle = blink ? JH.PAL.soundwave : "#ffffff";
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.25 + 0.5 * prog;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(this.x - cam, bandY);
        ctx.lineTo(this.x - cam + this.facing * 300, bandY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1; ctx.restore();
      }
    }
    takeDamage() { /* invulnerable — only leaves when all crops are watered */ }
    die(game) {
      if (this.dead) return;
      this.dead = true;
      burst(game, this.x, this.y, 10, JH.PAL.neighbor, 8, { speed: 70, life: 0.4, up: 50 });
    }
  }
  JH.NeighborNPC = NeighborNPC;

  // ========================================== Gateway Krusher 9000 (true final boss)
  // A standing switch chassis — tall and meaner — with an embedded angry face.
  // Adds a depth-row surge on top of the Switch's cable attacks.
  class GatewayKrusherBoss extends SwitchBoss {
    constructor(x, y) {
      super(x, y);
      this.def = JH.GATEWAYKRUSHER;
      this.type = "gatewaykrusher";
      this.hp = this.maxHp = JH.GATEWAYKRUSHER.hp;
      this.bodyW = JH.GATEWAYKRUSHER.bodyW; this.bodyH = JH.GATEWAYKRUSHER.bodyH;
      this._doRow = false; this._rowY = 0;
      this.cdTimer = 1.6;
    }
    think(dt, game) {
      this._bounds = game.bounds;
      const pl = game.player, d = this.def;
      const enraged = this.hp / this.maxHp < d.enrageAt;
      if (this.fireFx > 0) this.fireFx -= dt;

      // Hover right of center
      const hoverX = (game.bounds.minX + game.bounds.maxX) / 2 + 70;
      const mv = d.speed * dt;
      this.x += Math.max(-mv, Math.min(mv, hoverX - this.x));
      this.y += (pl.y - this.y) * 0.4 * dt;
      this.y = Geo.clampDepth(this.y);
      this.facing = pl.x >= this.x ? 1 : -1;

      if (this.state === "tele") {
        this.windTimer -= dt;
        if (this.windTimer > this.atkDur * 0.4) {
          if (this._doLine && this.lines.length > 0) this.lines[0] = { x: pl.x, y: Geo.clampDepth(pl.y) };
          if (this._doWhip && this.whipTargets.length > 0) this.whipTargets[0] = pl.x;
          if (this._doRow) this._rowY = Geo.clampDepth(pl.y);
        }
        if (this.windTimer <= 0) {
          if (this._doLine) {
            for (const lt of this.lines)
              if (Math.abs(pl.x - lt.x) <= d.whipBand && (pl.z || 0) < 18)
                pl.takeHit(d.lineDmg, game, this.x);
          }
          if (this._doWhip) {
            for (const wx of this.whipTargets)
              if (Math.abs(pl.x - wx) <= d.whipBand && (pl.z || 0) < 18)
                pl.takeHit(d.whipDmg, game, this.x);
          }
          if (this._doRow && Math.abs(pl.y - this._rowY) <= d.rowBand && (pl.z || 0) < 20)
            pl.takeHit(d.rowDmg, game, this.x);
          this.fireFx = 0.22; game.shake(9); game.audio.play("whack");
          this.state = "fire"; this.cdTimer = enraged ? 0.85 : 1.55;
        }
        return;
      }
      if (this.state === "fire") { if (this.fireFx <= 0) this.state = "hover"; return; }
      if (this.cdTimer > 0) { this.cdTimer -= dt; this.state = "hover"; return; }
      if (this.spawnGrace <= 0) {
        this._atkPhase++;
        this._doLine = false; this._doWhip = false; this._doRow = false;
        this.lines = []; this.whipTargets = [];
        if (!enraged) {
          const phase = this._atkPhase % 3;
          if (phase === 0) {
            this._doLine = true;
            this.lines = [{ x: pl.x, y: Geo.clampDepth(pl.y) }];
            this.atkDur = this.windTimer = d.lineWind;
          } else if (phase === 1) {
            this._doWhip = true;
            this.whipTargets = [pl.x];
            this.atkDur = this.windTimer = d.whipWind;
          } else {
            this._doRow = true; this._rowY = Geo.clampDepth(pl.y);
            this.atkDur = this.windTimer = d.rowWind;
          }
        } else {
          const r = Math.floor(Math.random() * 4);
          if (r === 0) {
            this._doLine = true;
            this.lines = [
              { x: pl.x, y: Geo.clampDepth(pl.y) },
              { x: pl.x + (Math.random() < 0.5 ? -55 : 55), y: Geo.clampDepth(pl.y) },
            ];
            this.atkDur = this.windTimer = d.lineWind * 0.72;
          } else if (r === 1) {
            this._doWhip = true;
            this.whipTargets = [pl.x, pl.x + (Math.random() < 0.5 ? -55 : 55)];
            this.atkDur = this.windTimer = d.whipWind * 0.72;
          } else if (r === 2) {
            this._doRow = true; this._rowY = Geo.clampDepth(pl.y);
            this.atkDur = this.windTimer = d.rowWind * 0.70;
          } else {
            this._doRow = true; this._doWhip = true;
            this._rowY = Geo.clampDepth(pl.y); this.whipTargets = [pl.x];
            this.atkDur = this.windTimer = d.rowWind * 0.78;
          }
        }
        this.state = "tele"; game.audio.play("jump");
      }
    }
    draw(ctx, cam) {
      this.drawCables(ctx, cam);
      if (this._doLine && (this.state === "tele" || this.fireFx > 0)) this.drawLines(ctx, cam);
      if (this._doWhip && (this.state === "tele" || this.fireFx > 0)) this.drawColumns(ctx, cam);
      if (this._doRow && (this.state === "tele" || this.fireFx > 0)) this.drawDepthRow(ctx, cam);
      JH.Enemy.prototype.draw.call(this, ctx, cam);
      // shared boss core glyph (larger)
      const cx = this.x - cam, cy = Geo.feetScreenY(this.y, this.z) - this.bodyH * 0.55;
      Assets.bossCore(ctx, cx, cy, 5, this.t, { flash: this.fireFx > 0 });
    }
    drawDepthRow(ctx, cam) {
      const d = this.def;
      const strike = this.fireFx > 0;
      const prog = this.atkDur ? 1 - this.windTimer / this.atkDur : 1;
      const sy = Geo.feetScreenY(this._rowY, 0);
      const band = d.rowBand;
      ctx.save();
      ctx.fillStyle = strike ? "rgba(255,130,0,0.65)" : "rgba(255,80,0," + (0.10 + 0.26 * prog) + ")";
      ctx.fillRect(0, sy - band, JH.VIEW_W, band * 2);
      ctx.strokeStyle = strike ? "#ffcc44" : ((Math.floor(this.t * 12) & 1) ? "#ff8800" : "#ffd23f");
      ctx.lineWidth = 1.5;
      ctx.strokeRect(0, sy - band, JH.VIEW_W, band * 2);
      // Arm slam coming from the boss toward the row
      if (!strike) {
        const cx = this.x - cam, cy = Geo.feetScreenY(this.y, 0) - this.bodyH * 0.5;
        ctx.strokeStyle = JH.PAL.cable; ctx.lineWidth = prog > 0.55 ? 3 : 2; ctx.lineCap = "round";
        const targY = sy;
        const armY = prog < 0.55 ? cy - 40 * Math.min(1, prog / 0.20)
                                  : cy - 40 + (targY - (cy - 40)) * ((prog - 0.55) / 0.45);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.quadraticCurveTo(cx, (cy + armY) / 2, cx, armY);
        ctx.stroke();
      }
      ctx.restore();
    }
    die(game) {
      if (this.dead) return;
      this.dead = true;
      game.audio.play("win");
      for (const e of game.enemies) if (e !== this && !e.dead && !e.isBoss) e.dead = true;
      for (let i = 0; i < 9; i++)
        setTimeout(() => burst(game, this.x + (Math.random() - 0.5) * 60, this.y, Math.random() * 36,
          Math.random() < 0.5 ? "#ff3a3a" : "#ffcc44", 16, { speed: 170, life: 0.8, up: 150 }), i * 80);
      // No core ejection here — it shatters instead.
      const cy = this.bodyH * 0.55;
      for (let i = 0; i < 22; i++)
        burst(game, this.x + (Math.random() - 0.5) * 18, this.y, cy + (Math.random() - 0.5) * 20,
          Math.random() < 0.5 ? JH.PAL.wallbossCore : JH.PAL.wallbossCoreHi, 1, { speed: 200, life: 0.7, up: 40 });
      game.banner("CORE DESTROYED!", 2.0);
      spawnCoinFountain(game, this.x, this.y, this.def.suds);
      game.onEnemyKilled(this);
    }
  }
  JH.GatewayKrusherBoss = GatewayKrusherBoss;

  // ==================================================== THE FIREWALL (wall boss)
  // Switch-chassis wall pinned to the right edge of the arena; doesn't move.
  // Body is armoured (takeDamage ignores hits); only the WEAK SPOT (core) takes
  // damage, and only while OPEN. The core ROAMS in depth (this.y) — the player
  // must stand in its lane for the stream to register. Attacks: PORT SLAM slab
  // in front of the face (back off) and a SURGE shockwave (jump).
  // Not in JH.LEVEL1.waves; see JH.WALLBOSS in config.js for how to wire it in.
  class WallBoss extends Enemy {
    constructor(x, y) {
      super("mook", x, y);
      this.def = JH.WALLBOSS;
      this.type = "wallboss";
      this.hp = this.maxHp = JH.WALLBOSS.hp;
      this.bodyW = JH.WALLBOSS.bodyW; this.bodyH = JH.WALLBOSS.bodyH;
      this.isBoss = true;
      this.facing = -1;
      this.spawnGrace = 0.6;
      // Weak-spot ("core") cycle.
      this.wsState = "armored";              // armored | opening | open
      this.wsTimer = JH.WALLBOSS.wsClosed;
      this.wsOpenAmt = 0;                    // 0 shut .. 1 fully open (drives the iris)
      this.wsRetarget = 0;
      this.wsTargetY = y;                    // depth the core is drifting toward
      this.wsBobPhase = Math.random() * Math.PI * 2;
      // Attacks.
      this.atkState = "idle";                // idle | slamWind | crushWind | strike
      this.atkTimer = 0; this.atkDur = 0;
      this.slamCd = JH.WALLBOSS.slamCd;
      this.crushCd = JH.WALLBOSS.crushCd * 0.6;
      this.strikeFx = 0; this._clangFx = 0; this._hitFx = 0;
      this.summonTimer = JH.WALLBOSS.summonCd;
    }

    applyKnockback() { /* immovable — the hose can't shove a wall */ }

    // Armoured everywhere except the OPEN core. Spray/melee route through here.
    takeDamage(dmg, game) {
      if (this.dead) return;
      if (this.wsState !== "open") {
        this._clangFx = 0.07;                // ping off the armour, no damage
        if (Math.random() < 0.18)
          burst(game, this.x - this.bodyW * 0.5, this.y, 18 + Math.random() * 70, "#ffe6a0", 1,
            { speed: 90, life: 0.2, up: 20, grav: 320 });
        return;
      }
      this.hp -= dmg * (this.def.dmgMult || 1);
      this.hurt(); this._hitFx = 0.1;
      if (Math.random() < 0.4)
        burst(game, this.x - this.bodyW * 0.5, this.y, 40 + Math.random() * 40,
          Math.random() < 0.5 ? JH.PAL.wallbossCore : JH.PAL.wallbossCoreHi, 1,
          { speed: 80, life: 0.3, up: 30 });
      if (this.hp <= 0) this.die(game);
    }

    update(dt, game) {
      this.t += dt;
      if (this.strikeFx > 0) this.strikeFx -= dt;
      if (this._clangFx > 0) this._clangFx -= dt;
      if (this._hitFx > 0) this._hitFx -= dt;
      if (this.flashTimer > 0) this.flashTimer -= dt;
      if (this.spawnGrace > 0) this.spawnGrace -= dt;

      const d = this.def;
      const enraged = this.hp / this.maxHp < d.enrageAt;
      // Pin to the right edge of the arena; never moves.
      this.x = game.bounds.maxX - 6;
      this.facing = -1;

      this.updateWeakSpot(dt, d, enraged);
      this.updateContact(dt, game, d);
      this.updateSummon(dt, game, d, enraged);
      this.updateAttacks(dt, game, d, enraged);
    }

    // Drift the core to a roaming depth target + run the open/shut cycle. The
    // core's depth (this.y) is what the player's stream is tested against, so
    // roaming it forces the player to track its lane.
    updateWeakSpot(dt, d, enraged) {
      this.wsRetarget -= dt;
      if (this.wsRetarget <= 0) {
        this.wsRetarget = d.wsRetargetMin + Math.random() * (d.wsRetargetMax - d.wsRetargetMin);
        this.wsTargetY = JH.DEPTH_MIN + 4 + Math.random() * (JH.DEPTH_MAX - JH.DEPTH_MIN - 8);
      }
      const roam = d.wsRoam * (enraged ? 1.5 : 1) * dt;
      this.y += clamp(this.wsTargetY - this.y, -roam, roam);
      this.y = Geo.clampDepth(this.y);

      this.wsTimer -= dt;
      if (this.wsState === "armored") {
        this.wsOpenAmt = Math.max(0, this.wsOpenAmt - dt * 3);
        if (this.wsTimer <= 0) { this.wsState = "opening"; this.wsTimer = d.wsWind; }
      } else if (this.wsState === "opening") {
        this.wsOpenAmt = Math.min(1, this.wsOpenAmt + dt / d.wsWind);
        if (this.wsTimer <= 0) { this.wsState = "open"; this.wsTimer = enraged ? d.wsOpenEnraged : d.wsOpen; }
      } else { // open
        this.wsOpenAmt = 1;
        if (this.wsTimer <= 0) { this.wsState = "armored"; this.wsTimer = enraged ? d.wsClosedEnraged : d.wsClosed; }
      }
    }

    // Pressing against the wall face hurts (it spans the whole street).
    updateContact(dt, game, d) {
      if (this.contactTimer > 0) this.contactTimer -= dt;
      const pl = game.player;
      if (!pl.alive || this.contactTimer > 0) return;
      const face = this.x - this.bodyW * 0.5;
      if (pl.x + pl.bodyW * 0.5 >= face - 2 && (pl.z || 0) < 30) {
        pl.takeHit(d.touchDmg, game, this.x);
        this.contactTimer = d.contactCd;
      }
    }

    updateSummon(dt, game, d, enraged) {
      this.summonTimer -= dt;
      if (this.summonTimer <= 0 && game.enemies.filter((e) => !e.isBoss && !e.dead).length < 3) {
        this.summonTimer = enraged ? d.summonCd * 0.6 : d.summonCd;
        const ey = JH.DEPTH_MIN + 10 + Math.random() * (JH.DEPTH_MAX - JH.DEPTH_MIN - 20);
        game.spawnEnemy(d.summonType, this.x - this.bodyW * 0.5 - 10, ey, { infinite: true });
      }
    }

    updateAttacks(dt, game, d, enraged) {
      if (this.spawnGrace > 0) return;
      const pl = game.player;
      if (this.slamCd > 0) this.slamCd -= dt;
      if (this.crushCd > 0) this.crushCd -= dt;

      if (this.atkState === "slamWind") {
        this.atkTimer -= dt;
        if (this.atkTimer <= 0) this.fireSlam(game, d, enraged);
        return;
      }
      if (this.atkState === "crushWind") {
        this.atkTimer -= dt;
        if (this.atkTimer <= 0) this.fireCrush(game, d);
        return;
      }
      if (this.atkState === "strike") { if (this.strikeFx <= 0) this.atkState = "idle"; return; }

      // Port slam (front slab) is prioritised when the player hugs the face; else the surge.
      const face = this.x - this.bodyW * 0.5;
      const atFace = pl.alive && pl.x > face - d.crushReach;
      if (this.crushCd <= 0 && atFace) {
        this.atkState = "crushWind";
        this.atkDur = this.atkTimer = enraged ? d.crushWind * 0.7 : d.crushWind;
        this.crushCd = (enraged ? d.crushCd * 0.7 : d.crushCd) + this.atkDur;
        game.audio.play("jump");
      } else if (this.slamCd <= 0) {
        this.atkState = "slamWind";
        this.atkDur = this.atkTimer = enraged ? d.slamWind * 0.7 : d.slamWind;
        this.slamCd = (enraged ? d.slamCd * 0.7 : d.slamCd) + this.atkDur;
        game.audio.play("jump");
      }
    }

    fireSlam(game, d, enraged) {
      game.shake(9); game.audio.play("whack");
      const sx = this.x - this.bodyW * 0.5;
      const ws = enraged ? d.waveSpeed * 1.25 : d.waveSpeed;
      game.embers.push(new Shockwave(sx, -1, ws, d));            // rolls left at the player
      if (enraged) game.embers.push(new Shockwave(sx, -1, ws * 0.6, d));
      for (let i = 0; i < 14; i++)
        burst(game, sx, JH.DEPTH_MIN + Math.random() * (JH.DEPTH_MAX - JH.DEPTH_MIN), Math.random() * 20,
          Math.random() < 0.5 ? JH.PAL.rubble : "#caa470", 1, { speed: 130, life: 0.45, up: 60 });
      this.strikeFx = 0.22; this.atkState = "strike";
    }

    fireCrush(game, d) {
      game.shake(11); game.audio.play("whack");
      const pl = game.player;
      const face = this.x - this.bodyW * 0.5;
      // The slab covers the whole depth band out to crushReach — back off to dodge.
      if (pl.alive && pl.x > face - d.crushReach) pl.takeHit(d.crushDmg, game, this.x);
      for (let i = 0; i < 18; i++)
        burst(game, face - Math.random() * d.crushReach,
          JH.DEPTH_MIN + Math.random() * (JH.DEPTH_MAX - JH.DEPTH_MIN), Math.random() * 30,
          "#ffd06a", 1, { speed: 150, life: 0.4, up: 70 });
      this.strikeFx = 0.24; this.atkState = "strike";
    }

    // Screen position of the core: its depth lane sets the vertical slide.
    coreScreen(cam) {
      const sx = this.x - cam;
      return {
        coreX: sx - 22,
        coreY: Geo.feetScreenY(this.y, 0) - this.def.wsLift
             + Math.sin(this.t * 2 + this.wsBobPhase) * this.def.wsBob,
      };
    }

    draw(ctx, cam) {
      if (this.atkState === "crushWind") this.drawCrushTelegraph(ctx, cam);
      if (this.atkState === "slamWind")  this.drawSlamTelegraph(ctx, cam);

      const sx = this.x - cam;
      const floorBottom = Geo.feetScreenY(JH.DEPTH_MAX, 0);
      Assets.draw(ctx, "wallboss", sx, floorBottom, 1, { t: this.t });
      if (this._clangFx > 0) {                 // armour ping flash on the face edge
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillRect(Math.round(sx - this.bodyW * 0.5 - 2), floorBottom - 178, 5, 178);
      }

      this.drawLaneGuide(ctx, cam);
      this.drawCore(ctx, cam);
    }

    // Telegraph the vulnerable lane only while the core is opening/open: a
    // column from the floor up to the exposed core + flashing floor brackets
    // marking the depth to stand in. (Silent while armoured — nothing to hit.)
    drawLaneGuide(ctx, cam) {
      if (this.wsState === "armored") return;
      const sx = this.x - cam;
      const laneY = Geo.feetScreenY(this.y, 0);
      const { coreY } = this.coreScreen(cam);
      const colX = sx - 22;                          // aligned with the core's X
      const isOpen = this.wsState === "open";
      const blink = (Math.floor(this.t * 12) & 1);
      ctx.save();
      // vulnerable column (floor lane → core)
      ctx.globalAlpha = isOpen ? 0.18 + 0.12 * Math.abs(Math.sin(this.t * 6)) : 0.12;
      ctx.fillStyle = isOpen ? "#9bff9b" : "#ffd23f";
      ctx.fillRect(colX - 5, coreY, 10, laneY - coreY);
      // flashing floor brackets pointing to the lane
      ctx.globalAlpha = 1;
      ctx.strokeStyle = isOpen ? (blink ? "#bfffbf" : "#5fdf5f") : (blink ? "#ffd23f" : "#a8861f");
      ctx.lineWidth = 1.5;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(colX + s * 16, laneY - 4);
        ctx.lineTo(colX + s * 11, laneY);
        ctx.lineTo(colX + s * 16, laneY + 4);
        ctx.stroke();
      }
      ctx.restore();
    }

    // The roaming weak-spot core: iris shutters that open to expose the glow.
    drawCore(ctx, cam) {
      const { coreX, coreY } = this.coreScreen(cam);
      const open = this.wsOpenAmt, isOpen = this.wsState === "open";
      ctx.save();
      // housing
      ctx.fillStyle = "#0d0f15"; ctx.fillRect(coreX - 9, coreY - 11, 18, 22);
      ctx.fillStyle = JH.PAL.wallbossHi;
      ctx.fillRect(coreX - 9, coreY - 11, 18, 1); ctx.fillRect(coreX - 9, coreY + 10, 18, 1);
      // glowing core behind the shutters
      if (open > 0.02) {
        const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this.t * 6));
        ctx.globalAlpha = open * pulse;
        ctx.fillStyle = JH.PAL.wallbossCore;
        ctx.beginPath(); ctx.ellipse(coreX, coreY, 7, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = (this._hitFx > 0 || this.flashTimer > 0) ? "#ffffff" : JH.PAL.wallbossCoreHi;
        ctx.beginPath(); ctx.ellipse(coreX, coreY, 3.5 * open, 5 * open, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      // iris shutters slide apart as `open` grows
      const shut = Math.round(10 * (1 - open));
      ctx.fillStyle = JH.PAL.wallbossShut;
      ctx.fillRect(coreX - 8, coreY - 10, 16, shut);
      ctx.fillRect(coreX - 8, coreY + 10 - shut, 16, shut);
      if (shut > 0) {
        ctx.fillStyle = JH.PAL.wallbossHaz;
        ctx.fillRect(coreX - 8, coreY - 11 + shut, 16, 1);
        ctx.fillRect(coreX - 8, coreY + 10 - shut, 16, 1);
      }
      // telegraph ring (opening) / hot ring (open)
      if (this.wsState === "opening" || isOpen) {
        ctx.strokeStyle = isOpen ? "#ffe6a0" : ((Math.floor(this.t * 12) & 1) ? "#ff5a5a" : "#ffd23f");
        ctx.lineWidth = 1.5;
        ctx.strokeRect(coreX - 10, coreY - 12, 20, 24);
      }
      // crosshair reticle when fully exposed — "spray here"
      if (isOpen) {
        const r = 13 + Math.sin(this.t * 8) * 1.5;
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(coreX - r, coreY); ctx.lineTo(coreX - r + 4, coreY);
        ctx.moveTo(coreX + r, coreY); ctx.lineTo(coreX + r - 4, coreY);
        ctx.moveTo(coreX, coreY - r); ctx.lineTo(coreX, coreY - r + 4);
        ctx.moveTo(coreX, coreY + r); ctx.lineTo(coreX, coreY + r - 4);
        ctx.stroke(); ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    drawCrushTelegraph(ctx, cam) {
      const d = this.def, sx = this.x - cam;
      const face = sx - this.bodyW * 0.5;
      const prog = this.atkDur ? 1 - this.atkTimer / this.atkDur : 1;
      const yT = Geo.feetScreenY(JH.DEPTH_MIN, 0) - 40;
      const yB = Geo.feetScreenY(JH.DEPTH_MAX, 0) + 6;
      ctx.save();
      ctx.fillStyle = "rgba(255,60,40," + (0.12 + 0.30 * prog) + ")";
      ctx.fillRect(face - d.crushReach, yT, d.crushReach, yB - yT);
      ctx.strokeStyle = (Math.floor(this.t * 12) & 1) ? "#ff5a5a" : "#ffd23f";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(face - d.crushReach, yT, d.crushReach, yB - yT);
      ctx.restore();
    }

    drawSlamTelegraph(ctx, cam) {
      const sx = this.x - cam;
      const face = sx - this.bodyW * 0.5;
      const prog = this.atkDur ? 1 - this.atkTimer / this.atkDur : 1;
      const yT = Geo.feetScreenY(JH.DEPTH_MIN, 0) - 4;
      const yB = Geo.feetScreenY(JH.DEPTH_MAX, 0) + 4;
      ctx.save();
      ctx.globalAlpha = 0.3 + 0.4 * prog;
      ctx.fillStyle = (Math.floor(this.t * 16) & 1) ? "#ffd06a" : "#ff7a2a";
      ctx.fillRect(face - 6, yT, 8, yB - yT);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    die(game) {
      if (this.dead) return;
      this.dead = true;
      game.audio.play("win"); game.shake(16);
      for (const e of game.enemies) if (e !== this && !e.dead && !e.isBoss) e.dead = true;
      for (let i = 0; i < 12; i++)
        setTimeout(() => burst(game, this.x - 20 - Math.random() * 40,
          JH.DEPTH_MIN + Math.random() * (JH.DEPTH_MAX - JH.DEPTH_MIN), 10 + Math.random() * 120,
          Math.random() < 0.5 ? JH.PAL.wallbossCore : JH.PAL.wallbossHaz, 16,
          { speed: 180, life: 0.8, up: 150 }), i * 80);
      spawnCoinFountain(game, this.x - 40, this.y, this.def.suds);
      ejectBossCore(game, this);   // non-final form: eject the surviving core (cosmetic)
      game.onEnemyKilled(this);
    }
  }
  JH.WallBoss = WallBoss;

  // Factory used by the spawner.
  // ---- Target Dummy: stationary, unkillable, regens HP after taking damage ----
  class TargetDummy extends Enemy {
    constructor(x, y) {
      super("dummy", x, y);
      this.regenTimer = 0;
    }
    takeDamage(dmg, game, dirX, knock) {
      if (this.dead) return;
      this.hp = Math.max(1, this.hp - dmg);
      this.hurt();
      this.regenTimer = 2.5;
    }
    die() {}   // unkillable — absorbs all damage and resets
    update(dt, game) {
      this.basePhysics(dt);
      if (this.spawnGrace > 0) this.spawnGrace -= dt;
      if (this.regenTimer > 0) this.regenTimer -= dt;
      else if (this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 500 * dt);
      if (game.player) this.facing = game.player.x >= this.x ? 1 : -1;
      this.animate(dt, false);
    }
  }

  JH.makeEnemy = function (type, x, y) {
    if (type === "dummy") return new TargetDummy(x, y);
    if (type === "charger") return new Charger(type, x, y);
    if (type === "pyro") return new Pyro(type, x, y);
    if (type === "boss") return new Boss(x, y);
    if (type === "switch") return new SwitchBoss(x, y);
    if (type === "quake") return new QuakeBoss(x, y);
    if (type === "gatewaykrusher") return new GatewayKrusherBoss(x, y);
    if (type === "wallboss") return new WallBoss(x, y);
    if (type === "neighbor") return new NeighborNPC(x, y);
    return new Enemy(type, x, y);
  };
})();
