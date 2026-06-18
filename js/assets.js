/* =====================================================================
   assets.js — Asset layer.

   Two responsibilities:
     1. Assets — a sprite registry. Right now every entity is drawn by a
        *procedural* painter (axis-aligned pixel rects on the low-res
        canvas, so it reads as pixel-art). This is the SWAP POINT for real
        sprite sheets: replace a painter with an image-blit painter and no
        entity code changes.
     2. AudioFX — tiny WebAudio sound effects (no asset files needed).

   Painter contract:
     painter(ctx, x, y, facing, opt)
       (x, y)  = feet anchor in canvas/logical px (y is the baseline)
       facing  = +1 (right) or -1 (left); flipping is handled for you
       opt     = { state, frame, t, hurt, ... } gameplay hints
   Inside a painter, use the local-space helper `p(lx, ly, w, h, color)`:
       lx = px right of the entity's center
       ly = px UP from the feet (0 = ground)
   ===================================================================== */
(function () {
  "use strict";
  const JH = (window.JH = window.JH || {});
  const PAL = JH.PAL;

  // ---------------------------------------------------------------- Audio
  const AudioFX = {
    ctx: null,
    enabled: true,
    init() {
      if (this.ctx) return;
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { this.enabled = false; }
    },
    resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    play(name) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      const def = JH.SFX[name];
      if (!def) return;
      // Respect the global mute + master volume (shared with music).
      const M = JH.Music;
      if (M && M.muted) return;
      const vol = M ? M.volume : 1;
      const t = this.ctx.currentTime;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(def.gain * vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + def.dur);
      g.connect(this.ctx.destination);

      if (def.type === "noise") {
        const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * def.dur, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const bp = this.ctx.createBiquadFilter();
        bp.type = "bandpass"; bp.frequency.value = 1800;
        src.connect(bp); bp.connect(g);
        src.start(t); src.stop(t + def.dur);
      } else {
        const osc = this.ctx.createOscillator();
        osc.type = def.type === "saw" ? "sawtooth" : def.type;
        osc.frequency.setValueAtTime(def.freq, t);
        if (name === "coin" || name === "win" || name === "buy")
          osc.frequency.exponentialRampToValueAtTime(def.freq * 1.6, t + def.dur);
        if (name === "hurt" || name === "die")
          osc.frequency.exponentialRampToValueAtTime(def.freq * 0.5, t + def.dur);
        osc.connect(g);
        osc.start(t); osc.stop(t + def.dur);
      }
    },
  };
  JH.AudioFX = AudioFX;

  // ---------------------------------------------------- Background music
  // Looping track. `volume` is the MASTER volume (also scales SFX above);
  // `muted` silences everything. Both persist in localStorage. Playback can
  // only begin after a user gesture (browser autoplay policy) — call start()
  // from a click/keypress.
  const Music = {
    el: null, volume: 0.5, muted: false, started: false,
    src: "audio/jon-hose-rush.mp3",
    init() {
      this.load();
      try {
        this.el = new Audio(this.src);
        this.el.loop = true;
        this.el.preload = "auto";
      } catch (e) { this.el = null; }
      this.apply();
    },
    apply() { if (this.el) this.el.volume = this.muted ? 0 : this.volume; },
    start() {
      if (!this.el) return;
      this.started = true;
      if (!this.muted && this.el.paused) {
        const p = this.el.play();
        if (p && p.catch) p.catch(() => {});   // ignore autoplay rejections
      }
    },
    setVolume(v) {
      this.volume = Math.max(0, Math.min(1, v));
      if (this.volume > 0) this.muted = false;
      this.apply();
      if (this.started) this.start();
      this.save();
    },
    toggleMute() {
      this.muted = !this.muted;
      this.apply();
      if (!this.muted && this.started) this.start();
      this.save();
    },
    save() { try { localStorage.setItem("jh_audio", JSON.stringify({ v: this.volume, m: this.muted })); } catch (e) {} },
    load() { try { const s = JSON.parse(localStorage.getItem("jh_audio")); if (s) { if (typeof s.v === "number") this.volume = s.v; this.muted = !!s.m; } } catch (e) {} },
  };
  JH.Music = Music;

  // -------------------------------------------------------------- Sprites
  const painters = {};
  const Assets = {
    register(key, fn) { painters[key] = fn; },
    has(key) { return !!painters[key]; },
    draw(ctx, key, x, y, facing, opt) {
      const fn = painters[key];
      if (!fn) return;
      facing = facing < 0 ? -1 : 1;
      x = Math.round(x); y = Math.round(y);
      ctx.save();
      // Local-space pixel helper. Floors to integers for crisp pixels and
      // mirrors horizontally when facing left.
      const p = (lx, ly, w, h, color) => {
        w = Math.round(w); h = Math.round(h);
        let sx = facing === 1 ? x + Math.round(lx) : x - Math.round(lx) - w;
        const sy = y - Math.round(ly) - h;
        ctx.fillStyle = color;
        ctx.fillRect(sx, sy, w, h);
      };
      fn(p, opt || {}, ctx, x, y, facing);
      ctx.restore();
    },
  };
  JH.Assets = Assets;

  // ---- shared bits ----------------------------------------------------
  function shadow(ctx, x, y, w) {
    ctx.save();
    ctx.fillStyle = PAL.shadow;
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y), w, w * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  Assets.shadow = shadow;

  // Walk-cycle leg offset from a frame counter (0..3).
  const legStep = (frame) => [0, 2, 0, -2][frame & 3];

  // ============================ JON ===================================
  Assets.register("jon", (p, opt) => {
    const f = opt.frame | 0;
    const state = opt.state || "idle";
    const spraying = state === "spray";
    const moving = state === "walk";
    const bob = moving ? Math.abs(legStep(f)) * 0.4 : 0;
    const ls = moving ? legStep(f) : 0;
    if (opt.hurt && (f & 1)) return; // flash on hurt

    // Legs
    p(-6 + ls, 0, 5, 8, PAL.pants);
    p(1 - ls, 0, 5, 8, PAL.pantsDk);
    p(-6 + ls, 0, 5, 2, PAL.pantsDk);  // shoes
    p(1 - ls, 0, 5, 2, PAL.pantsDk);

    // Backpack tank (on the back = behind, drawn first-ish on left side)
    p(-9, 9 + bob, 6, 13, PAL.tankDk);
    p(-8, 10 + bob, 4, 11, PAL.tank);
    p(-8, 18 + bob, 4, 2, PAL.tankHi);   // highlight band
    p(-9, 22 + bob, 6, 2, PAL.tankDk);   // cap

    // Torso (shirt)
    p(-6, 8 + bob, 12, 11, PAL.jonShirt);
    p(-6, 8 + bob, 12, 2, PAL.jonShirtDk);
    p(-6, 16 + bob, 12, 2, PAL.jonShirtDk);

    // Head
    p(-4, 19 + bob, 9, 8, PAL.skin);
    p(-4, 25 + bob, 9, 3, "#3a2a1c");    // hair
    p(-4, 19 + bob, 2, 6, PAL.skinDk);   // jaw shade
    p(3, 22 + bob, 2, 2, "#1a1a1a");     // eye (faces right)

    // Arm + hose nozzle
    if (spraying) {
      p(5, 13 + bob, 7, 4, PAL.skin);        // arm forward
      p(11, 13 + bob, 4, 5, PAL.hose);       // nozzle body
      p(15, 14 + bob, 3, 3, PAL.hoseDk);     // nozzle tip
    } else {
      p(4, 10 + bob, 4, 4, PAL.skin);        // arm at side
    }
    // Hose line curving from tank to hand
    p(-3, 12 + bob, 3, 2, PAL.hose);
    p(0, 11 + bob, 4, 2, PAL.hoseDk);
  });

  // ============================ MOOK ==================================
  Assets.register("mook", (p, opt) => {
    const f = opt.frame | 0;
    const ls = (opt.state === "walk") ? legStep(f) : 0;
    if (opt.hurt && (f & 1)) return;
    p(-5 + ls, 0, 4, 7, PAL.mookDk);
    p(1 - ls, 0, 4, 7, PAL.mookDk);
    p(-6, 7, 12, 10, PAL.mook);            // torso
    p(-6, 7, 12, 2, PAL.mookDk);
    p(-3, 17, 8, 7, PAL.skin);             // head
    p(-3, 21, 8, 3, "#222");               // beanie
    p(2, 19, 2, 2, "#111");                // eye
    p(opt.wind ? 6 : 4, 9, opt.wind ? 6 : 4, 4, PAL.mookDk); // arm/wind-up
  });

  // ========================== CHARGER ================================
  Assets.register("charger", (p, opt) => {
    const f = opt.frame | 0;
    const charging = opt.state === "charge";
    const ls = (opt.state === "walk") ? legStep(f) : 0;
    if (opt.hurt && (f & 1)) return;
    p(-5 + ls, 0, 4, 7, PAL.chargerDk);
    p(1 - ls, 0, 4, 7, PAL.chargerDk);
    p(-7, 7, 14, 11, PAL.charger);
    p(-7, 7, 14, 2, PAL.chargerDk);
    p(-3, 18, 8, 7, PAL.skin);
    p(-3, 22, 8, 3, "#3a1f5a");
    p(2, 20, 2, 2, "#fff");                // angry eye
    // Shoulders forward when charging
    p(charging ? 7 : 5, 10, charging ? 7 : 4, 6, PAL.chargerDk);
    if (opt.wind) p(-7, 24, 14, 2, "#fff"); // tell flash
  });

  // ============================ PYRO ==================================
  Assets.register("pyro", (p, opt, ctx, x, y, facing) => {
    const f = opt.frame | 0;
    const ls = (opt.state === "walk") ? legStep(f) : 0;
    if (opt.hurt && (f & 1)) return;
    p(-5 + ls, 0, 4, 7, PAL.pyroDk);
    p(1 - ls, 0, 4, 7, PAL.pyroDk);
    p(-6, 7, 12, 10, PAL.pyro);
    p(-6, 7, 12, 2, PAL.pyroDk);
    p(-3, 17, 8, 7, PAL.skin);
    p(2, 19, 2, 2, "#111");
    // Flickering flame crown (procedural).
    const flick = (Math.sin((opt.t || 0) * 18) + 1) * 0.5;
    p(-3, 24, 3, 3 + flick * 3, PAL.flame);
    p(1, 24, 3, 4 + (1 - flick) * 3, PAL.pyro);
    p(-1, 24, 2, 2 + flick * 2, "#fff");
    p(opt.wind ? 6 : 4, 9, 5, 4, PAL.pyroDk);  // throwing arm
  });

  // ============================ BOSS ==================================
  Assets.register("boss", (p, opt) => {
    const f = opt.frame | 0;
    const ls = (opt.state === "walk") ? legStep(f) * 1.5 : 0;
    const slam = opt.state === "tele" || opt.state === "strike";  // raised arms = winding up
    if (opt.hurt && (f & 1)) return;
    // Legs
    p(-13 + ls, 0, 10, 14, PAL.bossDk);
    p(3 - ls, 0, 10, 14, PAL.bossDk);
    // Big tank-belly body
    p(-17, 14, 34, 26, PAL.boss);
    p(-17, 14, 34, 4, PAL.bossDk);
    p(-17, 34, 34, 4, PAL.bossDk);
    p(-10, 20, 20, 12, "#6f8a55");     // belly plate
    // Head
    p(-9, 40, 18, 12, PAL.boss);
    p(-9, 40, 18, 3, PAL.bossDk);
    p(2, 46, 4, 3, "#ff5a5a");         // eye
    p(-6, 46, 4, 3, "#ff5a5a");
    // Arms (raise on slam)
    const ay = slam ? 40 : 26;
    p(15, ay, 8, 12, PAL.bossDk);
    p(-23, ay, 8, 12, PAL.bossDk);
    // Hose-pack parody on its back
    p(-21, 18, 6, 18, PAL.tankDk);
  });

  // ===================== THE SWITCH OF DOOM (boss 2) ==================
  // An 8-port rack switch chassis. The Doc-Ock cable tentacles are drawn by
  // SwitchBoss itself (curved); this is the body + blinking ports.
  Assets.register("switch", (p, opt) => {
    const t = opt.t || 0;
    // Chassis
    p(-24, 2, 48, 20, PAL.switchDk);
    p(-23, 16, 46, 6, PAL.switchBody);     // front face
    p(-23, 6, 46, 4, "#39455c");           // top bevel
    p(-24, 0, 48, 2, "#0a0d14");           // base shadow
    // 8 blinking RJ45 ports along the front
    for (let i = 0; i < 8; i++) {
      const x = -21 + i * 5.4;
      const on = (Math.floor(t * 5) + i * 3) % 4 !== 0;
      p(x, 16, 4, 4, on ? PAL.switchLed : "#0e2a1a");
    }
    // status LEDs
    p(-22, 10, 2, 2, PAL.suds);
    p(20, 10, 2, 2, "#ff5a5a");
    // mounting ears
    p(-26, 8, 2, 12, "#0a0d14");
    p(24, 8, 2, 12, "#0a0d14");
  });

  // ===================== WATER DROPLET (projectile) ===================
  Assets.register("water", (p, opt) => {
    const s = opt.size || 3;
    p(-s / 2, 0, s, s, PAL.water);
    p(-s / 2, s * 0.4, s, 1, PAL.waterHi);
  });

  // =========================== EMBER (pyro shot) ======================
  Assets.register("ember", (p, opt) => {
    const s = opt.size || 3;
    p(-s / 2, 0, s, s, PAL.flame);
    p(-s / 2 + 1, s * 0.3, s - 1, 1, "#fff");
  });

  // ============================= PICKUPS ==============================
  Assets.register("suds", (p, opt) => {
    const bob = Math.sin((opt.t || 0) * 6) * 1.5;
    p(-3, 4 + bob, 6, 6, PAL.suds);     // coin
    p(-3, 7 + bob, 6, 1, "#caa015");
    p(-1, 6 + bob, 2, 2, "#fff7c2");
  });
  Assets.register("water_can", (p, opt) => {
    const bob = Math.sin((opt.t || 0) * 6) * 1.5;
    p(-4, 2 + bob, 8, 9, PAL.waterDk);
    p(-3, 3 + bob, 6, 7, PAL.water);
    p(-2, 8 + bob, 4, 1, PAL.waterHi);
  });
  Assets.register("health", (p, opt) => {
    const bob = Math.sin((opt.t || 0) * 6) * 1.5;
    p(-4, 2 + bob, 8, 8, "#fff");
    p(-1, 3 + bob, 2, 6, PAL.hpPk);    // red cross
    p(-3, 5 + bob, 6, 2, PAL.hpPk);
  });

  // Shop vendor — "Old Spigot", a soggy merchant with a parts cart.
  Assets.register("shopkeeper", (p, opt) => {
    const bob = Math.sin((opt.t || 0) * 3) * 0.6;
    // Cart / stall behind him
    p(6, 0, 16, 14, "#5a3b22");
    p(6, 12, 16, 3, "#7a5230");
    p(7, 1, 2, 2, "#2a1c10"); p(19, 1, 2, 2, "#2a1c10"); // wheels
    p(9, 15, 10, 6, PAL.tank);       // water-jug wares on the cart
    p(10, 16, 3, 4, PAL.waterHi);
    p(14, 16, 3, 4, PAL.suds);
    // Striped awning
    p(4, 22, 22, 3, "#c83030");
    p(4, 22, 22, 1, "#fff");
    // Vendor body
    p(-9, 0 + bob, 5, 8, PAL.pantsDk);
    p(-3 - 1, 0 + bob, 5, 8, PAL.pantsDk);
    p(-10, 8 + bob, 12, 11, "#3f7a4f");   // green apron
    p(-10, 8 + bob, 12, 2, "#2c5a39");
    p(-7, 12 + bob, 6, 4, "#caa015");     // coin pouch
    p(-8, 19 + bob, 9, 8, PAL.skin);      // head
    p(-8, 25 + bob, 9, 4, "#7a5230");     // wide hat brim
    p(-6, 28 + bob, 6, 3, "#5a3b22");     // hat top
    p(-3, 21 + bob, 2, 2, "#111");        // eye (faces right toward player)
    p(-9, 22 + bob, 2, 3, "#dddddd");     // bushy beard
  });

  // Hydrant prop (level decoration / water source marker)
  Assets.register("hydrant", (p) => {
    p(-4, 0, 8, 3, "#7a1010");
    p(-3, 3, 6, 9, "#c81f1f");
    p(-3, 12, 6, 3, "#7a1010");
    p(-1, 15, 2, 2, "#c81f1f");
    p(-5, 7, 2, 2, "#7a1010");
    p(3, 7, 2, 2, "#7a1010");
  });
})();
