import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tickCombat, spawnMonster, travelToZone } from '../src/game/combat.js';
import { createInitialState } from '../src/game/state.js';
import { ZONES } from '../src/data/zones.js';

test('spawnMonster creates a normal monster with full hp', () => {
  const s = createInitialState();
  spawnMonster(s);
  assert.ok(s.monster);
  assert.equal(s.monster.hp, s.monster.maxHp);
  assert.equal(s.monster.isBoss, false);
});

test('boss spawns after killsToBoss kills', () => {
  const s = createInitialState();
  s.progress.killsInZone = ZONES[0].killsToBoss;
  spawnMonster(s);
  assert.equal(s.monster.isBoss, true);
  assert.equal(s.monster.name, ZONES[0].boss.name);
});

test('combat ticks eventually kill the monster and grant rewards', () => {
  const s = createInitialState();
  // make hero strong enough to one-shot
  s.hero.str = 500;
  s.hero.vit = 500;
  const goldBefore = s.gold;
  for (let i = 0; i < 40; i++) tickCombat(s, 0.25);
  assert.ok(s.progress.totalKills >= 1);
  assert.ok(s.gold > goldBefore);
  assert.ok(s.hero.xp > 0 || s.hero.level > 1);
});

test('killing the boss unlocks the next zone', () => {
  const s = createInitialState();
  s.hero.str = 50000;
  s.hero.vit = 50000;
  s.progress.killsInZone = ZONES[0].killsToBoss;
  for (let i = 0; i < 40; i++) tickCombat(s, 0.25);
  assert.equal(s.progress.bossesKilled, 1);
  assert.equal(s.progress.highestZone, 1);
});

test('travelToZone respects unlocks and resets zone progress', () => {
  const s = createInitialState();
  assert.equal(travelToZone(s, 1), false); // locked
  s.progress.highestZone = 2;
  s.progress.killsInZone = 7;
  assert.equal(travelToZone(s, 2), true);
  assert.equal(s.progress.zone, 2);
  assert.equal(s.progress.killsInZone, 0);
});

test('hero death triggers respawn cycle without progress loss', () => {
  const s = createInitialState();
  s.hero.vit = 1; // very squishy
  s.progress.zone = 5; // shadow keep, brutal
  s.progress.highestZone = 5;
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
