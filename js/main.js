/* =====================================================================
   main.js — bootstrap. Waits for DOM, then starts the game loop on the
   title screen. Kept tiny on purpose; all logic lives in the modules.
   ===================================================================== */
(function () {
  "use strict";
  const JH = window.JH;

  function boot() {
    JH.Game.init();
    JH.Game.showScreen("screen-title");

    // First key/click also unlocks audio + starts music (autoplay policy).
    const unlock = () => { JH.AudioFX.resume(); JH.Music.start(); window.removeEventListener("keydown", unlock); };
    window.addEventListener("keydown", unlock);

    // Allow Enter/Space/E to start from the title, confirm end screens,
    // and leave the shop. (Opening the shop is handled in-game by walking
    // up to the vendor and pressing E/Enter.)
    window.addEventListener("keydown", (e) => {
      if (e.code !== "Enter" && e.code !== "Space" && e.code !== "KeyE") return;
      const s = JH.Game.state;
      if (s === "title" || s === "over" || s === "win") JH.Game.startGame();
      else if (s === "shop") JH.Game.closeShop();
    });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
