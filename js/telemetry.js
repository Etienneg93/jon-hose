/* =====================================================================
   telemetry.js — per-run gameplay telemetry + leaderboard client.
   Dual export: attaches JH.Telemetry in the browser; module.exports for
   node:test. Never reads gameplay state — only receives values via hooks.
   Every hook is a no-op when telemetry is off (disabled, no endpoint, or
   blank handle). A send failure is swallowed; nothing reaches the frame.
   ===================================================================== */
(function (root) {
  "use strict";

  function newId() {
    try { if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID(); }
    catch (e) { /* ignore */ }
    return "r-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e9).toString(36);
  }

  const Telemetry = {
    endpoint: "",
    enabled: false,
    gameVersion: "0",
    run: null,          // active run record, or null when telemetry is off this run
    _transport: null,   // send(payload); injected by tests or installBrowserTransport
    _fetchLb: null,     // fetchLeaderboard impl; set by installBrowserTransport

    configure(cfg) {
      cfg = cfg || {};
      this.endpoint = cfg.endpoint || "";
      this.enabled = !!cfg.enabled;
      this.gameVersion = cfg.gameVersion || "0";
    },

    setTransport(fn) { this._transport = fn; },
    _setTransport(fn) { this._transport = fn; },

    _live(handle) { return this.enabled && !!this.endpoint && !!handle; },

    startRun(handle) {
      handle = (handle || "").trim();
      if (!this._live(handle)) { this.run = null; return; }
      this.run = {
        runId: newId(), handle: handle, gameVersion: this.gameVersion,
        wavesReached: {}, deathsByWave: {}, benedictions: [], items: [],
        finalWaveIndex: -1, finalWaveName: "",
      };
    },

    waveReached(index, name) {
      const r = this.run; if (!r) return;
      r.wavesReached[index] = true;
      if (index > r.finalWaveIndex) { r.finalWaveIndex = index; r.finalWaveName = name || ""; }
    },

    death(waveIndex) {
      const r = this.run; if (!r) return;
      r.deathsByWave[waveIndex] = (r.deathsByWave[waveIndex] || 0) + 1;
    },

    benediction(id) { const r = this.run; if (!r || !id) return; r.benedictions.push(id); },
    item(id)        { const r = this.run; if (!r || !id) return; r.items.push(id); },

    buildPayload(outcome, stats) {
      const r = this.run; if (!r) return null;
      stats = stats || {};
      const pick = (k, dflt) => (stats[k] != null ? stats[k] : dflt);
      const finalIdx = pick("finalWaveIndex", r.finalWaveIndex);
      return {
        handle: r.handle, runId: r.runId, gameVersion: r.gameVersion, outcome: outcome,
        finalWaveIndex: finalIdx,
        finalWaveName: pick("finalWaveName", r.finalWaveName),
        wavesCleared: outcome === "win" ? (finalIdx || 0) + 1 : (finalIdx || 0),
        deaths: stats.deaths | 0, kills: stats.kills | 0,
        timeSec: +(stats.timeSec || 0), sudsEarned: Math.floor(stats.sudsEarned || 0),
        wavesReached: Object.keys(r.wavesReached).map(Number).sort((a, b) => a - b),
        deathsByWave: r.deathsByWave,
        benedictions: r.benedictions.slice(), items: r.items.slice(),
      };
    },

    _finish(outcome, stats) {
      const payload = this.buildPayload(outcome, stats);
      this.run = null;   // one send per run — guards double-finish
      if (!payload) return;
      try { (this._transport || function () {})(payload); } catch (e) { /* never throw */ }
    },

    finishWin(stats) { this._finish("win", stats); },
    finishAbandoned() { if (this.run) this._finish("abandoned", {}); },

    fetchLeaderboard(cb) { if (this._fetchLb) this._fetchLb(cb); else if (cb) cb(null); },

    // Browser-only: real POST (sendBeacon → fetch fallback) + JSONP read.
    installBrowserTransport() {
      const self = this;
      this._transport = function (payload) {
        const body = JSON.stringify(payload);
        try {
          if (root.navigator && root.navigator.sendBeacon) {
            const blob = new root.Blob([body], { type: "text/plain" });
            if (root.navigator.sendBeacon(self.endpoint, blob)) return;
          }
        } catch (e) { /* fall through */ }
        try {
          root.fetch(self.endpoint, { method: "POST", mode: "no-cors", keepalive: true,
            headers: { "Content-Type": "text/plain" }, body: body });
        } catch (e) { /* swallow */ }
      };
      this._fetchLb = function (cb) {
        if (!self.endpoint) { if (cb) cb(null); return; }
        const name = "jhLb_" + Math.floor(Math.random() * 1e9);
        let done = false, s = null;
        const finish = function (data) {
          if (done) return; done = true;
          try { delete root[name]; } catch (e) { root[name] = undefined; }
          if (s && s.parentNode) s.parentNode.removeChild(s);
          if (cb) cb(data);
        };
        root[name] = function (data) { finish(data); };
        s = root.document.createElement("script");
        s.src = self.endpoint + (self.endpoint.indexOf("?") >= 0 ? "&" : "?") + "cb=" + name + "&_=" + Date.now();
        s.onerror = function () { finish(null); };
        root.document.head.appendChild(s);
        root.setTimeout(function () { finish(null); }, 6000);
      };
    },
  };

  root.JH = root.JH || {};
  root.JH.Telemetry = Telemetry;
  if (typeof module !== "undefined" && module.exports) module.exports = Telemetry;
})(typeof window !== "undefined" ? window : globalThis);
