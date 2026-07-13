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
      this.dashGraceT = 0;         // post-dash i-frames (Pillar of Air III), set at dash end
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
      this.pressureBuffT = 0;      // Prayer Bead pressure buff, sec remaining
      this.kibbleTimer = 0;        // Kibble: HP regen over 6 s while > 0
      this.kibbleRegen = 0;        // HP/s during regen
      this.kibbleTickT = 0;        // seconds until the next +N floater tick
      this.kibbleTickAcc = 0;      // HP healed since the last floater tick
      this.gushRegenT = 0;         // GUSH milestone: water regen window (sec)
      this.gushRegenRate = 0;      // water/s while the window is live
      this.gushTickT = 0;          // seconds until the next +N water floater tick
      this.gushTickAcc = 0;        // water regenerated since the last floater tick
      this.burnStacks = 0;   // active burn stacks (0–3); cleared when burnTimer expires
      this.burnTimer = 0;    // seconds of burn remaining
      this.douseCdT = 0;     // Ash Walk: cooldown before the next patch-douse steam pop
      this.boilerTarget = null;    // Boiler Coil: enemy the stream has stayed on
      this.boilerHeat = 0;         // s of continuous same-target spray, resets on switch/gap
      this.boilerGapT = 0;         // s since the stream last touched boilerTarget (resets heat past boilerGap)
      this.bodyW = this.stats.bodyW;
      this.alive = true;
      this.nearShop = false;
      this.shopWheelFocus = false;   // set by game.js: shop cursor is on the relic wheel row (left/right = card nav)
      this.zoneSlow = 1;      // ground-zone walk-speed multiplier (SlowZone); reset every frame in game.js
      this.stormT = 0;        // Eye of the Storm: guaranteed-dodge window remaining (consumed elsewhere)
      this.upgradeQ = [];     // pending stat-gain sequence entries {icon, text}
      this.upgradeT = 0;      // time left on the entry currently showing
      this.upgradeIdx = 0;    // entries played this burst — drives the pitch ladder
      this.freeSprayT = 0;    // Slipstream: spray drains no water while this is > 0
      this.xpFlashT = 0;      // overhead XP bar visibility: set on XP gain, fades out
      this.sermonReady = false;  // Pressure Sermon: this hold has sprayed >= SERMON.charge s (pip shown)
      this.overshield = 0;       // Deepdive shield: banked past-full kibble healing; soaks damage, never recharges
      this.stillT = 0;        // Standing Stone: seconds stationary (no move input, not dashing)
      this.vigorT = 0;        // Bedrock Vigor: +20% knockback window after taking a hit, sec remaining
    }
    applyStats(s) {
      // Track which displayed stats changed so the shop panel can flash them,
      // and queue the upgrade sequence (icon + delta rising off Jon) for each
      // stat that GREW — every gain source routes through here.
      const KEYS = ["sprayDamage", "sprayRange", "maxWater", "waterRegen",
                    "moveRegen", "moveSpeed", "dodgeChance", "vampiricRate",
                    "maxHp", "knockback"];
      const META = {
        sprayDamage: ["dmg", "DMG"], sprayRange: ["range", "RANGE"],
        maxWater: ["water", "WATER"], waterRegen: ["regen", "REGEN"],
        moveRegen: ["regen", "REGEN"], maxHp: ["hp", "HP"],
        moveSpeed: ["speed", "SPEED"], knockback: ["knockback", "KB"],
        dodgeChance: ["dodge", "DODGE"], vampiricRate: ["vamp", "VAMP"],
      };
      if (this.stats) {
        this.statFlash = this.statFlash || {};
        for (const k of KEYS) {
          if (s[k] === this.stats[k]) continue;
          this.statFlash[k] = 2.0;
          const delta = s[k] - this.stats[k];
          if (delta > 0 && this.upgradeQ.length < 8) {
            const pct = k === "dodgeChance" || k === "vampiricRate";
            const amt = pct ? Math.round(delta * 100) + "%" : "+" + Math.round(delta);
            this.upgradeQ.push({ icon: META[k][0], text: (pct ? "+" + amt : amt) + " " + META[k][1] });
          }
        }
      }
      this.stats = s; this.bodyW = s.bodyW; if (this.hp > s.maxHp) this.hp = s.maxHp;
    }

    applyBurn(n) {
      // Burn stacks have i-frames like hits: one application, then immune to
      // new stacks for the invuln window (overlapping fire can't insta-max).
      // Returns whether the stack landed so sources can retry, not skip ahead.
      if (this.burnGraceT > 0) return false;
      this.burnGraceT = this.stats.invuln + ((JH.Game && JH.Game.relics && JH.Game.relics.asbestos_socks) ? JH.RELIC_TUNE.socksGraceBonus : 0);
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

    // Transient buff windows only tick in the play state, so they freeze
    // through the Church and would resume after respawn (same class of bug as
    // burn-carry). Called next to clearBurn on the death→respawn path.
    clearBuffs() {
      this.kibbleTimer = 0; this.kibbleRegen = 0;
      this.concertaTimer = 0; this.pressureBuffT = 0;
      this.gushRegenT = 0; this.gushRegenRate = 0;
      this.freeSprayT = 0;
      this.stormT = 0; this.vigorT = 0;
      this.douseCdT = 0; this.dashGraceT = 0;
      this.boilerTarget = null; this.boilerHeat = 0; this.boilerGapT = 0;
      this.overshield = 0;   // dive shield doesn't survive death
    }

    // Deepdive overshield soaks damage first — depletes, never recharges.
    // Returns the damage remaining after the soak.
    soakOvershield(dmg) {
      if (!(this.overshield > 0) || dmg <= 0) return dmg;
      const soak = Math.min(this.overshield, dmg);
      this.overshield -= soak;
      return dmg - soak;
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
        // burnTakenMult (Pillar of Fire): scales burn damage Jon takes (<1).
        const hpBefore = this.hp;
        const socksOwned = !!(game.relics && game.relics.asbestos_socks);
        this.hp = Math.max(0, this.hp - this.soakOvershield(
          JH.Balance.burnTickDps(this.burnStacks, socksOwned) * this.burnTickT * (this.stats.burnTakenMult || 1)));
        this.burnTickT = 0;
        this.hurt(true);
        burst(game, this.x, this.y, 20, JH.PAL.flame, 3, { speed: 30, life: 0.35, up: 40 });
        // Red -N floater for the burn tick (mirrors the kibble/gush +N ticks).
        const lost = Math.round(hpBefore - this.hp);
        if (lost > 0 && game.float) game.float(this.x, this.y - 30, "-" + lost, "#ff5030");
        if (this.hp <= 0) this.alive = false;
      }
      if (expired) { this.burnTimer = 0; this.burnStacks = 0; this.burnTickT = 0; }
    }

    update(dt, game) {
      const In = game.input, S = this.stats;
      this.basePhysics(dt);
      if (this.invulnTimer > 0) this.invulnTimer -= dt;
      if (this.burnGraceT > 0) this.burnGraceT -= dt;
      if (this.dashGraceT > 0) this.dashGraceT -= dt;
      if (this.dashCdTimer > 0) this.dashCdTimer -= dt;
      if (this.meleeCdTimer > 0) this.meleeCdTimer -= dt;
      if (this.regenLock > 0) this.regenLock -= dt;
      if (this.pressureBuffT > 0) this.pressureBuffT -= dt;
      if (this.douseCdT > 0) this.douseCdT -= dt;
      if (this.freeSprayT > 0) this.freeSprayT -= dt;
      if (this.xpFlashT > 0) this.xpFlashT -= dt;
      if (this.stormT > 0) this.stormT -= dt;
      if (this.vigorT > 0) this.vigorT -= dt;
      // Boiler Coil: a gap in the stream longer than boilerGap drops the heat
      // (doSpray zeroes boilerGapT every frame it fires; this only fires it up).
      if (this.boilerGapT != null) {
        this.boilerGapT += dt;
        if (this.boilerGapT > JH.RELIC_TUNE.boilerGap) { this.boilerTarget = null; this.boilerHeat = 0; }
      }
      if (this.statFlash)
        for (const k in this.statFlash)
          if ((this.statFlash[k] -= dt) <= 0) delete this.statFlash[k];

      // Deputy Sprinkler: tank-mounted auto-jet — flat dps on the nearest enemy
      // in short range. Free (no water); depth counts double like the hit band.
      if (game.relics && game.relics.deputy_sprinkler && this.alive) {
        const T = JH.RELIC_TUNE;
        let best = null, bestD = T.sprinklerRange;
        for (const e of game.enemies) {
          if (e.dead || e.dropping) continue;
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
          const d = Math.hypot(e.x - this.x, (e.y - this.y) * 2.4);
          if (d < bestD) { bestD = d; best = e; }
        }
        if (best) {
          best.takeDamage(T.sprinklerDps * (best.def ? (best.def.waterMult || 1) : 1) * dt,
            game, Math.sign(best.x - this.x) || 1, 0);
          this.sprinklerT = (this.sprinklerT || 0) + dt;
          if (this.sprinklerT > 0.06) {                     // droplet arc toward the target
            this.sprinklerT = 0;
            game.particles.push(new Particle({
              x: this.x - this.facing * 6, y: this.y, z: this.z + 36,
              vx: (best.x - this.x) * 2.2, vy: (best.y - this.y) * 2.2,
              vz: 30, life: 0.4, color: JH.PAL.water, size: 2, grav: 160,
            }));
          }
        }
      }

      // Upgrade sequence: pending stat gains play one at a time — chime up a
      // pitch ladder, gold sparks, icon + delta drawn in Player.draw.
      if (this.upgradeQ.length) {
        if (this.upgradeT <= 0) {
          this.upgradeT = JH.JUICE.upgradeBeat;   // beat length (config; draw fade derives from the same knob)
          this.upgradeIdx++;
          game.audio.play("upgrade", { pitch: 1 + 0.12 * Math.min(5, this.upgradeIdx) });
          burst(game, this.x, this.y, this.z + 22, "#ffd23f", 8, { speed: 55, life: 0.4, up: 55, size: 2 });
        }
        this.upgradeT -= dt;
        if (this.upgradeT <= 0) {
          this.upgradeQ.shift();
          if (!this.upgradeQ.length) this.upgradeIdx = 0;
        }
      }

      this.tickBurn(dt, game);

      // ---- movement vector
      // Deepdive TV: seated Jon doesn't walk or spray (tickDeepdive still
      // reads the raw move/confirm keys directly to detect the bail).
      const wantSpray = !game.deepdiving && In.held("spray") && this.dashTimer <= 0;
      // Suppress horizontal movement while the shop cursor is on the wheel
      // row — left/right is card navigation there. Off the wheel row, walking
      // out of the shop with left/right still works. Dash is never suppressed.
      let mx = (this.shopWheelFocus || game.deepdiving) ? 0 : ((In.held("right") ? 1 : 0) - (In.held("left") ? 1 : 0));
      // Suppress vertical movement when near shop — up/down is used for shop navigation.
      let my = (this.nearShop || game.deepdiving) ? 0 : ((In.held("down") ? 1 : 0) - (In.held("up") ? 1 : 0));
      // Facing is LOCKED while spraying so you can back-pedal and keep aim.
      if (mx !== 0 && !wantSpray) this.facing = mx > 0 ? 1 : -1;
      if (this.meleeFxTimer > 0) this.meleeFxTimer -= dt;

      // Standing Stone: stillT counts seconds with no movement input and no
      // dash in flight; any movement or dash resets it to 0.
      if (mx !== 0 || my !== 0 || this.dashTimer > 0) this.stillT = 0;
      else this.stillT += dt;
      if (this.stillT >= 0.5 && this.beneRank("standing_stone") && Math.random() < 3 * dt)
        burst(game, this.x + (Math.random() - 0.5) * 8, this.y, 1, JH.PAL.suds, 1,
          { speed: 10, life: 0.5, up: 22, grav: 40, size: 1 });

      // ---- dash boost timer + trailing particles
      if (this.concertaTimer > 0) {
        this.concertaTimer -= dt;
        // Concerta refills the tank really fast for its whole duration —
        // spraying or not (the spray drain is also suppressed while active).
        this.water = Math.min(S.maxWater, this.water + S.maxWater * dt);
      }
      if (this.kibbleTimer > 0) {
        // Deepdive: the world sim stays 1x — the "fast-forward" is the
        // KIBBLE running at maxScale while seated (drain + heal together),
        // with healing past full HP converting to overshield (soaks damage
        // first, never recharges) — capped at DEEPDIVE.shieldCap.
        const kMult = game.deepdiving ? JH.DEEPDIVE.maxScale : 1;
        const kdt = Math.min(this.kibbleTimer, dt * kMult);   // never burn past the bank
        this.kibbleTimer -= kdt;
        const before = this.hp;
        this.hp = Math.min(this.stats.maxHp, this.hp + this.kibbleRegen * kdt);
        this.kibbleTickAcc += this.hp - before;
        if (game.deepdiving) {
          const spill = Math.max(0, this.kibbleRegen * kdt - (this.hp - before));
          this.overshield = Math.min(JH.DEEPDIVE.shieldCap, (this.overshield || 0) + spill);
        }
        this.kibbleTickT -= dt;
        if (this.kibbleTickT <= 0) {
          this.kibbleTickT += 0.5;
          const healed = Math.round(this.kibbleTickAcc);
          if (healed > 0 && game.float) game.float(this.x, this.y - 30, "+" + healed, "#44ee66");
          this.kibbleTickAcc = 0;
        }
      }
      // GUSH milestone water regen — independent of the regular regen delay.
      if (this.gushRegenT > 0) {
        this.gushRegenT -= dt;
        const wBefore = this.water;
        this.water = Math.min(S.maxWater, this.water + this.gushRegenRate * dt);
        // Blue +N water floater every 0.5s (mirrors the kibble +N heal tick).
        this.gushTickAcc += this.water - wBefore;
        this.gushTickT -= dt;
        if (this.gushTickT <= 0) {
          this.gushTickT += 0.5;
          const gained = Math.round(this.gushTickAcc);
          if (gained > 0 && game.float) game.float(this.x + 10, this.y - 30, "+" + gained, "#55c8ff");
          this.gushTickAcc = 0;
        }
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
        this._dashTouched = new Set();   // Backdraft: enemies scalded this dash
        this._gustTouched = new Set();   // Whirlwind Walk: enemies gusted this dash
        this._dashDist = 0;   // Firestorm: distance travelled since the last trail patch
        game.audio.play("dash");
        if (S.dashBoostDur > 0) this.dashBoostTimer = S.dashBoostDur;
        // Baptismal Wake: dash leaves an enemy-slowing puddle; rank II also
        // soaks enemies standing in it (see SlowZone's vsEnemies comment).
        const wakeRank = this.beneRank("baptismal_wake");
        if (wakeRank && game.slowZones)
          game.slowZones.push(new JH.SlowZone(this.x, this.y, 16, 3,
            { vsEnemies: true, slowMult: 0.7, dmgAmp: wakeRank >= 2 ? 1.1 : 1 }));
      }
      let speed = S.moveSpeed * this.zoneSlow;   // ground-zone slow; dash below overrides this entirely
      if (this.beneRank("tailwind"))
        speed *= 1 + Math.min(this.beneRank("tailwind") >= 2 ? 0.30 : 0.20, 0.02 * (game.combo || 0));
      if (this.stormT > 0 && this.beneRank("eye_of_storm") >= 2) speed *= 1.15;
      if (this.dashTimer > 0) {
        this.dashTimer -= dt;
        mx = this._dashX; my = this._dashY; speed = S.dashSpeed;
        // Backdraft: enemies the dash body overlaps get Scalded, each enemy
        // only once per dash (tracked by _dashTouched, cleared on the next dash).
        const bdRank = this.beneRank("backdraft");
        if (bdRank) {
          for (const e of game.enemies) {
            if (e.dead || this._dashTouched.has(e)) continue;
            if (e.dropping) continue;   // airborne drop-ins can't be hit
            if (!Geo.bodiesOverlap(this, e)) continue;
            this._dashTouched.add(e);
            e.applyScald(JH.SCALD.dps, JH.SCALD.dur);
            if (bdRank >= 2) e.takeDamage(8, game, this.facing, 60);
          }
        }
        // Whirlwind Walk: the dash body destroys projectiles it touches
        // (isProjectile whitelist — Ember/Fireball/SmeltBomb/Rock/ShieldLob;
        // boss patterns, KillPops and other FX riders are never swept) and
        // gusts overlapping non-boss enemies aside, each once per dash
        // (own _gustTouched set — independent of Backdraft's).
        if (this.beneRank("whirlwind_walk")) {
          for (const em of game.embers) {
            if (!em.isProjectile || em.dead) continue;
            if (Math.hypot(em.x - this.x, em.y - this.y) >= 14) continue;
            em.dead = true;
            burst(game, em.x, em.y, em.z || 0, "#ffffff", 6, { speed: 60, life: 0.25, up: 20 });
          }
          for (const e of game.enemies) {
            if (e.dead || e.isBoss || e.dropping || this._gustTouched.has(e)) continue;
            if (!Geo.bodiesOverlap(this, e)) continue;
            this._gustTouched.add(e);
            e.applyKnockback(this.facing, 140);
            e.takeDamage(15, game, this.facing, 0);
          }
        }
        // Dash expiry: post-dash i-frame grace (Pillar of Air III) and
        // Slipstream's short free-water spray window.
        if (this.dashTimer <= 0) {
          this.dashGraceT = S.dashIframeBonus || 0;
          const ssRank = this.beneRank("slipstream");
          if (ssRank) this.freeSprayT = ssRank >= 2 ? 0.8 : 0.5;
        }
        // Firestorm: dash trail — a friendly (harmless-to-Jon) fire patch
        // every 24px of dash travel.
        if (this.beneRank("firestorm")) {
          this._dashDist = (this._dashDist || 0) + S.dashSpeed * dt;
          while (this._dashDist >= 24) {
            this._dashDist -= 24;
            JH.spawnFirePatch(game, this.x, this.y, 12, 1.0, { friendly: true });
          }
        }
      } else if (this.spraying) {
        if (!S.noSpraySlow) speed *= 0.55; // slow while hosing (Sure Grip removes this)
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
      else {
        // Pressure Sermon: releasing an armed hold (>= SERMON.charge seconds
        // of continuous non-dry spray — the pip shows the armed state) looses
        // a forward-traveling water wave. Checked here, before sprayHeldT is
        // zeroed below, so it fires exactly once per qualifying hold/release.
        if (this.beneRank("pressure_sermon") && this.sermonReady) {
          game.sermonWaves.push({
            x: this.x + this.facing * 12, y: this.y, dir: this.facing,
            traveled: 0, hit: new Set(),
          });
          burst(game, this.x + this.facing * 20, this.y, 16, JH.PAL.waterHi, 18,
            { speed: 150, life: 0.35, up: 40, size: 2 });
          game.shake(3);
          game.audio.play("blast");
        }
        this.sprayHeldT = 0;   // reset the stream-front timer on release
        this.sermonReady = false;
      }

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
              // Spigot Key: heals only while the hydrant is actively refilling
              // (full tank = no heal, so hydrants can't be camped for HP).
              if (game.relics && game.relics.spigot_key)
                this.hp = Math.min(S.maxHp, this.hp + JH.RELIC_TUNE.spigotHealRate * dt);
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

      // ---- solid shop props (vendor, deepdive TV): elliptical feet pushout,
      // player-only. Re-clamp after so the rim never shoves Jon out of bounds.
      const props = [];
      if (game.shopNpc) props.push([game.shopNpc, JH.SHOP.vendorCollideR]);
      if (game.deepdiveTV) props.push([game.deepdiveTV, JH.DEEPDIVE.tvCollideR]);
      for (const [pr, r] of props) {
        const out = JH.Balance.propPushout(this.x, this.y, pr.x, pr.y, r);
        if (out) {
          this.x = clamp(out.x, game.bounds.minX, game.bounds.maxX);
          this.y = Geo.clampDepth(out.y);
        }
      }

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
      // pressureFloor (Pillar of Water III): never drop below the mid tier
      // while any water remains — dry still sputters, 80%+ still gets bonus.
      else if (frac >= 0.25 || S.pressureFloor) { dmgScale = 1.00; rangeMult = 1.00; }
      else                   { dmgScale = 0.40; rangeMult = 0.55; }
      // Pressure Sermon: arms after SERMON.charge seconds of continuous
      // non-dry spray — no pressure-tier requirement (a tier gate made it
      // near-unfireable: 100 tank / 36 drain keeps the top tier only ~0.56s).
      // The pip in draw() shows the armed state; release fires the wave.
      if (this.beneRank("pressure_sermon") && !dry && this.sprayHeldT >= JH.SERMON.charge)
        this.sermonReady = true;
      if (!dry && this.concertaTimer <= 0 && this.freeSprayT <= 0) this.water = Math.max(0, this.water - S.waterDrain * dt);
      // (Concerta refill is handled in update() so the tank fills whether or not spraying.)

      // Standing Stone: braced turret stance while still — bonus damage and a
      // wider effective stream (particles only; sprayHitBand/stats untouched).
      const standingStone = this.stillT >= 0.5 && this.beneRank("standing_stone");
      const sprayWidth = S.sprayWidth + (standingStone ? 4 : 0);

      const ox = this.x + this.facing * 12;   // nozzle x (world)
      const oy = this.y;                       // nozzle depth
      const oz = this.z + JH.PLAYER.nozzleZ;   // nozzle height — static, matches new sprite
      const reach = S.sprayRange * rangeMult;  // range shrinks with pressure
      this._dbgReach = reach;   // live value for the KeyH hitbox overlay
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
            if (!Geo.inSprayPath(ox, this.y, oz, e, this.facing, reach, S.sprayHitBand)) continue;
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
            if (!Geo.inSprayPath(ox, this.y, oz, s, this.facing, reach, S.sprayHitBand)) continue;
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
        const perpY = (Math.random() - 0.5) * sprayWidth * spread;  // depth jitter
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
            y: oy + (Math.random() - 0.5) * sprayWidth * 0.5,
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

      // Damage enemies: non-pierce hits only the closest (blocker);
      // pierce hits everyone EXCEPT anyone standing behind a planted shield's wall.
      // (`blocker` can only ever be an enemy in non-pierce mode, or a
      // DeployedShield in pierce mode — see the blocker-finding block above,
      // so `e` here — always drawn from game.enemies — can never equal a
      // pierce-mode `blocker`.)
      let didHit = false;
      const hitEnemies = [];
      let healAmt = 0;
      const ssRank = this.beneRank("split_stream");
      const scaldRank = this.beneRank("scalding_faith");
      // Benediction damage-amp inputs, hoisted: ranks and tank fraction are
      // loop-invariant (only wet/burning vary per target). All-zero ranks
      // skip the multiplier (and the fire-patch scan) entirely.
      const beneRanks = {
        overflow: this.beneRank("overflow"), baptize: this.beneRank("baptize"),
        trial: this.beneRank("trial_by_fire"),
      };
      const anyBene = beneRanks.overflow || beneRanks.baptize || beneRanks.trial;
      const waterFrac = this.water / S.maxWater;
      const blockerFwd = blocker ? (blocker.x - ox) * this.facing : Infinity;
      // Brass Nozzle: flat dmg add to the nearest-forward enemy hit this frame
      // (in pierce mode `blocker` is shield-only, so scan with the loop's filters).
      const nozzleAdd = (game.relics && game.relics.brass_nozzle) ? JH.RELIC_TUNE.brassNozzleAdd : 0;
      let nozzleTarget = null;
      if (nozzleAdd) {
        if (!pierce) nozzleTarget = blocker;   // non-pierce: nearest in-arc enemy IS the blocker
        else {
          let bestFwd = Infinity;
          for (const e of game.enemies) {
            if (e.dead || e.dropping) continue;
            if (!Geo.inSprayPath(ox, this.y, oz, e, this.facing, reach, S.sprayHitBand)) continue;
            const fwd = (e.x - ox) * this.facing;
            if (blocker && fwd > blockerFwd) continue;
            if (game.shields) {
              let sheltered = false;
              for (const s of game.shields) {
                if (s.dead || !s.radius || !s.active) continue;
                if (!insideDome(s, e.x, e.y)) continue;
                if (!insideDome(s, this.x, this.y)) { sheltered = true; break; }
              }
              if (sheltered) continue;
            }
            if (fwd < bestFwd) { bestFwd = fwd; nozzleTarget = e; }
          }
        }
      }
      // Gather pass: every filter (dead/dropping/arc/blocker/dome-shelter)
      // decides WHO gets hit; the apply pass below decides HOW HARD. Pierce
      // sorts nearest-first so the falloff ladder (Hydro Lance) reads off
      // hit order regardless of game.enemies' array order.
      const targets = [];
      for (const e of game.enemies) {
        if (e.dead) continue;
        if (e.dropping) continue;   // airborne drop-ins can't be hit
        if (!Geo.inSprayPath(ox, this.y, oz, e, this.facing, reach, S.sprayHitBand)) continue;
        if (!pierce && e !== blocker) continue;
        const fwd = (e.x - ox) * this.facing;
        if (pierce && blocker && fwd > blockerFwd) continue;
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
        targets.push({ e, fwd });
      }
      if (pierce) targets.sort((p, q) => p.fwd - q.fwd);
      const LF = JH.RELIC_TUNE.lanceFalloff;
      targets.forEach(({ e }, idx) => {
        // Hydro Lance: pierce damage fades down the hit line (ladder repeats
        // its last entry past its length); non-pierce hits take falloff 1.
        const falloff = pierce ? LF[Math.min(idx, LF.length - 1)] : 1;
        const mult = e.def ? (e.def.waterMult || 1) : 1;
        const pressureMult = this.pressureBuffT > 0 ? JH.RELIC_TUNE.prayerBeadMult : 1;
        const beneMult = anyBene ? JH.Balance.beneDmgMult(beneRanks, {
          waterFrac, wet: e.wetness || 0,
          burning: (e.scaldT || 0) > 0 || (beneRanks.trial > 0 && enemyInFire(game, e)),
        }) : 1;
        const ssMult = standingStone ? 1.25 : 1;   // Standing Stone: braced spray hits harder
        const leashAdd = (game.relics && game.relics.dog_leash && (e.state === "charge" || e.state === "lunge"))
          ? JH.RELIC_TUNE.leashLungeBonus : 0;
        const rosaryAdd = (game.relics && game.relics.rosary_chain && game.rosaryBonus) ? game.rosaryBonus : 0;
        const flatDmg = S.sprayDamage + (e === nozzleTarget ? nozzleAdd : 0) + leashAdd + rosaryAdd;
        const dmg = flatDmg * falloff * dmgScale * mult * pressureMult * beneMult * ssMult * dt;
        e.takeDamage(dmg, game, this.facing, 0);
        // Scald: full-pressure hits only. Scalding Faith (rank-scaled) and the
        // fire pillar's baseline capstone are independent sources — both can land.
        if (scaldRank && dmgScale >= 1.2) {
          e.applyScald(...(scaldRank >= 2 ? [JH.SCALD.dps2, JH.SCALD.dur2] : [JH.SCALD.dps, JH.SCALD.dur]));
        }
        if (this.stats.baselineScald && dmgScale >= 1.2) e.applyScald(JH.SCALD.dps, JH.SCALD.dur);
        if (e.onSprayHit) e.onSprayHit(dt, game);
        e.applyKnockback(this.facing, S.knockback * dt * 2.2 * (this.vigorT > 0 ? 1.2 : 1), (e.y - this.y) * 0.02);
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
        if (ssRank) hitEnemies.push(e);
      });
      const primary = targets.length ? targets[0].e : null;  // nearest hit enemy (Boiler Coil hooks this)
      // Boiler Coil: heat builds while the stream stays on one target.
      if (!dry && game.relics && game.relics.boiler_coil) {
        const T = JH.RELIC_TUNE;
        if (primary === this.boilerTarget && primary) this.boilerHeat += dt;
        else { this.boilerTarget = primary; this.boilerHeat = 0; }
        this.boilerGapT = 0;
        if (primary && this.boilerHeat >= T.boilerHeatTime) {
          primary.takeDamage(T.boilerBonus * dmgScale * dt, game, this.facing, 0);
          for (const e of game.enemies) {                    // splash: same radius the FX shows
            if (e.dead || e === primary) continue;
            if (!Geo.inGroundEllipse(e.x, e.y, primary.x, primary.y, T.boilerSplashR, T.boilerSplashR * 0.34)) continue;
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
            e.takeDamage(T.boilerSplash * dmgScale * dt, game, this.facing, 0);
          }
          if (Math.random() < 12 * dt)                       // steam/ember flecks mark the superheat
            burst(game, primary.x, primary.y, primary.z + 14, JH.PAL.flame, 2, { speed: 40, life: 0.3, up: 30 });
        }
      }
      // Vampiric Hose: convert a fraction of spray damage into HP.
      if (healAmt > 0) this.hp = Math.min(S.maxHp, this.hp + healAmt);
      // Split Stream: 50% damage arc from each hit enemy to its closest
      // nearby enemies — rank I picks 1 secondary, rank II picks 3.
      if (ssRank && hitEnemies.length > 0) {
        const maxSecondaries = ssRank >= 2 ? 3 : 1;
        for (const primary of hitEnemies) {
          const nearby = game.enemies.filter((e) =>
            !e.dead && !e.dropping && e !== primary && !hitEnemies.includes(e)
            && Math.hypot(e.x - primary.x, e.y - primary.y) <= 80);
          nearby.sort((a, b) =>
            Math.hypot(a.x - primary.x, a.y - primary.y) - Math.hypot(b.x - primary.x, b.y - primary.y));
          for (const e of nearby.slice(0, maxSecondaries)) {
            const m2 = e.def ? (e.def.waterMult || 1) : 1;
            e.takeDamage(S.sprayDamage * dmgScale * m2 * dt * 0.50, game, this.facing, 0);
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
      const steamRank = this.beneRank("steam_sermon");
      if (game.firePatches) {
        for (const fp of game.firePatches) {
          if (fp.dead) continue;
          const fwd = (fp.x - ox) * this.facing;
          if (fwd > 0 && fwd - this.bodyW * 0.5 - fp.radius <= reach
              && Math.abs(fp.y - oy) < JH.FIRE.douseBand) {
            // Douse speed scales with spray damage (built-up hoses put fires
            // out faster); clamped so a weak/low-pressure stream never douses
            // slower than the old flat rate.
            const douseMult = JH.FIRE.douseDmgScale
              ? Math.max(1, (S.sprayDamage * dmgScale) / JH.PLAYER.sprayDamage) : 1;
            fp.sprayProgress += dt * douseMult;
            // Steam Sermon: spraying a lit patch also vents a damaging steam
            // cloud over its footprint, cooking any enemy standing in it.
            if (steamRank) {
              for (const e of game.enemies) {
                if (e.dead) continue;
                if (Geo.inGroundEllipse(e.x, e.y, fp.x, fp.y, fp.footprint().rx + 6))
                  e.takeDamage(12 * dt, game, 0, 0);
              }
              if (Math.random() < 20 * dt)
                burst(game, fp.x, fp.y, 10, "#ffffff", 1,
                  { speed: 30, life: 0.4, up: 40, grav: -20, size: 1 });
            }
          }
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
          e.applyKnockback(this.facing, S.meleeKnock * (this.vigorT > 0 ? 1.2 : 1), (e.y - this.y) * 0.1);
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
      if (this.invulnTimer > 0 || this.dashTimer > 0 || this.dashGraceT > 0) return;
      if (this.stormT > 0) {
        burst(game, this.x, this.y, this.z + 10, "#aaddff", 8, { speed: 80, life: 0.35, up: 20 });
        this.invulnTimer = 0.3;
        return;
      }
      if (this.stats.dodgeChance > 0 && Math.random() < this.stats.dodgeChance) {
        burst(game, this.x, this.y, this.z + 10, "#aaddff", 8, { speed: 80, life: 0.35, up: 20 });
        this.invulnTimer = 0.3;
        return;
      }
      dmg = this.soakOvershield(dmg);
      this.hp -= dmg;
      this.invulnTimer = this.stats.invuln;
      this.hurt();
      if (this.beneRank("bedrock")) this.vigorT = 3;   // Bedrock Vigor: +20% knockback window
      const dir = this.x < fromX ? -1 : 1;
      // Standing Stone: braced turret stance eats the knockback; damage still lands.
      if (!(this.stillT >= 0.5 && this.beneRank("standing_stone"))) this.applyKnockback(dir, 90);
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
      if (JH.Game && JH.Game.deepdiving) {
        // Seated pose while watching the deepdive TV (hand-supplied frame).
        Assets.draw(ctx, "jonSit", sx, spriteSy, this.facing, { t: this.t });
      } else {
        Assets.draw(ctx, "jon", sx, spriteSy, this.facing, {
          state: this.state, frame: this.frame, t: this.t,
          hurt: this.invulnTimer > 0 && this.flashTimer > 0,
          hurtAlpha: this.flashTimer / 0.18,
          squash: this.squashT > 0 ? Math.min(1, this.squashT / JH.JUICE.squashDur) : 0,
          waterFrac: Math.max(0, Math.min(1, this.water / this.stats.maxWater)),
          walking: this.walking,
          outlines,
        });
      }
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

      // Pressure Sermon pip: pulsing water diamond at the nozzle side while
      // the hold is armed — "release now" reads at a glance.
      if (this.sermonReady) {
        const px2 = sx + this.facing * 15, py2 = spriteSy - 30;
        const p = 2.5 + Math.sin(this.t * 10) * 0.8;
        ctx.save();
        ctx.translate(px2, py2); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = JH.PAL.waterHi; ctx.fillRect(-p, -p, p * 2, p * 2);
        ctx.strokeStyle = "#eaffff"; ctx.lineWidth = 1; ctx.strokeRect(-p, -p, p * 2, p * 2);
        ctx.restore();
      }

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
      // Deepdive overshield: translucent PURPLE halo laid over the healthbar
      // from the left, width = shield fraction of maxHp — reads as an aura
      // around the bar, not a second fill.
      if (this.overshield > 0) {
        const sw = Math.max(2, Math.round(barW * Math.min(1, this.overshield / this.stats.maxHp)));
        ctx.save();
        ctx.fillStyle = "rgba(196,110,255,0.22)";
        ctx.fillRect(bx - 2, barTop - 3, sw + 4, 9);          // soft outer halo
        ctx.fillStyle = "rgba(196,110,255,0.38)";
        ctx.fillRect(bx - 1, barTop - 2, sw + 2, 7);          // brighter core wash
        ctx.strokeStyle = "rgba(224,170,255,0.8)"; ctx.lineWidth = 1;
        ctx.strokeRect(bx - 1.5, barTop - 2.5, sw + 3, 8);    // crisp rim so the extent reads
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
      // XP: sits ABOVE the HP bar (grows away from Jon's head) only while
      // xpFlashT runs (set on gain), fading over its last 0.5s.
      const xpShown = this.xpFlashT > 0 && JH.Game && JH.Game.playerLevel != null;
      if (xpShown) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, this.xpFlashT / 0.5);
        const xf = Math.min(1, JH.Game.playerXp / JH.Balance.xpForLevel(JH.Game.playerLevel + 1));
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.fillRect(bx - 1, barTop - 5, barW + 2, 4);
        ctx.fillStyle = "#443300";
        ctx.fillRect(bx, barTop - 4, barW, 2);
        ctx.fillStyle = "#ffd23f";
        ctx.fillRect(bx, barTop - 4, Math.round(barW * xf), 2);
        ctx.restore();
      }
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
      // Status indicators above bars — indY is a running baseline cursor:
      // it starts above whatever the XP bar occupies (sliding down in sync
      // with its fade) and every row claims 7px, so rows never overlap the
      // XP bar or each other.
      let indY = barTop - 2;
      if (xpShown) indY -= Math.round(6 * Math.min(1, this.xpFlashT / 0.5));
      // Upgrade sequence: the current stat gain claims the first status row —
      // icon + green delta ABOVE the bars, in front of everything, kept clear
      // of the XP bar and other rows by the same indY cursor that stacks
      // KIBBLE/FOCUSED/BURN (never mid-sprite, never behind the body).
      if (this.upgradeQ.length && this.upgradeT > 0) {
        const e = this.upgradeQ[0];
        const k = 1 - this.upgradeT / JH.JUICE.upgradeBeat;       // 0 → 1
        // Quick fade-in, long readable hold, fade-out only in the last ~15%
        // of the beat so the text finishes before it starts to go.
        const a = Math.min(1, k / 0.1) * Math.min(1, (1 - k) / 0.15);
        const gy = indY - 7;                  // 12px icon row centered here
        ctx.save();
        ctx.globalAlpha = Math.max(0, a);
        Assets.icon(ctx, e.icon, sx - 14, gy, 1);
        ctx.font = "bold 7px monospace"; ctx.textAlign = "left";
        ctx.fillStyle = "#80ff80";
        ctx.fillText(e.text, sx - 6, gy + 3);
        ctx.restore();
        ctx.textAlign = "left";
        indY -= 15;                           // icon row claims two slots
      }
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
        indY -= 7;
      }

      // Floating coin count above bars when standing near the vendor;
      // takes the next free slot on the indY cursor (9px-tall bg box).
      if (this.nearShop) {
        const coinY = indY - 8;
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
  // Rank of an owned benediction (0 if not owned, or module not loaded).
  Player.prototype.beneRank = function (id) {
    return JH.Benedictions ? JH.Benedictions.rank(id) : 0;
  };

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
      this._puddleSlow = 0;  // vsEnemies SlowZone tag for this frame; see update()
      this._mudT = 0;        // Mudslide: seconds of lingering slow left after leaving a puddle
      this.scaldT = 0;      // seconds of Scald DoT remaining (0 = not scalded)
      this.scaldDps = 0;
      this._spreadDone = false;  // Bushfire: contagion fired for the current scald application
      this.slamCdT = 0;     // Aftershock: per-enemy cooldown between wall-slam hits
      this._lsCdT = 0;      // Landslide: cooldown before this enemy can be hit again as a victim
    }

    // Rank-max, not additive: reapplying Scald refreshes to the stronger of
    // the current and incoming dps/duration rather than stacking.
    applyScald(dps, dur) {
      this.scaldDps = Math.max(this.scaldDps, dps);
      this.scaldT = Math.max(this.scaldT, dur);
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
      // Per-type HP damp keeps heavy elites below boss HP (JH.ELITE_TUNE).
      const et = JH.ELITE_TUNE && JH.ELITE_TUNE[this.type];
      d.hp = Math.round(d.hp * s.hp * ((et && et.hp) || 1));
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
    // `hpScale` (optional, default 1) damps the super hp AFTER the type
    // multipliers — spawnWave passes the per-act value from SUPER_TUNE.hpByAct
    // so early-act giants don't outlast the whole wave.
    makeSuper(hpScale) {
      this.superElite = true;
      this.elite = true;
      this.def = JH.Balance.superEliteDef(this.def, JH.SUPER_TUNE && JH.SUPER_TUNE[this.type]);
      if (hpScale && hpScale !== 1) this.def.hp = Math.round(this.def.hp * hpScale);
      this.hp = this.maxHp = this.def.hp;
      this.bodyW = this.def.bodyW;
      this.bodyH = this.def.bodyH;
    }

    // Generic chase toward the player; subclasses override think().
    update(dt, game) {
      this.basePhysics(dt);
      if (this.slamCdT > 0) this.slamCdT -= dt;
      if (this._lsCdT > 0) this._lsCdT -= dt;
      // Landslide: while under strong knockback, this enemy batters other
      // enemies it overlaps (Earth benediction). Per-victim 0.3s tag so an
      // overlap doesn't re-hit every frame.
      const lsRank = game.player.beneRank ? game.player.beneRank("landslide") : 0;
      if (lsRank && Math.abs(this.knockVX) > 60 && game.enemies) {
        for (const o of game.enemies) {
          if (o === this || o.dead || o._lsCdT > 0) continue;
          if (!Geo.bodiesOverlap(this, o)) continue;
          o._lsCdT = 0.3;
          o.takeDamage(lsRank >= 2 ? 14 : 8, game, 0, 0);
          if (lsRank >= 2)
            { o.windTimer = 0; o.state = "idle"; o.cdTimer = Math.max(o.cdTimer, 0.6); }
        }
      }
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
      // Scald DoT: raw hp damage + own die() call (not takeDamage) so a
      // burning tick never triggers knockback or re-wets the enemy.
      if (this.scaldT > 0) {
        this.scaldT = Math.max(0, this.scaldT - dt);
        this.hp -= this.scaldDps * dt;
        if (Math.random() < 6 * dt) burst(game, this.x, this.y, this.bodyH * 0.6, JH.PAL.firePatchHi, 1, { speed: 20, life: 0.3, up: 30, size: 1 });
        // Bushfire: once per application, contagion jumps to nearby enemies
        // at this enemy's dps/dur. Spread targets have their own flag
        // pre-set so the jump can't chain past depth 1.
        if (!this._spreadDone) {
          const bfRank = game.player.beneRank ? game.player.beneRank("bushfire") : 0;
          if (bfRank) {
            this._spreadDone = true;
            for (const o of game.enemies) {
              if (o === this || o.dead) continue;
              if (Math.hypot(o.x - this.x, o.y - this.y) > 40) continue;
              o._spreadDone = true;
              o.applyScald(this.scaldDps, this.scaldT);
            }
          }
        }
        if (this.scaldT <= 0) this._spreadDone = false;
        if (this.hp <= 0) this.die(game);
      }
      // vsEnemies SlowZones (Baptismal Wake puddles) tag `_puddleSlow` each
      // frame the enemy stands inside them; pull the think-driven displacement
      // back toward the pre-think position by that fraction. One hook here
      // slows every chaser/charger uniformly without touching per-class
      // movement code.
      // Mudslide: lingering slow after leaving the puddle (tag set by
      // SlowZone.update); reuses the _puddleSlow consume below.
      if (this._mudT > 0) {
        this._mudT -= dt;
        if (!this._puddleSlow) this._puddleSlow = 0.7;
      }
      const prePx = this.x, prePy = this.y;
      this.think(dt, game);
      if (this._puddleSlow) {
        this.x = prePx + (this.x - prePx) * this._puddleSlow;
        this.y = prePy + (this.y - prePy) * this._puddleSlow;
        this._puddleSlow = 0;
      }
      resolveDebris(this);   // walking enemies bump rubble too (bosses skip this)
      // Arena containment: hose knockback (and charge overshoot) can't shove
      // an enemy past the locked wave bounds where Jon can't follow — waves
      // only clear on kills, so an unreachable enemy would soft-lock the wave.
      const preClamp = this.x;
      this.x = clamp(this.x, game.bounds.minX, game.bounds.maxX);
      // Wall slam: a knocked enemy stopped by the arena edge takes crunch
      // damage (Aftershock benediction) and staggers (Earth pillar III).
      if (this.x !== preClamp && Math.abs(this.knockVX || 0) > 60 && this.slamCdT <= 0) {
        this.slamCdT = 0.5;
        const asr = game.player.beneRank ? game.player.beneRank("aftershock") : 0;
        if (asr) {
          this.takeDamage(asr >= 2 ? 25 : 15, game, 0, 0);
          game.shake(3); game.audio.play("whack");
          if (asr >= 2) for (const o of game.enemies || [])
            if (o !== this && !o.dead && Math.hypot(o.x - this.x, o.y - this.y) < 30) o.takeDamage(8, game, 0, 0);
        }
        if (game.player.stats.wallSlamStagger) { this.windTimer = 0; this.state = "idle"; this.cdTimer = Math.max(this.cdTimer, 0.6); }
      }
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
        const sp = d.speed * (this.speedMult || 1);
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
      // Scald tint: a pulsing orange ring around the body while the DoT runs.
      if (this.scaldT > 0) {
        ctx.save();
        ctx.globalAlpha = 0.4 + 0.2 * Math.sin(this.t * 8);
        ctx.strokeStyle = "#ff8030";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(sx, sy - this.bodyH * 0.5, this.bodyW * 0.6, this.bodyH * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      // tiny hp pip when damaged
      if (this.hp < this.maxHp) {
        const w = this.bodyW + 4;
        const bx = Math.round(sx - w / 2), by = Math.round(sy - this.bodyH - 8);
        if (this.elite) {
          // Frame color is the tier read: gold = elite, red = super-elite.
          ctx.fillStyle = this.superElite ? "#ff3a3a" : "#f0b830";
          ctx.fillRect(bx - 1, by - 1, w + 2, 5);
        }
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(bx, by, w, 3);
        ctx.fillStyle = "#ff5a5a";
        ctx.fillRect(bx, by, Math.round(w * (this.hp / this.maxHp)), 3);
      }
      if (this.superElite) {
        const by = Math.round(sy - this.bodyH - 8);
        ctx.fillStyle = "#ff3a3a";
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
      this.isProjectile = true;   // Whirlwind Walk's dash sweep destroys these
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
      this.isProjectile = true;   // Whirlwind Walk's dash sweep destroys these
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
          JH.spawnFirePatch(game, this.x, this.y, 28, 1.4);
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
      this.phase = "approach"; // approach | plant | shelter | slam | retrieve | cooldown (super: approach | throwWind | brawl | slam)
      this.windTimer = 0;
      this.cdTimer = 0;
      this.strikeFx = 0;
      this.slam = null;        // active slam telegraph {range, band, dmg, dur, t}
      this.state = "idle";     // animation state only ("walk"/"idle")
      this.thrownZone = null;  // super only: the SlowZone from its lobbed shield, while live
      this.lob = null;         // super only: the in-flight ShieldLob (null once landed)
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
      if (this.superElite) return this.superThink(dt, game);
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

    // Super: no dome cycle. Lob the shield AT Jon (slow zone), brawl
    // shieldless while it's down, reclaim it when the zone expires.
    superThink(dt, game) {
      const pl = game.player, d = this.def;
      const dx = pl.x - this.x, dy = pl.y - this.y, dist = Math.hypot(dx, dy);
      this.facing = dx >= 0 ? 1 : -1;
      if (this.strikeFx > 0) this.strikeFx -= dt;

      if (this.phase === "slam") {          // reuse the standard slam resolve
        this.slam.t -= dt; this.windTimer = this.slam.t; this.state = "wind";
        if (this.slam.t <= 0) {
          if (Geo.inHitArc(this, pl, this.facing, this.slam.range, this.slam.band))
            pl.takeHit(this.slam.dmg, game, this.x);
          game.shake(9); game.audio.play("whack");
          this.strikeFx = 0.2; this.cdTimer = 0.9; this.phase = "brawl";
        }
        return;
      }
      if (this.phase === "throwWind") {
        this.windTimer -= dt; this.state = "wind";
        if (this.windTimer <= 0) {
          this.lob = new JH.ShieldLob(this.x, this.y, pl.x, pl.y, this);
          game.embers.push(this.lob);
          this.hasShield = false;
          this.phase = "brawl"; this.cdTimer = 0.6;
        }
        return;
      }
      if (this.phase === "brawl") {
        // Lob destroyed mid-flight (Whirlwind Walk): no zone/dome ever lands,
        // so reclaim the shield here or the brawl phase never exits.
        if (!this.thrownZone && this.lob && this.lob.dead) {
          this.lob = null; this.hasShield = true;
          this.phase = "approach"; this.cdTimer = d.redeployCd;
          return;
        }
        if (this.thrownZone && this.thrownZone.dead) {
          this.thrownZone = null; this.hasShield = true;
          if (this.shield) { this.shield.dead = true; this.shield = null; }
          this.phase = "approach"; this.cdTimer = d.redeployCd;
          return;
        }
        if (this.cdTimer > 0) this.cdTimer -= dt;
        if (this.cdTimer <= 0 && dist < d.slamRange && this.spawnGrace <= 0) {
          this.slam = { range: d.slamRange, band: d.slamBand, dmg: d.slamDmg, dur: d.slamWind, t: d.slamWind };
          this.phase = "slam"; game.audio.play("jump");
          return;
        }
        this._chase(dt, dx, dy, dist, 1.3);
        return;
      }
      // approach: throw when in the lob band and holding the shield
      if (this.cdTimer > 0) this.cdTimer -= dt;
      if (this.hasShield && this.cdTimer <= 0 && this.spawnGrace <= 0 &&
          dist > 50 && dist < 170) {
        this.windTimer = 0.5; this.phase = "throwWind";
        return;
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
    constructor(x, y, radius, extinguishDur, opts) {
      this.x = x; this.y = y; this.z = 0;
      this.radius = radius;
      this.extinguishDur = extinguishDur;
      // Firestorm dash trail: harmless to Jon, cooks enemies instead (see update()).
      this.friendly = !!(opts && opts.friendly);
      this.sprayProgress = 0;  // accumulated spray time; reaches extinguishDur to die
      this.patchBurnT = 0;     // cooldown between burn-stack applications
      this.sizzled = false;    // first-contact cue fired (once per patch instance)
      this.rimFlashT = 0;      // white rim flash on first contact
      this.dead = false; this.t = 0;
    }
    // How doused the patch reads (0 lit .. 1 out): the larger of spray
    // progress and the end-of-life fizzle. The fizzle holds at 0 — full
    // size, full heat — until the last patchFizzle seconds of patchMaxLife.
    douseFrac() {
      const sprayed = this.sprayProgress / this.extinguishDur;
      const F = JH.FIRE, life = this.friendly ? 0 : F.patchMaxLife;
      if (!life) return Math.min(1, sprayed);
      const fizzle = (this.t - (life - F.patchFizzle)) / F.patchFizzle;
      return Math.min(1, Math.max(sprayed, fizzle, 0));
    }
    // Live footprint (shrinks as the patch douses). ONE shape shared by the
    // hit test and the drawn scorch/rim — the rim you see is the hitbox.
    footprint() {
      const r = Math.max(6, this.radius * (1 - this.douseFrac() * 0.55));
      const rx = r * 0.85;
      return { r, rx, ry: rx * JH.GROUND_RY };
    }
    update(dt, game) {
      this.t += dt;
      if (this.patchBurnT > 0) this.patchBurnT -= dt;
      if (this.rimFlashT > 0) this.rimFlashT -= dt;
      if (this.friendly) {
        // Firestorm: skip all player-facing logic (burn/sizzle/ash-walk);
        // this patch instead cooks enemies standing in it. Nobody sprays a
        // harmless patch, so it expires on WALL-CLOCK time (extinguishDur
        // seconds since spawn), not spray progress — otherwise it would live
        // forever and its footprint would block hostile-patch spawns.
        if (this.t >= this.extinguishDur) { this.dead = true; return; }
        const f = this.footprint();
        for (const e of game.enemies) {
          if (e.dead) continue;
          if (Geo.inGroundEllipse(e.x, e.y, this.x, this.y, f.rx, f.ry))
            e.takeDamage(8 * dt, game, 0, 0);
        }
        return;
      }
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
        // Ash Walk: while fully unburned, this patch's first stack is ignored
        // outright — but only once per patch, and only on actual CONTACT
        // (without the `inside` gate the token burned remotely every frame).
        // Staying in the patch after the free stack burns normally on the
        // next tick. (.beneRank guard: test stubs use plain player objects.)
        const aw = pl.beneRank && pl.beneRank("ash_walk");
        if (aw && inside && pl.burnStacks === 0 && !this._awUsed) {
          this._awUsed = true;   // immune — no burn application this contact
        } else if (inside && this.patchBurnT <= 0) {
          // Only consume the tick when the stack actually lands; if the
          // player's burn i-frames blocked it, retry next frame so the next
          // stack arrives AT the i-frame boundary, not interval-aligned after.
          if (pl.applyBurn(1)) this.patchBurnT = JH.FIRE.patchBurnInterval;
        }
        // Ash Walk douse: walking a ready patch snuffs it instantly with a
        // steam pop that damages enemies caught in the footprint. Rank II:
        // shorter cooldown AND a bigger pop (more damage, 1.3x reach).
        if (aw && pl.douseCdT <= 0 && inside) {
          this.sprayProgress = this.extinguishDur;
          pl.douseCdT = aw >= 2 ? 6 : 10;
          const popDmg = aw >= 2 ? 10 : 6;
          const popRx = aw >= 2 ? f.rx * 1.3 : f.rx;
          const popRy = aw >= 2 ? f.ry * 1.3 : f.ry;
          for (const e of game.enemies) {
            if (e.dead) continue;
            if (Geo.inGroundEllipse(e.x, e.y, this.x, this.y, popRx, popRy))
              e.takeDamage(popDmg, game, 1, 0);
          }
          burst(game, this.x, this.y, 10, "#ffffff", aw >= 2 ? 16 : 10,
            { speed: 60, life: 0.35, up: 30 });
          if (game.audio) game.audio.play("sizzle");
        }
      }
      // Death by spraying it out OR by end-of-life burnout (douseFrac's
      // fizzle window handles the visual wind-down over the last seconds).
      if (this.sprayProgress >= this.extinguishDur
          || (JH.FIRE.patchMaxLife && this.t >= JH.FIRE.patchMaxLife))
        this.dead = true;
    }
    draw(ctx, cam) {
      const sx = Math.round(this.x - cam);
      const sy = Math.round(Geo.feetScreenY(this.y, 0));
      const prog = this.douseFrac();
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

  // Fire never stacks: if the spawn point is already inside a live patch's
  // footprint, no new patch is made (returns null). All patch spawns route
  // through here — deliberate multi-patch patterns (furnace vent ring,
  // slayer trail) space their centers outside each other's footprints.
  JH.spawnFirePatch = function (game, x, y, radius, dur, opts) {
    for (const fp of game.firePatches) {
      if (fp.dead) continue;
      const f = fp.footprint();
      if (Geo.inGroundEllipse(x, y, fp.x, fp.y, f.rx, f.ry)) return null;
    }
    const p = new FirePatch(x, y, radius, dur, opts);
    game.firePatches.push(p);
    return p;
  };

  // Trial by Fire's "burning" check: is this enemy standing in a live fire
  // patch's footprint? (Scald/burn-stack burning is checked separately by
  // the caller — this only covers ground patches.) Friendly patches don't
  // count as burning the enemy standing in them.
  function enemyInFire(game, e) {
    if (!game.firePatches) return false;
    for (const fp of game.firePatches) {
      if (fp.dead) continue;
      if (fp.friendly) continue;
      const f = fp.footprint();
      if (Geo.inGroundEllipse(e.x, e.y, fp.x, fp.y, f.rx, f.ry)) return true;
    }
    return false;
  }

  // Ground denial: slows whoever stands inside. Default mode (no opts) is
  // the super-Bulwark's thrown-shield puddle, which slows Jon. `vsEnemies`
  // mode (Baptismal Wake's dash puddle) inverts that — it tags non-boss
  // enemies inside with `_puddleSlow` (consumed by Enemy.update, see there)
  // instead of touching the player. `dmgAmp` > 1 (rank II Wake) doesn't
  // multiply damage directly here — it soaks tagged enemies' wetness to
  // >=0.35 instead, which feeds Baptize's wet-damage bonus naturally rather
  // than stacking a second damage-multiplier path.
  class SlowZone {
    constructor(x, y, r, dur, opts) {
      this.x = x; this.y = y; this.r = r; this.dur = dur;
      this.t = 0; this.dead = false;
      this.vsEnemies = !!(opts && opts.vsEnemies);
      this.slowMult = (opts && opts.slowMult) || 0.55;
      this.dmgAmp = (opts && opts.dmgAmp) || 1;
    }
    update(dt, game) {
      this.t += dt;
      if (this.t >= this.dur) { this.dead = true; return false; }
      if (this.vsEnemies) {
        const mudRank = game.player.beneRank ? game.player.beneRank("mudslide") : 0;
        for (const e of game.enemies) {
          if (e.dead || e.isBoss) continue;
          if (!Geo.inGroundEllipse(e.x, e.y, this.x, this.y, this.r)) continue;
          e._puddleSlow = this.slowMult;
          if (this.dmgAmp > 1) e.wetness = Math.max(e.wetness, 0.35);
          // Mudslide: a knocked-back enemy crossing the puddle gets dragged
          // harder (knockback amplified while inside), then keeps a lingering
          // slow for a beat after leaving (_mudT, consumed in Enemy.update
          // next to the _puddleSlow consume).
          if (mudRank && Math.abs(e.knockVX) > 60) {
            e.knockVX *= 1 + 2.5 * dt;
            e._mudT = 0.8;
          }
        }
        return true;
      }
      const pl = game.player;
      if (pl && pl.alive && Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, this.r) &&
          !(game.relics && game.relics.rubber_boots))
        pl.zoneSlow = this.slowMult;
      return true;
    }
    draw(ctx, cam) {
      const sx = Math.round(this.x - cam), sy = Math.round(Geo.feetScreenY(this.y, 0));
      const k = Math.max(0, 1 - this.t / this.dur);
      // Baptismal Wake puddles read as water (no planted shield prop); the
      // Bulwark's ground denial keeps its purple shield look.
      const fill = this.vsEnemies ? JH.PAL.waterHi : JH.PAL.bulwarkShield;
      const rim = this.vsEnemies ? JH.PAL.water : JH.PAL.bulwark;
      ctx.save();
      ctx.globalAlpha = 0.28 * k + 0.1;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(sx, sy, this.r, this.r * JH.GROUND_RY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.6 * k + 0.2;
      ctx.strokeStyle = rim;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (!this.vsEnemies) {
        // The grounded shield itself, planted in the middle.
        ctx.globalAlpha = 1;
        ctx.fillStyle = JH.PAL.bulwarkShield;
        ctx.fillRect(sx - 5, sy - 16, 10, 16);
        ctx.strokeStyle = JH.PAL.bulwarkDk;
        ctx.strokeRect(sx - 5, sy - 16, 10, 16);
      }
      ctx.restore();
    }
  }
  JH.SlowZone = SlowZone;

  // Super-Bulwark's thrown shield: smelt-style arc; lands as a SlowZone.
  class ShieldLob {
    constructor(x, y, tx, ty, owner) {
      this.x = x; this.y = y; this.z = 26; this.owner = owner;
      const dist = Math.max(1, Math.hypot(tx - x, ty - y));
      const flightT = Math.max(0.45, dist / 150);
      this.vx = (tx - x) / flightT; this.vy = (ty - y) / flightT;
      this.vz = 0.5 * 300 * flightT - this.z / flightT;
      this.t = 0; this.dead = false;
      this.isProjectile = true;   // Whirlwind Walk can destroy it mid-flight (counterplay)
    }
    update(dt, game) {
      if (this.dead) return false;
      this.t += dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.vz -= 300 * dt; this.z += this.vz * dt;
      if (this.z <= 0) {
        const zone = new JH.SlowZone(this.x, this.y, 30, 5);
        game.slowZones.push(zone);
        // The landed shield IS a barrier: a half-size dome (blocks spray from
        // outside, shelters) lasting exactly as long as the slow zone.
        const dome = new JH.DeployedShield(this.x, this.y, this.owner);
        dome.radius = 34;
        dome.domeDur = dome.domeT = 5;
        game.shields.push(dome);
        if (this.owner) { this.owner.thrownZone = zone; this.owner.shield = dome; this.owner.lob = null; }
        game.shake(3); if (game.audio) game.audio.play("whack");
        this.dead = true;
      }
      return !this.dead;
    }
    draw(ctx, cam) {
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, this.z);
      ctx.save();
      ctx.translate(sx, sy); ctx.rotate(this.t * 9);
      ctx.fillStyle = JH.PAL.bulwarkShield;
      ctx.fillRect(-6, -8, 12, 16);
      ctx.strokeStyle = JH.PAL.bulwarkDk; ctx.strokeRect(-6, -8, 12, 16);
      ctx.restore();
    }
  }
  JH.ShieldLob = ShieldLob;

  // ---- Stalker: fast chaser; regular enemy, has a super-elite variant ----
  // On cooldown: telegraphs (state "wind"), blinks behind the player, then
  // strikes (state "strike") in the same beat; only dash i-frames negate it
  // (Player.takeHit already no-ops while dashTimer > 0).
  // Super-elite: feints in front first, then blinks behind for the real strike.
  class Stalker extends Enemy {
    think(dt, game) {
      const pl = game.player, d = this.def;

      if (this.state === "strike") {
        this.attackTimer -= dt;
        if (this.attackTimer <= 0) {
          if (Geo.inHitArc(this, pl, this.facing, d.strikeRange, 20))
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
          const bounds = { minX: game.bounds.minX, maxX: game.bounds.maxX,
                           depthMin: JH.DEPTH_MIN, depthMax: JH.DEPTH_MAX };
          if (this.superElite && !this.feinted) {
            // Fakeout: first blink lands IN FRONT (facing side) with no
            // strike, then immediately re-telegraphs the real one.
            const f = JH.Balance.stalkerBlinkTarget(pl.x, pl.y, -pl.facing, d.blinkDist, bounds);
            this.x = f.x; this.y = f.y;
            this.facing = pl.x >= this.x ? 1 : -1;
            this.feinted = true;
            this.windTimer = 0.25;
            game.audio.play("jump");
            return;
          }
          this.feinted = false;
          const t = JH.Balance.stalkerBlinkTarget(pl.x, pl.y, pl.facing, d.blinkDist, bounds);
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
      // Prayer Bead: a boss's FIRST enrage flip grants a brief pressure buff (once per boss).
      if (enraged && !this._enrageLatched) {
        this._enrageLatched = true;
        if (game.relics && game.relics.prayer_bead) JH.Balance.prayerBeadProc(game.player, JH.RELIC_TUNE);
      }
      const spd = enraged ? d.speed * 1.6 : d.speed;
      if (this.strikeFx > 0) this.strikeFx -= dt;

      // Summon reinforcements occasionally — but only while the encounter's
      // drop budget has anything left: once adds stop paying, more of them
      // is mop-up noise, so the boss stops calling them.
      this.summonTimer -= dt;
      const budgetLeft = !game.dropBudget || game.dropBudget.suds > 0 || game.dropBudget.items > 0;
      if (this.summonTimer <= 0 && budgetLeft &&
          game.enemies.filter((e) => !e.isBoss && !e.dead).length < 3) {
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
      if (this.kind === "cross") {
        // Essence crosses HOVER: no ground physics, a slow bob.
        this.grounded = true;
        this.z = 8 + Math.sin(this.t * 2.2) * 3;
      } else if (!this.grounded) {
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
      // Dowsing Rod: magnet radius doubles (30 -> 60).
      const magnetR = (game.relics && game.relics.dowsing_rod) ? 60 : 30;
      if (vac || dist < magnetR) {
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
        // kibbles heal for twice as long). Routed through Balance.kibbleGrant
        // so the shop's Kibble Pack buy shares the same semantics.
        JH.Balance.kibbleGrant(pl, { dur: 6.0, heal: this.value });
        game.audio.play("buy");
        burst(game, pl.x, pl.y, pl.z + 10, JH.PAL.hpPk, 10, { speed: 70, life: 0.45, up: 50 });
      }
      else if (this.kind === "water_can") {
        // Dowsing Rod: water cans refill 50% more.
        const wcVal = this.value * ((game.relics && game.relics.dowsing_rod) ? 1.5 : 1);
        pl.water = Math.min(pl.stats.maxWater, pl.water + wcVal);
        game.audio.play("buy");
      }
      else if (this.kind === "pill") {
        pl.concertaTimer = Math.max(pl.concertaTimer, JH.CONCERTA.dur);
        game.audio.play("pill");
        burst(game, pl.x, pl.y, pl.z + 10, JH.PAL.pill, 14, { speed: 90, life: 0.55, up: 60 });
      }
      else if (this.kind === "cross") {
        if (JH.Church) JH.Church.addEssence(this.value || 1);
        game.audio.play("upgrade");
        burst(game, pl.x, pl.y, pl.z + 12, "#fff7c2", 12, { speed: 80, life: 0.5, up: 70 });
        if (game.float) game.float(pl.x, pl.y - 30, "+" + (this.value || 1) + " HOLY ESSENCE", "#ffd23f");
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

  // ================================================== BENEDICTION SIGILS
  // Post-boss/set-piece walk-up offer: a floating unique benediction glyph, picked with
  // E in range. Proximity + input are ticked game-side (game.tickSigils,
  // mirrors tickRangeStations); the sigil only exposes near (label range)
  // and pick(). Picking one offer clears all sigils on the field.
  const SIGIL_COLORS = { water: "#6cd3ff", fire: "#ff8030", earth: "#c8a050", air: "#bfe8ff" };
  const SIGIL_COLORS_DK = { water: "#1a5f80", fire: "#8a3810", earth: "#6a4a20", air: "#5a7a90" };
  JH.SIGIL_COLORS = SIGIL_COLORS;   // shared with the game.js HUD strip / stat panel
  class Sigil {
    constructor(x, y, offer) {
      this.x = x; this.y = y; this.z = 0; this.offer = offer;
      this.t = 0; this.dead = false; this.near = false;
      const d = JH.Benedictions.byId(offer.id);
      this.element = d.element || (d.needs && d.needs[0]) || "water";
      this.kind = d.kind;
    }
    update(dt) { this.t += dt; return !this.dead; }
    pick(game) {
      const d = JH.Benedictions.byId(this.offer.id);
      JH.Benedictions.take(this.offer.id);
      if (JH.Telemetry) JH.Telemetry.benediction(this.offer.id);
      if (d.kind === "duo" || d.kind === "legendary") game.beneUsedOnce[this.offer.id] = true;
      const p = game.player;
      p.applyStats(JH.Upgrades.computeStats(JH.Upgrades.owned));
      if (p.beneRank("eye_of_storm")) p.stormT = p.beneRank("eye_of_storm") >= 2 ? 1.5 : 1;
      game.audio.play("upgrade", { pitch: 0.9 });
      burst(game, this.x, this.y, 14, SIGIL_COLORS[this.element], 18, { speed: 100, life: 0.6, up: 80, size: 2 });
      game.banner(d.name.toUpperCase() + (this.offer.deepen ? " II" : ""), 1.4);
      if (game.float) game.float(this.x, this.y - 20, d.name, "#80ff80");
      // Dev range: keep every sigil so you can grab combos (re-pick to deepen).
      if (!game.rangeMode) for (const s of game.sigils) s.dead = true;
    }
    draw(ctx, cam) {
      const d = JH.Benedictions.byId(this.offer.id);
      const bob = Math.sin(this.t * 2) * 3;
      const sx = this.x - cam, sy = Geo.feetScreenY(this.y, 14 + bob);
      const col = SIGIL_COLORS[this.element] || "#ffffff";
      const dk = SIGIL_COLORS_DK[this.element] || "#333333";
      Assets.shadow(ctx, sx, Geo.feetScreenY(this.y, 0), 6);
      // Baked unique benediction glyph; the rotated diamond stays as the streaming fallback.
      const hasIcon = Assets.icon(ctx, "bene_" + this.offer.id, sx, sy, 1);
      if (!hasIcon) {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(Math.PI / 4);
        const half = 5;   // 10px diamond
        if (this.kind === "duo" && d.needs) {
          // Split two-tone: half in each contributing element's color.
          ctx.fillStyle = SIGIL_COLORS[d.needs[0]] || col;
          ctx.fillRect(-half, -half, half, half * 2);
          ctx.fillStyle = SIGIL_COLORS[d.needs[1]] || col;
          ctx.fillRect(0, -half, half, half * 2);
        } else {
          ctx.fillStyle = col;
          ctx.fillRect(-half, -half, half * 2, half * 2);
        }
        ctx.strokeStyle = dk; ctx.lineWidth = 1;
        ctx.strokeRect(-half, -half, half * 2, half * 2);
        ctx.restore();
      }
      // Rarity frame + glow rings the icon (boon/duo/legendary per tier).
      Assets.tierFrame(ctx, sx, sy, d, this.offer.deepen ? 2 : 1, 1.1, this.t);
      // Verb corner mark tells same-element boons apart (boons only — the
      // duo/legendary frames are their distinguisher).
      if (this.kind === "boon" && d.verb) Assets.verbMark(ctx, d.verb, sx + 6, sy - 6);
      if (this.offer.deepen) {
        ctx.fillStyle = "#fff"; ctx.font = "bold 6px monospace"; ctx.textAlign = "center";
        ctx.fillText("II", sx, sy - 15);
        ctx.textAlign = "left";
      }
      if (this.near) {
        ctx.fillStyle = "#eaf6ff"; ctx.font = "6px monospace"; ctx.textAlign = "center";
        ctx.fillText(d.name, sx, sy - 22);
        ctx.textAlign = "left";
      }
    }
  }
  JH.Sigil = Sigil;

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

  // ====================================================== DEEPDIVE TV
  // Shop-interlude prop: spawns down-lane of the vendor when Jon arrives with
  // a big banked kibble buff. Sitting at it (game.deepdiving) fast-forwards
  // the whole world; see JH.DEEPDIVE and Game.tickDeepdive.
  class DeepdiveTV {
    constructor(x, y) {
      this.x = x; this.y = y; this.z = 0; this.facing = 1;
      this.t = 0; this.bodyW = 16; this.near = false;
      this.videoT = 0; this.titleIdx = 0; this.marqueeT = 0;
    }
    update(dt) {
      this.t += dt;
      // Marquee clock: advances every sim step (scaled while deepdiving, 1x
      // parked) so the title always scrolls; per-title reset below makes each
      // new title enter from the right edge.
      this.marqueeT += dt;
      // Title cycling rides videoT, which tickDeepdive only advances while
      // sitting (scaled steps) — this no-ops while parked.
      if (this.videoT >= JH.DEEPDIVE.titleSwap) {
        this.videoT = 0;
        this.marqueeT = 0;
        this.titleIdx = (this.titleIdx + 1) % JH.DEEPDIVE.titles.length;
      }
    }
    draw(ctx, cam) {
      const D = JH.DEEPDIVE;
      const on = !!(JH.Game && JH.Game.deepdiving);
      const sx = Math.round(this.x - cam), sy = Math.round(Geo.feetScreenY(this.y, 0));
      Assets.shadow(ctx, sx, sy, 15);
      ctx.save();
      // Screen glow halo is the differentiator from the vendor's chalkboard
      // sign (same dark-navy palette, no light source of its own) — the TV
      // reads as a lit display even parked, and flares while deepdiving.
      Assets.glow(ctx, sx, sy - 40, on ? 32 : 21, "#7ff0ff", on ? 0.6 : 0.32);

      ctx.fillStyle = "#12161f"; ctx.fillRect(sx - 27, sy - 58, 54, 38);   // cabinet
      ctx.fillStyle = "#232c3d"; ctx.fillRect(sx - 24, sy - 55, 48, 32);   // bezel
      const screenX = sx - 23, screenY = sy - 54, screenW = 46, screenH = 30;
      ctx.fillStyle = on ? "#c8f6ff" : "#5fd3ec";
      ctx.fillRect(screenX, screenY, screenW, screenH);

      // Fake-YouTube content, clipped to the screen so text/bars never bleed
      // past the bezel at this tiny size.
      ctx.save();
      ctx.beginPath(); ctx.rect(screenX, screenY, screenW, screenH); ctx.clip();
      ctx.fillStyle = "#0b2530";
      ctx.fillRect(screenX, screenY, screenW, screenH - 6);   // video pane above the scrub row

      // Title marquee: full string scrolls right-to-left on marqueeT (scaled
      // time — races at ramp, which is the joke), looping with a gap; two
      // copies one period apart keep the loop seamless under the clip.
      ctx.textAlign = "left";
      ctx.font = "bold 5px monospace"; ctx.fillStyle = "#eafcff";
      const title = D.titles[this.titleIdx] || "";
      const tw = ctx.measureText(title).width;
      const period = tw + 24;                               // 24px inter-loop gap
      const mx = screenX + screenW - ((this.marqueeT * 40) % period);
      ctx.fillText(title, mx, screenY + 7);
      ctx.fillText(title, mx + period, screenY + 7);

      const views = (3 + this.titleIdx * 7) % 9 + 1;   // stable-per-title, no RNG, never 0M
      ctx.font = "5px monospace"; ctx.fillStyle = "#9be8ff";
      ctx.fillText(views + "M views", screenX + 1, screenY + 14);

      // Scrub bar races over D.titleSwap scaled seconds — visible proof the
      // video (and the world behind it) is running fast.
      const frac = Math.max(0, Math.min(1, this.videoT / D.titleSwap));
      ctx.fillStyle = "#1a3a44"; ctx.fillRect(screenX + 1, screenY + screenH - 4, screenW - 2, 2);
      ctx.fillStyle = "#ff3b3b"; ctx.fillRect(screenX + 1, screenY + screenH - 4, (screenW - 2) * frac, 2);

      // Up-next nub: bottom-right, below the title band so it never overdraws
      // the marquee; sits just above the scrub row.
      const nx = screenX + screenW - 9, ny = screenY + screenH - 11;
      ctx.fillStyle = "#1a2230"; ctx.fillRect(nx, ny, 8, 6);
      ctx.fillStyle = on ? "#7ff0ff" : "#4a8a9a";
      ctx.beginPath();
      ctx.moveTo(nx + 3, ny + 1.5);
      ctx.lineTo(nx + 3, ny + 4.5);
      ctx.lineTo(nx + 6, ny + 3);
      ctx.closePath(); ctx.fill();
      ctx.restore();

      ctx.fillStyle = "#0d1420";
      ctx.fillRect(sx - 17, sy - 20, 4, 20); ctx.fillRect(sx + 13, sy - 20, 4, 20);   // legs
      ctx.restore();
    }
  }
  JH.DeepdiveTV = DeepdiveTV;

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
      // Prayer Bead: a boss's FIRST enrage flip grants a brief pressure buff (once per boss).
      if (enraged && !this._enrageLatched) {
        this._enrageLatched = true;
        if (game.relics && game.relics.prayer_bead) JH.Balance.prayerBeadProc(game.player, JH.RELIC_TUNE);
      }
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
            // Rim is hitbox: the slam hits exactly the floor ellipse the
            // telegraph draws (drawLines: rx = whipBand*2, ry = lineBand) —
            // dodging in depth escapes it just like dodging in x.
            for (const lt of this.lines)
              if (this.lineHits(pl, lt)) pl.takeHit(d.lineDmg, game, this.x);
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
    // Line-slam hit test — the same ellipse drawLines paints (rx = whipBand*2,
    // ry = lineBand), plus the shared "on the ground" z gate. Also used by
    // the Gateway Krusher (inherits).
    lineHits(pl, lt) {
      if ((pl.z || 0) >= 18) return false;
      const ex = (pl.x - lt.x) / (this.def.whipBand * 2);
      const ey = (pl.y - lt.y) / this.def.lineBand;
      return ex * ex + ey * ey <= 1;
    }
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
      this.isFx = true;   // visual-only marker: not in the Whirlwind Walk isProjectile sweep whitelist
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
      // Prayer Bead: a boss's FIRST enrage flip grants a brief pressure buff (once per boss).
      if (enraged && !this._enrageLatched) {
        this._enrageLatched = true;
        if (game.relics && game.relics.prayer_bead) JH.Balance.prayerBeadProc(game.player, JH.RELIC_TUNE);
      }
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
      this.isProjectile = true;   // Whirlwind Walk's dash sweep destroys these
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
      // Prayer Bead: a boss's FIRST enrage flip grants a brief pressure buff (once per boss).
      if (enraged && !this._enrageLatched) {
        this._enrageLatched = true;
        if (game.relics && game.relics.prayer_bead) JH.Balance.prayerBeadProc(game.player, JH.RELIC_TUNE);
      }
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
            // Rim is hitbox: exactly the telegraph ellipse (see lineHits).
            for (const lt of this.lines)
              if (this.lineHits(pl, lt)) pl.takeHit(d.lineDmg, game, this.x);
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
      // Prayer Bead: a boss's FIRST enrage flip grants a brief pressure buff (once per boss).
      if (enraged && !this._enrageLatched) {
        this._enrageLatched = true;
        if (game.relics && game.relics.prayer_bead) JH.Balance.prayerBeadProc(game.player, JH.RELIC_TUNE);
      }
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
      // Scald wears off here too — this update() overrides Enemy's, so without
      // this the dummy's scald tint would stick forever after one dash-through.
      if (this.scaldT > 0) this.scaldT = Math.max(0, this.scaldT - dt);
      if (game.player) this.facing = game.player.x >= this.x ? 1 : -1;
      this.animate(dt, false);
    }
  }

  // ---- Smelt: slow, arena-control, half-effective spray ----
  // ---- SmeltBomb: Smelt's lobbed fire bomb ----
  // Arcing projectile (parabolic z). Spawns FirePatch + burst on landing.
  // Pushed into game.embers; update() returns false when dead.
  class SmeltBomb {
    constructor(x, y, tx, ty, d, opts) {
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
      this.bounces = (opts && opts.bounces) || 0;
      this.isProjectile = true;   // Whirlwind Walk's dash sweep destroys these
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
        JH.spawnFirePatch(game, this.x, this.y, d.lobBombRadius, d.lobBombDur);
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
        if (this.bounces > 0) {
          // Bounce: shorter re-arc toward the player's CURRENT position;
          // every touchdown has already left its patch above.
          this.bounces--;
          const hop = Math.max(30, Math.hypot(pl.x - this.x, pl.y - this.y) * 0.7);
          const ang2 = Math.atan2(pl.y - this.y, pl.x - this.x);
          const ty2 = Math.max(JH.DEPTH_MIN, Math.min(JH.DEPTH_MAX, this.y + Math.sin(ang2) * hop));
          const flightT = Math.max(0.35, hop / d.lobBombSpeed);
          this.vx = Math.cos(ang2) * hop / flightT;
          this.vy = (ty2 - this.y) / flightT;
          this.z = 0.01;
          this.vz = 0.5 * d.lobGravity * flightT;
        } else {
          this.dead = true;
        }
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
  JH.SmeltBomb = SmeltBomb;

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
          if (this.superElite) {
            // ONE bouncing slag — twin lobs read as too much on the field.
            game.embers.push(new SmeltBomb(this.x, this.y, pl.x, pl.y, d, { bounces: 1 }));
          } else {
            game.embers.push(new SmeltBomb(this.x, this.y, pl.x, pl.y, d));
          }
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
      // Prayer Bead: a boss's FIRST enrage flip grants a brief pressure buff (once per boss).
      if (enraged && !this._enrageLatched) {
        this._enrageLatched = true;
        if (game.relics && game.relics.prayer_bead) JH.Balance.prayerBeadProc(game.player, JH.RELIC_TUNE);
      }
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
          JH.spawnFirePatch(game, this.x, this.y, d.dashPatchRadius, d.dashPatchDur);
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
          JH.spawnFirePatch(game, this.x, this.y, d.ventPatchRadius, d.ventPatchDur);
          const ringN = 6, ringR = this.bodyW * 1.4;
          for (let i = 0; i < ringN; i++) {
            const a = (i / ringN) * Math.PI * 2;
            JH.spawnFirePatch(game,
              this.x + Math.cos(a) * ringR,
              this.y + Math.sin(a) * ringR * JH.GROUND_RY,   // flattened in depth (2.5D)
              d.ventPatchRadius * 0.8, d.ventPatchDur);
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
    die(game) {
      // The death explosion hurls one slag at Jon's position — a last spiteful
      // lob using the smelt-bomb arc (small patch on landing).
      const pl = game.player;
      game.embers.push(new JH.SmeltBomb(this.x, this.y, pl.x, pl.y, {
        lobBombSpeed: 120, lobGravity: 300, lobBombRadius: 24, lobBombDur: 1.8,
      }));
      super.die(game);
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
      // Proximity-lit fuse: within igniteRange the wick lights; while lit it
      // burns the fuse's OWN hp — at 0 (by drain or damage) it self-destructs.
      const d = this.def, pl = game.player;
      if (!this.lit && this.spawnGrace <= 0 &&
          Math.hypot(pl.x - this.x, pl.y - this.y) < d.igniteRange) {
        this.lit = true;
        if (game.audio) game.audio.play("sizzle");
      }
      // Slow stalk until the wick lights, then sprint to detonate.
      this.speedMult = this.lit ? d.litSpeedMult : 1;
      if (this.lit && !this.dead) {
        this.hp -= this.maxHp * d.litDrainFrac * dt;
        if (Math.random() < 8 * dt)
          burst(game, this.x, this.y, this.bodyH + 2, JH.PAL.firePatchHi, 1,
            { speed: 25, life: 0.25, up: 40, size: 1 });
        if (this.hp <= 0) { this.die(game); return; }
      }
      super.update(dt, game);
    }
    takeDamage(dmg, game, dirX, knock) {
      if (this.dropping) return;   // inert until landed
      super.takeDamage(dmg, game, dirX, knock);
    }
    die(game) {
      const d = this.def;
      if (this.lit) {
        // Self-destruct: real AoE + a bigger, longer patch.
        JH.spawnFirePatch(game, this.x, this.y, d.blastPatchRadius, d.blastPatchDur);
        game.embers.push(new JH.FxBurst(this.x, this.y, "boom-mid", { scale: 0.55 }));
        game.shake(5);
        const pl = game.player;
        if (pl.alive && Geo.inGroundEllipse(pl.x, pl.y, this.x, this.y, d.blastRadius)) {
          pl.takeHit(d.blastDmg, game, this.x);
          pl.applyBurn(1);
        }
      } else {
        JH.spawnFirePatch(game, this.x, this.y, d.deathPatchRadius, d.deathPatchDur);
        game.embers.push(new JH.FxBurst(this.x, this.y, "boom-small", { scale: 1 }));
        game.shake(3);
        if (Geo.inGroundEllipse(game.player.x, game.player.y, this.x, this.y, d.deathBurnRange))
          game.player.applyBurn(1);
      }
      burst(game, this.x, this.y, 5, JH.PAL.firePatch, 16, { speed: 130, life: 0.5, up: 70, size: 3 });
      // Elite: 1 child fuse lobbed out; super: 3 — however it died.
      const n = this.superElite ? 3 : this.elite ? 1 : 0;
      for (let i = 0; i < n; i++) {
        const ang = (i / Math.max(1, n)) * Math.PI * 2 + Math.random();
        const cx = clamp(this.x + Math.cos(ang) * 26, game.bounds.minX, game.bounds.maxX);
        const cy = clamp(this.y + Math.sin(ang) * 14, JH.DEPTH_MIN, JH.DEPTH_MAX);
        const child = game.spawnEnemy("fuse", cx, cy, { infinite: true });
        if (child) { child.z = 24; child.vz = 90; child.spawnGrace = 0.5; }
      }
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
    if (this.lit && !this.dead) {
      const sx = this.x - cam;
      Assets.drawFx(ctx, "fire-small", sx + this.facing * 2,
        Geo.feetScreenY(this.y, this.z) - this.bodyH - 3, this.t, { scale: 0.35 });
    }
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
