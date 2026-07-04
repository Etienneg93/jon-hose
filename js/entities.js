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
      game.defer(i * 45, () => game.spawnPickup("suds", x + ox, y + oy, val));
    });
  }
  JH.spawnSudsCoins = spawnSudsCoins;

  // Boss kill: coins stream up and land close by
  function spawnCoinFountain(game, x, y, total) {
    denominateCoins(total).forEach((val, i) => {
      game.defer(i * 30, () => {
        const angle = Math.random() * Math.PI * 2;
        const speed = 15 + Math.random() * 30;
        const p = new JH.Pickup("suds", x, y, val);
        p.z = 10; p.vz = 100 + Math.random() * 80;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed * 0.2;
        game.pickups.push(p);
      });
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
      this.hurtTimer = 0; this.flashTimer = 0; this.squashT = 0;
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
      if (this.squashT > 0) this.squashT -= dt;
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
    // Hurt pulses complete before re-arming: under a continuous spray this
    // beats at the tick rate instead of freezing at a constant tint/deform.
    // flashOnly = damage without impact (DoT ticks) — flash, never squash.
    hurt(flashOnly) {
      if (this.flashTimer <= 0) this.flashTimer = 0.18;
      if (!flashOnly && this.squashT <= 0) this.squashT = JH.JUICE.squashDur;
    }
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
      this.burnGraceT = 0;         // i-frames for burn stacks (mirrors hit invuln)
      this.burnTickT = 0;          // time accrued toward the next burn damage beat
      this.regenLock = 0;
      this.spraying = false;
      this.sprayDry = false;
      this.sprayTick = 0;
      this.sprayEmitAcc = 0;       // fractional particle emitter for the stream
      this.meleeFxTimer = 0;       // drives the melee swing arc
      this.concertaTimer = 0;      // Concerta pill: unlimited water while > 0
      this.pressureBuffT = 0;      // Pressure Charge damage buff, sec remaining
      this.kibbleTimer = 0;        // Kibble: HP regen over 6 s while > 0
      this.kibbleRegen = 0;        // HP/s during regen
      this.gushRegenT = 0;         // GUSH milestone: water regen window (sec)
      this.gushRegenRate = 0;      // water/s while the window is live
      this.burnStacks = 0;   // active burn stacks (0–3); cleared when burnTimer expires
      this.burnTimer = 0;    // seconds of burn remaining
      this.bodyW = this.stats.bodyW;
      this.alive = true;
      this.nearShop = false;
    }
    applyStats(s) { this.stats = s; this.bodyW = s.bodyW; if (this.hp > s.maxHp) this.hp = s.maxHp; }

    applyBurn(n) {
      // Burn stacks have i-frames like hits: one application, then immune to
      // new stacks for the invuln window (overlapping fire can't insta-max).
      // Returns whether the stack landed so sources can retry, not skip ahead.
      if (this.burnGraceT > 0) return false;
      this.burnGraceT = this.stats.invuln;
      this.burnStacks = Math.min(this.burnStacks + n, JH.FIRE.maxBurnStacks);
      this.burnTimer = JH.FIRE.burnDuration;
      return true;
    }

    // Full burn wipe — used on Church respawn so a death-while-burning
    // doesn't carry the DoT into the fresh life (timers freeze while player
    // update is paused, so without this the burn resumes on landing).
    clearBurn() {
      this.burnTimer = 0; this.burnStacks = 0;
      this.burnTickT = 0; this.burnGraceT = 0;
    }

    // Burn DoT lands in discrete beats (burnTickInterval): each tick chunks
    // the accrued damage, pulses the flash (no squash — no impact), and puffs
    // embers off Jon. Expiry flushes the partial tick, so the total always
    // equals stacks * dps * duration.
    tickBurn(dt, game) {
      if (this.burnTimer <= 0) return;
      const F = JH.FIRE;
      this.burnTickT += Math.min(dt, this.burnTimer);  // don't bill past expiry
      this.burnTimer -= dt;
      const expired = this.burnTimer <= 0;
      if (this.burnTickT >= F.burnTickInterval || expired) {
        this.hp = Math.max(0, this.hp - this.burnStacks * F.burnDpsPerStack * this.burnTickT);
        this.burnTickT = 0;
        this.hurt(true);
        burst(game, this.x, this.y, 20, JH.PAL.flame, 3, { speed: 30, life: 0.35, up: 40 });
        if (this.hp <= 0) this.alive = false;
      }
      if (expired) { this.burnTimer = 0; this.burnStacks = 0; this.burnTickT = 0; }
    }

    update(dt, game) {
      const In = game.input, S = this.stats;
      this.basePhysics(dt);
      if (this.invulnTimer > 0) this.invulnTimer -= dt;
      if (this.burnGraceT > 0) this.burnGraceT -= dt;
      if (this.dashCdTimer > 0) this.dashCdTimer -= dt;
      if (this.meleeCdTimer > 0) this.meleeCdTimer -= dt;
      if (this.regenLock > 0) this.regenLock -= dt;
      if (this.pressureBuffT > 0) this.pressureBuffT -= dt;

      this.tickBurn(dt, game);

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
      // GUSH milestone water regen — independent of the regular regen delay.
      if (this.gushRegenT > 0) {
        this.gushRegenT -= dt;
        this.water = Math.min(S.maxWater, this.water + this.gushRegenRate * dt);
        // Rising water motes: visible even when kibble/concerta own the glow,
        // so stacked buffs never hide each other.
        if (Math.random() < 8 * dt)
          burst(game, this.x + (Math.random() - 0.5) * 10, this.y, 8 + Math.random() * 20,
            JH.PAL.water, 1, { speed: 10, life: 0.5, up: 35, size: 1 });
      }

      if (this.dashBoostTimer > 0) {
        this.dashBoostTimer -= dt;
        if (this.dashTimer <= 0 && Math.random() < 0.4)
          burst(game, this.x - this.facing * 4, this.y, 4, JH.PAL.water, 1,
            { speed: 28, life: 0.35, up: 8, grav: 150, size: 2 });
      }

      // ---- dash
      // Buffered edge: a press during hit-stop or the last 130ms of cooldown
      // fires on the first frame that can act. Neutral press dashes toward
      // facing (a direction is no longer required).
      if (this.dashCdTimer <= 0 && In.buffered("dash")) {
        In.consume("dash");
        this.dashTimer = S.dashTime; this.dashCdTimer = S.dashCd;
        this.invulnTimer = Math.max(this.invulnTimer, S.dashTime + 0.05);
        this._dashX = (mx || my) ? mx : this.facing;
        this._dashY = my;
        game.audio.play("dash");
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
      else this.sprayHeldT = 0;   // reset the stream-front timer on release

      // ---- water regen (after a short delay since last spray)
      if (!this.spraying && this.regenLock <= 0 && this.water < S.maxWater) {
        const moveBon = ((mx !== 0 || my !== 0) && S.moveRegen > 0) ? S.moveRegen : 0;
        this.water = Math.min(S.maxWater, this.water + (S.waterRegen + moveBon) * dt);
      }

      // ---- hydrant: stand next to one to refill water only. HP is NOT healed
      // here anymore — heals must be bought at the shop (death isn't punishing,
      // so out-of-combat free healing trivialized attrition).
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

    animate(dt, moving) {
      this.animTimer += dt;
      if (this.animTimer > 0.12) { this.animTimer = 0; this.frame = (this.frame + 1) % 5; }
      if (!moving) this.frame = this.frame & 1; // settle to even frame
    }

    doSpray(dt, game) {
      const S = this.stats;
      const dry = this.water <= 0 && this.concertaTimer <= 0;
      this.spraying = true;
      this.sprayHeldT = (this.sprayHeldT || 0) + dt;  // continuous spray time (reset on release)
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
      const oz = this.z + 30;                  // nozzle height — static, matches new sprite
      const reach = S.sprayRange * rangeMult;  // range shrinks with pressure
      const beam = S.beam | 0;                 // concentration tier 0..3

      // Hydro Lance (beam=3) pierces the whole line; default stops at first
      // target. A planted DeployedShield (Bulwark's thrown shield) hard-blocks
      // the stream at every beam tier — nothing else blocks pierce.
      const pierce = beam >= 3;
      let blocker = null;
      let minFwd = Infinity;   // near-edge distance of the chosen blocker (used below)
      {
        if (!pierce) {
          for (const e of game.enemies) {
            if (e.dead) continue;
            if (e.dropping) continue;   // airborne drop-ins can't block or be hit
            if (!Geo.inHitArc(this, e, this.facing, reach, S.sprayHitBand)) continue;
            const fwd = (e.x - ox) * this.facing;
            if (fwd < minFwd) { minFwd = fwd; blocker = e; }
          }
        }
        for (const s of game.shields) {
          if (s.dead) continue;
          if (s.radius) {
            // Dome barrier: blocks the stream at the near edge of its VISIBLE
            // ground ellipse, but ONLY while you're OUTSIDE it (step in and spray
            // freely — the counter). Depth uses the flattened screen footprint so
            // it lines up with the drawn circle.
            if (!s.active) continue;
            if (insideDome(s, this.x, this.y)) continue;                    // player inside
            const dyS = Geo.feetScreenY(this.y, 0) - Geo.feetScreenY(s.y, 0);
            const ry = s.radius * DOME_RY;
            if (Math.abs(dyS) >= ry) continue;                             // beam misses the footprint
            const half = s.radius * Math.sqrt(1 - (dyS * dyS) / (ry * ry));// x half-width at this depth
            const edgeFwd = (s.x - ox) * this.facing - half;               // near edge along facing
            if (edgeFwd < 0 || edgeFwd > reach) continue;                  // behind the aim / out of reach
            if (edgeFwd < minFwd) { minFwd = edgeFwd; blocker = s; }
          } else {
            if (!Geo.inHitArc(this, s, this.facing, reach, S.sprayHitBand)) continue;
            const fwd = (s.x - ox) * this.facing;
            if (fwd < minFwd) { minFwd = fwd; blocker = s; }
          }
        }
      }
      // Particles die at the blocker's near face so the stream visually stops there.
      const blockDist = !blocker
        ? reach
        : blocker.radius
          ? Math.max(4, minFwd)                                             // dome: near edge
          : Math.max(4, (blocker.x - ox) * this.facing - (blocker.bodyW || 14) * 0.5);

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

      // Dome deflection: water sprays back off the barrier at the contact point,
      // so it's obvious the dome is stopping the stream (a "bounce"). Gated on the
      // stream FRONT having travelled the distance (~blockDist / stream speed) so
      // it doesn't splash back before the water visually reaches the dome.
      if (!dry && blocker && blocker.radius && this.sprayHeldT >= blockDist / 220) {
        const hx = ox + this.facing * blockDist;
        for (let i = 0; i < 3; i++) {
          game.particles.push(new Particle({
            x: hx,
            y: oy + (Math.random() - 0.5) * S.sprayWidth * 0.5,
            z: oz + (Math.random() - 0.5) * 6,
            vx: -this.facing * (50 + Math.random() * 90),   // ricochet back toward the player
            vy: (Math.random() - 0.5) * 130,                // fan out along the dome face
            vz: 25 + Math.random() * 85,                    // splash upward
            life: 0.16 + Math.random() * 0.16,
            color: Math.random() > 0.4 ? JH.PAL.waterHi : JH.PAL.water,
            size: 2, grav: 260,
          }));
        }
      }

      // Damage enemies: non-pierce hits only the closest (blocker); pierce
      // hits everyone EXCEPT anyone standing behind a planted shield's wall.
      // (`blocker` can only ever be an enemy in non-pierce mode, or a
      // DeployedShield in pierce mode — see the blocker-finding block above,
      // so `e` here — always drawn from game.enemies — can never equal a
      // pierce-mode `blocker`.)
      let didHit = false;
      const hitEnemies = [];
      let healAmt = 0;
      const blockerFwd = blocker ? (blocker.x - ox) * this.facing : Infinity;
      for (const e of game.enemies) {
        if (e.dead) continue;
        if (e.dropping) continue;   // airborne drop-ins can't be hit
        if (!Geo.inHitArc(this, e, this.facing, reach, S.sprayHitBand)) continue;
        if (!pierce && e !== blocker) continue;
        if (pierce && blocker && (e.x - ox) * this.facing > blockerFwd) continue;
        // Dome shelter: an enemy inside an active dome is immune while you're
        // outside it (Bulwark + any Pyros it protects). Step inside to hit them.
        if (game.shields) {
          let sheltered = false;
          for (const s of game.shields) {
            if (s.dead || !s.radius || !s.active) continue;
            if (!insideDome(s, e.x, e.y)) continue;                          // enemy not in this dome
            if (!insideDome(s, this.x, this.y)) { sheltered = true; break; } // ...and you're outside it
          }
          if (sheltered) continue;
        }
        const mult = e.def ? (e.def.waterMult || 1) : 1;
        const pressureMult = this.pressureBuffT > 0 ? JH.CONSUMABLES.pressure.mult : 1;
        const dmg = S.sprayDamage * dmgScale * mult * pressureMult * dt;
        e.takeDamage(dmg, game, this.facing, 0);
        if (e.onSprayHit) e.onSprayHit(dt, game);
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
        // Vampiric lifesteal at half rate against bosses and elites — their
        // huge HP pools gave full-rate sustain near-permanent uptime.
        if (S.vampiricRate > 0) healAmt += dmg * S.vampiricRate * ((e.isBoss || e.elite || e.superElite) ? 0.5 : 1);
        if (S.splitStream) hitEnemies.push(e);
      }
      // Vampiric Hose: convert a fraction of spray damage into HP.
      if (healAmt > 0) this.hp = Math.min(S.maxHp, this.hp + healAmt);
      // Split Stream: 30% damage arc to all nearby enemies of each hit enemy.
      if (S.splitStream && hitEnemies.length > 0) {
        for (const primary of hitEnemies) {
          for (const e of game.enemies) {
            if (e.dead || e.dropping || e === primary || hitEnemies.includes(e)) continue;
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
      // Fire patches: spray aimed at a patch's depth advances its extinguish timer.
      if (game.firePatches) {
        for (const fp of game.firePatches) {
          if (fp.dead) continue;
          const fwd = (fp.x - ox) * this.facing;
          if (fwd > 0 && fwd - this.bodyW * 0.5 - fp.radius <= reach
              && Math.abs(fp.y - oy) < S.sprayHitBand)
            fp.sprayProgress += dt;
        }
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
      game.shake(5, dir);                       // kick away from the impact
      game.hitStop(JH.JUICE.hitstop.playerHit);
      if (this.hp <= 0) { this.hp = 0; this.alive = false; }
    }

    draw(ctx, cam) {
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, 0);
      Assets.shadow(ctx, sx, sy, this.stats.bodyW * 0.7);
      const spriteSy = Geo.feetScreenY(this.y, this.z);
      // Buff auras as layered silhouette outlines (inner → outer): GUSH blue
      // hugs the body, kibble green rings around it, concerta purple outside
      // that — active buffs stack visually instead of overwriting. Burn's
      // fire read replaces them all: same-color rings fading outward = a
      // glowing edge (never a radial disc on non-round sprites).
      const outlines = [];
      if (this.burnStacks === 0) {
        if (this.gushRegenT > 0)    outlines.push(["#55c8ff", 0.55 + 0.30 * Math.sin(this.t * 6)]);
        if (this.kibbleTimer > 0)   outlines.push(["#44ee66", 0.55 + 0.30 * Math.sin(this.t * 5)]);
        if (this.concertaTimer > 0) outlines.push(["#cc44ff", 0.55 + 0.30 * Math.sin(this.t * 6)]);
      } else {
        // Fire flicker: two incommensurate fast waves + brief random dips so
        // the ring reads as burning, not as a steady buff aura pulse.
        const bIntensity = this.burnStacks / JH.FIRE.maxBurnStacks;
        const flick = 0.30 + 0.70 * Math.abs(Math.sin(this.t * 23) * Math.sin(this.t * 13.7 + 1.7));
        const dip = Math.random() < 0.08 ? 0.4 : 1;
        const fp = (0.5 + 0.35 * bIntensity) * flick * dip;
        const hot = flick > 0.75;   // color licks toward white-hot on peaks
        outlines.push([hot ? "#ffe070" : "#ffb020", fp], ["#ff6a20", fp * 0.6], ["#ff3a00", fp * 0.35]);
      }
      Assets.draw(ctx, "jon", sx, spriteSy, this.facing, {
        state: this.state, frame: this.frame, t: this.t,
        hurt: this.invulnTimer > 0 && this.flashTimer > 0,
        hurtAlpha: this.flashTimer / 0.18,
        squash: this.squashT > 0 ? Math.min(1, this.squashT / JH.JUICE.squashDur) : 0,
        waterFrac: Math.max(0, Math.min(1, this.water / this.stats.maxWater)),
        walking: this.walking,
        outlines,
      });
      if (this.burnStacks > 0) {
        // Draw flame tongues rising from feet to show burn stacks
        const stacks = this.burnStacks, t = this.t;
        const offsets = stacks >= 3 ? [-6, 0, 6] : stacks >= 2 ? [-4, 4] : [0];
        ctx.save();
        ctx.globalAlpha = 0.85;
        for (const ox of offsets) {
          Assets.drawFx(ctx, "fire-jon", sx + ox, spriteSy + 2, t + (ox + 8) * 0.13, { scale: 0.5 });
        }
        ctx.restore();
      }
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
      const barTop = Math.round(sy - this.stats.bodyH - 30);
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.fillRect(bx - 1, barTop - 1, barW + 2, 9);
      // HP
      ctx.fillStyle = "#442222";
      ctx.fillRect(bx, barTop, barW, 3);
      ctx.fillStyle = hpFrac > 0.5 ? "#44cc44" : hpFrac > 0.25 ? "#ddaa22" : "#ee3333";
      ctx.fillRect(bx, barTop, Math.round(barW * hpFrac), 3);
      // Kibble regen: a brightness wave travels left → right through the
      // FILLED portion only — a brighter shade of the bar's own color, kept
      // strictly inside the fill (no halo).
      if (this.kibbleTimer > 0 && hpFrac > 0) {
        const fw = Math.round(barW * hpFrac);
        ctx.save();
        // Crest = a fully saturated version of the bar's hue (not a whiter one).
        ctx.fillStyle = hpFrac > 0.5 ? "#00ff44" : hpFrac > 0.25 ? "#ffb400" : "#ff2a1c";
        for (let i = 0; i < fw; i++) {
          const ph = ((i - this.t * 13) / 20) * Math.PI * 2;
          ctx.globalAlpha = 0.85 * (0.5 + 0.5 * Math.sin(ph));
          ctx.fillRect(bx + i, barTop, 1, 3);
        }
        ctx.restore();
      }
      // H₂O
      ctx.fillStyle = "#1a3344";
      ctx.fillRect(bx, barTop + 4, barW, 3);
      if (this.concertaTimer > 0) {
        ctx.fillStyle = (Math.floor(this.t * 8) & 1) ? "#ff88ff" : "#cc44cc";
      } else {
        ctx.fillStyle = "#66bbff";
      }
      ctx.fillRect(bx, barTop + 4, Math.round(barW * wFrac), 3);
      // GUSH regen: a brightness wave travels left → right through the
      // FILLED portion only — a brighter shade of the bar's own blue, kept
      // strictly inside the fill (no halo).
      if (this.gushRegenT > 0 && wFrac > 0) {
        const fw = Math.round(barW * wFrac);
        ctx.save();
        // Crest = a fully saturated version of the bar's blue (not a whiter one).
        ctx.fillStyle = "#00c2ff";
        for (let i = 0; i < fw; i++) {
          const ph = ((i - this.t * 13) / 20) * Math.PI * 2;
          ctx.globalAlpha = 0.85 * (0.5 + 0.5 * Math.sin(ph));
          ctx.fillRect(bx + i, barTop + 4, 1, 3);
        }
        ctx.restore();
      }
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
        indY -= 7;
      }
      if (this.burnStacks > 0) {
        ctx.fillStyle = "#ff6610";
        ctx.font = "bold 5px monospace"; ctx.textAlign = "center";
        ctx.fillText("BURN x" + this.burnStacks, sx, indY);
      }

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
      this.windTimer = 0; this.windDur = 0; this.attackTimer = 0; this.cdTimer = 0;
      this.usingTicket = false;  // holds an attack ticket (game.canAttack) during windup/attack
      this.state = "walk";
      this.spawnGrace = 0.2;
      this.wetness = 0;    // 0..1 soak level from spray hits (blue tint + drips)
    }

    takeDamage(dmg, game, dirX, knock) {
      if (this.dead) return;
      this.hp -= dmg;
      this.hurt();
      // The hose soaks: each hit builds wetness; it dries in update().
      this.wetness = Math.min(1, this.wetness + JH.JUICE.wetPerHit);
      if (knock) this.applyKnockback(dirX, knock);
      if (this.hp <= 0) this.die(game);
    }

    // Bosses stand their ground — the hose can knock back mooks, not them.
    applyKnockback(dirX, force, dirY) {
      if (this.isBoss) return;
      super.applyKnockback(dirX, force, dirY);
    }

    die(game) {
      if (this.dead) return;
      this.dead = true;
      game.killJuice(this);
      // Burst waits for the KillPop collapse to finish flattening (~150ms).
      const bx = this.x, by = this.y, bz = this.z, col = this.colorOf();
      game.defer(120, () => burst(game, bx, by, bz + 12, col, 10, { speed: 100, life: 0.5, up: 80 }));
      game.dropLoot(this);   // anti-farm aware (infinite spawns share a budget)
      game.onEnemyKilled(this);
    }
    colorOf() { return JH.PAL[this.def.color] || "#fff"; }

    // Tougher clone of the def (never mutate the shared one). `scale` is a
    // {hp,dmg,speed} multiplier set; omitted = legacy flat values.
    makeElite(scale) {
      this.elite = true;
      const s = scale || { hp: 1.7, dmg: 1.3, speed: 1.12 };
      const d = Object.assign({}, this.def);
      d.hp = Math.round(d.hp * s.hp);
      d.touchDmg = Math.round(d.touchDmg * s.dmg);
      if (d.meleeDmg)  d.meleeDmg  = Math.round(d.meleeDmg * s.dmg);
      if (d.chargeDmg) d.chargeDmg = Math.round(d.chargeDmg * s.dmg);
      if (d.emberDmg)  d.emberDmg  = Math.round(d.emberDmg * s.dmg);
      if (d.speed)     d.speed    *= s.speed;
      if (d.bodyW)     d.bodyW = Math.round(d.bodyW * 1.22);
      if (d.bodyH)     d.bodyH = Math.round(d.bodyH * 1.16);
      d.suds = Math.round(d.suds * 1.4);
      this.def = d;
      this.hp = this.maxHp = d.hp;
      this.bodyW = d.bodyW;
      this.bodyH = d.bodyH;
    }

    // Super-elite: rare apex tier above elites — huge stats + a signature
    // move (subclasses branch on this.superElite). Reuses the elite_ baked
    // frames at 1.8x draw scale.
    makeSuper() {
      this.superElite = true;
      this.elite = true;
      this.def = JH.Balance.superEliteDef(this.def);
      this.hp = this.maxHp = this.def.hp;
      this.bodyW = this.def.bodyW;
      this.bodyH = this.def.bodyH;
    }

    // Generic chase toward the player; subclasses override think().
    update(dt, game) {
      this.basePhysics(dt);
      if (this.spawnGrace > 0) this.spawnGrace -= dt;
      if (this.contactTimer > 0) this.contactTimer -= dt;
      // Wetness dries off over time; visibly soaked enemies drip.
      if (this.wetness > 0) {
        this.wetness = Math.max(0, this.wetness - JH.JUICE.wetDryPerSec * dt);
        if (this.wetness > 0.3 && Math.random() < this.wetness * 5.5 * dt)
          burst(game, this.x + (Math.random() - 0.5) * this.bodyW * 0.7, this.y,
            6 + Math.random() * (this.bodyH * 0.6), "#00b4ff", 1,
            { speed: 6, life: 0.45, up: -30, grav: 260, size: 1 });
      }
      this.think(dt, game);
      resolveDebris(this);   // walking enemies bump rubble too (bosses skip this)
      // Arena containment: hose knockback (and charge overshoot) can't shove
      // an enemy past the locked wave bounds where Jon can't follow — waves
      // only clear on kills, so an unreachable enemy would soft-lock the wave.
      this.x = clamp(this.x, game.bounds.minX, game.bounds.maxX);
      // contact damage
      const pl = game.player;
      if (!this.dead && pl.alive && Geo.bodiesOverlap(this, pl) && this.contactTimer <= 0
          && Math.abs((this.z) - (pl.z)) < 20) {
        pl.takeHit(this.def.touchDmg, game, this.x);
        this.contactTimer = this.def.contactCd;
      }
      const moving = this.state === "walk" || this.state === "charge" || this.state === "retrieve";
      this.animate(dt, moving);
    }

    // Default melee chaser (mook).
    think(dt, game) {
      const pl = game.player;
      const dx = pl.x - this.x, dy = pl.y - this.y;
      const dist = Math.hypot(dx, dy);
      // Point-blank deadzone: with no body collision, chasers with no melee
      // stop (fuse) can sit on Jon's center — per-frame sign(dx) facing +
      // overshoot strobes the sprite left/right. Hold ground and facing.
      // Committed lunge keeps its aim — no re-facing mid-flight.
      if (dist > 12 && this.state !== "lunge") this.facing = dx >= 0 ? 1 : -1;
      const d = this.def;

      // Super mook: haymaker resolves as a forward LUNGE with a ground-shock
      // band on landing.
      if (this.state === "lunge") {
        this.attackTimer -= dt;
        this.x += this.facing * 380 * dt;
        if (!this.lungeHit && Geo.inHitArc(this, pl, this.facing, d.meleeRange + 14, 22)) {
          pl.takeHit(d.meleeDmg, game, this.x);
          this.lungeHit = true;
        }
        if (this.attackTimer <= 0) {
          game.shake(4); game.audio.play("whack");
          if (!this.lungeHit && Geo.inHitArc(this, pl, this.facing, d.meleeRange + 26, 26))
            pl.takeHit(Math.round(d.meleeDmg * 0.6), game, this.x);  // shock band
          this.state = "idle"; this.cdTimer = 0.9; this.usingTicket = false;
        }
        return;
      }

      if (this.windTimer > 0) {            // winding up an attack
        this.windTimer -= dt; this.state = "wind";
        if (this.windTimer <= 0) {
          if (this.superElite) {
            // Ticket stays held through the lunge; released at lunge end above.
            this.state = "lunge"; this.attackTimer = 0.16; this.lungeHit = false;
            return;
          }
          if (Geo.inHitArc(this, pl, this.facing, d.meleeRange + 6, 16))
            pl.takeHit(d.meleeDmg, game, this.x);
          this.cdTimer = 0.6;
          this.usingTicket = false;
        }
        return;
      }
      if (this.cdTimer > 0) { this.cdTimer -= dt; this.state = "idle"; return; }

      if (dist < d.meleeRange && this.spawnGrace <= 0 && game.canAttack()) {
        this.windTimer = d.meleeWind; this.windDur = d.meleeWind; this.state = "wind";
        this.usingTicket = true;
      } else if (dist > 12) {
        // approach
        const sp = d.speed;
        this.x += (dx / (dist || 1)) * sp * dt;
        this.y += (dy / (dist || 1)) * sp * dt * 0.8;
        this.state = "walk";
      } else {
        this.state = "idle";
      }
    }

    draw(ctx, cam) {
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, 0);
      Assets.shadow(ctx, sx, sy, this.bodyW * 0.7);
      Assets.draw(ctx, this.type, sx, Geo.feetScreenY(this.y, this.z), this.facing, {
        state: this.state, frame: this.frame, t: this.t,
        wet: this.wetness,   // soak tint IS the enemy hurt read (no flash/squash)
        wind: this.state === "wind", elite: this.elite,
        // 0→1 windup progress for multi-frame windup anims (0 when windDur unset)
        windFrac: this.windDur > 0 ? Math.min(1, Math.max(0, 1 - this.windTimer / this.windDur)) : 0,
        hasShield: this.hasShield,   // bulwark: carried-shield sprite variant
        scale: this.superElite ? 1.8 : this.elite ? 1.08 : 1,
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
      if (this.superElite) {
        const by = Math.round(sy - this.bodyH - 8);
        ctx.fillStyle = "#f0b830";
        ctx.font = "bold 6px monospace"; ctx.textAlign = "center";
        ctx.fillText(this.def.name.toUpperCase(), Math.round(sx), by - 4);
        ctx.textAlign = "left";
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
        this.attackTimer -= dt;
        if (this.superElite) {
          // Diagonal charge; ricochets off arena bounds, keeping momentum.
          this.x += this.chargeVX * dt; this.y += this.chargeVY * dt;
          this.facing = this.chargeVX >= 0 ? 1 : -1;
          if ((this.x <= game.bounds.minX + 4 && this.chargeVX < 0) ||
              (this.x >= game.bounds.maxX - 4 && this.chargeVX > 0)) {
            if (--this.bounces < 0) this.attackTimer = 0;
            else { this.chargeVX = -this.chargeVX; game.audio.play("whack"); game.shake(3); }
          }
          if ((this.y <= JH.DEPTH_MIN + 2 && this.chargeVY < 0) ||
              (this.y >= JH.DEPTH_MAX - 2 && this.chargeVY > 0)) this.chargeVY = -this.chargeVY;
          // Radial contact hit with a per-hit cooldown (the pass-through body IS the hitbox).
          if (this.chargeHitT > 0) this.chargeHitT -= dt;
          if ((this.chargeHitT || 0) <= 0 &&
              Math.hypot(pl.x - this.x, pl.y - this.y) < 18) {
            pl.takeHit(d.chargeDmg, game, this.x); this.chargeHitT = 0.6;
          }
        } else {
          this.x += this.facing * d.chargeSpeed * dt;
          if (Geo.inHitArc(this, pl, this.facing, 16, 18)) {
            pl.takeHit(d.chargeDmg, game, this.x); this.attackTimer = 0;
          }
        }
        if (this.attackTimer <= 0) { this.state = "idle"; this.cdTimer = d.chargeCd; this.usingTicket = false; }
        return;
      }
      if (this.windTimer > 0) {
        this.windTimer -= dt; this.state = "wind";
        this.aimAng = Math.atan2(dy, dx);   // tracked through windup; super telegraph rotates by it
        if (this.windTimer <= 0) {
          this.state = "charge";
          if (this.superElite) {
            const ang = Math.atan2(pl.y - this.y, pl.x - this.x);
            this.chargeVX = Math.cos(ang) * d.chargeSpeed;
            this.chargeVY = Math.sin(ang) * d.chargeSpeed * 0.6;
            this.bounces = 3; this.chargeHitT = 0;
            this.attackTimer = d.chargeDur * 2.5;
          } else this.attackTimer = d.chargeDur;
          game.audio.play("whack");
        }
        return;
      }
      if (this.cdTimer > 0) { this.cdTimer -= dt; this.state = "idle"; return; }

      // Supers may open the charge from any angle; regulars need depth alignment.
      if ((this.superElite ? dist < 210 : (Math.abs(dy) < 14 && dist < 170)) && this.spawnGrace <= 0 && game.canAttack()) {
        this.windTimer = d.chargeWind; this.state = "wind";
        this.usingTicket = true;
        this.aimAng = Math.atan2(dy, dx);
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
    if (this.state === "wind" && this.superElite) {
      // Super telegraph: same band, rotated along the stored aim, extended-charge length.
      const d = this.def;
      const range = d.chargeSpeed * d.chargeDur * 2.5;
      const band  = 18;
      const sx = this.x - cam;
      const sy = Geo.feetScreenY(this.y, 0);
      const flash = (Math.floor(this.t * 10) & 1);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(this.aimAng || 0);
      ctx.fillStyle = "rgba(160,80,240,0.10)";
      ctx.fillRect(this.bodyW * 0.5, -band, range, band * 2);
      ctx.strokeStyle = flash ? "#c080ff" : "rgba(160,80,240,0.30)";
      ctx.lineWidth = 1;
      ctx.strokeRect(this.bodyW * 0.5, -band, range, band * 2);
      ctx.restore();
    } else if (this.state === "wind") {
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

  // The single active Bulwark dome, if any (Pyros huddle inside it for cover).
  function activeDome(game) {
    if (game.shields) for (const s of game.shields) if (!s.dead && s.radius && s.active) return s;
    return null;
  }

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
          // fire toward player's position; super-elites lob a 3-ember fan
          // whose embers gutter into small fire patches where they expire
          const ang = Math.atan2(dy, dx);
          const spreads = this.superElite ? [-0.35, 0, 0.35] : [0];
          for (const off of spreads)
            game.embers.push(new Ember(this.x + this.facing * 8, this.y, this.z + 14,
              Math.cos(ang + off) * d.emberSpeed, Math.sin(ang + off) * d.emberSpeed * 0.6,
              d.emberDmg,
              this.superElite ? { patch: { r: 14, dur: 1.2 } } : undefined));
          this.cdTimer = d.shootCd * (this.superElite ? 1.4 : 1);
        }
        return;
      }

      // If a Bulwark dome is up, huddle inside it (spray-protected) and fire out
      // instead of kiting — the "Bulwark shelters its shooters" fantasy.
      const dome = activeDome(game);
      if (dome && this.spawnGrace <= 0) {
        if (!insideDome(dome, this.x, this.y)) {
          const mx = dome.x - this.x, my = dome.y - this.y, md = Math.hypot(mx, my) || 1;
          this.x += (mx / md) * d.speed * dt;
          this.y += (my / md) * d.speed * dt * 0.8;
          this.state = "walk";
          return;
        }
        // Inside the dome: hold and shoot when able (don't back out of cover).
        if (this.cdTimer <= 0) { this.windTimer = 0.35; this.state = "wind"; }
        else this.state = "idle";
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
    constructor(x, y, z, vx, vy, dmg, opts) {
      Object.assign(this, { x, y, z, vx, vy, dmg, life: 2.2, t: 0, dead: false });
      // opts.patch = {r, dur}: spawn a FirePatch where the ember expires
      this.patch = (opts && opts.patch) || null;
    }
    update(dt, game) {
      this.t += dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.z = Math.max(0, this.z - 8 * dt);
      // Past the walkable band it can't hit anyone (hit needs |dy| < 12) —
      // cull rather than clamp: clamping froze depth motion mid-air and the
      // ember visibly bounced off an invisible line at the band edge.
      if (this.y < JH.DEPTH_MIN - 12 || this.y > JH.DEPTH_MAX + 12) {
        this.dead = true;
        return false;
      }
      const pl = game.player;
      if (pl.alive && Math.abs(pl.x - this.x) < 12 && Math.abs(pl.y - this.y) < 12) {
        pl.takeHit(this.dmg, game, this.x); this.dead = true;
        burst(game, this.x, this.y, this.z, JH.PAL.flame, 5, { speed: 70, life: 0.3 });
        return false;   // died on impact — no patch (would land under Jon's feet)
      }
      if (this.t > this.life) {
        this.dead = true;
        // life expired mid-air: gutter into a fire patch if this ember carries one
        if (this.patch) game.firePatches.push(
          new JH.FirePatch(this.x, this.y, this.patch.r, this.patch.dur));
      }
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

  // ---- Fireball: Slayer's pool-cue projectile ----
  // Spawns as a plain pool ball at cue height, ignites after igniteDelay
  // (visual + burn on hit). Aimed at the player's position at fire time —
  // same convention as the Pyro's Ember (depth velocity scaled 0.6 for 2.5D)
  // — so staggered volley balls fan out tracking the player's dodge. Flies
  // dead straight at spawnZ (cue height) until it expires. Leaves a
  // FirePatch on player hit. Pushed into game.embers for the shared
  // update/draw pipeline.
  class Fireball {
    constructor(x, y, dir, game) {
      const d = JH.FIREBALL;
      this.x = x; this.y = y; this.z = d.spawnZ;
      const pl = game && game.player;
      if (pl && pl.alive) {
        const ang = Math.atan2(pl.y - y, pl.x - x);
        this.vx = Math.cos(ang) * d.speed;
        this.vy = Math.sin(ang) * d.speed * 0.6;
      } else {
        this.vx = d.speed * dir;
        this.vy = 0;
      }
      this.dir = this.vx >= 0 ? 1 : -1;
      this.dmg = d.dmg;
      this.radius = d.radius;
      this.burnStacks = d.burnStacks;
      this.igniteT = d.igniteDelay;  // counts down to 0; burn only activates after this
      this.life = d.lifespan;
      this.t = 0;
      this.dead = false;
    }
    update(dt, game) {
      this.t += dt;
      if (this.igniteT > 0) this.igniteT -= dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      // z stays at spawnZ: the ball flies dead straight off the cue (any
      // mid-flight z change kinks the visible trajectory on the summed
      // depth+height screen axis and reads as the ball steering).
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return !this.dead; }
      // Emit trailing fire particles once ignited.
      if (this.igniteT <= 0 && Math.random() < 0.6) {
        game.particles.push(new Particle({
          x: this.x - this.dir * 4, y: this.y, z: this.z + 4,
          vx: -this.dir * 20 + (Math.random() - 0.5) * 30,
          vy: (Math.random() - 0.5) * 20,
          vz: 15 + Math.random() * 20,
          life: 0.18 + Math.random() * 0.12,
          color: Math.random() > 0.4 ? JH.PAL.firePatch : JH.PAL.firePatchHi,
          size: 2, grav: 160,
        }));
      }
      // Hit check against player.
      const pl = game.player;
      if (pl.alive && this.igniteT <= 0) {
        const dist = Math.hypot(pl.x - this.x, pl.y - this.y);
        // No z gate: the ball flies flat at cue height (~chest on Jon) and
        // the player is always grounded (jump is cut), so x/depth is enough.
        if (dist < this.radius + pl.bodyW * 0.5) {
          pl.takeHit(this.dmg, game, this.x);
          pl.applyBurn(this.burnStacks);
          game.firePatches.push(new JH.FirePatch(this.x, this.y, 28, 1.4));
          burst(game, this.x, this.y, this.z, JH.PAL.firePatch, 8, { speed: 90, life: 0.35, up: 50 });
          game.shake(3);
          this.dead = true;
        }
      }
      return !this.dead;
    }
    draw(ctx, cam) {
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, this.z);
      // Ground shadow at the ball's (x,y) anchors its depth row while airborne
      // (same convention as SmeltBomb's landing shadow) — height vs depth is
      // otherwise ambiguous for a sinking 2.5D projectile.
      const gy = Geo.feetScreenY(this.y, 0);
      const shR = Math.max(2.5, 7 - this.z * 0.15);
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = "#220800";
      ctx.beginPath();
      ctx.ellipse(Math.round(sx), Math.round(gy), shR, shR * JH.GROUND_RY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      Assets.draw(ctx, "fireball", sx, sy, 1, { ignited: this.igniteT <= 0, t: this.t, dir: this.dir });
    }
  }
  JH.Fireball = Fireball;

  // ---- Bulwark: "shield trooper" super-elite ----
  // Body is NEVER a blocker — it always takes full damage, in every phase.
  // It periodically plants its shield as a separate, stationary
  // DeployedShield (above) that hard-blocks spray, then fights shieldless
  // until it sprints back to reclaim it. See docs/superpowers/specs/
  // 2026-06-30-bulwark-shield-rework-design.md.
  class Bulwark extends Enemy {
    constructor(type, x, y) {
      super(type, x, y);
      this.hasShield = true;   // true: holding the shield; false: deployed/retrieving
      this.shield = null;      // its DeployedShield while deployed
      this.phase = "approach"; // approach | plant | shelter | slam | retrieve | cooldown
      this.windTimer = 0;
      this.cdTimer = 0;
      this.strikeFx = 0;
      this.slam = null;        // active slam telegraph {range, band, dmg, dur, t}
      this.state = "idle";     // animation state only ("walk"/"idle")
    }
    die(game) {
      if (this.shield) { this.shield.dead = true; this.shield = null; }
      super.die(game);
    }
    // Chase the player at `mult` speed; sets walk/idle anim. Returns the distance.
    _chase(dt, dx, dy, dist, mult) {
      if (dist > 18 && this.spawnGrace <= 0) {
        const d = this.def;
        this.x += (dx / (dist || 1)) * d.speed * mult * dt;
        this.y += (dy / (dist || 1)) * d.speed * mult * dt * 0.7;
        this.state = "walk";
      } else this.state = "idle";
    }
    think(dt, game) {
      const pl = game.player, d = this.def;
      const dx = pl.x - this.x, dy = pl.y - this.y, dist = Math.hypot(dx, dy);
      this.facing = dx >= 0 ? 1 : -1;
      if (this.strikeFx > 0) this.strikeFx -= dt;

      // ---- SLAM: big overhead strike (à la The Big Drip) ----
      if (this.phase === "slam") {
        this.slam.t -= dt; this.windTimer = this.slam.t; this.state = "wind";
        if (this.slam.t <= 0) {
          if (Geo.inHitArc(this, pl, this.facing, this.slam.range, this.slam.band))
            pl.takeHit(this.slam.dmg, game, this.x);
          game.shake(9); game.audio.play("whack");
          const front = this.x + this.facing * this.bodyW * 0.5;
          for (let i = 0; i < 12; i++)
            burst(game, front + this.facing * Math.random() * this.slam.range,
              this.y + (Math.random() - 0.5) * this.slam.band * 2, 2, "#fff", 1,
              { speed: 130, life: 0.32, up: 30 });
          this.strikeFx = 0.2; this.cdTimer = 0.7; this.phase = "shelter";
        }
        return;
      }

      // ---- RETRIEVE: sprint to the depleted shield prop and reclaim it ----
      if (this.phase === "retrieve") {
        if (!this.shield || this.shield.dead) {
          this.shield = null; this.hasShield = true;
          this.phase = "cooldown"; this.cdTimer = d.redeployCd; return;
        }
        const sx = this.shield.x - this.x, sy = this.shield.y - this.y, sdist = Math.hypot(sx, sy);
        if (sdist <= d.pickupRadius) {
          this.shield.dead = true; this.shield = null; this.hasShield = true;
          this.phase = "cooldown"; this.cdTimer = d.redeployCd; this.state = "idle"; return;
        }
        this.x += (sx / (sdist || 1)) * d.speed * d.retrieveSpeedMult * dt;
        this.y += (sy / (sdist || 1)) * d.speed * d.retrieveSpeedMult * dt * 0.7;
        this.state = "walk";
        return;
      }

      // ---- SHELTER: dome up; wait inside, slam when the player steps in ----
      if (this.phase === "shelter") {
        if (!this.shield || !this.shield.active) { this.phase = "retrieve"; return; }
        if (this.cdTimer > 0) this.cdTimer -= dt;
        // Slam when the player is close (they've usually entered the dome).
        if (this.cdTimer <= 0 && dist < d.slamRange && this.spawnGrace <= 0) {
          this.slam = { range: d.slamRange, band: d.slamBand, dmg: d.slamDmg, dur: d.slamWind, t: d.slamWind };
          this.phase = "slam"; game.audio.play("jump");
          return;
        }
        // Drift toward the player but stay near the dome center.
        const fromCenter = Math.hypot(this.shield.x - this.x, this.shield.y - this.y);
        if (dist > d.slamRange * 0.8 && fromCenter < d.domeRadius * 0.5) this._chase(dt, dx, dy, dist, 0.5);
        else this.state = "idle";
        return;
      }

      // ---- PLANT: wind up, then drop the dome centered on itself ----
      if (this.phase === "plant") {
        this.windTimer -= dt; this.state = "wind";
        if (this.windTimer <= 0) {
          const shield = new JH.DeployedShield(this.x, this.y, this);
          game.shields.push(shield);
          this.shield = shield; this.hasShield = false;
          this.phase = "shelter"; this.cdTimer = 0.4;
        }
        return;
      }

      // ---- COOLDOWN after retrieving: shuffle toward the player ----
      if (this.phase === "cooldown") {
        this.cdTimer -= dt;
        this._chase(dt, dx, dy, dist, 1);
        if (this.cdTimer <= 0) this.phase = "approach";
        return;
      }

      // ---- APPROACH: close on the player, then plant ----
      // With pyros alive it plants proactively wherever it stands — the dome
      // shelters its shooters (they run to it and huddle inside), so it
      // doesn't wait for Jon to get in range.
      const hasPyros = game.enemies.some((e) => !e.dead && e.type === "pyro");
      if (this.spawnGrace <= 0 && (dist < d.plantRange || hasPyros)) {
        this.windTimer = d.plantWind; this.phase = "plant"; return;
      }
      this._chase(dt, dx, dy, dist, 1);
    }

    draw(ctx, cam) {
      if (this.phase === "slam" || this.strikeFx > 0) this.drawSlamTelegraph(ctx, cam);
      JH.Enemy.prototype.draw.call(this, ctx, cam);
      if (this.phase === "slam") {
        const sx = this.x - cam, sy = Geo.feetScreenY(this.y, this.z) - this.bodyH - 8;
        ctx.fillStyle = (Math.floor(this.t * 10) & 1) ? "#ff5a5a" : "#fff";
        ctx.font = "bold 12px monospace"; ctx.textAlign = "center";
        ctx.fillText("!", sx, sy); ctx.textAlign = "left";
      }
    }
    drawSlamTelegraph(ctx, cam) {
      const a = this.slam; if (!a) return;
      const baseY = Geo.feetScreenY(this.y, 0);
      const x0 = (this.x - cam) + this.facing * this.bodyW * 0.5;
      const x1 = x0 + this.facing * a.range;
      const xL = Math.min(x0, x1), xW = Math.abs(x1 - x0);
      const yT = baseY - a.band, yH = a.band * 2;
      const strike = this.strikeFx > 0;
      const prog = strike ? 1 : 1 - a.t / a.dur;
      ctx.save();
      ctx.fillStyle = strike ? "rgba(255,255,255,0.5)" : "rgba(255,60,60,0.16)";
      ctx.fillRect(xL, yT, xW, yH);
      if (!strike) {
        const fx = this.facing > 0 ? xL : xL + xW * (1 - prog);
        ctx.fillStyle = "rgba(255,60,60,0.4)";
        ctx.fillRect(fx, yT, xW * prog, yH);
      }
      ctx.strokeStyle = strike ? "#fff" : ((Math.floor(this.t * 12) & 1) ? "#ff5a5a" : "#ffd23f");
      ctx.lineWidth = 1.5; ctx.strokeRect(xL, yT, xW, yH);
      ctx.restore();
    }
  }
  JH.Bulwark = Bulwark;

  // Dome ground-ellipse depth ratio — the DRAWN ground disc and the COLLISION
  // footprint (insideDome) share this so the barrier only affects you where the
  // visible circle is. Uses the game-wide ground-footprint ratio.
  const DOME_RY = JH.GROUND_RY;

  // ---- DeployedShield: a Bulwark's planted shield ----
  // Stationary, indestructible (no takeDamage path — the player can never
  // destroy it directly). Hard-blocks Player.doSpray at every beam tier (see
  // doSpray's blocker-finding). Owned by exactly one Bulwark, which reclaims
  // (and removes) it when it returns — `dead` is only ever set by the owner
  // reclaiming it or dying, never by combat.
  class DeployedShield {
    constructor(x, y, owner) {
      const b = JH.ENEMIES.bulwark;
      this.x = x; this.y = y; this.z = 0;
      this.bodyW = b.shieldBodyW;
      this.radius = b.domeRadius;   // presence of `radius` marks this as a dome (doSpray)
      this.domeDur = b.domeDur;     // full barrier lifespan (for the glow-fade math)
      this.domeT = b.domeDur;       // barrier lifespan remaining; counts to 0 then fades
      this.active = true;           // dome up (blocks/​shelters); false once faded
      this.owner = owner;
      this.dead = false; this.t = 0;
    }
    update(dt) {
      this.t += dt;
      if (this.active) { this.domeT -= dt; if (this.domeT <= 0) { this.domeT = 0; this.active = false; } }
    }
    draw(ctx, cam) {
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, 0);
      Assets.shadow(ctx, sx, sy, this.bodyW * 0.6);
      // Depleted shield prop at the center (what the Bulwark returns to reclaim).
      // While the dome holds, a faint glow-outline wavers harder as the timer
      // runs down, then goes dark once the dome is gone.
      if (this.active) {
        const frac = this.domeDur > 0 ? this.domeT / this.domeDur : 0;   // 1 fresh → 0 expiring
        const waver = 1 - frac;                                          // 0 fresh → 1 about to die
        const flick = 1 - waver * (0.45 + 0.45 * Math.sin(this.t * (5 + 26 * waver)));
        const fl = Math.max(0, Math.min(1, flick));
        const shCol = JH.PAL.bulwarkShield || "#cfe9ff";
        Assets.draw(ctx, "deployed_shield", sx, sy, 1, { t: this.t,
          outlines: [[shCol, (0.45 + 0.3 * frac) * fl], [shCol, (0.25 + 0.2 * frac) * fl]] });
      } else {
        Assets.draw(ctx, "deployed_shield", sx, sy, 1, { t: this.t });
      }
      if (!this.active) return;
      // Translucent dome barrier. Top half-ellipse rises from the ground line so
      // its endpoints (sx±r, sy) meet the ground disc exactly — one clean bubble.
      const r = this.radius;
      const domeH = r * 1.25;       // bubble height off the ground
      const col = JH.PAL.bulwarkShield || "#cfe9ff";
      const fade = this.domeT < 1.2 ? Math.max(0.15, this.domeT / 1.2) : 1;
      const flick = 0.85 + 0.15 * Math.sin(this.t * 9);
      ctx.save();
      // Bubble body: top dome arc closed along the FRONT half of the ground
      // ellipse (one path), so the sheltered ground disc shades evenly — a
      // straight bottom edge left the disc's front half one wash lighter.
      ctx.fillStyle = col; ctx.globalAlpha = 0.14 * fade * flick;
      ctx.beginPath();
      ctx.ellipse(sx, sy, r, domeH, 0, Math.PI, Math.PI * 2);
      ctx.ellipse(sx, sy, r, r * DOME_RY, 0, 0, Math.PI);
      ctx.fill();
      // Ground contact disc (uniform wash over the whole footprint)
      ctx.globalAlpha = 0.10 * fade;
      ctx.beginPath(); ctx.ellipse(sx, sy, r, r * DOME_RY, 0, 0, Math.PI * 2); ctx.fill();
      // Rims
      ctx.strokeStyle = col; ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.55 * fade * flick;
      ctx.beginPath(); ctx.ellipse(sx, sy, r, domeH, 0, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.30 * fade;
      ctx.beginPath(); ctx.ellipse(sx, sy, r, r * DOME_RY, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
  JH.DeployedShield = DeployedShield;

  // Is world point (px,py) inside a dome's VISIBLE ground ellipse? x is 1:1
  // world→screen; depth is compared in screen space (feetScreenY) against the
  // drawn ground disc (radius × radius·DOME_RY), so shelter/blocking line up with
  // what you see — you must stand in the circle, no phantom depth reach.
  function insideDome(dome, px, py) {
    const dx = px - dome.x;
    const dyS = Geo.feetScreenY(py, 0) - Geo.feetScreenY(dome.y, 0);
    const ry = dome.radius * DOME_RY;
    return (dx * dx) / (dome.radius * dome.radius) + (dyS * dyS) / (ry * ry) < 1;
  }
  JH.insideDome = insideDome;

  // ---- FirePatch: stationary burning ground zone ----
  // Left behind by Fuse deaths, Smelt smashes, Slayer fireballs, and the
  // Slayer's dash trail. Applies burn stacks to the player on overlap;
  // extinguished by spraying directly (tracked in Player.doSpray, not here).
  // See docs/superpowers/specs/2026-06-30-slayer-fire-world-design.md.
  class FirePatch {
    constructor(x, y, radius, extinguishDur) {
      this.x = x; this.y = y; this.z = 0;
      this.radius = radius;
      this.extinguishDur = extinguishDur;
      this.sprayProgress = 0;  // accumulated spray time; reaches extinguishDur to die
      this.patchBurnT = 0;     // cooldown between burn-stack applications
      this.sizzled = false;    // first-contact cue fired (once per patch instance)
      this.rimFlashT = 0;      // white rim flash on first contact
      this.dead = false; this.t = 0;
    }
    // Live footprint (shrinks as spray extinguishes). ONE shape shared by the
    // hit test and the drawn scorch/rim — the rim you see is the hitbox.
    footprint() {
      const prog = this.sprayProgress / this.extinguishDur;
      const r = Math.max(6, this.radius * (1 - prog * 0.55));
      const rx = r * 0.85;
      return { r, rx, ry: rx * JH.GROUND_RY };
    }
    update(dt, game) {
      this.t += dt;
      if (this.patchBurnT > 0) this.patchBurnT -= dt;
      if (this.rimFlashT > 0) this.rimFlashT -= dt;
      const pl = game.player;
      if (pl && pl.alive) {
        const f = this.footprint();
        // Jon's feet aren't a point: pad the footprint by a quarter of his
        // body width so a visible foot/shadow overlap counts as contact.
        const pad = (pl.bodyW || 12) * 0.25;
        const inside = Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y,
          f.rx + pad, f.ry + pad * JH.GROUND_RY);
        if (inside && !this.sizzled) {
          // First contact on this patch: sizzle + white rim flash. The first
          // stack lands immediately; SUBSEQUENT stacks are spaced by the
          // player's burn i-frames (applyBurn) + this patch's tick interval.
          this.sizzled = true;
          this.rimFlashT = 0.2;
          if (game.audio) game.audio.play("sizzle");
        }
        if (inside && this.patchBurnT <= 0) {
          // Only consume the tick when the stack actually lands; if the
          // player's burn i-frames blocked it, retry next frame so the next
          // stack arrives AT the i-frame boundary, not interval-aligned after.
          if (pl.applyBurn(1)) this.patchBurnT = JH.FIRE.patchBurnInterval;
        }
      }
      if (this.sprayProgress >= this.extinguishDur) this.dead = true;
    }
    draw(ctx, cam) {
      const sx = Math.round(this.x - cam);
      const sy = Math.round(Geo.feetScreenY(this.y, 0));
      const prog = this.sprayProgress / this.extinguishDur;
      const f = this.footprint();
      const t = this.t;
      ctx.save();
      // Scorch base decal — the EXACT hit ellipse.
      ctx.globalAlpha = Math.max(0, 0.88 - prog * 0.45);
      ctx.beginPath();
      ctx.ellipse(sx, sy, f.rx, f.ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#440800";
      ctx.fill();
      // Bright rim on the same ellipse, pulsing while lit; flashes white during
      // the first-contact sizzle grace.
      const flash = this.rimFlashT > 0;
      ctx.globalAlpha = Math.max(0, (flash ? 0.95 : 0.45 + 0.25 * Math.sin(t * 6)) - prog * 0.35);
      ctx.strokeStyle = flash ? "#ffffff" : JH.PAL.firePatchHi;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(sx, sy, f.rx, f.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      // Animated pack flames: free to be tall, never wider than the rim (cap
      // at 80% of footprint width; fire-small frames are 16px wide native).
      // Wide patches add two offset flames only where they stay inside the rim
      // (offset + drawn half-width ≤ rx).
      ctx.globalAlpha = Math.max(0, 0.88 - prog * 0.45);
      let fscale = Math.max(0.5, (f.r * 1.6) / 48);
      fscale = Math.min(fscale, (2 * f.rx * 0.8) / 16);
      Assets.drawFx(ctx, "fire-small", sx, sy + 2, t, { scale: fscale });
      if (f.r > 20) {
        if (f.r * 0.45 + 8 * fscale * 0.7 <= f.rx)
          Assets.drawFx(ctx, "fire-small", sx - f.r * 0.45, sy + 3, t + 0.35, { scale: fscale * 0.7 });
        if (f.r * 0.4 + 8 * fscale * 0.75 <= f.rx)
          Assets.drawFx(ctx, "fire-small", sx + f.r * 0.4, sy + 3, t + 0.6, { scale: fscale * 0.75 });
      }
      ctx.restore();
    }
  }
  JH.FirePatch = FirePatch;

  // ---- Stalker: fast "blink harasser" super-elite ----
  // Chases fast between blinks. On a cooldown: telegraphs (state "wind"),
  // blinks behind the player's facing, then winds up a strike (state
  // "strike") that only the player's dash i-frames negate (Player.takeHit
  // already no-ops while dashTimer > 0 — nothing new needed there).
  class Stalker extends Enemy {
    think(dt, game) {
      const pl = game.player, d = this.def;

      if (this.state === "strike") {
        this.attackTimer -= dt;
        if (this.attackTimer <= 0) {
          if (Geo.inHitArc(this, pl, this.facing, d.strikeRange, 16))
            pl.takeHit(d.strikeDmg, game, this.x);
          this.state = "idle";
          this.cdTimer = d.blinkCd;
          this.usingTicket = false;
        }
        return;
      }
      if (this.windTimer > 0) {
        this.windTimer -= dt; this.state = "wind";
        if (this.windTimer <= 0) {
          const t = JH.Balance.stalkerBlinkTarget(pl.x, pl.y, pl.facing, d.blinkDist, {
            minX: game.bounds.minX, maxX: game.bounds.maxX,
            depthMin: JH.DEPTH_MIN, depthMax: JH.DEPTH_MAX,
          });
          this.x = t.x; this.y = t.y;
          this.facing = pl.x >= this.x ? 1 : -1;
          this.attackTimer = d.strikeWind;
          this.state = "strike";
          game.audio.play("jump");
        }
        return;
      }
      if (this.cdTimer > 0) {
        this.cdTimer -= dt;
      } else if (this.spawnGrace <= 0 && game.canAttack()) {
        // No ticket → fall through to the chase code below instead of blinking.
        this.windTimer = d.blinkTell; this.state = "wind";
        this.usingTicket = true;
        return;
      }
      const dx = pl.x - this.x, dy = pl.y - this.y;
      const dist = Math.hypot(dx, dy);
      // Point-blank deadzone: with no body collision the stalker can sit on
      // Jon's center, where per-frame sign(dx) facing + full-speed chase
      // overshoot strobes the sprite left/right. Hold ground and facing there.
      if (dist > 12) {
        this.facing = dx >= 0 ? 1 : -1;
        this.x += (dx / dist) * d.speed * dt;
        this.y += (dy / dist) * d.speed * dt * 0.85;
        this.state = "walk";
      } else {
        this.state = "idle";
      }
    }
  }
  JH.Stalker = Stalker;

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
      if (this.dead || this.dying) return;
      this.dying = true;
      game.audio.play("win");
      for (const e of game.enemies) {
        if (e !== this && !e.dead && !e.isBoss) {
          e.dead = true;
          burst(game, e.x, e.y, e.z + 12, e.colorOf ? e.colorOf() : "#fff", 8, { speed: 90, life: 0.4, up: 60 });
        }
      }
      for (let i = 0; i < 5; i++)
        game.defer(i * 90, () => burst(game, this.x + (Math.random() - 0.5) * 40, this.y, Math.random() * 30, "#fff", 14, { speed: 140, life: 0.6, up: 120 }));
      game.embers.push(new JH.FxBurst(this.x, this.y, "boom-big", { scale: 0.9 }));
      spawnCoinFountain(game, this.x, this.y, this.def.suds);
      game.startBossDeathSeq(this);
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
      // Gentle magnet when close; during the wave-ender beat every pickup on
      // the field vacuums to Jon (kills the post-wave coin walk).
      const vac = game.lootVacuumT > 0;
      const dx = pl.x - this.x, dy = pl.y - this.y, dist = Math.hypot(dx, dy);
      if (vac || dist < 30) {
        const pull = vac ? JH.JUICE.vacuumPull : 4;
        this.x += dx * pull * dt; this.y += dy * pull * dt;
      }
      if (dist < 12) { this.collect(game); return false; }
      // Holy Essence crosses never expire — everything else blinks out.
      if (this.kind !== "cross" && this.t > this.life) {
        if (this.t > this.life + 2) return false;        // blink then vanish
      }
      return true;
    }
    collect(game) {
      this.dead = true;
      const pl = game.player;
      if (this.kind === "suds") { pl.suds += this.value; pl.sudsEarned += this.value; game.audio.play("coin"); }
      else if (this.kind === "health") {
        // Stacking kibble EXTENDS the regen window (never resets it — two
        // kibbles heal for twice as long).
        pl.kibbleTimer += 6.0;
        pl.kibbleRegen = this.value / 6.0;
        game.audio.play("buy");
        burst(game, pl.x, pl.y, pl.z + 10, JH.PAL.hpPk, 10, { speed: 70, life: 0.45, up: 50 });
      }
      else if (this.kind === "water_can") { pl.water = Math.min(pl.stats.maxWater, pl.water + this.value); game.audio.play("buy"); }
      else if (this.kind === "pill") {
        pl.concertaTimer = Math.max(pl.concertaTimer, JH.CONCERTA.dur);
        game.audio.play("pill");
        burst(game, pl.x, pl.y, pl.z + 10, JH.PAL.pill, 14, { speed: 90, life: 0.55, up: 60 });
      }
      else if (this.kind === "cross") {
        if (JH.Church) JH.Church.addEssence(this.value || 1);
        game.audio.play("upgrade");
        burst(game, pl.x, pl.y, pl.z + 12, "#fff7c2", 12, { speed: 80, life: 0.5, up: 70 });
      }
      if (this.kind !== "pill" && this.kind !== "health" && this.kind !== "cross")
        burst(game, this.x, this.y, this.z + 6, this.kind === "suds" ? JH.PAL.suds : JH.PAL.water, 6, { speed: 60, life: 0.3 });
    }
    draw(ctx, cam) {
      if (this.kind !== "cross" && this.t > this.life && (Math.floor(this.t * 8) & 1)) return; // blink before despawn
      const key = this.kind === "suds"
        ? (this.value >= 10 ? "suds_gold" : this.value >= 5 ? "suds_silver" : "suds_bronze")
        : this.kind === "health" ? "health" : this.kind === "pill" ? "pill"
        : this.kind === "cross" ? "essence_cross" : "water_can";
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
    update(dt, player) {
      this.t += dt;
      // Watch Jon walk past: facing picks the head-turned frame set (the
      // stall composition itself never flips).
      if (player && player.alive) this.facing = (player.x > this.x) ? 1 : -1;
    }
    draw(ctx, cam) {
      const sx = this.x - cam;
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
      this.coreEjected = false; // true after die() ejects the core -> draw a hole
      this.coreFrac = 0.5;      // core-glyph height as a fraction of bodyH
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
      // shared boss core glyph (a black hole once the core has escaped)
      const cx = this.x - cam, cy = Geo.feetScreenY(this.y, this.z) - this.bodyH * 0.5;
      Assets.bossCore(ctx, cx, cy, 4, this.t, { flash: this.fireFx > 0, hole: this.coreEjected });
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
      if (this.dead || this.dying) return;
      this.dying = true;
      game.audio.play("win");
      for (const e of game.enemies) if (e !== this && !e.dead && !e.isBoss) e.dead = true;
      for (let i = 0; i < 6; i++)
        game.defer(i * 90, () => burst(game, this.x + (Math.random() - 0.5) * 50, this.y, Math.random() * 30, "#9be8ff", 14, { speed: 150, life: 0.6, up: 120 }));
      game.embers.push(new JH.FxBurst(this.x, this.y, "boom-big", { scale: 0.9 }));
      spawnCoinFountain(game, this.x, this.y, this.def.suds);
      this.coreEjected = true;     // draw a black hole where the core was
      ejectBossCore(game, this);   // non-final form: eject the surviving core (cosmetic)
      game.startBossDeathSeq(this);
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

  // ---- FireRing: expanding fire shockwave from the Slayer's dash landing ----
  // Rides game.embers. Radiates outward as a flat 2.5D ground ring; deals one
  // hit (+burn) to the player when the expanding edge crosses them.
  class FireRing {
    constructor(x, y, opt) {
      this.x = x; this.y = y; this.z = 0;
      this.r = 6;
      this.maxR = opt.maxR; this.speed = opt.speed;
      this.dmg = opt.dmg; this.burn = opt.burn || 0;
      this.t = 0; this.dead = false; this.hit = false;
    }
    update(dt, game) {
      this.t += dt;
      this.r += this.speed * dt;
      const pl = game.player;
      if (!this.hit && pl && pl.alive) {
        // Rim-space distance: depth scaled up by GROUND_RY so the drawn
        // elliptical rim (rx = r, ry = r*GROUND_RY) becomes a circle of
        // radius r — the expanding edge hits exactly where it's drawn.
        const dx = pl.x - this.x;
        const dyS = Geo.feetScreenY(pl.y, 0) - Geo.feetScreenY(this.y, 0);
        const pd = Math.hypot(dx, dyS / JH.GROUND_RY);
        if (Math.abs(pd - this.r) < 14) {
          pl.takeHit(this.dmg, game, this.x);
          if (this.burn) pl.applyBurn(this.burn);
          this.hit = true; game.shake(3);
        }
      }
      if (Math.random() < 0.9) {
        const a = Math.random() * Math.PI * 2;
        burst(game, this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r * JH.GROUND_RY, 3,
          Math.random() < 0.5 ? JH.PAL.firePatch : JH.PAL.firePatchHi, 1, { speed: 30, life: 0.28, up: 22 });
      }
      if (this.r >= this.maxR) this.dead = true;
      return !this.dead;
    }
    draw(ctx, cam) {
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, 0);
      const fade = Math.max(0, 1 - this.r / this.maxR);
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.5 * fade;
      ctx.strokeStyle = JH.PAL.firePatchHi; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(sx, sy, this.r, this.r * JH.GROUND_RY, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.25 * fade; ctx.strokeStyle = JH.PAL.firePatch; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(sx, sy, this.r * 0.92, this.r * 0.92 * JH.GROUND_RY, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }
  JH.FireRing = FireRing;

  // ================================================ LIGHTNING WAVE (Firewall SURGE)
  // Depth-lane attack: rolls left at the core's depth row. Distinct from Shockwave —
  // dodge by stepping out of the core's depth lane (not dashing through it).
  class LightningWave {
    constructor(x, y, dir, speed, def) {
      this.x = x; this.y = y; this.dir = dir; this.speed = speed;
      this.dmg = def.waveDmg; this.range = def.waveRange;
      this.traveled = 0; this.t = 0; this.dead = false; this.hit = false;
    }
    update(dt, game) {
      this.t += dt;
      const step = this.speed * dt * this.dir;
      this.x += step; this.traveled += Math.abs(step);
      const pl = game.player;
      // Hit only if player is in this depth lane (move to a different lane to dodge).
      if (!this.hit && pl.alive &&
          Math.abs(pl.x - this.x) < 10 && Math.abs(pl.y - this.y) < 22) {
        pl.takeHit(this.dmg, game, this.x); this.hit = true; game.shake(5);
      }
      // Electric sparks along the depth row.
      if (Math.random() < 0.85)
        burst(game, this.x, this.y, Math.random() * 18,
          Math.random() < 0.55 ? "#00f8ff" : "#80ff90", 1,
          { speed: 60, life: 0.22, up: 50, grav: 200 });
      if (this.traveled > this.range) this.dead = true;
      return !this.dead;
    }
    draw(ctx, cam) {
      const sx = this.x - cam;
      if (sx < -40 || sx > JH.VIEW_W + 40) return;
      const sy = Geo.feetScreenY(this.y, 0);
      const fade = Math.max(0.1, 1 - this.traveled / this.range);
      const pulse = 0.55 + 0.45 * Math.abs(Math.sin(this.t * 22));
      ctx.save();
      // Cyan oval glow at the depth row.
      ctx.globalAlpha = 0.2 * fade;
      ctx.fillStyle = "#00d8ff";
      ctx.beginPath();
      ctx.ellipse(Math.round(sx), sy - 8, 9, 24, 0, 0, Math.PI * 2);
      ctx.fill();
      // Jagged bolt: vertical segments with horizontal jag driven by t.
      const segs = 9, segH = 3;
      const startY = sy - Math.floor(segs * segH * 0.5);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      const bx = Math.round(sx);
      // Cyan outer bolt.
      ctx.globalAlpha = 0.78 * pulse * fade;
      ctx.strokeStyle = "#00f0ff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(bx, startY);
      for (let i = 1; i <= segs; i++)
        ctx.lineTo(bx + Math.sin(this.t * 24 + i * 2.3) * 5, startY + i * segH);
      ctx.stroke();
      // Green fringe.
      ctx.globalAlpha = 0.4 * pulse * fade;
      ctx.strokeStyle = "#80ff80";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // White core.
      ctx.globalAlpha = 0.92 * pulse * fade;
      ctx.strokeStyle = "#e8ffff";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
    }
  }
  JH.LightningWave = LightningWave;

  // ============================================== ESCAPING BOSS CORE
  // A red core that ejects from a defeated boss, bounces off the floor and
  // skitters right — ahead of the player, deeper into the level — before
  // fading. Cosmetic only: rides the game.embers pipeline
  // (update(dt,game)->keep, draw(ctx,cam)), so it never affects wave-clear
  // or collision. Spawned via ejectBossCore().
  class BossCore {
    constructor(x, y, z) {
      this.x = x; this.y = y; this.z = z != null ? z : 26;
      this.vx = 70 + Math.random() * 40;         // flee right, up the road ahead
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
      if (this.t > this.life || this.x > (game.bounds ? game.bounds.maxX + 40 : JH.LEVEL_LEN + 40)) this.dead = true;
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

  // Spawn an escaping BossCore from a defeated boss (cosmetic). Originates at the
  // boss's core-glyph position so it reads as the SAME core detaching (the glyph
  // sits bodyH*0.5 above the feet; BossCore.draw offsets its sprite up 5px).
  function ejectBossCore(game, boss) {
    const frac = boss.coreFrac != null ? boss.coreFrac : 0.5;
    const z = (boss.z || 0) + (boss.bodyH || 30) * frac - 5;
    game.embers.push(new BossCore(boss.x, boss.y, z));
    game.audio.play("hurt");
    game.banner("…THE CORE SURVIVES", 1.6);
  }
  JH.ejectBossCore = ejectBossCore;

  // One-shot FX animation at a world point (explosions etc.). Rides the
  // game.embers pipeline like BossCore: update(dt)->keep, draw(ctx,cam).
  // Cosmetic only — never affects wave-clear or collision.
  class FxBurst {
    constructor(x, y, key, opt) {
      const m = JH.FX[key];
      this.x = x; this.y = y; this.z = (opt && opt.z) || 0;
      this.key = key;
      this.scale = (opt && opt.scale) || 1;
      this.life = m ? m.count / m.fps : 0.5;
      this.t = 0; this.dead = false;
    }
    update(dt) {
      this.t += dt;
      if (this.t >= this.life) this.dead = true;
      return !this.dead;
    }
    draw(ctx, cam) {
      Assets.drawFx(ctx, this.key, this.x - cam, Geo.feetScreenY(this.y, this.z), this.t,
        { scale: this.scale, loop: false });
    }
  }
  JH.FxBurst = FxBurst;

  // Kill confirm: the dead enemy's sprite collapses to the ground over ~150ms
  // (flattens toward the feet, spreads slightly), keeping its soak tint. The
  // death particle burst is deferred to land as this finishes. Rides game.embers.
  class KillPop {
    constructor(e) {
      this.type = e.type; this.x = e.x; this.y = e.y; this.z = e.z || 0;
      this.facing = e.facing || 1; this.frame = e.frame || 0; this.state = e.state;
      this.wet = e.wetness || 0;
      this.t = 0; this.dead = false;
    }
    update(dt) { this.t += dt; if (this.t >= 0.15) this.dead = true; return !this.dead; }
    draw(ctx, cam) {
      const p = Math.min(1, this.t / 0.15);
      const k = p * p;   // accelerating drop
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, this.z);
      ctx.save();
      // Collapse transform anchored at the feet baseline (Assets.draw's own
      // squash hook is capped at the subtle hurt amp, so scale here instead).
      ctx.translate(sx, sy);
      ctx.scale(1 + 0.3 * k, Math.max(0.05, 1 - 0.95 * k));
      ctx.translate(-sx, -sy);
      ctx.globalAlpha = 1 - 0.4 * k;
      Assets.draw(ctx, this.type, sx, sy, this.facing, {
        state: this.state, frame: this.frame, t: this.t, wet: this.wet,
      });
      ctx.restore();
    }
  }
  JH.KillPop = KillPop;

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
          if (Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, d.stompRadius))
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
          if (Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, d.leapRadius))
            pl.takeHit(d.leapDmg, game, this.x);
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
      ctx.beginPath(); ctx.ellipse(sx, sy, r, r * JH.GROUND_RY, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#ff5a5a";
      ctx.beginPath(); ctx.ellipse(sx, sy, r * prog, r * JH.GROUND_RY * prog, 0, 0, Math.PI * 2); ctx.fill();
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
      ctx.beginPath(); ctx.ellipse(tx, ty, r, r * JH.GROUND_RY, 0, 0, Math.PI * 2); ctx.stroke();
      // Crosshair
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.moveTo(tx - r - 6, ty); ctx.lineTo(tx + r + 6, ty);
      ctx.moveTo(tx, ty - r * JH.GROUND_RY - 6); ctx.lineTo(tx, ty + r * JH.GROUND_RY + 6);
      ctx.stroke();
      // Fill progress
      ctx.globalAlpha = 0.18 + 0.2 * prog;
      ctx.fillStyle = "#ff5a5a";
      ctx.beginPath(); ctx.ellipse(tx, ty, r * prog, r * JH.GROUND_RY * prog, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    die(game) {
      if (this.dead) return;
      this.dead = true;
      game.audio.play("win");
      for (let i = 0; i < 7; i++)
        game.defer(i * 90, () => burst(game, this.x + (Math.random() - 0.5) * 56, this.y, Math.random() * 36, "#e0902f", 14, { speed: 150, life: 0.7, up: 130 }));
      game.embers.push(new JH.FxBurst(this.x, this.y, "boom-big", { scale: 0.9 }));
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
    constructor(x, y, idx, opts) {
      this.x = x; this.y = (y != null) ? y : JH.DEPTH_MAX * 0.5; this.z = 0;
      this.idx = idx || 0;
      this.flame = !!(opts && opts.flame);
      this.grow = 0; this.growMax = JH.GARDEN.growMax;
      this.bodyW = 42; this.dead = false; this.done = false; this.t = 0; this.hitFx = 0;
      this.doneFx = 0;   // countdown that drives the completion pop
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
        if (!this.flame) {
          // Garden reward: pill + first-box Concerta unlock. Flame boxes give none.
          if (!game.concertaUnlocked) {
            game.concertaUnlocked = true;
            game.banner("CONCERTA UNLOCKED!", 4.0);
          }
          game.spawnPickup("pill", this.x, this.y, 1);
          game.gardensCleared = (game.gardensCleared || 0) + 1;
        }
      }
    }
    update(dt) { this.t += dt; if (this.hitFx > 0) this.hitFx -= dt; if (this.doneFx > 0) this.doneFx -= dt; }
    draw(ctx, cam) {
      const sx = this.x - cam;
      const sy = Geo.feetScreenY(this.y, 0) - 4;
      const gf = this.grow / this.growMax;
      if (this.flame) {
        // Pack flame that shrinks as it's doused (gf: 0 = raging, 1 = out).
        const rem = 1 - gf;
        if (rem > 0.02)
          JH.Assets.drawFx(ctx, "fire-big", sx, sy, this.t, { scale: 0.9 * (0.35 + 0.65 * rem) });
      } else {
        JH.Assets.draw(ctx, "garden_box", sx, sy, 1, { growFrac: gf });
      }
      // Progress bar (extinguish progress for flame, growth for garden)
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
        const doneMsg = this.flame ? "OUT!" : "GREAT!";
        ctx.fillStyle = "#0a2a08"; ctx.fillText(doneMsg, sx + 1, ty + 1);
        ctx.fillStyle = "#7dff5a"; ctx.fillText(doneMsg, sx, ty);
      } else if (!this.done && this.hitFx > 0) {
        const ty = by - 6 + Math.sin(this.t * 6) * 1.5;
        ctx.globalAlpha = 0.92;
        const msg = this.flame ? "Douse it!" : "Keep watering!";
        ctx.fillStyle = "#062033"; ctx.fillText(msg, sx + 1, ty + 1);
        ctx.fillStyle = "#bfefff"; ctx.fillText(msg, sx, ty);
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
        state: this.state, t: this.t,
        hurt: this.flashTimer > 0,
        hurtAlpha: this.flashTimer / 0.18,
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
      this.coreFrac = 0.55;     // its core glyph sits a touch higher than the Switch's
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
      // shared boss core glyph (larger; a black hole once the core has escaped)
      const cx = this.x - cam, cy = Geo.feetScreenY(this.y, this.z) - this.bodyH * 0.55;
      Assets.bossCore(ctx, cx, cy, 5, this.t, { flash: this.fireFx > 0, hole: this.coreEjected });
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
      if (this.dead || this.dying) return;
      this.dying = true;
      game.audio.play("win");
      for (const e of game.enemies) if (e !== this && !e.dead && !e.isBoss) e.dead = true;
      for (let i = 0; i < 9; i++)
        game.defer(i * 80, () => burst(game, this.x + (Math.random() - 0.5) * 60, this.y, Math.random() * 36,
          Math.random() < 0.5 ? "#ff3a3a" : "#ffcc44", 16, { speed: 170, life: 0.8, up: 150 }));
      // Ejects the surviving core (same as the Switch) and leaves a hole.
      this.coreEjected = true;
      ejectBossCore(game, this);
      game.embers.push(new JH.FxBurst(this.x, this.y, "boom-big", { scale: 0.9 }));
      spawnCoinFountain(game, this.x, this.y, this.def.suds);
      game.startBossDeathSeq(this);
    }
  }
  JH.GatewayKrusherBoss = GatewayKrusherBoss;

  // ==================================================== THE FIREWALL (wall boss)
  // Switch-chassis wall pinned to the right edge of the arena; doesn't move.
  // Body is armoured (takeDamage ignores hits); only the WEAK SPOT (core) takes
  // damage, and only while OPEN. The core ROAMS in depth (this.y) — the player
  // must stand in its lane for the stream to register. Attacks: PORT SLAM slab
  // in front of the face (back off) and a SURGE lightning bolt along the core's
  // depth lane (step out of the lane to dodge).
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
      // LightningWave locked to the core's current depth lane — player dodges by
      // stepping out of the lane, not dashing through it.
      game.embers.push(new LightningWave(sx, this.y, -1, ws, d));
      if (enraged) game.embers.push(new LightningWave(sx, this.y, -1, ws * 0.6, d));
      // Electric burst at the emission point.
      for (let i = 0; i < 14; i++)
        burst(game, sx, this.y, Math.random() * 24,
          Math.random() < 0.5 ? "#00f8ff" : "#80ff90", 1, { speed: 140, life: 0.45, up: 70 });
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

      this.drawCore(ctx, cam);
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
      if (this.dead || this.dying) return;
      this.dying = true;
      game.audio.play("win"); game.shake(16);
      for (const e of game.enemies) if (e !== this && !e.dead && !e.isBoss) e.dead = true;
      for (let i = 0; i < 12; i++)
        game.defer(i * 80, () => burst(game, this.x - 20 - Math.random() * 40,
          JH.DEPTH_MIN + Math.random() * (JH.DEPTH_MAX - JH.DEPTH_MIN), 10 + Math.random() * 120,
          Math.random() < 0.5 ? JH.PAL.wallbossCore : JH.PAL.wallbossHaz, 16,
          { speed: 180, life: 0.8, up: 150 }));
      game.embers.push(new JH.FxBurst(this.x - 40, this.y, "boom-big", { scale: 0.9 }));
      spawnCoinFountain(game, this.x - 40, this.y, this.def.suds);
      ejectBossCore(game, this);   // non-final form: eject the surviving core (cosmetic)
      game.startBossDeathSeq(this);
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

  // ---- Smelt: slow, arena-control, half-effective spray ----
  // ---- SmeltBomb: Smelt's lobbed fire bomb ----
  // Arcing projectile (parabolic z). Spawns FirePatch + burst on landing.
  // Pushed into game.embers; update() returns false when dead.
  class SmeltBomb {
    constructor(x, y, tx, ty, d) {
      // Leaves the hands of the overhead hoist (matches the wind-pose art,
      // where the bomb sits ~32 logical px above the feet).
      this.x = x; this.y = y; this.z = 32;
      const dist = Math.max(1, Math.hypot(tx - x, ty - y));
      const flightT = Math.max(0.45, dist / d.lobBombSpeed);
      this.vx = (tx - x) / flightT;
      this.vy = (ty - y) / flightT;
      // vz so that z returns to 0 at flightT: vz = 0.5*g*flightT - z0/flightT
      this.vz = 0.5 * d.lobGravity * flightT - this.z / flightT;
      this.def = d;
      this.t = 0;
      this.dead = false;
    }
    update(dt, game) {
      this.t += dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vz -= this.def.lobGravity * dt;
      this.z += this.vz * dt;
      if (Math.random() < 0.5)
        game.particles.push(new Particle({
          x: this.x, y: this.y, z: this.z + 4,
          vx: (Math.random() - 0.5) * 35, vy: (Math.random() - 0.5) * 20, vz: 18,
          life: 0.2 + Math.random() * 0.1,
          color: Math.random() > 0.4 ? JH.PAL.smeltGlow : JH.PAL.firePatch,
          size: 3, grav: 140,
        }));
      if (this.z <= 0) {
        const d = this.def;
        game.firePatches.push(new JH.FirePatch(this.x, this.y, d.lobBombRadius, d.lobBombDur));
        game.embers.push(new JH.FxBurst(this.x, this.y, "boom-mid", { scale: 0.6 }));
        burst(game, this.x, this.y, 4, JH.PAL.smeltGlow, 14, { speed: 115, life: 0.5, up: 60, size: 3 });
        burst(game, this.x, this.y, 2, JH.PAL.firePatchHi, 8, { speed: 65, life: 0.4, up: 18, size: 2 });
        game.shake(3);
        const pl = game.player;
        // First-frame burn uses the SAME footprint as the FirePatch it just
        // spawned (rx = 0.85·radius + foot pad), so frame 0 agrees with every
        // later frame.
        if (pl.alive && Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y,
            d.lobBombRadius * 0.85 + (pl.bodyW || 12) * 0.25))
          pl.applyBurn(1);
        this.dead = true;
      }
      return !this.dead;
    }
    draw(ctx, cam) {
      const sx = this.x - cam;
      const groundSy = Geo.feetScreenY(this.y, 0);
      const sy = Geo.feetScreenY(this.y, this.z);
      const flick = Math.floor(this.t * 12) & 1;
      ctx.save();
      // Ground shadow — grows as bomb descends
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#220800";
      ctx.beginPath();
      const shadowR = Math.max(2, 8 - this.z * 0.18);
      ctx.ellipse(Math.round(sx), Math.round(groundSy), shadowR, shadowR * JH.GROUND_RY, 0, 0, Math.PI * 2);
      ctx.fill();
      // Bomb
      ctx.globalAlpha = 1;
      Assets.glow(ctx, Math.round(sx), Math.round(sy), 13, JH.PAL.smeltGlow, 0.8);
      ctx.fillStyle = flick ? JH.PAL.smeltGlow : JH.PAL.firePatchHi;
      ctx.beginPath();
      ctx.arc(Math.round(sx), Math.round(sy), 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Stands back; lobs arcing SmeltBombs at the player on a cooldown.
  // waterMult:0.5 means sustained spray does half damage.
  class Smelt extends Enemy {
    think(dt, game) {
      const pl = game.player, d = this.def;
      const dx = pl.x - this.x, dy = pl.y - this.y;
      const dist = Math.hypot(dx, dy);
      this.facing = dx >= 0 ? 1 : -1;

      if (this.windTimer > 0) {
        this.windTimer -= dt; this.state = "wind";
        if (this.windTimer <= 0) {
          game.embers.push(new SmeltBomb(this.x, this.y, pl.x, pl.y, d));
          this.cdTimer = d.lobCd;
        }
        return;
      }
      if (this.cdTimer > 0) this.cdTimer -= dt;
      if (this.spawnGrace > 0) { this.state = "idle"; return; }

      // Maintain standoff range
      if (dist < d.preferRange - 20) {
        this.x -= (dx / (dist || 1)) * d.speed * dt;
        this.y -= (dy / (dist || 1)) * d.speed * dt * 0.7;
        this.state = "walk";
      } else if (dist > d.preferRange + 30) {
        this.x += (dx / (dist || 1)) * d.speed * dt;
        this.y += (dy / (dist || 1)) * d.speed * dt * 0.7;
        this.state = "walk";
      } else {
        this.state = "idle";
      }

      // Lob when in range and cooldown ready
      if (dist < 200 && this.cdTimer <= 0)
        { this.windTimer = d.lobWindup; this.state = "wind"; }
    }
  }
  // ---- SlayerBoss: Fire boss ----
  // Charge-up/dash movement (no walk cycle), fireball volley, slam attack.
  // After defeat: ally cutscene triggers in waveCleared_() → fire element unlocked.
  // See docs/superpowers/specs/2026-06-30-slayer-fire-world-design.md.
  class SlayerBoss extends Enemy {
    constructor(x, y) {
      super("mook", x, y);
      this.def = JH.SLAYER;
      this.type = "slayer";
      this.hp = this.maxHp = JH.SLAYER.hp;
      this.bodyW = JH.SLAYER.bodyW; this.bodyH = JH.SLAYER.bodyH;
      this.isBoss = true;
      this.state = "idle";       // opens on a volley (alternator picks it first)
      this._lastMove = "dash";   // so the first idle pick is a volley
      this.shootPoseT = 0;       // >0 = show the cueRelease (strike) pose
      // Charge/dash state
      this.chargeT = 0;
      this.dashTarget = null;    // {x,y} computed when charge completes
      this.dashTellT = 0;
      this.dashElapsed = 0;      // time in "dash" state; guards against wall-stuck
      this.dashPatchAcc = 0;     // accumulated travel px for trail patch spawning
      // Volley state
      this.windTimer = 0;
      this.volleyBallsLeft = 0;
      this.volleyT = 0;
      // Cooldown between attack cycles
      this.cdTimer = 0.8;        // initial settle time
      this.strikeFx = 0;
    }

    think(dt, game) {
      this.x = clamp(this.x, game.bounds.minX + 24, game.bounds.maxX - 24);
      const pl = game.player, d = this.def;
      const dx = pl.x - this.x, dy = pl.y - this.y, dist = Math.hypot(dx, dy);
      const enraged = this.hp / this.maxHp < d.enrageAt;
      if (this.strikeFx > 0) this.strikeFx -= dt;
      if (this.shootPoseT > 0) this.shootPoseT -= dt;
      if (this.cdTimer > 0) { this.cdTimer -= dt; this.state = "idle"; return; }

      // ---- CHARGE: fire particles build up, then snap to dash ----
      if (this.state === "charge") {
        this.chargeT += dt;
        this.facing = dx >= 0 ? 1 : -1;
        const density = Math.min(1, this.chargeT / d.chargeDur);
        if (Math.random() < density * 2.5 * dt * 60)
          burst(game, this.x + (Math.random() - 0.5) * 16,
            this.y + (Math.random() - 0.5) * 8, 12 + Math.random() * 16,
            JH.PAL.slayerEmber, 1, { speed: 50, life: 0.22, up: 30 });
        if (this.chargeT >= d.chargeDur) {
          this.dashTarget = {
            x: clamp(pl.x, game.bounds.minX + 24, game.bounds.maxX - 24),
            y: clamp(pl.y, JH.DEPTH_MIN, JH.DEPTH_MAX),
          };
          this.dashTellT = d.dashTell;
          this.dashPatchAcc = 0;
          this.state = "pre_dash";
        }
        return;
      }

      // ---- PRE_DASH: brief hold in dash pose ----
      if (this.state === "pre_dash") {
        this.dashTellT -= dt;
        this.state = "pre_dash";   // keep as pre_dash; painter reads "dash" sprite
        if (this.dashTellT <= 0) { this.dashElapsed = 0; this.state = "dash"; }
        return;
      }

      // ---- DASH: move to dashTarget, spawn trail patches ----
      if (this.state === "dash") {
        this.dashElapsed += dt;
        const tdx = this.dashTarget.x - this.x, tdy = this.dashTarget.y - this.y;
        const tdist = Math.hypot(tdx, tdy);
        const dashMaxDur = d.dashDist / d.dashSpeed + 0.5;
        if (tdist < 8 || this.dashElapsed > dashMaxDur) {
          // Dash complete. Enraged only: a fire ring radiates from the landing
          // point (always-on it punished dodging the dash correctly).
          this.chargeT = 0;
          if (enraged) {
            game.embers.push(new JH.FireRing(this.x, this.y, {
              dmg: d.dashRingDmg, burn: d.dashRingBurn, maxR: d.dashRingMaxR, speed: d.dashRingSpeed,
            }));
          }
          burst(game, this.x, this.y, 14, JH.PAL.firePatchHi, 12, { speed: 120, life: 0.4, up: 40 });
          game.shake(5); game.audio.play("whack");
          if (dist < d.slamRange + 10) {
            this.windTimer = enraged ? d.slamWind * 0.8 : d.slamWind;
            this.state = "slam";
          } else {
            this.cdTimer = 0.5; this.state = "idle";  // alternator picks the volley next
          }
          return;
        }
        const step = Math.min(tdist, d.dashSpeed * dt);
        const nx = tdx / tdist, ny = tdy / tdist;
        this.x += nx * step; this.y += ny * step;
        this.dashPatchAcc += step;
        // Emit particles and spawn trail fire patches.
        if (Math.random() < 0.7)
          burst(game, this.x, this.y, 4, JH.PAL.slayerEmber, 1, { speed: 70, life: 0.15, up: 10 });
        while (this.dashPatchAcc >= d.dashPatchSpacing) {
          this.dashPatchAcc -= d.dashPatchSpacing;
          game.firePatches.push(new JH.FirePatch(this.x, this.y, d.dashPatchRadius, d.dashPatchDur));
        }
        this.facing = tdx >= 0 ? 1 : -1;
        return;
      }

      // ---- SLAM ----
      if (this.state === "slam") {
        this.windTimer -= dt;
        if (this.windTimer <= 0) {
          if (Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, d.slamRange))
            pl.takeHit(d.slamDmg, game, this.x);
          for (let i = 0; i < 10; i++)
            burst(game, this.x + (Math.random() - 0.5) * 24, this.y + (Math.random() - 0.5) * 16, 4,
              JH.PAL.smeltGlow, 1, { speed: 100, life: 0.4, up: 50 });
          game.shake(8); game.audio.play("whack");
          this.strikeFx = 0.2;
          this.cdTimer = enraged ? d.volleyCd * 0.8 : d.volleyCd;
          this.state = "idle";
        }
        return;
      }

      // ---- CUE WIND-UP ----
      if (this.state === "cueWind") {
        this.windTimer -= dt;
        if (this.windTimer <= 0) {
          // Fire first ball, transition to volley-fire state.
          this._fireOneBall(game, enraged);
          this.volleyBallsLeft--;
          this.volleyT = d.ballStagger;
          this.state = this.volleyBallsLeft > 0 ? "volley" : "post_volley";
          if (this.state === "post_volley") this.windTimer = 0.15;
        }
        return;
      }

      // ---- VOLLEY: stagger remaining balls ----
      if (this.state === "volley") {
        this.volleyT -= dt;
        if (this.volleyT <= 0) {
          this._fireOneBall(game, enraged);
          this.volleyBallsLeft--;
          if (this.volleyBallsLeft > 0) {
            this.volleyT = d.ballStagger;
          } else {
            this.windTimer = 0.15;   // brief cueRelease hold
            this.state = "post_volley";
          }
        }
        return;
      }

      // ---- POST_VOLLEY: cueRelease sprite flash ----
      if (this.state === "post_volley") {
        this.windTimer -= dt;
        if (this.windTimer <= 0) {
          this.cdTimer = enraged ? d.volleyCd * 0.8 : d.volleyCd;
          this.chargeT = 0;
          this.state = "idle";
        }
        return;
      }

      // Fall-through: "idle" alternates his two moves so he isn't just dashing.
      // Opens on a volley (constructor sets _lastMove = "dash").
      if (this.state === "idle") {
        this.chargeT = 0;
        this.facing = dx >= 0 ? 1 : -1;
        if (this._lastMove === "volley") { this._lastMove = "dash"; this.state = "charge"; }
        else { this._lastMove = "volley"; this._startVolley(enraged); }
      }
    }

    _startVolley(enraged) {
      const d = this.def;
      this.volleyBallsLeft = enraged ? d.enrageBallCount : d.ballCount;
      this.windTimer = enraged ? d.volleyWind * 0.8 : d.volleyWind;
      this.state = "cueWind";
    }

    _fireOneBall(game, enraged) {
      const d = this.def;
      const bx = this.x + this.facing * d.ballSpawnOffset;  // materialise at the cue tip
      game.embers.push(new JH.Fireball(bx, this.y, this.facing, game));
      this.shootPoseT = 0.09;   // flick to the cueRelease pose so the strike connects
      burst(game, bx, this.y, 6, JH.PAL.slayerEmber, 8, { speed: 60, life: 0.2, up: 20 });
      game.audio.play("jump");
    }

    draw(ctx, cam) {
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, 0);
      Assets.shadow(ctx, sx, sy, this.bodyW * 0.75);
      // Map internal state to sprite state string.
      let spriteState = "idle";
      if (this.state === "dash" || this.state === "pre_dash") spriteState = "dash";
      else if (this.state === "cueWind") spriteState = "cueWind";
      else if (this.state === "volley") spriteState = this.shootPoseT > 0 ? "cueRelease" : "cueWind";
      else if (this.state === "post_volley") spriteState = "cueRelease";
      Assets.draw(ctx, "slayer", sx, sy, this.facing, {
        state: spriteState,
        hurt: this.flashTimer > 0,
        hurtAlpha: Math.min(this.flashTimer / 0.18, 1),
      });
      if (this.hp < this.maxHp) {
        const w = this.bodyW + 8;
        const bx = Math.round(sx - w / 2), by = Math.round(Geo.feetScreenY(this.y, 0) - this.bodyH - 10);
        ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(bx - 1, by - 1, w + 2, 6);
        ctx.fillStyle = "#5a2a1a"; ctx.fillRect(bx, by, w, 4);
        ctx.fillStyle = JH.PAL.slayerEmber; ctx.fillRect(bx, by, Math.round(w * (this.hp / this.maxHp)), 4);
      }
      // Slam telegraph zone.
      if (this.state === "slam" && this.strikeFx <= 0) {
        // The telegraph IS the hit zone: shared ground-footprint ellipse.
        const d = this.def;
        const flash = Math.floor(this.t * 12) & 1;
        const gy = Geo.feetScreenY(this.y, 0);
        const ry = d.slamRange * JH.GROUND_RY;
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(Math.round(sx), Math.round(gy), d.slamRange, Math.max(6, ry), 0, 0, Math.PI * 2);
        ctx.fillStyle = flash ? "#ff6010" : "#ff3000";
        ctx.globalAlpha = 0.20;
        ctx.fill();
        ctx.globalAlpha = flash ? 0.8 : 0.45;
        ctx.strokeStyle = flash ? "#ffb060" : "#ff5a20";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
    }

    die(game) {
      if (this.dead) return;
      this.dead = true;
      game.audio.play("win");
      game.embers.push(new JH.FxBurst(this.x, this.y, "boom-big", { scale: 0.9 }));
      spawnCoinFountain(game, this.x, this.y, this.def.suds);  // local fn in same IIFE
      game.onEnemyKilled(this);   // triggers Church.markBossDefeated("slayer")
    }
  }
  JH.SlayerBoss = SlayerBoss;

  // ---- Furnace: rhythm-based curated elite ----
  // Sustained spray causes it to heat up (reduced damage, visual glow), then
  // vent steam (knockback + burn). Burst-spray rhythm is the counter. No elite-
  // ramp (`tough: false` in its wave entry). Extends Enemy, adds onSprayHit().
  class Furnace extends Enemy {
    constructor(type, x, y) {
      super(type, x, y);
      this.continuousSprayT = 0;   // resets if spray pauses > 0.3s
      this.lastSprayT = -99;       // game time of last onSprayHit call
      this.heated = false;         // true during the vent wind-up
      this.heatT = -1;             // vent wind-up countdown (-1 = inactive)
      this.ventCdT = 0;            // post-vent cooldown
    }
    onSprayHit(dt, game) {
      if (this.ventCdT > 0) return;   // cooling: no damage taken, no heat built
      const d = this.def;
      this.lastSprayT = this.t;
      this.continuousSprayT += dt;
      if (this.heatT >= 0) return;  // already in vent wind-up, don't re-trigger
      if (JH.Balance.furnaceShouldVent(this.continuousSprayT, d.heatThreshold, this.ventCdT)) {
        this.heatT = d.ventWind;
        this.heated = true;
      }
    }
    takeDamage(dmg, game, dirX, knock) {
      if (this.ventCdT > 0) return;   // cooling: invulnerable until it settles
      // Apply heatedWaterMult when in the heated phase. `dmg` here is the raw
      // spray damage computed by doSpray; we scale it down for the vent window.
      const mult = this.heated ? this.def.heatedWaterMult : 1;
      super.takeDamage(dmg * mult, game, dirX, knock);
    }
    update(dt, game) {
      super.update(dt, game);   // base Enemy update (physics, contact, animate)
      const d = this.def;
      if (this.ventCdT > 0) this.ventCdT -= dt;
      // Stop spraying for > 0.3s and it cools down rapidly (not an instant reset) —
      // you must pause a beat to cool it off before it heats up, then resume.
      if (this.t - this.lastSprayT > 0.3 && this.continuousSprayT > 0)
        this.continuousSprayT = Math.max(0, this.continuousSprayT - d.coolRate * dt);
      // Vent wind-up countdown.
      if (this.heatT >= 0) {
        this.heatT -= dt;
        if (this.heatT <= 0) {
          // Vent fires — always show the visual, only apply effects in range.
          const pl = game.player;
          burst(game, this.x, this.y, 10, "#d0e8ff",        18, { speed: 150, life: 0.45, up: 70, size: 3 });
          burst(game, this.x, this.y, 4,  JH.PAL.firePatchHi, 10, { speed: 85, life: 0.4, up: 18, size: 2 });
          game.embers.push(new JH.FxBurst(this.x, this.y, "boom-mid", { scale: 0.75 }));
          game.shake(3);
          // Fire zone: venting scorches the ground around it — punishes the trigger.
          game.firePatches.push(new JH.FirePatch(this.x, this.y, d.ventPatchRadius, d.ventPatchDur));
          const ringN = 6, ringR = this.bodyW * 1.4;
          for (let i = 0; i < ringN; i++) {
            const a = (i / ringN) * Math.PI * 2;
            game.firePatches.push(new JH.FirePatch(
              this.x + Math.cos(a) * ringR,
              this.y + Math.sin(a) * ringR * JH.GROUND_RY,   // flattened in depth (2.5D)
              d.ventPatchRadius * 0.8, d.ventPatchDur));
          }
          // Same ellipse the wind-up telegraph draws (R, R*GROUND_RY).
          if (Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, this.bodyW * 4)) {
            const dir = pl.x >= this.x ? 1 : -1;
            pl.applyKnockback(dir, d.ventKnock);
            pl.applyBurn(d.ventBurnStacks);
            game.shake(2);
          }
          this.heatT = -1;
          this.heated = false;
          this.continuousSprayT = 0;
          this.ventCdT = d.ventCd;
        }
      }
    }
    think(dt, game) {
      // Slow melee chaser — inherits default Enemy.think() (no override needed).
      const pl = game.player, d = this.def;
      const dx = pl.x - this.x, dy = pl.y - this.y, dist = Math.hypot(dx, dy);
      this.facing = dx >= 0 ? 1 : -1;
      const sp = d.speed * (this.ventCdT > 0 ? d.cooldownSpeedMult : 1);
      if (dist > 18 && this.spawnGrace <= 0) {
        this.x += (dx / (dist || 1)) * sp * dt;
        this.y += (dy / (dist || 1)) * sp * dt * 0.7;
        this.state = "walk";
      } else { this.state = "idle"; }
    }
  }
  JH.Furnace = Furnace;

  Furnace.prototype.draw = function(ctx, cam) {
    const sx = this.x - cam, sy = Geo.feetScreenY(this.y, 0);
    const d = this.def;
    Assets.shadow(ctx, sx, sy, this.bodyW * 0.7);
    // Vent telegraph: about to blow — flashing danger ring (the knockback zone)
    // + "!" so you can back out of range.
    if (this.heatT >= 0) {
      const R = this.bodyW * 4;
      const prog = 1 - this.heatT / d.ventWind;   // 0 → 1 across the wind-up
      const flash = Math.floor(this.t * 16) & 1;
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.3 * prog;
      ctx.strokeStyle = flash ? "#fff" : "#ff5a2a"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(sx, sy, R, R * JH.GROUND_RY, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.10 + 0.20 * prog; ctx.fillStyle = "#ff3000";
      ctx.beginPath(); ctx.ellipse(sx, sy, R * prog, R * JH.GROUND_RY * prog, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      const hy = Geo.feetScreenY(this.y, this.z) - this.bodyH - 8;
      ctx.fillStyle = flash ? "#ff5a5a" : "#fff";
      ctx.font = "bold 12px monospace"; ctx.textAlign = "center";
      ctx.fillText("!", sx, hy); ctx.textAlign = "left";
    }
    // Cooling phase: hot, fast, untouchable — red-hot edge glow signals
    // "stop spraying, kite".
    const coolFp = 0.55 + 0.25 * Math.sin(this.t * 10);
    Assets.draw(ctx, "furnace", sx, Geo.feetScreenY(this.y, this.z), this.facing, {
      state: this.state, frame: this.frame, t: this.t,
      hurt: this.flashTimer > 0, hurtAlpha: this.flashTimer / 0.18,
      heat: Math.min(1, this.continuousSprayT / d.heatThreshold),
      heated: this.heated,
      scale: 1,
      outlines: this.ventCdT > 0
        ? [["#ffb020", coolFp], ["#ff5a20", coolFp * 0.55], ["#ff5a20", coolFp * 0.3]]
        : undefined,
    });
    if (this.hp < this.maxHp) {
      const w = this.bodyW + 4;
      const bx = Math.round(sx - w / 2), by = Math.round(sy - this.bodyH - 8);
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(bx, by, w, 3);
      ctx.fillStyle = "#ff5a5a"; ctx.fillRect(bx, by, Math.round(w * (this.hp / this.maxHp)), 3);
    }
  };

  JH.Smelt = Smelt;

  // ---- Fuse: fast rusher, fire-patch death burst ----
  // Dies in ~1.5s at full Jon DPS — the mechanic is WHERE it dies. Death
  // creates a FirePatch + applies 1 burn stack if Jon is in deathBurnRange.
  class Fuse extends Enemy {
    // Aerial drop-in entry: hidden during the stagger delay, then falls from
    // FUSE_DROP.height with a landing ring, slams on touchdown, then chases.
    beginDrop(delay) {
      this.dropping = true;
      this.dropWait = delay || 0;
      // With no stagger delay the fall must start NOW from height — assigning
      // z only when the wait crosses 0 made the first fuse of a wave "land"
      // on its first frame (z stayed 0) instead of dropping in.
      this.z = this.dropWait > 0 ? 0 : JH.FUSE_DROP.height;
      this.vz = 0;
    }
    update(dt, game) {
      if (this.dropping) {
        this.t += dt;
        if (this.dropWait > 0) {
          this.dropWait -= dt;
          if (this.dropWait <= 0) { this.z = JH.FUSE_DROP.height; this.vz = 0; }
          return;
        }
        // Falling — gravity only; inert (no think/contact) until it lands.
        this.vz -= JH.PLAYER.gravity * dt;
        this.z += this.vz * dt;
        if (this.z <= 0) {
          this.z = 0; this.vz = 0; this.dropping = false;
          this.spawnGrace = 0.25;
          const pl = game.player;
          burst(game, this.x, this.y, 4, JH.PAL.firePatchHi, 10, { speed: 90, life: 0.35, up: 40, size: 2 });
          game.shake(2);
          if (Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, JH.FUSE_DROP.slamRadius) && pl.z < 20)
            pl.takeHit(JH.FUSE_DROP.slamDmg, game, this.x);
        }
        return;
      }
      super.update(dt, game);
    }
    takeDamage(dmg, game, dirX, knock) {
      if (this.dropping) return;   // inert until landed
      super.takeDamage(dmg, game, dirX, knock);
    }
    die(game) {
      const d = this.def;
      game.firePatches.push(new JH.FirePatch(this.x, this.y, d.deathPatchRadius, d.deathPatchDur));
      game.embers.push(new JH.FxBurst(this.x, this.y, "boom-small", { scale: 1 }));
      burst(game, this.x, this.y, 5, JH.PAL.firePatch,   16, { speed: 130, life: 0.5, up: 70, size: 3 });
      game.shake(3);
      if (Geo.inGroundEllipse(game.player.x, game.player.y, this.x, this.y, d.deathBurnRange))
        game.player.applyBurn(1);
      super.die(game);
    }
  }
  JH.Fuse = Fuse;

  // Drop-in visuals: landing ring (shrinks as it falls) + the falling body.
  Fuse.prototype.draw = function (ctx, cam) {
    if (this.dropping) {
      if (this.dropWait > 0) return;               // not on screen yet
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, 0);
      const frac = Math.max(0, Math.min(1, this.z / JH.FUSE_DROP.height));  // 1 top → 0 land
      const r = JH.FUSE_DROP.slamRadius * (0.6 + 0.4 * frac);
      const flash = (Math.floor(this.t * 12) & 1);
      ctx.save();
      ctx.fillStyle = "rgba(255,110,40,0.10)";
      ctx.strokeStyle = flash ? "#ff8030" : "rgba(255,110,40,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(sx, sy, r, r * JH.GROUND_RY, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
      Assets.shadow(ctx, sx, sy, this.bodyW * 0.5 * (1 - frac * 0.5));
      Assets.draw(ctx, this.type, sx, Geo.feetScreenY(this.y, this.z), this.facing,
        { state: "walk", frame: this.frame, t: this.t });
      return;
    }
    JH.Enemy.prototype.draw.call(this, ctx, cam);
  };

  JH.makeEnemy = function (type, x, y) {
    if (type === "dummy") return new TargetDummy(x, y);
    if (type === "charger") return new Charger(type, x, y);
    if (type === "pyro") return new Pyro(type, x, y);
    if (type === "bulwark") return new Bulwark(type, x, y);
    if (type === "stalker") return new Stalker(type, x, y);
    if (type === "smelt") return new Smelt(type, x, y);
    if (type === "fuse") return new Fuse(type, x, y);
    if (type === "furnace") return new Furnace(type, x, y);
    if (type === "boss") return new Boss(x, y);
    if (type === "switch") return new SwitchBoss(x, y);
    if (type === "quake") return new QuakeBoss(x, y);
    if (type === "slayer") return new SlayerBoss(x, y);
    if (type === "gatewaykrusher") return new GatewayKrusherBoss(x, y);
    if (type === "wallboss") return new WallBoss(x, y);
    if (type === "neighbor") return new NeighborNPC(x, y);
    return new Enemy(type, x, y);
  };
})();
