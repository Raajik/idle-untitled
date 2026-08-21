import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { startGathering, tickGathering } from '../src/game/gathering.js';
import { GATHER_MATERIAL_POOLS } from '../src/data/materials.js';
import { tickCombat } from '../src/game/combat.js';

test('gathering only starts while standing in the node\'s region town', () => {
  const s = createInitialState();
  assert.equal(startGathering(s, 'holtburg-iron-vein'), false); // not even in Holtburg yet
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: 'holtburg-meeting-hall' };
  assert.equal(startGathering(s, 'holtburg-iron-vein'), false); // at a POI, not in town
  s.location = { regionId: 'holtburg', poiId: null };
  assert.equal(startGathering(s, 'holtburg-iron-vein'), true);
  assert.ok(s.gathering);
});

test('gathering grants a material from the node\'s pool and skill xp, and blocks combat meanwhile', () => {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: null };
  startGathering(s, 'holtburg-iron-vein');

  let ticks = 0;
  while (s.gathering && ticks < 200) {
    tickCombat(s, 0.25);
    ticks++;
  }
  assert.equal(s.gathering, null);
  assert.ok(s.hero.skills.gathering.mining.xp > 0 || s.hero.skills.gathering.mining.rank > 0);

  const gained = Object.keys(s.materials).filter((id) => s.materials[id] > 0);
  assert.ok(gained.length > 0);
  assert.ok(gained.every((id) => GATHER_MATERIAL_POOLS.mining.includes(id)));
});
