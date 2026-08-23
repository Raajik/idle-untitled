import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { derivedStats } from '../src/game/hero.js';
import { activeAttackInterval, spellManaCost } from '../src/game/combat.js';
import { activeWeaponSkill } from '../src/game/skills.js';
import { WEAPON_CLASSES, BASE_NAMES, ITEM_ICONS, weaponClass } from '../src/data/items.js';
import { MAGIC_SPELLS } from '../src/data/combatStances.js';
import { TINKER_RECIPES, recipeFor } from '../src/data/tinkering.js';
import { getMaterial, GATHER_MATERIAL_POOLS } from '../src/data/materials.js';
import {
  applyTinkering,
  canTinker,
  tinkerEffectFor,
  tinkerCostFor,
  tinkerCostAtLevel,
  TINKER_BASE_COST,
} from '../src/game/tinkering.js';
import { POIS, isSite } from '../src/data/regions.js';

function heroWith(baseType, power = 20) {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: 'drudge-hideout' };
  s.equipment.weapon = { id: 1, slot: 'weapon', baseType, power, spells: [], rarity: 'Common', name: `Test ${baseType}` };
  return s;
}

test('every weapon base name belongs to exactly one class and has an icon', () => {
  for (const base of BASE_NAMES.weapon) {
    const type = base.toLowerCase();
    const cls = weaponClass(type);
    assert.ok(cls, `${base} belongs to no weapon class`);
    const classesContaining = Object.values(WEAPON_CLASSES).filter((types) => types.includes(type));
    assert.equal(classesContaining.length, 1, `${base} is in more than one class`);
    assert.ok(ITEM_ICONS[type], `${base} has no icon`);
  }
});

test('a casting device sharpens magic, not swordplay', () => {
  const blade = heroWith('sword');
  const wand = heroWith('wand');
  const bare = createInitialState();

  assert.ok(derivedStats(blade).atk > derivedStats(bare).atk, 'a sword should raise ATK');
  assert.equal(derivedStats(wand).atk, derivedStats(bare).atk, 'a wand should do nothing for ATK');
  assert.ok(derivedStats(wand).magicAtk > derivedStats(bare).magicAtk, 'a wand should raise Magic ATK');
  assert.equal(derivedStats(blade).magicAtk, derivedStats(bare).magicAtk, 'a sword should do nothing for Magic ATK');
});

test('casting devices channel War Magic', () => {
  for (const type of WEAPON_CLASSES.magic) {
    const s = heroWith(type);
    assert.equal(activeWeaponSkill(s).key, 'war', `${type} should train War Magic`);
  }
});

test('Alacrity shortens every windup, cast times included', () => {
  const plain = heroWith('sword');
  const quick = heroWith('sword');
  quick.equipment.weapon.spells = [{ id: 'attackSpeed', level: 4, value: 20, meta: {}, label: 'Alacrity IV' }];

  for (const mode of ['melee', 'archery', 'magic']) {
    plain.hero.combat.mode = mode;
    quick.hero.combat.mode = mode;
    const before = activeAttackInterval(plain, derivedStats(plain));
    const after = activeAttackInterval(quick, derivedStats(quick));
    assert.ok(after < before, `${mode} windup should shorten`);
  }
});

test('Frugality makes casts cheaper but never free', () => {
  const s = heroWith('orb');
  const spell = MAGIC_SPELLS.arc;
  const full = spellManaCost(spell, derivedStats(s));
  s.equipment.weapon.spells = [{ id: 'spellEfficiency', level: 5, value: 30, meta: {}, label: 'Frugality V' }];
  const cheap = spellManaCost(spell, derivedStats(s));
  assert.ok(cheap < full);
  assert.ok(cheap >= 1);

  s.equipment.weapon.spells = [{ id: 'spellEfficiency', level: 8, value: 999, meta: {}, label: 'Frugality VIII' }];
  assert.ok(spellManaCost(spell, derivedStats(s)) >= 1, 'a cast always costs something');
});

test('Guard feeds all three defensive layers, Evasion only Dodge', () => {
  const guarded = heroWith('sword');
  guarded.equipment.weapon.spells = [{ id: 'guard', level: 3, value: 5, meta: {}, label: 'Guard III' }];
  const g = derivedStats(guarded);
  assert.equal(g.dodgeBonus, 5);
  assert.equal(g.blockBonus, 5);
  assert.equal(g.parryBonus, 5);

  const evasive = heroWith('bow');
  evasive.equipment.weapon.spells = [{ id: 'evasion', level: 3, value: 5, meta: {}, label: 'Evasion III' }];
  const e = derivedStats(evasive);
  assert.equal(e.dodgeBonus, 5);
  assert.equal(e.blockBonus, 0);
  assert.equal(e.parryBonus, 0);
});

