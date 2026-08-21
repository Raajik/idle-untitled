import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trainingCost, buyTraining, TRAINING_TRACKS } from '../src/game/training.js';
import { soulsForRun, performRebirth, buyUpgrade, canRebirth } from '../src/game/prestige.js';
import { createInitialState } from '../src/game/state.js';

test('training cost grows exponentially', () => {
  for (const t of TRAINING_TRACKS) {
    assert.ok(trainingCost(t.id, 5) > trainingCost(t.id, 2));
    assert.ok(trainingCost(t.id, 1) > trainingCost(t.id, 0));
  }
});

test('buyTraining requires pyreals and increments rank', () => {
  const s = createInitialState();
  assert.equal(buyTraining(s, 'atk'), false); // no pyreals
  s.pyreals = 10000;
  assert.equal(buyTraining(s, 'atk'), true);
  assert.equal(s.training.atk, 1);
  assert.ok(s.pyreals < 10000);
});

test('soulsForRun is zero before reaching Banderling Plains and grows after', () => {
  assert.equal(soulsForRun(0, 50), 0);
  const s1 = soulsForRun(1, 20);
  const s3 = soulsForRun(3, 20);
  assert.ok(s1 > 0);
  assert.ok(s3 > s1);
});

test('rebirth resets the run but keeps souls and upgrades', () => {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg', 'glenden-wood'];
  s.hero.level = 25;
  s.pyreals = 5000;
  s.inventory.push({ id: 1, slot: 'weapon', power: 5, affixes: [], rarity: 'Common', name: 'x' });
  assert.ok(canRebirth(s));

  const gained = performRebirth(s);
  assert.ok(gained > 0);
  assert.equal(s.rebirth.souls, gained);
  assert.equal(s.rebirth.count, 1);
  assert.equal(s.pyreals, 0);
  assert.equal(s.hero.level, 1);
  assert.equal(s.progress.unlockedRegions.length, 0);
  assert.equal(s.inventory.length, 0);
});

test('cannot rebirth before reaching Glenden Wood', () => {
  const s = createInitialState();
  assert.equal(canRebirth(s), false);
  assert.equal(performRebirth(s), 0);
});

test('buyUpgrade spends souls and respects max rank', () => {
  const s = createInitialState();
  s.rebirth.souls = 100;
  assert.equal(buyUpgrade(s, 'xpBoost'), true);
  assert.equal(s.rebirth.upgrades.xpBoost, 1);
  // max it out
  s.rebirth.souls = 1000;
  for (let i = 0; i < 10; i++) buyUpgrade(s, 'xpBoost');
  assert.equal(s.rebirth.upgrades.xpBoost, 5); // maxRank
});
