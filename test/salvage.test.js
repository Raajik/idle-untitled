import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { salvageItem, salvageYield, generateItem } from '../src/game/loot.js';
import { SALVAGE_BASE_MIN, SALVAGE_BASE_MAX, SALVAGE_RARITY_BONUS } from '../src/data/materials.js';

function itemOf(rarity, id = 42) {
  return { id, slot: 'weapon', power: 10, spells: [], rarity, name: `${rarity} Sword`, material: 'iron' };
}

test('salvaging an inventory item removes it and grants its material', () => {
  const s = createInitialState();
  s.inventory.push(itemOf('Rare'));

  const result = salvageItem(s, 42);
  assert.ok(result);
  assert.equal(result.material, 'iron');
  assert.ok(result.amount >= 1);
  assert.equal(s.materials['iron'], result.amount);
  assert.equal(s.inventory.length, 0);
  assert.ok(s.hero.attrXp.str > 0);
  assert.ok(s.hero.attrXp.coord > 0);
  assert.ok(s.hero.attrXp.focus > 0);
});

test('salvaging trains the Salvaging skill', () => {
  const s = createInitialState();
  s.inventory.push(itemOf('Common'));
  salvageItem(s, 42);
  const skill = s.hero.skills.salvaging;
  assert.ok(skill.xp > 0 || skill.rank > 0);
});

test('an untrained salvager gets the base 1-2, plus a little for rarity', () => {
  for (const rarity of Object.keys(SALVAGE_RARITY_BONUS)) {
    const bonus = SALVAGE_RARITY_BONUS[rarity];
    for (let i = 0; i < 50; i++) {
      const amount = salvageYield(rarity, 0);
      assert.ok(amount >= SALVAGE_BASE_MIN + bonus, `${rarity} yielded ${amount}`);
      assert.ok(amount <= SALVAGE_BASE_MAX + bonus, `${rarity} yielded ${amount}`);
    }
  }
});

test('Salvaging rank compounds the haul rather than adding to it', () => {
  const avg = (rank) => {
    let total = 0;
    for (let i = 0; i < 400; i++) total += salvageYield('Common', rank);
    return total / 400;
  };
  const r0 = avg(0);
  const r25 = avg(25);
  const r50 = avg(50);
  assert.ok(r25 > r0 * 1.5, `rank 25 (${r25.toFixed(1)}) should clearly beat rank 0 (${r0.toFixed(1)})`);
  // Compounding: the step from 25 to 50 is bigger than the step from 0 to 25.
  assert.ok(r50 - r25 > r25 - r0, `not compounding: ${r0.toFixed(1)} -> ${r25.toFixed(1)} -> ${r50.toFixed(1)}`);
});

test('salvaging a non-existent item does nothing', () => {
  const s = createInitialState();
  assert.equal(salvageItem(s, 12345), null);
});

test("gear dropped in a dungeon is made of that dungeon's own material", () => {
  // A clear pays out one material; the gear along the way salvages into the same
  // pile, so a run's whole haul feeds one stack instead of scattering.
  let matched = 0;
  let weapons = 0;
  for (let i = 0; i < 200; i++) {
    const item = generateItem(20, { forceSlot: 'weapon', preferMaterial: 'mahogany' });
    weapons++;
    if (item.material === 'mahogany') matched++;
  }
  assert.equal(matched, weapons, 'every weapon should take the preferred material');
});

test('a preferred material that cannot belong to the slot is ignored', () => {
  // Tinkering keys off material category (see SLOT_MATERIAL_CATEGORY), so a ring
  // made of Mahogany would break its rules. The slot's own pool wins instead.
  for (let i = 0; i < 50; i++) {
    const ring = generateItem(20, { forceSlot: 'ring', preferMaterial: 'mahogany' });
    assert.notEqual(ring.material, 'mahogany');
    assert.ok(ring.material, 'a ring should still get some material');
  }
});