test('each weapon class takes only the materials its recipes name', () => {
  const cases = [
    ['sword', 'melee'],
    ['bow', 'ranged'],
    ['wand', 'magic'],
  ];
  for (const [type, cls] of cases) {
    const s = heroWith(type);
    for (const materialId of Object.keys(TINKER_RECIPES[cls])) {
      assert.equal(tinkerEffectFor(s, 'weapon', materialId), TINKER_RECIPES[cls][materialId]);
    }
    // A material another class wants but this one has no use for is refused.
    const foreign = Object.keys(TINKER_RECIPES)
      .filter((other) => other !== cls)
      .flatMap((other) => Object.keys(TINKER_RECIPES[other]))
      .filter((id) => !TINKER_RECIPES[cls][id]);
    for (const materialId of foreign) {
      assert.equal(tinkerEffectFor(s, 'weapon', materialId), null, `${cls} should refuse ${materialId}`);
    }
  }
});

test('tinkering a weapon teaches exactly the property its material names', () => {
  const s = heroWith('sword');
  s.materials['granite'] = TINKER_BASE_COST * 20;
  assert.equal(applyTinkering(s, 'weapon', 'granite'), true);
  assert.equal(s.equipment.weapon.spells.length, 1);
  assert.equal(s.equipment.weapon.spells[0].id, 'minDamage', 'granite tempers, it does not do something random');

  // Applying it again deepens the same property rather than adding a new one.
  const levelBefore = s.equipment.weapon.spells[0].level;
  applyTinkering(s, 'weapon', 'granite');
  assert.equal(s.equipment.weapon.spells.length, 1);
  assert.ok(s.equipment.weapon.spells[0].level > levelBefore);
});

test('velvet, brass and oak are wanted by every weapon class', () => {
  for (const materialId of ['velvet', 'brass', 'oak']) {
    for (const cls of Object.keys(TINKER_RECIPES)) {
      assert.ok(recipeFor(cls, materialId), `${cls} should have a use for ${materialId}`);
    }
  }
});

test('every material a recipe names is a real, farmable material', () => {
  const farmable = new Set(POIS.filter((p) => !isSite(p)).map((p) => p.gather.material));
  for (const [cls, recipes] of Object.entries(TINKER_RECIPES)) {
    for (const materialId of Object.keys(recipes)) {
      assert.ok(getMaterial(materialId), `${cls} names unknown material ${materialId}`);
      assert.ok(
        Object.values(GATHER_MATERIAL_POOLS).some((pool) => pool.includes(materialId)),
        `${materialId} is in no gathering pool`
      );
      assert.ok(farmable.has(materialId), `${materialId} is not the payout of any POI`);
    }
  }
});

test('deepening a property gets steeply more expensive', () => {
  const costs = [0, 1, 2, 3, 4, 5, 6, 7].map((lvl) => tinkerCostAtLevel(lvl));
  assert.equal(costs[0], TINKER_BASE_COST, 'the first pass is the base cost');
  for (let i = 1; i < costs.length; i++) {
    assert.ok(costs[i] > costs[i - 1], `cost should climb at every level: ${costs}`);
    // Compounding, not a flat step — later passes have to hurt.
    if (i > 1) assert.ok(costs[i] - costs[i - 1] >= costs[i - 1] - costs[i - 2]);
  }
  assert.ok(costs[7] > TINKER_BASE_COST * 20, `top of the curve was only ${costs[7]}`);
});

test('the cost quoted is the cost charged, and it tracks the property', () => {
  const s = heroWith('sword');
  s.materials['iron'] = 500;
  for (let pass = 0; pass < 4; pass++) {
    const quoted = tinkerCostFor(s, 'weapon', 'iron');
    const before = s.materials['iron'];
    assert.equal(applyTinkering(s, 'weapon', 'iron'), true);
    assert.equal(before - s.materials['iron'], quoted, `pass ${pass + 1} charged the wrong amount`);
  }
  // Four passes in, the next one costs more than the first four did.
  assert.ok(tinkerCostFor(s, 'weapon', 'iron') > tinkerCostAtLevel(0) * 4);
});

test('an unaffordable tinker is refused rather than half-applied', () => {
  const s = heroWith('sword');
  s.materials['iron'] = tinkerCostAtLevel(0) - 1;
  assert.equal(canTinker(s, 'weapon', 'iron'), false);
  assert.equal(applyTinkering(s, 'weapon', 'iron'), false);
  assert.equal(s.equipment.weapon.spells.length, 0);
  assert.equal(s.materials['iron'], tinkerCostAtLevel(0) - 1, 'nothing should have been spent');
});
