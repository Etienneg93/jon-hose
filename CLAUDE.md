# CLAUDE.md — working notes for this repo

(Gitignored — local only.)

## Code-comment style

Keep **committed code comments to behavioral / mechanical facts**: coordinate
conventions, units, non-obvious mechanics, gotchas, and wiring notes. These
stay true regardless of where the design goes.

**Do not bake evolving design canon, lore, or narrative into source comments.**
Things like "one entity that keeps rebuilding", "the escalated return of X",
boss backstory, or which fight is "the finale" go stale the moment the idea
shifts, and then they have to be hunted down and scrubbed.

- Put design intent / "why" / lore in **commit messages** (captured, searchable,
  doesn't rot in the file) and in the **local planning docs**.
- Prefer short comments. When in doubt, describe what the code *does*, not what
  the story *means*.

## Art pipeline

Boss/character art is **procedural placeholder** scaffolding (the `Assets`
painters), to be replaced by consistent animated pixel-art sprite sheets as we
go — high-value characters first (bosses, Jon). The painters are the documented
swap point, so:

- Treat procedural painters as disposable; keep their comments minimal.
- Don't over-describe placeholder art that's going to be replaced.
