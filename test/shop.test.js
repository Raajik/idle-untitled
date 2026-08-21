import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { buyItem, sellItem, healService, buyPrice, healCost } from '../src/game/shop.js';

test("buying an item from a shop's stock spends pyreals and adds it to inventory", () => {
  const s = createInitialState();
  const stock = s.shops['weaponsmith'];
  assert.ok(stock.length > 0);
  const originalLength = stock.length;
  const item = stock[0];
  s.pyreals = buyPrice(item) + 100;
  const before = s.pyreals;

  assert.equal(buyItem(s, 'weaponsmith', 0), true);
  assert.equal(s.shops['weaponsmith'].length, originalLength - 1);
  assert.ok(s.inventory.some((it) => it.id === item.id));
  assert.ok(s.pyreals < before);
});

test('buying fails without enough pyreals', () => {
  const s = createInitialState();
  s.pyreals = 0;
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

test('the Physician heals the hero to full for pyreals', () => {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: 'holtburg-meeting-hall' };
  s.hero.hp = 1;
  const cost = healCost(s);
  assert.ok(cost > 0);
  s.pyreals = cost;
  assert.equal(healService(s), true);
  assert.equal(s.pyreals, 0);
});
