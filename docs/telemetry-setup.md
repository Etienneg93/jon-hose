# Telemetry / Leaderboard — backend setup (one-time)

1. Create a new Google Sheet (any name).
2. Extensions → Apps Script. Delete the stub, paste `tools/telemetry.gs`, Save.
3. Deploy → New deployment → gear ⚙ → **Web app**.
   - Description: "jon-hose telemetry"
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Deploy → authorize when prompted → copy the **Web app URL** (ends `/exec`).
4. Paste that URL into `JH.TELEMETRY.endpoint` in `js/config.js`, commit, deploy.
5. Reload the Sheet once — a **Telemetry** menu appears (from `onOpen`).

## Reading the data
- **Raw log:** the `runs` tab — one row per run.
- **Death-rate matrix:** Telemetry menu → **Rebuild matrix** → writes/refreshes
  the `matrix` tab (`wave, reached, deaths, deathRate`). Re-run to refresh.
- **Leaderboard:** the game reads top-10 fastest wins live via the same URL; to
  eyeball it, sort `runs` by `timeSec` ascending, filtered to `outcome = win`.

## Changing the deployment
Re-deploy as a **new version** of the SAME deployment so the `/exec` URL is
stable. A brand-new deployment mints a new URL and would need a config update.

## Privacy
Only what the client sends (handle + gameplay stats) is stored. A blank handle
means the client sends nothing at all.
