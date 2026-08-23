import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trainingCost, buyTraining, TRAINING_TRACKS } from '../src/game/training.js';
import { soulsForRun, performEnlightenment, buyUpgrade, canEnlighten } from '../src/game/enlightenment.js';
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

test('enlightenment resets the run but keeps souls and upgrades', () => {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg', 'glenden-wood'];
  s.hero.level = 25;
  s.pyreals = 5000;
  s.inventory.push({ id: 1, slot: 'weapon', power: 5, spells: [], rarity: 'Common', name: 'x' });
  assert.ok(canEnlighten(s));

  const gained = performEnlightenment(s);
  assert.ok(gained > 0);
  assert.equal(s.enlightenment.souls, gained);
  assert.equal(s.enlightenment.count, 1);
  assert.equal(s.pyreals, 0);
  assert.equal(s.hero.level, 1);
  assert.equal(s.progress.unlockedRegions.length, 0);
  assert.equal(s.inventory.length, 0);
});

test('cannot enlightenment before reaching Glenden Wood', () => {
  const s = createInitialState();
  assert.equal(canEnlighten(s), false);
  assert.equal(performEnlightenment(s), 0);
});

test('buyUpgrade spends souls and respects max rank', () => {
  const s = createInitialState();
  s.enlightenment.souls = 100;
  assert.equal(buyUpgrade(s, 'xpBoost'), true);
  assert.equal(s.enlightenment.upgrades.xpBoost, 1);
  // max it out
  s.enlightenment.souls = 1000;
  for (let i = 0; i < 10; i++) buyUpgrade(s, 'xpBoost');
  assert.equal(s.enlightenment.upgrades.xpBoost, 5); // maxRank
});
