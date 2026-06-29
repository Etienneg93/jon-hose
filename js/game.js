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
  const WAVE_TRIGGERS = [360, 840, 1320, 1800, 2300, 2820, 3340, 3860, 4380, 4920, 5440, 5960, 6480, 7000];
  if (WAVE_TRIGGERS.length !== JH.LEVEL1.waves.length)
    console.warn("WAVE_TRIGGERS length (" + WAVE_TRIGGERS.length + ") !== waves length (" + JH.LEVEL1.waves.length + ") — progression will break");

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
    devMenu: false, devCursor: 0,
    dyingBoss: null, deathSeqT: 0,
    checkpointWave: 0,

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

      // ---- dev menu: localhost-only, backtick toggles wave-select overlay ----
      const h = window.location.hostname;
      const isDev = h === "localhost" || h === "127.0.0.1" || h === "";
      if (!isDev) return;
      window.addEventListener("keydown", (e) => {
        if (e.code === "Backquote") {
          e.preventDefault();
          if (this.state === "title" || this.state === "over" || this.state === "win")
            this.startGame();
          this.devMenu = !this.devMenu;
          if (this.devMenu) this.devCursor = 0;
          return;
        }
        // K — instantly kill the active boss to test the death sequence
        if (e.code === "KeyK" && this.state === "play") {
          const b = this.enemies.find((en) => en.isBoss && !en.dead && !en.dying);
          if (b) { e.preventDefault(); b.hp = 0; b.die(this); }
          return;
        }
        if (!this.devMenu) return;
        const count = JH.LEVEL1.waves.length + 3;  // +1 cutscene, +1 target range, +1 wall boss
        if (e.code === "ArrowUp")                     { e.preventDefault(); this.devCursor = (this.devCursor - 1 + count) % count; }
        if (e.code === "ArrowDown")                   { e.preventDefault(); this.devCursor = (this.devCursor + 1) % count; }
        if (e.code === "Enter" || e.code === "NumpadEnter") {
          e.preventDefault();
          if (this.devCursor === JH.LEVEL1.waves.length) this.devTriggerCutscene();
          else if (this.devCursor === JH.LEVEL1.waves.length + 1) this.devGotoRange();
          else if (this.devCursor === JH.LEVEL1.waves.length + 2) this.devGotoWallBoss();
          else this.devGotoWave(this.devCursor);
        }
        if (e.code === "Escape")                      { e.preventDefault(); this.devMenu = false; }
      });
    },

    devTriggerCutscene() {
      this.startGame();
      this.state = "cutscene";
      this.cutscene = { phase: 0, nextWave: 10 };
      document.getElementById("hud").classList.add("hidden");
      document.getElementById("banner").classList.add("hidden");
      this.devMenu = false;
    },

    devGotoWave(i) {
      const waves = JH.LEVEL1.waves;
      i = Math.max(0, Math.min(waves.length - 1, i));
      this.startGame();
      // Position player just before the wave trigger
      const px = Math.max(60, WAVE_TRIGGERS[i] - 80);
      this.player.x = px;
      this.player.y = JH.DEPTH_MAX * 0.5;
      this.player.suds = 999;   // enough to test any upgrade
      // Snap camera so startWave locks the right arena window
      JH.Camera.x = Math.max(0, px - Math.floor(JH.VIEW_W * 0.38));
      JH.Camera.locked = false;
      this.waveIndex = i - 1;
      this.startWave(i);
      this.devMenu = false;
    },

    devGotoRange() {
      this.startGame();
      const py = Math.round(JH.DEPTH_MAX * 0.5);
      this.player.x = 100;
      this.player.y = py;
      this.player.suds = 999;
      JH.Camera.x = 0;
      JH.Camera.locked = false;
      // Use last wave index so checkWaveTrigger never fires in this range.
      this.waveIndex = JH.LEVEL1.waves.length - 1;
      this.waveActive = false;
      this.bounds = { minX: 8, maxX: 900 };
      // Isolated dummy for basic pierce / splash testing
      this.spawnEnemy("dummy", 320, py);
      // Group of three: two in-line (pierce) + one off-depth (split stream)
      const gx = 460, gy = py;
      this.spawnEnemy("dummy", gx,      gy);       // front  — primary target
      this.spawnEnemy("dummy", gx + 40, gy);       // behind — pierce target
      this.spawnEnemy("dummy", gx,      gy - 28);  // off-depth — split stream target
      // Hydrant just in front of the group
      this.hydrants.push({ x: gx - 55, y: gy, t: 0 });
      // Shop NPC visible from spawn
      this.shopNpc = new JH.ShopNPC(220, JH.DEPTH_MIN + 6);
      this.banner("TARGET RANGE  — HOSE MECHANICS TEST", 2.2);
      this.devMenu = false;
    },

    // Standalone test arena for the wall boss (not in the wave list yet).
    devGotoWallBoss() {
      this.startGame();
      const px = 200;
      this.player.x = px;
      this.player.y = JH.DEPTH_MAX * 0.5;
      this.player.suds = 999;
      JH.Camera.x = Math.max(0, px - Math.floor(JH.VIEW_W * 0.38));
      this.waveActive = true;
      this.waveCleared = false;
      this.waveIndex = JH.LEVEL1.waves.length - 1;  // killing it routes to win(); checkWaveTrigger stays quiet
      JH.Camera.lock();
      const left = JH.Camera.x + 20, right = JH.Camera.x + JH.VIEW_W - 20;
      this.bounds = { minX: left, maxX: right };
      this.dropBudget = { suds: 10, items: 5 };
      JH.Music.setTrack("boss");
      this.banner(JH.WALLBOSS.name.toUpperCase(), 1.8);
      this.spawnEnemy("wallboss", right - 20, JH.DEPTH_MAX - 30);
      this.devMenu = false;
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

    startBossDeathSeq(boss) {
      this.state = "bossDeathSeq";
      this.dyingBoss = boss;
      this.deathSeqT = 0;
      this.shake(6);
    },

    updateBossDeathSeq(dt) {
      const t = (this.deathSeqT += dt);
      if (t >= 1.2 && t - dt < 1.2) this.shake(10);
      if (t >= 1.5) {
        const boss = this.dyingBoss;
        boss.dead = true;
        boss.dying = false;
        this.dyingBoss = null;
        this.deathSeqT = 0;
        this.state = "play";
        this.onEnemyKilled(boss);
      }
    },

    // Celebratory feedback when an upgrade node is purchased: rising chime,
    // a name banner, and a suds-coloured sparkle burst at the player.
    upgradeFx(node) {
      this.audio.play("upgrade");
      if (node && node.name) this.banner(node.name.toUpperCase() + " ACQUIRED!", 1.3);
      const p = this.player;
      if (p) {
        JH.burst(this, p.x, p.y, 18, JH.PAL.suds,    16, { speed: 70, life: 0.6, up: 70, size: 2 });
        JH.burst(this, p.x, p.y, 24, JH.PAL.waterHi, 10, { speed: 50, life: 0.5, up: 55, size: 2 });
      }
      this.shake(3);
    },

    // ------------------------------------------------------- new game
    startGame() {
      JH.Upgrades.reset();
      JH.Camera.reset();
      this.player = new JH.Player(60, JH.DEPTH_MAX - 24);
      this.enemies = []; this.embers = []; this.pickups = []; this.particles = [];
      this.deferredQueue = [];
      this.hitStopTimer = 0;
      this.hydrants = JH.HYDRANTS.map((h) => ({ x: h.x, y: h.y, t: 0 }));
      this.shopNpc = null; this.nearShop = false; this.shopCursor = 0;
      this.wall = null; this.gardens = [];
      this.gardensCleared = 0; this.concertaUnlocked = false;
      this.cutscene = null;
      this.dropBudget = { suds: 0, items: 0 };
      this.waveIndex = -1; this.waveActive = false; this.waveCleared = false;
      this.checkpointWave = 0;
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
      this.checkpointWave = JH.Balance.actStartForWave(i, JH.ACT_STARTS);
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

      if (wave.garden) {
        // Garden event: 4 planter boxes spread across arena at alternating depths.
        // Player must approach each box's depth to water it. Neighbor throws rocks!
        const xs = [left + 70, left + 172, left + 274, left + 370];
        const ys = [JH.DEPTH_MIN + 14, JH.DEPTH_MAX - 14, JH.DEPTH_MIN + 22, JH.DEPTH_MAX - 22];
        this.gardens = xs.map((x, i) => new JH.GardenBox(x, ys[i], i));
        this.dropBudget = { suds: 0, items: 0 };
        // Neighbor stands near the left side, periodically hurls rocks
        const nb = this.spawnEnemy("neighbor", left + 28, JH.DEPTH_MAX * 0.4);
        nb.spawnGrace = 1.0;
        this.banner("WATER ALL 4 CROPS!  DODGE THE ROCKS!", 2.8);
      } else if (wave.wall) {
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
        const bdef = bt === "switch" ? JH.SWITCH : bt === "quake" ? JH.QUAKE : bt === "gatewaykrusher" ? JH.GATEWAYKRUSHER : bt === "wallboss" ? JH.WALLBOSS : JH.BOSS;
        this.dropBudget = { suds: 10, items: 5 };             // caps summon farming
        this.banner(bdef.name.toUpperCase(), 1.8);
        this.spawnEnemy(bt, right - 20, JH.DEPTH_MAX - 30);
      } else {
        this.banner(wave.name + (wave.tough ? " — ELITES!" : " — FIGHT!"), 1.3);
        const actLevel = JH.Balance.actLevelForWave(this.waveIndex);
        const ownedCount = Object.keys(JH.Upgrades.owned).length;
        const eliteScale = wave.tough
          ? JH.Balance.eliteScale(actLevel, ownedCount) : null;
        let slot = 0;
        const spawnList = JH.Balance.capEnemyType(
          wave.spawns, "charger", JH.WAVECAP.charger, "mook");
        spawnList.forEach((grp) => {
          for (let k = 0; k < grp.count; k++) {
            const ex = right - 6 - (slot % 3) * 16 + Math.random() * 10;
            const ey = JH.DEPTH_MIN + 8 + ((slot * 27) % (JH.DEPTH_MAX - JH.DEPTH_MIN - 16));
            const e = this.spawnEnemy(grp.type, clamp(ex, left, right), ey, { elite: eliteScale });
            e.spawnGrace = 0.3 + slot * 0.25; // stagger entrances
            slot++;
          }
        });
      }
    },

    waveCleared_() {
      JH.Music.setTrack("level");
      this.waveActive = false;

      // After Quake Walker (index 9), play his ally cutscene before continuing.
      if (this.waveIndex === 9) {
        JH.Camera.unlock();
        this.state = "cutscene";
        this.cutscene = { phase: 0, nextWave: 10 };
        document.getElementById("hud").classList.add("hidden");
        document.getElementById("banner").classList.add("hidden");
        return;
      }

      const clearedWave = JH.LEVEL1.waves[this.waveIndex];
      if (clearedWave) {
        document.getElementById("hud-wave").textContent = clearedWave.name;
        document.getElementById("hud-wave-label").classList.remove("hidden");
      }
      this.wall = null; this.gardens = []; // barricade / gardens (if any) are done
      JH.Camera.unlock();
      // The LAST wave (final boss) wins; a mid-boss just continues.
      if (this.waveIndex >= JH.LEVEL1.waves.length - 1) { this.win(); return; }

      // Free-walk onward; drop a shop vendor — but NOT after the first
      // introductory wave (only from wave 2 onward).
      const next = this.waveIndex + 1;
      this.bounds = { minX: 8, maxX: WAVE_TRIGGERS[next] + 30 };
      if (this.waveIndex >= 1) {
        this.shopNpc = new JH.ShopNPC(WAVE_TRIGGERS[next] - 150, JH.DEPTH_MIN + 6);
        // Don't clobber a high-priority banner (e.g. CONCERTA UNLOCKED) that's still showing
        const isBoss = !!(clearedWave && clearedWave.boss);
        const clearText = isBoss ? "BOSS DOWN!" : "AREA CLEAR!";
        const clearDur  = isBoss ? 2.0 : 1.6;
        const delay = Math.max(0, this.bannerTimer - 1.0);
        if (delay > 0) setTimeout(() => this.banner(clearText, clearDur), delay * 1000);
        else this.banner(clearText, clearDur);
      } else {
        this.banner("AREA CLEAR!", 1.2);
      }
    },

    // ------------------------------------------------------- cutscene
    afterCutscene(nextWaveIdx) {
      this.cutscene = null;
      this.state = "play";
      const clearedWave = JH.LEVEL1.waves[9];
      if (clearedWave) {
        document.getElementById("hud-wave").textContent = clearedWave.name;
        document.getElementById("hud-wave-label").classList.remove("hidden");
      }
      this.bounds = { minX: 8, maxX: WAVE_TRIGGERS[nextWaveIdx] + 30 };
      this.shopNpc = new JH.ShopNPC(WAVE_TRIGGERS[nextWaveIdx] - 150, JH.DEPTH_MIN + 6);
      this.showScreen("hud");
      this.banner("QUAKE WALKER JOINS YOUR SIDE!", 2.4);
    },

    drawCutscene(ctx) {
      const cs = this.cutscene;
      if (!cs) return;
      const lines = [
        ["...You're stronger than I expected.", "I underestimated you."],
        ["The quake in my heart...", "You've silenced it."],
        ["I'll fight by your side.", "Let's save this world."],
      ];
      const phase = clamp(cs.phase, 0, lines.length - 1);

      // Full-screen dark overlay
      ctx.fillStyle = "rgba(0,0,0,0.88)";
      ctx.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H);

      // Portrait box (MGS-style, left side)
      const PX = 10, PY = 10, PW = 96, PH = 108;
      ctx.fillStyle = "#111a11";
      ctx.fillRect(PX, PY, PW, PH);
      ctx.strokeStyle = "#e0902f";
      ctx.lineWidth = 2;
      ctx.strokeRect(PX, PY, PW, PH);

      // Quake Walker portrait (talking = first 2s of each phase)
      const talking = (cs.timer || 0) < 2.0;
      this.drawQuakePortrait(ctx, PX, PY, PW, PH, talking, cs.timer || 0);

      // Character name tag
      ctx.fillStyle = "#e0902f";
      ctx.font = "bold 7px monospace";
      ctx.textAlign = "left";
      ctx.fillText("QUAKE WALKER", PX, PY + PH + 9);

      // Dialogue box
      const DX = PX + PW + 8, DY = PY, DW = JH.VIEW_W - DX - 10, DH = PH;
      ctx.fillStyle = "#080d08";
      ctx.fillRect(DX, DY, DW, DH);
      ctx.strokeStyle = "#2a4a2a";
      ctx.lineWidth = 1;
      ctx.strokeRect(DX, DY, DW, DH);

      // Dialogue text lines
      ctx.fillStyle = "#cceecc";
      ctx.font = "6px monospace";
      const dl = lines[phase];
      ctx.fillText(dl[0], DX + 6, DY + 18);
      if (dl[1]) ctx.fillText(dl[1], DX + 6, DY + 30);

      // Blinking advance prompt
      if (Math.floor(performance.now() / 500) % 2) {
        ctx.fillStyle = "#557755";
        ctx.font = "5px monospace";
        ctx.textAlign = "right";
        ctx.fillText("[ E ]  ADVANCE", DX + DW - 4, DY + DH - 5);
        ctx.textAlign = "left";
      }

      // Phase dots
      for (let i = 0; i < lines.length; i++) {
        ctx.fillStyle = i <= phase ? "#e0902f" : "#3a3020";
        ctx.fillRect(PX + i * 7, PY + PH + 13, 5, 5);
      }
    },

    drawQuakePortrait(ctx, px, py, pw, ph, talking, t) {
      const mouthOpen = talking && (Math.floor(t * 7) & 1);
      const img = JH.getQuakePortrait ? JH.getQuakePortrait(mouthOpen) : null;
      if (img && img._ready) {
        ctx.drawImage(img, px, py, pw, ph);
      } else {
        // Procedural fallback while images load
        const cx = px + pw / 2, cy = py + ph - 4;
        const C = JH.PAL.quakeBody, D = JH.PAL.quakeDk, HI = JH.PAL.quakeHi;
        const f = (lx, ly, w, h, col) => {
          ctx.fillStyle = col;
          ctx.fillRect(Math.round(cx + lx), Math.round(cy - ly - h), w, h);
        };
        f(-38, 0, 76, 28, C); f(-38, 0, 76, 6, D); f(-38, 22, 76, 6, D);
        f(-26, 6, 52, 14, "#3a3e45");
        f(-48, 10, 12, 26, D); f(36, 10, 12, 26, D);
        f(-22, 28, 44, 36, C); f(-22, 28, 44, 7, D);
        f(-18, 40, 12, 10, "#ff5a5a"); f( 6, 40, 12, 10, "#ff5a5a");
        f(-14, 34, 28, 4, D);
        f(-20, 58, 6, 4, HI); f(14, 58, 6, 4, HI);
        f(-20, 26, 4, 4, HI); f(16, 26, 4, 4, HI);
      }
    },

    // ------------------------------------------------------- spawning
    spawnEnemy(type, x, y, opts) {
      const e = JH.makeEnemy(type, x, y);
      if (opts) {
        if (opts.infinite) e.infinite = true;
        if (opts.elite && e.makeElite) e.makeElite(opts.elite === true ? undefined : opts.elite);
      }
      this.enemies.push(e);
      return e;
    },
    spawnPickup(kind, x, y, value) {
      this.pickups.push(new JH.Pickup(kind, x, y, value));
    },
    onEnemyKilled(e) {
      this.kills++;
      if (e && e.isBoss && JH.Church) JH.Church.markBossDefeated(e.type);
    },

    // Loot with anti-farm: scripted-wave enemies always drop; "infinite"
    // spawns (boss summons + wall-zone reinforcements) share a per-encounter
    // budget, so steady killing is rewarded but idle farming dries up.
    dropLoot(e) {
      // Concerta pill: 8% chance from elite enemies once the garden unlocks it
      if (e.elite && !e.isBoss && this.concertaUnlocked && Math.random() < 0.08)
        this.spawnPickup("pill", e.x, e.y, 1);
      if (e.infinite) {
        const b = this.dropBudget;
        if (b && b.suds > 0) { JH.spawnSudsCoins(this, e.x, e.y, e.def.suds); b.suds--; }
        if (b && b.items > 0) {
          const r = Math.random();
          if (r < 0.25) { this.spawnPickup("health", e.x + 6, e.y, 25); b.items--; }
          else if (r < 0.5) { this.spawnPickup("water_can", e.x - 6, e.y, 40); b.items--; }
        }
      } else {
        JH.spawnSudsCoins(this, e.x, e.y, e.def.suds);
        const t = JH.Balance.dropThresholds(e.def.dropMult);
        const r = Math.random();
        if (r < t.health) this.spawnPickup("health", e.x + 6, e.y, 25);
        else if (r < t.water) this.spawnPickup("water_can", e.x - 6, e.y, 40);
      }
    },
    shake(n) { this.shakeAmt = Math.min(12, this.shakeAmt + n); },

    hitStop(secs) { this.hitStopTimer = Math.max(this.hitStopTimer, secs); },
    defer(delayMs, fn) { this.deferredQueue.push({ rem: delayMs / 1000, fn }); },
    tickDeferred(dt) {
      this.deferredQueue = this.deferredQueue.filter((e) => {
        e.rem -= dt;
        if (e.rem <= 0) { e.fn(); return false; }
        return true;
      });
    },

    // ------------------------------------------------------- shop
    // DEAD CODE: the HTML overlay shop (#screen-shop / renderShop) is no longer
    // wired up — nothing calls openShop. The live shop is the canvas-drawn
    // drawHoverShop() (walk up to the vendor). Kept only for reference; do NOT
    // add shop features here — edit drawHoverShop + shopSelectables instead.
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
            if (U.buy(n.id, this.player)) { this.upgradeFx(n); this.renderShop(); }
            else this.audio.play("hurt");
          });
          col.appendChild(node);
        });
        list.appendChild(col);
      });

      const repCol = document.createElement("div");
      repCol.className = "tree-col";
      repCol.innerHTML = '<div class="tree-head">OVERCHARGE</div>';
      U.repeatables.forEach((n) => {
        const cost = U.repCost(n.id);
        const afford = this.player.suds >= cost;
        const node = document.createElement("div");
        node.className = "tree-node " + (afford ? "buyable" : "cant");
        node.innerHTML =
          '<div class="tn-top"><span class="tn-name">' + n.name +
          (U.repCount[n.id] ? " ×" + U.repCount[n.id] : "") + "</span>" +
          '<span class="tn-cost">💧' + cost + "</span></div>" +
          '<div class="tn-desc">' + n.desc + "</div>";
        node.addEventListener("click", () => {
          if (U.buyRep(n.id, this.player)) { this.audio.play("upgrade"); this.renderShop(); }
          else this.audio.play("hurt");
        });
        repCol.appendChild(node);
      });
      list.appendChild(repCol);

      const conCol = document.createElement("div");
      conCol.className = "tree-col";
      conCol.innerHTML = '<div class="tree-head">SUPPLIES</div>';
      const cons = [
        { key: "medkit", buy: () => {
            const c = JH.CONSUMABLES.medkit;
            if (this.player.suds < c.cost) return false;
            this.player.suds -= c.cost;
            this.player.hp = Math.min(this.player.stats.maxHp, this.player.hp + c.heal);
            return true;
          }, label: () => JH.CONSUMABLES.medkit.name,
          desc: () => "Heal " + JH.CONSUMABLES.medkit.heal + " HP now.",
          cost: () => JH.CONSUMABLES.medkit.cost },
        { key: "pressure", buy: () => {
            const c = JH.CONSUMABLES.pressure;
            if (this.player.suds < c.cost) return false;
            this.player.suds -= c.cost;
            this.player.pressureBuffT = c.dur;
            return true;
          }, label: () => JH.CONSUMABLES.pressure.name,
          desc: () => "+" + Math.round((JH.CONSUMABLES.pressure.mult - 1) * 100) +
                      "% spray dmg for " + JH.CONSUMABLES.pressure.dur + "s of the next fight.",
          cost: () => JH.CONSUMABLES.pressure.cost },
      ];
      cons.forEach((item) => {
        const cost = item.cost();
        const afford = this.player.suds >= cost;
        const node = document.createElement("div");
        node.className = "tree-node " + (afford ? "buyable" : "cant");
        node.innerHTML =
          '<div class="tn-top"><span class="tn-name">' + item.label() + "</span>" +
          '<span class="tn-cost">💧' + cost + "</span></div>" +
          '<div class="tn-desc">' + item.desc() + "</div>";
        node.addEventListener("click", () => {
          if (item.buy()) { this.audio.play("buy"); this.renderShop(); }
          else this.audio.play("hurt");
        });
        conCol.appendChild(node);
      });
      list.appendChild(conCol);

      function connector() { const c = document.createElement("div"); c.className = "tree-link"; return c; }
    },
    // Return from the Church: rebuild the world at the act-start checkpoint.
    // Keeps the player's build (no Upgrades.reset) and Suds.
    respawnAtCheckpoint() {
      const cp = this.checkpointWave || 0;
      JH.Camera.reset();
      const p = this.player;
      p.applyStats(JH.Upgrades.computeStats(JH.Upgrades.owned));
      p.x = WAVE_TRIGGERS[cp] - 40;
      p.y = JH.DEPTH_MAX - 24;
      p.hp = p.stats.maxHp;
      p.water = p.stats.maxWater;
      p.alive = true;
      this.enemies = []; this.embers = []; this.pickups = []; this.particles = [];
      this.deferredQueue = [];
      this.hitStopTimer = 0;
      this.wall = null; this.gardens = [];
      this.shopNpc = null; this.nearShop = false;
      this.dropBudget = { suds: 0, items: 0 };
      this.waveIndex = cp - 1;
      this.waveActive = false; this.waveCleared = false;
      this.bounds = { minX: 8, maxX: WAVE_TRIGGERS[cp] + 30 };
      this.state = "play";
      this.showScreen("hud");
      JH.Music.reset(); JH.Music.start();
      this.banner("BACK TO THE STREET!", 1.4);
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
      if (this.state === "play" || this.state === "bossDeathSeq") this.tickDeferred(dt);

      if (this.state === "bossDeathSeq") {
        this.particles = this.particles.filter((p) => p.update(dt));
        this.embers   = this.embers.filter((p) => p.update(dt, this));
        this.updateBossDeathSeq(dt);
        return;
      }

      if (this.devMenu) return;

      // Cutscene: only E (confirm) advances the dialogue.
      if (this.state === "cutscene") {
        const cs = this.cutscene;
        if (cs) {
          cs.timer = (cs.timer || 0) + dt;
          if (this.input.pressed("confirm") && (cs.timer || 0) > 0.3) {
            cs.phase++;
            cs.timer = 0;
            if (cs.phase >= 3) this.afterCutscene(cs.nextWave);
          }
        }
        return;
      }

      if (this.state !== "play") { this.updateHUD(); return; }

      // Hitstop: freeze entities briefly on impact; embers + particles keep running.
      if (this.hitStopTimer > 0) {
        this.hitStopTimer -= dt;
        this.embers = this.embers.filter((p) => p.update(dt, this));
        this.particles = this.particles.filter((p) => p.update(dt));
        return;
      }

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
          const sel = this.shopSelectables();
          if (sel.length > 0) {
            if (this.input.pressed("up"))   this.shopCursor = (this.shopCursor - 1 + sel.length) % sel.length;
            if (this.input.pressed("down")) this.shopCursor = (this.shopCursor + 1) % sel.length;
            if (this.input.pressed("confirm")) {
              const e = sel[this.shopCursor];
              let ok = false;
              if (e.kind === "node") { ok = U.buy(e.id, this.player); if (ok) this.upgradeFx(U.byId(e.id)); }
              else if (e.kind === "rep") { ok = U.buyRep(e.id, this.player); if (ok) this.audio.play("upgrade"); }
              else if (e.kind === "consumable") { ok = this.buyConsumable(e.id); if (ok) this.audio.play("buy"); }
              if (!ok) this.audio.play("hurt");
              else this.shopCursor = Math.min(this.shopCursor, Math.max(0, this.shopSelectables().length - 1));
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
              const sc = wave.tough
                ? JH.Balance.eliteScale(JH.Balance.actLevelForWave(this.waveIndex), Object.keys(JH.Upgrades.owned).length)
                : null;
              const e = this.spawnEnemy(type, this.wall.x - 16, ey, { infinite: true, elite: sc });
              e.spawnGrace = 0.2;
            }
          }
          if (!this.wall || this.wall.dead) this.waveCleared_();
        } else if (wave && wave.garden) {
          for (const g of this.gardens) g.update(dt);
          if (this.gardens.length > 0 && this.gardens.every((g) => g.done)) {
            // All boxes watered — the neighbor disappears for good, wave clears
            for (const e of this.enemies) {
              if (e.type === "neighbor" && !e.dead) e.die(this);
            }
            this.waveCleared_();
          }
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
          if (e1.isBoss || e2.isBoss) continue;
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

        // garden boxes (if a garden encounter is active)
        if (this.gardens) for (const g of this.gardens) g.draw(ctx, cam);

        // ground pickups first
        for (const p of this.pickups) p.draw(ctx, cam);

        // depth-sort actors (enemies + player + vendor) by world Y
        const actors = this.enemies.slice();
        actors.push(this.player);
        if (this.shopNpc) actors.push(this.shopNpc);
        actors.sort((m, n) => m.y - n.y);
        for (const e of actors) {
          if (!e.draw) continue;
          if (e.dying) {
            const t = this.deathSeqT;
            ctx.save();
            if (t < 0.6) {
              // Rapid white strobe: boss turns pure white on the flash beats
              if (Math.sin(t * Math.PI * 12) > 0)
                ctx.filter = "brightness(20) saturate(0)";
            } else if (t < 1.0) {
              // Brightness ramps back to normal as the boss fades
              const b = 1 + (1 - (t - 0.6) / 0.4) * 19;
              ctx.filter = `brightness(${b.toFixed(1)})`;
            } else {
              // Final fade-out
              ctx.globalAlpha = Math.max(0, 1 - (t - 1.0) / 0.5);
            }
            e.draw(ctx, cam);
            ctx.restore();
          } else {
            e.draw(ctx, cam);
          }
        }

        // projectiles + particles on top
        for (const p of this.embers) p.draw(ctx, cam);
        for (const p of this.particles) p.draw(ctx, cam);

        // interact prompt over the vendor
        if (this.shopNpc && this.state === "play") this.drawShopPrompt(ctx, cam);

        // "GO!" prompt when free to advance
        if (this.state === "play" && !this.waveActive && this.waveIndex + 1 < JH.LEVEL1.waves.length && !this.nearShop) {
          this.drawGoArrow(ctx);
        }
        // boss health bar (hidden while death sequence plays)
        const boss = this.enemies.find((e) => e.isBoss && !e.dying);
        if (boss) this.drawBossBar(ctx, boss);
      }
      ctx.restore();

      // Hover shop panel — drawn outside shake transform so it stays stable.
      if (this.nearShop && this.state === "play") this.drawHoverShop(this.ctx);
      // Cutscene overlay (drawn after everything else).
      if (this.state === "cutscene" && this.cutscene) this.drawCutscene(this.ctx);
      // Dev menu drawn last so it's always on top.
      if (this.devMenu) this.drawDevMenu(this.ctx);
    },

    drawDevMenu(ctx) {
      const waves = JH.LEVEL1.waves;
      const W = 224, ROW = 11, PAD = 14;
      const H = PAD + (waves.length + 3) * ROW + PAD;
      const PX = Math.round((JH.VIEW_W - W) / 2);
      const PY = Math.round((JH.VIEW_H - H) / 2);
      const MID = PX + W / 2;

      // Background panel
      ctx.fillStyle = "rgba(4,7,14,0.95)";
      ctx.fillRect(PX, PY, W, H);
      ctx.strokeStyle = "#ffd23f";
      ctx.lineWidth = 1;
      ctx.strokeRect(PX, PY, W, H);

      // Header
      ctx.fillStyle = "#ffd23f";
      ctx.font = "bold 7px monospace";
      ctx.textAlign = "center";
      ctx.fillText("DEV — JUMP TO WAVE", MID, PY + 9);

      // Wave rows
      waves.forEach((wave, i) => {
        const ry = PY + PAD + i * ROW;
        const sel = i === this.devCursor;
        if (sel) {
          ctx.fillStyle = "rgba(255,210,63,0.18)";
          ctx.fillRect(PX + 3, ry, W - 6, ROW - 1);
        }
        const tag  = wave.boss ? "BOSS " : wave.wall ? "WALL " : "     ";
        ctx.fillStyle = sel ? "#ffd23f" : wave.boss ? "#ff9f40" : wave.wall ? "#c06030" : "#99b0c0";
        ctx.font = (sel ? "bold " : "") + "6px monospace";
        ctx.textAlign = "left";
        ctx.fillText(tag + wave.name, PX + 8, ry + ROW - 3);
        // wave index on the right
        ctx.fillStyle = sel ? "#ffd23f" : "#445566";
        ctx.textAlign = "right";
        ctx.fillText("#" + (i + 1), PX + W - 6, ry + ROW - 3);
      });

      // Extra entry: cutscene test
      const csRy = PY + PAD + waves.length * ROW;
      const csSel = this.devCursor === waves.length;
      if (csSel) { ctx.fillStyle = "rgba(255,120,255,0.18)"; ctx.fillRect(PX + 3, csRy, W - 6, ROW - 1); }
      ctx.fillStyle = csSel ? "#ff88ff" : "#667788";
      ctx.font = (csSel ? "bold " : "") + "6px monospace"; ctx.textAlign = "left";
      ctx.fillText("✦  QUAKE CUTSCENE", PX + 8, csRy + ROW - 3);
      ctx.fillStyle = csSel ? "#ff88ff" : "#445566"; ctx.textAlign = "right";
      ctx.fillText("CS", PX + W - 6, csRy + ROW - 3);

      // Target range entry
      const rangeRy = PY + PAD + (waves.length + 1) * ROW;
      const rangeSel = this.devCursor === waves.length + 1;
      if (rangeSel) { ctx.fillStyle = "rgba(100,220,100,0.18)"; ctx.fillRect(PX + 3, rangeRy, W - 6, ROW - 1); }
      ctx.fillStyle = rangeSel ? "#80ff80" : "#667788";
      ctx.font = (rangeSel ? "bold " : "") + "6px monospace"; ctx.textAlign = "left";
      ctx.fillText("⊕  TARGET RANGE", PX + 8, rangeRy + ROW - 3);
      ctx.fillStyle = rangeSel ? "#80ff80" : "#445566"; ctx.textAlign = "right";
      ctx.fillText("DEV", PX + W - 6, rangeRy + ROW - 3);

      // Wall boss entry (standalone concept — not in the wave list)
      const wbRy = PY + PAD + (waves.length + 2) * ROW;
      const wbSel = this.devCursor === waves.length + 2;
      if (wbSel) { ctx.fillStyle = "rgba(255,90,40,0.18)"; ctx.fillRect(PX + 3, wbRy, W - 6, ROW - 1); }
      ctx.fillStyle = wbSel ? "#ff8a4a" : "#667788";
      ctx.font = (wbSel ? "bold " : "") + "6px monospace"; ctx.textAlign = "left";
      ctx.fillText("▮  FIREWALL", PX + 8, wbRy + ROW - 3);
      ctx.fillStyle = wbSel ? "#ff8a4a" : "#445566"; ctx.textAlign = "right";
      ctx.fillText("DEV", PX + W - 6, wbRy + ROW - 3);

      // Footer hint
      ctx.fillStyle = "#445566";
      ctx.font = "5px monospace";
      ctx.textAlign = "center";
      ctx.fillText("↑↓  navigate    Enter  warp    `  close", MID, PY + H - 4);
      ctx.textAlign = "left";
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

    // Unified, ordered list of everything buyable in the walk-up shop, used by
    // BOTH the purchase input handler and drawHoverShop so the cursor index and
    // the rendered rows never diverge: available skill nodes, then repeatable
    // OVERCHARGE nodes, then SUPPLIES consumables.
    shopSelectables() {
      const U = JH.Upgrades;
      const out = [];
      U.nodes.forEach((n) => { if (U.isAvailable(n.id)) out.push({ kind: "node", id: n.id }); });
      // OVERCHARGE only unlocks once the whole skill tree is bought.
      if (U.allNodesOwned()) U.repeatables.forEach((n) => out.push({ kind: "rep", id: n.id }));
      Object.keys(JH.CONSUMABLES).forEach((k) => out.push({ kind: "consumable", id: k }));
      return out;
    },
    // Buy a between-wave consumable; returns true on success.
    buyConsumable(key) {
      const c = JH.CONSUMABLES[key];
      if (!c || this.player.suds < c.cost) return false;
      this.player.suds -= c.cost;
      if (key === "medkit") this.player.hp = Math.min(this.player.stats.maxHp, this.player.hp + c.heal);
      else if (key === "pressure") this.player.pressureBuffT = c.dur;
      return true;
    },

    drawHoverShop(ctx) {
      const U = JH.Upgrades, pl = this.player;
      const selectable = this.shopSelectables();
      if (selectable.length > 0)
        this.shopCursor = Math.max(0, Math.min(selectable.length - 1, this.shopCursor));
      const cur = selectable[this.shopCursor];

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

      // ---- Build the flat row list (headers + buyable items), then scroll it
      // so the cursor row stays visible (the list now overflows the panel). ----
      const HROW = 7, IROW = 11;
      const rows = [];
      U.branches.forEach((branch) => {
        rows.push({ t: "head", label: "── " + branch + " ──" });
        U.nodesByBranch(branch).forEach((n) => rows.push({ t: "node", n }));
      });
      rows.push({ t: "head", label: "── OVERCHARGE ──" });
      if (U.allNodesOwned()) U.repeatables.forEach((n) => rows.push({ t: "rep", n }));
      else rows.push({ t: "lock", label: "Max the skill tree to unlock" });
      rows.push({ t: "head", label: "── SUPPLIES ──" });
      Object.keys(JH.CONSUMABLES).forEach((k) => rows.push({ t: "con", k }));

      const isCurRow = (r) => cur && (
        (r.t === "node" && cur.kind === "node" && cur.id === r.n.id) ||
        (r.t === "rep" && cur.kind === "rep" && cur.id === r.n.id) ||
        (r.t === "con" && cur.kind === "consumable" && cur.id === r.k));

      let cy = 0, cursorCY = 0;
      rows.forEach((r) => { r.cy = cy; r.h = r.t === "head" ? HROW : IROW; if (isCurRow(r)) cursorCY = cy; cy += r.h; });
      const contentH = cy;

      const viewTop = PY + 26, viewBot = PY + PH - 34, viewH = viewBot - viewTop;
      let scroll = 0;
      if (contentH > viewH) scroll = Math.max(0, Math.min(contentH - viewH, cursorCY - viewH / 2));

      ctx.save();
      ctx.beginPath();
      ctx.rect(PX + 1, viewTop - 1, PW - 2, viewH + 2);
      ctx.clip();
      rows.forEach((r) => {
        const ry = viewTop + r.cy - scroll;
        if (ry + r.h < viewTop - 2 || ry > viewBot + 2) return;   // cull offscreen
        if (r.t === "head") {
          ctx.fillStyle = "#445566"; ctx.font = "5px monospace"; ctx.textAlign = "center";
          ctx.fillText(r.label, MID, ry + 5); ctx.textAlign = "left";
          return;
        }
        if (r.t === "lock") {
          ctx.fillStyle = "#3a4a5a"; ctx.font = "5px monospace"; ctx.textAlign = "center";
          ctx.fillText("🔒 " + r.label, MID, ry + 7); ctx.textAlign = "left";
          return;
        }
        let name, cost, owned = false, locked = false, afford = false, suffix = "";
        if (r.t === "node") {
          const n = r.n;
          owned = U.isOwned(n.id); locked = U.isLocked(n.id);
          afford = U.isAvailable(n.id) && pl.suds >= n.cost;
          name = n.name; cost = n.cost;
        } else if (r.t === "rep") {
          cost = U.repCost(r.n.id); afford = pl.suds >= cost; name = r.n.name;
          if (U.repCount[r.n.id]) suffix = " x" + U.repCount[r.n.id];
        } else {
          const c = JH.CONSUMABLES[r.k]; cost = c.cost; afford = pl.suds >= cost; name = c.name;
        }
        if (isCurRow(r)) {
          ctx.fillStyle = afford ? "rgba(255,210,63,0.18)" : "rgba(220,80,60,0.14)";
          ctx.fillRect(PX + 2, ry, PW - 4, 11);
        }
        ctx.font = "bold 6px monospace";
        ctx.fillStyle = owned ? "#55bb55" : locked ? "#3a4a5a" : afford ? "#ffffff" : "#aa6655";
        const mark = owned ? "✓" : locked ? "▸" : "•";
        ctx.fillText(mark + " " + name + suffix, PX + 5, ry + 8);
        if (!owned) {
          ctx.textAlign = "right";
          ctx.fillStyle = locked ? "#3a4a5a" : afford ? "#ffd23f" : "#cc4444";
          ctx.fillText(locked ? "?" : cost, PX + PW - 4, ry + 8);
          ctx.textAlign = "left";
        }
      });
      ctx.restore();

      // Scroll arrows
      ctx.fillStyle = "#667788"; ctx.font = "5px monospace"; ctx.textAlign = "center";
      if (scroll > 0) ctx.fillText("▲", MID, viewTop + 3);
      if (scroll < contentH - viewH) ctx.fillText("▼", MID, viewBot + 2);
      ctx.textAlign = "left";

      // Separator + description of the selected entry
      const dy = PY + PH - 30;
      ctx.fillStyle = "#334455";
      ctx.fillRect(PX + 4, dy, PW - 8, 1);
      let desc = "";
      if (cur) {
        if (cur.kind === "node") { const n = U.byId(cur.id); desc = n ? n.desc : ""; }
        else if (cur.kind === "rep") { const n = U.repById(cur.id); desc = n ? n.desc : ""; }
        else if (cur.kind === "consumable") {
          const c = JH.CONSUMABLES[cur.id];
          desc = cur.id === "medkit" ? "Heal " + c.heal + " HP now."
            : cur.id === "pressure" ? "+" + Math.round((c.mult - 1) * 100) + "% spray dmg for " + c.dur + "s next fight." : "";
        }
      }
      if (desc) {
        ctx.fillStyle = "#778899";
        ctx.font = "5px monospace";
        const wrap = desc.length > 34 ? desc.lastIndexOf(" ", 34) : -1;
        if (wrap > 0) {
          ctx.fillText(desc.slice(0, wrap), PX + 5, dy + 6);
          ctx.fillText(desc.slice(wrap + 1), PX + 5, dy + 12);
        } else {
          ctx.fillText(desc, PX + 5, dy + 6);
        }
      }

      // Footer hint
      ctx.fillStyle = "#445566";
      ctx.font = "5px monospace";
      ctx.textAlign = "center";
      ctx.fillText("▲▼ SELECT   [E] BUY", MID, PY + PH - 5);
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
