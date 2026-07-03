/* Asset preloader — central registry for every image the game blits.
 *
 * All sprite/Image() creation routes through JH.Loader.img(src) so we can gate
 * the title screen's "PRESS START" until the art has settled. A 404 (e.g. a
 * placeholder asset that isn't drawn yet) counts as "settled" too — the gate
 * waits for resolution, not success, so a missing file can never hang it.
 *
 * Images are created synchronously at script-eval time, so `total` is final
 * before the player can interact; load/error events fire async afterwards.
 */
window.JH = window.JH || {};
(function () {
  let total = 0, settled = 0;
  const listeners = [];

  // Deployed builds carry <meta name="build"> (injected by tools/build.mjs
  // into <head>, so it exists before any body script runs). Stamp it onto
  // every image URL so a new deploy busts browser/CDN caches the same way
  // the stamped js/css URLs do. Local dev has no meta -> plain URLs.
  const _buildMeta = document.querySelector('meta[name="build"]');
  const _vq = _buildMeta ? "?v=" + encodeURIComponent(_buildMeta.content) : "";

  function settle() {
    settled++;
    for (const fn of listeners) fn(settled, total);
  }

  JH.Loader = {
    // Tracked Image. Sets img._ready on successful load; counts load+error.
    img(src) {
      const img = new Image();
      img._ready = false;
      total++;
      img.addEventListener("load", () => { img._ready = true; settle(); });
      img.addEventListener("error", settle);
      img.src = src + _vq;
      return img;
    },
    get total() { return total; },
    get settled() { return settled; },
    // True once every tracked image has loaded or errored.
    ready() { return settled >= total; },
    // fn(settled, total) fires on each settle; returns fn for convenience.
    onProgress(fn) { listeners.push(fn); return fn; },
  };
})();
