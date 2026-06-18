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
      this.state = this.spraying ? "spray" : (moving ? "walk" : "idle");
      this.animate(dt, moving);
    }

    doSpray(dt, game) {
      const S = this.stats;
      const dry = this.water <= 0;
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
      if (!dry) this.water = Math.max(0, this.water - S.waterDrain * dt);

      const ox = this.x + this.facing * 12;   // nozzle x (world)
      const oy = this.y;                       // nozzle depth
      const oz = this.z + 16;                  // nozzle height
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

      // Overhead HP + H₂O bars
      const barW = 28;
      const bx = Math.round(sx - barW / 2);
      const hpFrac = Math.max(0, this.hp / this.stats.maxHp);
      const wFrac  = Math.max(0, this.water / this.stats.maxWater);
      const barTop = Math.round(sy - this.stats.bodyH - 20);
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
      ctx.fillStyle = "#66bbff";
      ctx.fillRect(bx, barTop + 4, Math.round(barW * wFrac), 3);
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
      burst(game, this.x, this.y, this.z + 6, this.kind === "suds" ? JH.PAL.suds : (this.kind === "health" ? JH.PAL.hpPk : JH.PAL.water), 6, { speed: 60, life: 0.3 });
    }
    draw(ctx, cam) {
      if (this.t > this.life && (Math.floor(this.t * 8) & 1)) return; // blink before despawn
      const key = this.kind === "suds" ? "suds" : (this.kind === "health" ? "health" : "water_can");
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
      this.windTimer = 0; this.atkDur = 0; this.cdTimer = 1.4; this.fireFx = 0;
    }
    think(dt, game) {
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
        if (this.windTimer > this.atkDur * 0.4) this.lines[0] = Geo.clampDepth(pl.y); // aim, then lock
        if (this.windTimer <= 0) {
          for (const ly of this.lines)
            if (Math.abs(pl.y - ly) <= d.lineBand && (pl.z || 0) < 18)
              pl.takeHit(d.lineDmg, game, this.x);
          this.fireFx = 0.22; game.shake(7); game.audio.play("whack");
          this.state = "fire"; this.cdTimer = enraged ? 1.1 : 1.9;
        }
        return;
      }
      if (this.state === "fire") { if (this.fireFx <= 0) this.state = "hover"; return; }
      if (this.cdTimer > 0) { this.cdTimer -= dt; this.state = "hover"; return; }
      if (this.spawnGrace <= 0) {                // begin a new line attack
        this.atkDur = this.windTimer = enraged ? 0.72 : d.lineWind;
        this.lines = [Geo.clampDepth(pl.y)];
        if (enraged) this.lines.push(Geo.clampDepth(pl.y + (Math.random() < 0.5 ? -30 : 30)));
        this.state = "tele"; game.audio.play("jump");
      }
    }
    draw(ctx, cam) {
      this.drawCables(ctx, cam);
      if (this.state === "tele" || this.fireFx > 0) this.drawLines(ctx, cam);
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
    // Full-width danger line(s) at the targeted depth row.
    drawLines(ctx, cam) {
      const band = this.def.lineBand, strike = this.fireFx > 0;
      const prog = this.atkDur ? 1 - this.windTimer / this.atkDur : 1;
      ctx.save();
      for (const ly of this.lines) {
        const sy = Geo.feetScreenY(ly, 0);
        ctx.fillStyle = strike ? "rgba(120,240,255,0.6)" : "rgba(255,60,60," + (0.12 + 0.3 * prog) + ")";
        ctx.fillRect(0, sy - band, JH.VIEW_W, band * 2);
        ctx.strokeStyle = strike ? "#dffaff" : ((Math.floor(this.t * 12) & 1) ? "#ff5a5a" : "#ffd23f");
        ctx.lineWidth = 1.5;
        ctx.strokeRect(0, sy - band, JH.VIEW_W, band * 2);
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

  // Factory used by the spawner.
  JH.makeEnemy = function (type, x, y) {
    if (type === "charger") return new Charger(type, x, y);
    if (type === "pyro") return new Pyro(type, x, y);
    if (type === "boss") return new Boss(x, y);
    if (type === "switch") return new SwitchBoss(x, y);
    return new Enemy(type, x, y);
  };
})();
