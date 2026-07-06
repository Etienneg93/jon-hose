---
name: release
description: Ship jon-hose changes to main as a named release — version bump, CHANGELOG entry, titled merge commit. Use whenever merging anything to main (the user says "push this", "commit as X", "release"). Main deploys live to external playtesters.
---

# Release ritual (jon-hose)

Every merge to main is a **named release** (user rule, 2026-07-03). Main
auto-deploys to GitHub Pages where external playtesters play; the build
tag shows `v{version} · {sha}` from package.json.

## Pre-flight

1. The user has playtested (or explicitly said push). Gameplay changes are
   NEVER released on code-correctness alone.
2. `npm test` passes at the tip being merged.
3. You're on the working branch (historically `progression-pass`; new
   passes branch off main).

## Pick the version — the calibration that got corrected once already

- **Patch (0.X.Y+1)**: live-playtest follow-up rounds, fixes, tuning —
  even when they add real mechanics (the Reliquary was a patch). Rule of
  thumb: if the work exists to support/fix the last minor's live playtest,
  it's a patch on that minor.
- **Minor (0.X+1.0)**: ONLY a full designed pass with its own
  brainstorm/spec ("Juice Pass", "The Giants", "Benedictions").
- The user renumbered prefired v0.28.0/v0.29.0 down to v0.27.1/.2 — when
  in doubt, patch.

## The three parts (same merge, no exceptions)

1. `package.json` version bump.
2. `CHANGELOG.md` entry at the top: `## v{X} — {Patch Name} (YYYY-MM-DD)`,
   grouped by area, covering everything since the last release.
3. Merge commit (or tip commit) titled `release: v{X} - {Patch Name}` with
   the summary in the body. The Patch Name derives from the round's main
   addition and enjoys a pun ("Bake Sale", "Fire Code", "Legible Liturgy",
   "Shield Inspection").

## Sequence

```
sed -i 's/"version": "OLD"/"version": "NEW"/' package.json
# edit CHANGELOG.md
npm test                                # must pass
git add -u && git commit -m "release: vNEW - Name ..."   # on working branch
git push
git checkout main && git merge <branch> && git push
git checkout <branch> && git merge main && git push      # re-sync
```

Commits end with:
`Co-Authored-By: <the assisting model's attribution line>`

## Hard rules

- **Never force-push main** (even `--force-with-lease`, even to fix a
  ritual-shape mistake). If the merge fast-forwarded and the tip lacks the
  release title, add an **empty release-marker commit**
  (`git commit --allow-empty -m "release: ..."`) instead.
- Don't let the version drift: it once sat at 0.20.0 across five
  milestones; v0.25.0 was the catch-up.
- After release, update the local memory index (release name, main sha,
  what shipped) so the next session resumes cleanly.
