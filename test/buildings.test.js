import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { BUILDINGS, unlockCost, upgradeCost, rotationSeconds, MAX_BUILDING_LEVEL } from '../src/data/buildings.js';
import { tickBuildings, unlockBuilding, upgradeBuilding, isUnlocked, rotationRemaining } from '../src/game/buildings.js';
import { derivedStats } from '../src/game/hero.js';

test('only the General Store starts open', () => {
  const s = createInitialState();
  const open = BUILDINGS.filter((b) => isUnlocked(s, b.id)).map((b) => b.id);
  assert.deepEqual(open, ['general-store']);
});

test('the General Store stocks 5-10 items on the first tick', () => {
  const s = createInitialState();
  assert.equal(s.buildings['general-store'].stock.length, 0);
  tickBuildings(s);
  const stock = s.buildings['general-store'].stock;
  assert.ok(stock.length >= 5 && stock.length <= 10, `stocked ${stock.length}`);
  assert.ok(rotationRemaining(s, 'general-store') > 0);
});

test('stock rotates once its hour is up, and not before', () => {
  const s = createInitialState();
  const t0 = 1_000_000;
  tickBuildings(s, t0);
  const first = s.buildings['general-store'].stock;

  tickBuildings(s, t0 + rotationSeconds(1) * 1000 - 1);
  assert.equal(s.buildings['general-store'].stock, first);

  tickBuildings(s, t0 + rotationSeconds(1) * 1000);
  assert.notEqual(s.buildings['general-store'].stock, first);
});

test('upgrading a shop shortens its rotation', () => {
  assert.ok(rotationSeconds(2) < rotationSeconds(1));
  assert.ok(rotationSeconds(MAX_BUILDING_LEVEL) < rotationSeconds(2));
});

test('unlocking a building costs pyreals and materials, and refuses when short', () => {
  const s = createInitialState();
  const cost = unlockCost(BUILDINGS.find((b) => b.id === 'weaponsmith'));

  assert.equal(unlockBuilding(s, 'weaponsmith'), false); // broke

  s.pyreals = cost.pyreals;
  assert.equal(unlockBuilding(s, 'weaponsmith'), false); // pyreals but no iron

  s.materials[cost.materialId] = cost.materials;
  assert.equal(unlockBuilding(s, 'weaponsmith'), true);
  assert.equal(s.pyreals, 0);
  assert.equal(s.materials[cost.materialId], 0);
  assert.ok(s.buildings['weaponsmith'].stock.length > 0);
});

test('an unlocked building applies its perk to the hero, and upgrading grows it', () => {
  const s = createInitialState();
  s.hero.str = 100; // a percentage perk needs enough base ATK to show past rounding
  const base = derivedStats(s).atk;

  s.buildings['weaponsmith'].level = 1;
  const atLevel1 = derivedStats(s).atk;
  assert.ok(atLevel1 > base, 'Weaponsmith should add ATK');

  s.buildings['weaponsmith'].level = 5;
  assert.ok(derivedStats(s).atk > atLevel1);
});

test('upgrading stops at the max level', () => {
  const s = createInitialState();
  s.buildings['general-store'].level = MAX_BUILDING_LEVEL;
  s.pyreals = 10_000_000;
  s.materials['copper'] = 10_000;
  assert.equal(upgradeCost(BUILDINGS[0], MAX_BUILDING_LEVEL), null);
  assert.equal(upgradeBuilding(s, 'general-store'), false);
});

test('upgrading a building spends its cost and bumps its level', () => {
  const s = createInitialState();
  const cost = upgradeCost(BUILDINGS.find((b) => b.id === 'general-store'), 1);
  s.pyreals = cost.pyreals;
  s.materials[cost.materialId] = cost.materials;
  assert.equal(upgradeBuilding(s, 'general-store'), true);
  assert.equal(s.buildings['general-store'].level, 2);
  assert.equal(s.pyreals, 0);
});
