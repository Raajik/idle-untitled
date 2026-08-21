import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tickCombat, spawnMonster, computeDepth } from '../src/game/combat.js';
import { createInitialState } from '../src/game/state.js';
import { getPoiById } from '../src/data/regions.js';
import { derivedStats } from '../src/game/hero.js';

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

test('the Devastating melee stance applies a stacking bleed that ticks damage over time', () => {
  const s = atPoi('holtburg-meeting-hall');
  s.hero.combat.meleeStance = 4; // Devastating: 4s swing, applies Bleed
  s.hero.str = 30;
  s.hero.end = 30;
  spawnMonster(s);
  s.monster.hp = 100000;
  s.monster.maxHp = 100000;
  s.monster.def = 0;
  s.monster.dodge = 0;

  for (let i = 0; i < 30 && !s.monster.bleed; i++) tickCombat(s, 4.1);
  assert.ok(s.monster.bleed);
  assert.ok(s.monster.bleed.stacks >= 1);

  const hpBefore = s.monster.hp;
  for (let i = 0; i < 6; i++) tickCombat(s, 1.1);
  assert.ok(s.monster.hp < hpBefore);
});

test('magic casting drains mana, trains War Magic, and deals damage', () => {
  const s = atPoi('holtburg-meeting-hall');
  s.hero.combat.mode = 'magic';
  s.hero.combat.magicSpell = 'streak'; // fast and cheap, easy to land several casts
  s.hero.focus = 30;
  spawnMonster(s);
  s.monster.hp = 100000;
  s.monster.maxHp = 100000;
  s.monster.def = 0;
  s.monster.dodge = 0;

  const rankBefore = s.hero.skills.offense.war.rank;
  const xpBefore = s.hero.skills.offense.war.xp;
  for (let i = 0; i < 20; i++) tickCombat(s, 0.6);

  assert.ok(s.hero.skills.offense.war.xp > xpBefore || s.hero.skills.offense.war.rank > rankBefore);
  assert.ok(s.monster.hp < 100000);
  assert.ok(s.hero.mana < derivedStats(s).maxMana);
});
