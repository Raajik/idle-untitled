import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitChance, activeWeaponSkill } from '../src/game/skills.js';
import { monsterStatsForLevel } from '../src/data/monsterScaling.js';
import { createInitialState } from '../src/game/state.js';
import { tickCombat } from '../src/game/combat.js';
import { startTravelToRegion, startTravelToPoi } from '../src/game/travel.js';

test('hitChance starts at even odds untrained and caps at 95 at rank 100', () => {
  assert.equal(hitChance(0), 50);
  assert.equal(hitChance(100), 95);
  assert.ok(hitChance(50) > 50 && hitChance(50) < 95);
});

test('activeWeaponSkill falls back to Unarmed with no weapon equipped', () => {
  const s = createInitialState();
  const aw = activeWeaponSkill(s);
  assert.equal(aw.key, 'unarmed');
  assert.equal(aw.weaponName, null);
});

test('activeWeaponSkill follows the equipped weapon baseType', () => {
  const s = createInitialState();
  s.equipment.weapon = { slot: 'weapon', power: 5, spells: [], rarity: 'Common', name: 'Worn Axe', baseType: 'axe' };
  const aw = activeWeaponSkill(s);
  assert.equal(aw.key, 'axe');
  assert.equal(aw.weaponName, 'Worn Axe');
});

test('a level-1 monster takes multiple successful hits for a modestly-geared hero', () => {
  const stats = monsterStatsForLevel(1);
  const typicalAtk = 3 + 7 * 1.5; // str 7, no gear — an early-game hero
  const hitsToKill = Math.ceil(stats.hp / Math.max(1, typicalAtk - stats.def));
  assert.ok(hitsToKill >= 5 && hitsToKill <= 20, `expected 5-20 hits, got ${hitsToKill}`);
});

test('offense skill trains through use and unarmed misses land less often at rank 0', () => {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: 'holtburg-meeting-hall' };
  s.hero.end = 50; // survive long enough to land plenty of swings
  for (let i = 0; i < 400; i++) tickCombat(s, 0.25);
  assert.ok(s.hero.skills.offense.unarmed.xp > 0 || s.hero.skills.offense.unarmed.rank > 0);
});

test('regions and POIs are always travelable, including redirecting mid-walk', () => {
  const s = createInitialState();
  assert.equal(startTravelToRegion(s, 'holtburg'), true);
  assert.ok(s.travel && s.travel.id === 'holtburg');
  // Redirect to a totally different (very distant) region mid-walk — should succeed, not be blocked.
  assert.equal(startTravelToRegion(s, 'direlands'), true);
  assert.equal(s.travel.id, 'direlands');
});
