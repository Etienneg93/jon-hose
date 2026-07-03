# Patch Notes

Release ritual: every merge to main bumps `package.json`, adds an entry here,
and the merge commit is titled `release: v{version} - {Patch Name}` — the name
comes from the branch's main addition. The deployed build tag shows
`v{version} · {sha}`.

---

## v0.25.0 — Juice Pass (2026-07-03)

The game-feel release: how hits read, how kills land, how the street sounds.

### Game feel — the Juice Pass
- Enemies now show damage as a **blue wetness soak** that builds with spray and
  drips off — no more white flash or squash throbbing on enemies.
- Kills confirm with a **150ms corpse collapse** — the body flattens to the
  ground and the particle burst pops as it lands.
- **Zero freezes in normal combat.** Hit-stop is reserved for boss-scale beats
  only; at hose kill density freezes read as lag, not impact.
- **Trauma-based directional screenshake** — hits kick the camera away from
  the impact; heavy moments stack shake instead of freezing the game.
- **GUSH combo overhaul:** x3 arms a water-regen window; every 5th milestone
  scales regen further **without cap** (x20 = 32 water/s) plus a water refund.
  Kill blips climb a pitch ladder as the combo grows.
- **Buffs stack, never overwrite:** kibble extends its own timer, and active
  buffs show as layered silhouette auras (green kibble ring outside the blue
  gush ring). HP/water bars run a traveling wave while boosted regen is live.
- **Independent Sound Effects channel** with its own slider — music mute no
  longer kills SFX; coin showers no longer chord-blast; dash got a real whoosh.
- **Burn damage ticks in half-second beats** (flash pulse + ember puff per
  tick) instead of a silent drain — and burning never squashes Jon.

### Input & movement
- **130ms input buffer** for dash/confirm — presses are no longer eaten during
  freezes and cooldown edges. Dash with no direction held goes toward facing.
- **Player-enemy body collision removed:** enemies can't corner-pin Jon, and
  dash phases through crowds instead of shoving them.

### Fire & hazard readability
- Every damaging ground zone now hits **exactly the ellipse it draws** (rim =
  hitbox): fire patches, fire rings, furnace vents, smelt smashes, fuse drops,
  Slayer slam, Quake leap.
- Burn stacks have i-frames like hits — overlapping fire can't insta-stack —
  with a sizzle cue on first contact.

### Shop & street
- The shopkeeper got a real sprite and a **full stall with runtime signage**,
  and he turns his head to watch Jon walk past.
- GUSH readout signals the live regen window.
- Pressure Charge delisted from the shop until its buff actually works.

### Art
- New Jon walk/idle/fire sprites (hose fixed in the walk cycle).
- New Father Jon face — portrait and in-world nave sprite.

### Fixes
- Boss deaths no longer flash the sprite back after the fade-out (and adds
  killed by the boss's death no longer linger frozen through the sequence).
- Pyro embers no longer bounce off an invisible line at the edge of the
  walkable band; Slayer fireballs fly dead straight off the cue.
- Stalkers no longer strobe left/right when they reach Jon.
- Slayer's intro banner shows the right name.

### Build & docs
- **Sprite URLs are cache-busted on deploys** — art updates now land without a
  hard refresh (JS/CSS already were).
- README brought up to date (5 acts, 5 bosses, church loop, audio channels);
  all plan docs carry STATUS banners; the idea-spec backlog lives in
  `docs/superpowers/plans/ideas/`.

---

## Earlier

- **v0.20.0 — The Fire World** (2026-07-02): next-level-pass — 29-wave 4-4-5-6-6
  street, the Boiler District + The Slayer, Smelt/Fuse/Furnace enemies, enemy
  variety pass, itch.io FX pack across 8 surfaces. (Walked back from a
  premature v1.0.0 call.)
- **v0.14.0** (2026-06-30): player death/ghost rework, Church polish, combat fixes.
- **v0.12.1** (2026-06-30): asset preloader gate + Father Jon talking portrait.
- **v0.12.0 — Church of the Holy Hose** (2026-06-30): the death-loop interlude,
  new Jon art, balance pass.
