import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tickCombat, spawnMonster, computeDepth } from '../src/game/combat.js';
import { createInitialState } from '../src/game/state.js';
import { getPoiById } from '../src/data/regions.js';

function atPoi(poiId) {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId };
  return s;
}

test('spawnMonster creates a normal monster with full hp', () => {
  const s = atPoi('holtburg-meeting-hall');
  spawnMonster(s);
  assert.ok(s.monster);
  assert.equal(s.monster.hp, s.monster.maxHp);
  assert.equal(s.monster.isBoss, false);
});

test('boss can appear once depth passes the threshold', () => {
  const s = atPoi('holtburg-meeting-hall');
  s.progress.timeInPoi = 2000; // pushes depth to the 3.0 cap
  s.progress.killsSinceBoss = 10;
  let sawBoss = false;
  for (let i = 0; i < 300 && !sawBoss; i++) {
    spawnMonster(s);
    if (s.monster.isBoss) sawBoss = true;
  }
  assert.ok(sawBoss);
  const poi = getPoiById('holtburg-meeting-hall');
  if (sawBoss) assert.equal(s.monster.name, poi.boss.name);
});

test('combat ticks eventually kill the monster and grant rewards', () => {
  const s = atPoi('holtburg-meeting-hall');
  // make hero strong enough to one-shot
  s.hero.str = 500;
  s.hero.end = 500;
  const pyrealsBefore = s.pyreals;
  for (let i = 0; i < 40; i++) tickCombat(s, 0.25);
  assert.ok(s.progress.totalKills >= 1);
  assert.ok(s.pyreals > pyrealsBefore);
  assert.ok(s.hero.xp > 0 || s.hero.level > 1);
});

test('depth rises with time and kills spent at a POI', () => {
  const s = atPoi('holtburg-meeting-hall');
  s.hero.str = 500;
  s.hero.end = 500;
  const depthBefore = computeDepth(s.progress);
  for (let i = 0; i < 40; i++) tickCombat(s, 0.25);
  assert.ok(computeDepth(s.progress) > depthBefore);
});

test('no combat happens while travelling or in town', () => {
  const s = createInitialState(); // fresh game: no location, no travel
  for (let i = 0; i < 20; i++) tickCombat(s, 0.25);
  assert.equal(s.monster, null);
  assert.equal(s.progress.totalKills, 0);
});

test('hero death triggers respawn cycle without progress loss', () => {
  const s = atPoi('virindi-citadel'); // Direlands, brutal
  s.hero.end = 1; // very squishy
  let died = false;
  let revived = false;
  for (let i = 0; i < 400; i++) {
    tickCombat(s, 0.25);
    if (s.hero.dead) died = true;
    if (died && !s.hero.dead && s.hero.hp > 0) revived = true; // came back at least once
  }
  assert.ok(died);
  assert.ok(revived);
});
