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
      if (this.concertaTimer > 0) this.concertaTimer -= dt;

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
        this._dashX = mx || this.facing; this._dashY = my;
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
      if (this.concertaTimer > 0) this.water = Math.min(S.maxWater, this.water + S.maxWater * dt);

      const ox = this.x + this.facing * 12;   // nozzle x (world)
      const oy = this.y;                       // nozzle depth
      const oz = this.z + (this.state === "walk" ? 28 : 34); // lower when walk-firing
      const reach = S.sprayRange * rangeMult;  // range shrinks with pressure
      const beam = S.beam | 0;                 // concentration tier 0..3

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
          life: reach / 210 + Math.random() * 0.12,   // travel length tracks the Reach upgrade
          color: Math.random() > 0.45 ? JH.PAL.waterHi : JH.PAL.water,
          size: dry ? 1 : (beam >= 2 ? 3 : 2),         // chunkier droplets at high Pressure
          grav: dry ? 220 : 70,
        }));
      }

      // Damage every enemy along the beam line within the depth band.
      let didHit = false;
      const hitEnemies = [];
      let healAmt = 0;
      for (const e of game.enemies) {
        if (e.dead) continue;
        if (Geo.inHitArc(this, e, this.facing, reach, S.sprayWidth)) {
          const mult = e.def ? (e.def.waterMult || 1) : 1;
          const dmg = S.sprayDamage * dmgScale * mult * dt;
          e.takeDamage(dmg, game, this.facing, 0);
          e.applyKnockback(this.facing, S.knockback * dt * 2.2, (e.y - this.y) * 0.02);
          if (Math.random() < 0.5)
            burst(game, e.x - this.facing * e.bodyW * 0.4, e.y, e.z + 12, JH.PAL.waterHi, 1,
              { speed: 70, life: 0.25, size: 2 });
          didHit = true;
          if (S.vampiricRate > 0) healAmt += dmg * S.vampiricRate;
          if (S.splitStream) hitEnemies.push(e);
        }
      }
      // Vampiric Hose: convert a fraction of spray damage into HP.
      if (healAmt > 0) this.hp = Math.min(S.maxHp, this.hp + healAmt);
      // Split Stream: 30% damage arc to the nearest neighbor of each hit enemy.
      if (S.splitStream && hitEnemies.length > 0) {
        for (const primary of hitEnemies) {
          let nearest = null, nearDist = 80;
          for (const e of game.enemies) {
            if (e.dead || e === primary) continue;
            const d = Math.hypot(e.x - primary.x, e.y - primary.y);
            if (d < nearDist) { nearest = e; nearDist = d; }
          }
          if (nearest) {
            const m2 = nearest.def ? (nearest.def.waterMult || 1) : 1;
            nearest.takeDamage(S.sprayDamage * dmgScale * m2 * dt * 0.30, game, this.facing, 0);
            burst(game, nearest.x, nearest.y, nearest.z + 8, JH.PAL.waterHi, 2,
              { speed: 55, life: 0.22, size: 2 });
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
      Assets.draw(ctx, "jon", sx, Geo.feetScreenY(this.y, this.z), this.facing, {
        state: this.state, frame: this.frame, t: this.t,
        hurt: this.invulnTimer > 0 && this.flashTimer > 0,
        waterFrac: Math.max(0, Math.min(1, this.water / this.stats.maxWater)),
        walking: this.walking,
      });
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
      // Concerta indicator
      if (this.concertaTimer > 0) {
        ctx.fillStyle = "#ff88ff";
        ctx.font = "bold 5px monospace"; ctx.textAlign = "center";
        ctx.fillText("FOCUSED " + this.concertaTimer.toFixed(1) + "s", sx, barTop - 2);
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
      Assets.shadow(ctx, sx, sy, this.bodyW * (this.elite ? 0.85 : 0.7));
      if (this.elite) {
        ctx.save();
        ctx.fillStyle = "rgba(255,190,80,0.16)";
        ctx.beginPath();
        ctx.ellipse(Math.round(sx), Math.round(sy - 1), this.bodyW * 0.72, this.bodyW * 0.26, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      Assets.draw(ctx, this.type, sx, Geo.feetScreenY(this.y, this.z), this.facing, {
        state: this.state, frame: this.frame, t: this.t,
        hurt: this.flashTimer > 0, wind: this.state === "wind", elite: this.elite,
        scale: this.elite ? 1.08 : 1,
      });
      // tiny hp pip when damaged
      if (this.hp < this.maxHp) {
        const w = this.bodyW + 4;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(Math.round(sx - w / 2), Math.round(sy - this.bodyH - 8), w, 3);
        ctx.fillStyle = "#ff5a5a";
        ctx.fillRect(Math.round(sx - w / 2), Math.round(sy - this.bodyH - 8), w * (this.hp / this.maxHp), 3);
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
        game.banner("BACKUP INCOMING!");
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
      game.spawnPickup("suds", this.x, this.y, this.def.suds);
      game.onEnemyKilled(this);
    }
  }
  JH.Boss = Boss;

  // ============================================================ PICKUP
  class Pickup {
    constructor(kind, x, y, value) {
      this.kind = kind; this.x = x; this.y = y; this.z = 30; this.vz = 60;
      this.value = value; this.dead = false; this.t = 0; this.life = 12; this.grounded = false;
    }
    update(dt, game) {
      this.t += dt;
      if (!this.grounded) {
        this.vz -= 360 * dt; this.z += this.vz * dt;
        if (this.z <= 0) { this.z = 0; this.vz *= -0.4; if (Math.abs(this.vz) < 12) { this.z = 0; this.grounded = true; } }
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
      else if (this.kind === "health") { pl.hp = Math.min(pl.stats.maxHp, pl.hp + this.value); game.audio.play("buy"); }
      else if (this.kind === "water_can") { pl.water = Math.min(pl.stats.maxWater, pl.water + this.value); game.audio.play("buy"); }
      else if (this.kind === "pill") {
        pl.concertaTimer = Math.max(pl.concertaTimer, JH.CONCERTA.dur);
        game.audio.play("pill");
        game.banner("FOCUSED!", 1.6);
        burst(game, pl.x, pl.y, pl.z + 10, JH.PAL.pill, 14, { speed: 90, life: 0.55, up: 60 });
      }
      if (this.kind !== "pill")
        burst(game, this.x, this.y, this.z + 6, this.kind === "suds" ? JH.PAL.suds : (this.kind === "health" ? JH.PAL.hpPk : JH.PAL.water), 6, { speed: 60, life: 0.3 });
    }
    draw(ctx, cam) {
      if (this.t > this.life && (Math.floor(this.t * 8) & 1)) return; // blink before despawn
      const key = this.kind === "suds" ? "suds" : this.kind === "health" ? "health" : this.kind === "pill" ? "pill" : "water_can";
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
      game.spawnPickup("suds", this.x, this.y, this.def.suds);
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
        if (!this._leapHinted) { game.banner("GET OUT OF THE WAY!", 2); this._leapHinted = true; }
      } else {
        if (!this._hinted) { game.banner("DASH THROUGH THE QUAKE!", 2); this._hinted = true; }
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
      game.spawnPickup("suds", this.x, this.y, this.def.suds);
      game.onEnemyKilled(this);
    }
  }
  JH.QuakeBoss = QuakeBoss;

  // ============================================= ROCK (neighbor projectile)
  // Arcs from neighbor to a LOCKED target position (similar to Switch cable hits).
  // A blinking ellipse telegraphs the landing spot during flight.
  class Rock {
    constructor(x, y, targetX, targetY, dmg, travelTime) {
      this.startX = x; this.startY = y;
      this.x = x; this.y = y; this.z = 0;
      this.targetX = targetX; this.targetY = targetY;
      this.dmg = dmg; this.travelTime = travelTime || 0.7;
      this.t = 0; this.dead = false; this.hit = false;
    }
    update(dt, game) {
      this.t += dt;
      const prog = Math.min(1, this.t / this.travelTime);
      this.x = this.startX + (this.targetX - this.startX) * prog;
      this.y = this.startY + (this.targetY - this.startY) * prog;
      this.z = 38 * 4 * prog * (1 - prog);   // parabolic arc, peak 38 at midpoint
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
      JH.Assets.draw(ctx, "rock", this.x - cam, Geo.feetScreenY(this.y, this.z), 1, { t: this.t });
      ctx.restore();
    }
  }
  JH.Rock = Rock;

  // ================================================= GARDEN BOX
  class GardenBox {
    constructor(x, y, idx) {
      this.x = x; this.y = (y != null) ? y : JH.DEPTH_MAX * 0.5; this.z = 0;
      this.idx = idx || 0;
      this.grow = 0; this.growMax = JH.GARDEN.growMax;
      this.bodyW = 42; this.dead = false; this.done = false; this.t = 0; this.hitFx = 0;
    }
    addGrow(amt, game) {
      if (this.done) return;
      this.grow = Math.min(this.growMax, this.grow + amt);
      this.hitFx = 0.12;
      if (this.grow >= this.growMax) {
        this.done = true;
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
    update(dt) { this.t += dt; if (this.hitFx > 0) this.hitFx -= dt; }
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
    }
  }
  JH.GardenBox = GardenBox;

  // ============================================= NEIGHBOR NPC
  // Stationary rock-thrower. Wind-up phase tracks the player then locks aim;
  // a telegraph ellipse appears at the target during both wind-up AND flight.
  class NeighborNPC extends Enemy {
    constructor(x, y) {
      super("neighbor", x, y);
      this.facing = 1;
      this.state = "idle";
      this.cdTimer = 1.8;    // initial delay before first throw
      this._windTimer = 0;
      this._windDur = 0;
      this._rockTarget = null;
    }
    think(dt, game) {
      const pl = game.player;
      this.facing = pl.x >= this.x ? 1 : -1;

      if (this.cdTimer > 0) { this.cdTimer -= dt; this.state = "idle"; return; }

      if (this._windTimer > 0) {
        this._windTimer -= dt;
        this.state = "wind";
        // Track player during first 60% of wind-up, then lock
        if (this._windTimer > this._windDur * 0.4)
          this._rockTarget = { x: pl.x, y: pl.y };
        if (this._windTimer <= 0) {
          const tgt = this._rockTarget || { x: pl.x, y: pl.y };
          const dist = Math.max(1, Math.hypot(tgt.x - this.x, tgt.y - this.y));
          game.embers.push(new Rock(
            this.x + this.facing * 10, this.y,
            tgt.x, tgt.y, this.def.rockDmg,
            Math.max(0.42, dist / this.def.rockSpeed)
          ));
          game.audio.play("whack");
          this.cdTimer = this.def.rockCd;
          this.state = "idle";
        }
        return;
      }

      // Teleport to a random spot in the arena, keeping a safe distance from the player
      const b = game.bounds;
      const MIN_DIST = 90;
      let tx, ty, tries = 0;
      do {
        tx = b.minX + 20 + Math.random() * (b.maxX - b.minX - 40);
        ty = JH.DEPTH_MIN + 8 + Math.random() * (JH.DEPTH_MAX - JH.DEPTH_MIN - 16);
      } while (Math.hypot(tx - pl.x, ty - pl.y) < MIN_DIST && ++tries < 12);
      this.x = tx; this.y = ty;
      this.facing = pl.x >= this.x ? 1 : -1;
      this._windDur = this._windTimer = 0.55;
      this._rockTarget = { x: pl.x, y: pl.y };
      this.state = "wind";
    }
    draw(ctx, cam) {
      // She vanishes between throws — only materialises during wind-up
      if (this.state !== "wind") return;
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, 0);
      JH.Assets.shadow(ctx, sx, sy, 11);
      JH.Assets.draw(ctx, "neighbor", sx, Geo.feetScreenY(this.y, this.z), this.facing, {
        state: this.state, t: this.t, hurt: this.flashTimer > 0,
      });
      // Wind-up telegraph at locked target position
      if (this.state === "wind" && this._rockTarget && this._windDur > 0) {
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
    }
    die(game) {
      if (this.dead) return;
      this.dead = true;
      burst(game, this.x, this.y, 10, JH.PAL.neighbor, 8, { speed: 70, life: 0.4, up: 50 });
      // No loot, no kill count
    }
  }
  JH.NeighborNPC = NeighborNPC;

  // ========================================== GK9000 (true final boss)
  // A standing switch chassis — tall and meaner — with an embedded angry face.
  // Adds a depth-row surge on top of the Switch's cable attacks.
  class GK9000Boss extends SwitchBoss {
    constructor(x, y) {
      super(x, y);
      this.def = JH.GK9000;
      this.type = "gk9000";
      this.hp = this.maxHp = JH.GK9000.hp;
      this.bodyW = JH.GK9000.bodyW; this.bodyH = JH.GK9000.bodyH;
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
      game.spawnPickup("suds", this.x, this.y, this.def.suds);
      game.onEnemyKilled(this);
    }
  }
  JH.GK9000Boss = GK9000Boss;

  // Factory used by the spawner.
  JH.makeEnemy = function (type, x, y) {
    if (type === "charger") return new Charger(type, x, y);
    if (type === "pyro") return new Pyro(type, x, y);
    if (type === "boss") return new Boss(x, y);
    if (type === "switch") return new SwitchBoss(x, y);
    if (type === "quake") return new QuakeBoss(x, y);
    if (type === "gk9000") return new GK9000Boss(x, y);
    if (type === "neighbor") return new NeighborNPC(x, y);
    return new Enemy(type, x, y);
  };
})();
