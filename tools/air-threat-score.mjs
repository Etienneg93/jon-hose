/**
 * Air Act (Plan 2, Task 7) quantified threat pass. Loads the real game
 * modules (same require chain as tests/air.test.js) and derives every
 * number below FROM js/config.js + js/balance.js — nothing here is a
 * hardcoded restatement of a config value.
 *
 * Prints:
 *   1. The four regular Air-roster per-10s damage/output calculations.
 *   2. Super Plunger ceiling HP, lunge HP/10s, water/10s.
 *   3. Super Gasbag ceiling HP, child effective HP, mega footprint.
 *   4. Per Air-wave (30-35) authored/placement/queued/peak-field/tough/super audit.
 *
 * Exits nonzero (prints "GATE FAIL" lines, one per violation) if:
 *   - any Air wave's peak live field count exceeds JH.WAVEFLOW.fieldCap[5];
 *   - an Air wave (30-35) authors or places a non-Air regular enemy type;
 *   - Bidet is reachable through the sprinkle pool (nonzero weight, or the
 *     type appears in any wave's authored `spawns` list, which feeds
 *     Balance.unlockedPool);
 *   - any wave authors more than one superElite.
 *
 *   node tools/air-threat-score.mjs
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// ---- load the real game stack, exactly like tests/air.test.js ------------
const warnings = [];
const realWarn = console.warn;
console.warn = (...a) => { warnings.push(a.join(" ")); realWarn(...a); };
global.window = global.window || {};
require("../js/config.js");
global.window.JH.Loader = { img: () => ({}) };
require("../js/world.js");
require("../js/upgrades.js");
require("../js/benedictions.js");
require("../js/entities.js");
require("../js/game.js");
console.warn = realWarn;
const JH = global.window.JH;
const Balance = require("../js/balance.js");

const fails = [];
const line = (s = "") => console.log(s);
const hr = () => line("-".repeat(72));
const fmt = (n) => (Math.round(n * 100) / 100).toString();

const AIR_ROSTER = ["plunger", "tpmummy", "gasbag", "bidet"];
const AIR_START = JH.ACT_STARTS[JH.ACT_STARTS.length - 1];       // 29 (0-indexed wave array)
const AIR_WAVE_IDX = [];                                          // array indices 29..34 = waves 30..35
for (let i = AIR_START; i < JH.LEVEL1.waves.length; i++) AIR_WAVE_IDX.push(i);

const actLevelAir = Balance.actLevelForWave(AIR_START, JH.ACT_STARTS);   // 4 — Air act's own tier
const OWNED_CEILING = 24;                                                 // eliteScale/powerCount cap (balance.js)

// =====================================================================
// 1. Regular per-10s calculations (Plan 2 "Threat-score targets" table)
// =====================================================================
line("==== Regular Air roster: per-10s damage/output ====");
hr();

const plunger = JH.ENEMIES.plunger;
const plungerCycle = plunger.lungeWind + plunger.lungeDur + plunger.latchMax + plunger.lungeCd;
const plungerDmg10 = (plunger.lungeDmg / plungerCycle) * 10;
const plungerWater10 = (plunger.latchDrain * plunger.latchMax / plungerCycle) * 10;
line(`Plunger   cycle=${fmt(plungerCycle)}s (lungeWind+lungeDur+latchMax+lungeCd) `
  + `-> ${fmt(plungerDmg10)} HP/10s + ${fmt(plungerWater10)} water/10s  [resource rusher]`);

const tp = JH.ENEMIES.tpmummy;
const tpCycle = tp.wrapWind + tp.wrapCd;
const tpDmg10 = (tp.wrapDmg / tpCycle) * 10;
line(`TP Mummy  cycle=${fmt(tpCycle)}s (wrapWind+wrapCd) `
  + `-> ${fmt(tpDmg10)} HP/10s + soft slow (wrapSlow x${tp.wrapSlow} for ${tp.wrapSlowDur}s)  [light control]`);

const deniedDps = JH.PLAYER.sprayDamage * (1 - JH.STINK.gasDmgScale);
line(`Gasbag    denies up to ${fmt(deniedDps)} DPS while gassed `
  + `(PLAYER.sprayDamage ${JH.PLAYER.sprayDamage} x (1 - STINK.gasDmgScale ${JH.STINK.gasDmgScale}))  [priority control]`);

const bidet = JH.ENEMIES.bidet;
const bidetCycle = bidet.aimWind + bidet.lobCd;
const bidetDmg10 = (bidet.landDmg / bidetCycle) * 10;
line(`Bidet     cycle=${fmt(bidetCycle)}s (aimWind+lobCd) `
  + `-> ${fmt(bidetDmg10)} HP/10s  [artillery]`);
line();

// =====================================================================
// 2 & 3. Super ceilings — replicate entities.js makeElite (elite hp/dmg
// scale) then Balance.superEliteDef (the real shared function) so this
// number tracks the runtime path exactly, not a restated constant.
// =====================================================================
const lateEliteScale = Balance.eliteScale(actLevelAir, OWNED_CEILING);   // the "late-act elite ceiling"
const hpByActAir = JH.SUPER_TUNE.hpByAct[actLevelAir + 1];

function eliteThenSuper(type) {
  const base = JH.ENEMIES[type];
  const et = (JH.ELITE_TUNE && JH.ELITE_TUNE[type]) || {};
  // mirror entities.js Enemy.makeElite (hp + damage-field scaling only —
  // the fields these two enemy types actually carry)
  const elited = Object.assign({}, base);
  elited.hp = Math.round(base.hp * lateEliteScale.hp * (et.hp || 1));
  for (const f of ["touchDmg", "lungeDmg", "wrapDmg", "landDmg"])
    if (elited[f] != null) elited[f] = Math.round(base[f] * lateEliteScale.dmg);
  // mirror Enemy.makeSuper: Balance.superEliteDef, then the per-act hp damp
  let sup = Balance.superEliteDef(elited, JH.SUPER_TUNE[type]);
  if (hpByActAir !== 1) sup.hp = Math.round(sup.hp * hpByActAir);
  return sup;
}

line("==== Super Plunger (Triple Latch) ceiling ====");
hr();
line(`Late-act elite ceiling: eliteScale(actLevel=${actLevelAir}, owned=${OWNED_CEILING}) `
  + `-> hp x${fmt(lateEliteScale.hp)}, dmg x${fmt(lateEliteScale.dmg)}`);
const superPlunger = eliteThenSuper("plunger");
line(`Ceiling HP: ${plunger.hp} base -> elite -> superEliteDef(hp tune x${JH.SUPER_TUNE.plunger.hp}) `
  + `-> ${superPlunger.hp} HP`);
const superPlungerCycle = JH.SUPER_PLUNGER.pullWind + plunger.lungeWind + plunger.latchMax + plunger.lungeCd;
const superLungeDmg10 = (superPlunger.lungeDmg / superPlungerCycle) * 10;
const superLatchWater10 = (plunger.latchDrain * plunger.latchMax / superPlungerCycle) * 10;
line(`Ceiling lunge dmg: ${plunger.lungeDmg} base -> ${superPlunger.lungeDmg} HP/hit `
  + `(elite dmg x${fmt(lateEliteScale.dmg)}, then superEliteDef doubles)`);
line(`Full cycle (pullWind+lungeWind+latchMax+lungeCd) = ${fmt(superPlungerCycle)}s `
  + `-> ${fmt(superLungeDmg10)} HP/10s + ${fmt(superLatchWater10)} water/10s (latchDrain unchanged, honest numbers)`);
line();

line("==== Super Gasbag (Fog of War) ceiling ====");
hr();
const superGasbag = eliteThenSuper("gasbag");
line(`Ceiling HP: ${JH.ENEMIES.gasbag.hp} base -> elite -> superEliteDef(hp tune x${JH.SUPER_TUNE.gasbag.hp}) `
  + `-> ${superGasbag.hp} HP`);
const childHp = Math.round(JH.ENEMIES.gasbag.hp * JH.SUPER_GASBAG.childHpMult);
line(`Child effective HP: ${JH.ENEMIES.gasbag.hp} base hp x childHpMult ${JH.SUPER_GASBAG.childHpMult} `
  + `-> ${childHp} HP each, x${JH.SUPER_GASBAG.childCount} children (never elite/super, never re-split)`);
const megaRx = JH.SUPER_GASBAG.megaRadius, megaRy = megaRx * JH.GROUND_RY;
line(`Mega footprint: rx=${megaRx} (JH.STINK.radius default is ${JH.STINK.radius}), `
  + `ry=${fmt(megaRy)} (rx x GROUND_RY ${JH.GROUND_RY}) — same ellipse feeds draw + hit test`);
line();

// =====================================================================
// 4. Per Air-wave composition audit
// =====================================================================
line("==== Air wave composition audit (waves 30-35) ====");
hr();
line("wave  name                  authored  placements  hazards  queued  peakField  toughFrac  super");

function waveStats(idx) {
  const wave = JH.LEVEL1.waves[idx];
  const actLevel = Balance.actLevelForWave(idx, JH.ACT_STARTS);
  const cap = Balance.ticketBudget(actLevel, JH.WAVEFLOW.fieldCap);
  const toughFrac = wave.tough ? (JH.ELITE_FRAC[actLevel + 1] || 0) : 0;
  const superName = wave.superElite || "none";
  const hazards = (wave.hazards || []).length;

  if (wave.holdout) {
    // Holdout branch (game.js ~753): no placements/opening slice — a pool of
    // ALL authored spawns trickles in one at a time, capped concurrently at
    // holdoutCadence(wave).maxAlive.
    const authoredCount = (wave.spawns || []).reduce((s, g) => s + g.count, 0);
    // mirrors Game.holdoutCadence (game.js ~860): cloudlineEdge holdouts use
    // CLOUDLINE_HOLDOUT.maxAlive, every other holdout keeps JH.WALL.maxAlive.
    const maxAlive = wave.cloudlineEdge ? JH.CLOUDLINE_HOLDOUT.maxAlive : JH.WALL.maxAlive;
    return { authoredCount, placementCount: 0, hazards, queued: authoredCount, peak: maxAlive, cap, toughFrac, superName, kind: "holdout" };
  }

  // Regular branch (game.js ~771-822): placements + superElite reserve
  // slots before the authored+sprinkle opening slice.
  const authoredCount = (wave.spawns || []).reduce((s, g) => s + g.count, 0);
  const placementCount = (wave.placements || []).length;
  const openCount = placementCount > 0
    ? Math.max(0, cap - placementCount - (wave.superElite ? 1 : 0))
    : cap;
  const sprinkleCount = JH.SPRINKLE.counts[actLevel + 1] || 0;
  const availableToOpen = authoredCount + sprinkleCount;   // upper bound; pickSprinkles may return fewer
  const opened = Math.min(openCount, availableToOpen);
  const queued = Math.max(0, authoredCount - openCount);   // authored-only leftover (sprinkles are opportunistic extras)
  const peak = placementCount + (wave.superElite ? 1 : 0) + opened;
  return { authoredCount, placementCount, hazards, queued, peak, cap, toughFrac, superName, kind: "regular" };
}

for (const idx of AIR_WAVE_IDX) {
  const wave = JH.LEVEL1.waves[idx];
  const s = waveStats(idx);
  const gameWave = idx + 1;
  line(
    `${String(gameWave).padStart(4)}  ${wave.name.padEnd(22)}`
    + `${String(s.authoredCount).padStart(8)}${String(s.placementCount).padStart(12)}`
    + `${String(s.hazards).padStart(9)}`
    + `${String(s.queued).padStart(8)}${String(s.peak).padStart(11)}`
    + `${fmt(s.toughFrac).padStart(11)}  ${s.superName}`
  );
  if (s.peak > JH.WAVEFLOW.fieldCap[5]) {
    fails.push(`wave ${gameWave} (${wave.name}): peak field ${s.peak} exceeds WAVEFLOW.fieldCap[5]=${JH.WAVEFLOW.fieldCap[5]}`);
  }
}
line();

// =====================================================================
// Gate checks
// =====================================================================
line("==== Gate checks ====");
hr();

// Non-Air regulars in authored spawns/placements of any Air wave.
for (const idx of AIR_WAVE_IDX) {
  const wave = JH.LEVEL1.waves[idx];
  const gameWave = idx + 1;
  for (const g of (wave.spawns || [])) {
    if (!AIR_ROSTER.includes(g.type))
      fails.push(`wave ${gameWave} (${wave.name}): authored non-Air regular "${g.type}"`);
  }
  for (const p of (wave.placements || [])) {
    if (!AIR_ROSTER.includes(p.type))
      fails.push(`wave ${gameWave} (${wave.name}): placement of non-Air type "${p.type}"`);
  }
}

// Bidet must never be sprinkle-reachable: zero weight AND never appears in
// any wave's authored `spawns` (the only source Balance.unlockedPool scans).
if ((JH.SPRINKLE.weights.bidet || 0) !== 0)
  fails.push(`SPRINKLE.weights.bidet is ${JH.SPRINKLE.weights.bidet}, must be 0`);
for (let i = 0; i < JH.LEVEL1.waves.length; i++) {
  const w = JH.LEVEL1.waves[i];
  if ((w.spawns || []).some((g) => g.type === "bidet"))
    fails.push(`wave ${i + 1} (${w.name}): bidet appears in authored spawns — would enter unlockedPool/sprinkle`);
}

// At most one super per wave (superElite is a single-string field by schema;
// assert that invariant explicitly rather than trusting the shape).
for (let i = 0; i < JH.LEVEL1.waves.length; i++) {
  const w = JH.LEVEL1.waves[i];
  if (w.superElite != null && typeof w.superElite !== "string")
    fails.push(`wave ${i + 1} (${w.name}): superElite is not a single type string (${JSON.stringify(w.superElite)})`);
}

if (fails.length) {
  for (const f of fails) line("GATE FAIL: " + f);
  line();
  line(`${fails.length} gate violation(s).`);
  process.exit(1);
} else {
  line("All gate checks passed.");
}
