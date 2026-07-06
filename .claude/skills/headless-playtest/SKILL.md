---
name: headless-playtest
description: Verify jon-hose gameplay headlessly — launch the game in headless Edge via playwright-core, drive it with real keys, and assert on live game state. Use before claiming any gameplay change works, and for screenshots of UI/feel changes.
---

# Headless playtest harness (jon-hose)

The verified path for exercising this game without a human. Naive attempts
fail silently — the gotchas below are each a debugged failure. Full loops
have been verified with this pattern: 29-wave campaigns, death→church→
reliquary→respawn, shop purchases, sigil picks.

## Setup (once per session)

- Dev server: `npm run dev` serves at `http://localhost:5173`. Check
  `netstat -an | grep 5173` first — it's often already running.
- Driver: `playwright-core` with the **msedge channel** (no browser
  download needed): may already be installed in the session scratchpad;
  otherwise `npm i playwright-core` in a scratch dir.

## Boilerplate

```js
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await (await browser.newContext()).newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 200)));
await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);              // asset preloader gate
await page.keyboard.press("Backquote");       // dev menu: STARTS THE GAME (localhost only)
await page.waitForTimeout(300);
await page.keyboard.press("Escape");          // close the menu; drive via eval + keys
```

## The gotchas (violate these and it breaks silently)

1. **Hold keys ~120ms.** `page.keyboard.press()` releases within one frame
   and the frame-sampled edge detector (`Input.pressed`) never sees it.
   Always: `await page.keyboard.down("KeyE"); await sleep(120);
   await page.keyboard.up("KeyE");` Movement keys work held-down normally.
2. **Father Jon's sermon gates church movement.** After death you MUST
   press E (held, per #1) through every dialogue line before Jon can walk.
   Setting `scene.exitT` or teleporting without the `exiting` flag does
   NOT exit the church — walk to the portal (x≥642) and press E, or set
   `sc.exiting = true; sc.exitT = 0` (both).
3. **Wait for state transitions by polling** `window.JH.Game.state`
   (`"play"`, `"church"`, `"cutscene"`, `"win"`, `"playerDeathSeq"`) —
   the death sequence alone takes 3.2s; church-return arrival freezes the
   play update for ~1-2s (shop/nearShop won't register until it ends).
4. **Cutscenes**: advance by calling `g.afterSlayerCutscene()` /
   `g.afterCutscene()` from eval when `g.state === "cutscene"`.

## Useful handles (page.evaluate)

- `window.JH.Game` — `.state`, `.player` (hp/water/x/y/stats/buff timers),
  `.enemies`, `.sigils`, `.pickups`, `.firePatches`, `.wavePool`,
  `.devGotoWave(i)` (dev-menu teleport, resets to wave i),
  `.spawnVendor(x)` + set `shopNpc.y = player.y` to force shop range,
  `.priceOf(n)`, `.voucher50`.
- `window.JH.Benedictions` — `.active`, `.washed`, `.take(id)`, `.rank(id)`.
- `window.JH.Church` — `.state.essence`, `.state.pillars`, `.scene`
  (`jonX/jonY/dialogue/pityVoucher/nearReliquary/nearPortal`).
- Kill things: `e.hp = 0; e.die ? e.die(g) : e.dead = true;` — objective
  waves: force `g.gardens[i].done`, `g.wall.dead`, cap `g.holdoutTimer`.
- Kill Jon: `g.player.hp = 0; g.player.alive = false;` (in play state).

## Patterns

- **Walk-to controller**: poll position every ~100ms, hold/release arrow
  keys toward the target; release all keys when dialogue appears and E
  through it. (Father Jon has a solid body — steer around with Up/Down.)
- **Screenshots**: `page.screenshot({ path, clip })` — LOOK at the image;
  use for every UI/text/telegraph change. The Tab key toggles the stat
  panel; hold it 120ms per gotcha #1.
- **Fast unit-style church tests**: church.js/benedictions.js/balance.js
  are dual-export — a plain node script with `global.window = globalThis`
  + stub `JH.Input`/`JH.Assets` runs updateScene/renderScene without a
  browser (see tests/ for the stub shapes; fake DOM elements need
  `style: {}`).

## Rule

Never report a gameplay change as working from code reading alone. Drive
the actual loop the user will play, assert on the states, and say what was
verified and how in the reply.
