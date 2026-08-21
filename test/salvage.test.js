import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { salvageItem } from '../src/game/loot.js';
import { SALVAGE_YIELD } from '../src/data/materials.js';

test('salvaging an inventory item removes it and grants a rarity-scaled quantity of its material', () => {
  const s = createInitialState();
  const item = { id: 42, slot: 'weapon', power: 10, affixes: [], rarity: 'Rare', name: 'Runed Sword', material: 'iron' };
  s.inventory.push(item);

  const result = salvageItem(s, 42);
  assert.ok(result);
  assert.equal(result.material, 'iron');
  assert.equal(result.amount, SALVAGE_YIELD.Rare);
  assert.equal(s.materials['iron'], SALVAGE_YIELD.Rare);
  assert.equal(s.inventory.length, 0);
});

test('salvaging a non-existent item does nothing', () => {
  const s = createInitialState();
  assert.equal(salvageItem(s, 12345), null);
});
