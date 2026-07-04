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
  const WAVE_TRIGGERS = [360, 740, 1120, 1500, 1880, 2260, 2640, 3020, 3400, 3780, 4160, 4540, 4920, 5300, 5680, 6060, 6440, 6820, 7200, 7580, 7960, 8340, 8720, 9100, 9480, 9860, 10240, 10620, 11000];
  if (WAVE_TRIGGERS.length !== JH.LEVEL1.waves.length)
    console.warn("WAVE_TRIGGERS length (" + WAVE_TRIGGERS.length + ") !== waves length (" + JH.LEVEL1.waves.length + ") — progression will break");

  const Game = {
    canvas: null, ctx: null,
    state: "title",
    input: null, audio: null,

    player: null,
    enemies: [], embers: [], pickups: [], particles: [],
    hydrants: [], shopNpc: null, nearShop: false,
    wall: null, wallSpawnTimer: 0, wallPool: [], holdoutTimer: 0,
    dropBudget: { suds: 0, items: 0 },   // anti-farm cap for infinite spawns
    bounds: { minX: 8, maxX: JH.LEVEL_LEN - 8 },

    waveIndex: -1,
    waveActive: false,
    waveCleared: false,
    elapsed: 0, kills: 0,
    trauma: 0, shakeKickX: 0,   // trauma screenshake (see JH.JUICE)
    lootVacuumT: 0,             // wave-ender loot vacuum time remaining
    essenceDim: 0,              // 0..1 world-darken while a Holy Essence cross is uncollected
    bannerTimer: 0,
    shopCursor: 0,
    acc: 0, lastT: 0, running: false,
    devMenu: false, devCursor: 0,
    dyingBoss: null, deathSeqT: 0,
    checkpointWave: 0,
    diedWave: 0, lastHydrantX: 0, worldFadeT: 0, warpInT: 0,
    victoryPortal: null,   // post-Slayer exit portal {x, y, t, near}

    // ------------------------------------------------------------- setup
    init() {
      this.canvas = document.getElementById("game");
      this.ctx = this.canvas.getContext("2d");
      this.ctx.imageSmoothingEnabled = false;
      if (JH.Church) JH.Church.load();
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
          const a = el.getAttribute("data-action");
          // Gate the title "start" until every tracked image has settled.
          if (a === "start" && !JH.Loader.ready()) return;
          startAudio();
          if (a === "start" || a === "retry") this.startGame();
          else if (a === "resume") this.closeShop();
          else if (a === "resume-pause") this.togglePause();
        });
      });

      // Asset preloader gate: keep the title "PRESS START" disabled, showing
      // progress, until all shipped images have loaded (or 404'd).
      const startBtn = document.querySelector('#screen-title [data-action="start"]');
      if (startBtn) {
        const updateGate = () => {
          if (JH.Loader.ready()) {
            startBtn.disabled = false;
            startBtn.textContent = "PRESS START";
          } else {
            startBtn.disabled = true;
            startBtn.textContent = `LOADING… ${JH.Loader.settled}/${JH.Loader.total}`;
          }
        };
        updateGate();
        JH.Loader.onProgress(updateGate);
      }

      // Audio controls (music + SFX volume + mute) on the title & pause menus.
      // Multiple copies stay in sync since we query them all.
      const sync = () => {
        const v = Math.round(JH.Music.volume * 100);
        const sv = Math.round(JH.AudioFX.volume * 100);
        document.querySelectorAll("[data-vol]").forEach((s) => { s.value = v; });
        document.querySelectorAll("[data-volpct]").forEach((s) => { s.textContent = (JH.Music.muted ? 0 : v) + "%"; });
        document.querySelectorAll("[data-sfxvol]").forEach((s) => { s.value = sv; });
        document.querySelectorAll("[data-sfxpct]").forEach((s) => { s.textContent = sv + "%"; });
        document.querySelectorAll("[data-mute]").forEach((b) => { b.textContent = (JH.Music.muted || JH.Music.volume === 0) ? "🔇" : "🔊"; });
      };
      document.querySelectorAll("[data-vol]").forEach((sl) => {
        sl.addEventListener("input", () => { startAudio(); JH.Music.setVolume(sl.value / 100); sync(); });
      });
      document.querySelectorAll("[data-sfxvol]").forEach((sl) => {
        sl.addEventListener("input", () => {
          startAudio();
          JH.AudioFX.setVolume(sl.value / 100);
          sync();
          JH.AudioFX.play("kill");   // test blip so the level is audible while sliding
        });
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
      const quakeIdx = JH.LEVEL1.waves.findIndex((w) => w.bossType === "quake");
      this.cutscene = { phase: 0, nextWave: quakeIdx + 1 };
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
      // No startWave here, so set the act level directly — keeps tier-3
      // nodes buyable at the range's shop.
      JH.Upgrades.currentActLevel = JH.Balance.actLevelForWave(this.waveIndex, JH.ACT_STARTS);
      this.waveActive = false;
      this.bounds = { minX: 8, maxX: 900 };
      // Buff test stations: walk up + press E (see tickRangeStations).
      this.rangeStations = [
        { kind: "kibble", x: 180, y: py, near: false },
        { kind: "gush", x: 230, y: py, near: false },
      ];
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
      // Sprite gallery along the top row: every combat entity as a frozen,
      // unkillable statue for visual inspection (labels via drawRangeStations).
      let gx2 = 300;
      for (const type of ["mook", "charger", "pyro", "stalker", "fuse", "smelt",
                          "bulwark", "furnace", "boss", "switch",
                          "quake", "gatewaykrusher", "slayer"]) {
        const e = JH.makeEnemy(type, 0, JH.DEPTH_MIN + 6);
        e.x = gx2 + e.bodyW / 2;
        gx2 += e.bodyW + 30;
        e.facing = -1;                       // face the approaching player
        e.state = "idle";                    // t keeps ticking → idle anims play
        e.update = function (dt) { this.t += dt; };   // statue: no AI/contact/physics
        e.takeDamage = () => {};                       // display dummy — unkillable
        e.isGallery = true;
        this.enemies.push(e);
      }
      this.bounds.maxX = Math.max(this.bounds.maxX, gx2 + 80);
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
      this.enemies = []; this.embers = []; this.pickups = []; this.particles = []; this.shields = []; this.firePatches = []; this.slowZones = [];
      this.deferredQueue = [];
      this.hitStopTimer = 0;
      this.hydrants = JH.HYDRANTS.map((h) => ({ x: h.x, y: h.y, t: 0 }));
      this.shopNpc = null; this.nearShop = false; this.shopCursor = 0;
      this.wall = null; this.gardens = [];
      this.gardensCleared = 0; this.concertaUnlocked = false;
      this.cutscene = null; this.victoryPortal = null;
      this.rangeStations = null;
      this.dropBudget = { suds: 0, items: 0 };
      this.waveIndex = -1; this.waveActive = false; this.waveCleared = false;
      JH.Upgrades.currentActLevel = -1;             // fresh run starts in Act 1
      this.checkpointWave = 0;
      this.elapsed = 0; this.kills = 0;
      this.trauma = 0; this.shakeKickX = 0; this.lootVacuumT = 0; this.essenceDim = 0;
      this.combo = 0; this.comboTimer = 0; this.comboFlash = 0;
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
      // Shop reads this for the tier-3 act gate.
      JH.Upgrades.currentActLevel = JH.Balance.actLevelForWave(this.waveIndex, JH.ACT_STARTS);
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
      } else if (wave.douse) {
        // Fire set-piece: spray 4 flame sources out while Smelts harass you.
        const xs = [left + 70, left + 172, left + 274, left + 370];
        const ys = [JH.DEPTH_MIN + 14, JH.DEPTH_MAX - 14, JH.DEPTH_MIN + 22, JH.DEPTH_MAX - 22];
        this.gardens = xs.map((x, i) => new JH.GardenBox(x, ys[i], i, { flame: true }));
        this.dropBudget = { suds: 0, items: 0 };
        (wave.spawns || [{ type: "smelt", count: 2 }]).forEach((g) => {
          for (let k = 0; k < g.count; k++) {
            const e = this.spawnEnemy(g.type, left + 40 + k * 30, JH.DEPTH_MAX * 0.4);
            e.spawnGrace = 1.0;
          }
        });
        this.banner("DOUSE ALL 4 FLAMES!", 2.8);
      } else if (wave.wall) {
        // Barricade encounter: wall on the right, enemies keep coming.
        this.bounds = { minX: left, maxX: right - 26 };       // can't pass the wall
        this.wall = new JH.Wall(right - 6, wave.wallHp || JH.WALL.hp);
        this.wallSpawnTimer = 0.4;
        this.wallPool = [];
        wave.spawns.forEach((g) => { for (let k = 0; k < g.count; k++) this.wallPool.push(g.type); });
        this.dropBudget = { suds: 14, items: 7 };             // anti-farm cap
        this.banner("BARRICADE! SMASH THROUGH", 1.6);
      } else if (wave.holdout) {
        // Survival hold-out: reuse the barricade's pool-spawn loop, end on a timer.
        this.holdoutTimer = wave.holdDur || 22;
        this.wallSpawnTimer = 0.4;
        this.wallPool = [];
        wave.spawns.forEach((g) => { for (let k = 0; k < g.count; k++) this.wallPool.push(g.type); });
        this.dropBudget = { suds: 14, items: 7 };            // anti-farm cap
        this.banner("HOLD THE LINE!  SURVIVE!", 1.8);
      } else if (wave.boss) {
        JH.Music.setTrack("boss");
        const bt = wave.bossType || "boss";
        const bdef = bt === "switch" ? JH.SWITCH : bt === "quake" ? JH.QUAKE : bt === "gatewaykrusher" ? JH.GATEWAYKRUSHER : bt === "wallboss" ? JH.WALLBOSS : bt === "slayer" ? JH.SLAYER : JH.BOSS;
        this.dropBudget = { suds: 10, items: 5 };             // caps summon farming
        this.banner(bdef.name.toUpperCase(), 1.8);
        this.spawnEnemy(bt, right - 20, JH.DEPTH_MAX - 30);
      } else {
        this.banner(wave.name + (wave.tough ? " — ELITES!" : " — FIGHT!"), 1.3);
        const actLevel = JH.Balance.actLevelForWave(this.waveIndex, JH.ACT_STARTS);
        const ownedCount = JH.Balance.powerCount(
          JH.Upgrades.owned, JH.Upgrades.repCount, JH.Church && JH.Church.state);
        const eliteScale = wave.tough
          ? JH.Balance.eliteScale(actLevel, ownedCount) : null;
        const spawnList = JH.Balance.capEnemyType(
          wave.spawns, "charger", JH.WAVECAP.charger, "mook");
        // Flatten authored spawns, then sprinkle extras from the unlocked pool
        // on top (variety pass) — the authored list stays the tuned backbone.
        const types = [];
        spawnList.forEach((g) => { for (let k = 0; k < g.count; k++) types.push(g.type); });
        const SPR = JH.SPRINKLE;
        const sprinkleCount = SPR.counts[actLevel + 1] || 0;
        const pool = JH.Balance.unlockedPool(JH.LEVEL1.waves, this.waveIndex);
        const chargerRoom = Math.max(0, JH.WAVECAP.charger - types.filter((t) => t === "charger").length);
        types.push(...JH.Balance.pickSprinkles(pool, sprinkleCount, {
          weights: SPR.weights, heavies: SPR.heavies, heavyCap: SPR.heavyCap,
          typeCaps: { charger: chargerRoom },
        }));
        const depthSpan = JH.DEPTH_MAX - JH.DEPTH_MIN - 16;
        let slot = 0, fuseIdx = 0;
        types.forEach((type) => {
          const ey = JH.DEPTH_MIN + 8 + Math.random() * depthSpan;
          if (type === "fuse") {
            // Fuses drop in at a random arena spot, staggered so they don't
            // all land at once.
            const ex = left + 30 + Math.random() * (right - left - 60);
            this.spawnEnemy(type, ex, ey, {
              elite: eliteScale, dropIn: true, dropDelay: fuseIdx * JH.FUSE_DROP.stagger,
            });
            fuseIdx++;
          } else {
            // Enter from a random screen edge at a random depth.
            const ex = (Math.random() < 0.5) ? left + 6 + Math.random() * 10
                                             : right - 6 - Math.random() * 10;
            const e = this.spawnEnemy(type, ex, ey, { elite: eliteScale });
            e.spawnGrace = 0.3 + slot * 0.25; // stagger entrances
          }
          slot++;
        });
        // Rare apex: at most ONE super-elite, spawned by wave data.
        if (wave.superElite) {
          const ex = (Math.random() < 0.5) ? left + 24 : right - 24;
          const ey = JH.DEPTH_MIN + 10 + Math.random() * (depthSpan - 4);
          const se = this.spawnEnemy(wave.superElite, ex, ey,
            { elite: eliteScale, super: true });
          se.spawnGrace = 0.6;
        }
      }
    },

    waveCleared_() {
      JH.Music.setTrack("level");
      this.waveActive = false;

      // After Quake Walker, play his ally cutscene before continuing.
      const quakeIdx = JH.LEVEL1.waves.findIndex((w) => w.bossType === "quake");
      if (quakeIdx >= 0 && this.waveIndex === quakeIdx) {
        JH.Camera.unlock();
        this.state = "cutscene";
        this.cutscene = { phase: 0, nextWave: quakeIdx + 1 };
        document.getElementById("hud").classList.add("hidden");
        document.getElementById("banner").classList.add("hidden");
        return;
      }

      // After The Slayer, play his ally cutscene before continuing.
      // Dynamic findIndex so this survives wave-list reordering.
      const slayerIdx = JH.LEVEL1.waves.findIndex((w) => w.bossType === "slayer");
      if (slayerIdx >= 0 && this.waveIndex === slayerIdx) {
        JH.Camera.unlock();
        this.state = "cutscene";
        this.cutscene = { phase: 0, nextWave: slayerIdx + 1, who: "slayer" };
        document.getElementById("hud").classList.add("hidden");
        document.getElementById("banner").classList.add("hidden");
        return;
      }

      const clearedWave = JH.LEVEL1.waves[this.waveIndex];
      if (clearedWave) {
        document.getElementById("hud-wave").textContent = clearedWave.name;
        document.getElementById("hud-wave-label").classList.remove("hidden");
      }
      // Mix-up set-pieces award Holy Essence like boss kills do — dropped as
      // a glowing cross pickup (never expires; awards on collect). No banner.
      if (clearedWave && (clearedWave.garden || clearedWave.wall || clearedWave.holdout || clearedWave.douse)) {
        this.spawnPickup("cross", this.player.x + 34, this.player.y, 1);
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
      const quakeIdx = JH.LEVEL1.waves.findIndex((w) => w.bossType === "quake");
      const clearedWave = JH.LEVEL1.waves[quakeIdx];
      if (clearedWave) {
        document.getElementById("hud-wave").textContent = clearedWave.name;
        document.getElementById("hud-wave-label").classList.remove("hidden");
      }
      this.bounds = { minX: 8, maxX: WAVE_TRIGGERS[nextWaveIdx] + 30 };
      this.shopNpc = new JH.ShopNPC(WAVE_TRIGGERS[nextWaveIdx] - 150, JH.DEPTH_MIN + 6);
      this.showScreen("hud");
      this.banner("QUAKE WALKER JOINS YOUR SIDE!", 2.4);
    },

    afterSlayerCutscene(nextWaveIdx) {
      this.cutscene = null;
      this.state = "play";
      const slayerIdx = JH.LEVEL1.waves.findIndex((w) => w.bossType === "slayer");
      const clearedWave = JH.LEVEL1.waves[slayerIdx];
      if (clearedWave) {
        document.getElementById("hud-wave").textContent = clearedWave.name;
        document.getElementById("hud-wave-label").classList.remove("hidden");
      }
      // No wave beyond the Slayer (WAVE_TRIGGERS[nextWaveIdx] doesn't exist) —
      // open the victory portal ahead of Jon instead of a shop corridor.
      // Placeholder exit to the next world: walk in and confirm to win.
      this.bounds = { minX: 8, maxX: JH.LEVEL_LEN - 8 };
      this.victoryPortal = {
        x: Math.min(JH.LEVEL_LEN - 60, this.player.x + 150),
        y: JH.DEPTH_MAX * 0.5, t: 0, near: false,
      };
      this.showScreen("hud");
      this.banner("THE SLAYER JOINS YOUR SIDE!", 2.4);
    },

    drawCutscene(ctx) {
      const cs = this.cutscene;
      if (!cs) return;
      if (cs.who === "slayer") { this.drawSlayerCutscene(ctx, cs); return; }
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

    drawSlayerCutscene(ctx, cs) {
      const lines = [
        ["...Clean shot. I'll give you that.", "Nobody's sunk me before."],
        ["The fire in me...", "You've cooled it."],
        ["Next game, I'm on your side.", "Let's run the table."],
      ];
      const phase = clamp(cs.phase, 0, lines.length - 1);

      ctx.fillStyle = "rgba(0,0,0,0.88)";
      ctx.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H);

      const PX = 10, PY = 10, PW = 96, PH = 108;
      ctx.fillStyle = "#1a0800";
      ctx.fillRect(PX, PY, PW, PH);
      ctx.strokeStyle = JH.PAL.slayerEmber;
      ctx.lineWidth = 2;
      ctx.strokeRect(PX, PY, PW, PH);

      const talking = (cs.timer || 0) < 2.0;
      const mouthOpen = talking && (Math.floor((cs.timer || 0) * 7) & 1);
      const img = JH.getSlayerPortrait ? JH.getSlayerPortrait(mouthOpen) : null;
      if (img && img._ready) {
        ctx.drawImage(img, PX, PY, PW, PH);
      } else {
        // Procedural fallback
        const cx = PX + PW / 2, cy = PY + PH - 4;
        const f = (lx, ly, w, h, col) => {
          ctx.fillStyle = col; ctx.fillRect(Math.round(cx + lx), Math.round(cy - ly - h), w, h);
        };
        f(-20, 0, 40, 60, JH.PAL.slayerBody);
        f(-6, 60, 12, 30, JH.PAL.slayerDk);
        f(-20, 40, 40, 6, JH.PAL.slayerDk);
        f(-4, 30, 8, 12, "#cc8844");
      }

      ctx.fillStyle = JH.PAL.slayerEmber;
      ctx.font = "bold 7px monospace";
      ctx.textAlign = "left";
      ctx.fillText("THE SLAYER", PX, PY + PH + 9);

      const DX = PX + PW + 8, DY = PY, DW = JH.VIEW_W - DX - 10, DH = PH;
      ctx.fillStyle = "#0d0800";
      ctx.fillRect(DX, DY, DW, DH);
      ctx.strokeStyle = "#4a2810";
      ctx.lineWidth = 1;
      ctx.strokeRect(DX, DY, DW, DH);

      ctx.fillStyle = "#f0d8b0";
      ctx.font = "6px monospace";
      const dl = lines[phase];
      ctx.fillText(dl[0], DX + 6, DY + 18);
      if (dl[1]) ctx.fillText(dl[1], DX + 6, DY + 30);

      if (Math.floor(performance.now() / 500) % 2) {
        ctx.fillStyle = "#7a4820";
        ctx.font = "5px monospace";
        ctx.textAlign = "right";
        ctx.fillText("[ E ]  ADVANCE", DX + DW - 4, DY + DH - 5);
        ctx.textAlign = "left";
      }

      for (let i = 0; i < lines.length; i++) {
        ctx.fillStyle = i <= phase ? JH.PAL.slayerEmber : "#3a2010";
        ctx.fillRect(PX + i * 7, PY + PH + 13, 5, 5);
      }
    },

    // ------------------------------------------------------- spawning
    spawnEnemy(type, x, y, opts) {
      const e = JH.makeEnemy(type, x, y);
      if (opts) {
        if (opts.infinite) e.infinite = true;
        if (opts.elite && e.makeElite) e.makeElite(opts.elite === true ? undefined : opts.elite);
        if (opts.super && e.makeSuper) e.makeSuper();
        if (opts.dropIn && e.beginDrop) e.beginDrop(opts.dropDelay || 0);
      }
      // Boss HP respects player power: a maxed build sees all the phases
      // instead of deleting them.
      if (e.isBoss) {
        const pc = JH.Balance.powerCount(
          JH.Upgrades.owned, JH.Upgrades.repCount, JH.Church && JH.Church.state);
        e.hp = e.maxHp = JH.Balance.bossHpScale(e.maxHp, pc);
      }
      this.enemies.push(e);
      return e;
    },
    spawnPickup(kind, x, y, value) {
      this.pickups.push(new JH.Pickup(kind, x, y, value));
    },
    onEnemyKilled(e) {
      this.kills++;
      // GUSH combo: chained kills within a window. Feedback + capped water
      // crumbs at milestones — never affects damage or suds.
      this.combo++;
      this.comboTimer = JH.COMBO_WINDOW;
      this.comboFlash = 0.18;
      // Tiers: x3 arms a minor water-regen window (blue glow on Jon while
      // live); every 5th kill bumps the regen + refunds a splash of water.
      const p = this.player;
      if (p && p.alive) {
        const J = JH.JUICE;
        if (this.combo === 3) {
          p.gushRegenT = J.gushRegenDur;
          p.gushRegenRate = J.gushRegen3;
          this.audio.play("upgrade");
        } else if (this.combo >= 5 && this.combo % 5 === 0) {
          // Regen scales with the milestone, uncapped — x5 pays 8/s, x10 16/s,
          // x20 32/s: absurd chains deserve absurd water.
          const tier = this.combo / 5;
          p.gushRegenT = J.gushRegenDur;
          p.gushRegenRate = J.gushRegen5 * tier;
          p.water = Math.min(p.stats.maxWater, p.water + J.comboWaterRefund);
          p.regenLock = 0;
          this.shake(Math.min(4 + tier, 8));
          this.audio.play("upgrade", { pitch: 1 + 0.25 * tier });
          this.audio.play("coin", { pitch: 1.5 });
          // Geyser burst around Jon — the milestone should feel like an event.
          for (let i = 0; i < 10 + 4 * Math.min(tier, 4); i++)
            this.particles.push(new JH.Particle({
              x: p.x + (Math.random() - 0.5) * 18, y: p.y, z: 10 + Math.random() * 25,
              vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.5) * 30,
              vz: 60 + Math.random() * 60,
              life: 0.5 + Math.random() * 0.3, color: JH.PAL.water, size: 2, grav: 220,
            }));
        }
      }
      if (e && e.isBoss && JH.Church) JH.Church.markBossDefeated(e.type);
    },

    // Loot with anti-farm: scripted-wave enemies always drop; "infinite"
    // spawns (boss summons + wall-zone reinforcements) share a per-encounter
    // budget, so steady killing is rewarded but idle farming dries up.
    dropLoot(e) {
      // Super-elite kills pay: guaranteed kibble on top of their 4x suds.
      if (e.superElite) this.spawnPickup("health", e.x + 8, e.y, 25);
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
    // Add n/traumaDiv trauma (legacy 1..14 scale at existing call sites).
    // Optional dirX kicks the shake away from an impact direction.
    shake(n, dirX) {
      this.trauma = Math.min(1, (this.trauma || 0) + n / JH.JUICE.traumaDiv);
      if (dirX) this.shakeKickX = dirX > 0 ? 1 : -1;
    },
    tickShake(dt) {
      if (this.trauma > 0) this.trauma = Math.max(0, this.trauma - JH.JUICE.traumaDecay * dt);
      else this.shakeKickX = 0;
    },
    shakeOffset() {
      if (!this.trauma) return { x: 0, y: 0 };
      const amp = this.trauma * this.trauma * JH.JUICE.shakeMax * JH.JUICE.shakeScale;
      return {
        x: ((Math.random() - 0.5) + (this.shakeKickX || 0) * 0.6) * amp,
        y: (Math.random() - 0.5) * amp,
      };
    },

    hitStop(secs) { this.hitStopTimer = Math.max(this.hitStopTimer, secs); },
    // Per-kill presentation, one place: tiered hit-stop, pitch-laddered kill
    // sound, white kill pop, heavy-kill boom + wet splat, and the wave-ender
    // beat (big freeze + shake + arena-wide loot vacuum). Bosses bypass this
    // via their own die() overrides. Simultaneous kills take the strongest
    // freeze (hitStop maxes), never a sum.
    // Target-range buff testers: walk-up stations activated with E.
    // Only exist in devGotoRange (rangeStations stays null in real runs).
    tickRangeStations() {
      if (!this.rangeStations) return;
      const pl = this.player;
      for (const st of this.rangeStations) {
        st.near = Math.abs(pl.x - st.x) < 20 && Math.abs(pl.y - st.y) < 24;
        if (st.near && this.input.buffered("confirm")) {
          this.input.consume("confirm");
          if (st.kind === "kibble") {
            // Drop a real health pickup at Jon's feet — exercises the actual
            // collect path (incl. kibble stacking).
            this.spawnPickup("health", pl.x, pl.y, 25);
            this.audio.play("buy");
          } else if (st.kind === "gush") {
            // Jump the combo to the next multiple of 5 and run the real
            // milestone path — repeat presses climb x5 → x10 → x20…
            this.combo = Math.floor(this.combo / 5) * 5 + 4;
            this.onEnemyKilled(null);
          }
        }
      }
    },

    killJuice(e) {
      const J = JH.JUICE;
      const heavy = !!e.elite || J.heavyTypes.includes(e.type);
      const last = this.waveActive && this.enemies.every((x) => x.dead || x === e);
      this.audio.play("die");
      // Dedicated bright kill blip carries the combo pitch ladder (the low
      // "die" thud can't — semitones are inaudible at 70Hz).
      this.audio.play("kill", { pitch: Math.pow(2, Math.min(this.combo, J.comboPitchCap) / 12) });
      const hs = last ? J.hitstop.waveEnd : heavy ? J.hitstop.heavyKill : J.hitstop.kill;
      if (hs > 0) this.hitStop(hs);
      if (last) { this.shake(5); this.lootVacuumT = J.vacuumDur; }
      if (heavy)
        this.embers.push(new JH.FxBurst(e.x, e.y, e.bodyW > 18 ? "boom-mid" : "boom-small", { scale: 0.55 }));
      this.embers.push(new JH.KillPop(e));
    },
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
      // Pressure Charge is delisted from both shops until the buff works.
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
    // Return from the Church: warp Jon back in at the last fire hydrant he
    // visited (or the level start), re-arm the wave he died in so it spawns
    // fresh as he walks back ("try again"), and fade the world in. Build +
    // Suds are kept (no Upgrades.reset).
    respawnFromChurch() {
      const next = Math.max(0, this.diedWave);     // the wave to re-fight
      const p = this.player;
      p.applyStats(JH.Upgrades.computeStats(JH.Upgrades.owned));
      const maxX = WAVE_TRIGGERS[next] + 30;
      p.x = clamp(this.lastHydrantX || 60, 12, maxX - 12);
      p.y = JH.DEPTH_MAX - 24;
      p.hp = p.stats.maxHp;
      p.water = p.stats.maxWater;
      p.clearBurn();
      p.alive = true;
      JH.Camera.snapTo(p);   // fade in AT the hydrant, don't scroll across the map
      this.enemies = []; this.embers = []; this.pickups = []; this.particles = []; this.shields = []; this.firePatches = []; this.slowZones = [];
      this.deferredQueue = [];
      this.hitStopTimer = 0;
      this.trauma = 0; this.shakeKickX = 0; this.lootVacuumT = 0; this.essenceDim = 0;
      this.combo = 0; this.comboTimer = 0; this.comboFlash = 0;
      this.hydrants = JH.HYDRANTS.map((h) => ({ x: h.x, y: h.y, t: 0 }));
      this.wall = null; this.gardens = [];
      this.shopNpc = null; this.nearShop = false;
      this.dropBudget = { suds: 0, items: 0 };
      this.waveIndex = next - 1;
      // Act gate keyed to the wave being re-fought, not the decremented index.
      JH.Upgrades.currentActLevel = JH.Balance.actLevelForWave(next, JH.ACT_STARTS);
      this.waveActive = false; this.waveCleared = false;
      this.bounds = { minX: 8, maxX: maxX };
      // Church-return arrival: hold on black, then a water jet drops Jon from the
      // sky into a splash landing. updateArrival() drives it; player logic is
      // frozen until it finishes. Jon starts high (z) and eases to the ground.
      this.arrival = { t: 0, blackDur: 0.4, fallDur: 0.6, splashDur: 0.4, height: 240, splashed: false };
      p.z = this.arrival.height;
      this.worldFadeT = 0; this.warpInT = 0;
      this.state = "play";
      this.showScreen("hud");
      JH.Music.reset(); JH.Music.start();
      this.banner("TRY AGAIN!", 1.4);
    },

    closeShop() {
      this.state = "play";
      this.showScreen("hud");
    },

    // Church-return landing: black hold -> water-jet sky-drop -> splash. Freezes
    // player/enemy logic; only particles animate. Jon's z eases from sky to ground.
    updateArrival(dt) {
      const a = this.arrival, p = this.player;
      a.t += dt;
      const fallStart = a.blackDur;
      const fallEnd = a.blackDur + a.fallDur;
      const splashEnd = fallEnd + a.splashDur;
      if (a.t < fallStart) {
        p.z = a.height;                        // still in the sky, hidden by black
      } else if (a.t < fallEnd) {
        const k = (a.t - fallStart) / a.fallDur;
        p.z = a.height * (1 - k * k);          // ease-in fall (gravity)
      } else {
        p.z = 0;
        if (!a.splashed) {
          a.splashed = true;
          JH.burst(this, p.x, p.y, 20, JH.PAL.waterHi, 10, { speed: 90, life: 0.5, up: 70, size: 2 });
          JH.burst(this, p.x, p.y, 14, JH.PAL.water,   14, { speed: 60, life: 0.45, up: 30, size: 2 });
          this.shake(5);
          this.audio.play("whack");
        }
      }
      this.particles = this.particles.filter((pp) => pp.update(dt));
      this.embers = this.embers.filter((pp) => pp.update(dt, this));
      for (const h of this.hydrants) h.t += dt;
      this.updateHUD();
      if (a.t >= splashEnd) { this.arrival = null; p.z = 0; }
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
    // Retired from the death path (death now routes to the Church via
    // startPlayerDeathSeq); kept for a future manual quit/give-up affordance.
    gameOver() {
      this.state = "over";
      document.getElementById("over-stats").textContent =
        "You reached " + (JH.LEVEL1.waves[Math.max(0, this.waveIndex)].name) +
        "\nEnemies hosed: " + this.kills;
      this.audio.play("die");
      this.showScreen("screen-over");
    },
    startPlayerDeathSeq() {
      this.diedWave = this.waveIndex;        // the wave to re-arm on return
      this.state = "playerDeathSeq";
      this.deathSeqT = 0;
      this.audio.playFile("audio/effects/jon-death.mp3", 0.9);
      this.shake(8);
      // Capture screen position for death animation overlay.
      this.deathSx = Math.round(this.player.x - JH.Camera.x);
      this.deathSy = JH.Geo.feetScreenY(this.player.y, 0);
      this.deathFacing = this.player.facing;
    },

    updatePlayerDeathSeq(dt) {
      if ((this.deathSeqT += dt) >= JH.CHURCH.deathSeq.total) {
        this.deathSeqT = 0;
        this.enterChurch();
      }
    },

    enterChurch() {
      this.state = "church";
      document.getElementById("hud").classList.add("hidden");
      document.getElementById("banner").classList.add("hidden");
      if (JH.Church.enterScene) JH.Church.enterScene(this);
    },
    togglePause() {
      if (this.state === "play") { this.state = "pause"; this.showScreen("screen-pause"); }
      else if (this.state === "pause") { this.state = "play"; this.showScreen("hud"); }
      else if (this.state === "church") { this.state = "churchPause"; this.showScreen("screen-pause"); }
      else if (this.state === "churchPause") {
        this.state = "church";
        document.getElementById("screen-pause").classList.add("hidden");
      }
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

      // pause toggle works in play/pause and church/churchPause
      if (this.input.pressed("pause") && (this.state === "play" || this.state === "pause"
        || this.state === "church" || this.state === "churchPause"))
        this.togglePause();

      if (this.bannerTimer > 0) {
        this.bannerTimer -= dt;
        if (this.bannerTimer <= 0) document.getElementById("banner").classList.add("hidden");
      }
      this.tickShake(dt);
      if (this.lootVacuumT > 0) this.lootVacuumT -= dt;
      if (this.worldFadeT > 0) this.worldFadeT = Math.max(0, this.worldFadeT - dt);
      if (this.warpInT > 0) this.warpInT = Math.max(0, this.warpInT - dt);
      if (this.state === "play" || this.state === "bossDeathSeq") this.tickDeferred(dt);

      if (this.state === "bossDeathSeq") {
        this.particles = this.particles.filter((p) => p.update(dt));
        this.embers   = this.embers.filter((p) => p.update(dt, this));
        this.updateBossDeathSeq(dt);
        return;
      }
      if (this.state === "playerDeathSeq") {
        this.particles = this.particles.filter((p) => p.update(dt));
        this.embers   = this.embers.filter((p) => p.update(dt, this));
        this.updatePlayerDeathSeq(dt);
        return;
      }
      if (this.state === "church") {
        if (JH.Church.updateScene) JH.Church.updateScene(dt, this);
        return;
      }
      if (this.state === "churchPause") return;

      if (this.devMenu) return;

      // Cutscene: only E (confirm) advances the dialogue.
      if (this.state === "cutscene") {
        const cs = this.cutscene;
        if (cs) {
          cs.timer = (cs.timer || 0) + dt;
          if (this.input.buffered("confirm") && (cs.timer || 0) > 0.3) {
            this.input.consume("confirm");
            cs.phase++;
            cs.timer = 0;
            if (cs.phase >= 3) {
              if (this.cutscene && this.cutscene.who === "slayer")
                this.afterSlayerCutscene(this.cutscene.nextWave);
              else
                this.afterCutscene(this.cutscene ? this.cutscene.nextWave : 10);
            }
          }
        }
        return;
      }

      if (this.state !== "play") { this.updateHUD(); return; }

      // Church-return landing sequence owns play input/logic until it finishes.
      if (this.arrival) { this.updateArrival(dt); return; }

      // Hitstop: freeze entities briefly on impact; embers + particles keep running.
      if (this.hitStopTimer > 0) {
        this.hitStopTimer -= dt;
        this.embers = this.embers.filter((p) => p.update(dt, this));
        this.particles = this.particles.filter((p) => p.update(dt));
        return;
      }

      this.elapsed += dt;

      // GUSH combo decay (only ticks during live play, frozen during hitstop).
      if (this.comboFlash > 0) this.comboFlash = Math.max(0, this.comboFlash - dt);
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) { this.combo = 0; this.comboTimer = 0; }
      }

      // --- entities
      this.player.update(dt, this);
      for (const e of this.enemies) e.update(dt, this);
      for (const s of this.shields) s.update(dt);
      for (const fp of this.firePatches) fp.update(dt, this);
      this.player.zoneSlow = 1;
      for (const z of this.slowZones) z.update(dt, this);
      this.embers = this.embers.filter((p) => p.update(dt, this));
      this.pickups = this.pickups.filter((p) => p.update(dt, this));
      // Essence-cross event: while a cross is uncollected the world dims.
      const crossOut = this.pickups.some((p) => !p.dead && p.kind === "cross");
      this.essenceDim += ((crossOut ? 1 : 0) - this.essenceDim) * Math.min(1, 3 * dt);
      this.particles = this.particles.filter((p) => p.update(dt));

      // --- hydrant timers + walk-up shop vendor
      for (const h of this.hydrants) h.t += dt;
      this.tickRangeStations();
      // Remember the last hydrant visited — death returns Jon here.
      if (this.player.nearHydrant) this.lastHydrantX = this.player.nearHydrant.x;
      // Victory portal (post-Slayer): walk in and confirm to finish the run.
      if (this.victoryPortal) {
        const vp = this.victoryPortal;
        vp.t += dt;
        vp.near = Math.abs(this.player.x - vp.x) < 22 && Math.abs(this.player.y - vp.y) < 30;
        if (vp.near && this.input.buffered("confirm")) { this.input.consume("confirm"); this.win(); return; }
      }
      if (this.shopNpc) {
        this.shopNpc.update(dt, this.player);
        this.nearShop = Math.abs(this.player.x - this.shopNpc.x) < JH.SHOP.range &&
          Math.abs(this.player.y - this.shopNpc.y) < 30;
        this.player.nearShop = this.nearShop;
        if (this.nearShop) {
          const U = JH.Upgrades;
          const sel = this.shopSelectables();
          if (sel.length > 0) {
            if (this.input.pressed("up"))   this.shopCursor = (this.shopCursor - 1 + sel.length) % sel.length;
            if (this.input.pressed("down")) this.shopCursor = (this.shopCursor + 1) % sel.length;
            if (this.input.buffered("confirm")) {
              this.input.consume("confirm");
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
      this.shields = this.shields.filter((s) => !s.dead);
      this.firePatches = this.firePatches.filter((fp) => !fp.dead);
      this.slowZones = this.slowZones.filter((z) => !z.dead);

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
                ? JH.Balance.eliteScale(JH.Balance.actLevelForWave(this.waveIndex, JH.ACT_STARTS),
                    JH.Balance.powerCount(JH.Upgrades.owned, JH.Upgrades.repCount, JH.Church && JH.Church.state))
                : null;
              const e = this.spawnEnemy(type, this.wall.x - 16, ey, { infinite: true, elite: sc });
              e.spawnGrace = 0.2;
            }
          }
          if (!this.wall || this.wall.dead) this.waveCleared_();
        } else if (wave && wave.holdout) {
          this.holdoutTimer -= dt;
          this.wallSpawnTimer -= dt;
          if (this.wallSpawnTimer <= 0 && this.enemies.length < JH.WALL.maxAlive) {
            this.wallSpawnTimer = JH.WALL.spawnEvery;
            const type = this.wallPool[(Math.random() * this.wallPool.length) | 0] || "mook";
            const ey = JH.DEPTH_MIN + 8 + Math.random() * (JH.DEPTH_MAX - JH.DEPTH_MIN - 16);
            const sc = wave.tough
              ? JH.Balance.eliteScale(JH.Balance.actLevelForWave(this.waveIndex, JH.ACT_STARTS),
                  JH.Balance.powerCount(JH.Upgrades.owned, JH.Upgrades.repCount, JH.Church && JH.Church.state))
              : null;
            // Spawn from either edge so pressure comes from ahead AND behind.
            const ex = (Math.random() < 0.5)
              ? this.bounds.minX + 10 + Math.random() * 40
              : this.bounds.maxX - 10 - Math.random() * 40;
            const e = this.spawnEnemy(type, ex, ey, { infinite: true, elite: sc });
            e.spawnGrace = 0.2;
          }
          if (this.holdoutTimer <= 0) {
            // Survived: the wave clears but any enemies still standing are left
            // alive to keep harassing as the player moves on.
            this.waveCleared_();
          }
        } else if (wave && (wave.garden || wave.douse)) {
          for (const g of this.gardens) g.update(dt);
          if (this.gardens.length > 0 && this.gardens.every((g) => g.done)) {
            // Objective done — harassers leave. Neighbor dies (0 suds); douse
            // harassers are removed WITHOUT reward (dropBudget was 0 anyway).
            for (const e of this.enemies) {
              if (e.dead) continue;
              if (wave.douse) e.dead = true;
              else if (e.type === "neighbor") e.die(this);
            }
            this.waveCleared_();
          }
        } else if (this.enemies.length === 0) {
          this.waveCleared_();
        }
      }

      // --- death
      if (!this.player.alive && this.state === "play") this.startPlayerDeathSeq();

      this.updateHUD();
    },

    // Attack tickets: cap simultaneous melee windups so crowds stay readable
    // even at the bigger wave sizes. Enemies flag usingTicket during their
    // windup/attack; the count is live (dead enemies drop out via the flag
    // check in their own think/die paths going quiet).
    canAttack() {
      let used = 0;
      for (const e of this.enemies) if (!e.dead && e.usingTicket) used++;
      const act = JH.Balance.actLevelForWave(this.waveIndex, JH.ACT_STARTS);
      return used < JH.Balance.ticketBudget(act, JH.TICKETS.budgets);
    },

    // Soft push-apart to keep a beat-em-up crowd readable.
    separate() {
      const a = this.enemies;
      for (let i = 0; i < a.length; i++) {
        for (let j = i + 1; j < a.length; j++) {
          const e1 = a[i], e2 = a[j];
          if (e1.isBoss || e2.isBoss) continue;
          if (e1.dropping || e2.dropping) continue;  // don't shove airborne drop-ins
          const dx = e2.x - e1.x, dy = e2.y - e1.y;
          const minX = (e1.bodyW + e2.bodyW) * 0.5, minY = 10;
          if (Math.abs(dx) < minX && Math.abs(dy) < minY) {
            const push = (minX - Math.abs(dx)) * 0.5 + 0.2;
            const s = dx >= 0 ? 1 : -1;
            e1.x -= s * push * 0.5; e2.x += s * push * 0.5;
          }
        }
      }
      // Jon and enemies have NO body collision with each other: neither
      // party is ever positionally displaced by the other (Jon's body can't
      // bulldoze enemies; a chasing enemy can't herd Jon into a corner).
      // Overlap is deterred by contact damage (Enemy.update) and enemies are
      // moved only by the hose. Enemy-vs-enemy anti-stacking above is the
      // sole job of this method's player-independent half.
    },

    drawRangeStations(ctx, cam) {
      for (const st of this.rangeStations) {
        const sx = Math.round(st.x - cam), sy = Math.round(JH.Geo.feetScreenY(st.y, 0));
        ctx.save();
        // pedestal + ground pad
        ctx.fillStyle = "#0d1420";
        ctx.beginPath(); ctx.ellipse(sx, sy, 9, 9 * JH.GROUND_RY, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#2a3548";
        ctx.fillRect(sx - 7, sy - 10, 14, 10);
        if (st.kind === "kibble") {
          ctx.fillStyle = "#44ee66";
          ctx.fillRect(sx - 4, sy - 15, 8, 6);
        } else {
          ctx.fillStyle = "#55c8ff";
          ctx.beginPath(); ctx.arc(sx, sy - 13, 4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.font = "bold 5px monospace"; ctx.textAlign = "center";
        ctx.fillStyle = "#9be8ff";
        ctx.fillText(st.kind === "kibble" ? "KIBBLE" : "GUSH", sx, sy - 20);
        if (st.near) {
          ctx.fillStyle = "#ffd23f"; ctx.font = "bold 7px monospace";
          ctx.fillText("E", sx, sy - 27 + Math.sin((this.player ? this.player.t : 0) * 6) * 1.5);
        }
        ctx.textAlign = "left";
        ctx.restore();
      }
      // Gallery labels: entity type over each statue on the top row.
      ctx.save();
      ctx.font = "bold 5px monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#7fa0c0";
      for (const e of this.enemies) {
        if (!e.isGallery) continue;
        const sx = Math.round(e.x - cam);
        if (sx < -30 || sx > JH.VIEW_W + 30) continue;
        ctx.fillText(e.type.toUpperCase(), sx, JH.Geo.feetScreenY(e.y, 0) - e.bodyH - 8);
      }
      ctx.textAlign = "left";
      ctx.restore();
    },

    updateHUD() {
      if (!this.player) return;
      const hud = document.getElementById("hud");
      if (hud) hud.style.visibility = (this.state === "play" && this.nearShop) ? "hidden" : "";
      document.getElementById("hud-suds").textContent = Math.floor(this.player.suds);
    },

    // ============================================================ RENDER
    render() {
      if (this.state === "church" || this.state === "churchPause") {
        const ctx = this.ctx;
        ctx.save();
        ctx.clearRect(-12, -12, JH.VIEW_W + 24, JH.VIEW_H + 24);
        JH.Church.renderScene(ctx, this);
        ctx.restore();
        if (this.devMenu) this.drawDevMenu(ctx);
        return;
      }
      const ctx = this.ctx;
      ctx.save();
      // screen shake (trauma model — see JH.JUICE)
      const so = this.shakeOffset();
      if (so.x || so.y) ctx.translate(so.x, so.y);
      ctx.clearRect(-12, -12, JH.VIEW_W + 24, JH.VIEW_H + 24);

      JH.Background.draw(ctx);

      if (this.player) {
        const cam = JH.Camera.x;

        // hydrants (static world props, behind actors)
        this.drawHydrants(ctx, cam);
        if (this.rangeStations) this.drawRangeStations(ctx, cam);
        if (this.victoryPortal) this.drawVictoryPortal(ctx, cam);

        // barricade (if a wall encounter is active)
        if (this.wall) this.wall.draw(ctx, cam);

        // garden boxes (if a garden encounter is active)
        if (this.gardens) for (const g of this.gardens) g.draw(ctx, cam);

        // planted Bulwark shields (static world props, drawn like the wall/gardens)
        for (const s of this.shields) s.draw(ctx, cam);

        // fire patches (burning ground zones from Fuse deaths, Smelt smashes, etc.)
        for (const fp of this.firePatches) fp.draw(ctx, cam);

        // slow zones (super-Bulwark's landed shield)
        for (const z of this.slowZones) z.draw(ctx, cam);

        // ground pickups first
        for (const p of this.pickups) p.draw(ctx, cam);

        // depth-sort actors (enemies + player + vendor) by world Y
        const actors = this.enemies.slice();
        actors.push(this.player);
        if (this.shopNpc) actors.push(this.shopNpc);
        actors.sort((m, n) => m.y - n.y);
        for (const e of actors) {
          // Dead entities can linger in the list while a death sequence has
          // the update loop paused (cull only runs in "play") — never draw them.
          if (!e.draw || e.dead) continue;
          if (e === this.player && this.state === "playerDeathSeq") {
            // Corpse: collapses (frames 0->7), then stays on the ground for the
            // rest of the sequence while the ghost (drawn in the overlay below)
            // rises out of it.
            const df = JH.Church.deathCorpseFrame(this.deathSeqT, JH.CHURCH.deathSeq);
            JH.Assets.shadow(ctx, this.deathSx, this.deathSy, this.player.stats.bodyW * 0.7);
            JH.Assets.draw(ctx, "jon", this.deathSx, this.deathSy, this.deathFacing, { state: "death", frame: df });
          } else if (e.dying) {
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

        // "GO!" prompt when free to advance
        if (this.state === "play" && !this.waveActive && this.waveIndex + 1 < JH.LEVEL1.waves.length && !this.nearShop) {
          this.drawGoArrow(ctx);
        }
        // boss health bar (hidden while death sequence plays)
        const boss = this.enemies.find((e) => e.isBoss && !e.dying && !e.isGallery);
        if (boss) this.drawBossBar(ctx, boss);

        if (this.state === "play" && this.combo >= 2) this.drawCombo(ctx);
      }
      ctx.restore();

      // Hold-the-line countdown readout (screen-space HUD, drawn on top).
      if (this.state === "play" && this.waveActive) {
        const hw = JH.LEVEL1.waves[this.waveIndex];
        if (hw && hw.holdout && this.holdoutTimer > 0) {
          const label = "HOLD  " + Math.ceil(this.holdoutTimer) + "s";
          ctx.save();
          ctx.font = "bold 12px monospace"; ctx.textAlign = "center";
          ctx.fillStyle = "#000"; ctx.fillText(label, JH.VIEW_W / 2 + 1, 25);
          ctx.fillStyle = "#ffd23f"; ctx.fillText(label, JH.VIEW_W / 2, 24);
          ctx.restore();
        }
      }

      // Player death sequence: corpse settles → ghost lifts out of it, stands up,
      // drifts/beams off → fade to black.
      if (this.state === "playerDeathSeq") {
        const t = this.deathSeqT, ctx2 = this.ctx;
        const sx = this.deathSx, sy = this.deathSy, facing = this.deathFacing;
        const ds = JH.CHURCH.deathSeq;

        const ghost = JH.Church.deathGhostState(t, ds);
        if (ghost && ghost.alpha > 0) {
          ctx2.save();
          ctx2.globalAlpha = ghost.alpha;
          ctx2.filter = "sepia(1) hue-rotate(150deg) saturate(3) brightness(2.2)";
          JH.Assets.draw(ctx2, "jon", sx, sy - ghost.riseY, facing, { state: "death", frame: ghost.frame });
          ctx2.restore();
        }

        const fadeAlpha = JH.Church.deathScreenFadeAlpha(t, ds);
        if (fadeAlpha > 0) {
          ctx2.save(); ctx2.globalAlpha = fadeAlpha; ctx2.fillStyle = "#000";
          ctx2.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H); ctx2.restore();
        }
      }

      // Returning from the Church: Mega Man-style warp beam at Jon, then the
      // world fades in from black (continuing the Church's fade-out).
      // Church-return landing overlay: black hold, then a water jet descends with
      // Jon (drawn at his falling z in the actor pass) and ends in a splash.
      if (this.state === "play" && this.arrival && this.player) {
        const ctx2 = this.ctx, a = this.arrival;
        const fallStart = a.blackDur, fallEnd = a.blackDur + a.fallDur;
        // Black holds fully during blackDur, then clears as the jet descends.
        let blackA = 1;
        if (a.t >= fallStart) blackA = Math.max(0, 1 - (a.t - fallStart) / (a.fallDur * 0.6));
        if (blackA > 0) {
          ctx2.save(); ctx2.globalAlpha = blackA; ctx2.fillStyle = "#000";
          ctx2.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H); ctx2.restore();
        }
        // Water jet: bright column from the top of the screen down to Jon.
        if (a.t >= fallStart && a.t <= fallEnd + 0.12) {
          const sx = Math.round(this.player.x - JH.Camera.x);
          const jonSy = Math.max(0, JH.Geo.feetScreenY(this.player.y, this.player.z));
          ctx2.save();
          ctx2.globalAlpha = 0.7;
          const g = ctx2.createLinearGradient(0, 0, 0, jonSy);
          g.addColorStop(0, "rgba(120,200,255,0.05)");
          g.addColorStop(1, JH.PAL.waterHi);
          ctx2.fillStyle = g;
          ctx2.fillRect(sx - 5, 0, 10, jonSy);
          ctx2.globalAlpha = 0.45; ctx2.fillStyle = JH.PAL.water;
          ctx2.fillRect(sx - 8, 0, 2, jonSy);
          ctx2.fillRect(sx + 6, 0, 2, jonSy);
          ctx2.restore();
        }
      }

      // Essence dim: darken the world, then re-draw the cross(es) above the
      // veil so the beat reads as "something is over there".
      if (this.essenceDim > 0.02 && this.state === "play") {
        const cam = JH.Camera.x;
        ctx.save();
        ctx.fillStyle = "rgba(8,6,20," + (0.35 * this.essenceDim).toFixed(3) + ")";
        ctx.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H);
        ctx.restore();
        // Cross redraw uses the same shake offset as the world pass — without
        // it the overlay copy double-images against the world copy during shake.
        ctx.save();
        ctx.translate(so.x, so.y);
        for (const p of this.pickups) {
          if (p.dead || p.kind !== "cross") continue;
          JH.Assets.glow(ctx, p.x - cam, JH.Geo.feetScreenY(p.y, p.z) - 4,
            18, "#ffd23f", 0.5 * this.essenceDim);
          p.draw(ctx, cam);
        }
        ctx.restore();
      }
      // Hover shop panel — drawn outside shake transform so it stays stable.
      if (this.nearShop && this.state === "play") this.drawHoverShop(this.ctx);
      // Cutscene overlay (drawn after everything else).
      if (this.state === "cutscene" && this.cutscene) this.drawCutscene(this.ctx);
      // Dev menu drawn last so it's always on top.
      if (this.devMenu) this.drawDevMenu(this.ctx);
    },

    drawDevMenu(ctx) {
      const waves = JH.LEVEL1.waves;
      const count = waves.length + 3;          // +cutscene +range +firewall
      const W = 224, ROW = 11, PAD = 14;
      // Fit inside the canvas: cap the visible rows and scroll so the cursor
      // stays shown. maxRows is how many ROW-tall lines fit between the header
      // and footer padding; the panel height follows from it.
      const maxRows = Math.min(count, Math.floor((JH.VIEW_H - 2 * PAD - 16) / ROW));
      const H = PAD + maxRows * ROW + PAD;
      const PX = Math.round((JH.VIEW_W - W) / 2);
      const PY = Math.round((JH.VIEW_H - H) / 2);
      const MID = PX + W / 2;

      // Scroll window: keep the cursor near the middle, clamped to the ends.
      let firstVisible = this.devCursor - Math.floor(maxRows / 2);
      firstVisible = Math.max(0, Math.min(firstVisible, count - maxRows));
      // Screen-y for a global row index, or null when it's scrolled out of view.
      const rowY = (gi) => {
        const vp = gi - firstVisible;
        return (vp >= 0 && vp < maxRows) ? (PY + PAD + vp * ROW) : null;
      };

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

      // Wave rows (only those inside the scroll window)
      waves.forEach((wave, i) => {
        const ry = rowY(i);
        if (ry === null) return;
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
      const csRy = rowY(waves.length);
      if (csRy !== null) {
        const csSel = this.devCursor === waves.length;
        if (csSel) { ctx.fillStyle = "rgba(255,120,255,0.18)"; ctx.fillRect(PX + 3, csRy, W - 6, ROW - 1); }
        ctx.fillStyle = csSel ? "#ff88ff" : "#667788";
        ctx.font = (csSel ? "bold " : "") + "6px monospace"; ctx.textAlign = "left";
        ctx.fillText("✦  QUAKE CUTSCENE", PX + 8, csRy + ROW - 3);
        ctx.fillStyle = csSel ? "#ff88ff" : "#445566"; ctx.textAlign = "right";
        ctx.fillText("CS", PX + W - 6, csRy + ROW - 3);
      }

      // Target range entry
      const rangeRy = rowY(waves.length + 1);
      if (rangeRy !== null) {
        const rangeSel = this.devCursor === waves.length + 1;
        if (rangeSel) { ctx.fillStyle = "rgba(100,220,100,0.18)"; ctx.fillRect(PX + 3, rangeRy, W - 6, ROW - 1); }
        ctx.fillStyle = rangeSel ? "#80ff80" : "#667788";
        ctx.font = (rangeSel ? "bold " : "") + "6px monospace"; ctx.textAlign = "left";
        ctx.fillText("⊕  TARGET RANGE", PX + 8, rangeRy + ROW - 3);
        ctx.fillStyle = rangeSel ? "#80ff80" : "#445566"; ctx.textAlign = "right";
        ctx.fillText("DEV", PX + W - 6, rangeRy + ROW - 3);
      }

      // Wall boss entry (standalone concept — not in the wave list)
      const wbRy = rowY(waves.length + 2);
      if (wbRy !== null) {
        const wbSel = this.devCursor === waves.length + 2;
        if (wbSel) { ctx.fillStyle = "rgba(255,90,40,0.18)"; ctx.fillRect(PX + 3, wbRy, W - 6, ROW - 1); }
        ctx.fillStyle = wbSel ? "#ff8a4a" : "#667788";
        ctx.font = (wbSel ? "bold " : "") + "6px monospace"; ctx.textAlign = "left";
        ctx.fillText("▮  FIREWALL", PX + 8, wbRy + ROW - 3);
        ctx.fillStyle = wbSel ? "#ff8a4a" : "#445566"; ctx.textAlign = "right";
        ctx.fillText("DEV", PX + W - 6, wbRy + ROW - 3);
      }

      // Scroll indicators when the list overflows the window (right edge, clear
      // of the centred header/footer text).
      ctx.fillStyle = "#ffd23f";
      ctx.font = "6px monospace";
      ctx.textAlign = "right";
      if (firstVisible > 0)                ctx.fillText("▲", PX + W - 8, PY + 9);
      if (firstVisible + maxRows < count)  ctx.fillText("▼", PX + W - 8, PY + H - 4);

      // Footer hint
      ctx.fillStyle = "#445566";
      ctx.font = "5px monospace";
      ctx.textAlign = "center";
      ctx.fillText("↑↓  navigate    Enter  warp    `  close", MID, PY + H - 4);
      ctx.textAlign = "left";
    },

    // Post-Slayer exit portal — same animated art as the church return portal,
    // drawn bigger. Confirm inside it to reach the win screen.
    drawVictoryPortal(ctx, cam) {
      const vp = this.victoryPortal;
      const sx = vp.x - cam, sy = JH.Geo.feetScreenY(vp.y, 0);
      if (sx < -50 || sx > JH.VIEW_W + 50) return;
      JH.Assets.drawFx(ctx, "portal", sx, sy, vp.t, { scale: 2 });
      ctx.save();
      ctx.font = "bold 7px monospace";
      ctx.textAlign = "center";
      const bob = Math.sin(vp.t * 3) * 2;
      ctx.fillStyle = "#062033"; ctx.fillText("NEXT WORLD", sx + 1, sy - 72 + bob + 1);
      ctx.fillStyle = "#9be8ff"; ctx.fillText("NEXT WORLD", sx, sy - 72 + bob);
      if (vp.near) {
        ctx.fillStyle = "#0a2a08"; ctx.fillText("PRESS E", sx + 1, sy - 62 + bob + 1);
        ctx.fillStyle = "#7dff5a"; ctx.fillText("PRESS E", sx, sy - 62 + bob);
      }
      ctx.restore();
    },

    drawHydrants(ctx, cam) {
      for (const h of this.hydrants) {
        const sx = h.x - cam;
        if (sx < -20 || sx > JH.VIEW_W + 20) continue;
        const active = this.player && this.player.nearHydrant === h;
        // The hydrant Jon last touched is the current respawn point (golden).
        const isRespawn = this.lastHydrantX > 0 && Math.abs(h.x - this.lastHydrantX) < 1;
        const fy = JH.Geo.feetScreenY(h.y, 0);
        JH.Assets.shadow(ctx, sx, fy, 7);
        if (isRespawn) {
          // Golden edge glow: layered silhouette outlines fading outward
          // (shadowBlur streaks line artifacts; discs read wrong on sprites).
          const gp = 0.45 + 0.18 * Math.sin(h.t * 5);
          JH.Assets.draw(ctx, "hydrant", sx, fy, 1, { gold: true,
            outlines: [["#ffe680", gp], ["#ffce3a", gp * 0.5]] });
        } else {
          JH.Assets.draw(ctx, "hydrant", sx, fy, 1, {});
        }
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
      // "pressure" is delisted until the buff works.
      Object.keys(JH.CONSUMABLES).forEach((k) => {
        if (k !== "pressure") out.push({ kind: "consumable", id: k });
      });
      return out;
    },
    // Buy a between-wave consumable; returns true on success.
    buyConsumable(key) {
      const c = JH.CONSUMABLES[key];
      if (!c || this.player.suds < c.cost) return false;
      this.player.suds -= c.cost;
      if (key === "medkit") this.player.hp = Math.min(this.player.stats.maxHp, this.player.hp + c.heal);
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
          desc = cur.id === "medkit" ? "Heal " + c.heal + " HP now." : "";
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

    // GUSH combo readout — scales + pulses with the chain, fades as it expires.
    // While the x3 regen window is live it breathes regen-blue with a soft
    // glow and a subtle letter wave — same #55c8ff / sin(t*6) pulse as Jon's
    // aura and the water-bar wave, so all three read as one signal.
    // Purely cosmetic: never feeds back into damage or economy.
    drawCombo(ctx) {
      const n = this.combo;
      const frac = JH.COMBO_WINDOW > 0 ? clamp(this.comboTimer / JH.COMBO_WINDOW, 0, 1) : 0;
      const tierCol = n >= 20 ? "#ff5a5a" : n >= 10 ? JH.PAL.suds : JH.PAL.waterHi;
      const p = this.player;
      const regenLive = !!(p && p.alive && p.gushRegenT > 0);
      const pop = 1 + this.comboFlash * 1.6;                 // brief scale punch per kill
      const size = Math.min(22, 9 + n * 0.4) * pop;
      const alpha = Math.min(1, 0.35 + frac * 0.65);
      const label = "GUSH x" + n;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "bold " + size.toFixed(0) + "px monospace";
      if (regenLive) {
        const t = p.t;
        const pulse = 0.5 + 0.5 * Math.sin(t * 6);
        // Emphasis comes from the color pulse + letter wave (no shadowBlur —
        // it streaks straight-line artifacts on Chromium).
        ctx.fillStyle = JH.Assets.lerpHex(tierCol, n >= 10 ? "#ffffff" : "#55c8ff", 0.35 + 0.5 * pulse);
        // Travelling letter wave, per character (monospace = fixed advance).
        ctx.textAlign = "left";
        const adv = ctx.measureText("M").width;
        const x0 = JH.VIEW_W - 8 - label.length * adv;
        for (let i = 0; i < label.length; i++)
          ctx.fillText(label[i], x0 + i * adv, 40 + Math.sin(t * 8 - i * 0.7) * 1.2);
      } else {
        ctx.textAlign = "right";
        ctx.fillStyle = tierCol;
        ctx.fillText(label, JH.VIEW_W - 8, 40);
      }
      ctx.globalAlpha = alpha * 0.8;                          // thin expiry bar
      ctx.fillRect(JH.VIEW_W - 8 - 46 * frac, 44, 46 * frac, 2);
      ctx.restore();
      ctx.textAlign = "left";
    },
  };

  JH.Game = Game;
})();
