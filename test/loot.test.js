import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateItem, itemScore, equipItem, maybeAutoEquip, rollDrop } from '../src/game/loot.js';
import { createInitialState } from '../src/game/state.js';
import { SLOTS, RARITIES } from '../src/data/items.js';

test('generateItem produces valid items', () => {
  for (let i = 0; i < 100; i++) {
    const item = generateItem(2);
    assert.ok(SLOTS.includes(item.slot));
    assert.ok(RARITIES.some((r) => r.name === item.rarity));
    assert.ok(item.power >= 1);
    assert.ok(item.name.length > 0);
    assert.equal(item.affixes.length, RARITIES.find((r) => r.name === item.rarity).affixes);
  }
});

test('higher zones produce more powerful items on average', () => {
  const avg = (zone) => {
    let sum = 0;
    for (let i = 0; i < 200; i++) sum += generateItem(zone).power;
    return sum / 200;
  };
  assert.ok(avg(5) > avg(0));
});

test('equipItem moves item to slot and swaps old item back to inventory', () => {
  const s = createInitialState();
  const a = generateItem(0);
  a.slot = 'weapon';
  const b = generateItem(0);
  b.slot = 'weapon';
  s.equipment.weapon = a;
  s.inventory.push(b);
  assert.equal(equipItem(s, b.id), true);
  assert.equal(s.equipment.weapon.id, b.id);
  assert.ok(s.inventory.some((it) => it.id === a.id));
});

test('maybeAutoEquip only equips strictly better items', () => {
  const s = createInitialState();
  const weak = { id: 1, slot: 'weapon', power: 1, affixes: [], rarity: 'Common', name: 'w' };
  const strong = { id: 2, slot: 'weapon', power: 50, affixes: [], rarity: 'Rare', name: 's' };
  assert.equal(maybeAutoEquip(s, strong), true); // empty slot
  assert.equal(maybeAutoEquip(s, weak), false); // worse than equipped: rejected, caller keeps it
  assert.equal(s.equipment.weapon.id, 2);
  assert.equal(s.inventory.length, 0); // maybeAutoEquip itself never adds to inventory
});

test('bosses always drop', () => {
  const s = createInitialState();
  s.location = { regionId: 'holtburg', poiId: 'holtburg-meeting-hall' };
  for (let i = 0; i < 10; i++) assert.ok(rollDrop(s, true));
});

test('itemScore ranks power and affixes', () => {
  const plain = { power: 10, affixes: [] };
  const fancy = { power: 10, affixes: [{ id: 'atkPct', value: 10 }] };
  assert.ok(itemScore(fancy) > itemScore(plain));
  assert.equal(itemScore(null), 0);
});
