// Waves: how a Point of Interest is actually fought. Every POI runs
// WAVES_PER_POI waves of 1-3 monsters, fought one at a time. Clearing the last
// wave is a "full clear": it pays out the POI's assigned gathering material,
// trains that gathering skill, and resets to wave 1 so the POI can be farmed
// again. That payout — one material per clear, times whatever multipliers you've
// built up — is the reason to farm one dungeon over another.
//
// Difficulty comes from the wave number rather than the old time-in-POI depth:
// wave 1 is the POI's baseline and each wave adds WAVE_DIFFICULTY_PER_WAVE to
// the monster stat multiplier (and to loot power — see game/loot.js).
//
// Wave state lives on state.progress (`wave`, `waveMonstersLeft`) and is reset
// whenever the hero moves to a different POI (see game/travel.js).

import { getMaterial } from '../data/materials.js';
import { buildingBonus } from '../data/buildings.js';
import { trainSkill, GATHERING_SKILLS } from './skills.js';
import { addLog } from './state.js';

export const WAVES_PER_POI = 10;

// How many things can be on you at once. One is the norm and stays the norm
// almost everywhere; eight is what the Direlands does to people. A wave's whole
// group engages together, so this is the swarm size, not a queue length.
export const MAX_SWARM = 8;
const SWARM_SKEW = 2.5; // >1 bends the roll hard toward small groups

// The largest group this region will throw at a given wave. Wave 1 is always a
// single monster wherever you are; the region's own ceiling is only reached on
// the last wave, so a place gets more dangerous the deeper into it you get.
export function swarmCap(regionSwarmMax, wave) {
  const cap = Math.max(1, Math.min(MAX_SWARM, regionSwarmMax || 1));
  const through = (Math.max(1, Math.min(WAVES_PER_POI, wave)) - 1) / (WAVES_PER_POI - 1);
  return Math.max(1, Math.round(1 + through * (cap - 1)));
}

// Rolls an actual group size within that ceiling, skewed so that even where a
// pack of eight is possible, most waves are still one or two.
export function rollSwarmSize(regionSwarmMax, wave) {
  const cap = swarmCap(regionSwarmMax, wave);
  const roll = Math.pow(Math.random(), SWARM_SKEW);
  return Math.max(1, Math.min(cap, 1 + Math.floor(roll * cap)));
}

// Used by the offline simulation, which has a kill count but no per-wave rolls.
// The skew keeps real groups small, so two is a fair stand-in across a session.
export const AVG_MONSTERS_PER_WAVE = 2;

const WAVE_DIFFICULTY_PER_WAVE = 0.12;
const BASE_CLEAR_YIELD = 1; // one material per full clear before multipliers
const CLEAR_GATHER_XP = 45;

// Extra difficulty (as a fraction above the POI's baseline) at a given wave, so
// wave 1 is +0% and the final wave is +108%. Monster stats and loot power both
// multiply by 1 + this.
export function waveDifficulty(wave) {
  return (Math.max(1, wave) - 1) * WAVE_DIFFICULTY_PER_WAVE;
}

// How many of its material a full clear pays out right now.
export function clearYield(state) {
  const mult = 1 + buildingBonus(state, 'materialMult') / 100;
  return Math.max(1, Math.floor(BASE_CLEAR_YIELD * mult));
}

// Rolls the next wave's group if the current one is spent. `waveMonstersLeft` is
// the number still standing in this wave, which — since they all engage at once
// — is also how many are currently on you.
export function beginWaveIfNeeded(state, regionSwarmMax) {
  const p = state.progress;
  if (p.waveMonstersLeft > 0) return;
  p.waveMonstersLeft = rollSwarmSize(regionSwarmMax, p.wave);
  const count = p.waveMonstersLeft;
  addLog(
    state,
    count === 1
      ? `Wave ${p.wave}/${WAVES_PER_POI} — a foe closes in.`
      : `Wave ${p.wave}/${WAVES_PER_POI} — ${count} of them close in at once.`,
    count > 2 ? 'boss' : 'dim'
  );
}

// One kill's worth of wave progress. Advances the wave when its last monster
// falls, and completes a full clear after the last wave.
export function recordWaveKill(state, poi) {
  const p = state.progress;
  p.waveMonstersLeft = Math.max(0, p.waveMonstersLeft - 1);
  if (p.waveMonstersLeft > 0) return false;
  if (p.wave < WAVES_PER_POI) {
    p.wave += 1;
    return false;
  }
  p.wave = 1;
  completeClears(state, poi, 1);
  return true;
}

// Books `count` full clears of `poi` and pays out their materials in one lump —
// shared by live combat (count 1) and the offline simulation.
function completeClears(state, poi, count) {
  if (count <= 0) return;
  const p = state.progress;
  p.totalClears += count;
  p.poiClears[poi.id] = (p.poiClears[poi.id] || 0) + count;

  const gather = poi.gather;
  if (!gather) return;
  const amount = clearYield(state) * count;
  state.materials[gather.material] = (state.materials[gather.material] || 0) + amount;
  const material = getMaterial(gather.material);
  const name = material ? material.name : gather.material;
  addLog(
    state,
    count === 1
      ? `${poi.name} cleared! You haul away ${amount} ${name}.`
      : `${poi.name} cleared ${count} times over. You haul away ${amount} ${name}.`,
    'good'
  );
  const meta = GATHERING_SKILLS.find((g) => g.key === gather.skill);
  trainSkill(state, state.hero.skills.gathering[gather.skill], meta ? meta.label : gather.skill, CLEAR_GATHER_XP * count);
}

// Offline equivalent of running `kills` monsters through the wave machine: waves
// are assumed to be AVG_MONSTERS_PER_WAVE long (no per-wave roll to make), and
// all the clears earned are paid out in one batch instead of one log line each.
export function simulateWaveKills(state, poi, kills) {
  const p = state.progress;
  let clears = 0;
  for (let i = 0; i < kills; i++) {
    if (p.waveMonstersLeft <= 0) p.waveMonstersLeft = AVG_MONSTERS_PER_WAVE;
    p.waveMonstersLeft -= 1;
    if (p.waveMonstersLeft > 0) continue;
    if (p.wave < WAVES_PER_POI) {
      p.wave += 1;
    } else {
      p.wave = 1;
      clears += 1;
    }
  }
  completeClears(state, poi, clears);
  return clears;
}
