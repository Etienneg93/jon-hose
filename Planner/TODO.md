# Jon Hose — TODO / desk-session backlog

(Local only — `Planner/` is gitignored. Reconcile with the real desk copy.)

Deferred items accumulated during the wall-boss / lineage ideas session.

## Gameplay / wiring
- [ ] **Wire The Firewall into `JH.LEVEL1.waves`** — currently standalone
      (dev-menu only). Decide slot (proposed: rebuild #2, Act 3/4, between the
      Switch and Gateway Krusher). ⚠️ MUST also add a matching `WAVE_TRIGGERS`
      entry in `js/game.js` or progression breaks (there's a length-invariant
      `console.warn` guarding this).
- [ ] **Firewall moveset decision** — does it need to carry forward the
      Switch's line/whip attacks (mechanical continuity, "same entity") beyond
      the existing slam? Currently it's armored-weak-spot + PORT SLAM + SURGE.
      User leaning: a slam reads as a good callback (Piston/SURGE already exists).
- [ ] **Telegraph readability pass** — in-fight dodge-hint banners were removed
      (jump the surge / back off the slab / dash the quake). Confirm each boss's
      dodge is graspable from the flashing telegraph alone, no text.
- [ ] **Decide on death-beat / victory banners** — in-fight banners were cut,
      but "…THE CORE SURVIVES" and "CORE DESTROYED!" were kept as victory beats.
      Keep or remove?

## Lineage (Switch of Doom → Firewall → Gateway Krusher 9000)
- [ ] **Escalating-designation naming** — left unpicked. Tie the three forms'
      names together to show progression (shared Mk./version designation), or
      leave distinct? (Names are already all networking terms: switch/firewall/
      gateway.)
- [ ] **Surviving-core death beat polish** — the escaping `BossCore` skitter/
      bounce/fade is a rough first pass; animate properly at the desk.
- [ ] **Reconcile README + lore** once the lineage is canon and the Firewall's
      slot/naming settle. `README.md` still frames the bosses as separate.

## Art overhaul (procedural placeholders → animated pixel-art sprites)
- [ ] **Replace procedural painters with real sprite sheets**, high-value chars
      first (bosses, Jon). Painters are the documented swap point (`js/assets.js`);
      see the `neighbor` painter for the image-blit + procedural-fallback pattern.
- [ ] **Shared red core motif** — currently overlaid on the Switch (green-tech
      palette, slight clash) and Gateway (already red-eyed face, a bit
      redundant). During the art pass, decide whether the core replaces existing
      elements per form rather than sitting on top.
- [ ] **Tint the Firewall's SURGE shockwave** electric-cyan/green to push the
      network read. Currently reuses the amber Quake-Walker wave; needs the
      `Shockwave` color parameterized (shared class — don't recolor Quake's).

## Housekeeping
- [ ] **Boss identity is spread across 4 files** (name / type string / class /
      asset key / `gk*`+`wallboss*` palette keys in config, assets, entities,
      game). Each rename is a coordinated multi-file edit. Consider centralizing
      a boss's identity if more renames/forms are coming.
- [ ] **`CLAUDE.md`** — created in this environment (gitignored) with the
      comment-style rule + art-pipeline note. Mirror into the real desk copy.

## Done this session (for reference)
- Firewall (wall boss): armored body, roaming + periodically-opening red-core
  weak spot, PORT SLAM + SURGE attacks, security-daemon summons. Standalone.
- GK9000 → Gateway Krusher 9000 (full rename, display + internals).
- Boss lineage: shared red core glyph + surviving-core death beat (cosmetic).
- Trimmed evolving lore out of code comments → mechanics-only.
- Removed in-fight banner pop-ups across bosses.
- Removed the Firewall's green lane marking (red core is telling enough).
