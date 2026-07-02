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
    volume: 1,    // SFX channel level — independent of the music slider
    _files: {},   // cached <audio> elements, keyed by src, for playFile()
    _lastAt: {},  // per-sound last-trigger time, for the anti-stack throttle
    setVolume(v) {
      this.volume = Math.max(0, Math.min(1, v));
      if (JH.Music) JH.Music.save();   // persists alongside the music settings
    },
    init() {
      if (this.ctx) return;
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { this.enabled = false; }
    },
    resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    play(name, opt) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      const def = JH.SFX[name];
      if (!def) return;
      // SFX are fully independent of the music channel: the mute button and
      // music slider never silence effects — only the FX slider (0%) does.
      const vol = this.volume;
      if (vol <= 0) return;
      // Anti-stack throttle: many identical triggers in one burst (a coin
      // shower) collapse to one sound instead of a grating chord.
      const now = performance.now();
      if (this._lastAt[name] != null && now - this._lastAt[name] < 45) return;
      this._lastAt[name] = now;
      const t = this.ctx.currentTime;
      const g = this.ctx.createGain();
      // Optional soft attack (def.attack sec) smooths whoosh-type sounds;
      // default is the classic instant-on blip.
      if (def.attack) {
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(def.gain * vol, t + def.attack);
      } else {
        g.gain.setValueAtTime(def.gain * vol, t);
      }
      g.gain.exponentialRampToValueAtTime(0.0001, t + def.dur);
      g.connect(this.ctx.destination);

      if (def.type === "noise") {
        const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * def.dur, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const bp = this.ctx.createBiquadFilter();
        bp.type = "bandpass";
        // Optional filter sweep (bpFrom → bpTo over the duration) turns the
        // flat hiss into a whoosh; fixed 1800Hz stays the default.
        bp.frequency.setValueAtTime(def.bpFrom || 1800, t);
        if (def.bpTo) bp.frequency.exponentialRampToValueAtTime(def.bpTo, t + def.dur);
        bp.Q.value = def.q || 1;
        src.connect(bp); bp.connect(g);
        src.start(t); src.stop(t + def.dur);
      } else {
        const osc = this.ctx.createOscillator();
        osc.type = def.type === "saw" ? "sawtooth" : def.type;
        const freq = def.freq * ((opt && opt.pitch) || 1);
        osc.frequency.setValueAtTime(freq, t);
        if (name === "coin" || name === "win" || name === "buy" || name === "upgrade")
          osc.frequency.exponentialRampToValueAtTime(freq * 1.6, t + def.dur);
        if (name === "hurt" || name === "die")
          osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + def.dur);
        osc.connect(g);
        osc.start(t); osc.stop(t + def.dur);
      }
    },
    // One-shot playback of a recorded sound file (as opposed to the synth
    // blips above). Respects the shared mute/volume controls from Music.
    playFile(src, gain) {
      const vol = this.volume;
      if (vol <= 0) return;
      let el = this._files[src];
      if (!el) {
        try { el = new Audio(src); el.preload = "auto"; } catch (e) { return; }
        this._files[src] = el;
      }
      const node = el.cloneNode();
      node.volume = Math.max(0, Math.min(1, (gain == null ? 1 : gain) * vol));
      const p = node.play();
      if (p && p.catch) p.catch(() => {});
    },
  };
  JH.AudioFX = AudioFX;

  // ---------------------------------------------------- Background music
  // Two-track player: `level` theme plays during exploration/waves; `boss`
  // theme during boss fights. Quick fade (~0.3s) cross-switches on demand.
  // `volume` and `muted` are MASTER controls shared with SFX above.
  const Music = {
    volume: 0.5, muted: false, started: false,
    current: "level",
    fadeDur: 0.3,                 // seconds — quick "cut-ish" fade
    _timer: null,                 // active fade interval handle
    tracks: {
      level:  { src: "audio/jon-hose-main.mp3", el: null, gain: 1 },
      boss:   { src: "audio/jon-hose-rush.mp3", el: null, gain: 0 },
      church: { src: "audio/church-of-the-holy-hose.mp3", el: null, gain: 0 },
    },

    init() {
      this.load();
      for (const name in this.tracks) {
        const t = this.tracks[name];
        try {
          t.el = new Audio(t.src);
          t.el.loop = true;
          t.el.preload = "auto";
        } catch (e) { t.el = null; }
      }
      this.current = "level";
      this.tracks.level.gain = 1;
      this.tracks.boss.gain = 0;
      this.apply();
    },

    // Effective element volume = master * per-track fade gain (0 when muted).
    apply() {
      for (const name in this.tracks) {
        const t = this.tracks[name];
        if (t.el) t.el.volume = this.muted ? 0 : this.volume * t.gain;
      }
    },

    _play(t) {
      if (!t || !t.el || !t.el.paused) return;
      const p = t.el.play();
      if (p && p.catch) p.catch(() => {});   // ignore autoplay rejections
    },

    start() {
      this.started = true;
      if (this.muted) return;
      this._play(this.tracks[this.current]);
    },

    // Quick fade (~0.3s): fade the current track out, start the target.
    // No-op if already on `name`.
    setTrack(name) {
      if (!this.tracks[name] || name === this.current) return;
      const from = this.tracks[this.current];
      const to = this.tracks[name];
      this.current = name;
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      const t0 = performance.now();
      this._timer = setInterval(() => {
        const k = Math.min(1, (performance.now() - t0) / (this.fadeDur * 1000));
        if (from) from.gain = 1 - k;
        this.apply();
        if (k >= 1) {
          clearInterval(this._timer); this._timer = null;
          if (from && from.el && from !== to && !from.el.paused) from.el.pause();
          if (from) from.gain = 0;
          if (to) {
            to.gain = 1;
            if (to.el) { try { to.el.currentTime = 0; } catch (e) {} }
            if (this.started && !this.muted) this._play(to);
          }
          this.apply();
        }
      }, 16);
    },

    // Back to the level theme at full gain; stop/rewind every other track; cancel fades.
    reset() {
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      this.current = "level";
      for (const name in this.tracks) {
        const t = this.tracks[name];
        t.gain = name === "level" ? 1 : 0;
        if (name !== "level" && t.el && !t.el.paused) { try { t.el.currentTime = 0; } catch (e) {} t.el.pause(); }
      }
      this.apply();
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
    save() { try { localStorage.setItem("jh_audio", JSON.stringify({ v: this.volume, m: this.muted, s: JH.AudioFX.volume })); } catch (e) {} },
    load() { try { const s = JSON.parse(localStorage.getItem("jh_audio")); if (s) { if (typeof s.v === "number") this.volume = s.v; this.muted = !!s.m; if (typeof s.s === "number") JH.AudioFX.volume = s.s; } } catch (e) {} },
  };
  JH.Music = Music;

  // -------------------------------------------------------------- Sprites
  const painters = {};

  // Reusable offscreen canvas for the hit-flash white-silhouette effect.
  // Sized to fit the largest entity (WallBoss: ~142 × 178 px). The anchor
  // point (ox, oy) matches the feet-baseline convention used by every painter.
  // Peak flash brightness. The flash is a discrete pulse (hurt() re-arms only
  // after the previous pulse finishes), so it can run brighter than the old
  // steady-tint cap without whiting out enemies under continuous spray.
  const HURT_FLASH_MAX_ALPHA = 0.6;
  const _hurtOC = document.createElement("canvas");
  _hurtOC.width = 220; _hurtOC.height = 300;
  const _hurtOC2d = _hurtOC.getContext("2d");

  const Assets = {
    register(key, fn) { painters[key] = fn; },
    has(key) { return !!painters[key]; },
    draw(ctx, key, x, y, facing, opt) {
      const fn = painters[key];
      if (!fn) return;
      opt = opt || {};
      facing = facing < 0 ? -1 : 1;
      x = Math.round(x); y = Math.round(y);
      ctx.save();
      // Squash-stretch anchored at the feet baseline: full deform the frame
      // the pulse arms (opt.squash 1 → 0), easing back out — wider + shorter.
      // Applies to the silhouette stamp too since it shares this transform.
      const squash = Math.min(1, opt.squash || 0);
      if (squash > 0) {
        const s = Math.sin(squash * Math.PI * 0.5) * JH.JUICE.squashAmp;
        ctx.translate(x, y);
        ctx.scale(1 + s, 1 - s);
        ctx.translate(-x, -y);
      }
      // Local-space pixel helper. Floors to integers for crisp pixels and
      // mirrors horizontally when facing left.
      const scale = opt.scale || 1;
      const p = (lx, ly, w, h, color) => {
        w = Math.round(w * scale); h = Math.round(h * scale);
        let sx = facing === 1 ? x + Math.round(lx * scale) : x - Math.round(lx * scale) - w;
        const sy = y - Math.round(ly * scale) - h;
        ctx.fillStyle = color;
        ctx.fillRect(sx, sy, w, h);
      };
      // Silhouette renderer: draws the entity shape onto the offscreen
      // canvas flood-filled with `color`. stamp() composites it over the
      // sprite; outline rings blit it at pixel offsets.
      const OX = 110, OY = 280;
      const renderSil = (color) => {
        _hurtOC2d.globalAlpha = 1;
        _hurtOC2d.globalCompositeOperation = "source-over";
        _hurtOC2d.clearRect(0, 0, 220, 300);
        const hp = (lx, ly, w, h, c) => {
          w = Math.round(w * scale); h = Math.round(h * scale);
          const osx = facing === 1 ? OX + Math.round(lx * scale) : OX - Math.round(lx * scale) - w;
          const osy = OY - Math.round(ly * scale) - h;
          _hurtOC2d.fillStyle = c;
          _hurtOC2d.fillRect(osx, osy, w, h);
        };
        _hurtOC2d.save();
        fn(hp, Object.assign({}, opt, { hurt: false }), _hurtOC2d, OX, OY, facing);
        _hurtOC2d.restore();
        _hurtOC2d.globalCompositeOperation = "source-in";
        _hurtOC2d.fillStyle = color;
        _hurtOC2d.fillRect(0, 0, 220, 300);
        _hurtOC2d.globalCompositeOperation = "source-over";
      };
      const stamp = (color, alpha) => {
        renderSil(color);
        ctx.globalAlpha = alpha;
        ctx.drawImage(_hurtOC, x - OX, y - OY);
      };

      // Buff auras: opt.outlines = [[color, alpha], ...] ordered inner →
      // outer; ring i sits ~0.6px per layer outside the silhouette (a full
      // logical px is ~4 screen px — too chunky). Sub-pixel offsets with
      // smoothing enabled blend into a thin, round outline; rings render
      // under the sprite so layers ring each other instead of overwriting.
      if (opt.outlines && opt.outlines.length) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        for (let i = opt.outlines.length - 1; i >= 0; i--) {
          const oc = opt.outlines[i][0];
          const oa = Math.max(0, Math.min(1, opt.outlines[i][1]));
          renderSil(oc);
          const r = 0.6 * (i + 1);
          const dg = r * 0.707;                       // circular corners
          ctx.globalAlpha = oa;
          for (const d of [[r, 0], [-r, 0], [0, r], [0, -r], [dg, dg], [dg, -dg], [-dg, dg], [-dg, -dg]])
            ctx.drawImage(_hurtOC, x - OX + d[0], y - OY + d[1]);
        }
        ctx.restore();
      }

      // When hurtAlpha > 0 strip the hurt flag from the main call so painters
      // don't early-return — the silhouette overlay handles the hit visual.
      const usesilhouette = opt.hurt && opt.hurtAlpha > 0;
      fn(p, usesilhouette ? Object.assign({}, opt, { hurt: false }) : opt, ctx, x, y, facing);

      // Wetness: a steady translucent soak tint (the enemy hurt read) — grows
      // with spray hits toward wetTintMax, no pulsing.
      if (opt.wet > 0)
        stamp("#4db8ff", Math.min(1, opt.wet) * JH.JUICE.wetTintMax);

      if (usesilhouette) {
        // Quadratic falloff: bright the instant a pulse arms, gone fast — an
        // impact pop, not a lingering frost. flashCap lets one-shot effects
        // push brighter than the stream cap; flashColor retints them.
        const ha = Math.min(1, opt.hurtAlpha);
        stamp(opt.flashColor || "#ffffff", ha * ha * (opt.flashCap || HURT_FLASH_MAX_ALPHA));
      }
      ctx.restore();
    },

    // ---- FX frame-player: pack animations declared in JH.FX ----
    // Frames load via JH.Loader (gates the title screen like all art).
    fx: {},
    registerFx(key, dir, count, fps) {
      const frames = [];
      for (let i = 1; i <= count; i++) frames.push(JH.Loader.img(dir + "/" + i + ".png"));
      this.fx[key] = { frames, fps };
    },
    // Draws centered-bottom at (x, y): fi = floor(t*fps), looping unless
    // opt.loop === false (then clamps to the last frame). Skips frames that
    // haven't loaded. Inherits the caller's globalAlpha unless opt.alpha set.
    drawFx(ctx, key, x, y, t, opt) {
      const a = this.fx[key];
      if (!a) return;
      opt = opt || {};
      const n = a.frames.length;
      let fi = Math.floor((t || 0) * a.fps);
      fi = (opt.loop === false) ? Math.min(fi, n - 1) : ((fi % n) + n) % n;
      const img = a.frames[fi];
      if (!img || !img._ready) return;
      const scale = opt.scale || 1;
      const dw = Math.round(img.naturalWidth * scale), dh = Math.round(img.naturalHeight * scale);
      ctx.save();
      if (opt.alpha != null) ctx.globalAlpha = opt.alpha;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, Math.round(x - dw / 2), Math.round(y - dh), dw, dh);
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

  // Shared red "reactor core" glyph used by the bosses. Drawn directly in ctx
  // space — call from a boss draw() with the on-screen core centre. opt.flash
  // whitens the centre (e.g. on an attack/hit frame).
  function bossCore(ctx, cx, cy, r, t, opt) {
    opt = opt || {};
    cx = Math.round(cx); cy = Math.round(cy);
    const pulse = 0.7 + 0.3 * Math.abs(Math.sin(t * 6));
    ctx.save();
    // dark socket + metal ring
    ctx.fillStyle = "#0d0f15";
    ctx.beginPath(); ctx.ellipse(cx, cy, r + 2, r + 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = PAL.switchBody; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(cx, cy, r + 2, r + 2, 0, 0, Math.PI * 2); ctx.stroke();
    if (opt.hole) {
      // Core has fled — empty black socket (a hole in the switch), no glow/lens.
      ctx.fillStyle = "#050609";
      ctx.beginPath(); ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    // outer glow
    ctx.globalAlpha = 0.5 * pulse;
    ctx.fillStyle = PAL.wallbossCore;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.5, r * 1.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    // lens
    ctx.fillStyle = PAL.wallbossCore;
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2); ctx.fill();
    // hot slit-pupil centre
    ctx.fillStyle = opt.flash ? "#ffffff" : PAL.wallbossCoreHi;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.42, r * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    // angry brow slit for the "eye" read
    ctx.fillStyle = "#0d0f15";
    ctx.fillRect(cx - r, Math.round(cy - r - 1), r * 2, 1);
    ctx.restore();
  }
  Assets.bossCore = bossCore;

  // Walk-cycle leg offset from a frame counter (0..3).
  const legStep = (frame) => [2, 1, -2, -1][frame & 3];

  // ============================ JON ===================================
  // ---- Jon sprite image cache (preloaded at startup)
  const _jonImgs = {};
  ["idle", "fire", "walk0", "walk1", "walk2", "walk3", "walk4"].forEach(name => {
    _jonImgs[name] = JH.Loader.img(`sprites/jon/${name}.png`);
  });

  // Death animation: a single horizontal sheet, 8 frames of 146x240 each.
  const _jonDeathSheet = JH.Loader.img("sprites/jon/death.png");
  const JON_DEATH_FRAMES = 8, JON_DEATH_FW = 146, JON_DEATH_FH = 240;

  const JON_H = 53;  // target display height in logical pixels

  Assets.register("jon", (p, opt, ctx, x, y, facing) => {
    const state = opt.state || "idle";

    if (state === "death") {
      const img = _jonDeathSheet;
      if (!img || !img.complete || !img.naturalWidth) return;
      const df = Math.max(0, Math.min(JON_DEATH_FRAMES - 1, opt.frame | 0));
      const scale = JON_H / JON_DEATH_FH;
      const dw = Math.round(JON_DEATH_FW * scale);
      ctx.save();
      ctx.translate(x, y);
      if (facing < 0) ctx.scale(-1, 1);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, df * JON_DEATH_FW, 0, JON_DEATH_FW, JON_DEATH_FH,
        -Math.round(dw / 2), -JON_H, dw, JON_H);
      ctx.restore();
      return;
    }

    const f = (opt.frame | 0) % 5;

    const imgName = state === "fire" ? "fire" : state === "walk" ? `walk${f}` : "idle";
    const img = _jonImgs[imgName];
    if (!img || !img.complete || !img.naturalWidth) return;

    const scale = JON_H / img.naturalHeight;
    const dw = Math.round(img.naturalWidth * scale);

    ctx.save();
    ctx.translate(x, y);
    if (facing < 0) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -Math.round(dw / 2), -JON_H, dw, JON_H);
    ctx.restore();
  });

  // ============================ MOOK ==================================
  Assets.register("mook", (p, opt) => {
    const f = opt.frame | 0;
    const ls = (opt.state === "walk") ? legStep(f) : 0;
    const elite = !!opt.elite;
    p(-6 + ls, 0, 5, 8, PAL.mookDk);
    p(1 - ls, 0, 5, 8, PAL.mookDk);
    p(-7, 7, 14, 11, elite ? "#b85a5a" : PAL.mook);       // torso
    p(-7, 7, 14, 2, PAL.mookDk);
    if (elite) {
      p(-9, 10, 4, 7, PAL.mookDk);                         // bulked shoulder
      p(6, 10, 4, 7, PAL.mookDk);
    }
    p(-4, 18, 9, 8, PAL.skin);                              // head
    p(-4, 22, 9, 3, elite ? "#111" : "#222");               // beanie
    p(2, 20, 2, 2, "#111");                                 // eye
    p(opt.wind ? 6 : 4, 9, opt.wind ? 7 : 5, 5, PAL.mookDk); // arm/wind-up
  });

  // ========================== CHARGER ================================
  Assets.register("charger", (p, opt) => {
    const f = opt.frame | 0;
    const charging = opt.state === "charge";
    const ls = (opt.state === "walk") ? legStep(f) : 0;
    const elite = !!opt.elite;
    p(-6 + ls, 0, 5, 8, PAL.chargerDk);
    p(1 - ls, 0, 5, 8, PAL.chargerDk);
    p(-9, 7, 18, 12, elite ? "#8d5bca" : PAL.charger);
    p(-9, 7, 18, 2, PAL.chargerDk);
    p(-9, 17, 18, 2, "#2a1740");
    p(-4, 19, 9, 8, PAL.skin);
    p(-4, 23, 9, 3, "#3a1f5a");
    const eyeHot = opt.wind || charging;    // telegraph: eye glows red when about to charge / charging
    if (eyeHot) p(1, 19, 4, 4, "#7a0000");  // red glow behind the eye
    p(2, 20, 2, 2, eyeHot ? "#ff3030" : "#111");  // eye: black, glows red on the charge tell
    // Shoulders forward when charging
    p(charging ? 7 : 5, 10, charging ? 8 : 5, 7, PAL.chargerDk);
    if (elite) p(-11, 11, 4, 7, PAL.chargerDk);
  });

  // ============================ PYRO ==================================
  Assets.register("pyro", (p, opt, ctx, x, y, facing) => {
    const f = opt.frame | 0;
    const ls = (opt.state === "walk") ? legStep(f) : 0;
    const elite = !!opt.elite;
    p(-6 + ls, 0, 5, 8, PAL.pyroDk);
    p(1 - ls, 0, 5, 8, PAL.pyroDk);
    p(-7, 7, 14, 11, elite ? "#ff9d4a" : PAL.pyro);
    p(-7, 7, 14, 2, PAL.pyroDk);
    if (elite) {
      p(-9, 10, 4, 7, PAL.pyroDk);
      p(6, 10, 4, 7, PAL.pyroDk);
    }
    p(-4, 18, 9, 8, PAL.skin);
    p(2, 19, 2, 2, "#111");
    // Flickering flame crown (procedural).
    const flick = (Math.sin((opt.t || 0) * 18) + 1) * 0.5;
    p(-4, 25, 4, 3 + flick * (elite ? 4 : 3), PAL.flame);
    p(1, 25, 4, 4 + (1 - flick) * (elite ? 4 : 3), PAL.pyro);
    p(-1, 25, 2, 2 + flick * 2, "#fff");
    p(opt.wind ? 6 : 4, 9, 6, 5, PAL.pyroDk);  // throwing arm
  });

  // ========================== BULWARK =================================
  // Procedural placeholder (per CLAUDE.md art pipeline — real sprite later).
  // No body-mounted shield anymore — the Bulwark's own body is never a
  // blocker (see the deployed_shield painter below for the planted prop).
  Assets.register("bulwark", (p, opt) => {
    const f = opt.frame | 0;
    const ls = (opt.state === "walk" || opt.state === "retrieve") ? legStep(f) * 0.6 : 0;
    p(-7 + ls, 0, 6, 10, PAL.bulwarkDk);
    p(1 - ls, 0, 6, 10, PAL.bulwarkDk);
    p(-10, 10, 20, 16, PAL.bulwark);
    p(-10, 10, 20, 3, PAL.bulwarkDk);
    p(-5, 26, 10, 9, PAL.skin);
    p(-5, 30, 10, 3, PAL.bulwarkDk);
    p(1, 28, 2, 2, "#111");
  });

  // ====================== DEPLOYED SHIELD (Bulwark prop) ===============
  // Procedural placeholder — the Bulwark's planted shield. Stationary and
  // indestructible, so no hurt-flash branch is needed.
  Assets.register("deployed_shield", (p) => {
    p(-8, 0, 16, 3, PAL.bulwarkDk);
    p(-7, 3, 14, 22, PAL.bulwarkShield);
    p(-7, 3, 14, 3, "#fff");
    p(-2, 9, 4, 12, PAL.bulwarkDk);
  });

  // ============================ SMELT ==================================
  // Procedural placeholder. Heavy, slow fire-worker. `wind` = smash wind-up.
  Assets.register("smelt", (p, opt) => {
    const f = opt.frame | 0;
    const ls = (opt.state === "walk") ? legStep(f) * 0.4 : 0;
    p(-8 + ls, 0, 7, 12, PAL.smeltDk);
    p(1 - ls, 0, 7, 12, PAL.smeltDk);
    p(-11, 12, 22, 16, PAL.smelt);
    p(-11, 12, 22, 3, PAL.smeltDk);
    p(-5, 28, 10, 9, PAL.skin);
    p(-5, 32, 10, 3, PAL.smeltDk);
    p(1, 30, 2, 2, "#111");
    if (opt.state === "wind") {
      p(-13, 10, 26, 4, PAL.smeltGlow);   // glowing wind-up band
    }
  });

  // ============================ FUSE ===================================
  // Procedural placeholder. Fast, low-HP, dangerous in death.
  Assets.register("fuse", (p, opt) => {
    const f = opt.frame | 0;
    const ls = (opt.state === "walk") ? legStep(f) : 0;
    p(-4 + ls, 0, 4, 8, PAL.fuseDk);
    p(0 - ls, 0, 4, 8, PAL.fuseDk);
    p(-5, 8, 10, 12, PAL.fuse);
    p(-5, 8, 10, 2, PAL.fuseDk);
    p(-3, 18, 6, 7, PAL.skin);
    p(1, 19, 2, 2, "#111");
  });

  // Lerp between two #rrggbb colors → "rgb(r,g,b)". Also exported as
  // Assets.lerpHex for HUD code.
  function lerpHex(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
    const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
    return "rgb(" + Math.round(ar + (br - ar) * t) + "," +
                    Math.round(ag + (bg - ag) * t) + "," +
                    Math.round(ab + (bb - ab) * t) + ")";
  }
  Assets.lerpHex = lerpHex;

  // ============================ FURNACE ================================
  // Procedural placeholder. Bulky golem. `opt.heat` (0..1) = spray build-up so
  // you can gauge the vent; `opt.heated` = the full vent wind-up.
  Assets.register("furnace", (p, opt, ctx) => {
    const f = opt.frame | 0;
    const ls = (opt.state === "walk") ? legStep(f) * 0.5 : 0;
    const heat = Math.max(0, Math.min(1, opt.heat || 0));
    const hot = !!opt.heated;
    const level = hot ? 1 : heat;                 // 0 cold → 1 about to vent
    // Body ramps from cold to hot as it's hosed.
    const body = hot ? PAL.furnaceHot : lerpHex(PAL.furnaceBody, PAL.furnaceHot, heat * 0.85);
    p(-8 + ls, 0, 7, 12, PAL.furnaceDk);
    p(1 - ls, 0, 7, 12, PAL.furnaceDk);
    p(-11, 12, 22, 18, body);
    p(-11, 12, 22, 3, PAL.furnaceDk);
    // Vent slats glow warmer with heat.
    p(-11, 24, 22, 4, hot ? PAL.furnaceHot : lerpHex(PAL.furnaceDk, PAL.smeltGlow, level));
    p(-5, 30, 10, 9, PAL.skin);
    p(-5, 34, 10, 3, PAL.furnaceDk);
    // Eye: dark when cold, glowing hot as it heats.
    if (level > 0.05 && ctx) {
      ctx.save();
      ctx.shadowColor = "#ffb020";
      ctx.shadowBlur = 2 + 6 * level;
      p(1, 32, 2, 2, lerpHex("#5a2a08", "#ffe070", level));
      ctx.restore();
    } else {
      p(1, 32, 2, 2, "#111");
    }
  });

  // ============================ FIREBALL ===============================
  // Slayer's pool ball — the 8-ball sprite rolling in flight; once ignited a
  // flame halo + glow wrap it (the flight trail comes from the Fireball class).
  // Drawn CENTERED on the anchor (the class passes its z-inclusive position).
  const _ballImg = JH.Loader.img("sprites/slayer/8ball.png");
  const BALL_D = 11;   // drawn diameter (logical px)
  Assets.register("fireball", (p, opt, ctx, x, y) => {
    const ignited = !!opt.ignited;
    const t = opt.t || 0;
    const flick = Math.floor(t * 14) & 1;
    if (ignited) {
      // Flame halo behind the ball.
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = flick ? PAL.firePatch : PAL.firePatchHi;
      ctx.beginPath();
      ctx.arc(x, y, BALL_D * 0.78, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (!_ballImg || !_ballImg.complete || !_ballImg.naturalWidth) {
      // Fallback while the sprite loads.
      p(-5, 4, 10, 10, ignited ? (flick ? PAL.firePatch : PAL.firePatchHi) : "#f0eecc");
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((opt.dir || 1) * t * 9);   // rolling spin in the flight direction
    ctx.imageSmoothingEnabled = false;
    if (ignited) { ctx.shadowColor = PAL.firePatchHi; ctx.shadowBlur = 5 + 3 * flick; }
    ctx.drawImage(_ballImg, -BALL_D / 2, -BALL_D / 2, BALL_D, BALL_D);
    ctx.restore();
  });

  // ============================ SLAYER (BOSS) ==========================
  // Real sprite sheets — 4 static PNG states (no walk cycle).
  const SLAYER_H = 58;
  const _slayerImgs = {
    idle:       JH.Loader.img("sprites/slayer/slayer-idle.png"),
    dash:       JH.Loader.img("sprites/slayer/slayer-dash.png"),
    cueWind:    JH.Loader.img("sprites/slayer/slayer-windup.png"),
    cueRelease: JH.Loader.img("sprites/slayer/slayer-shoot.png"),
  };
  Assets.register("slayer", (p, opt, ctx, x, y, facing) => {
    const key = _slayerImgs[opt.state] ? opt.state : "idle";
    const img = _slayerImgs[key];
    if (!img || !img.complete || !img.naturalWidth) {
      // Fallback placeholder while sprites are loading.
      p(-22, 0, 44, SLAYER_H, PAL.slayerBody);
      p(-22, 0, 44, 3, PAL.slayerDk);
      return;
    }
    const scale = SLAYER_H / img.naturalHeight;
    const dw = Math.round(img.naturalWidth * scale);
    ctx.save();
    ctx.translate(x, y);
    if (facing < 0) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -Math.round(dw / 2), -SLAYER_H, dw, SLAYER_H);
    ctx.restore();
  });

  // ========================== STALKER ==================================
  // Procedural placeholder. `wind` = pre-blink telegraph flash; `strike` =
  // post-blink wind-up arm.
  Assets.register("stalker", (p, opt) => {
    const f = opt.frame | 0;
    const ls = (opt.state === "walk") ? legStep(f) : 0;
    p(-4 + ls, 0, 4, 9, PAL.stalkerDk);
    p(0 - ls, 0, 4, 9, PAL.stalkerDk);
    p(-6, 9, 12, 12, PAL.stalker);
    p(-6, 9, 12, 2, PAL.stalkerDk);
    p(-3, 19, 7, 7, PAL.skin);
    p(1, 20, 2, 2, "#fff");
    if (opt.state === "wind") p(-8, 22, 16, 2, "#fff");
    if (opt.state === "strike") p(5, 12, 8, 5, PAL.stalkerDk);
  });

  // ============================ BOSS ==================================
  Assets.register("boss", (p, opt) => {
    const f = opt.frame | 0;
    const ls = (opt.state === "walk") ? legStep(f) * 1.5 : 0;
    const slam = opt.state === "tele" || opt.state === "strike";  // raised arms = winding up
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

  // ========================= QUAKE WALKER (boss 3) ====================
  // Uses the real sprite-sheet frames (sprites/quake_walker/quake-frames.png) when loaded;
  // falls back to a procedural steel-bruiser drawing otherwise.
  function proceduralQuake(p, opt) {
    const f = opt.frame | 0;
    const walking = opt.state === "walk";
    const stomp = opt.state === "tele" || opt.state === "strike"
              || opt.state === "leapWind" || opt.state === "leaping" || opt.state === "leapLand";
    const ls = walking ? legStep(f) * 1.6 : 0;
    const C = PAL.quakeBody, D = PAL.quakeDk, HI = PAL.quakeHi;
    const lift = stomp ? 9 : 0;
    p(-15 + ls, 0, 12, 20, D);
    p(3 - ls, lift, 12, 20, D);
    p(-15 + ls, 0, 12, 5, "#15171b");
    p(3 - ls, lift, 12, 5, "#15171b");
    p(-19, 18, 38, 30, C);
    p(-19, 18, 38, 4, D);
    p(-19, 44, 38, 4, D);
    p(-17, 24, 34, 5, HI);
    p(-14, 31, 28, 10, "#3a3e45");
    p(-25, 40, 9, 13, D);
    p(16, 40, 9, 13, D);
    p(-27, 24, 9, 15, D);
    p(18, 24, 9, 15, D);
    p(-9, 48, 18, 12, C);
    p(-9, 48, 18, 3, D);
    p(2, 53, 5, 3, "#ff5a5a");
    p(-7, 53, 5, 3, "#ff5a5a");
    p(-17, 20, 2, 2, HI); p(15, 20, 2, 2, HI);
  }

  // Lazy-load the atlas (works regardless of script order).
  // Eager-loaded at boot so the preloader gate waits for the atlas.
  const _qImg = JH.QUAKE_FRAMES ? JH.Loader.img(JH.QUAKE_FRAMES.sheet) : null;
  function quakeImg() { return _qImg; }
  function quakeFrame(opt) {
    const F = JH.QUAKE_FRAMES && JH.QUAKE_FRAMES.frames; if (!F) return null;
    if (opt.state === "tele" || opt.state === "leapWind" || opt.state === "leaping") return F.stompUp;
    if (opt.state === "strike" || opt.state === "leapLand") return F.stompDown;
    if (opt.state === "walk") { const a = JH.QUAKE_FRAMES.anims.walk; return F[a[(opt.frame | 0) % a.length]]; }
    return F.idle;
  }
  Assets.register("quake", (p, opt, ctx, x, y, facing) => {
    const img = quakeImg();
    if (img && img._ready) {
      const fr = quakeFrame(opt);
      if (fr) {
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.translate(Math.round(x), Math.round(y));
        if (facing < 0) ctx.scale(-1, 1);
        ctx.drawImage(img, fr.x, fr.y, fr.w, fr.h, Math.round(-fr.ax), -fr.h, fr.w, fr.h);
        ctx.restore();
        return;
      }
    }
    proceduralQuake(p, opt);
  });

  // ===================== WATER DROPLET (projectile) ===================
  Assets.register("water", (p, opt) => {
    const s = opt.size || 3;
    p(-s / 2, 0, s, s, PAL.water);
    p(-s / 2, s * 0.4, s, 1, PAL.waterHi);
  });

  // =========================== EMBER (pyro shot) ======================
  Assets.register("ember", (p, opt) => {
    const s = opt.size || 4;
    const flick = (Math.floor((opt.t || 0) * 14) & 1);
    // Outer dark fire ring (flickers between two reds)
    p(-s / 2 - 1, -1, s + 2, s + 2, flick ? "#c83200" : "#8c1e00");
    // Main flame body
    p(-s / 2, 0, s, s, PAL.flame);
    // Pale yellow inner glow
    p(-s / 2 + 1, Math.round(s * 0.25), s - 2, Math.round(s * 0.5), "#fff8a0");
    // White hot core
    p(-1, Math.round(s * 0.5), 2, 1, "#ffffff");
  });

  // ============================= PICKUPS ==============================
  // Coin spritesheet: coins-chests-etc-2-0.png
  // Spin animation: 6 frames at x=64, stride 16px, each frame 16x16
  // Row y=16 = gold, y=32 = silver, y=64 = bronze
  const COIN_SRC_X = 64, COIN_FRAMES = 6, COIN_W = 16, COIN_H = 16;
  const COIN_Y = { gold: 16, silver: 32, bronze: 64 };
  const _coinSheet = JH.Loader.img("sprites/coins-chests-etc-2-0.png");
  function getCoinSheet() { return _coinSheet; }
  function registerCoin(key, srcY, fallbackColor) {
    Assets.register(key, (p, opt, ctx, x, y) => {
      const bob = Math.sin((opt.t || 0) * 6) * 1.5;
      const sheet = getCoinSheet();
      if (sheet && sheet._ready) {
        const frame = Math.floor((opt.t || 0) * 8) % COIN_FRAMES;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(sheet, COIN_SRC_X + frame * COIN_W, srcY, COIN_W, COIN_H,
          x - 8, Math.round(y - 20 - bob), COIN_W, COIN_H);
        return;
      }
      p(-3, 4 + bob, 6, 6, fallbackColor);
      p(-3, 7 + bob, 6, 1, "#caa015");
      p(-1, 6 + bob, 2, 2, "#fff7c2");
    });
  }
  registerCoin("suds_gold",   COIN_Y.gold,   PAL.suds);
  registerCoin("suds_silver", COIN_Y.silver, "#a0a8c0");
  registerCoin("suds_bronze", COIN_Y.bronze, "#c87030");
  // Holy Essence pickup — a small glowing gold cross (never expires).
  Assets.register("essence_cross", (p, opt, ctx, x, y) => {
    const t = opt.t || 0;
    const bob = Math.sin(t * 3) * 2;
    ctx.save();
    ctx.shadowColor = "#ffe9a0";
    ctx.shadowBlur = 6 + 2 * Math.sin(t * 5);
    ctx.fillStyle = PAL.suds;
    ctx.fillRect(Math.round(x - 1), Math.round(y - 15 + bob), 3, 12);   // upright
    ctx.fillRect(Math.round(x - 4), Math.round(y - 12 + bob), 9, 3);    // crossbar
    ctx.fillStyle = "#fff7c2";
    ctx.fillRect(Math.round(x), Math.round(y - 14 + bob), 1, 10);       // inner shine
    ctx.restore();
  });
  Assets.register("water_can", (p, opt) => {
    const bob = Math.sin((opt.t || 0) * 6) * 1.5;
    p(-4, 2 + bob, 8, 9, PAL.waterDk);
    p(-3, 3 + bob, 6, 7, PAL.water);
    p(-2, 8 + bob, 4, 1, PAL.waterHi);
  });
  const _kibbleImg = JH.Loader.img("sprites/Kibble.png");
  function getKibble() { return _kibbleImg; }
  Assets.register("health", (p, opt, ctx, x, y) => {
    const bob = Math.sin((opt.t || 0) * 6) * 1.5;
    const img = getKibble();
    if (img && img._ready) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, x - 8, Math.round(y - 20 - bob), 16, 16);
      return;
    }
    p(-4, 2 + bob, 8, 8, "#fff");
    p(-1, 3 + bob, 2, 6, PAL.hpPk);
    p(-3, 5 + bob, 6, 2, PAL.hpPk);
  });

  // Shop vendor — real sprite frames. 5-frame idle bob exported as an
  // unrolled ping-pong (1=5 rest, 2=4 mid, 3 peak), so a straight loop
  // bobs smoothly with a one-frame hold on the rest pose at the seam.
  const KEEPER_H = 50;   // target display height in logical pixels
  const KEEPER_FPS = 6;
  const _keeperFrames = [];   // head facing left (default, toward arrivals)
  const _keeperFramesR = [];  // head turned right — same body, only the head
  for (let i = 1; i <= 5; i++) {
    _keeperFrames.push(JH.Loader.img(`sprites/shopkeeper/shopkeeper${i}.png`));
    _keeperFramesR.push(JH.Loader.img(`sprites/shopkeeper/shopkeeper-right${i}.png`));
  }
  // Stall props baked at 4x logical scale by tools/shop-props.mjs.
  const _stall = {
    counter:    JH.Loader.img("sprites/shopkeeper/counter.png"),
    chalkboard: JH.Loader.img("sprites/shopkeeper/chalkboard.png"),
    fuelcan:    JH.Loader.img("sprites/shopkeeper/fuelcan.png"),
    norefunds:  JH.Loader.img("sprites/shopkeeper/norefunds.png"),
  };
  // Blit a stall prop at 1/4 natural size, centered at local cx with its
  // bottom on local y=by (call inside the keeper's translated ctx).
  function stallProp(ctx, img, cx, by) {
    if (!img || !img._ready) return;
    const w = img.naturalWidth / 4, h = img.naturalHeight / 4;
    ctx.drawImage(img, Math.round(cx - w / 2), Math.round(by - h), w, h);
  }
  // Signage copy is layered as real canvas text (props are baked blank by
  // tools/shop-props.mjs). The chalkboard reads this mutable config so
  // mechanics can rewrite the special at runtime.
  JH.SHOP_SIGN = {
    title: "TODAY'S SPECIAL:",
    lines: [
      { text: "DISCOUNTED", color: "#6cff9a" },
      { text: "HOLY HOSE FUEL", color: "#6cff9a" },
      { text: "50% OFF", color: "#6cd3ff" },
      { text: "FOR CHURCH", color: "#6cd3ff" },
      { text: "MEMBERS", color: "#6cd3ff" },
    ],
  };
  // Centered text that squeezes horizontally to fit maxW (never overflows
  // its plaque). Assumes textAlign=center, textBaseline=top.
  function fitText(ctx, str, cx, topY, maxW, px, color, bold) {
    ctx.font = (bold ? "bold " : "") + px + "px monospace";
    ctx.fillStyle = color;
    const w = ctx.measureText(str).width;
    if (w > maxW) {
      ctx.save();
      ctx.translate(cx, topY);
      ctx.scale(maxW / w, 1);
      ctx.fillText(str, 0, 0);
      ctx.restore();
    } else {
      ctx.fillText(str, cx, topY);
    }
  }
  Assets.register("shopkeeper", (p, opt, ctx, x, y, facing) => {
    const fi = Math.floor((opt.t || 0) * KEEPER_FPS) % _keeperFrames.length;
    // facing only turns his head (dedicated right-facing frames); the stall
    // composition never mirrors. Fall back to the left set while loading.
    const right = facing > 0 && _keeperFramesR[fi] && _keeperFramesR[fi]._ready;
    const img = right ? _keeperFramesR[fi] : _keeperFrames[fi];
    if (!img || !img._ready) {
      // Placeholder slab while frames load.
      p(-9, 0, 18, KEEPER_H - 12, "#3f7a4f");
      p(-5, KEEPER_H - 12, 10, 12, PAL.skin);
      return;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.imageSmoothingEnabled = false;
    // Stall, back to front. Counter body is 26 logical tall with its right
    // edge 6 in from the PNG edge; placed so the keeper's leaning arm lands
    // on the counter's top-right corner. No drop shadows — those are a
    // depth cue reserved for Jon and enemies.
    stallProp(ctx, _stall.chalkboard, -83, -2);
    stallProp(ctx, _stall.counter, -31, 0);
    const scale = KEEPER_H / img.naturalHeight;
    const dw = Math.round(img.naturalWidth * scale);
    ctx.drawImage(img, -Math.round(dw / 2), -KEEPER_H, dw, KEEPER_H);
    stallProp(ctx, _stall.fuelcan, -64, 3);
    stallProp(ctx, _stall.norefunds, 18, 2);
    ctx.restore();

    // --- signage text layer ----------------------------------------------
    // Fixed offsets from the feet line; anchors derive from the prop
    // geometry in tools/shop-props.mjs.
    const lx = (dx) => x + dx;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    // Counter plaques (counter top edge at y-48)
    fitText(ctx, "THE SHOPKEEPER", lx(-32), y - 20, 36, 4, PAL.suds, true);
    fitText(ctx, "BUSINESS IS DIVINE", lx(-32), y - 10.5, 39, 3.5, "#caa015", false);
    // Chalkboard (slate inner: x -99..-67, y -50..-22)
    const sign = JH.SHOP_SIGN;
    let ty = y - 49;
    fitText(ctx, sign.title, lx(-83), ty, 30, 4, "#e8ecf0", true);
    ty += 5;
    for (const line of sign.lines) {
      fitText(ctx, line.text, lx(-83), ty, 30, 3.5, line.color, false);
      ty += 4;
    }
    // Chalk cross under the last line
    ctx.fillStyle = "#d6f6ff";
    ctx.fillRect(lx(-83) - 0.5, ty + 1, 1, 5);
    ctx.fillRect(lx(-83) - 2, ty + 2.5, 4, 1);
    // Fuel can label (band: y -11..-4)
    fitText(ctx, "HOSE", lx(-64), y - 11, 11, 3, "#cfe8d8", true);
    fitText(ctx, "FUEL", lx(-64), y - 7.5, 11, 3, "#cfe8d8", true);
    // Cardboard sign (card top at y-22)
    fitText(ctx, "NO", lx(18), y - 21, 15, 3.5, "#241a10", true);
    fitText(ctx, "REFUNDS.", lx(18), y - 17.5, 15, 3.5, "#241a10", true);
    fitText(ctx, "JUST", lx(18), y - 14, 15, 3.5, "#241a10", true);
    fitText(ctx, "HOSE.", lx(18), y - 10.5, 15, 3.5, "#241a10", true);
    ctx.restore();
  });

  // ====================== GATEWAY KRUSHER 9000 (final boss) ===================
  // A big STANDING switch chassis with an angry middle-aged face embedded.
  Assets.register("gatewaykrusher", (p, opt) => {
    const t = opt.t || 0;
    const C = PAL.gkBody, D = PAL.gkDk;
    // Outer chassis
    p(-22, 0, 44, 60, D);
    p(-20, 2, 40, 56, C);
    p(-20, 56, 40, 3, "#39455c");   // top bevel
    p(-22, 0, 44, 2, "#0a0c14");    // base strip
    // Rack ears
    p(-24, 8, 2, 44, "#0a0c10"); p(22, 8, 2, 44, "#0a0c10");
    // Three rows of ports near top
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 8; i++) {
        const px = -18 + i * 4.5;
        const py = 42 + row * 5;
        const on = (Math.floor(t * 5 + i + row * 3) % 4 !== 0);
        p(px, py, 3, 3, on ? PAL.gkLed : "#1a0808");
      }
    }
    // Face embedded in middle section (ly 20-42)
    p(-11, 22, 22, 20, PAL.gkFace);          // skin base
    p(-10, 22, 20, 5, PAL.gkStubble);         // chin stubble band
    // Stubble texture patches (lighter flecks)
    p(-9, 22, 2, 4, PAL.gkFace); p(-5, 23, 2, 3, PAL.gkFace);
    p(-1, 22, 2, 4, PAL.gkFace); p( 3, 23, 2, 3, PAL.gkFace);
    p( 6, 22, 2, 4, PAL.gkFace);
    // Mouth grimace
    p(-7, 27, 14, 2, "#1a1010");
    p(-6, 28, 3, 2, "#0a0808"); p(3, 28, 3, 2, "#0a0808"); // teeth gaps
    // Nose
    p(-2, 29, 4, 5, "#9a8070");
    // Brow ridge
    p(-10, 39, 8, 3, "#2a2020"); p(2, 39, 8, 3, "#2a2020");
    // Eye sockets
    p(-9, 33, 7, 6, "#0a0808"); p(2, 33, 7, 6, "#0a0808");
    // Glowing red eyes
    p(-8, 34, 5, 4, "#dd1100"); p(3, 34, 5, 4, "#dd1100");
    p(-7, 35, 2, 2, "#ff6644"); p(4, 35, 2, 2, "#ff6644");
    // Vent slashes on body
    p(-18, 10, 5, 2, "#0a0c10"); p(-18, 13, 5, 1, "#0a0c10");
    p( 13, 10, 5, 2, "#0a0c10"); p( 13, 13, 5, 1, "#0a0c10");
    // Status LEDs — all red/angry
    p(-19, 5, 3, 3, PAL.gkLed); p(16, 5, 3, 3, "#ff3a3a");
    p(-19, 18, 3, 3, PAL.gkLed); p(16, 18, 3, 3, "#ff3a3a");
  });

  // ========================= THE FIREWALL (wall boss) =================
  // PLACEHOLDER ART — procedural pixels standing in until a real sprite sheet
  // lands; swap this painter for an image-blit one (see "neighbor" below) with
  // no entity-code changes. A wall-sized network-switch chassis (matches the
  // Switch of Doom palette). Drawn pinned to the right edge with its base on
  // the front floor line (feet anchor = floor bottom). The roaming weak-spot
  // core is drawn separately by the entity (it slides along the dark rail
  // channel carved into the left face). facing is always +1.
  Assets.register("wallboss", (p, opt) => {
    const t = opt.t || 0;
    const C = PAL.wallbossBody, D = PAL.wallbossDk, HI = PAL.wallbossHi;
    const LED = PAL.switchLed, CB = PAL.cable;
    const L = -42, W = 138, H = 178;          // left-face local-x, width, height (ly up from feet)

    // ---- main chassis ----
    p(L - 2, 0, W + 4, H, D);                  // dark outline
    p(L, 2, W, H - 4, C);                       // body fill
    // recessed vertical rack seams
    for (let gx = L + 16; gx < L + W - 8; gx += 26) p(gx, 8, 2, H - 16, D);
    // horizontal rack-unit divider bands
    p(L, 46, W, 2, D); p(L, 92, W, 2, D); p(L, 138, W, 2, D);

    // ---- bright left face plate (the side facing the player) ----
    p(L, 0, 5, H, HI);
    p(L, 0, 2, H, "#9aa6c0");

    // ---- weak-spot rail channel on the left face (core travels here) ----
    p(L + 14, 16, 14, H - 34, "#0b0d14");      // dark recessed track
    p(L + 13, 16, 1, H - 34, HI);              // rail edges
    p(L + 28, 16, 1, H - 34, HI);
    for (let ry = 22; ry < H - 22; ry += 10) p(L + 15, ry, 12, 1, "#05060a"); // rail ties

    // ---- port banks across the face (the "network switch" read) ----
    for (let row = 0; row < 15; row++) {
      const py = 16 + row * 11;
      if (py > H - 18) break;
      for (let col = 0; col < 8; col++) {
        const px = L + 38 + col * 11;
        p(px, py, 7, 5, "#0a0d14");             // dark port socket
        p(px + 1, py + 1, 5, 3, D);             // inner
        // per-port status LED — mostly green, occasional red, some dark
        const k = Math.floor(t * 4 + col * 2 + row * 3) % 7;
        const lit = k !== 0 && k !== 4;
        const red = (col + row) % 5 === 0;
        p(px + 2, py + 1, 2, 2, lit ? (red ? "#ff5a5a" : LED) : "#10331f");
      }
    }

    // ---- cable connectors along the top edge (switch lineage nod) ----
    for (let i = 0; i < 5; i++) {
      const cx = L + 34 + i * 18;
      p(cx, H - 9, 4, 9, CB);
      p(cx + 1, H - 3, 2, 4, "#2a3346");
    }

    // ---- trim + master status LEDs ----
    p(L, H - 4, W, 4, D);                        // top trim
    p(L, 0, W, 3, "#05070c");                    // base strip
    const on = (Math.floor(t * 4) % 2) === 0;
    p(L + 33, 8, 3, 3, on ? LED : "#10331f");
    p(L + W - 9, 8, 3, 3, on ? "#ffb020" : "#3a2a08");
  });

  // ====================== THE NEIGHBOR (garden enemy) =================
  // Image-blit painter backed by neighbor-frames.js atlas.
  // Falls back to procedural if the sheet isn't loaded yet.
  const _nbImg = JH.NEIGHBOR_FRAMES ? JH.Loader.img(JH.NEIGHBOR_FRAMES.sheet) : null;
  function neighborImg() { return _nbImg; }
  function neighborFrame(state) {
    const F = JH.NEIGHBOR_FRAMES && JH.NEIGHBOR_FRAMES.frames;
    if (!F) return null;
    if (state === "rockReady")  return F.idle;
    if (state === "rockReach")  return F.rockReach;
    if (state === "rockRaise")  return F.rockRaise;
    if (state === "speakerRaise") return F.speakerRaise;
    if (state === "speakerBlast") return F.speakerBlast;
    return F.idle;
  }
  Assets.register("neighbor", (p, opt, ctx, x, y, facing) => {
    const img = neighborImg();
    if (img && img._ready) {
      const fr = neighborFrame(opt.state);
      if (fr) {
        const S = JH.NEIGHBOR_FRAMES.scale;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.translate(Math.round(x), Math.round(y));
        if (facing !== (fr.df || 1)) ctx.scale(-1, 1);
        ctx.drawImage(img, fr.x, fr.y, fr.w, fr.h,
          Math.round(-fr.ax * S), -Math.round(fr.h * S),
          Math.round(fr.w * S), Math.round(fr.h * S));
        ctx.restore();
        return;
      }
    }
    // ---- procedural fallback ----
    const wind = opt.state === "rockReach" || opt.state === "rockRaise" || opt.state === "rockReady";
    const G = PAL.neighbor, GD = PAL.neighborDk;
    p(-5, 0, 4, 4, GD); p(1, 0, 4, 4, GD);
    p(-5, 4, 4, 13, GD); p(1, 4, 4, 13, GD);
    p(-6, 17, 12, 11, G);
    p(-6, 17, 12, 2, GD);
    p(-6, 26, 12, 2, GD);
    p(-10, 18, 4, 10, GD);
    p(-11, 18, 3, 5, "#0e1a34");
    if (wind) {
      p(6, 22, 4, 13, GD);
      p(5, 33, 5, 5, "#0e1a34");
      p(3, 38, 8, 5, PAL.rock);
      p(4, 39, 6, 3, PAL.rockDk);
      p(5, 40, 2, 2, "#c0b098");
    } else {
      p(6, 17, 4, 10, GD);
      p(6, 17, 3, 5, "#0e1a34");
    }
    p(-4, 28, 9, 10, G);
    p(-4, 28, 9, 2, GD);
    p(-4, 33, 4, 2, "#070707"); p(1, 33, 4, 2, "#070707");
    p(-1, 33, 2, 1, "#181818");
    p(-3, 34, 1, 1, "#3a3a4a"); p(2, 34, 1, 1, "#3a3a4a");
    p(-15, 38, 30, 2, "#c8b860");
    p(-13, 40, 26, 2, "#ddc870");
    p(-11, 42, 22, 2, "#d4bc60");
    p( -9, 44, 18, 2, "#c8b040");
    p( -7, 46, 14, 2, "#bea428");
    p( -5, 48, 10, 2, "#b09c28");
    p( -3, 50,  7, 2, "#a09020");
    p( -2, 52,  5, 2, "#907820");
    p( -1, 54,  3, 2, "#806818");
    p(  0, 56,  2, 3, "#705a18");
  });

  // ========================= ROCK (neighbor projectile) ===============
  // Sprite sheet: sprites/neighbor/rocks.png — 3x2 grid, 24x24 cells, 6 variants.
  const ROCK_CELL = 24, ROCK_COLS = 3, ROCK_SCALE = 0.38;
  const _rockSheet = JH.Loader.img("sprites/neighbor/rocks.png");
  function rockSheetImg() { return _rockSheet; }
  Assets.register("rock", (p, opt, ctx, x, y) => {
    const img = rockSheetImg();
    if (img && img._ready) {
      const v = (opt.variant || 0) % 6;
      const col = v % ROCK_COLS, row = Math.floor(v / ROCK_COLS);
      const dw = Math.round(ROCK_CELL * ROCK_SCALE);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, col * ROCK_CELL, row * ROCK_CELL, ROCK_CELL, ROCK_CELL,
        Math.round(x - dw / 2), Math.round(y - dw / 2), dw, dw);
      ctx.restore();
      return;
    }
    p(-3, 0, 6, 6, PAL.rock);
    p(-2, 1, 4, 4, PAL.rockDk);
    p(-1, 2, 2, 2, "#aaa090");
  });

  // ========================= GARDEN BOX ===============================
  Assets.register("garden_box", (p, opt) => {
    const gf = Math.max(0, Math.min(1, opt.growFrac || 0));
    // Wooden planter box
    p(-20, 0, 40, 10, "#5a3b22"); p(-18, 2, 36, 8, "#4a2c18");
    p(-19, 9, 40, 1, "#7a5230");  // top edge highlight
    // Soil
    p(-18, 2, 36, 2, "#3a2010");
    if (gf > 0) {
      const h = Math.round(gf * 16);
      // Potato plant (left)
      p(-14, 8, 3, h, "#4a7a30");
      p(-16, 7 + h, 7, 4, "#5a9a40");
      // Buckwheat (right)
      p(5, 8, 3, h, "#6a8a3a");
      p(3, 7 + h, 7, 4, "#8ab040");
      if (gf > 0.5) {
        // Flowers appearing
        p(-13, 9 + h, 2, 2, "#fff7a0");
        p(  7, 9 + h, 2, 2, "#ffe0b0");
      }
      if (gf > 0.8) {
        // Produce visible in soil
        p(-15, 6, 4, 3, "#c8a060");   // potato
        p(  5, 6, 4, 3, "#e0e0a0");   // buckwheat seed head
      }
    }
  });

  // ========================= CONCERTA PILL ============================
  Assets.register("pill", (p, opt) => {
    const bob = Math.sin((opt.t || 0) * 7) * 1.5;
    p(-5, 2 + bob, 10, 4, "#ff66ff");  // pink half
    p(-5, 6 + bob, 10, 4, "#ffffff");  // white half
    p(-5, 5 + bob, 10, 1, "#aa00aa");  // seam line
    p(-2, 3 + bob,  3, 3, "#ffbbff");  // shine
  });

  // Hydrant prop (level decoration / water source marker)
  // ========================= TARGET DUMMY ============================
  Assets.register("dummy", (p, opt) => {
    p(-4, 0, 8, 3, "#4a2e12");            // base block
    p(-2, 3, 4, 13, "#7a5028");           // wooden post
    p(-8, 14, 16, 2, "#7a5028");          // crossbar arms
    p(-9, 13, 2, 4, "#5a3a18");           // left arm tip
    p(7, 13, 2, 4, "#5a3a18");            // right arm tip
    p(-4, 17, 8, 11, "#cc5c18");          // head bag (orange)
    p(-3, 18, 6, 9, "#aa4010");           // center target
    p(-1, 22, 2, 2, "#ff8030");           // bullseye
  });

  // opt.gold = this is the active respawn point (red -> golden).
  Assets.register("hydrant", (p, opt) => {
    const gold = opt && opt.gold;
    const dk = gold ? "#8a5e0c" : "#7a1010";
    const br = gold ? "#ffce3a" : "#c81f1f";
    p(-4, 0, 8, 3, dk);
    p(-3, 3, 6, 9, br);
    p(-3, 12, 6, 3, dk);
    p(-1, 15, 2, 2, br);
    p(-5, 7, 2, 2, dk);
    p(3, 7, 2, 2, dk);
  });
  // =================== QUAKE WALKER CUTSCENE PORTRAIT ================
  // Pre-load both mouth-closed and mouth-open JPGs immediately.
  {
    const makeImg = (src) => JH.Loader.img(src);
    const _closed = makeImg("sprites/quake_walker/quake_walker_portrait.jpg");
    const _open   = makeImg("sprites/quake_walker/quake_walker_portrait_mouthopen.jpg");
    JH.getQuakePortrait = (mouthOpen) => mouthOpen ? _open : _closed;
  }

  {
    const _closed = JH.Loader.img("sprites/slayer/slayer-portrait-mouthclosed.png");
    const _open   = JH.Loader.img("sprites/slayer/slayer-portrait-mouthopen.png");
    JH.getSlayerPortrait = (mouthOpen) => mouthOpen ? _open : _closed;
  }

  // =================== CHURCH OF THE HOSE ART =======================
  // Transparent PNGs; church.js renderScene falls back to ctx-rects if a
  // file is missing/unloaded (the documented neighbor blit+fallback seam).
  {
    const makeImg = (src) => JH.Loader.img(src);
    JH.ChurchArt = {
      backdrop:          makeImg("sprites/church/backdrop.jpg"),
      altar:             makeImg("sprites/church/altar.png"),
      shrineDim:         makeImg("sprites/church/shrine_dim.png"),
      shrineLit:         makeImg("sprites/church/shrine_lit.png"),
      portal:            makeImg("sprites/church/portal.png"),
      // Father Jon: in-world NPC + codec dialogue portrait (mouth closed/open).
      fatherJonNpc:          makeImg("sprites/church/father_jon.png"),
      fatherJonPortrait:     makeImg("sprites/church/father_jon_portrait.png"),
      fatherJonPortraitOpen: makeImg("sprites/church/father_jon_portrait_openmouth.png"),
      // Walk-up blessing stations (keyed by blessing id).
      station_bless_dps:  makeImg("sprites/church/station_dmg.png"),
      station_bless_tank: makeImg("sprites/church/station_water.png"),
      station_bless_hp:   makeImg("sprites/church/station_hp.png"),
    };
  }

  // Register all curated FX declared in the config manifest.
  for (const k in JH.FX) Assets.registerFx(k, "sprites/fx/" + k, JH.FX[k].count, JH.FX[k].fps);
})();
