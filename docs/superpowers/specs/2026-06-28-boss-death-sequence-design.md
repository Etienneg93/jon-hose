# Boss Death Sequence — Design Spec
_Date: 2026-06-28_

## Problem

Boss kills currently have no weight: no pause, no dedicated SFX moment, the game
resumes immediately as the `"BOSS DOWN!"` banner flashes up. The banner is
meaningless because there's nothing to punctuate.

## Out of scope

- Area Clear banner restyling (not requested).
- New audio assets — uses existing `"win"` SFX already called in each boss `die()`.
- QuakeBoss / Quake Walker: friendly boss that joins the player rather than dying.
  His `die()` is a conversion cutscene, not a defeat. **No death sequence for him.**
- Boss pattern variety / phase changes (separate design item from playtest notes).

## Solution

### 1. Remove Kibble Regen banner

Delete `game.banner("KIBBLE REGEN!", 1.6)` from `js/entities.js:1031`.
The particle burst on purchase stays; only the text announcement goes.

### 2. New game state: `"bossDeathSeq"`

When a hostile boss's HP hits 0, instead of immediately calling
`game.onEnemyKilled()`, the boss enters a 1.5 s freeze sequence.

**Affected boss classes** (all in `js/entities.js`):
- `Boss` (base class)
- `SwitchBoss`
- `GatewayKrusherBoss`
- `WallBoss`

**Not affected:** `QuakeBoss` — its `die()` is already wired to a conversion
cutscene and must remain unchanged.

---

### Animation timeline

| Window | What happens |
|--------|-------------|
| 0 s | `"win"` SFX fires (already in each boss `die()`). Light `shake(6)`. |
| 0 – 0.6 s | White flash **strobe** over boss body (~12 Hz). Existing `setTimeout` burst cascades from `die()` fire naturally during this window. |
| 0.6 – 1.0 s | Flash fades out. Boss dims (alpha decreasing). |
| 1.0 – 1.5 s | Boss fully transparent. Final shake pulse. |
| 1.5 s | `boss.dead = true`, `boss.dying = false`, state → `"play"`, `game.onEnemyKilled(boss)` fires → wave clears → `"BOSS DOWN!"` banner. |

---

### Entity changes — `js/entities.js`

Each affected boss's `die()` gets two edits:

```js
die(game) {
  if (this.dead || this.dying) return;   // add || this.dying
  this.dying = true;                     // add this line
  // ... existing code unchanged: audio, goon-kill, setTimeout bursts, coin fountain ...
  game.startBossDeathSeq(this);          // replace game.onEnemyKilled(this)
}
```

No constructor changes needed — `this.dying` defaults to `undefined` (falsy).

---

### Game changes — `js/game.js`

#### New init fields

```js
dyingBoss: null,
deathSeqT: 0,
```

#### New method: `startBossDeathSeq(boss)`

```js
startBossDeathSeq(boss) {
  this.state = "bossDeathSeq";
  this.dyingBoss = boss;
  this.deathSeqT = 0;
  this.shake(6);
},
```

Audio already plays inside the boss's `die()` before this is called. The initial
shake is added here because only WallBoss currently calls `shake()` in `die()`;
the other three don't.

#### New method: `updateBossDeathSeq(dt)`

```js
updateBossDeathSeq(dt) {
  const t = (this.deathSeqT += dt);
  if (t >= 1.2 && t - dt < 1.2) this.shake(10);  // late shake pulse
  if (t >= 1.5) {
    const boss = this.dyingBoss;
    boss.dead = true;
    boss.dying = false;
    this.dyingBoss = null;
    this.deathSeqT = 0;
    this.state = "play";
    this.onEnemyKilled(boss);
  }
},
```

#### Guard in `update(dt)`

After the existing `bannerTimer` / `shakeAmt` block, before the `devMenu` check:

```js
if (this.state === "bossDeathSeq") {
  this.particles = this.particles.filter((p) => p.update(dt));
  this.embers   = this.embers.filter((p) => p.update(dt, this));
  this.updateBossDeathSeq(dt);
  return;
}
```

#### Flash overlay in `render()`

After the actors loop (line ~743), before `ctx.restore()`:

```js
if (this.state === "bossDeathSeq" && this.dyingBoss) {
  const boss = this.dyingBoss;
  const t    = this.deathSeqT;
  const sx   = Math.round(boss.x - JH.Camera.x);
  const sy   = Math.round(boss.y);
  const hw   = (boss.bodyW || 30) / 2 + 14;
  const hh   = (boss.bodyH || 40) + 14;

  // strobe phase
  let flashA = 0;
  if (t < 0.6)       flashA = Math.sin(t * Math.PI * 12) > 0 ? 0.85 : 0;
  else if (t < 1.0)  flashA = 1.0 - (t - 0.6) / 0.4;

  if (flashA > 0) {
    ctx.save();
    ctx.globalAlpha = flashA;
    ctx.fillStyle = "#fff";
    ctx.fillRect(sx - hw, sy - hh, hw * 2, hh);
    ctx.restore();
  }
}
```

**Boss fade (t > 1.0 s):** In the actor render loop (line ~743), wrap the dying
boss's `draw()` call:

```js
for (const e of actors) {
  if (!e.draw) continue;
  if (e.dying && this.deathSeqT > 1.0) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - (this.deathSeqT - 1.0) / 0.5);
    e.draw(ctx, cam);
    ctx.restore();
  } else {
    e.draw(ctx, cam);
  }
}
```

The white flash rectangle covers the boss at full opacity for t < 1.0, so the
fade only needs to look good in the final 0.5 s window.

#### Boss health bar

Skip the bar while the boss is dying:

```js
const boss = this.enemies.find((e) => e.isBoss && !e.dying);
if (boss) this.drawBossBar(ctx, boss);
```

---

## Files changed

| File | Change |
|------|--------|
| `js/entities.js` | Remove kibble banner (1 line). Edit `die()` on Boss, SwitchBoss, GatewayKrusherBoss, WallBoss (2 edits each). |
| `js/game.js` | Add init fields, `startBossDeathSeq`, `updateBossDeathSeq`, update guard, render overlay, boss-bar guard. |

## Acceptance criteria

- Killing a hostile boss: world freezes, white strobe fires for ~0.6 s, boss fades, `"BOSS DOWN!"` banner appears ~1.5 s after the kill hit.
- Player cannot be hurt during the sequence (update loop frozen).
- Quake Walker's conversion cutscene is unaffected.
- Kibble purchase shows particle burst only, no text banner.
- No console errors. No regression on normal enemy kills or wave transitions.
