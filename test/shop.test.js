import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { buyItem, sellItem, healService, buyPrice, healCost } from '../src/game/shop.js';
import { tickBuildings, investToOpen, takeTour } from '../src/game/buildings.js';

// The Town Hall's tour is what opens the General Store; its stock is rolled then
// rather than at character creation.
function stockedStore() {
  const s = createInitialState();
  takeTour(s, 'town-hall');
  tickBuildings(s);
  return s;
}

test("buying an item from a building's stock spends pyreals and adds it to inventory", () => {
  const s = stockedStore();
  const stock = s.buildings['general-store'].stock;
  assert.ok(stock.length > 0);
  const originalLength = stock.length;
  const item = stock[0];
  s.pyreals = buyPrice(item) + 100;
  const before = s.pyreals;

  assert.equal(buyItem(s, 'general-store', 0), true);
  assert.equal(s.buildings['general-store'].stock.length, originalLength - 1);
  assert.ok(s.inventory.some((it) => it.id === item.id));
  assert.ok(s.pyreals < before);
});

test('buying fails without enough pyreals', () => {
  const s = stockedStore();
  s.pyreals = 0;
  assert.equal(buyItem(s, 'general-store', 0), false);
});

test('buying from a building that is still locked fails', () => {
  const s = stockedStore();
  s.pyreals = 1000000;
  assert.equal(buyItem(s, 'weaponsmith', 0), false);
});

test('selling an inventory item removes it and grants pyreals', () => {
  const s = createInitialState();
  const item = { id: 999, slot: 'ring', power: 5, spells: [], rarity: 'Common', name: 'Worn Ring' };
  s.inventory.push(item);
  const before = s.pyreals;
  assert.equal(sellItem(s, 999), true);
  assert.equal(s.inventory.length, 0);
  assert.ok(s.pyreals > before);
});

test('the Physician heals the hero to full for pyreals, once unlocked', () => {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: 'drudge-hideout' };
  s.hero.hp = 1;

  assert.equal(healService(s), false); // Physician is still closed

  s.pyreals = 100000;
  s.materials['linen'] = 100;
  assert.equal(investToOpen(s, 'physician'), true);

  const cost = healCost(s);
  assert.ok(cost > 0);
  s.pyreals = cost;
  assert.equal(healService(s), true);
  assert.equal(s.pyreals, 0);
});

test('upgrading the Physician makes healing cheaper', () => {
  const s = createInitialState();
  s.hero.hp = 1;
  s.buildings['physician'].level = 1;
  const atLevel1 = healCost(s);
  s.buildings['physician'].level = 5;
  assert.ok(healCost(s) < atLevel1);
});
