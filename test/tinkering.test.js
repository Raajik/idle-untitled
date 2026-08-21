import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { canTinker, applyTinkering, TINKER_COST } from '../src/game/tinkering.js';

test('a material can only tinker the slot matching its category', () => {
  const s = createInitialState();
  s.equipment.weapon = { slot: 'weapon', power: 5, affixes: [], rarity: 'Common', name: 'Worn Sword', baseType: 'sword' };
  s.materials['iron'] = TINKER_COST; // weapon-category material
  s.materials['agate'] = TINKER_COST; // magic-item-category material

  assert.equal(canTinker(s, 'weapon', 'iron'), true);
  assert.equal(canTinker(s, 'weapon', 'agate'), false); // wrong category for this slot
  assert.equal(canTinker(s, 'ring', 'iron'), false); // no ring equipped at all
});

test('applyTinkering consumes materials and boosts an affix on the item', () => {
  const s = createInitialState();
  s.equipment.weapon = { slot: 'weapon', power: 5, affixes: [], rarity: 'Common', name: 'Worn Sword', baseType: 'sword' };
  s.materials['iron'] = TINKER_COST;

  assert.equal(applyTinkering(s, 'weapon', 'iron'), true);
  assert.equal(s.materials['iron'], 0);
  assert.equal(s.equipment.weapon.affixes.length, 1);
  assert.ok(s.hero.skills.tinkering.xp > 0 || s.hero.skills.tinkering.rank > 0);

  // Not enough material left for a second application.
  assert.equal(applyTinkering(s, 'weapon', 'iron'), false);
});
