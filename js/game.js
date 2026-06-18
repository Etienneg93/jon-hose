/* =====================================================================
   game.js — scene manager, wave spawner, HUD, and the fixed-step loop.
   Holds the live world (player, enemies, projectiles, pickups, particles)
   and drives state transitions: title → play ⇄ shop → win / over.
   ===================================================================== */
(function () {
  "use strict";
  const JH = (window.JH = window.JH || {});
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Where each wave triggers as the player advances rightward (one per wave,
  // bosses included). Spaced ~a screen apart across the longer level.
  const WAVE_TRIGGERS = [360, 840, 1320, 1800, 2300, 2820, 3340, 3860];

  const Game = {
    canvas: null, ctx: null,
    state: "title",
    input: null, audio: null,

    player: null,
    enemies: [], embers: [], pickups: [], particles: [],
    hydrants: [], shopNpc: null, nearShop: false,
    wall: null, wallSpawnTimer: 0, wallPool: [],
    dropBudget: { suds: 0, items: 0 },   // anti-farm cap for infinite spawns
    bounds: { minX: 8, maxX: JH.LEVEL_LEN - 8 },

    waveIndex: -1,
    waveActive: false,
    waveCleared: false,
    elapsed: 0, kills: 0,
    shakeAmt: 0,
    bannerTimer: 0,
    shopCursor: 0,
    acc: 0, lastT: 0, running: false,

    // ------------------------------------------------------------- setup
    init() {
      this.canvas = document.getElementById("game");
      this.ctx = this.canvas.getContext("2d");
      this.ctx.imageSmoothingEnabled = false;
      this.input = JH.Input; this.input.init();
      this.audio = JH.AudioFX;
      JH.Music.init();
      JH.Background.init();
      this.bindUI();
      this.lastT = performance.now();
      this.running = true;
      requestAnimationFrame((t) => this.frame(t));
    },

    bindUI() {
      const startAudio = () => { this.audio.resume(); JH.Music.start(); };

      // Overlay buttons dispatch by data-action.
      document.querySelectorAll("[data-action]").forEach((el) => {
        el.addEventListener("click", () => {
          startAudio();
          const a = el.getAttribute("data-action");
          if (a === "start" || a === "retry") this.startGame();
          else if (a === "resume") this.closeShop();
          else if (a === "resume-pause") this.togglePause();
        });
      });

      // Audio controls (master volume + mute) on the title & pause menus.
      // Multiple copies stay in sync since we query them all.
      const sync = () => {
        const v = Math.round(JH.Music.volume * 100);
        document.querySelectorAll("[data-vol]").forEach((s) => { s.value = v; });
        document.querySelectorAll("[data-volpct]").forEach((s) => { s.textContent = JH.Music.muted ? "MUTE" : v + "%"; });
        document.querySelectorAll("[data-mute]").forEach((b) => { b.textContent = (JH.Music.muted || JH.Music.volume === 0) ? "🔇" : "🔊"; });
      };
      document.querySelectorAll("[data-vol]").forEach((sl) => {
        sl.addEventListener("input", () => { startAudio(); JH.Music.setVolume(sl.value / 100); sync(); });
      });
      document.querySelectorAll("[data-mute]").forEach((btn) => {
        btn.addEventListener("click", () => { startAudio(); JH.Music.toggleMute(); sync(); });
      });
      this.syncAudioUI = sync;
      sync();
    },

    // -------------------------------------------------------- overlays
    showScreen(id) {
      ["screen-title", "screen-shop", "screen-over", "screen-win", "screen-pause"]
        .forEach((s) => document.getElementById(s).classList.add("hidden"));
      document.getElementById("hud").classList.toggle("hidden", !(id === null || id === "hud"));
      if (id && id !== "hud") document.getElementById(id).classList.remove("hidden");
    },

    banner(text, dur) {
      const el = document.getElementById("banner");
      el.textContent = text;
      el.classList.remove("hidden");
      // restart pop animation
      el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
      this.bannerTimer = dur || 1.4;
    },

    // ------------------------------------------------------- new game
    startGame() {
      JH.Upgrades.reset();
      JH.Camera.reset();
      this.player = new JH.Player(60, JH.DEPTH_MAX - 24);
      this.enemies = []; this.embers = []; this.pickups = []; this.particles = [];
      this.hydrants = JH.HYDRANTS.map((h) => ({ x: h.x, y: h.y, t: 0 }));
      this.shopNpc = null; this.nearShop = false; this.shopCursor = 0;
      this.wall = null; this.dropBudget = { suds: 0, items: 0 };
      this.waveIndex = -1; this.waveActive = false; this.waveCleared = false;
      this.elapsed = 0; this.kills = 0; this.shakeAmt = 0;
      this.bounds = { minX: 8, maxX: WAVE_TRIGGERS[0] + 30 };
      this.state = "play";
      this.showScreen("hud");
      document.getElementById("hud-wave").textContent = "Hosetown";
      document.getElementById("hud-wave-label").classList.add("hidden");
      JH.Music.reset();
      JH.Music.start();
      this.banner("GET HOSING!", 1.4);
    },

    // ------------------------------------------------------- waves
    checkWaveTrigger() {
      const next = this.waveIndex + 1;
      if (this.waveActive || next >= JH.LEVEL1.waves.length) return;
      if (this.player.x >= WAVE_TRIGGERS[next] - 30) this.startWave(next);
    },

    startWave(i) {
      this.waveIndex = i;
      this.waveActive = true;
      this.waveCleared = false;
      this.shopNpc = null;          // vendor gets left behind once the fight starts
      this.nearShop = false;
      const wave = JH.LEVEL1.waves[i];
      JH.Camera.lock();
      // Confine the player to the current screen ("arena").
      const left = JH.Camera.x + 20, right = JH.Camera.x + JH.VIEW_W - 20;
      this.bounds = { minX: left, maxX: right };
      this.dropBudget = { suds: 0, items: 0 };

      if (wave.wall) {
        // Barricade encounter: wall on the right, enemies keep coming.
        this.bounds = { minX: left, maxX: right - 26 };       // can't pass the wall
        this.wall = new JH.Wall(right - 6, wave.wallHp || JH.WALL.hp);
        this.wallSpawnTimer = 0.4;
        this.wallPool = [];
        wave.spawns.forEach((g) => { for (let k = 0; k < g.count; k++) this.wallPool.push(g.type); });
        this.dropBudget = { suds: 14, items: 7 };             // anti-farm cap
        this.banner("BARRICADE! SMASH THROUGH", 1.6);
      } else if (wave.boss) {
        JH.Music.setTrack("boss");
        const bt = wave.bossType || "boss";
        const bdef = (bt === "switch") ? JH.SWITCH : JH.BOSS;
        this.dropBudget = { suds: 10, items: 5 };             // caps summon farming
        this.banner(bdef.name.toUpperCase(), 1.8);
        this.spawnEnemy(bt, right - 20, JH.DEPTH_MAX - 30);
      } else {
        this.banner(wave.name + (wave.tough ? " — ELITES!" : " — FIGHT!"), 1.3);
        let slot = 0;
        wave.spawns.forEach((grp) => {
          for (let k = 0; k < grp.count; k++) {
            const ex = right - 6 - (slot % 3) * 16 + Math.random() * 10;
            const ey = JH.DEPTH_MIN + 8 + ((slot * 27) % (JH.DEPTH_MAX - JH.DEPTH_MIN - 16));
            const e = this.spawnEnemy(grp.type, clamp(ex, left, right), ey, { elite: wave.tough });
            e.spawnGrace = 0.3 + slot * 0.25; // stagger entrances
            slot++;
          }
        });
      }
    },

    waveCleared_() {
      JH.Music.setTrack("level");
      this.waveActive = false;
      const clearedWave = JH.LEVEL1.waves[this.waveIndex];
      if (clearedWave) {
        document.getElementById("hud-wave").textContent = clearedWave.name;
        document.getElementById("hud-wave-label").classList.remove("hidden");
      }
      this.wall = null;           // barricade (if any) is down — open the path
      JH.Camera.unlock();
      // Second Wind: heal a chunk when the area is cleared.
      if (this.player.stats.clearHeal > 0) {
        this.player.hp = Math.min(this.player.stats.maxHp,
          this.player.hp + this.player.stats.maxHp * this.player.stats.clearHeal);
      }
      // The LAST wave (final boss) wins; a mid-boss just continues.
      if (this.waveIndex >= JH.LEVEL1.waves.length - 1) { this.win(); return; }

      // Free-walk onward; drop a shop vendor — but NOT after the first
      // introductory wave (only from wave 2 onward).
      const next = this.waveIndex + 1;
      this.bounds = { minX: 8, maxX: WAVE_TRIGGERS[next] + 30 };
      if (this.waveIndex >= 1) {
        this.shopNpc = new JH.ShopNPC(WAVE_TRIGGERS[next] - 150, JH.DEPTH_MIN + 6);
        this.banner("AREA CLEAR! ▶  SHOP AHEAD", 1.6);
      } else {
        this.banner("AREA CLEAR! ▶", 1.2);
      }
    },

    // ------------------------------------------------------- spawning
    spawnEnemy(type, x, y, opts) {
      const e = JH.makeEnemy(type, x, y);
      if (opts) {
        if (opts.infinite) e.infinite = true;
        if (opts.elite && e.makeElite) e.makeElite();
      }
      this.enemies.push(e);
      return e;
    },
    spawnPickup(kind, x, y, value) {
      this.pickups.push(new JH.Pickup(kind, x, y, value));
    },
    onEnemyKilled(e) { this.kills++; },

    // Loot with anti-farm: scripted-wave enemies always drop; "infinite"
    // spawns (boss summons + wall-zone reinforcements) share a per-encounter
    // budget, so steady killing is rewarded but idle farming dries up.
    dropLoot(e) {
      if (e.infinite) {
        const b = this.dropBudget;
        if (b && b.suds > 0) { this.spawnPickup("suds", e.x, e.y, e.def.suds); b.suds--; }
        if (b && b.items > 0) {
          const r = Math.random();
          if (r < 0.25) { this.spawnPickup("health", e.x + 6, e.y, 25); b.items--; }
          else if (r < 0.5) { this.spawnPickup("water_can", e.x - 6, e.y, 40); b.items--; }
        }
      } else {
        this.spawnPickup("suds", e.x, e.y, e.def.suds);
        const r = Math.random();
        if (r < 0.18) this.spawnPickup("health", e.x + 6, e.y, 25);
        else if (r < 0.45) this.spawnPickup("water_can", e.x - 6, e.y, 40);
      }
    },
    shake(n) { this.shakeAmt = Math.min(12, this.shakeAmt + n); },

    // ------------------------------------------------------- shop
    openShop() {
      this.state = "shop";
      this.renderShop();
      this.showScreen("screen-shop");
    },
    renderShop() {
      document.getElementById("shop-suds").textContent = Math.floor(this.player.suds);
      const U = JH.Upgrades;
      const pl = this.player;
      const list = document.getElementById("shop-list");
      list.innerHTML = "";

      U.branches.forEach((branch) => {
        const col = document.createElement("div");
        col.className = "tree-col";
        col.innerHTML = '<div class="tree-head">' + branch + "</div>";
        U.nodesByBranch(branch).forEach((n, idx) => {
          if (idx > 0) col.appendChild(connector());
          const owned = U.isOwned(n.id);
          const avail = U.isAvailable(n.id);
          const locked = U.isLocked(n.id);
          const afford = avail && this.player.suds >= n.cost;
          const node = document.createElement("div");
          node.className = "tree-node " +
            (owned ? "owned" : locked ? "locked" : afford ? "buyable" : "cant");
          node.innerHTML =
            '<div class="tn-top"><span class="tn-name">' + n.name + "</span>" +
            '<span class="tn-cost">' + (owned ? "✔" : "💧" + n.cost) + "</span></div>" +
            '<div class="tn-desc">' + (locked ? "🔒 " : "") + n.desc + "</div>";
          if (avail) node.addEventListener("click", () => {
            if (U.buy(n.id, this.player)) { this.audio.play("buy"); this.renderShop(); }
            else this.audio.play("hurt");
          });
          col.appendChild(node);
        });
        list.appendChild(col);
      });
      function connector() { const c = document.createElement("div"); c.className = "tree-link"; return c; }
    },
    closeShop() {
      this.state = "play";
      this.showScreen("hud");
    },

    // ------------------------------------------------------- end states
    win() {
      JH.Music.setTrack("level");
      this.state = "win";
      document.getElementById("win-stats").textContent =
        "Suds banked: " + Math.floor(this.player.sudsEarned) +
        "\nEnemies hosed: " + this.kills +
        "\nTime: " + this.elapsed.toFixed(1) + "s";
      this.showScreen("screen-win");
    },
    gameOver() {
      this.state = "over";
      document.getElementById("over-stats").textContent =
        "You reached " + (JH.LEVEL1.waves[Math.max(0, this.waveIndex)].name) +
        "\nEnemies hosed: " + this.kills;
      this.audio.play("die");
      this.showScreen("screen-over");
    },
    togglePause() {
      if (this.state === "play") { this.state = "pause"; this.showScreen("screen-pause"); }
      else if (this.state === "pause") { this.state = "play"; this.showScreen("hud"); }
    },

    // ============================================================ LOOP
    frame(now) {
      if (!this.running) return;
      let dt = (now - this.lastT) / 1000;
      this.lastT = now;
      if (dt > 0.25) dt = 0.25;          // tab-switch guard
      this.acc += dt;
      let steps = 0;
      while (this.acc >= JH.FIXED_DT && steps < JH.MAX_STEPS) {
        this.update(JH.FIXED_DT);
        this.acc -= JH.FIXED_DT;
        steps++;
      }
      this.render();
      requestAnimationFrame((t) => this.frame(t));
    },

    update(dt) {
      this.input.poll();

      // pause toggle works in play/pause
      if (this.input.pressed("pause") && (this.state === "play" || this.state === "pause"))
        this.togglePause();

      if (this.bannerTimer > 0) {
        this.bannerTimer -= dt;
        if (this.bannerTimer <= 0) document.getElementById("banner").classList.add("hidden");
      }
      if (this.shakeAmt > 0) this.shakeAmt = Math.max(0, this.shakeAmt - 24 * dt);

      if (this.state !== "play") { this.updateHUD(); return; }

      this.elapsed += dt;

      // --- entities
      this.player.update(dt, this);
      for (const e of this.enemies) e.update(dt, this);
      this.embers = this.embers.filter((p) => p.update(dt, this));
      this.pickups = this.pickups.filter((p) => p.update(dt, this));
      this.particles = this.particles.filter((p) => p.update(dt));

      // --- hydrant timers + walk-up shop vendor
      for (const h of this.hydrants) h.t += dt;
      if (this.shopNpc) {
        this.shopNpc.update(dt);
        this.nearShop = Math.abs(this.player.x - this.shopNpc.x) < JH.SHOP.range &&
          Math.abs(this.player.y - this.shopNpc.y) < 30;
        this.player.nearShop = this.nearShop;
        if (this.nearShop) {
          const U = JH.Upgrades;
          const sel = U.nodes.filter((n) => U.isAvailable(n.id));
          if (sel.length > 0) {
            if (this.input.pressed("up"))   this.shopCursor = (this.shopCursor - 1 + sel.length) % sel.length;
            if (this.input.pressed("down")) this.shopCursor = (this.shopCursor + 1) % sel.length;
            if (this.input.pressed("confirm")) {
              const node = sel[this.shopCursor];
              if (node && U.buy(node.id, this.player)) {
                this.audio.play("buy");
                const newSel = U.nodes.filter((n) => U.isAvailable(n.id));
                this.shopCursor = Math.min(this.shopCursor, Math.max(0, newSel.length - 1));
              } else {
                this.audio.play("hurt");
              }
            }
          }
        }
      } else { this.nearShop = false; this.player.nearShop = false; }

      // --- separation so enemies don't fully stack
      this.separate();

      // --- cull dead enemies
      this.enemies = this.enemies.filter((e) => !e.dead);

      // --- camera
      JH.Camera.follow(this.player);

      // --- wave logic
      if (!this.waveActive) {
        this.checkWaveTrigger();
      } else {
        const wave = JH.LEVEL1.waves[this.waveIndex];
        if (wave && wave.wall) {
          if (this.wall && !this.wall.dead) {
            this.wall.update(dt);
            // Keep pressure on: respawn reinforcements up to a concurrent cap.
            this.wallSpawnTimer -= dt;
            if (this.wallSpawnTimer <= 0 && this.enemies.length < JH.WALL.maxAlive) {
              this.wallSpawnTimer = JH.WALL.spawnEvery;
              const type = this.wallPool[(Math.random() * this.wallPool.length) | 0] || "mook";
              const ey = JH.DEPTH_MIN + 8 + Math.random() * (JH.DEPTH_MAX - JH.DEPTH_MIN - 16);
              const e = this.spawnEnemy(type, this.wall.x - 16, ey, { infinite: true, elite: wave.tough });
              e.spawnGrace = 0.2;
            }
          }
          if (!this.wall || this.wall.dead) this.waveCleared_();
        } else if (this.enemies.length === 0) {
          this.waveCleared_();
        }
      }

      // --- death
      if (!this.player.alive) this.gameOver();

      this.updateHUD();
    },

    // Soft push-apart to keep a beat-em-up crowd readable.
    separate() {
      const a = this.enemies;
      for (let i = 0; i < a.length; i++) {
        for (let j = i + 1; j < a.length; j++) {
          const e1 = a[i], e2 = a[j];
          const dx = e2.x - e1.x, dy = e2.y - e1.y;
          const minX = (e1.bodyW + e2.bodyW) * 0.5, minY = 10;
          if (Math.abs(dx) < minX && Math.abs(dy) < minY) {
            const push = (minX - Math.abs(dx)) * 0.5 + 0.2;
            const s = dx >= 0 ? 1 : -1;
            e1.x -= s * push * 0.5; e2.x += s * push * 0.5;
          }
        }
      }
    },

    updateHUD() {
      if (!this.player) return;
      const hud = document.getElementById("hud");
      if (hud) hud.style.visibility = (this.state === "play" && this.nearShop) ? "hidden" : "";
      document.getElementById("hud-suds").textContent = Math.floor(this.player.suds);
    },

    // ============================================================ RENDER
    render() {
      const ctx = this.ctx;
      ctx.save();
      // screen shake
      if (this.shakeAmt > 0) {
        ctx.translate((Math.random() - 0.5) * this.shakeAmt, (Math.random() - 0.5) * this.shakeAmt);
      }
      ctx.clearRect(-12, -12, JH.VIEW_W + 24, JH.VIEW_H + 24);

      JH.Background.draw(ctx);

      if (this.player) {
        const cam = JH.Camera.x;

        // hydrants (static world props, behind actors)
        this.drawHydrants(ctx, cam);

        // barricade (if a wall encounter is active)
        if (this.wall) this.wall.draw(ctx, cam);

        // ground pickups first
        for (const p of this.pickups) p.draw(ctx, cam);

        // depth-sort actors (enemies + player + vendor) by world Y
        const actors = this.enemies.slice();
        actors.push(this.player);
        if (this.shopNpc) actors.push(this.shopNpc);
        actors.sort((m, n) => m.y - n.y);
        for (const e of actors) if (e.draw) e.draw(ctx, cam);

        // projectiles + particles on top
        for (const p of this.embers) p.draw(ctx, cam);
        for (const p of this.particles) p.draw(ctx, cam);

        // interact prompt over the vendor
        if (this.shopNpc && this.state === "play") this.drawShopPrompt(ctx, cam);

        // "GO!" prompt when free to advance
        if (this.state === "play" && !this.waveActive && this.waveIndex + 1 < JH.LEVEL1.waves.length && !this.nearShop) {
          this.drawGoArrow(ctx);
        }
        // boss health bar
        const boss = this.enemies.find((e) => e.isBoss);
        if (boss) this.drawBossBar(ctx, boss);
      }
      ctx.restore();

      // Hover shop panel — drawn outside shake transform so it stays stable.
      if (this.nearShop && this.state === "play") this.drawHoverShop(this.ctx);
    },

    drawHydrants(ctx, cam) {
      for (const h of this.hydrants) {
        const sx = h.x - cam;
        if (sx < -20 || sx > JH.VIEW_W + 20) continue;
        const active = this.player && this.player.nearHydrant === h;
        JH.Assets.shadow(ctx, sx, JH.Geo.feetScreenY(h.y, 0), 7);
        JH.Assets.draw(ctx, "hydrant", sx, JH.Geo.feetScreenY(h.y, 0), 1, {});
        // glow + "FILL" tag when actively refilling
        if (active) {
          const fy = JH.Geo.feetScreenY(h.y, 0) - 24 + Math.sin(h.t * 8) * 1.5;
          ctx.fillStyle = "#9be8ff";
          ctx.font = "bold 7px monospace";
          ctx.textAlign = "center";
          ctx.fillText("REFILL", sx, fy);
          ctx.textAlign = "left";
        }
      }
    },

    drawShopPrompt(ctx, cam) {
      const n = this.shopNpc;
      const sx = n.x - cam;
      if (sx < -30 || sx > JH.VIEW_W + 30) return;
      const baseY = JH.Geo.feetScreenY(n.y, 0) - 40;
      ctx.textAlign = "center";
      ctx.font = "bold 7px monospace";
      ctx.fillStyle = "#ffd23f";
      ctx.fillText("SHOP", sx + 6, baseY - 8);
      ctx.textAlign = "left";
    },

    drawGoArrow(ctx) {
      const t = performance.now() / 300;
      const x = JH.VIEW_W - 40 + Math.sin(t) * 4;
      ctx.fillStyle = "#ffd23f";
      ctx.font = "bold 16px monospace";
      ctx.fillText("GO", x - 6, 60);
      ctx.beginPath();
      ctx.moveTo(x + 14, 50); ctx.lineTo(x + 26, 56); ctx.lineTo(x + 14, 62);
      ctx.closePath(); ctx.fill();
    },

    drawHoverShop(ctx) {
      const U = JH.Upgrades, pl = this.player;
      const selectable = U.nodes.filter((n) => U.isAvailable(n.id));
      if (selectable.length > 0)
        this.shopCursor = Math.max(0, Math.min(selectable.length - 1, this.shopCursor));

      const PX = 280, PY = 6, PW = 194, PH = 258, MID = PX + PW / 2;

      // Panel background + border
      ctx.fillStyle = "rgba(8,12,20,0.94)";
      ctx.fillRect(PX, PY, PW, PH);
      ctx.strokeStyle = "#ffd23f";
      ctx.lineWidth = 1;
      ctx.strokeRect(PX, PY, PW, PH);

      // Header
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd23f";
      ctx.font = "bold 7px monospace";
      ctx.fillText("OLD SPIGOT'S DEPOT", MID, PY + 9);
      // Coin + suds count
      ctx.fillStyle = "#ffd23f";
      ctx.fillRect(Math.round(MID - 22), PY + 13, 5, 5);
      ctx.fillStyle = "#caa015";
      ctx.fillRect(Math.round(MID - 22), PY + 16, 5, 1);
      ctx.fillStyle = "#fff7c2";
      ctx.fillRect(Math.round(MID - 21), PY + 14, 2, 2);
      ctx.fillStyle = "#9be8ff";
      ctx.font = "6px monospace";
      ctx.fillText(Math.floor(pl.suds) + " suds", MID + 2, PY + 19);
      ctx.textAlign = "left";
      // Separator
      ctx.fillStyle = "#334455";
      ctx.fillRect(PX + 4, PY + 22, PW - 8, 1);

      let ry = PY + 26;
      U.branches.forEach((branch) => {
        const nodes = U.nodesByBranch(branch);
        ctx.fillStyle = "#445566";
        ctx.font = "5px monospace";
        ctx.textAlign = "center";
        ctx.fillText("── " + branch + " ──", MID, ry + 5);
        ctx.textAlign = "left";
        ry += 7;

        nodes.forEach((n) => {
          const owned = U.isOwned(n.id);
          const locked = U.isLocked(n.id);
          const avail = U.isAvailable(n.id);
          const afford = avail && pl.suds >= n.cost;
          const selIdx = selectable.findIndex((s) => s.id === n.id);
          const isCursor = selIdx >= 0 && selIdx === this.shopCursor;

          if (isCursor) {
            ctx.fillStyle = afford ? "rgba(255,210,63,0.18)" : "rgba(220,80,60,0.14)";
            ctx.fillRect(PX + 2, ry, PW - 4, 11);
          }

          ctx.font = "bold 6px monospace";
          ctx.fillStyle = owned ? "#55bb55" : locked ? "#3a4a5a" : afford ? "#ffffff" : "#aa6655";
          const mark = owned ? "✓" : locked ? "▸" : "•";
          ctx.fillText(mark + " " + n.name, PX + 5, ry + 8);

          if (!owned) {
            ctx.textAlign = "right";
            ctx.fillStyle = locked ? "#3a4a5a" : afford ? "#ffd23f" : "#cc4444";
            ctx.fillText(locked ? "?" : n.cost, PX + PW - 4, ry + 8);
            ctx.textAlign = "left";
          }
          ry += 11;
        });
      });

      // Separator
      ctx.fillStyle = "#334455";
      ctx.fillRect(PX + 4, ry + 1, PW - 8, 1);
      ry += 4;

      // Description of selected node
      const curNode = selectable[this.shopCursor];
      if (curNode) {
        ctx.fillStyle = "#778899";
        ctx.font = "5px monospace";
        const d = curNode.desc;
        const wrap = d.length > 34 ? d.lastIndexOf(" ", 34) : -1;
        if (wrap > 0) {
          ctx.fillText(d.slice(0, wrap), PX + 5, ry + 5);
          ctx.fillText(d.slice(wrap + 1), PX + 5, ry + 11);
        } else {
          ctx.fillText(d, PX + 5, ry + 5);
        }
      }

      // Footer hint
      ctx.fillStyle = selectable.length ? "#445566" : "#44aa44";
      ctx.font = "5px monospace";
      ctx.textAlign = "center";
      ctx.fillText(selectable.length ? "▲▼ SELECT   [E] BUY" : "FULLY KITTED OUT!", MID, PY + PH - 5);
      ctx.textAlign = "left";
    },

    drawBossBar(ctx, boss) {
      const w = JH.VIEW_W - 80, x = 40, y = 18;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(x - 2, y - 2, w + 4, 10);
      ctx.fillStyle = "#5a1f1f";
      ctx.fillRect(x, y, w, 6);
      ctx.fillStyle = "#ff5a5a";
      ctx.fillRect(x, y, w * clamp(boss.hp / boss.maxHp, 0, 1), 6);
      ctx.fillStyle = "#fff";
      ctx.font = "6px monospace";
      ctx.fillText(((boss.def && boss.def.name) || "BOSS").toUpperCase(), x, y - 4);
    },
  };

  JH.Game = Game;
})();
