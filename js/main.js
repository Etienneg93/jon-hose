/* =====================================================================
   main.js — bootstrap. Waits for DOM, then starts the game loop on the
   title screen. Kept tiny on purpose; all logic lives in the modules.
   ===================================================================== */
(function () {
  "use strict";
  const JH = window.JH;

  // Size the canvas drawing buffer to physical pixels so all rendering
  // (including canvas text) is crisp at the actual screen resolution.
  // The context transform keeps all game coordinates in 480×270 logical px.
  function fitCanvas() {
    const el = document.getElementById("game");
    const ctx = el.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    el.width  = Math.round(el.offsetWidth  * dpr);
    el.height = Math.round(el.offsetHeight * dpr);
    ctx.setTransform(el.width / JH.VIEW_W, 0, 0, el.height / JH.VIEW_H, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  function boot() {
    fitCanvas();
    window.addEventListener("resize", fitCanvas);
    JH.Game.init();
    JH.Game.showScreen("screen-title");

    // First key/click also unlocks audio + starts music (autoplay policy).
    const unlock = () => { JH.AudioFX.resume(); JH.Music.start(); window.removeEventListener("keydown", unlock); };
    window.addEventListener("keydown", unlock);

    // Allow Space on the title only. End screens use Enter/E so holding
    // Space to spray through the boss kill cannot instantly restart.
    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const s = JH.Game.state;
      if (s === "title") {
        if (e.code === "Enter" || e.code === "Space" || e.code === "KeyE") JH.Game.startGame();
      } else if (s === "over" || s === "win") {
        if (e.code === "Enter" || e.code === "KeyE") JH.Game.startGame();
      } else if (s === "shop") {
        if (e.code === "Enter" || e.code === "KeyE") JH.Game.closeShop();
      }
    });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
