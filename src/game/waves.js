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
import { randInt } from '../engine/rng.js';
import { trainSkill, GATHERING_SKILLS } from './skills.js';
import { addLog } from './state.js';

export const WAVES_PER_POI = 10;
export const MIN_MONSTERS_PER_WAVE = 1;
export const MAX_MONSTERS_PER_WAVE = 3;

// Used by the offline simulation, which has a kill count but no per-wave rolls.
export const AVG_MONSTERS_PER_WAVE = Math.round((MIN_MONSTERS_PER_WAVE + MAX_MONSTERS_PER_WAVE) / 2);

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

// Rolls the next wave's size if the current one is spent. Called by spawnMonster
// before every spawn, so `waveMonstersLeft` is always the number of monsters
// still standing in the current wave (including the one about to appear).
export function beginWaveIfNeeded(state) {
  const p = state.progress;
  if (p.waveMonstersLeft > 0) return;
  p.waveMonstersLeft = randInt(MIN_MONSTERS_PER_WAVE, MAX_MONSTERS_PER_WAVE);
  const count = p.waveMonstersLeft;
  addLog(state, `Wave ${p.wave}/${WAVES_PER_POI} — ${count} ${count === 1 ? 'foe closes' : 'foes close'} in.`, 'dim');
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
