import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { derivedStats } from '../src/game/hero.js';
import { generateItem, equipItem, maybeAutoEquip, bestSlotFor, itemScore } from '../src/game/loot.js';
import {
  SLOTS,
  EQUIP_SLOTS,
  ARMOR_SLOTS,
  UNDERCLOTHING_SLOTS,
  SLOT_LABELS,
  BASE_NAMES,
  ITEM_ICONS,
  slotKind,
  equipSlotsForKind,
  isArmorSlot,
  isUnderclothing,
} from '../src/data/items.js';
import { SLOT_MATERIAL_CATEGORY, getMaterial } from '../src/data/materials.js';
import { SPELL_IDS_FOR_SLOT } from '../src/data/spells.js';

test('every kind has a label, a name list, an icon, a material category and a spell pool', () => {
  for (const kind of SLOTS) {
    assert.ok(SLOT_LABELS[kind], `${kind} has no label`);
    assert.ok(BASE_NAMES[kind] && BASE_NAMES[kind].length, `${kind} has no base names`);
    assert.ok(kind === 'weapon' || ITEM_ICONS[kind], `${kind} has no icon`);
    assert.ok(SLOT_MATERIAL_CATEGORY[kind], `${kind} has no material category`);
    assert.ok(SPELL_IDS_FOR_SLOT[kind] && SPELL_IDS_FOR_SLOT[kind].length, `${kind} rolls no spells`);
  }
});

test('a fresh hero has one entry per equipment slot, and rings come in pairs', () => {
  const s = createInitialState();
  assert.deepEqual(Object.keys(s.equipment), EQUIP_SLOTS);
  assert.deepEqual(equipSlotsForKind('ring'), ['ring1', 'ring2']);
  assert.deepEqual(equipSlotsForKind('bracelet'), ['bracelet1', 'bracelet2']);
  assert.deepEqual(equipSlotsForKind('chest'), ['chest']);
  assert.equal(slotKind('ring2'), 'ring');
  assert.equal(slotKind('upperArm'), 'upperArm');
});

test('a second ring fills the other hand rather than replacing the first', () => {
  const s = createInitialState();
  const first = generateItem(20, { forceSlot: 'ring' });
  const second = generateItem(20, { forceSlot: 'ring' });
  s.inventory.push(first, second);

  equipItem(s, first.id);
  assert.equal(s.equipment.ring1, first);
  assert.equal(s.equipment.ring2, null);

  equipItem(s, second.id);
  assert.equal(s.equipment.ring1, first, 'the first ring should have stayed put');
  assert.equal(s.equipment.ring2, second);
  assert.equal(s.inventory.length, 0);
});

test('once both hands are full, a ring displaces the worse of the two', () => {
  const s = createInitialState();
  // Jewelry has no innate stats now, so a ring is worth exactly its spells.
  const ringWith = (id, value, name) => ({
    id,
    slot: 'ring',
    spells: value ? [{ id: 'attribute', level: 1, value, meta: { attr: 'end' }, label: 'Endurance' }] : [],
    rarity: 'Common',
    name,
  });
  const weak = ringWith(1, 2, 'Jet Loop');
  const strong = ringWith(2, 20, 'Opal Signet');
  s.equipment.ring1 = strong;
  s.equipment.ring2 = weak;

  const better = ringWith(3, 40, 'Gold Band');
  assert.equal(bestSlotFor(s, 'ring'), 'ring2', 'should target the weaker hand');
  assert.equal(maybeAutoEquip(s, better), true);
  assert.equal(s.equipment.ring1, strong);
  assert.equal(s.equipment.ring2, better);
  assert.ok(s.inventory.includes(weak), 'the displaced ring goes back to the pack');
});

test('items are named for what they are made of', () => {
  for (const kind of SLOTS) {
    const item = generateItem(20, { forceSlot: kind });
    assert.ok(item.material, `${kind} rolled no material`);
    const materialName = getMaterial(item.material).name;
    assert.ok(item.name.startsWith(materialName), `${kind} was named "${item.name}", not "${materialName} ..."`);
    assert.ok(BASE_NAMES[kind].some((b) => item.name.endsWith(b)), `${kind} name "${item.name}" ends in no base name`);
  }
});

test('armour adds up across the suit, and only answers steel', () => {
  // Every piece carries its own Armour Value now, so a full set really is worth
  // ten pieces rather than a tenth each. What keeps that from running away is
  // that armour does nothing at all against the elements.
  const piece = (slot) => ({ id: 1, slot, armour: 6, spells: [], rarity: 'Common', name: 'Iron Piece' });
  const one = createInitialState();
  one.equipment.chest = piece('chest');
  const full = createInitialState();
  for (const slot of ARMOR_SLOTS) full.equipment[slot] = piece(slot);

  const bare = derivedStats(createInitialState());
  const oneStats = derivedStats(one);
  const fullStats = derivedStats(full);

  assert.equal(bare.armour, 0, 'a naked hero has none');
  assert.equal(oneStats.armour, 6, 'one piece is worth its own value');
  assert.equal(fullStats.armour, 6 * ARMOR_SLOTS.length, 'and a suit is worth all of them');
  // Armour is kept apart from DEF, which is the body's own toughness.
  assert.equal(fullStats.def, bare.def, 'wearing armour is not the same as being tough');
});

test('underclothing turns nothing but still carries enchantment', () => {
  for (const slot of UNDERCLOTHING_SLOTS) {
    assert.ok(isUnderclothing(slot));
    assert.equal(isArmorSlot(slot), false, `${slot} should not count as armor`);
    assert.ok(!SPELL_IDS_FOR_SLOT[slot].includes('armor'), `${slot} should never roll Aegis`);

    const bare = createInitialState();
    const clothed = createInitialState();
    clothed.equipment[slot] = { id: 1, slot, power: 200, spells: [], rarity: 'Common', name: 'Linen Shirt' };
    const before = derivedStats(bare);
    const after = derivedStats(clothed);
    assert.equal(after.def, before.def, `${slot} should add no defense`);
    assert.equal(after.armour, before.armour, `${slot} should add no armour`);
    assert.equal(after.maxHp, before.maxHp, `${slot} should add no health`);
  }
});

test('an item spell raises the attribute it names, and everything that attribute feeds', () => {
  const bare = createInitialState();
  const buffed = createInitialState();
  buffed.equipment.ring1 = {
    id: 1, slot: 'ring', power: 1, rarity: 'Rare', name: 'Opal Signet',
    spells: [{ id: 'attribute', level: 4, value: 20, meta: { attr: 'end' }, label: 'Endurance IV' }],
  };
  const before = derivedStats(bare);
  const after = derivedStats(buffed);
  assert.ok(after.maxHp > before.maxHp, 'Endurance should raise health');
  assert.ok(after.maxStamina > before.maxStamina, 'Endurance should raise stamina');
  assert.ok(after.def > before.def, 'Endurance should raise defense');
});
