/* =====================================================================
   game.js — scene manager, wave spawner, HUD, and the fixed-step loop.
   Holds the live world (player, enemies, projectiles, pickups, particles)
   and drives state transitions: title → play ⇄ shop → win / over.
   ===================================================================== */
(function () {
  "use strict";
  const JH = (window.JH = window.JH || {});
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const RANGE_CATALOG_TABS = ["boons", "relics", "enemies"];
  const RANGE_CATALOG_ENEMIES = [
    { id: "mook", name: "Mook" },
    { id: "charger", name: "Charger" },
    { id: "pyro", name: "Pyro" },
    { id: "stalker", name: "Stalker" },
    { id: "fuse", name: "Fuse" },
    { id: "smelt", name: "Smelt" },
    { id: "bulwark", name: "Bulwark" },
    { id: "furnace", name: "Furnace" },
    { id: "plunger", name: "Plunger Fiend", air: true },
    { id: "tpmummy", name: "TP Mummy", air: true },
    { id: "gasbag", name: "Gasbag", air: true },
    { id: "bidet", name: "Bidet Turret", air: true },
    { id: "neighbor", name: "The Neighbor", setpiece: true },
    { id: "boss", name: "The Big Drip", boss: true },
    { id: "switch", name: "Switch", boss: true },
    { id: "quake", name: "Quake Walker", boss: true },
    { id: "gatewaykrusher", name: "Gateway Krusher", boss: true },
    { id: "wallboss", name: "The Firewall", boss: true },
    { id: "slayer", name: "The Slayer", boss: true },
    { id: "assman", name: "Ass Man", boss: true },
  ];
  JH.RANGE_CATALOG_ENEMIES = RANGE_CATALOG_ENEMIES;

  // Escapes a value for safe injection into innerHTML (leaderboard handles).
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // Where each wave triggers as the player advances rightward (one per wave,
  // bosses included). Spaced ~a screen apart across the longer level.
  const WAVE_TRIGGERS = [360, 740, 1120, 1500, 1880, 2260, 2640, 3020, 3400, 3780, 4160, 4540, 4920, 5300, 5680, 6060, 6440, 6820, 7200, 7580, 7960, 8340, 8720, 9100, 9480, 9860, 10240, 10620, 11000, 11840, 12220, 12600, 12980, 13360, 13740, 14120];
  if (WAVE_TRIGGERS.length !== JH.LEVEL1.waves.length)
    console.warn("WAVE_TRIGGERS length (" + WAVE_TRIGGERS.length + ") !== waves length (" + JH.LEVEL1.waves.length + ") — progression will break");

  const Game = {
    canvas: null, ctx: null,
    state: "title",
    input: null, audio: null,

    player: null,
    enemies: [], embers: [], pickups: [], particles: [], floaters: [], sigils: [],
    beneUsedOnce: {},
    relics: {}, relicStock: [],   // relics: id -> true, survives death; relicStock: current vendor's rotation
    hydrants: [], shopNpc: null, deepdiveTV: null, nearShop: false, nearVendor: false, shopOpen: false,
    timeScale: 1, deepdiving: false,   // Deepdive TV: world fixed-step rate; ramped by Balance.deepdiveRamp
    wall: null, wallSpawnTimer: 0, wallPool: [], holdoutTimer: 0,
    cloudlineEdge: null,   // wave 33's walkway-edge hazard (JH.CloudlineEdge); live only during that holdout
    windHazards: [],
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
    shopWheelSlot: 0,   // 0-3 cursor within the relic wheel row (3 = kibble)
    wheelStock: [],     // spawn-time snapshot of relicStock — wheel slots render from this and never shift
    wheelSpinT: 0,      // seconds since the spin started; drives the reel spin-in
    _wheelSpun: false,  // latches on the first nearShop approach — one spin per vendor
    _wheelSettled: [false, false, false],   // one-shot "coin" SFX per reel as it settles
    acc: 0, lastT: 0, running: false,
    devMenu: false, devCursor: 0,
    devPowerSim: false,   // dev-menu warp grants the act-expected level/bene power (KeyP toggles)
    showDmgNumbers: true,  // ON by default; dev-menu KeyN still toggles (enemy tally + player -N)
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

      // Telemetry: configure from JH.TELEMETRY, install the real transport,
      // and flush an "abandoned" record if the tab closes mid-run.
      if (JH.Telemetry) {
        JH.Telemetry.configure({
          endpoint: JH.TELEMETRY.endpoint, enabled: JH.TELEMETRY.enabled,
          gameVersion: JH.TELEMETRY.version,
        });
        JH.Telemetry.installBrowserTransport();
        window.addEventListener("beforeunload", () => {
          try { JH.Telemetry.finishAbandoned(); } catch (e) { /* ignore */ }
        });
      }

      // Leaderboard-name box (on the name-entry screen): prefill from the last
      // saved handle, and let Enter start the game straight from the field.
      const handleEl = document.getElementById("handle-input");
      if (handleEl) {
        try { handleEl.value = window.localStorage.getItem("jh_handle") || ""; } catch (e) { /* ignore */ }
        handleEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); startAudio(); this.startGame(); }
        });
      }

      // Overlay buttons dispatch by data-action.
      document.querySelectorAll("[data-action]").forEach((el) => {
        el.addEventListener("click", () => {
          const a = el.getAttribute("data-action");
          // Gate the title "start" until every tracked image has settled.
          if (a === "start" && !JH.Loader.ready()) return;
          startAudio();
          if (a === "start") this.openNameEntry();          // title → name-entry step
          else if (a === "begin" || a === "retry") this.startGame();
          else if (a === "back-title") this.showScreen("screen-title");
          else if (a === "resume") this.closeShop();
          else if (a === "resume-pause") this.togglePause();
          else if (a === "leaderboard") this.openLeaderboard();
          else if (a === "close-leaderboard") this.showScreen(this.state === "win" ? "screen-win" : "screen-title");
        });
      });

      // Asset preloader gate: keep the title "PRESS START" disabled, showing
      // progress, until all shipped images have loaded (or 404'd).
      const startBtn = document.querySelector('#screen-title [data-action="start"]');
      if (startBtn) {
        const updateGate = () => {
          if (JH.Loader.ready()) {
            startBtn.disabled = false;
            startBtn.textContent = "START GAME";
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

      // Tab toggles the stat panel anywhere in play (UI chrome, not a
      // combat verb). Tab / gamepad Back route through JH.Input as the
      // "toggleStats" action, handled in update().

      // Tab-away auto-pause: hidden tabs throttle rAF, and the return burst
      // (dt clamp + accumulator drain) reads as rubberbanding — pausing on
      // visibility loss sidesteps the whole class. Resume stays manual.
      document.addEventListener("visibilitychange", () => {
        if (document.hidden &&
            (this.state === "play" || this.state === "church" || this.state === "truck"))
          this.togglePause();
      });

      // ---- dev menu: localhost-only, backtick toggles wave-select overlay ----
      const h = window.location.hostname;
      const isDev = h === "localhost" || h === "127.0.0.1" || h === "";
      if (!isDev) return;
      window.addEventListener("keydown", (e) => {
        if (JH.isTyping()) return;   // don't hijack keys while typing a name
        if (e.code === "Backquote") {
          e.preventDefault();
          if (this.state === "title" || this.state === "over" || this.state === "win")
            this.startGame();
          this.devMenu = !this.devMenu;
          if (this.devMenu) this.devCursor = 0;
          return;
        }
        // H — toggle the hitbox overlay (street + truck run): the REAL hit
        // variables drawn live, for auditing bands that feel off.
        if (e.code === "KeyH") {
          e.preventDefault();
          JH.DEBUG_HITBOX = !JH.DEBUG_HITBOX;
          this.banner("HITBOXES " + (JH.DEBUG_HITBOX ? "ON" : "OFF"), 1.0);
          return;
        }
        // K — instantly kill the active boss to test the death sequence
        if (e.code === "KeyK" && this.state === "play") {
          const b = this.enemies.find((en) => en.isBoss && !en.dead && !en.dying);
          if (b) { e.preventDefault(); b.hp = 0; b.die(this); }
          return;
        }
        if (!this.devMenu) return;
        // P — toggle sim-power: warps grant the act-expected level + benediction
        // power so difficulty reads true (enemy scaling tracks powerCount too).
        if (e.code === "KeyP") {
          e.preventDefault();
          this.devPowerSim = !this.devPowerSim;
          this.banner("SIM POWER " + (this.devPowerSim ? "ON" : "OFF"), 1.0);
          return;
        }
        // N — toggle floating damage numbers (enemy running tally + player -N).
        if (e.code === "KeyN") {
          e.preventDefault();
          this.showDmgNumbers = !this.showDmgNumbers;
          this.banner("DMG NUMBERS " + (this.showDmgNumbers ? "ON" : "OFF"), 1.0);
          return;
        }
        const count = JH.LEVEL1.waves.length + 4;  // +1 cutscene, +1 target range, +1 wall boss, +1 post-firewall
        if (e.code === "ArrowUp")                     { e.preventDefault(); this.devCursor = (this.devCursor - 1 + count) % count; }
        if (e.code === "ArrowDown")                   { e.preventDefault(); this.devCursor = (this.devCursor + 1) % count; }
        if (e.code === "Enter" || e.code === "NumpadEnter") {
          e.preventDefault();
          if (this.devCursor === JH.LEVEL1.waves.length) this.devTriggerCutscene();
          else if (this.devCursor === JH.LEVEL1.waves.length + 1) this.devGotoRange();
          else if (this.devCursor === JH.LEVEL1.waves.length + 2) this.devGotoWallBoss();
          else if (this.devCursor === JH.LEVEL1.waves.length + 3) this.devGotoPostFirewall();
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

    // Grant the passive power a real player would hold entering waveIndex —
    // XP levels + a rolled set of benedictions + a working wallet — so a dev
    // warp gauges the wave at true difficulty (enemy elite/boss scaling reads
    // the same levelCount via Balance.powerCount). Call AFTER startGame, before
    // startWave. Returns the derived {levelCount, beneCount}.
    applyDevPower(waveIndex) {
      const enemySuds = {};
      for (const t in JH.ENEMIES) enemySuds[t] = JH.ENEMIES[t].suds || 0;
      const bossSuds = {
        boss: JH.BOSS.suds, switch: JH.SWITCH.suds, quake: JH.QUAKE.suds,
        gatewaykrusher: JH.GATEWAYKRUSHER.suds, slayer: JH.SLAYER.suds,
        wallboss: JH.WALLBOSS.suds,
      };
      const exp = JH.Balance.expectedPowerForWave(JH.LEVEL1.waves, waveIndex, {
        enemySuds, bossSuds, setPieceXp: JH.LEVELS.setPieceXp,
        xpForLevel: (n) => JH.Balance.xpForLevel(n),
      });
      // Levels: set the count Balance.powerCount reads, XP mid-level at 0.
      this.playerLevel = exp.levelCount;
      this.playerXp = 0;
      JH.Upgrades.levelCount = exp.levelCount;
      // Benedictions: roll the expected number from the live pool (a real run's
      // boons vary too). Mirror the Sigil.pick bookkeeping for duos/legendaries.
      for (let n = 0; n < exp.beneCount; n++) {
        const offers = JH.Benedictions.pickOffers({
          active: JH.Benedictions.active,
          pillarRanks: (JH.Church && JH.Church.state.pillars) || {},
          usedOnce: this.beneUsedOnce, censer: false,
        }, Math.random);
        if (!offers.length) break;
        const pick = offers[Math.floor(Math.random() * offers.length)];
        JH.Benedictions.take(pick.id);
        const d = JH.Benedictions.byId(pick.id);
        if (d && (d.kind === "duo" || d.kind === "legendary")) this.beneUsedOnce[pick.id] = true;
      }
      const p = this.player;
      p.applyStats(JH.Upgrades.computeStats(JH.Upgrades.owned));
      p.hp = p.stats.maxHp; p.water = p.stats.maxWater;
      p.suds = 1500;   // a working wallet to buy signatures/relics if desired
      return exp;
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
      // Sim-power: gear Jon to the wave's expected level/benediction power
      // (also ramps enemy scaling via powerCount) before the arena locks.
      const exp = this.devPowerSim ? this.applyDevPower(i) : null;
      // Cloudline backdrop follows the warp target (else air waves show a dark
      // sky until a respawn — the airT flag is scene-truth, not camera-driven).
      if (JH.Background) JH.Background.airOn = i >= JH.ACT_STARTS[JH.ACT_STARTS.length - 1];
      // Snap camera so startWave locks the right arena window
      JH.Camera.x = Math.max(0, px - Math.floor(JH.VIEW_W * 0.38));
      JH.Camera.locked = false;
      this.waveIndex = i - 1;
      this.startWave(i);
      if (exp) this.banner("SIM: LV " + exp.levelCount + " · " + exp.beneCount + " BOONS", 1.8);
      this.devMenu = false;
    },

    devGotoRange() {
      this.startGame();
      // startGame's campaign callout covers the supply fixtures for its whole
      // first beat. The range is an explicit dev-menu destination, so suppress
      // that onboarding banner here.
      this.bannerTimer = 0;
      document.getElementById("banner").classList.add("hidden");
      const py = Math.round(JH.DEPTH_MAX * 0.5);
      this.player.x = 80;
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
      // Keep the whole lab compact. The TEST-O-MAT holds the old world-space
      // boon/relic racks plus every implemented enemy, so fixtures do not turn
      // the range into a second campaign corridor.
      this.bounds = { minX: 8, maxX: 1220 };
      this.rangeStations = [
        { kind: "superelite", x: 110, y: py + 25, near: false },
        { kind: "kibble", x: 160, y: py + 25, near: false },
        { kind: "gush", x: 210, y: py + 25, near: false },
        { kind: "catalog", x: 190, y: py - 20, near: false },
      ];
      this.spawnVendor(360);
      // TARGET LAB: a short mechanics lane and a clear live-spawn pad.
      // Isolated dummy for basic pierce / splash testing
      this.spawnEnemy("dummy", 430, py);
      // Charge-cycling dummy: state flips to "charge" 1.2s of every 4s so the
      // Dog Leash bonus window is visible on demand (no real charger AI).
      const cd = this.spawnEnemy("dummy", 510, py);
      cd.rangeChargeCycle = true;
      // Group of three: two in-line (pierce) + one off-depth (split stream)
      const gx = 610, gy = py;
      this.spawnEnemy("dummy", gx,      gy);       // front  — primary target
      this.spawnEnemy("dummy", gx + 40, gy);       // behind — pierce target
      this.spawnEnemy("dummy", gx,      gy - 28);  // off-depth — split stream target
      // Hydrant just in front of the group
      this.hydrants.push({ x: gx - 55, y: gy, t: 0 });
      // Slow puddle: permanent player-slow zone (rubber_boots immunity test).
      const slow = new JH.SlowZone(720, py - 28, 26, 1e9);
      slow.rangeFixture = true;
      this.slowZones.push(slow);
      this.rangeStations.push(
        { kind: "firepatch", x: 720, y: py + 25, near: false },
      );
      this.rangeSpawnX = 820;
      this.rangeSpawnY = py;
      // Dome pair: permanent dome, one dummy sheltered + one outside
      // (deputy_sprinkler shelter check, lance blocker feel).
      const dome = new JH.DeployedShield(1050, py, null);
      dome.domeDur = dome.domeT = 1e9;
      dome.rangeFixture = true;
      this.shields.push(dome);
      this.spawnEnemy("dummy", 1050, py);                       // sheltered
      this.spawnEnemy("dummy", 1050 + dome.radius + 26, py);   // outside
      // Generous drop budget so spawner-mook kills pay out (dowsing_rod / plate).
      this.dropBudget = { suds: 999, items: 99 };
      this.rangeMode = true;
      this.rangeCatalogOpen = false;
      this.rangeCatalogTab = 0;
      this.rangeCatalogCursor = 0;
      // No full-screen arrival banner: the dev menu selection already names
      // the destination, and the banner obscured the first screen of fixtures.
      this.devMenu = false;
    },

    // Dev range: toggle a relic on/off and re-fold stats (apply() relics need
    // computeStats to run both ways). Revoking also clears the relic's live
    // state so an A/B toggle can't leave stale bonuses behind.
    toggleRelic(id) {
      const owned = !!this.relics[id];
      if (owned) delete this.relics[id];
      else this.relics[id] = true;
      const p = this.player;
      p.applyStats(JH.Upgrades.computeStats(JH.Upgrades.owned));
      if (p.hp > p.stats.maxHp) p.hp = p.stats.maxHp;
      if (!this.relics.rosary_chain) this.rosaryBonus = 0;
      if (!this.relics.boiler_coil) { p.boilerTarget = null; p.boilerHeat = 0; p.boilerGapT = 0; }
      return !owned;
    },

    rangeCatalogEntries() {
      const tab = RANGE_CATALOG_TABS[this.rangeCatalogTab] || "boons";
      if (tab === "boons") return JH.Benedictions.DEFS;
      if (tab === "relics") return JH.RELICS;
      return RANGE_CATALOG_ENEMIES;
    },

    refreshPlayerStats() {
      const p = this.player;
      p.applyStats(JH.Upgrades.computeStats(JH.Upgrades.owned));
      if (p.hp > p.stats.maxHp) p.hp = p.stats.maxHp;
    },

    useRangeCatalog(entry) {
      const tab = RANGE_CATALOG_TABS[this.rangeCatalogTab];
      if (tab === "boons") {
        const rank = JH.Benedictions.rank(entry.id);
        if (rank >= 2) delete JH.Benedictions.active[entry.id];
        else JH.Benedictions.take(entry.id);
        this.refreshPlayerStats();
        this.audio.play(rank >= 2 ? "hurt" : "upgrade", { pitch: rank >= 2 ? 0.8 : 0.95 });
        return;
      }
      if (tab === "relics") {
        const on = this.toggleRelic(entry.id);
        this.audio.play(on ? "buy" : "hurt", { pitch: on ? 1 : 0.8 });
        return;
      }

      // One live catalog specimen at a time. Clearing its hazards as well as
      // its body prevents repeated tests from rebuilding the old clutter.
      this.enemies = this.enemies.filter((e) => !e.rangeCatalogSpawn);
      this.embers = [];
      this.stinkClouds = [];
      this.gustLanes = [];
      this.firePatches = [];
      this.windHazards = [];
      this.shields = this.shields.filter((s) => s.rangeFixture);
      this.slowZones = this.slowZones.filter((z) => z.rangeFixture);
      const e = this.spawnEnemy(entry.id, this.rangeSpawnX, this.rangeSpawnY);
      e.rangeCatalogSpawn = true;
      e.spawnGrace = Math.max(e.spawnGrace || 0, 0.8);
      e.facing = -1;
      this.rangeCatalogOpen = false;
      this.audio.play("buy");
    },

    tickRangeCatalog() {
      const entries = this.rangeCatalogEntries();
      if (this.input.pressed("left") || this.input.pressed("right")) {
        const d = this.input.pressed("left") ? -1 : 1;
        this.rangeCatalogTab = (this.rangeCatalogTab + d + RANGE_CATALOG_TABS.length) % RANGE_CATALOG_TABS.length;
        this.rangeCatalogCursor = 0;
        this.audio.play("coin", { pitch: 0.9 + this.rangeCatalogTab * 0.1 });
        return;
      }
      if (this.input.pressed("up"))
        this.rangeCatalogCursor = (this.rangeCatalogCursor - 1 + entries.length) % entries.length;
      if (this.input.pressed("down"))
        this.rangeCatalogCursor = (this.rangeCatalogCursor + 1) % entries.length;
      if (this.input.buffered("confirm")) {
        this.input.consume("confirm");
        this.useRangeCatalog(entries[this.rangeCatalogCursor]);
      }
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

    // Jump straight into the Gate Crash finale: enter the truck run with the
    // Firewall already breaking, so the split-through + Air World wreckage/
    // walkway tableau play without driving the whole escape.
    devGotoPostFirewall() {
      this.debugEnterTruck();
      const T = JH.TruckRun, C = JH.TRUCKRUN, sc = T.scene;
      sc.t = 3;                                    // past the intro slide-in
      sc.fadeIn = 0; sc.speedMult = 1;
      sc.truck.screenX = C.truckScreenX;           // resting x, so the drive-through reads right
      sc.cursor = sc.timeline.length;              // no more road traffic queued
      sc.hazards.length = 0; sc.firePatches.length = 0; sc.embers.length = 0;
      sc.phase = "boss";
      T._spawnFirewall(C);
      T._breakFirewall();                          // detonate → split → whiteout → reveal → crash → walk
      this.devMenu = false;
    },

    // -------------------------------------------------------- overlays
    // Title "Start Game" opens this before the run so the player can set their
    // leaderboard name; the field is prefilled from the last saved handle.
    openNameEntry() {
      const el = document.getElementById("handle-input");
      if (el) { try { el.value = window.localStorage.getItem("jh_handle") || ""; } catch (e) { /* ignore */ } }
      this.showScreen("screen-name");
      if (el) setTimeout(() => { try { el.focus(); el.select(); } catch (e) { /* ignore */ } }, 0);
    },

    showScreen(id) {
      ["screen-title", "screen-name", "screen-shop", "screen-over", "screen-win", "screen-pause", "screen-leaderboard"]
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

    // Celebratory feedback when an upgrade node is purchased: rising chime
    // and a suds-coloured sparkle burst at the player (no banner — the buy is
    // a deliberate action with its own local feedback).
    upgradeFx(node) {
      this.audio.play("upgrade");
      const p = this.player;
      if (p) {
        JH.burst(this, p.x, p.y, 18, JH.PAL.suds,    16, { speed: 70, life: 0.6, up: 70, size: 2 });
        JH.burst(this, p.x, p.y, 24, JH.PAL.waterHi, 10, { speed: 50, life: 0.5, up: 55, size: 2 });
      }
      this.shake(3);
    },

    // Leaderboard handle, prompted ONCE ever (localStorage). A blank answer
    // is stored and honored — telemetry stays fully off for that player.
    _playerHandle() {
      try {
        const el = document.getElementById("handle-input");
        let h = el ? el.value : (window.localStorage.getItem("jh_handle") || "");
        h = (h || "").trim().slice(0, 20);
        window.localStorage.setItem("jh_handle", h);   // blank persists = opt-out
        return h;
      } catch (e) { return ""; }
    },

    // ------------------------------------------------------- new game
    startGame() {
      JH.Upgrades.reset();
      if (JH.Benedictions) JH.Benedictions.reset();
      JH.Camera.reset();
      this.player = new JH.Player(60, JH.DEPTH_MAX - 24);
      this.enemies = []; this.embers = []; this.pickups = []; this.particles = []; this.shields = []; this.firePatches = []; this.slowZones = []; this.wavePool = [];
      this.stinkClouds = []; this.gustLanes = []; this.cloudlineEdge = null; this.windHazards = [];
      this.pulseRings = []; this.sermonWaves = [];
      this.floaters = [];
      this.sigils = []; this.beneUsedOnce = {};
      if (JH.Background) JH.Background.airOn = false;   // fresh run starts pre-gate
      this.voucher50 = false;
      this.relics = {}; this.relicStock = [];
      this.shopWheelSlot = 0; this.wheelStock = []; this.wheelSpinT = 0;
      this._wheelSpun = false; this._wheelSettled = [false, false, false];
      this.deferredQueue = [];
      this.hitStopTimer = 0;
      this.hydrants = JH.HYDRANTS.map((h) => ({ x: h.x, y: h.y, t: 0 }));
      this.shopNpc = null; this.deepdiveTV = null; this.nearShop = false; this.nearVendor = false;
      this.shopOpen = false; this.shopCursor = 0;
      this.timeScale = 1; this.deepdiving = false;
      this.wall = null; this.gardens = [];
      this.gardensCleared = 0; this.concertaUnlocked = false;
      this.cutscene = null; this.victoryPortal = null;
      this.truckBoard = null; this.worldCrumble = null; this.slayerBeneBeat = false;
      this.rangeStations = null;
      this.rangeCatalogOpen = false; this.rangeCatalogTab = 0; this.rangeCatalogCursor = 0;
      this.rangeSpawnX = 0; this.rangeSpawnY = 0;
      this.dropBudget = { suds: 0, items: 0 };
      this.dryStreak = 0;   // consecutive scripted-wave kills with no item drop (pity counter)
      this.clearsSinceVendor = 0;   // 0 seed: the wave-3 cadence hit lands on a pre-boss
                                    // corridor and is suppressed, so the FIRST vendor spawns
                                    // just before the wave-4 boss (~140 suds earned by then)
      this.waveIndex = -1; this.waveActive = false; this.waveCleared = false;
      this.waveTriggerX = null;                     // wave 0 uses the base arena anchor
      this.rangeMode = false;                       // set true only by devGotoRange
      JH.Upgrades.currentActLevel = -1;             // fresh run starts in Act 1
      this.checkpointWave = 0;
      this.deathCount = 0;
      this.playerXp = 0; this.playerLevel = 0;
      this.elapsed = 0; this.kills = 0;
      this.trauma = 0; this.shakeKickX = 0; this.lootVacuumT = 0; this.essenceDim = 0;
      this.combo = 0; this.comboTimer = 0; this.comboFlash = 0; this.rosaryBonus = 0;
      this.bounds = { minX: 8, maxX: WAVE_TRIGGERS[0] + 30 };
      this.state = "play";
      // Flush a restarted-but-unfinished run as "abandoned" before starting the
      // next, so TRY AGAIN / PLAY AGAIN deaths still feed the per-wave matrix
      // (no-op after a win, which already finished the run).
      if (JH.Telemetry) JH.Telemetry.finishAbandoned();
      if (JH.Telemetry) JH.Telemetry.startRun(this._playerHandle());
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
      const trig = this.waveTriggerX != null ? this.waveTriggerX : WAVE_TRIGGERS[next] - 30;
      if (this.player.x >= trig) this.startWave(next);
    },

    // Next-wave trigger X, gated so there's always some corridor past where a
    // wave was cleared (finishing near the right edge, or holding right while
    // grabbing a benediction, no longer instantly rolls the next wave). Never
    // earlier than the arena anchor; capped so it can't drift wave-to-wave.
    gatedTriggerX(next, clearX) {
      const G = JH.WAVE_GATE;
      const gated = Math.max(WAVE_TRIGGERS[next] - 30, Math.round(clearX) + G.minWalk);
      return Math.min(WAVE_TRIGGERS[next] + G.maxOver, gated);
    },

    startWave(i) {
      this.waveIndex = i;
      if (JH.Telemetry) JH.Telemetry.waveReached(i, (JH.LEVEL1.waves[i] || {}).name || "");
      this.sigils = [];   // walking onto the next wave skips any unclaimed offer
      // Shop reads this for the tier-3 act gate.
      JH.Upgrades.currentActLevel = JH.Balance.actLevelForWave(this.waveIndex, JH.ACT_STARTS);
      this.checkpointWave = JH.Balance.actStartForWave(i, JH.ACT_STARTS);
      this.waveActive = true;
      this.waveCleared = false;
      this.wavePool = [];   // reinforcement queue — only regular waves fill it
      this.shopNpc = null;          // vendor gets left behind once the fight starts
      this.deepdiveTV = null; this.deepdiving = false;   // belt-and-suspenders — the TV is gone
      this.nearShop = false; this.nearVendor = false; this.shopOpen = false;
      const wave = JH.LEVEL1.waves[i];
      JH.Camera.lock();
      // Confine the player to the current screen ("arena").
      const left = JH.Camera.x + 20, right = JH.Camera.x + JH.VIEW_W - 20;
      this.bounds = { minX: left, maxX: right };
      // Terrain wind: waves 31+ author gust lanes (legacy {y,dir} or range
      // {yMin,yMax,dirs,bandMin,bandMax,phase} rows in wave data).
      this.gustLanes = (wave.gusts || []).map((gd) => new JH.GustLane(gd));
      // Wave 33's walkway boundary: inset from the locked arena's far bound.
      this.cloudlineEdge = wave.cloudlineEdge
        ? new JH.CloudlineEdge(this.bounds.maxX - JH.CLOUDLINE_HOLDOUT.edgeInset)
        : null;
      this.windHazards = (wave.hazards || []).map((h) =>
        new JH.WindHazard(this.bounds.minX + h.x, h.y));
      this.dropBudget = { suds: 0, items: 0 };

      // Elite meter for this wave: nextEliteScale() hands out the elite scale
      // to only ELITE_FRAC of enemies (even-spread accumulator), so tough
      // waves ramp from "a few elites" to "mostly elite" across acts instead
      // of every enemy being elite at once. Set for ALL spawn paths (standard
      // batch/trickle + wall/holdout reinforcement).
      const actLevel = JH.Balance.actLevelForWave(i, JH.ACT_STARTS);
      const ownedCount = JH.Balance.powerCount(
        JH.Upgrades.owned, JH.Upgrades.repCount, JH.Church && JH.Church.state, JH.Upgrades.levelCount,
        this.statRelicCount());
      this.waveEliteScale = wave.tough ? JH.Balance.eliteScale(actLevel, ownedCount) : null;
      this.waveEliteFrac = wave.tough ? (JH.ELITE_FRAC[actLevel + 1] || 0) : 0;
      this._eliteAcc = 0;

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
        // Survival hold-out: reuse the barricade's pool-spawn loop, end on a
        // timer. The cloudlineEdge holdout (wave 33) sources its duration
        // from JH.CLOUDLINE_HOLDOUT (single source of truth, no wave.holdDur
        // literal); every other holdout keeps its own wave-authored holdDur.
        this.holdoutTimer = wave.cloudlineEdge ? JH.CLOUDLINE_HOLDOUT.holdDur : (wave.holdDur || 22);
        this.wallSpawnTimer = 0.4;
        this.wallPool = [];
        wave.spawns.forEach((g) => { for (let k = 0; k < g.count; k++) this.wallPool.push(g.type); });
        this.dropBudget = { suds: 14, items: 7 };            // anti-farm cap
        this.banner(wave.cloudlineEdge ? "CLOUDLINE HOLDOUT — STAY OFF THE EDGE!" : "HOLD THE LINE!  SURVIVE!", 1.8);
      } else if (wave.boss) {
        JH.Music.setTrack("boss");
        const bt = wave.bossType || "boss";
        const bdef = bt === "switch" ? JH.SWITCH : bt === "quake" ? JH.QUAKE : bt === "gatewaykrusher" ? JH.GATEWAYKRUSHER : bt === "wallboss" ? JH.WALLBOSS : bt === "slayer" ? JH.SLAYER : bt === "assman" ? JH.ASSMAN : JH.BOSS;
        this.dropBudget = { suds: 10, items: 5 };             // caps summon farming
        this.banner(bdef.name.toUpperCase(), 1.8);
        this.spawnEnemy(bt, right - 20, JH.DEPTH_MAX - 30);
      } else {
        this.banner(wave.name, 1.3);   // title card only; elite status reads via gold bars
        const spawnList = JH.Balance.capEnemyType(
          wave.spawns, "charger", JH.WAVECAP.charger, "mook");
        // Flatten authored spawns, then sprinkle extras from the unlocked pool
        // on top (variety pass) — the authored list stays the tuned backbone.
        const types = [];
        spawnList.forEach((g) => { for (let k = 0; k < g.count; k++) types.push(g.type); });
        const SPR = JH.SPRINKLE;
        const sprinkleCount = SPR.counts[actLevel + 1] || 0;
        const poolFrom = JH.Balance.ticketBudget(actLevel, JH.SPRINKLE.poolFloor || [0]);
        const pool = JH.Balance.unlockedPool(JH.LEVEL1.waves, this.waveIndex, poolFrom);
        const chargerRoom = Math.max(0, JH.WAVECAP.charger - types.filter((t) => t === "charger").length);
        types.push(...JH.Balance.pickSprinkles(pool, sprinkleCount, {
          weights: SPR.weights, heavies: SPR.heavies, heavyCap: SPR.heavyCap,
          typeCaps: { charger: chargerRoom },
        }));
        const depthSpan = JH.DEPTH_MAX - JH.DEPTH_MIN - 16;
        // Trickle spawning: only the first fieldCap enemies open the wave;
        // the rest queue and stream in as reinforcements (update loop) so
        // big waves ramp instead of dumping everything at frame one.
        // (ticketBudget = generic act-indexed clamped lookup.)
        const cap = JH.Balance.ticketBudget(actLevel, JH.WAVEFLOW.fieldCap);
        const placementCount = this.spawnWavePlacements(wave);
        // Placement waves reserve a live field-cap slot for each pre-placed
        // enemy AND the authored super ahead of the opening regular batch, so
        // peak field count never exceeds cap. Waves with no placements keep
        // the pre-existing behavior (open cap regulars, super spawns on top,
        // peak cap+1) — do not extend this reservation to them.
        const openCount = placementCount > 0
          ? Math.max(0, cap - placementCount - (wave.superElite ? 1 : 0))
          : cap;
        let slot = 0;
        types.slice(0, openCount).forEach((type) => {
          this.spawnWaveEnemy(type, this.nextEliteScale(), slot);
          slot++;
        });
        this.wavePool = types.slice(openCount);
        this.waveTrickleT = JH.WAVEFLOW.trickle;
        // Rare apex: at most ONE super-elite, spawned by wave data — always
        // gets the full elite scale on top of its super tune, not fraction-gated.
        if (wave.superElite) {
          const ex = (Math.random() < 0.5) ? left + 24 : right - 24;
          const ey = JH.DEPTH_MIN + 10 + Math.random() * (depthSpan - 4);
          const se = this.spawnEnemy(wave.superElite, ex, ey, {
            elite: this.waveEliteScale, super: true,
            superHpScale: JH.SUPER_TUNE.hpByAct[actLevel + 1],
          });
          se.spawnGrace = 0.6;
          this.procSuperEliteArrival();
        }
      }
    },

    // Wave-data placements: enemies pre-spawned at a fixed spot instead of
    // entering from the arena edge — e.g. a Bidet Turret holding a post for
    // the whole wave. `p.x` is an offset from the locked arena's left bound,
    // `p.y` is world depth (JH.DEPTH_MIN..DEPTH_MAX). Placements never enter
    // wavePool/reinforcement — they live for the wave's duration. Returns the
    // number of placements spawned (the caller reserves that many field-cap
    // slots before slicing the regular opening batch).
    spawnWavePlacements(wave) {
      if (!wave.placements || !wave.placements.length) return 0;
      const left = this.bounds.minX;
      wave.placements.forEach((p) => {
        const e = this.spawnEnemy(p.type, left + p.x, p.y, { elite: this.nextEliteScale() });
        e.spawnGrace = 0.8;
      });
      return wave.placements.length;
    },

    // One wave enemy at the arena edge (or dropped in, for fuses). Used by
    // the wave-open batch and by reinforcement trickle.
    // Hand out the wave's elite scale to only waveEliteFrac of the enemies,
    // spread evenly (an accumulator, not a coin flip, so small waves still get
    // ~frac elites with no clumping). Returns the scale or null; every spawn
    // path routes its per-enemy elite decision through here.
    nextEliteScale() {
      if (!this.waveEliteScale || this.waveEliteFrac <= 0) return null;
      this._eliteAcc += this.waveEliteFrac;
      if (this._eliteAcc >= 1) { this._eliteAcc -= 1; return this.waveEliteScale; }
      return null;
    },

    // Holdout reinforcement cadence: the cloudlineEdge holdout (wave 33)
    // spawns on JH.CLOUDLINE_HOLDOUT's spawnEvery/maxAlive; every other
    // holdout (e.g. HOLD THE LINE) keeps JH.WALL's cadence unchanged. One
    // branch in the update loop reads this instead of duplicating the spawn
    // loop per cadence source.
    holdoutCadence(wave) {
      return wave.cloudlineEdge
        ? { spawnEvery: JH.CLOUDLINE_HOLDOUT.spawnEvery, maxAlive: JH.CLOUDLINE_HOLDOUT.maxAlive }
        : { spawnEvery: JH.WALL.spawnEvery, maxAlive: JH.WALL.maxAlive };
    },
    // Holdout reinforcement spawn X: alternates edges so pressure comes from
    // ahead AND behind. The right/far-side band is capped at
    // cloudlineEdge.x - 10 when a cloud edge is live, so a spawn never lands
    // past the walkway edge (enemies are edge-immune — an unclamped spawn
    // would visually stand over the void).
    holdoutSpawnX() {
      const left = this.bounds.minX, right = this.bounds.maxX;
      if (Math.random() < 0.5) return left + 10 + Math.random() * 40;
      const rightCap = this.cloudlineEdge
        ? Math.min(right - 10, this.cloudlineEdge.x - 10) : right - 10;
      return rightCap - Math.random() * 40;
    },
    // The plain-reinforcement wave's clear gate (game.js update, "else"
    // branch): true once the field's empty AND no queued reinforcements
    // remain in wavePool. Wall/holdout/garden/douse waves clear on their
    // own trigger instead — this predicate only governs the fallthrough
    // (trickle/batch reinforcement) branch.
    reinforcementWaveCleared() {
      return this.enemies.length === 0 && (!this.wavePool || this.wavePool.length === 0);
    },
    spawnWaveEnemy(type, eliteScale, slot) {
      const left = this.bounds.minX, right = this.bounds.maxX;
      const depthSpan = JH.DEPTH_MAX - JH.DEPTH_MIN - 16;
      const ey = JH.DEPTH_MIN + 8 + Math.random() * depthSpan;
      if (type === "fuse" || type === "tpmummy") {
        // Aerial entries land at a random arena spot (fuse: slam ring; tpmummy:
        // streamer drift). Shared stagger cadence.
        const ex = left + 30 + Math.random() * (right - left - 60);
        return this.spawnEnemy(type, ex, ey, {
          elite: eliteScale, dropIn: true, dropDelay: (slot || 0) * JH.FUSE_DROP.stagger * 0.5,
        });
      }
      // Enter from a random screen edge at a random depth.
      const ex = (Math.random() < 0.5) ? left + 6 + Math.random() * 10
                                       : right - 6 - Math.random() * 10;
      const e = this.spawnEnemy(type, ex, ey, { elite: eliteScale });
      e.spawnGrace = 0.3 + (slot || 0) * 0.25; // stagger entrances
      return e;
    },

    // Localized "reinforcement arriving" telegraph — a small dust puff at the
    // enemy's entry point, replacing the old REINFORCEMENTS! banner. Fuses
    // already read via their drop-in ring, so skip those.
    reinforceFx(e) {
      if (!e || e.dropping) return;
      JH.burst(this, e.x, e.y, 6, JH.PAL.rock, 8,
        { speed: 55, life: 0.4, up: 14, grav: 40, size: 2 });
    },

    waveCleared_() {
      JH.Music.setTrack("level");
      this.waveActive = false;

      const clearedWave = JH.LEVEL1.waves[this.waveIndex];
      // Absolution: heals on every wave clear. Above the cutscene
      // early-returns below so quake/slayer boss clears heal too.
      const ab = this.player.beneRank("absolution");
      if (ab) {
        this.player.hp = Math.min(this.player.stats.maxHp, this.player.hp + (ab >= 2 ? 40 : 25));
        if (ab >= 2) this.player.clearBurn();
      }
      // Wave-clear bonus item: tough waves always force one; the Alarm Bell
      // relic extends that to every wave clear. dryStreak 6 forces rollDrop
      // past its pity gate so it always returns an item (never null).
      if (clearedWave && (clearedWave.tough || (this.relics && this.relics.alarm_bell))) {
        const p = this.player;
        const kind = JH.Balance.rollDrop(1, 6, p.hp / p.stats.maxHp, p.water / p.stats.maxWater, Math.random);
        if (kind === "health") this.spawnPickup("health", p.x + 20, p.y, 25);
        else this.spawnPickup("water_can", p.x + 20, p.y, 40);
      }
      // Benediction beat: bosses AND set-pieces offer sigils (the essence
      // cross below deliberately excludes bosses — they get their own drop).
      // Also above the cutscene early-returns: quake/slayer are boss beats;
      // their sigils sit harmlessly through the cutscene (startWave clears
      // any left unpicked). The final (Slayer) wave keeps its beat: its
      // cutscene early-return below fires before the win() check, so win()
      // never runs synchronously here and the sigils are pickable in the
      // post-cutscene free-walk.
      if (clearedWave && (clearedWave.boss || clearedWave.garden || clearedWave.wall || clearedWave.holdout || clearedWave.douse)) {
        const offers = JH.Benedictions.pickOffers({
          active: JH.Benedictions.active,
          pillarRanks: (JH.Church && JH.Church.state.pillars) || {},
          usedOnce: this.beneUsedOnce,
          censer: !!this.relics && !!this.relics.censer,
        }, Math.random);
        // Horizontal row at one depth so the offer reads as a lineup. Keep
        // the rightmost sigil clear of the next-wave trigger so walking out to
        // inspect the last option can't roll the wave (shift the row left if
        // the lineup would otherwise reach it).
        const nx = this.waveIndex + 1;
        const trig = nx < WAVE_TRIGGERS.length ? this.gatedTriggerX(nx, this.player.x) : Infinity;
        let sx0 = this.player.x + 50;
        // Clamp the row inside the CURRENT walkable bounds too, not just
        // clear of the next trigger: a boss killed at the arena's right edge
        // (locked camera, bounds at the frame) otherwise spawns the lineup
        // past the level end — invisible AND unreachable (softlocks the
        // post-Slayer beat, which waits on the pick).
        const maxRight = Math.min(
          trig - JH.WAVE_GATE.sigilGap,
          (this.bounds ? this.bounds.maxX : JH.LEVEL_LEN - 8) - 24
        );
        if (sx0 + (offers.length - 1) * 46 > maxRight)
          sx0 = maxRight - (offers.length - 1) * 46;
        this.sigils = offers.map((o, i) => new JH.Sigil(sx0 + i * 46, 56, o));
        this.banner("BENEDICTION — CHOOSE ONE", 1.6);
      }

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

      if (clearedWave) {
        document.getElementById("hud-wave").textContent = clearedWave.name;
        document.getElementById("hud-wave-label").classList.remove("hidden");
      }
      // Mix-up set-pieces award Holy Essence like boss kills do — dropped as
      // a glowing cross pickup (never expires; awards on collect). No banner.
      if (clearedWave && (clearedWave.garden || clearedWave.wall || clearedWave.holdout || clearedWave.douse)) {
        this.spawnPickup("cross", this.player.x + 34, this.player.y, 1);
        this.grantXp(JH.LEVELS.setPieceXp);
      }
      this.wall = null; this.gardens = []; this.gustLanes = []; this.cloudlineEdge = null; this.windHazards = []; // barricade / gardens / gusts / cloud edge / wind hazards (if any) are done
      JH.Camera.unlock();
      // The LAST wave (final boss) wins; a mid-boss just continues.
      if (this.waveIndex >= JH.LEVEL1.waves.length - 1) { this.win(); return; }

      // Free-walk onward. Vendor policy: ALWAYS drop a shop in the corridor
      // right before a boss (dump suds to gear up), plus the usual post-boss
      // shop and an every-3rd-clear cadence. Back-to-back guard: skip a
      // cadence/post-boss shop when the NEXT corridor will already force a
      // pre-boss one, so the vendor never appears in two corridors in a row.
      const next = this.waveIndex + 1;
      this.waveTriggerX = this.gatedTriggerX(next, this.player.x);
      this.bounds = { minX: this.freeWalkMinX(), maxX: this.waveTriggerX + 30 };
      this.clearsSinceVendor = (this.clearsSinceVendor || 0) + 1;
      const isBoss = !!(clearedWave && clearedWave.boss);
      const nextIsBoss = !!(JH.LEVEL1.waves[next] && JH.LEVEL1.waves[next].boss);
      const afterNextIsBoss = !!(JH.LEVEL1.waves[next + 1] && JH.LEVEL1.waves[next + 1].boss);
      const cadence = this.clearsSinceVendor >= 3;
      if (nextIsBoss || ((isBoss || cadence) && !afterNextIsBoss)) {
        this.clearsSinceVendor = 0;
        // No banner: the vendor is visible up ahead — the player reads
        // shop = upgrades and walks to it. A clear/"gear up" blurb is noise.
        this.spawnVendor(WAVE_TRIGGERS[next] - 150);
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
      this.waveTriggerX = this.gatedTriggerX(nextWaveIdx, this.player.x);
      this.bounds = { minX: 8, maxX: this.waveTriggerX + 30 };
      this.clearsSinceVendor = 0;   // post-boss shop resets the cadence
      this.spawnVendor(WAVE_TRIGGERS[nextWaveIdx] - 150);
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
      // Fire World is beaten. Pick the Slayer's benediction first (spawned by
      // waveCleared_); choosing it triggers the escape sequence
      // (startTruckArrival): rumble, dread sting, and the truck driving in.
      // The air corridor begins past the gate — enterAirAct owns everything
      // beyond ZONE4_START, so cap the free-walk short of it. waveTriggerX
      // is also cleared: it's still live from wave 28's arming (~11k) and
      // checkWaveTrigger runs every frame post-Slayer, so left un-set it
      // would roll wave 29 (SANITATION 101) into the Fire World the moment
      // the player walks toward the truck stop.
      this.bounds = { minX: 8, maxX: JH.ZONE4_START - 60 };
      this.waveTriggerX = Infinity;
      this.slayerBeneBeat = true;
      this.showScreen("hud");
      this.banner("THE SLAYER JOINS YOUR SIDE!  —  CHOOSE ONE", 2.6);
    },

    // Sequence fired once the Slayer benediction is chosen: the Fire World
    // rumbles, a dread sting hits, and the escape truck drives in and brakes
    // just at the right edge of the screen. Board it (E) to start the escape.
    startTruckArrival() {
      this.worldCrumble = { t: 0, shakeCd: 0, quakeCd: 2.2 };
      this.shake(12);
      if (JH.AudioFX && JH.AudioFX.play) JH.AudioFX.play("dread");
      if (JH.Music && JH.Music.fadeOut) JH.Music.fadeOut(5);   // music dies out as the truck rolls in
      const stopX = JH.Camera.x + JH.VIEW_W - 42;   // brake at the right screen edge
      this.truckBoard = { x: stopX + 220, stopX: stopX, y: JH.DEPTH_MAX * 0.5, t: 0, near: false, arrived: false };
      this.banner("SOMETHING'S COMING — BOARD THE TRUCK!", 2.8);
    },

    // Called by JH.TruckRun when the escape reaches the Air World gate. The
    // benediction was already chosen (pre-truck), so this just tallies the
    // essence banked on the road and hands off to the Air World entrance.
    afterTruckRun() {
      this.state = "play";
      document.getElementById("hud").classList.remove("hidden");
      this.showScreen("hud");
      if (JH.AudioFX && JH.AudioFX.play) JH.AudioFX.play("win");
      this.enterAirAct();
    },

    // Air World arrival (post-Gate Crash). Banner-beat stub of the Ass Man
    // entry cutscene (bookends pass replaces it): Jon steps onto the cloudline
    // street, vendor at the act boundary, free-walk to WAVE 30.
    enterAirAct() {
      const airStart = JH.ACT_STARTS[JH.ACT_STARTS.length - 1];
      const p = this.player;
      p.x = JH.ZONE4_START + 40; p.y = JH.DEPTH_MAX * 0.6; p.z = 0;
      p.clearBurn();   // scene boundary: no Fire World DoT carries through the gate
      JH.Camera.snapTo(p);
      if (JH.Music && JH.Music.setTrack) JH.Music.setTrack("level");
      this.waveIndex = airStart - 1;   // cleared-through marker: the walk trigger rolls WAVE 30
      this.checkpointWave = airStart;
      this.waveActive = false; this.waveCleared = false;
      this.sigils = [];
      // Defensive clear: the truck run and the Slayer beat leave no live
      // combat state, but this guards the arrival regardless of how it's
      // reached (dev-warp, headless entry).
      this.enemies = []; this.embers = []; this.firePatches = [];
      this.stinkClouds = []; this.gustLanes = []; this.cloudlineEdge = null; this.windHazards = [];
      if (JH.Background) JH.Background.airOn = true;   // cloudline art turns on
      this.waveTriggerX = this.gatedTriggerX(airStart, p.x);
      this.bounds = { minX: JH.ZONE4_START + 8, maxX: this.waveTriggerX + 30 };
      this.clearsSinceVendor = 0;
      this.spawnVendor(WAVE_TRIGGERS[airStart] - 150);
      this.banner("THE AIR WORLD", 2.6);
    },

    // Dev/headless entry straight into the truck run (see main.js ?truck=1).
    debugEnterTruck() {
      if (!this.player) this.startGame();
      this.deepdiving = false;
      JH.TruckRun.enter(this);
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
        if (opts.super && e.makeSuper) e.makeSuper(opts.superHpScale);
        if (opts.dropIn && e.beginDrop) e.beginDrop(opts.dropDelay || 0);
      }
      // Boss HP respects player power: a maxed build sees all the phases
      // instead of deleting them.
      if (e.isBoss) {
        const pc = JH.Balance.powerCount(
          JH.Upgrades.owned, JH.Upgrades.repCount, JH.Church && JH.Church.state, JH.Upgrades.levelCount,
          this.statRelicCount());
        e.hp = e.maxHp = JH.Balance.bossHpScale(e.maxHp, pc);
      }
      this.enemies.push(e);
      return e;
    },
    spawnPickup(kind, x, y, value) {
      this.pickups.push(new JH.Pickup(kind, x, y, value));
    },
    // Shop discounts, single source of truth — every purchase path and its
    // drawn price route through this. Punch Card relic: all prices 20% off.
    // Father Jon's pity voucher (voucher50): 50% off, consumed by the next
    // successful purchase; while held, drawn prices already show the cut.
    priceOf(base) {
      let p = (this.relics && this.relics.punch_card) ? base * 0.8 : base;
      if (this.voucher50) p *= 0.5;
      return Math.round(p);
    },
    // Places a walk-up vendor and rolls its tiered relic stock (slot 1
    // common, slot 2 rare, slot 3 rare-or-relic per act-indexed odds),
    // minus minAct-gated and already-owned relics. Single spot so every
    // vendor spawn site rolls stock the same way.
    spawnVendor(x) {
      this.shopNpc = new JH.ShopNPC(x, JH.DEPTH_MIN + 6);
      // Deepdive TV: anchored at every shop, but only materializes (tv.mat,
      // CRT tune-in) while kibble is banked; sitting additionally needs
      // bank > DEEPDIVE.threshold ([REQUIRES KIBBLE] otherwise).
      this.deepdiveTV = new JH.DeepdiveTV(x - JH.DEEPDIVE.laneGap, JH.DEPTH_MIN + 6);
      this.relicStock = JH.Balance.rollWheelStock(JH.RELICS, this.relics, JH.Upgrades.currentActLevel, Math.random);
      // Wheel slots render from this fixed snapshot (bought cards go SOLD in
      // place, never shift); the reel spin arms on the first walk-up instead
      // of here so it plays in front of the open panel.
      this.wheelStock = this.relicStock.slice(0, 3);
      this.shopWheelSlot = 0; this._wheelSpun = false;
    },
    // Stat-bearing relics owned (defs with apply) — feeds Balance.powerCount.
    statRelicCount() {
      let n = 0;
      (JH.RELICS || []).forEach((r) => { if (r.apply && this.relics && this.relics[r.id]) n++; });
      return n;
    },
    // Attempt to buy a relic from the current vendor stock; returns true on success.
    buyRelic(id) {
      if (!this.relicStock || !this.relicStock.includes(id)) return false;
      if (this.relics && this.relics[id]) return false;
      const def = JH.RELICS.find((r) => r.id === id);
      if (!def) return false;
      const price = this.priceOf(def.cost);
      if (this.player.suds < price) return false;
      this.player.suds -= price;
      this.relics = this.relics || {};
      this.relics[id] = true;
      const fresh = JH.Upgrades.computeStats(JH.Upgrades.owned);
      const hpGain = fresh.maxHp - this.player.stats.maxHp;
      const waterGain = fresh.maxWater - this.player.stats.maxWater;
      this.player.applyStats(fresh);
      if (hpGain > 0) this.player.hp = Math.min(fresh.maxHp, this.player.hp + hpGain);
      if (waterGain > 0) this.player.water = Math.min(fresh.maxWater, this.player.water + waterGain);
      this.relicStock = this.relicStock.filter((rid) => rid !== id);
      return true;
    },
    // Pooled world-space floating text (essence gains, level-ups, shop buys).
    // Default: rises ~22px over 0.9s while fading. opts (all optional):
    // life (s), rise (px), h (starting px above the feet line), big (8px
    // bold). Oldest dropped past a 20-cap so a burst of simultaneous pickups
    // can't grow the pool unbounded.
    float(x, y, text, color, opts) {
      const o = opts || {};
      this.floaters.push({ x, y, t: 0, text, color,
        life: o.life || 0.9, rise: o.rise || 22, h: o.h || 0, big: !!o.big,
        size: o.size || 0, punch: o.punch || 0, punchDur: o.punchDur || 0.18 });
      if (this.floaters.length > 20) this.floaters.shift();
    },
    tickFloaters(dt) {
      for (const f of this.floaters) f.t += dt;
      this.floaters = this.floaters.filter((f) => f.t < (f.life || 0.9));
    },
    // Auto-award any live essence crosses. Called wherever the pickup array is
    // about to go away (win, church respawn) so banked essence can't be lost.
    sweepCrosses() {
      for (const p of this.pickups)
        if (!p.dead && p.kind === "cross" && JH.Church) {
          JH.Church.addEssence(p.value || 1);
          p.dead = true;
        }
    },

    procSuperEliteArrival() {
      if (this.relics && this.relics.prayer_bead && this.player && this.player.alive) {
        JH.Balance.prayerBeadProc(this.player, JH.RELIC_TUNE);
        this.float(this.player.x, this.player.y - 40, "PRESSURE", "#ffd23f");
      }
    },

    onEnemyKilled(e) {
      this.kills++;
      this.grantXp((e && e.def && e.def.suds) || 0);
      // GUSH combo: chained kills within a window. Feedback + capped water
      // crumbs at milestones — never affects damage or suds.
      this.combo++;
      this.comboTimer = JH.COMBO_WINDOW;
      this.comboFlash = 0.18;
      // Rosary Chain: each chained kill banks flat spray dmg, capped, until
      // the chain breaks (see decayCombo).
      if (this.relics && this.relics.rosary_chain)
        this.rosaryBonus = Math.min(JH.RELIC_TUNE.rosaryCap, (this.rosaryBonus || 0) + JH.RELIC_TUNE.rosaryPerKill);
      // Tiers: x3 arms a minor water-regen window (blue glow on Jon while
      // live); every 5th kill bumps the regen + refunds a splash of water.
      const p = this.player;
      if (p && p.alive) {
        const J = JH.JUICE;
        // Loaded Sponge: GUSH regen windows run longer (both the x3 and x5+ tiers).
        const winBonus = (this.relics && this.relics.loaded_sponge) ? JH.RELIC_TUNE.spongeWindowBonus : 0;
        if (this.combo === 3) {
          p.gushRegenT = J.gushRegenDur + winBonus;
          p.gushRegenRate = J.gushRegen3;
          this.audio.play("upgrade");
          this.spawnGushPulse();
        } else if (this.combo >= 5 && this.combo % 5 === 0) {
          // Regen scales with the milestone, uncapped — x5 pays 8/s, x10 16/s,
          // x20 32/s: absurd chains deserve absurd water.
          const tier = this.combo / 5;
          p.gushRegenT = J.gushRegenDur + winBonus;
          p.gushRegenRate = J.gushRegen5 * tier;
          // Loaded Sponge: GUSH milestone water refund doubled.
          const refundMult = (this.relics && this.relics.loaded_sponge) ? 2 : 1;
          p.water = Math.min(p.stats.maxWater, p.water + J.comboWaterRefund * refundMult);
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
          this.spawnGushPulse();
        }
      }
      // Collection Plate: flat suds bonus per kill.
      if (this.relics && this.relics.collection_plate && p && p.alive) {
        p.suds += 2; p.sudsEarned += 2;
      }
      // Squeegee: a kill standing in a fire patch snuffs that patch.
      if (e && this.relics && this.relics.squeegee && this.firePatches) {
        for (const fp of this.firePatches) {
          if (fp.dead) continue;
          const f = fp.footprint();
          if (JH.Geo.inGroundEllipse(e.x, e.y, fp.x, fp.y, f.rx, f.ry)) {
            fp.sprayProgress = fp.extinguishDur;
            this.audio.play("sizzle");
          }
        }
      }
      if (e && e.isBoss && JH.Church) {
        JH.Church.markBossDefeated(e.type);
        this.spawnPickup("cross", e.x, e.y, 1);
        // Sunday Suit: a whole second essence cross drops (not a doubled
        // value). The world-dim keys off "any cross out" (single scalar), so
        // it neither stacks nor lifts until BOTH crosses are collected.
        if (this.relics && this.relics.sunday_suit)
          this.spawnPickup("cross", e.x - 26, e.y, 1);
      }
    },

    // GUSH milestone pulse (Backdraft Valve / Big Spigot). Rim is hitbox: the
    // ring damages/knocks each target the frame its expanding rim reaches it.
    spawnGushPulse() {
      const valve = this.relics && this.relics.backdraft_valve;
      const spigot = this.relics && this.relics.big_spigot;
      if (!valve && !spigot) return;
      const T = JH.RELIC_TUNE, p = this.player;
      this.pulseRings.push({
        x: p.x, y: p.y, r: 0, targetR: T.pulseRadius, dur: 0.25, t: 0,
        dmg: spigot ? T.spigotDamage : 0, kb: valve ? T.valveKnockback : 0,
        douse: true, hit: new Set(),
      });
      this.audio.play("gush");
    },
    updatePulseRings(dt) {
      if (!this.pulseRings || !this.pulseRings.length) return;
      for (const ring of this.pulseRings) {
        ring.t += dt;
        ring.r = Math.min(ring.targetR, ring.targetR * (ring.t / ring.dur));
        const ry = ring.r * 0.34;                       // same ground flatten as shadows
        for (const e of this.enemies) {
          if (e.dead || ring.hit.has(e)) continue;
          if (!JH.Geo.inGroundEllipse(e.x, e.y, ring.x, ring.y, ring.r, ry)) continue;
          ring.hit.add(e);
          const dir = Math.sign(e.x - ring.x) || 1;
          if (ring.dmg) e.takeDamage(ring.dmg, this, dir, 0);
          if (ring.kb) e.applyKnockback(dir, ring.kb, (e.y - ring.y) * 0.02);
        }
        if (ring.douse && this.firePatches)
          for (const fp of this.firePatches) {
            if (fp.dead || ring.hit.has(fp)) continue;
            if (!JH.Geo.inGroundEllipse(fp.x, fp.y, ring.x, ring.y, ring.r, ry)) continue;
            ring.hit.add(fp); fp.sprayProgress = fp.extinguishDur;
          }
      }
      this.pulseRings = this.pulseRings.filter((r) => r.t < r.dur + 0.15);  // brief fade tail
    },

    // Pressure Sermon wave: the drawn wavefront IS the hitbox — each enemy
    // is hit exactly once as the front passes its x inside the depth band.
    // The pass window equals this step's travel, so a fast front can't skip
    // an enemy between frames.
    updateSermonWaves(dt) {
      if (!this.sermonWaves || !this.sermonWaves.length) return;
      const C = JH.SERMON;
      for (const w of this.sermonWaves) {
        const step = C.speed * dt;
        w.x += w.dir * step; w.traveled += step;
        for (const e of this.enemies) {
          if (e.dead || e.dropping || w.hit.has(e)) continue;
          if (Math.abs(e.y - w.y) > C.halfDepth) continue;
          const passed = (w.dir > 0)
            ? (e.x >= w.x - step && e.x <= w.x + 4)
            : (e.x <= w.x + step && e.x >= w.x - 4);
          if (!passed) continue;
          w.hit.add(e);
          e.takeDamage(this.player.stats.sprayDamage * JH.BENE_TUNE.sermonWaveFrac, this, w.dir, 0);
          e.applyKnockback(w.dir, C.kb, (e.y - w.y) * 0.02);
        }
      }
      this.sermonWaves = this.sermonWaves.filter((w) => w.traveled < C.range);
    },

    // GUSH combo decay: ticks the chain window down and the flash pop out;
    // when the timer runs dry the chain (and Rosary Chain's banked dmg) resets.
    decayCombo(dt) {
      if (this.comboFlash > 0) this.comboFlash = Math.max(0, this.comboFlash - dt);
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) { this.combo = 0; this.comboTimer = 0; this.rosaryBonus = 0; }
      }
    },

    // XP: kills feed the bar; each threshold applies the next gain-cycle
    // step instantly — flash + sting + 10% water/hp top-up, no pause.
    grantXp(n) {
      if (!this.player || !this.player.alive) return;
      this.playerXp += n;
      this.player.xpFlashT = 2.2;   // overhead XP bar fades in on gain, out after
      while (this.playerXp >= JH.Balance.xpForLevel(this.playerLevel + 1)) {
        this.playerXp -= JH.Balance.xpForLevel(this.playerLevel + 1);
        this.playerLevel++;
        JH.Upgrades.levelCount = this.playerLevel;
        const p = this.player;
        p.applyStats(JH.Upgrades.computeStats(JH.Upgrades.owned));
        p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.1);
        p.water = Math.min(p.stats.maxWater, p.water + p.stats.maxWater * 0.1);
        this.audio.play("upgrade", { pitch: 1.3 });
        JH.burst(this, p.x, p.y, p.z + 16, "#ffd23f", 16, { speed: 90, life: 0.5, up: 70, size: 2 });
        this.shake(3);
        // Above the overhead bar stack (bodyH + bars + xp), bigger + slower
        // than a loot blip so it reads through the combat noise.
        this.float(p.x, p.y, "LEVEL UP", "#ffd23f",
          { life: 2.2, rise: 30, h: p.stats.bodyH + 56, big: true });
        // The stat delta itself plays through the upgrade sequence (icon +
        // amount rising off Jon, queued by applyStats) — no text spam here.
      }
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
        const p = this.player;
        const kind = JH.Balance.rollDrop(e.def.dropMult, this.dryStreak,
          p.hp / p.stats.maxHp, p.water / p.stats.maxWater, Math.random);
        if (kind === "health")     { this.spawnPickup("health", e.x + 6, e.y, 25); this.dryStreak = 0; }
        else if (kind === "water") { this.spawnPickup("water_can", e.x - 6, e.y, 40); this.dryStreak = 0; }
        else this.dryStreak++;
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
      for (const e of this.enemies) {
        if (!e.rangeChargeCycle || e.dead) continue;
        e.state = (e.t % 4) < 1.2 ? "charge" : "idle";
      }
      const pl = this.player;
      // Near-boxes of the two rack rows overlap between rows; E acts on the
      // Euclidean-nearest near station so the toggle always matches the card.
      let act = null, actD = Infinity;
      for (const st of this.rangeStations) {
        st.near = Math.abs(pl.x - st.x) < 20 && Math.abs(pl.y - st.y) < 24;
        if (!st.near) continue;
        const d = Math.hypot(pl.x - st.x, pl.y - st.y);
        if (d < actD) { actD = d; act = st; }
      }
      if (act && this.input.buffered("confirm")) {
        this.input.consume("confirm");
        if (act.kind === "catalog") {
          this.rangeCatalogOpen = true;
          this.rangeCatalogCursor = 0;
          this.audio.play("coin");
        } else if (act.kind === "kibble") {
          // Drop a real health pickup at Jon's feet — exercises the actual
          // collect path (incl. kibble stacking).
          this.spawnPickup("health", pl.x, pl.y, 25);
          this.audio.play("buy");
        } else if (act.kind === "gush") {
          // Jump the combo to the next multiple of 5 and run the real
          // milestone path — repeat presses climb x5 → x10 → x20…
          this.combo = Math.floor(this.combo / 5) * 5 + 4;
          this.onEnemyKilled(null);
        } else if (act.kind === "relic") {
          const on = this.toggleRelic(act.relic);
          this.audio.play(on ? "buy" : "hurt", { pitch: on ? 1 : 0.8 });
          const rd = JH.RELICS.find((r) => r.id === act.relic);
          if (this.float) this.float(act.x, act.y - 30, (on ? "+ " : "− ") + rd.name.toUpperCase(), on ? "#80ff80" : "#8fa8c8");
        } else if (act.kind === "superelite") {
          this.procSuperEliteArrival();
          this.audio.play("buy");
        } else if (act.kind === "mook") {
          // Real killable enemy: on-kill relics (squeegee/rosary/plate/dowsing) need
          // actual deaths — TargetDummy is unkillable by design.
          const m = this.spawnEnemy("mook", 560, act.y);
          m.spawnGrace = 0.5;
          this.audio.play("buy");
        } else if (act.kind === "firepatch") {
          // Lands where spawner mooks stand, so a kill-on-patch is easy to stage.
          JH.spawnFirePatch(this, 560, act.y, 16, 3);
          this.audio.play("sizzle");
        }
      }
    },

    // Benediction sigils: walk-up offer stations from waveCleared_. Same
    // proximity + buffered-E interact pattern as tickRangeStations. Picking
    // any one sigil clears the whole offer (Sigil.pick kills every sigil).
    tickSigils() {
      if (!this.sigils.length) return;
      const pl = this.player;
      for (const s of this.sigils) {
        if (s.dead) continue;
        s.near = Math.abs(pl.x - s.x) < 24 && Math.abs(pl.y - s.y) < 24;
        const pickable = Math.abs(pl.x - s.x) < 16 && Math.abs(pl.y - s.y) < 16;
        if (pickable && this.input.buffered("confirm")) {
          this.input.consume("confirm");
          s.pick(this);
          break;
        }
      }
    },

    // Deepdive TV interaction: sit (E) to fast-forward the world while banked
    // kibble drains; any move key or a second E stands Jon back up. Auto-ends
    // when the kibble bank empties.
    // Random quip, never the same one twice in a row (bump to the next
    // pool slot on a repeat roll).
    pickQuip() {
      const q = JH.DEEPDIVE.quips;
      let i = Math.floor(Math.random() * q.length);
      if (i === this._lastQuipIdx) i = (i + 1) % q.length;
      this._lastQuipIdx = i;
      return q[i];
    },

    tickDeepdive() {
      const tv = this.deepdiveTV;
      if (!tv) return;
      const pl = this.player;
      // An immaterial (tuning-in/out) TV is not interactable: near drives
      // both the E prompt and the sit, so it waits for full materialization.
      tv.near = tv.mat >= 1
        && Math.abs(pl.x - tv.x) < 22 && Math.abs(pl.y - tv.y) < 28;
      if (!this.deepdiving) {
        // Sitting needs a real kibble bank (> threshold); a short bank shows
        // [REQUIRES KIBBLE] at the prompt instead and E does nothing.
        if (tv.near && this.input.buffered("confirm")
            && pl.kibbleTimer > JH.DEEPDIVE.threshold) {
          this.input.consume("confirm");
          this.deepdiving = true;
          this.audio.play("upgrade", { pitch: 0.55 });   // spin-up
          // First quip fires on sit-down — every session gets at least one.
          this.float(pl.x, pl.y - 30, this.pickQuip(), "#9be8ff", { life: 1.8 });
          this._quipCdT = JH.DEEPDIVE.quipGap;
        }
        return;
      }
      tv.videoT += JH.FIXED_DT * this.timeScale;   // cosmetic ramp makes the marquee race
      // Quip drip: every quip opens a quipGap cooldown (real time) so two
      // never overlap; past it, the roll adds a mean quipEvery / timeScale
      // real seconds on top.
      this._quipCdT = (this._quipCdT || 0) - JH.FIXED_DT;
      if (this._quipCdT <= 0
          && Math.random() < JH.FIXED_DT * this.timeScale / JH.DEEPDIVE.quipEvery) {
        this.float(pl.x, pl.y - 30, this.pickQuip(), "#9be8ff", { life: 1.8 });
        this._quipCdT = JH.DEEPDIVE.quipGap;
      }
      // Dash bails and is NOT consumed here: Player.update runs earlier in the
      // step and consumes the buffered edge itself when the dash fires (dash is
      // never movement-gated), so a started dash is detected via dashTimer;
      // buffered("dash") covers a press held off by cooldown.
      const bail = this.input.pressed("up") || this.input.pressed("down")
                || this.input.pressed("left") || this.input.pressed("right")
                || this.input.buffered("confirm")
                || this.input.buffered("dash") || pl.dashTimer > 0;
      if (bail || pl.kibbleTimer <= 0) {
        if (this.input.buffered("confirm")) this.input.consume("confirm");
        this.deepdiving = false;
        this.audio.play("upgrade", { pitch: 1.6 });      // spin-down
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
      // Kibble Pack is the only purchasable heal (over-time, stacks).
      const cons = [
        { key: "kibble", buy: () => this.buyKibble(),
          label: () => JH.KIBBLE_PACK.name,
          desc: () => "Heal " + JH.KIBBLE_PACK.heal + " HP over " + JH.KIBBLE_PACK.dur + "s. Stacks.",
          cost: () => this.priceOf(JH.KIBBLE_PACK.cost) },
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
    // Free-walk left edge: past the air gate the corridor floors at the gate
    // mouth (the gate is one-way — see enterAirAct's bounds).
    freeWalkMinX() {
      return this.checkpointWave >= JH.ACT_STARTS[JH.ACT_STARTS.length - 1]
        ? JH.ZONE4_START + 8 : 8;
    },

    // Return from the Church: warp Jon back in at the last fire hydrant he
    // visited (or the level start), re-arm the wave he died in so it spawns
    // fresh as he walks back ("try again"), and fade the world in. Build +
    // Suds are kept (no Upgrades.reset).
    respawnFromChurch() {
      // The wave to re-fight — floored at the act checkpoint: a death can
      // never respawn EARLIER than the checkpoint (e.g. an arrival-corridor
      // death past the air gate still has waveIndex at airStart-1).
      const next = Math.max(this.checkpointWave || 0, this.diedWave);
      const p = this.player;
      // Benedictions were washed at the death moment (startPlayerDeathSeq) —
      // NOT reset here, or Reliquary reclaims made in the Church would be
      // wiped on the way out. Stat refresh picks up whatever is active now.
      p.applyStats(JH.Upgrades.computeStats(JH.Upgrades.owned));
      const maxX = WAVE_TRIGGERS[next] + 30;
      const minX = this.freeWalkMinX();
      p.x = clamp(this.lastHydrantX || 60, minX + 4, maxX - 12);
      p.y = JH.DEPTH_MAX - 24;
      p.hp = p.stats.maxHp;
      p.water = p.stats.maxWater;
      p.clearBurn();
      p.clearBuffs();   // buff timers freeze through the Church; don't let them resume
      p.alive = true;
      JH.Camera.snapTo(p);   // fade in AT the hydrant, don't scroll across the map
      this.sweepCrosses();   // bank any cross the death left uncollected
      // Church deaths past the air gate come back to the cloudline; earlier
      // checkpoints come back to whatever pre-gate act was active.
      if (JH.Background) JH.Background.airOn = (this.checkpointWave >= JH.ACT_STARTS[JH.ACT_STARTS.length - 1]);
      this.enemies = []; this.embers = []; this.pickups = []; this.particles = []; this.shields = []; this.firePatches = []; this.slowZones = []; this.wavePool = [];
      this.stinkClouds = []; this.gustLanes = []; this.cloudlineEdge = null; this.windHazards = [];
      this.pulseRings = []; this.sermonWaves = [];
      this.floaters = [];
      this.sigils = [];   // usedOnce survives death; active boons are whatever the Reliquary gave back
      this.deferredQueue = [];
      this.hitStopTimer = 0;
      this.trauma = 0; this.shakeKickX = 0; this.lootVacuumT = 0; this.essenceDim = 0;
      this.combo = 0; this.comboTimer = 0; this.comboFlash = 0; this.rosaryBonus = 0;
      this.hydrants = JH.HYDRANTS.map((h) => ({ x: h.x, y: h.y, t: 0 }));
      this.wall = null; this.gardens = [];
      this.shopNpc = null; this.deepdiveTV = null; this.nearShop = false; this.nearVendor = false; this.shopOpen = false;
      this.timeScale = 1; this.deepdiving = false;
      this.dropBudget = { suds: 0, items: 0 };
      this.rangeStations = null;   // a range death degrades to a normal respawn
      this.rangeMode = false;
      this.waveIndex = next - 1;
      // Act gate keyed to the wave being re-fought, not the decremented index.
      JH.Upgrades.currentActLevel = JH.Balance.actLevelForWave(next, JH.ACT_STARTS);
      this.waveActive = false; this.waveCleared = false;
      // Re-arm the trigger for the wave being re-fought; player spawns far
      // left at a hydrant, so this resolves to the normal arena-anchor trigger.
      this.waveTriggerX = this.gatedTriggerX(next, p.x);
      this.bounds = { minX: minX, maxX: Math.max(maxX, this.waveTriggerX + 30) };
      // Church-return arrival: hold on black, then a water jet drops Jon from the
      // sky into a splash landing. updateArrival() drives it; player logic is
      // frozen until it finishes. Jon starts high (z) and eases to the ground.
      this.arrival = { t: 0, blackDur: 0.4, fallDur: 0.6, splashDur: 0.4, height: 240, splashed: false };
      p.z = this.arrival.height;
      this.worldFadeT = 0; this.warpInT = 0;
      this.state = "play";
      this.showScreen("hud");
      JH.Music.reset(); JH.Music.start();
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
      this.sweepCrosses();   // bank any cross still on the ground (e.g. the Slayer's)
      JH.Music.setTrack("level");
      this.state = "win";
      if (JH.Telemetry) JH.Telemetry.finishWin({
        timeSec: this.elapsed, kills: this.kills, deaths: this.deathCount || 0,
        sudsEarned: this.player.sudsEarned, finalWaveIndex: this.waveIndex,
        finalWaveName: (JH.LEVEL1.waves[this.waveIndex] || {}).name || "",
      });
      document.getElementById("win-stats").textContent =
        "Suds banked: " + Math.floor(this.player.sudsEarned) +
        "\nEnemies hosed: " + this.kills +
        "\nTime: " + this.elapsed.toFixed(1) + "s" +
        "\nVisits to Father Jon: " + (this.deathCount || 0);
      this.showScreen("screen-win");
    },
    // Fetches + renders the fastest-win leaderboard; shows loading/empty/failure states.
    openLeaderboard() {
      const list = document.getElementById("lb-list");
      list.innerHTML = "<li>Loading…</li>";
      this.showScreen("screen-leaderboard");
      const render = (rows) => {
        if (!rows || !rows.length) { list.innerHTML = "<li>No wins yet — be the first.</li>"; return; }
        list.innerHTML = rows.map((r, i) =>
          "<li>" + (i + 1) + ". " + escapeHtml(r.handle || "anon") +
          " — " + Number(r.timeSec).toFixed(1) + "s (" + (r.deaths | 0) + " deaths)</li>").join("");
      };
      if (JH.Telemetry && JH.Telemetry.fetchLeaderboard) JH.Telemetry.fetchLeaderboard(render);
      else render(null);
    },
    // Retired from the death path (death now routes to the Church via
    // startPlayerDeathSeq); kept for a future manual quit/give-up affordance.
    gameOver() {
      this.deepdiving = false;
      this.state = "over";
      document.getElementById("over-stats").textContent =
        "You reached " + (JH.LEVEL1.waves[Math.max(0, this.waveIndex)].name) +
        "\nEnemies hosed: " + this.kills;
      this.audio.play("die");
      this.showScreen("screen-over");
    },
    startPlayerDeathSeq() {
      // Death ends a deepdive: tickDeepdive stops running outside "play", so
      // without this the world stays at ~maxScale through the death sequence
      // and Church visit. The frame() ramp eases timeScale back to 1.
      this.deepdiving = false;
      // First death of the RUN: cue Father Jon's line; the pity Essence is a
      // cross he sets down in the church scene itself (church.js pityCross).
      this.deathCount = (this.deathCount || 0) + 1;
      if (JH.Telemetry) JH.Telemetry.death(this.waveIndex);
      if (this.deathCount === 1 && JH.Church) JH.Church.pendingPity = true;
      this.diedWave = this.waveIndex;        // the wave to re-arm on return
      // Wash (not wipe) benedictions at the death moment: they move to the
      // Reliquary, reclaimable in the Church for Essence before respawn.
      if (JH.Benedictions) JH.Benedictions.wash();
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
      else if (this.state === "truck") { this.state = "truckPause"; this.showScreen("screen-pause"); }
      else if (this.state === "truckPause") {
        this.state = "truck";
        document.getElementById("screen-pause").classList.add("hidden");
      }
    },

    // ============================================================ LOOP
    frame(now) {
      if (!this.running) return;
      let dt = (now - this.lastT) / 1000;
      this.lastT = now;
      if (dt > 0.25) dt = 0.25;          // tab-switch guard
      // Deepdive's timeScale is COSMETIC only (overlay intensity, marquee
      // race, kibble accel factor) — the world sim always runs at 1x, so
      // none of the 10x edge cases (death seq, church, stalls) can exist.
      this.timeScale = JH.Balance.deepdiveRamp(this.timeScale, this.deepdiving, dt, JH.DEEPDIVE);
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

      // pause toggle works in play/pause, church/churchPause, and truck/truckPause.
      // While the shop is open, Escape/Start closes it instead of pausing.
      if (this.input.pressed("pause") && (this.state === "play" || this.state === "pause"
        || this.state === "church" || this.state === "churchPause"
        || this.state === "truck" || this.state === "truckPause")) {
        if (this.state === "play" && this.rangeCatalogOpen) this.rangeCatalogOpen = false;
        else if (this.state === "play" && this.shopOpen) this.shopOpen = false;
        else this.togglePause();
      }

      // Stat + benediction panel toggle (Tab / gamepad Back).
      if (this.input.pressed("toggleStats") && this.state === "play")
        this.showStats = !this.showStats;

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

      // Fire-truck escape: self-contained scrolling sub-mode (see truck.js).
      if (this.state === "truckPause") return;        // frozen; pause menu is up
      if (this.state === "truck") {
        if (JH.TruckRun.update) JH.TruckRun.update(dt, this);
        return;
      }

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

      // The catalog owns directional/confirm input while open. Freezing the
      // lab also makes reading long item text safe with a live boss selected.
      if (this.rangeCatalogOpen) {
        this.tickRangeCatalog();
        this.updateHUD();
        return;
      }

      // Sim runs at 1x always (deepdive's speedup is cosmetic), so the run
      // clock is plain real time again.
      this.elapsed += dt;

      // GUSH combo decay (only ticks during live play, frozen during hitstop).
      this.decayCombo(dt);
      this.updatePulseRings(dt);
      this.updateSermonWaves(dt);

      // --- entities
      this.player.update(dt, this);
      for (const e of this.enemies) e.update(dt, this);
      for (const s of this.shields) s.update(dt);
      for (const fp of this.firePatches) fp.update(dt, this);
      for (const sc of this.stinkClouds) sc.update(dt, this);
      for (const gl of this.gustLanes) gl.update(dt, this);
      // After gust lanes so a gust push across the edge resolves the same step.
      if (this.cloudlineEdge) this.cloudlineEdge.update(dt, this);
      for (const hz of this.windHazards) hz.update(dt, this);
      this.player.zoneSlow = 1;
      for (const z of this.slowZones) z.update(dt, this);
      this.embers = this.embers.filter((p) => p.update(dt, this));
      this.pickups = this.pickups.filter((p) => p.update(dt, this));
      this.sigils = this.sigils.filter((s) => s.update(dt));
      // Choosing the Slayer benediction triggers the escape sequence.
      if (this.slayerBeneBeat && this.sigils.length === 0) {
        this.slayerBeneBeat = false;
        this.startTruckArrival();
      }
      // Essence-cross event: while a cross is uncollected the world dims.
      const crossOut = this.pickups.some((p) => !p.dead && p.kind === "cross");
      this.essenceDim += ((crossOut ? 1 : 0) - this.essenceDim) * Math.min(1, 3 * dt);
      this.particles = this.particles.filter((p) => p.update(dt));
      this.tickFloaters(dt);

      // --- hydrant timers + walk-up shop vendor
      for (const h of this.hydrants) h.t += dt;
      this.tickRangeStations();
      this.tickSigils();
      this.tickDeepdive();
      // Remember the last hydrant visited — death returns Jon here.
      if (this.player.nearHydrant) this.lastHydrantX = this.player.nearHydrant.x;
      // Victory portal (post-Slayer): walk in and confirm to finish the run.
      if (this.victoryPortal) {
        const vp = this.victoryPortal;
        vp.t += dt;
        vp.near = Math.abs(this.player.x - vp.x) < 22 && Math.abs(this.player.y - vp.y) < 30;
        if (vp.near && this.input.buffered("confirm")) { this.input.consume("confirm"); this.win(); return; }
      }
      // Post-Slayer: the fire world crumbles and the escape truck drives in.
      if (this.worldCrumble) {
        const wc = this.worldCrumble;
        wc.t += dt;
        if ((wc.shakeCd -= dt) <= 0) {
          wc.shakeCd = 0.5 + Math.random() * 0.6;
          this.shake(3);
        }
        // Periodic heavy quake + rumble while the truck waits to be boarded.
        if ((wc.quakeCd -= dt) <= 0) {
          wc.quakeCd = 3.0 + Math.random() * 1.2;
          this.shake(9);
          if (JH.AudioFX && JH.AudioFX.play) JH.AudioFX.play("dread");
        }
      }
      if (this.truckBoard) {
        const tb = this.truckBoard;
        tb.t += dt;
        // Departure beat: Jon's aboard — the truck peels out right, the screen
        // dips to black, then the escape scene takes over (fade-in there).
        if (tb.departing) {
          tb.vx += 520 * dt;
          tb.x += tb.vx * dt;
          // Fade only once the truck has fully cleared the right screen edge.
          if (tb.x - JH.Camera.x > JH.VIEW_W + 70) tb.fade = Math.min(1, (tb.fade || 0) + dt / 0.3);
          if (tb.fade >= 1) {
            this.truckBoard = null; this.worldCrumble = null;
            JH.TruckRun.enter(this);
          }
          return;
        }
        if (tb.x > tb.stopX) tb.x = Math.max(tb.stopX, tb.x - 200 * dt);  // drive in + brake
        tb.arrived = tb.x <= tb.stopX + 0.5;
        // Solid body: AABB footprint on the floor plane (chassis span), push
        // the player out along the shallower axis, re-clamp to the field.
        // The board box (68/34) wraps outside it, so E reaches from any side.
        const p = this.player, HW = 50, HD = 12;
        const pdx = p.x - tb.x, pdy = p.y - tb.y;
        if (Math.abs(pdx) < HW && Math.abs(pdy) < HD) {
          if (HW - Math.abs(pdx) < HD - Math.abs(pdy)) p.x = tb.x + (pdx < 0 ? -HW : HW);
          else p.y = tb.y + (pdy < 0 ? -HD : HD);
          p.x = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, p.x));
          p.y = JH.Geo.clampDepth(p.y);
        }
        tb.near = tb.arrived && Math.abs(p.x - tb.x) < 68 && Math.abs(p.y - tb.y) < 34;
        if (tb.near && this.input.buffered("confirm")) {
          this.input.consume("confirm");
          tb.departing = true; tb.vx = 40; tb.near = false;
          if (JH.AudioFX && JH.AudioFX.play) JH.AudioFX.play("dash");
          return;
        }
      }
      if (this.deepdiveTV) this.deepdiveTV.update(dt);
      if (this.shopNpc) {
        this.shopNpc.update(dt, this.player);
        this.nearVendor = Math.abs(this.player.x - this.shopNpc.x) < JH.SHOP.range &&
          Math.abs(this.player.y - this.shopNpc.y) < 30;
        // The shop is a walk-up interaction: E at the vendor opens it; it
        // closes on Escape/Start or by leaving vendor range.
        if (!this.shopOpen && this.nearVendor && this.input.buffered("confirm")) {
          this.input.consume("confirm");
          this.shopOpen = true;
          this.shopCursor = 0;
          this.audio.play("coin");
        }
        if (this.shopOpen && !this.nearVendor) this.shopOpen = false;
        // Downstream consumers (panel mode, HUD hide, nav gating, wave hold)
        // key off nearShop = "shop UI open".
        this.nearShop = this.shopOpen;
        this.player.nearShop = this.nearShop;
        // Wheel reel-spin: arms once per vendor on the first OPEN, so the
        // reels + coin blips play in front of the open panel. Each reel (0-2)
        // settles at 0.6 + i*0.3s with one pitch-stepped "coin" blip.
        if (this.shopOpen && !this._wheelSpun) {
          this._wheelSpun = true;
          this.wheelSpinT = 0;
          this._wheelSettled = [false, false, false];
        }
        if (this._wheelSpun) {
          this.wheelSpinT += dt;
          for (let i = 0; i < 3; i++) {
            const settle = 0.6 + i * 0.3;
            if (!this._wheelSettled[i] && this.wheelSpinT >= settle) {
              this._wheelSettled[i] = true;
              this.audio.play("coin", { pitch: 1 + i * 0.2 });
            }
          }
        }
        this.player.shopWheelFocus = false;
        if (this.nearShop) {
          const U = JH.Upgrades;
          const sel = this.shopSelectables();
          if (sel.length > 0) {
            if (this.input.pressed("up"))   this.shopCursor = (this.shopCursor - 1 + sel.length) % sel.length;
            if (this.input.pressed("down")) this.shopCursor = (this.shopCursor + 1) % sel.length;
            const onWheel = sel[this.shopCursor] && sel[this.shopCursor].kind === "wheelRow";
            // Entity movement reads this: while the cursor sits on the wheel
            // row, left/right belong to card navigation, not walking (same
            // pattern as the nearShop up/down suppression in Player.update).
            this.player.shopWheelFocus = onWheel;
            if (onWheel) {
              if (this.input.pressed("left"))  this.shopWheelSlot = Math.max(0, this.shopWheelSlot - 1);
              if (this.input.pressed("right")) this.shopWheelSlot = Math.min(3, this.shopWheelSlot + 1);
            }
            // Mouse: clicking a reel window selects that slot and buys it
            // (window rects are stored by the draw pass each frame).
            const mc = JH.Input.mouse;
            if (mc && mc.clickEdge && this._wheelRects) {
              for (const rc of this._wheelRects) {
                if (mc.x >= rc.x && mc.x <= rc.x + rc.w && mc.y >= rc.y && mc.y <= rc.y + rc.h) {
                  const wi = sel.findIndex((s) => s.kind === "wheelRow");
                  if (wi >= 0) {
                    this.shopCursor = wi;
                    this.shopWheelSlot = rc.i;
                    this.player.shopWheelFocus = true;
                    this.input.bufferPress("confirm");
                  }
                  break;
                }
              }
            }
            if (this.input.buffered("confirm")) {
              this.input.consume("confirm");
              const e = sel[this.shopCursor];
              let ok = false, telemKind = e.kind, telemId = e.id;
              if (e.kind === "node") {
                ok = U.buy(e.id, this.player, this.priceOf(U.cost(e.id)));
                if (ok) { this.upgradeFx(U.byId(e.id)); this.float(this.player.x, this.player.y - 30, U.byId(e.id).name, "#80ff80"); }
              } else if (e.kind === "rep") {
                ok = U.buyRep(e.id, this.player, this.priceOf(U.repCost(e.id)));
                if (ok) { this.audio.play("upgrade"); this.float(this.player.x, this.player.y - 30, U.repById(e.id).name, "#80ff80"); }
              }
              else if (e.kind === "wheelRow") {
                if (this.shopWheelSlot === 3) {
                  telemKind = "consumable"; telemId = "kibble";
                  ok = this.buyKibble();
                  if (ok) { this.audio.play("upgrade"); this.float(this.player.x, this.player.y - 30, "Kibble Pack", "#80ff80"); }
                } else {
                  // Snapshot slot: sold/empty cards leave ok false → deny
                  // "hurt" (buyRelic itself also refuses owned/out-of-stock).
                  const wid = (this.wheelStock || [])[this.shopWheelSlot];
                  telemKind = "relic"; telemId = wid;
                  if (wid && !(this.relics && this.relics[wid])) {
                    ok = this.buyRelic(wid);
                    if (ok) {
                      const r = JH.RELICS.find((x) => x.id === wid);
                      this.audio.play("upgrade");
                      this.float(this.player.x, this.player.y - 30, r.name, "#80ff80");
                    }
                  }
                }
              }
              if (ok && JH.Telemetry) JH.Telemetry.item(telemKind + ":" + telemId);
              if (!ok) this.audio.play("hurt");
              else {
                if (this.voucher50) {
                  this.voucher50 = false;
                  this.float(this.player.x, this.player.y - 42, "VOUCHER REDEEMED", "#6cd3ff");
                }
                this.shopCursor = Math.min(this.shopCursor, Math.max(0, this.shopSelectables().length - 1));
              }
            }
          }
        }
      } else {
        this.nearShop = false; this.nearVendor = false; this.shopOpen = false;
        this.player.nearShop = false; this.player.shopWheelFocus = false;
      }

      // --- separation so enemies don't fully stack
      this.separate();

      // --- cull dead enemies
      this.enemies = this.enemies.filter((e) => !e.dead);
      this.shields = this.shields.filter((s) => !s.dead);
      this.firePatches = this.firePatches.filter((fp) => !fp.dead);
      this.stinkClouds = this.stinkClouds.filter((sc) => !sc.dead);
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
            // Reinforcements arrive in pairs with a breather after kills:
            // Balance.wallReinforce holds the countdown while the field is
            // full, so the delay starts when kills thin it (live-feedback
            // pacing nerf — was a 1.5s per-enemy top-up).
            const aliveCount = this.enemies.filter((e) => !e.dead && !e.isBoss).length;
            const rf = JH.Balance.wallReinforce(aliveCount, this.wallSpawnTimer, dt, JH.WALL);
            this.wallSpawnTimer = rf.timer;
            for (let k = 0; k < rf.spawn; k++) {
              const type = this.wallPool[(Math.random() * this.wallPool.length) | 0] || "mook";
              const ey = JH.DEPTH_MIN + 8 + Math.random() * (JH.DEPTH_MAX - JH.DEPTH_MIN - 16);
              const e = this.spawnEnemy(type, this.wall.x - 16, ey, { infinite: true, elite: this.nextEliteScale() });
              e.spawnGrace = 0.2 + k * 0.15;   // stagger the pair a beat
            }
          }
          if (!this.wall || this.wall.dead) {
            // Wall down = encounter beaten: remaining reinforcements leave
            // without reward (same idiom as the garden harassers) instead of
            // demanding a mop-up.
            for (const e of this.enemies) if (!e.dead && !e.isBoss) e.dead = true;
            this.waveCleared_();
          }
        } else if (wave && wave.holdout) {
          this.holdoutTimer -= dt;
          this.wallSpawnTimer -= dt;
          const cadence = this.holdoutCadence(wave);
          if (this.wallSpawnTimer <= 0 && this.enemies.length < cadence.maxAlive) {
            this.wallSpawnTimer = cadence.spawnEvery;
            const type = this.wallPool[(Math.random() * this.wallPool.length) | 0] || "mook";
            const ey = JH.DEPTH_MIN + 8 + Math.random() * (JH.DEPTH_MAX - JH.DEPTH_MIN - 16);
            // Spawn from either edge so pressure comes from ahead AND behind
            // (right band clamped to stay off the cloudline edge — see
            // holdoutSpawnX).
            const ex = this.holdoutSpawnX();
            const e = this.spawnEnemy(type, ex, ey, { infinite: true, elite: this.nextEliteScale() });
            e.spawnGrace = 0.2;
          }
          if (this.holdoutTimer <= 0) {
            // Survived = encounter beaten: the field clears with the wave
            // (rewardless, garden idiom) — no post-timer mop-up.
            for (const e of this.enemies) if (!e.dead && !e.isBoss) e.dead = true;
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
        } else {
          // Reinforcements (enemies is already culled to the living this
          // frame). With 3+ queued they arrive as a BATCH once the field
          // thins enough to fit one — a wave-within-a-wave surge instead of
          // one-for-one replacement. Small remainders trickle in singly.
          if (this.wavePool && this.wavePool.length) {
            this.waveTrickleT -= dt;
            const W = JH.WAVEFLOW;
            const fieldCap = JH.Balance.ticketBudget(
              JH.Balance.actLevelForWave(this.waveIndex, JH.ACT_STARTS), W.fieldCap);
            const room = fieldCap - this.enemies.length;
            if (this.waveTrickleT <= 0) {
              if (this.wavePool.length >= W.batchMin) {
                if (room >= W.batchMin) {
                  const n = Math.min(this.wavePool.length, room, W.batchMax);
                  for (let k = 0; k < n; k++)
                    this.reinforceFx(this.spawnWaveEnemy(this.wavePool.shift(), this.nextEliteScale(), k));
                  this.waveTrickleT = W.batchPause;
                }
                // No room yet: hold the batch, re-check next frame.
              } else if (room > 0) {
                this.waveTrickleT = W.trickle;
                this.reinforceFx(this.spawnWaveEnemy(this.wavePool.shift(), this.nextEliteScale(), 0));
              }
            }
          }
          // The wave only clears once the queue has fully emptied onto the field.
          if (this.reinforcementWaveCleared()) this.waveCleared_();
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
          if ((e1.def && e1.def.speed === 0) || (e2.def && e2.def.speed === 0)) continue;  // emplacements hold fast
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

    // KeyH dev overlay — draws the REAL hit variables, never approximations:
    // magenta = enemy bodies (bodyW x bodyH at the feet; inHitArc measures
    // edge-to-edge, so effective reach extends half a body past each rect),
    // cyan = Jon's spray band while spraying (nozzle -> live reach, ±sprayHitBand
    // depth), gold = prop feet ellipses (dy counts 2.4x, same as propPushout).
    drawDebugHitboxes(ctx, cam) {
      const pl = this.player; if (!pl) return;
      ctx.save();
      ctx.lineWidth = 1; ctx.font = "5px monospace";
      for (const e of this.enemies) {
        if (e.dead) continue;
        const sx = e.x - cam, sy = JH.Geo.feetScreenY(e.y, 0);
        const bw = e.bodyW || 14, bh = e.bodyH || 20;
        ctx.strokeStyle = e.isBoss ? "#ff5aff" : "#ff00ff";
        ctx.strokeRect(Math.round(sx - bw / 2), Math.round(sy - bh - 3), bw, bh);
        ctx.fillStyle = "#ff00ff";
        ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 2, 2);   // feet anchor
      }
      if (pl.spraying && pl._dbgReach != null) {
        const S = pl.stats, dir = pl.facing;
        const ox = pl.x + dir * 12 - cam;
        // Stream rect exactly as inSprayPath tests it: jet centerline at
        // nozzle height, ± band screen px. A magenta body crossing this
        // rect (within the x range) IS a hit.
        const jetY = JH.Geo.feetScreenY(pl.y, (pl.z || 0) + JH.PLAYER.nozzleZ);
        ctx.strokeStyle = "#00e5ff";
        ctx.strokeRect(Math.round(Math.min(ox, ox + dir * pl._dbgReach)),
          Math.round(jetY - S.sprayHitBand),
          Math.round(pl._dbgReach), S.sprayHitBand * 2);
        ctx.fillStyle = "#00e5ff";
        ctx.fillText("SPRAY " + Math.round(pl._dbgReach) + "px  ±" + S.sprayHitBand,
          Math.round(ox + dir * 8), Math.round(jetY - S.sprayHitBand) - 2);
      }
      const props = [
        [this.shopNpc, JH.SHOP && JH.SHOP.vendorCollideR],
        [this.deepdiveTV && this.deepdiveTV.mat > 0.5 ? this.deepdiveTV : null,
          JH.DEEPDIVE && JH.DEEPDIVE.tvCollideR],
      ];
      for (const [prop, r] of props) {
        if (!prop || !r) continue;
        const px = prop.x - cam, py = JH.Geo.feetScreenY(prop.y, 0);
        ctx.strokeStyle = "#ffd23f";
        ctx.beginPath(); ctx.ellipse(px, py, r, r / 2.4, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    },

    drawRangeStations(ctx, cam) {
      const RANGE_LABELS = { kibble: "KIBBLE", gush: "GUSH", superelite: "SUPER-ELITE", firepatch: "FIRE PATCH" };
      for (const st of this.rangeStations) {
        const sx = Math.round(st.x - cam), sy = Math.round(JH.Geo.feetScreenY(st.y, 0));
        ctx.save();
        if (st.kind === "catalog") {
          // Chunky code-native vending cabinet: one screen replaces dozens of
          // floor pickups/statues while remaining legible as a world fixture.
          ctx.fillStyle = "#07101b";
          ctx.beginPath(); ctx.ellipse(sx, sy + 1, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#26364c"; ctx.fillRect(sx - 13, sy - 39, 26, 39);
          ctx.fillStyle = "#0b1624"; ctx.fillRect(sx - 10, sy - 36, 20, 20);
          ctx.strokeStyle = "#6cd3ff"; ctx.strokeRect(sx - 10.5, sy - 36.5, 21, 21);
          ctx.fillStyle = "#6cd3ff"; ctx.fillRect(sx - 7, sy - 32, 14, 3);
          ctx.fillStyle = "#ffd23f"; ctx.fillRect(sx - 7, sy - 26, 4, 4);
          ctx.fillStyle = "#c9924a"; ctx.fillRect(sx - 2, sy - 26, 4, 4);
          ctx.fillStyle = "#ff5a5a"; ctx.fillRect(sx + 3, sy - 26, 4, 4);
          ctx.fillStyle = "#101a28"; ctx.fillRect(sx - 8, sy - 12, 16, 7);
          ctx.fillStyle = "#8fa8c8"; ctx.fillRect(sx - 5, sy - 9, 10, 2);
          ctx.font = "bold 5px monospace"; ctx.textAlign = "center";
          ctx.fillStyle = "#9be8ff"; ctx.fillText("TEST-O-MAT", sx, sy - 44);
        } else if (st.kind === "relic") {
          const rd = JH.RELICS.find((r) => r.id === st.relic);
          const owned = !!this.relics[st.relic];
          ctx.globalAlpha = owned ? 1 : 0.5;
          JH.Assets.gearFrame(ctx, sx, sy - 14, 1.5, rd && rd.tier, this.player ? this.player.t : 0);
          JH.Assets.icon(ctx, st.relic, sx, sy - 14, 1.5);
          ctx.globalAlpha = 1;
          if (owned) { ctx.fillStyle = "#80ff80"; ctx.fillRect(sx + 7, sy - 20, 2, 2); }
        } else {
          // pedestal + ground pad
          ctx.fillStyle = "#0d1420";
          ctx.beginPath(); ctx.ellipse(sx, sy, 9, 9 * JH.GROUND_RY, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#2a3548";
          ctx.fillRect(sx - 7, sy - 10, 14, 10);
          if (st.kind === "kibble") {
            ctx.fillStyle = "#44ee66";
          } else if (st.kind === "gush") {
            ctx.fillStyle = "#55c8ff";
          } else if (st.kind === "superelite") {
            ctx.fillStyle = "#ff5a5a";
          } else if (st.kind === "mook") {
            ctx.fillStyle = "#cc5c18";
          } else if (st.kind === "firepatch") {
            ctx.fillStyle = "#ff9040";
          }
          if (st.kind === "kibble") {
            ctx.fillRect(sx - 4, sy - 15, 8, 6);
          } else {
            ctx.beginPath(); ctx.arc(sx, sy - 13, 4, 0, Math.PI * 2); ctx.fill();
          }
          ctx.font = "bold 5px monospace"; ctx.textAlign = "center";
          ctx.fillStyle = "#9be8ff";
          ctx.fillText(RANGE_LABELS[st.kind] || st.kind.toUpperCase(), sx, sy - 20);
        }
        if (st.near) {
          ctx.fillStyle = "#ffd23f"; ctx.font = "bold 7px monospace";
          ctx.fillText("E", sx, sy - 27 + Math.sin((this.player ? this.player.t : 0) * 6) * 1.5);
        }
        ctx.textAlign = "left";
        ctx.restore();
      }
      // Labels for the cycling charge dummy and the one live catalog spawn.
      ctx.save();
      ctx.font = "bold 5px monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#7fa0c0";
      for (const e of this.enemies) {
        if (!e.rangeCatalogSpawn && !e.rangeChargeCycle) continue;
        const sx = Math.round(e.x - cam);
        if (sx < -30 || sx > JH.VIEW_W + 30) continue;
        const label = e.rangeChargeCycle ? (e.state === "charge" ? "CHARGING!" : "CHARGE DUMMY") : "LIVE: " + e.type.toUpperCase();
        const color = (e.rangeChargeCycle && e.state === "charge") ? "#ff5a5a" : "#7fa0c0";
        ctx.fillStyle = color;
        ctx.fillText(label, sx, JH.Geo.feetScreenY(e.y, 0) - e.bodyH - 8);
      }
      ctx.fillStyle = "#7fa0c0";
      ctx.textAlign = "left";
      ctx.restore();
    },

    drawRangeCatalog(ctx) {
      const tab = RANGE_CATALOG_TABS[this.rangeCatalogTab] || "boons";
      const entries = this.rangeCatalogEntries();
      const cursor = clamp(this.rangeCatalogCursor, 0, entries.length - 1);
      const selected = entries[cursor];
      const visible = 9;
      const start = clamp(cursor - 4, 0, Math.max(0, entries.length - visible));
      const X = 24, Y = 18, W = 432, H = 234;
      const tierColors = { common: "#8fa8c8", rare: "#c9924a", relic: "#ffd23f" };
      const elementColors = { water: "#6cd3ff", fire: "#ff8030", earth: "#c8a050", air: "#bfe8ff" };
      const wrap = (text, max) => {
        const words = String(text || "").split(/\s+/), lines = [];
        let line = "";
        for (const word of words) {
          if ((line + " " + word).trim().length > max && line) { lines.push(line); line = word; }
          else line = (line + " " + word).trim();
        }
        if (line) lines.push(line);
        return lines;
      };

      ctx.save();
      ctx.fillStyle = "rgba(3,7,13,0.96)"; ctx.fillRect(X, Y, W, H);
      ctx.strokeStyle = "#6cd3ff"; ctx.lineWidth = 2; ctx.strokeRect(X, Y, W, H);
      ctx.fillStyle = "#dfe8f5"; ctx.font = "bold 9px monospace"; ctx.textAlign = "left";
      ctx.fillText("TEST-O-MAT", X + 12, Y + 15);
      ctx.font = "5px monospace"; ctx.fillStyle = "#7fa0c0";
      ctx.fillText("RANGE INVENTORY & LIVE SPECIMEN DISPENSER", X + 86, Y + 15);

      const tabW = 86;
      for (let i = 0; i < RANGE_CATALOG_TABS.length; i++) {
        const tx = X + 12 + i * (tabW + 4), active = i === this.rangeCatalogTab;
        ctx.fillStyle = active ? "#17334a" : "#0b1420"; ctx.fillRect(tx, Y + 23, tabW, 16);
        ctx.strokeStyle = active ? "#6cd3ff" : "#31445c"; ctx.strokeRect(tx, Y + 23, tabW, 16);
        ctx.fillStyle = active ? "#dff7ff" : "#71849c"; ctx.font = "bold 6px monospace"; ctx.textAlign = "center";
        ctx.fillText(["BENEDICTIONS", "RELICS", "ENEMIES + BOSSES"][i], tx + tabW / 2, Y + 34);
      }

      ctx.fillStyle = "#09111d"; ctx.fillRect(X + 12, Y + 47, 200, 153);
      ctx.strokeStyle = "#26384e"; ctx.strokeRect(X + 12, Y + 47, 200, 153);
      for (let row = 0; row < visible; row++) {
        const i = start + row;
        if (i >= entries.length) break;
        const e = entries[i], yy = Y + 58 + row * 16, active = i === cursor;
        if (active) { ctx.fillStyle = "#17334a"; ctx.fillRect(X + 16, yy - 9, 192, 14); }
        let status = "";
        if (tab === "boons") {
          const rank = JH.Benedictions.rank(e.id);
          status = rank ? (rank >= 2 ? "II" : "I") : "";
        } else if (tab === "relics") status = this.relics[e.id] ? "ON" : "";
        else status = e.boss ? "BOSS" : e.air ? "AIR" : e.setpiece ? "SET" : "";
        ctx.textAlign = "left"; ctx.font = active ? "bold 6px monospace" : "6px monospace";
        ctx.fillStyle = active ? "#ffffff" : "#aebdd4"; ctx.fillText(e.name, X + 21, yy);
        ctx.textAlign = "right"; ctx.fillStyle = tab === "relics" ? (tierColors[e.tier] || "#8fa8c8")
          : tab === "boons" ? (elementColors[e.element] || "#bfe8ff") : e.boss ? "#ff5a5a" : e.air ? "#bfe8ff" : "#7fa0c0";
        ctx.fillText(status, X + 202, yy);
      }
      if (start > 0) { ctx.fillStyle = "#6cd3ff"; ctx.textAlign = "center"; ctx.fillText("▲", X + 206, Y + 54); }
      if (start + visible < entries.length) { ctx.fillStyle = "#6cd3ff"; ctx.textAlign = "center"; ctx.fillText("▼", X + 206, Y + 196); }

      const DX = X + 226;
      ctx.textAlign = "left"; ctx.font = "bold 8px monospace"; ctx.fillStyle = "#ffffff";
      ctx.fillText(selected.name.toUpperCase(), DX, Y + 61);
      let badge = "";
      if (tab === "boons") badge = (selected.kind || "boon").toUpperCase() + "  ·  " + (selected.element || (selected.needs || []).join(" + ")).toUpperCase();
      else if (tab === "relics") badge = selected.tier.toUpperCase() + " RELIC";
      else badge = selected.boss ? "LIVE BOSS" : selected.air ? "AIR ACT ENEMY" : selected.setpiece ? "LIVE SET-PIECE" : "LIVE ENEMY";
      ctx.font = "bold 6px monospace"; ctx.fillStyle = tab === "relics" ? tierColors[selected.tier]
        : tab === "boons" ? (elementColors[selected.element] || "#bfe8ff") : selected.boss ? "#ff5a5a" : "#9be8ff";
      ctx.fillText(badge, DX, Y + 74);
      let desc;
      if (tab === "boons") desc = JH.Benedictions.effectText(selected.id, JH.Benedictions.rank(selected.id));
      else if (tab === "relics") desc = selected.desc;
      else {
        const d = JH.ENEMIES[selected.id];
        desc = selected.boss ? "Replaces the previous live specimen and starts the complete boss AI in the spawn bay."
          : d ? "HP " + d.hp + "  ·  SPEED " + d.speed + ". Replaces the previous live specimen in the spawn bay."
          : "Replaces the previous live specimen and starts its complete encounter AI in the spawn bay.";
      }
      ctx.font = "6px monospace"; ctx.fillStyle = "#aebdd4";
      wrap(desc, 31).slice(0, 7).forEach((line, i) => ctx.fillText(line, DX, Y + 91 + i * 10));
      ctx.fillStyle = "#182538"; ctx.fillRect(DX, Y + 171, 190, 29);
      ctx.font = "bold 6px monospace"; ctx.fillStyle = "#80ff80";
      let action;
      if (tab === "boons") action = JH.Benedictions.rank(selected.id) >= 2 ? "E  REMOVE" : "E  GRANT NEXT RANK";
      else if (tab === "relics") action = this.relics[selected.id] ? "E  SWITCH OFF" : "E  SWITCH ON";
      else action = "E  DISPENSE LIVE";
      ctx.fillText(action, DX + 8, Y + 184);
      ctx.font = "5px monospace"; ctx.fillStyle = "#7fa0c0";
      ctx.fillText("← → TAB   ↑ ↓ SELECT   ESC CLOSE", X + 12, Y + H - 9);
      ctx.restore();
    },

    updateHUD() {
      if (!this.player) return;
      const hud = document.getElementById("hud");
      if (hud) hud.style.visibility = (this.state === "play" && (this.nearShop || this.rangeCatalogOpen)) ? "hidden" : "";
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
      if (this.state === "truck" || this.state === "truckPause") {
        const ctx = this.ctx;
        ctx.save();
        ctx.clearRect(-12, -12, JH.VIEW_W + 24, JH.VIEW_H + 24);
        JH.TruckRun.renderScene(ctx, this);   // frozen scene shows behind the pause menu
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
        if (JH.DEBUG_HITBOX) this.drawDebugHitboxes(ctx, cam);
        if (this.victoryPortal) this.drawVictoryPortal(ctx, cam);
        if (this.truckBoard) this.drawTruckBoard(ctx, cam);
        if (this.worldCrumble) this.drawCrumble(ctx);

        // barricade (if a wall encounter is active)
        if (this.wall) this.wall.draw(ctx, cam);

        // garden boxes (if a garden encounter is active)
        if (this.gardens) for (const g of this.gardens) g.draw(ctx, cam);

        // planted Bulwark shields (static world props, drawn like the wall/gardens)
        for (const s of this.shields) s.draw(ctx, cam);

        // fire patches (burning ground zones from Fuse deaths, Smelt smashes, etc.)
        for (const fp of this.firePatches) fp.draw(ctx, cam);

        // gust lanes and stink clouds — drawn last of the ground hazards so
        // gas billows over patches/lanes underneath.
        for (const gl of this.gustLanes) gl.draw(ctx, cam);
        for (const sc of this.stinkClouds) sc.draw(ctx, cam);
        if (this.cloudlineEdge) this.cloudlineEdge.draw(ctx, cam);
        for (const hz of this.windHazards) hz.draw(ctx, cam);

        // slow zones (super-Bulwark's landed shield)
        for (const z of this.slowZones) z.draw(ctx, cam);

        // Pressure Sermon waves — the drawn crescent front IS the hit front
        // (leading edge ≈ +4px of the wave x, matching updateSermonWaves).
        if (this.sermonWaves) for (const w of this.sermonWaves) {
          const C = JH.SERMON;
          const wx = w.x - cam;
          const topY = JH.Geo.feetScreenY(w.y - C.halfDepth, 0);
          const botY = JH.Geo.feetScreenY(w.y + C.halfDepth, 0);
          const k = Math.max(0, 1 - w.traveled / C.range);
          ctx.save();
          ctx.globalAlpha = 0.35 + 0.45 * k;
          ctx.strokeStyle = JH.PAL.waterHi; ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(wx - w.dir * 6, topY);
          ctx.quadraticCurveTo(wx + w.dir * 8, (topY + botY) / 2, wx - w.dir * 6, botY);
          ctx.stroke();
          ctx.globalAlpha *= 0.6;
          ctx.strokeStyle = JH.PAL.water; ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(wx - w.dir * 11, topY + 2);
          ctx.quadraticCurveTo(wx + w.dir * 2, (topY + botY) / 2, wx - w.dir * 11, botY - 2);
          ctx.stroke();
          ctx.restore();
        }

        // GUSH pulse rings (Backdraft Valve / Big Spigot) + visual-only
        // benediction AoE rings (Aftershock splash, Boilover spread) —
        // drawn rim IS the hit rim in every case.
        if (this.pulseRings) for (const ring of this.pulseRings) {
          const sx = ring.x - cam, sy = JH.Geo.feetScreenY(ring.y, 0);
          // Rings default to the 0.34 pulse flatten; a ring may carry its own
          // final ry (Boilover's taller contagion ellipse) — grown in step.
          const ryNow = ring.ry != null ? ring.r * (ring.ry / ring.targetR) : ring.r * 0.34;
          ctx.save();
          ctx.globalAlpha = Math.max(0, 1 - ring.t / (ring.dur + 0.15));
          ctx.strokeStyle = ring.color || JH.PAL.waterHi;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(sx, sy, ring.r, ryNow, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        // ground pickups first
        for (const p of this.pickups) p.draw(ctx, cam);
        // benediction sigils (walk-up offer beat) + a persistent CHOOSE ONE
        // label over the trio so the one-pick rule reads from anywhere.
        {
          const live = this.sigils.filter((s) => !s.dead);
          for (const s of live) s.draw(ctx, cam);
          if (live.length > 1 && !this.rangeMode) {
            let cx = 0, cy = Infinity;
            for (const s of live) { cx += s.x; cy = Math.min(cy, JH.Geo.feetScreenY(s.y, 0)); }
            cx = cx / live.length - cam;
            ctx.save();
            ctx.globalAlpha = 0.7 + 0.3 * Math.sin(this.player.t * 4);
            ctx.font = "bold 7px monospace"; ctx.textAlign = "center";
            ctx.fillStyle = "#ffd23f";
            ctx.fillText("CHOOSE ONE", Math.round(cx), Math.round(cy - 52));
            ctx.restore();
          }
        }

        // depth-sort actors (enemies + player + vendor) by world Y
        const actors = this.enemies.slice();
        // Jon rides in the cab during the departure beat — don't double-draw him.
        if (!(this.truckBoard && this.truckBoard.departing)) actors.push(this.player);
        if (this.shopNpc) actors.push(this.shopNpc);
        if (this.deepdiveTV) actors.push(this.deepdiveTV);
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
          } else if (e === this.player && this.deepdiving && this.deepdiveTV) {
            // Seated at the TV: face it regardless of the last move direction
            // (no bespoke sitting pose — his existing idle reads fine parked).
            const savedFacing = e.facing;
            e.facing = this.deepdiveTV.x >= e.x ? 1 : -1;
            e.draw(ctx, cam);
            e.facing = savedFacing;
          } else {
            e.draw(ctx, cam);
          }
          // Status overlays (scald steam + damage-number tally) OVER every
          // enemy regardless of its custom draw() — bosses/Furnace included.
          if (e.drawStatusFx && !e.dying) e.drawStatusFx(ctx, cam, this.player);
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

        // HUD benediction rail: the canonical at-a-glance icon row. The stat
        // box anchors below it (game panel Y=40) so the two never overlap.
        if (this.state === "play") this.drawSigilStrip(ctx, 10, 16, 99);
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

      // Truck departure: screen dips to black as the truck exits right; the
      // escape scene continues the fade on its side (TruckRun fadeIn).
      if (this.truckBoard && this.truckBoard.fade > 0) {
        ctx.save(); ctx.globalAlpha = Math.min(1, this.truckBoard.fade); ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H); ctx.restore();
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
        // Live sigils also read through the veil (same reason as crosses above).
        for (const s of this.sigils) if (!s.dead) s.draw(ctx, cam);
        ctx.restore();
      }

      // Deepdive time-distortion: vignette + jittering speed-lines that scale
      // with how fast the world is currently running (Balance.deepdiveRamp's
      // timeScale, 1..maxScale). Same draw budget as essenceDim above — one
      // full-screen fill plus a handful of rects, no per-pixel work.
      const ddk = (this.timeScale - 1) / (JH.DEEPDIVE.maxScale - 1);
      if (ddk > 0.01 && this.state === "play") {
        ctx.save();
        const vg = ctx.createRadialGradient(
          JH.VIEW_W / 2, JH.VIEW_H / 2, JH.VIEW_H * 0.2,
          JH.VIEW_W / 2, JH.VIEW_H / 2, JH.VIEW_H * 0.7);
        vg.addColorStop(0, "rgba(4,6,16,0)");
        vg.addColorStop(1, "rgba(4,6,16," + (0.25 * ddk).toFixed(3) + ")");
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H);
        ctx.fillStyle = "rgba(220,240,255," + (0.15 * ddk).toFixed(3) + ")";
        for (let i = 0; i < 4; i++) {
          const ly = (i + 0.5) * (JH.VIEW_H / 4) + (Math.random() - 0.5) * 8;
          ctx.fillRect(0, ly, JH.VIEW_W, 1.5);
        }
        ctx.restore();
      }

      // World floating text (essence/level-up/shop-buy feedback): drawn after
      // the essence-dim overlay so it always reads at full brightness.
      if (this.floaters && this.floaters.length && this.state === "play") {
        const cam = JH.Camera.x;
        ctx.save();
        ctx.translate(so.x, so.y);
        ctx.font = "bold 6px monospace"; ctx.textAlign = "center";
        for (const f of this.floaters) {
          const k = f.t / (f.life || 0.9);
          ctx.globalAlpha = Math.max(0, 1 - k);
          const px = f.size || (f.big ? 8 : 6);   // custom size wins, else big/normal
          ctx.font = "bold " + px + "px monospace";
          const fx = f.x - cam;
          const fy = JH.Geo.feetScreenY(f.y, 0) - (f.h || 0) - (f.rise || 22) * k;
          // Punch: scale overshoot early in life, settling to 1 (WoW pop).
          let scale = 1;
          if (f.punch) { const pk = Math.max(0, 1 - f.t / f.punchDur); scale = 1 + f.punch * pk * pk; }
          // Emphasized floaters (big / sized / punched) get a dark outline.
          const outlined = f.big || f.size || f.punch;
          ctx.save();
          ctx.translate(fx, fy);
          if (scale !== 1) ctx.scale(scale, scale);
          if (outlined) {
            ctx.fillStyle = "#0a0e18";
            ctx.fillText(f.text, 1, 1); ctx.fillText(f.text, -1, 1);
            ctx.fillText(f.text, 1, -1); ctx.fillText(f.text, -1, -1);
          }
          ctx.fillStyle = f.color;
          ctx.fillText(f.text, 0, 0);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        ctx.textAlign = "left";
        ctx.restore();
      }
      // Stat panel: always on in play (collapsed), named near the vendor,
      // full character sheet when Tab-toggled.
      if (this.state === "play" && !this.rangeCatalogOpen)
        this.drawStatPanel(this.ctx);
      // Hover shop panel — drawn outside shake transform so it stays stable.
      // Walk-up prompt over the vendor while the shop is closed.
      if (this.state === "play" && this.shopNpc && this.nearVendor && !this.shopOpen) {
        const psx = Math.round(this.shopNpc.x - JH.Camera.x);
        const psy = Math.round(JH.Geo.feetScreenY(this.shopNpc.y, 0)) - 42;
        this.ctx.font = "bold 6px monospace"; this.ctx.textAlign = "center";
        this.ctx.fillStyle = "#0a0e18"; this.ctx.fillText("E  SHOP", psx + 1, psy + 1);
        this.ctx.fillStyle = "#ffd23f"; this.ctx.fillText("E  SHOP", psx, psy);
        this.ctx.textAlign = "left";
      }
      // Walk-up prompt over the Deepdive TV while it's parked (not sat down).
      if (this.state === "play" && this.deepdiveTV && this.deepdiveTV.near && !this.deepdiving) {
        const tsx = Math.round(this.deepdiveTV.x - JH.Camera.x);
        const tsy = Math.round(JH.Geo.feetScreenY(this.deepdiveTV.y, 0)) - 64;   // clears the 58px cabinet top
        const armed = this.player.kibbleTimer > JH.DEEPDIVE.threshold;
        const label = armed ? "E: DEEPDIVE" : "[REQUIRES KIBBLE]";
        this.ctx.font = "bold 6px monospace"; this.ctx.textAlign = "center";
        this.ctx.fillStyle = "#0a0e18"; this.ctx.fillText(label, tsx + 1, tsy + 1);
        this.ctx.fillStyle = armed ? "#ffd23f" : "#ff5a5a";
        this.ctx.fillText(label, tsx, tsy);
        this.ctx.textAlign = "left";
      }
      if (this.nearShop && this.state === "play") {
        this.drawHoverShop(this.ctx);
        // Sigils must never hide behind the shop panel — redraw them above it.
        for (const s of this.sigils) if (!s.dead) s.draw(this.ctx, JH.Camera.x);
      }
      if (this.state === "play") this.drawSigilCard(this.ctx);
      if (this.rangeMode) this.drawRelicRackCard(this.ctx);
      if (this.rangeCatalogOpen) this.drawRangeCatalog(this.ctx);
      // Cutscene overlay (drawn after everything else).
      if (this.state === "cutscene" && this.cutscene) this.drawCutscene(this.ctx);
      // Dev menu drawn last so it's always on top.
      if (this.devMenu) this.drawDevMenu(this.ctx);
    },

    drawDevMenu(ctx) {
      const waves = JH.LEVEL1.waves;
      const count = waves.length + 4;          // +cutscene +range +firewall +post-firewall
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
      // Toggle states (P sim-power, N damage numbers) under the title.
      ctx.font = "5px monospace";
      ctx.fillStyle = this.devPowerSim ? "#7dff5a" : "#556";
      ctx.textAlign = "right";
      ctx.fillText("P: SIM POWER " + (this.devPowerSim ? "ON" : "OFF"), MID - 4, PY + 16);
      ctx.fillStyle = this.showDmgNumbers ? "#7dff5a" : "#556";
      ctx.textAlign = "left";
      ctx.fillText("N: DMG " + (this.showDmgNumbers ? "ON" : "OFF"), MID + 4, PY + 16);
      ctx.textAlign = "center";

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

      // Post-Firewall entry (Gate Crash finale — split-through + Air World tableau)
      const pfRy = rowY(waves.length + 3);
      if (pfRy !== null) {
        const pfSel = this.devCursor === waves.length + 3;
        if (pfSel) { ctx.fillStyle = "rgba(120,200,255,0.18)"; ctx.fillRect(PX + 3, pfRy, W - 6, ROW - 1); }
        ctx.fillStyle = pfSel ? "#8ac8ff" : "#667788";
        ctx.font = (pfSel ? "bold " : "") + "6px monospace"; ctx.textAlign = "left";
        ctx.fillText("☁  POST-FIREWALL", PX + 8, pfRy + ROW - 3);
        ctx.fillStyle = pfSel ? "#8ac8ff" : "#445566"; ctx.textAlign = "right";
        ctx.fillText("DEV", PX + W - 6, pfRy + ROW - 3);
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

    // Post-Slayer escape truck driving in to the old exit point. Empty-cab
    // sprite ("truckBoard", board.png); wheel frame tracks tb.x so the wheels
    // spin while it rolls in (leftward → frame decreases) and stop when it does.
    drawTruckBoard(ctx, cam) {
      const tb = this.truckBoard;
      const sx = tb.x - cam, sy = JH.Geo.feetScreenY(tb.y, 0);
      if (sx < -80 || sx > JH.VIEW_W + 80) return;
      JH.Assets.shadow(ctx, sx, sy, 26);
      // Empty cab while waiting; Jon-in-cab sprite once the departure starts.
      JH.Assets.draw(ctx, tb.departing ? "truck" : "truckBoard", sx, sy, 1, { frame: Math.floor(tb.x / 12) });
      if (tb.departing) {
        // Peel-out dust behind the rear wheels.
        for (let i = 0; i < 3; i++) {
          const k = ((tb.t * 2.2 + i * 0.33) % 1);
          ctx.save();
          ctx.globalAlpha = 0.35 * (1 - k);
          ctx.fillStyle = "#8a8378";
          ctx.beginPath();
          ctx.ellipse(sx - 48 - k * 26, sy - 3 - k * 8, 5 + k * 8, 3 + k * 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      if (tb.near) {
        ctx.save();
        ctx.font = "bold 7px monospace"; ctx.textAlign = "center";
        const bob = Math.sin(tb.t * 3) * 2;
        ctx.fillStyle = "#0a2a08"; ctx.fillText("BOARD  (E)", sx + 1, sy - 88 + bob + 1);
        ctx.fillStyle = "#7dff5a"; ctx.fillText("BOARD  (E)", sx, sy - 88 + bob);
        ctx.restore();
      }
    },

    // Collapsing Fire World: embery haze + falling debris (procedural).
    drawCrumble(ctx) {
      const t = this.worldCrumble.t;
      ctx.save();
      ctx.fillStyle = "rgba(140,28,0,0.10)";
      ctx.fillRect(0, 0, JH.VIEW_W, JH.VIEW_H);
      ctx.fillStyle = "#4a3a34";
      for (let i = 0; i < 16; i++) {
        const seed = i * 97.13;
        const x = (seed * 7.7) % JH.VIEW_W;
        const speed = 40 + (i % 5) * 22;
        const y = ((t * speed + seed * 13) % (JH.VIEW_H + 20)) - 10;
        const s = 2 + (i % 3);
        ctx.fillRect(x, y, s, s);
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
      // OVERCHARGE only unlocks from Act 2 on (after the first boss).
      if (U.overchargeUnlocked()) U.repeatables.forEach((n) => out.push({ kind: "rep", id: n.id }));
      out.push({ kind: "wheelRow" });
      return out;
    },
    // Buy a Kibble Pack (fixed slot-wheel card, repeatable); returns true on success.
    buyKibble() {
      const K = JH.KIBBLE_PACK, price = this.priceOf(K.cost);
      if (this.player.suds < price) return false;
      this.player.suds -= price;
      JH.Balance.kibbleGrant(this.player, K);
      return true;
    },

    // Greedy word-wrap into up to `maxLines` lines of ~maxChars each. Breaks
    // only on spaces; if words remain past the line cap the last kept line
    // gets an ellipsis. Shared by the shop + stat-panel benediction tips.
    wrapText(str, maxChars, maxLines) {
      const words = String(str || "").split(" ");
      const lines = [];
      let line = "";
      // Wrap on VISIBLE length: {g:}/{i:} markup doesn't count against width.
      const vis = (s) => (JH.Assets.stripMarkup ? JH.Assets.stripMarkup(s) : s).length;
      for (const w of words) {
        const trial = line ? line + " " + w : w;
        if (vis(trial) > maxChars && line) {
          lines.push(line); line = w;
          if (lines.length >= maxLines) {
            // Out of lines with words left: mark the cut.
            let last = lines[maxLines - 1];
            while (last.length + 1 > maxChars && last.includes(" "))
              last = last.slice(0, last.lastIndexOf(" "));
            lines[maxLines - 1] = last + "…";
            return lines;
          }
        } else line = trial;
      }
      if (line && lines.length < maxLines) lines.push(line);
      return lines;
    },

    // Slim stat readout beside the hover shop: the numbers the scaling pass
    // moves, flashing green for 2s after any purchase changes them. Sits at
    // the top-left — the shop panel occupies PX=280..474, and no other HUD
    // element claims this corner while the shop is open.
    // Three-mode character block: COLLAPSED (always on in play — icons +
    // numbers, no labels), NAMED (near the vendor — adds stat labels),
    // EXPANDED (Tab — adds benediction rows + owned-relic grid). Every
    // section drawn below must be counted into H before the backdrop
    // fillRect, or it clips at the panel edge.
    drawStatPanel(ctx) {
      const S = this.player.stats, F = this.player.statFlash || {};
      const expanded = this.showStats;                // Tab / gamepad Back
      const inlineDesc = expanded && !this.nearShop;   // descriptions unless the shop needs the space
      const named = expanded || this.nearShop;         // stat labels
      // 4th column = baked icon key (drawn at half size before/instead of the label).
      const rows = [
        ["DMG",    Math.round(S.sprayDamage), "sprayDamage", "dmg"],
        ["RANGE",  Math.round(S.sprayRange),  "sprayRange",  "range"],
        ["WATER",  Math.round(S.maxWater),    "maxWater",    "water"],
        // REGEN displays the sum of two stats, so it flashes on either key.
        ["REGEN",  Math.round(S.waterRegen + (S.moveRegen || 0)), ["waterRegen", "moveRegen"], "regen"],
        ["HP",     Math.round(S.maxHp),       "maxHp",       "hp"],
        ["SPEED",  Math.round(S.moveSpeed),   "moveSpeed",   "speed"],
        ["KNOCKBACK", Math.round(S.knockback), "knockback",  "knockback"],
      ];
      // Percent stats hide until they exist — a wall of 0% rows is noise.
      // (Kept visible mid-flash so a fresh gain doesn't pop in unexplained.)
      if (S.dodgeChance > 0 || F.dodgeChance > 0)
        rows.push(["DODGE", Math.round(S.dodgeChance * 100) + "%", "dodgeChance", "dodge"]);
      if (S.vampiricRate > 0 || F.vampiricRate > 0)
        rows.push(["VAMP", Math.round(S.vampiricRate * 100) + "%", "vampiricRate", "vamp"]);
      // Level + XP live in the expanded sheet only — the top-left HUD bar is
      // gone (the overhead XP bar over Jon fades in on gain instead).
      if (expanded) {
        rows.unshift(["XP", Math.floor(this.playerXp) + "/" + JH.Balance.xpForLevel(this.playerLevel + 1), null, null]);
        rows.unshift(["LV", this.playerLevel, null, null]);
      }

      // Active benedictions (expanded only): baked 12px icon + tier frame,
      // name in element color, rank-appropriate effect text wrapped below
      // when Tab-toggled away from the shop (the shop needs the width for
      // its own cursor inspection instead).
      const beneRows = [];
      if (expanded && JH.Benedictions) {
        for (const id of Object.keys(JH.Benedictions.active)) {
          const d = JH.Benedictions.byId(id);
          if (!d) continue;
          const rank = JH.Benedictions.active[id] | 0;
          const el = d.element || (d.needs && d.needs[0]) || "water";
          const tag = d.kind === "boon" ? (rank >= 2 ? " II" : "")
            : d.kind === "legendary" ? " ·LEG" : " ·DUO";
          beneRows.push({
            id, d, rank,
            name: d.name + tag,
            color: JH.SIGIL_COLORS[el] || "#ffd23f",
            text: JH.Benedictions.effectText(id, rank),
            lines: [],
          });
        }
      }
      // Relic grid (expanded only): owned relic icons, RELIC_COLS per row.
      const RELIC_COLS = 9;
      const relicIds = expanded ? Object.keys(this.relics || {}) : [];
      const relicRows = relicIds.length ? Math.ceil(relicIds.length / RELIC_COLS) : 0;

      // Y anchors the box top (Y-10) below the HUD benediction rail: rail
      // pips sit at y 13.5..26.5 (drawSigilStrip at Y=16, rank ring ±2.5),
      // so the box top at 30 clears them — the two must never overlap.
      const X = 10, Y = 40, ROW = 9;
      // Width follows expansion: benediction names + the relic grid need the
      // full 152 even when the shop suppresses desc text. The shop overlay
      // starts at PX=280, so the wide panel (x 6..158) never reaches it.
      const W = expanded ? 152 : named ? 74 : 46;
      // Relic block: RELICS label (12) + icon rows at 16 pitch + 4 so the
      // last row's gear frame (icon center ±9) clears the panel border.
      const relicH = relicRows ? 12 + relicRows * 16 + 4 : 0;
      const statH = rows.length * ROW + 16;
      const maxBottom = JH.VIEW_H - 4;
      const budget = maxBottom - (Y - 10);      // total box height allowed

      // Collapsed/named summary: ONE compact line — an element-colored pip
      // per owned benediction plus the total count. Details live in the
      // expanded sheet; the HUD rail above the box carries the icons.
      const sumIds = (!expanded && JH.Benedictions) ? Object.keys(JH.Benedictions.active) : [];
      const summaryH = sumIds.length ? 11 : 0;

      // Rewraps every benediction desc at maxLines and returns the bene
      // block height. A name-only row (0 lines) still costs the 24px icon
      // floor, same as a 1-line row — so degrading below 1 line saves no
      // space while silently dropping every desc. Never called with 0.
      const measureBeneH = (maxLines) => {
        if (!beneRows.length) return 18;   // "no benedictions yet" hint + slack
        let h = 0;
        for (const b of beneRows) {
          b.lines = (inlineDesc && maxLines) ? this.wrapText(b.text, 34, maxLines) : [];
          // Row height clears the framed icon (±9 with seat rim) or the
          // text column, whichever is taller.
          h += Math.max(24, 16 + b.lines.length * 6);
        }
        return h;
      };

      // Expanded content starts 6px below the stat block (`by` below), so H
      // must carry statH + 6 + content — dropping the 6 was the clipped-grid
      // bug. Ladder: 3 desc lines -> 2 -> 1 (never fewer). If 1-line descs +
      // the full relic grid still overflow, the content block scrolls
      // instead of dropping info.
      const contentBudget = budget - statH - 6;
      let contentH = 0, scroll = false;
      if (expanded) {
        contentH = measureBeneH(3) + relicH;
        if (contentH > contentBudget) contentH = measureBeneH(2) + relicH;
        if (contentH > contentBudget) contentH = measureBeneH(1) + relicH;
        if (contentH > contentBudget) scroll = true;
      }
      const H = expanded ? (scroll ? budget : statH + 6 + contentH)
                         : statH + summaryH;
      this.statPanelBottom = Y - 10 + H;   // screen-fit probe for tests

      ctx.save();
      ctx.fillStyle = "rgba(10,14,24,0.85)";
      ctx.fillRect(X - 4, Y - 10, W, H);
      ctx.strokeStyle = "#2a3550"; ctx.strokeRect(X - 4, Y - 10, W, H);
      ctx.font = "bold 6px monospace"; ctx.textAlign = "left";
      ctx.fillStyle = "#8fa8c8";
      ctx.fillText("JON", X, Y - 3);
      ctx.font = "6px monospace";
      rows.forEach(([label, val, key, ik], i) => {
        const y = Y + 6 + i * ROW;
        // A row may aggregate several stat keys — flash if any of them changed.
        const live = [].concat(key).some((k) => F[k] > 0);
        const hot = live && (Math.floor(this.elapsed * 6) & 1) === 0;
        if (named) {
          // Named row: icon at half size (6px) before the label; label alone until loaded.
          const hasIcon = ik && JH.Assets.icon(ctx, ik, X + 3, y - 2, 0.5);
          ctx.fillStyle = "#667788";
          ctx.fillText(label, hasIcon ? X + 8 : X, y);
          ctx.textAlign = "right";
          ctx.fillStyle = hot ? "#80ff80" : "#dfe8f5";
          ctx.fillText(String(val) + (live ? " ▲" : ""), X + W - 10, y);
          ctx.textAlign = "left";
        } else {
          // Collapsed row: icon + value only, no label.
          if (ik) JH.Assets.icon(ctx, ik, X + 3, y - 2, 0.5);
          ctx.textAlign = "right";
          ctx.fillStyle = hot ? "#80ff80" : "#dfe8f5";
          ctx.fillText(String(val) + (live ? " ▲" : ""), X + W - 6, y);
          ctx.textAlign = "left";
        }
      });

      // Collapsed/named benediction summary line: 4px pips grouped by
      // element (SIGIL_COLORS) + total count, right-aligned. Overflow past
      // the pip budget is carried by the count alone.
      if (!expanded && sumIds.length) {
        const order = { water: 0, fire: 1, earth: 2, air: 3 };
        const els = sumIds.map((id) => {
          const d = JH.Benedictions.byId(id);
          return (d && (d.element || (d.needs && d.needs[0]))) || "water";
        }).sort((a, b) => (order[a] | 0) - (order[b] | 0));
        const py = Y - 10 + statH + 2;
        const maxPips = Math.max(1, Math.floor((W - 26) / 5));
        els.slice(0, maxPips).forEach((el, i) => {
          ctx.fillStyle = JH.SIGIL_COLORS[el] || "#ffd23f";
          ctx.fillRect(X + i * 5, py, 4, 4);
        });
        ctx.font = "5px monospace"; ctx.textAlign = "right";
        ctx.fillStyle = "#8fa8c8";
        ctx.fillText("×" + sumIds.length, X + W - (named ? 10 : 6), py + 4);
        ctx.textAlign = "left";
      }

      let by = Y + 6 + rows.length * ROW + 6;
      if (expanded) {
        const contentTop = by, contentBottom = Y - 10 + H;
        // Ping-pong auto-scroll the bene+relic block when it's taller than
        // the box (clip is the hard screen-fit guarantee; the scroll just
        // brings the rest into view over time instead of cutting it off).
        const overflow = Math.max(0, contentH - (contentBottom - contentTop));
        let scrollY = 0;
        if (scroll && overflow > 0) {
          const period = 3.5;   // seconds one-way, ~7s full up-down cycle
          const t = (this.elapsed % (period * 2)) / period;
          scrollY = -overflow * (t < 1 ? t : 2 - t);
        }
        ctx.save();
        ctx.beginPath();
        // Clip top sits 6 above the first row: tier frames extend 5 above
        // rowStart (icon center rowStart+4, frame ±9). Bottom stays inside
        // the border.
        ctx.rect(X - 4, contentTop - 6, W, Math.max(0, (contentBottom - 1) - (contentTop - 6)));
        ctx.clip();
        ctx.translate(0, scrollY);

        for (const b of beneRows) {
          const rowStart = by;
          // Icon rail on the left; name + desc share the right column so the
          // frame never strikes through text.
          JH.Assets.icon(ctx, "bene_" + b.id, X + 10, rowStart + 4, 1);
          JH.Assets.tierFrame(ctx, X + 10, rowStart + 4, b.d, b.rank, 1, this.elapsed);
          ctx.font = "6px monospace"; ctx.textAlign = "left";
          ctx.fillStyle = b.color;
          ctx.fillText(b.name, X + 24, rowStart + 4);
          if (b.lines.length) {
            ctx.font = "5px monospace"; ctx.fillStyle = "#8090a4";
            let ly = rowStart + 12;
            for (const ln of b.lines) { JH.Assets.styledText(ctx, ln, X + 24, ly); ly += 6; }
          }
          by = rowStart + Math.max(24, 16 + b.lines.length * 6);
        }
        if (beneRows.length === 0) {
          ctx.font = "5px monospace"; ctx.fillStyle = "#556070"; ctx.textAlign = "left";
          ctx.fillText("no benedictions yet", X, by + 6);
          by += 12;
        }
        // Mouse hover-tests the relic grid while the panel is open (read-only:
        // gates a tooltip, never a click). Position compared post-scroll so
        // the hit box tracks the icon actually on screen.
        const mouse = JH.Input && JH.Input.mouse && JH.Input.mouse.inside ? JH.Input.mouse : null;
        let hoverRelic = null, hoverX = 0, hoverY = 0;
        if (relicIds.length) {
          ctx.font = "5px monospace"; ctx.fillStyle = "#667788"; ctx.textAlign = "left";
          ctx.fillText("RELICS", X, by + 6);
          const gridTop = by + 12;
          relicIds.forEach((id, i) => {
            const gx = X + 10 + (i % RELIC_COLS) * 16, gy = gridTop + 8 + Math.floor(i / RELIC_COLS) * 16;
            const rd = JH.RELICS.find((x) => x.id === id);
            JH.Assets.icon(ctx, id, gx, gy, 1);
            JH.Assets.gearFrame(ctx, gx, gy, 1, rd && rd.tier, this.elapsed);
            if (mouse && rd) {
              const visY = gy + scrollY;
              if (Math.abs(mouse.x - gx) <= 8 && Math.abs(mouse.y - visY) <= 8) {
                hoverRelic = rd; hoverX = gx; hoverY = visY;
              }
            }
          });
          by += relicH;
        }
        ctx.restore();   // drop the clip before the tooltip so it can spill past the panel box

        if (hoverRelic) this.drawRelicTooltip(ctx, hoverRelic, hoverX, hoverY);
      }
      ctx.restore();
    },

    // Relic-grid mouseover: name + desc, clamped fully on-screen near the
    // hovered cell. Tier-colored border matches drawRelicRackCard's style.
    drawRelicTooltip(ctx, rd, x, y) {
      const lines = this.wrapText(rd.desc || "", 40, 3);
      const W = 130, lineH = 7, H = 13 + lines.length * lineH + 3;
      let tx = x + 10, ty = y - H - 4;
      if (tx + W > JH.VIEW_W - 2) tx = JH.VIEW_W - 2 - W;
      if (tx < 2) tx = 2;
      if (ty < 2) ty = y + 12;
      if (ty + H > JH.VIEW_H - 2) ty = JH.VIEW_H - 2 - H;
      ctx.save();
      ctx.fillStyle = "rgba(10,14,24,0.95)";
      ctx.fillRect(tx, ty, W, H);
      const tierColors = { common: "#8fa8c8", rare: "#c9924a", relic: "#ffd23f" };
      ctx.strokeStyle = tierColors[rd.tier] || "#8fa8c8";
      ctx.strokeRect(tx, ty, W, H);
      ctx.font = "bold 6px monospace"; ctx.textAlign = "left";
      ctx.fillStyle = "#dfe8f5";
      ctx.fillText(rd.name, tx + 5, ty + 9);
      ctx.font = "5px monospace"; ctx.fillStyle = "#aebdd4";
      let ly = ty + 17;
      for (const ln of lines) { ctx.fillText(ln, tx + 5, ly); ly += lineH; }
      ctx.restore();
    },

    // Bottom info card for the sigil the player is standing at: name, kind,
    // rank-appropriate effect text, and the take prompt — so a pick is never
    // blind. Nearest live sigil within reach wins.
    drawSigilCard(ctx) {
      const pl = this.player;
      let near = null, best = 30;
      for (const s of this.sigils) {
        if (s.dead) continue;
        const d = Math.hypot(pl.x - s.x, pl.y - s.y);
        if (d < best) { best = d; near = s; }
      }
      if (!near) return;
      const def = JH.Benedictions.byId(near.offer.id);
      if (!def) return;
      const el = def.element || (def.needs && def.needs.join("+")) || "";
      const kind = def.kind === "duo" ? "DUO" : def.kind === "legendary" ? "LEGENDARY" : el.toUpperCase();
      const deep = near.offer.deepen;
      // Rank II keeps the base effect text so the upgrade is never a blind
      // pick — "base effect  II: what changes".
      const desc = ((def.desc || "") +
        (deep && def.descII ? "  II: " + def.descII : "")) || "";
      const W = 300, H = 34, X = Math.round((JH.VIEW_W - W) / 2), Y = JH.VIEW_H - H - 8;
      ctx.save();
      ctx.fillStyle = "rgba(10,14,24,0.92)";
      ctx.fillRect(X, Y, W, H);
      ctx.strokeStyle = JH.SIGIL_COLORS[def.element || (def.needs && def.needs[0])] || "#ffd23f";
      ctx.strokeRect(X, Y, W, H);
      ctx.font = "bold 7px monospace"; ctx.textAlign = "left";
      ctx.fillStyle = "#dfe8f5";
      ctx.fillText(def.name + (deep ? " II" : ""), X + 6, Y + 10);
      ctx.textAlign = "right";
      ctx.fillStyle = def.kind === "legendary" ? "#ffd23f" : "#8fa8c8";
      ctx.fillText(kind, X + W - 6, Y + 10);
      ctx.textAlign = "left";
      ctx.font = "6px monospace";
      ctx.fillStyle = "#aebdd4";
      // Markup-aware two-line wrap ({g:}/{i:} tokens render styled).
      const dlines = this.wrapText(desc, 52, 2);
      if (dlines.length > 1) {
        JH.Assets.styledText(ctx, dlines[0], X + 6, Y + 20);
        JH.Assets.styledText(ctx, dlines[1], X + 6, Y + 28);
      } else {
        JH.Assets.styledText(ctx, desc, X + 6, Y + 22);
      }
      ctx.fillStyle = "#80ff80"; ctx.textAlign = "right";
      ctx.fillText("E: CHOOSE BENEDICTION", X + W - 6, Y + H - 6);
      ctx.restore();
    },

    drawRelicRackCard(ctx) {
      const RANGE_GAP = { alarm_bell: 1, sunday_suit: 1, censer: 1 };
      const pl = this.player;
      let near = null, best = 30;
      for (const st of this.rangeStations) {
        if (st.kind !== "relic") continue;
        const d = Math.hypot(pl.x - st.x, pl.y - st.y);
        if (d < best) { best = d; near = st; }
      }
      if (!near) return;
      // Sigil wins ties (compare sigil to rack station distance)
      if (this.sigils && this.sigils.length > 0) {
        let sigilBest = 30;
        for (const s of this.sigils) {
          if (s.dead) continue;
          const d = Math.hypot(pl.x - s.x, pl.y - s.y);
          if (d < sigilBest) sigilBest = d;
        }
        if (sigilBest <= best) return;
      }
      const rd = JH.RELICS.find((r) => r.id === near.relic);
      if (!rd) return;
      const owned = !!this.relics[near.relic];
      const tierColors = { common: "#8fa8c8", rare: "#c9924a", relic: "#ffd23f" };
      const tierColor = tierColors[rd.tier] || "#8fa8c8";
      const desc = rd.desc + (RANGE_GAP[rd.id] ? "  (needs real run)" : "");
      const W = 300, H = 34, X = Math.round((JH.VIEW_W - W) / 2), Y = JH.VIEW_H - H - 8;
      ctx.save();
      ctx.fillStyle = "rgba(10,14,24,0.92)";
      ctx.fillRect(X, Y, W, H);
      ctx.strokeStyle = tierColor;
      ctx.strokeRect(X, Y, W, H);
      ctx.font = "bold 7px monospace"; ctx.textAlign = "left";
      ctx.fillStyle = "#dfe8f5";
      ctx.fillText(rd.name + (owned ? "  [ON]" : ""), X + 6, Y + 10);
      ctx.textAlign = "right";
      ctx.fillStyle = tierColor;
      ctx.fillText(rd.tier.toUpperCase(), X + W - 6, Y + 10);
      ctx.textAlign = "left";
      ctx.font = "6px monospace";
      ctx.fillStyle = "#aebdd4";
      // Markup-aware two-line wrap ({g:}/{i:} tokens render styled).
      const dlines = this.wrapText(desc, 52, 2);
      if (dlines.length > 1) {
        JH.Assets.styledText(ctx, dlines[0], X + 6, Y + 20);
        JH.Assets.styledText(ctx, dlines[1], X + 6, Y + 28);
      } else {
        JH.Assets.styledText(ctx, desc, X + 6, Y + 22);
      }
      ctx.fillStyle = "#80ff80"; ctx.textAlign = "right";
      ctx.fillText("E: TOGGLE RELIC", X + W - 6, Y + H - 6);
      ctx.restore();
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
      // Father Jon's voucher: prices below already show the 50% cut.
      if (this.voucher50) {
        ctx.textAlign = "right";
        ctx.fillStyle = "#6cd3ff";
        ctx.fillText("✂ 50% VOUCHER", PX + PW - 6, PY + 19);
      }
      ctx.textAlign = "left";
      // Separator
      ctx.fillStyle = "#334455";
      ctx.fillRect(PX + 4, PY + 22, PW - 8, 1);

      // ---- Build the flat row list (headers + buyable items), then scroll it
      // so the cursor row stays visible (the list now overflows the panel). ----
      const HROW = 7, IROW = 14;
      const rows = [];
      U.branches.forEach((branch) => {
        rows.push({ t: "head", label: "── " + branch + " ──" });
        U.nodesByBranch(branch).forEach((n) => rows.push({ t: "node", n }));
      });
      // Overcharge section is fully hidden until its first-boss unlock —
      // no header, no locked teaser row.
      if (U.overchargeUnlocked()) {
        rows.push({ t: "head", label: "── OVERCHARGE ──" });
        U.repeatables.forEach((n) => rows.push({ t: "rep", n }));
      }
      rows.push({ t: "head", label: "── RELICS ──" });
      rows.push({ t: "wheel" });

      const isCurRow = (r) => cur && (
        (r.t === "node" && cur.kind === "node" && cur.id === r.n.id) ||
        (r.t === "rep" && cur.kind === "rep" && cur.id === r.n.id) ||
        (r.t === "wheel" && cur.kind === "wheelRow"));

      let cy = 0, cursorCY = 0;
      rows.forEach((r) => { r.cy = cy; r.h = r.t === "head" ? HROW : r.t === "wheel" ? 58 : IROW; if (isCurRow(r)) cursorCY = cy; cy += r.h; });
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
        if (r.t === "wheel") {
          // RELIC-O-MAT: the wheel drawn as a slot machine — gold-trim
          // housing, chasing marquee lights, three recessed reel windows
          // with rolling icons while the reels spin, and a payout strip
          // (name + price) under each window so text never strikes the rim.
          // Tier reads as the settled window's rim color. Entries render
          // from the spawn-time snapshot: a bought slot shows SOLD, id null
          // (thin pool at spawn) shows SOLD OUT.
          const entries = JH.Balance.shopWheelEntries(this.wheelStock, this.relics);
          const hx = PX + 4, hw = PW - 8, hy = ry + 1, hh = 54;
          this._wheelRects = [];   // click hitboxes, refreshed each draw
          ctx.fillStyle = "#141b28"; ctx.fillRect(hx, hy, hw, hh);
          ctx.strokeStyle = "#c8963c"; ctx.lineWidth = 1;
          ctx.strokeRect(hx + 0.5, hy + 0.5, hw - 1, hh - 1);
          const lstep = Math.floor((hw - 16) / 12);
          for (let li = 0; li < 12; li++) {
            const on = ((li + Math.floor(this.elapsed * 6)) % 3) === 0;
            ctx.fillStyle = on ? "#ffd23f" : "#54431a";
            ctx.fillRect(hx + 8 + li * lstep, hy + 3, 2, 2);
          }
          entries.forEach((en, i) => {
            const wx = hx + 4 + i * 44, wy = hy + 8, ww = 40, wh = 28;
            const wcx = wx + ww / 2, wcy = wy + wh / 2;
            const focused = isCurRow(r) && this.shopWheelSlot === i;
            const settle = 0.6 + i * 0.3;
            const spinning = i < 3 && this.wheelSpinT < settle && en.id && !en.sold;
            ctx.fillStyle = "#080c14"; ctx.fillRect(wx, wy, ww, wh);
            let iconKey = en.id === "kibble" ? "kibble" : en.id;
            let label, price, rd = null;
            if (en.id === "kibble") { label = "KIBBLE"; price = this.priceOf(JH.KIBBLE_PACK.cost); }
            else if (en.sold) { label = "SOLD"; price = null; }
            else if (en.id) { rd = JH.RELICS.find((x) => x.id === en.id); label = rd.name.toUpperCase(); price = this.priceOf(rd.cost); }
            else { label = "SOLD OUT"; price = null; iconKey = "sold_out"; }
            ctx.save();
            ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip();
            if (spinning) {
              // Rolling reel: pool icons scroll vertically through the window.
              const pool = JH.RELICS;
              const roll = (this.wheelSpinT * 90 + i * 17) % wh;
              const idx = Math.floor(this.wheelSpinT * 14 + i * 3);
              JH.Assets.icon(ctx, pool[idx % pool.length].id, wcx, wcy + roll - wh / 2, 1.5);
              JH.Assets.icon(ctx, pool[(idx + 1) % pool.length].id, wcx, wcy + roll - wh / 2 - wh, 1.5);
            } else if (iconKey) {
              ctx.globalAlpha = en.sold ? 0.3 : iconKey === "sold_out" ? 0.6 : 1;
              JH.Assets.icon(ctx, iconKey, wcx, wcy, 1.5);
              ctx.globalAlpha = 1;
              if (en.sold) {
                ctx.fillStyle = "rgba(200,60,50,0.9)"; ctx.font = "bold 6px monospace"; ctx.textAlign = "center";
                ctx.fillText("SOLD", wcx, wcy + 2);
              }
            }
            ctx.restore();
            this._wheelRects.push({ x: wx, y: wy, w: ww, h: wh, i });
            const tierEdge = rd && rd.tier === "relic" ? "#d4af37" : rd && rd.tier === "rare" ? "#c9924a" : "#3a4a66";
            ctx.strokeStyle = focused ? "#ffd23f" : (spinning ? "#3a4a66" : tierEdge);
            ctx.lineWidth = focused ? 2 : 1;
            ctx.strokeRect(wx + 0.5, wy + 0.5, ww - 1, wh - 1);
            ctx.lineWidth = 1;
            if (focused) {
              // Selection can't hide on gold-tier rims: pointer above + glow.
              ctx.globalAlpha = 0.35;
              ctx.strokeStyle = "#ffd23f";
              ctx.strokeRect(wx - 1.5, wy - 1.5, ww + 3, wh + 3);
              ctx.globalAlpha = 1;
              ctx.fillStyle = "#ffd23f";
              ctx.beginPath();
              ctx.moveTo(wcx - 3, wy - 4); ctx.lineTo(wcx + 3, wy - 4); ctx.lineTo(wcx, wy - 1);
              ctx.closePath(); ctx.fill();
            }
            ctx.font = "5px monospace"; ctx.textAlign = "center";
            ctx.fillStyle = spinning ? "#556070" : en.id && !en.sold ? "#dfe8f5" : "#556070";
            // maxWidth condenses long names ("ASBESTOS SOCKS") instead of chopping.
            ctx.fillText(spinning ? "· · ·" : label, wcx, hy + 44, 42);
            if (!spinning && price != null) {
              // Tier hues (relic gold / rare bronze) stay hued even when
              // unaffordable — dim via alpha, don't swap to grey-brown.
              const tierColor = rd && rd.tier === "relic" ? "#ffd23f" : rd && rd.tier === "rare" ? "#c9924a" : null;
              const afford = pl.suds >= price;
              ctx.fillStyle = tierColor || (afford ? "#ffd23f" : "#775533");
              ctx.globalAlpha = tierColor && !afford ? 0.45 : 1;
              ctx.fillText(price + "", wcx, hy + 51);
              ctx.globalAlpha = 1;
            }
          });
          // Side lever: knob up when the reels are settled, pulled during the spin.
          const lvx = hx + hw - 8, lever = this.wheelSpinT < 1.2;
          ctx.strokeStyle = "#98a4b0"; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(lvx, hy + 26);
          ctx.lineTo(lvx, lever ? hy + 38 : hy + 12);
          ctx.stroke();
          ctx.lineWidth = 1;
          ctx.fillStyle = "#ff5a4a";
          ctx.beginPath(); ctx.arc(lvx, lever ? hy + 40 : hy + 10, 3, 0, Math.PI * 2); ctx.fill();
          ctx.textAlign = "left";
          return;
        }
        let name, cost, owned = false, locked = false, afford = false, suffix = "";
        if (r.t === "node") {
          const n = r.n;
          owned = U.isOwned(n.id); locked = U.isLocked(n.id);
          cost = this.priceOf(n.cost);
          afford = U.isAvailable(n.id) && pl.suds >= cost;
          name = n.name;
        } else if (r.t === "rep") {
          cost = this.priceOf(U.repCost(r.n.id)); afford = pl.suds >= cost; name = r.n.name;
          if (U.repCount[r.n.id]) suffix = " x" + U.repCount[r.n.id];
        }
        if (isCurRow(r)) {
          ctx.fillStyle = afford ? "rgba(255,210,63,0.18)" : "rgba(220,80,60,0.14)";
          ctx.fillRect(PX + 2, ry, PW - 4, IROW);
        }
        ctx.font = "bold 6px monospace";
        ctx.fillStyle = owned ? "#55bb55" : locked ? "#3a4a5a" : afford ? "#ffffff" : "#aa6655";
        // Baked icon replaces the •/▸/✓ mark: Overcharge by the stat it
        // pushes. Text mark remains the fallback.
        const ik = r.t === "rep" ? "dmg" : null;
        ctx.globalAlpha = locked ? 0.45 : 1;
        const hasIcon = ik && JH.Assets.icon(ctx, ik, PX + 10, ry + 5, 1);
        ctx.globalAlpha = 1;
        const mark = owned ? "✓" : locked ? "▸" : "•";
        ctx.fillText(hasIcon ? name + suffix : mark + " " + name + suffix, hasIcon ? PX + 19 : PX + 5, ry + 8);
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
        else if (cur.kind === "wheelRow") {
          const en = JH.Balance.shopWheelEntries(this.wheelStock, this.relics)[this.shopWheelSlot];
          if (en.id === "kibble") desc = "Heal " + JH.KIBBLE_PACK.heal + " HP over " + JH.KIBBLE_PACK.dur + "s. Stacks.";
          else if (en.id && !en.sold) { const rd = JH.RELICS.find((x) => x.id === en.id); desc = rd ? rd.desc : ""; }
          else if (!en.id) desc = "No more relics in the vendor's stock.";
          else desc = "";
        }
      }
      if (desc) {
        ctx.fillStyle = "#778899";
        ctx.font = "5px monospace";
        // 3 lines is the vertical budget between separator and footer; 48
        // chars/line greedy-wraps every rank-II benediction text untruncated.
        this.wrapText(desc, 48, 3).forEach((ln, i) => ctx.fillText(ln, PX + 5, dy + 6 + i * 6));
      }

      // Footer hint
      ctx.fillStyle = "#445566";
      ctx.font = "5px monospace";
      ctx.textAlign = "center";
      ctx.fillText("▲▼ SELECT   [E] BUY   [ESC] CLOSE", MID, PY + PH - 5);
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

      // Rosary Chain: banked flat-dmg readout, one row under the GUSH label.
      if (this.rosaryBonus > 0) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#ffd23f";
        ctx.font = "5px monospace";
        ctx.textAlign = "right";
        ctx.fillText("+" + this.rosaryBonus + " DMG", JH.VIEW_W - 8, 66);
        ctx.restore();
        ctx.textAlign = "left";
      }
    },

    // HUD benediction rail: one icon pip per owned boon at the top-left —
    // the canonical at-a-glance display (the stat box sits below it; the
    // expanded sheet carries the details). Dim at rank 1, bright (full
    // alpha) at rank 2. Wraps every `perRow` pips; pitch 13 x 16.
    drawSigilStrip(ctx, x0, y0, perRow) {
      if (!JH.Benedictions) return;
      const active = JH.Benedictions.active;
      const ids = Object.keys(active);
      if (ids.length === 0) return;
      ctx.save();
      ids.forEach((id, i) => {
        const d = JH.Benedictions.byId(id);
        if (!d) return;
        const rank = active[id] | 0;
        const el = d.element || (d.needs && d.needs[0]) || "water";
        const col = JH.SIGIL_COLORS[el] || "#ffd23f";
        const x = x0 + (i % perRow) * 13;
        const y = y0 + Math.floor(i / perRow) * 16;
        ctx.globalAlpha = rank >= 2 ? 1 : 0.55;
        // Each benediction's own baked icon (element icon, then procedural
        // pip, while art streams in). Distinct icons replaced the old verb
        // corner marks entirely.
        if (!JH.Assets.icon(ctx, "bene_" + id, x + 4, y + 4, 1) &&
            !JH.Assets.icon(ctx, "el_" + el, x + 4, y + 4, 1)) {
          ctx.fillStyle = col;
          ctx.fillRect(x, y, 8, 8);
          ctx.strokeStyle = "#0a0e18";
          ctx.strokeRect(x, y, 8, 8);
        }
        // Rank-2 boons keep the bright ring.
        if (rank >= 2) {
          ctx.strokeStyle = col;
          ctx.strokeRect(x - 2.5, y - 2.5, 13, 13);
        }
        // Eye of the Storm: cooldown pip right of the icon — grey while the
        // emergency bubble is on cooldown, cyan once it can trigger again.
        if (id === "eye_of_storm") {
          ctx.globalAlpha = 1;
          ctx.fillStyle = this.player.eyeCdT > 0 ? "#555a66" : "#9be8ff";
          ctx.fillRect(x + 9, y + 2.5, 3, 3);
        }
      });
      ctx.globalAlpha = 1;
      ctx.restore();
    },
  };

  JH.Game = Game;
})();
