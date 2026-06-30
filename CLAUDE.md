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

## Canvas resolution — don't undersize generated art

`JH.VIEW_W`/`JH.VIEW_H` (480×270) and per-entity target heights (e.g.
`JON_H = 53` in assets.js) are **logical coordinate units**, not the actual
output resolution. `fitCanvas()` (main.js) sizes the real canvas buffer to
`offsetWidth/Height * devicePixelRatio` and uses `ctx.setTransform` to map
the 480×270 logical space onto it — confirmed by measurement: at a real
1920×1080 viewport the buffer is genuinely 1920×1080, and a "53 logical px"
entity like Jon renders at ~212 real device pixels tall, not 53.

When sizing source art to generate, size it for the real on-screen
device-pixel footprint (roughly **4x+ the logical target at 1080p**, more on
higher-DPI/4K screens) — not the logical number itself. Reading `JON_H = 53`
and generating a ~50px sprite undersizes it by ~4x.
