# Telemetry & Leaderboard — Design

**Date:** 2026-07-08
**Branch:** `telemetry-leaderboard` (off `main`, current `v0.27.6`)
**Status:** Design approved, awaiting spec review

## Goal

Collect per-run gameplay data from external playtesters into one queryable
place, so we can build a **per-wave death-rate matrix** (where players die)
and correlate it with the **benedictions chosen** and **items bought**. The
same data pipe doubles as a **fastest-win leaderboard** shown in-game.

The game is a static site on GitHub Pages, so aggregation requires the data
to leave the browser and land in a shared store.

## Decisions (locked in brainstorm)

- **Backend:** Google Apps Script web app bound to a Google Sheet. Free, no
  new account (user has Gmail), no server to maintain, and the sheet pivots
  straight into the matrix. (Rejected: Supabase / serverless — more setup,
  no benefit here.)
- **Matrix metric:** *reached vs died-on per wave.* Because death respawns
  to the Church (the run continues; only a win ends it), the matrix is:
  for each wave, `runs that reached it` (denominator) vs `deaths on it`
  (numerator) → per-wave death rate.
- **Leaderboard:** ranks **fastest win** by run time. Built fully this pass
  (write + read-back + in-game screen).
- **Identity:** a player **handle**, prompted once on the **title screen
  before Start**, stored in `localStorage` (`jh_handle`). Consent is folded
  into the prompt — **blank handle ⇒ telemetry fully off** for that player.
- **Run timer:** the existing `this.elapsed` clock (game.js:1454), which
  only advances during `state === "play"`. It already excludes paused time,
  Church, cutscenes, the truck run, death sequences, and the upgrade menu,
  and the `dt > 0.25` clamp (game.js:1363) absorbs tab-switch gaps. No new
  timer is built; telemetry reads `elapsed` at `win()`.

## Architecture

One new module `js/telemetry.js` exposing `JH.Telemetry`, plus a Google
Apps Script backend (`tools/telemetry.gs`, checked in for reference), plus a
config block and a leaderboard screen.

`JH.Telemetry` owns a **run record** accumulated in memory over the run and
shipped once when the run ends. It exposes small hooks called from existing
sites in `game.js` / `upgrades.js`:

| Event | Call site | Hook | Record effect |
|---|---|---|---|
| Run start | reset path (game.js:359–364) | `startRun()` | new `runId`, `gameVersion`, `handle`, zeroed accumulators |
| Wave reached | `startWave(i)` (game.js:384) | `waveReached(i, name)` | add `i` to `wavesReached` set |
| Death | `startPlayerDeathSeq()` (game.js:1311) | `death(waveIndex)` | `deathsByWave[waveIndex]++` |
| Benediction chosen | benediction offer-confirm (game.js) | `benediction(id)` | push id |
| Item bought | `Upgrades.buy` / `buyRep` (upgrades.js:107/124) + Church blessing purchase | `item(id)` | push id |
| Win | `win()` (game.js:1290) | `finishWin({elapsed,kills,deaths,suds,finalWave})` → POST | outcome=`win`, POST |
| Tab close pre-win | `window.beforeunload` | `finishAbandoned()` → POST | outcome=`abandoned`, best-effort POST |

Design notes:
- **Isolation.** `telemetry.js` never touches gameplay state directly; it
  only receives values through its hooks. Gameplay code never reads back
  from telemetry. A telemetry failure (network, disabled, no handle) is a
  silent no-op — it can never affect a frame.
- **Master switch.** `JH.TELEMETRY = { endpoint, enabled }` in `config.js`.
  If `enabled` is false, endpoint is empty, or the handle is blank, every
  hook is a no-op and nothing is sent.

## Data model (one Sheet row per run)

`doPost` appends a row with these columns:

```
ts            server timestamp (Apps Script)
handle        player name
runId         random per-run id (crypto.randomUUID / fallback)
gameVersion   package.json version at build (baked into config)
outcome       "win" | "abandoned"
finalWaveIndex
finalWaveName
deaths        total deathCount
kills
timeSec       this.elapsed at end
sudsEarned
wavesReached  JSON array of wave indices
deathsByWave  JSON map { waveIndex: count }
benedictions  JSON array of ids
items         JSON array of ids
```

