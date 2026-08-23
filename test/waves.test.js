import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { tickCombat } from '../src/game/combat.js';
import { POIS, getPoiById, isSite } from '../src/data/regions.js';
import { GATHER_MATERIAL_POOLS, getMaterial } from '../src/data/materials.js';
import { GATHERING_SKILLS } from '../src/game/skills.js';
import { WAVES_PER_POI, waveDifficulty, clearYield, simulateWaveKills } from '../src/game/waves.js';
import { startTravelToPoi } from '../src/game/travel.js';

function atPoi(poiId) {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId };
  // Strong enough to shred every wave inside a short test run.
  s.hero.str = 500;
  s.hero.end = 500;
  s.hero.skills.offense.unarmed.rank = 100;
  return s;
}

test('every hunting POI names a gathering material from its own skill pool', () => {
  for (const poi of POIS) {
    if (isSite(poi)) continue;
    assert.ok(poi.gather, `${poi.id} has no gather assignment`);
    const pool = GATHER_MATERIAL_POOLS[poi.gather.skill];
    assert.ok(pool, `${poi.id} names an unknown gathering skill: ${poi.gather.skill}`);
    assert.ok(pool.includes(poi.gather.material), `${poi.id} yields ${poi.gather.material}, which isn't in the ${poi.gather.skill} pool`);
    assert.ok(getMaterial(poi.gather.material), `${poi.id} yields an unknown material`);
    assert.ok(GATHERING_SKILLS.some((g) => g.key === poi.gather.skill));
  }
});

test('waveDifficulty is flat on wave 1 and rises every wave after', () => {
  assert.equal(waveDifficulty(1), 0);
  for (let w = 2; w <= WAVES_PER_POI; w++) {
    assert.ok(waveDifficulty(w) > waveDifficulty(w - 1));
  }
});

test('clearing all ten waves yields the POI\'s material and trains its gathering skill', () => {
  const s = atPoi('drudge-hideout');
  const poi = getPoiById('drudge-hideout');

  for (let i = 0; i < 4000 && s.progress.totalClears === 0; i++) tickCombat(s, 0.25);

  assert.equal(s.progress.totalClears, 1);
  assert.equal(s.progress.poiClears['drudge-hideout'], 1);
  assert.equal(s.materials[poi.gather.material], clearYield(s));
  const skill = s.hero.skills.gathering[poi.gather.skill];
  assert.ok(skill.xp > 0 || skill.rank > 0);
  assert.equal(s.progress.wave, 1); // and the waves start over, so the POI can be farmed
});

test('a Storehouse multiplies what a full clear pays out', () => {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  assert.equal(clearYield(s), 1);
  s.buildings['holtburg:storehouse'].level = 4; // +100% materials
  assert.equal(clearYield(s), 2);
});

test('travelling to a different POI restarts its waves from wave 1', () => {
  const s = atPoi('drudge-hideout');
  s.progress.wave = 6;
  s.progress.waveMonstersLeft = 2;
  startTravelToPoi(s, 'rat-nest');
  for (let i = 0; i < 400 && s.travel; i++) tickCombat(s, 0.25);
  assert.equal(s.location.poiId, 'rat-nest');
  assert.equal(s.progress.wave, 1);
});

test('the offline simulation books whole clears without logging one line per wave', () => {
  const s = createInitialState();
  s.location = { regionId: 'holtburg', poiId: 'drudge-hideout' };
  const poi = getPoiById('drudge-hideout');
  const logBefore = s.log.length;

  // 3 clears' worth of kills at the simulation's assumed 2 monsters per wave.
  const clears = simulateWaveKills(s, poi, 3 * WAVES_PER_POI * 2);

  assert.equal(clears, 3);
  assert.equal(s.progress.totalClears, 3);
  assert.equal(s.materials[poi.gather.material], 3 * clearYield(s));
  assert.ok(s.log.length - logBefore <= 3); // one payout line (plus any skill rank-ups), not thirty
});
