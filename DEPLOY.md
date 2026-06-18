# Deploying Jon Hose

Jon Hose is a static site (HTML/CSS/JS + one mp3). It ships to a free, always-on
URL via **GitHub Pages**, auto-built on every `git push`. A build step stamps a
cache-busting version onto the JS/CSS so friends always get your latest code
instead of a stale cached copy. Cloudflare Pages works off the same repo too.

> Run all `git` commands **on your own machine** (not from any cloud/agent shell)
> so the real, fully-synced files get committed.

---

## Local iteration (no deploy)

```bash
npm run dev      # serves the folder at http://localhost:5173  (edit + refresh)
```

`npm run dev` uses a throwaway static server (handy for testing on your phone over
LAN too). You can also just double-click `index.html` — it runs straight off disk.
The bottom-right tag shows `build dev` locally.

Want to preview exactly what gets deployed (with cache-busting applied)?

```bash
npm run build    # writes ./dist
npm run preview  # builds, then serves ./dist at http://localhost:5174
```

---

## One-time setup → GitHub Pages

You need a GitHub account and `git`. The deploy workflow is already in
`.github/workflows/deploy.yml`.

**Option A — GitHub CLI (fastest):**

```bash
cd "<this folder>"
git init -b main
git add -A
git commit -m "Jon Hose: initial public build"
gh repo create jon-hose --public --source=. --push
```

**Option B — manual:** create an empty repo named `jon-hose` on github.com, then:

```bash
cd "<this folder>"
git init -b main
git add -A
git commit -m "Jon Hose: initial public build"
git remote add origin https://github.com/<you>/jon-hose.git
git push -u origin main
```

**Then enable Pages once:** repo **Settings → Pages → Build and deployment →
Source: “GitHub Actions”**. (No branch to pick — the workflow handles it.)

The **Actions** tab will run “Deploy Jon Hose to GitHub Pages”. When it's green your
link is:

```
https://<your-username>.github.io/jon-hose/
```

Send that to your friends. 🎮

---

## The iteration loop (after setup)

```bash
# edit files…
git add -A && git commit -m "tune boss windup" && git push
```

~30–60s later it's live. Cache-busting means a normal reload gets the new build —
no hard-refresh needed. Confirm everyone's current via the **`build <sha>`** tag in
the bottom-right corner (it matches the commit SHA you pushed).

---

## Alternative — Cloudflare Pages

Connect the same GitHub repo in the Cloudflare dashboard, then set:

- **Framework preset:** None
- **Build command:** `node tools/build.mjs`
- **Build output directory:** `dist`

Auto-deploys on push, gives a `*.pages.dev` URL, and custom domains are one click.

---

## Notes

- **Subpath-safe.** All asset paths are relative, so it works at
  `…github.io/jon-hose/` without any base-path config.
- **`dist/` is git-ignored** — CI rebuilds it; never commit it.
- **OneDrive + git:** a `.git` folder inside your synced OneDrive directory works,
  but OneDrive may churn syncing it. Optional: exclude this folder from OneDrive, or
  `git clone` to a non-synced path for git work. Editing either copy is fine.
- **Swapping the music:** the mp3 is referenced from `assets.js`, not query-stamped.
  If you replace the track, rename the file (e.g. `jon-hose-rush-v2.mp3`) and update
  the path in `assets.js` so caches pick it up.
