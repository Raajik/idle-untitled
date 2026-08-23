import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateItem, itemScore, equipItem, maybeAutoEquip, rollDrop } from '../src/game/loot.js';
import { createInitialState } from '../src/game/state.js';
import { SLOTS, RARITIES, BASE_NAMES, ITEM_ICONS, itemIcon, slotIcon } from '../src/data/items.js';

test('generateItem produces valid items', () => {
  for (let i = 0; i < 100; i++) {
    const item = generateItem(2);
    assert.ok(SLOTS.includes(item.slot));
    assert.ok(RARITIES.some((r) => r.name === item.rarity));
    assert.ok(item.power >= 1);
    assert.ok(item.name.length > 0);
    const [min, max] = RARITIES.find((r) => r.name === item.rarity).spells;
    assert.ok(
      item.spells.length >= min && item.spells.length <= max,
      `${item.rarity} rolled ${item.spells.length} spells, expected ${min}-${max}`
    );
    // One of each kind per item — stacking the same affix is Tinkering's job.
    const kinds = item.spells.map((sp) => sp.id + JSON.stringify(sp.meta || {}));
    assert.equal(new Set(kinds).size, kinds.length, 'an item rolled the same spell twice');
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
  const weak = { id: 1, slot: 'weapon', power: 1, spells: [], rarity: 'Common', name: 'w' };
  const strong = { id: 2, slot: 'weapon', power: 50, spells: [], rarity: 'Rare', name: 's' };
  assert.equal(maybeAutoEquip(s, strong), true); // empty slot
  assert.equal(maybeAutoEquip(s, weak), false); // worse than equipped: rejected, caller keeps it
  assert.equal(s.equipment.weapon.id, 2);
  assert.equal(s.inventory.length, 0); // maybeAutoEquip itself never adds to inventory
});

test('later waves drop more powerful gear than wave 1', () => {
  const s = createInitialState();
  s.location = { regionId: 'holtburg', poiId: 'drudge-hideout' };
  const avgPowerAtWave = (wave) => {
    s.progress.wave = wave;
    let total = 0;
    let drops = 0;
    for (let i = 0; i < 400; i++) {
      const item = rollDrop(s);
      if (item) {
        total += item.power;
        drops += 1;
      }
    }
    assert.ok(drops > 0);
    return total / drops;
  };
  assert.ok(avgPowerAtWave(10) > avgPowerAtWave(1));
});

test('itemScore reads the stat a piece actually has', () => {
  // Weapons are judged on damage, armour on its value, and jewelry — which has
  // no innate stats at all — purely on what is written on it.
  const sword = { slot: 'weapon', damage: { min: 8, max: 12 }, spells: [] };
  const betterSword = { slot: 'weapon', damage: { min: 14, max: 18 }, spells: [] };
  assert.ok(itemScore(betterSword) > itemScore(sword));

  const chest = { slot: 'chest', armour: 6, spells: [] };
  assert.ok(itemScore(chest) > 0);

  const plainRing = { slot: 'ring', spells: [] };
  const spelledRing = { slot: 'ring', spells: [{ id: 'atkPct', value: 10 }] };
  assert.ok(itemScore(spelledRing) > itemScore(plainRing), 'a ring is worth its spells');

  assert.equal(itemScore(null), 0);
});

test('an item saved before stats existed is still worth what it was', () => {
  // Everything in an existing save carries only `power`. Rather than rewriting
  // saves, the stats are derived from that old scale on the fly.
  const oldSword = { slot: 'weapon', power: 20, spells: [] };
  const oldChest = { slot: 'chest', power: 20, spells: [] };
  assert.ok(itemScore(oldSword) > 0, 'an old weapon still has damage');
  assert.ok(itemScore(oldChest) > 0, 'an old breastplate still has armour');
});

test('every slot and weapon base type has an inventory icon', () => {
  // The Inventory grid distinguishes items by glyph alone, so a slot or weapon
  // added without an icon would render as an indistinguishable fallback.
  for (const slot of SLOTS) {
    assert.ok(ITEM_ICONS[slot] || slot === 'weapon', `no icon for slot ${slot}`);
  }
  for (const base of BASE_NAMES.weapon) {
    assert.ok(ITEM_ICONS[base.toLowerCase()], `no icon for weapon type ${base}`);
  }
  assert.equal(itemIcon({ slot: 'weapon', baseType: 'bow' }), ITEM_ICONS.bow);
  assert.equal(itemIcon({ slot: 'ring' }), ITEM_ICONS.ring);
  assert.equal(slotIcon('aetheria1'), ITEM_ICONS.aetheria);
});