Complex fields are JSON-stringified into single cells. Derived views live
on separate Sheet tabs (formulas / pivots), not in the raw log:

- **Matrix tab:** per wave `i`, `reached = COUNT(rows where i ∈ wavesReached)`,
  `deaths = SUM(deathsByWave[i])`, `deathRate = deaths / reached`.
- **Leaderboard tab:** rows where `outcome = "win"`, sorted by `timeSec` asc,
  top 10 (handle, timeSec, deaths).

## Transport & CORS

Apps Script is fussy about CORS, so:
- **Write:** `fetch(endpoint, { method: "POST", mode: "no-cors",
  headers: { "Content-Type": "text/plain" }, body: JSON.stringify(record) })`.
  `text/plain` avoids a preflight; `no-cors` fire-and-forget (we don't read
  the response). `beforeunload` uses `navigator.sendBeacon` when available
  for reliability on tab close.
- **Read (leaderboard):** JSONP — inject a `<script src="{endpoint}?
  cb=jhLb_123">` tag; Apps Script `doGet` returns `jhLb_123({...})`. This is
  the one reliable cross-origin read from Apps Script. Timeout + graceful
  "leaderboard unavailable" fallback if the script errors or is slow.

Neither path ever blocks a frame or throws into gameplay.

**Runs on GitHub Pages.** Pages is static-only, which is exactly why the
datastore lives off-site (Apps Script). The game stays 100% client-side
files; only the browser talks to the `/exec` URL. There is no CSP meta tag
in the HTML and Pages sends no CSP header, so the cross-origin POST and the
injected JSONP script are not blocked. (If a CSP is ever added, it must
allow `connect-src`/`script-src` for `script.google.com` +
`script.googleusercontent.com` — noted, not needed now.) The only non-code
step is the one-time backend deploy below; until `endpoint` is set, the
code ships to Pages harmlessly inert.

## Backend: `tools/telemetry.gs`

Apps Script bound to a new Sheet:
- `doPost(e)` — parse `e.postData.contents`, append a row in column order,
  return `ContentService` text `ok`.
- `doGet(e)` — read wins, sort by `timeSec`, take top 10, return
  `e.parameter.cb + "(" + JSON.stringify(top) + ")"` as JavaScript for the
  JSONP callback.

Deploy steps (user, one-time): create Sheet → Extensions → Apps Script →
paste `telemetry.gs` → Deploy as Web App (execute as me, access: anyone) →
copy the `/exec` URL into `JH.TELEMETRY.endpoint` in `config.js`. Until that
URL is set, telemetry is inert and the game behaves exactly as today.

## Leaderboard UI

A new screen (`screen-leaderboard`) styled to match existing screens:
- Reachable from the **title screen** and shown as a panel on the **win
  screen**.
- Fetches top 10 fastest wins via JSONP on open; shows rank, handle, time,
  deaths. Loading + unavailable states handled.

## Testing

- **Unit (`npm test`, node --test):** `telemetry.js` uses the dual-export
  pattern (like `balance.js`). Tests inject a mock transport and assert the
  built record shape from a scripted sequence of hook calls (startRun →
  waveReached ×N → death → benediction/item → finishWin). No real network.
- **Headless (`headless-playtest` skill):** play a short run against a
  throwaway test endpoint (or a transport spy), assert hooks fire at the
  real sites and the POST payload matches the schema. Confirm blank handle
  ⇒ zero sends, and that a forced network failure never disturbs gameplay.

## Out of scope (YAGNI)

- No auth / anti-cheat beyond the honest `elapsed` clock. External
  playtest-scale data; a determined faker isn't the threat model.
- No server-side dedupe/rate-limit beyond what Apps Script gives for free.
- No historical backfill — data starts accumulating once deployed.

## Release

Follows the repo release ritual on merge to `main`: version bump +
`CHANGELOG.md` entry + titled merge. This is a **designed pass** with its own
spec, so it is a **minor** bump (0.28.0) with a patch name, per the
minor-vs-patch rule. Held uncommitted-to-main until the user playtests.
