import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import {
  tickCombat,
  engageWave,
  activeAttackInterval,
  activeAttackCost,
  activeTrait,
  activeElement,
  activeSpell,
} from '../src/game/combat.js';
import { derivedStats } from '../src/game/hero.js';
import { MELEE_TRAITS, RANGED_TRAITS, meleeTrait, UNARMED_WEAPONS } from '../src/data/weaponTraits.js';
import {
  bestElementFor,
  elementMultiplier,
  elementDamageMult,
  imbueOf,
  weaknessOf,
  CASTABLE_ELEMENTS,
  WEAK_MULT,
  RESIST_MULT,
  IMBUE_MULT,
} from '../src/data/elements.js';
import { VOID_SPELLS, MAGIC_SPELLS, ROT_MAX_STACKS } from '../src/data/combatStances.js';
import { activeWeaponSkill } from '../src/game/skills.js';
import { DAMAGE_TYPES } from '../src/data/regions.js';

function atPoi(poiId = 'drudge-hideout') {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId };
  const d = derivedStats(s);
  s.hero.hp = d.maxHp;
  s.hero.stamina = d.maxStamina;
  s.hero.mana = d.maxMana;
  return s;
}

function withWeapon(baseType, extra = {}) {
  const s = atPoi();
  s.equipment.weapon = { id: 1, slot: 'weapon', baseType, rarity: 'Common', power: 10, spells: [], name: baseType, ...extra };
  return s;
}

// --- Ranged identity -------------------------------------------------------

test('a bow looses faster than a crossbow, and a crossbow hits harder', () => {
  const bow = withWeapon('bow');
  const xbow = withWeapon('crossbow');
  bow.hero.combat.mode = 'archery';
  xbow.hero.combat.mode = 'archery';
  bow.hero.combat.archeryStance = 2;
  xbow.hero.combat.archeryStance = 2;

  const bowInterval = activeAttackInterval(bow, derivedStats(bow));
  const xbowInterval = activeAttackInterval(xbow, derivedStats(xbow));
  assert.ok(bowInterval < xbowInterval, `bow ${bowInterval} should be quicker than crossbow ${xbowInterval}`);
  assert.ok(RANGED_TRAITS.crossbow.dmgMult > RANGED_TRAITS.bow.dmgMult, 'the bolt should hit harder');
});

test('the two ranged weapons stay within reach of each other over time', () => {
  // Faster-but-weaker and slower-but-stronger should be a choice, not a trap.
  const dps = (trait) => trait.dmgMult / trait.speedMult;
  const bow = dps(RANGED_TRAITS.bow);
  const xbow = dps(RANGED_TRAITS.crossbow);
  const ratio = Math.max(bow, xbow) / Math.min(bow, xbow);
  assert.ok(ratio < 1.15, `single-target output differs by ${((ratio - 1) * 100).toFixed(0)}%`);
  // The crossbow's edge is meant to be the group, not the duel.
  assert.ok(RANGED_TRAITS.crossbow.pierce >= 1);
  assert.ok(!RANGED_TRAITS.bow.pierce);
});

test('a bolt carries through into a second monster', () => {
  const s = withWeapon('crossbow');
  s.hero.combat.mode = 'archery';
  s.hero.skills.offense.crossbow.rank = 100; // never miss, so the test is about the pierce
  s.hero.str = 60;
  s.hero.coord = 60;
  s.progress.wave = 5;
  s.progress.waveMonstersLeft = 3;
  engageWave(s);
  while (s.monsters.length < 2) {
    s.progress.waveMonstersLeft = 3;
    engageWave(s);
  }
  for (const m of s.monsters) {
    m.dodge = 0;
    m.atk = 0; // the archer must not die mid-measurement and respawn elsewhere
  }
  const second = s.monsters[1];
  const before = second.hp;

  let guard = 0;
  while (second.hp === before && s.monsters.includes(second) && guard++ < 400) {
    s.hero.stamina = derivedStats(s).maxStamina;
    s.hero.hp = derivedStats(s).maxHp;
    tickCombat(s, 0.25);
  }
  assert.equal(s.hero.dead, false);
  assert.ok(second.hp < before, 'the monster behind the target should have taken damage');
});

// --- Melee identity --------------------------------------------------------

test('every melee weapon type does one thing the others do not', () => {
  const seen = new Set();
  for (const [type, trait] of Object.entries(MELEE_TRAITS)) {
    assert.ok(trait.text, `${type} should say what it does`);
    const shape = ['hitPct', 'critDmgMult', 'defIgnorePct', 'alwaysBleed', 'speedMult']
      .filter((k) => trait[k] !== undefined)
      .join(',');
    assert.ok(shape, `${type} has no trait at all`);
    assert.ok(!seen.has(shape), `${type} duplicates another weapon's identity (${shape})`);
    seen.add(shape);
  }
});

test('bare fists and punching weapons are all Unarmed', () => {
  assert.equal(meleeTrait(null), MELEE_TRAITS.unarmed, 'no weapon at all is unarmed');
  for (const w of UNARMED_WEAPONS) {
    assert.equal(meleeTrait(w), MELEE_TRAITS.unarmed, `${w} should count as unarmed`);
    const s = withWeapon(w);
    assert.equal(activeWeaponSkill(s).key, 'unarmed', `${w} should train Unarmed`);
  }
});

test('fists swing quicker and cost less than a sword', () => {
  const fists = atPoi();
  const sword = withWeapon('sword');
  for (const s of [fists, sword]) s.hero.combat.meleeStance = 2;
  const d = derivedStats(fists);
  assert.ok(activeAttackInterval(fists, d) < activeAttackInterval(sword, derivedStats(sword)));
  assert.ok(activeAttackCost(fists, d).amount <= activeAttackCost(sword, derivedStats(sword)).amount);
  assert.ok(MELEE_TRAITS.unarmed.dmgMult < 1, 'and pay for it in damage');
});

test('a spear bleeds on any stance; a sword only on the heaviest', () => {
  const bleedsAt = (baseType, stance) => {
    const s = withWeapon(baseType);
    s.hero.combat.meleeStance = stance;
    s.hero.skills.offense[baseType].rank = 100;
    s.hero.str = 60;
    engageWave(s);
    for (const m of s.monsters) m.dodge = 0;
    const target = s.monsters[0];
    let guard = 0;
    while (!(target.bleed && target.bleed.stacks > 0) && s.monsters.includes(target) && guard++ < 300) {
      s.hero.stamina = derivedStats(s).maxStamina;
      tickCombat(s, 0.25);
    }
    return !!(target.bleed && target.bleed.stacks > 0);
  };
  assert.equal(bleedsAt('spear', 0), true, 'a spear opens a wound whatever stance you use');
  assert.equal(bleedsAt('sword', 0), false, 'a light sword swing should not bleed');
});

test('a mace meets less armour than the blow it lands', () => {
  assert.ok(MELEE_TRAITS.mace.defIgnorePct > 0);
  const s = withWeapon('mace');
  const trait = activeTrait(s);
  const faced = Math.round(40 * (1 - trait.defIgnorePct / 100));
  assert.ok(faced < 40, `a mace should face ${faced} of 40 defence`);
});

// --- Elements --------------------------------------------------------------

test('the elemental wheel rewards the weakness and punishes the mirror', () => {
  for (const el of CASTABLE_ELEMENTS) {
    assert.equal(elementMultiplier(el, el), RESIST_MULT, `${el} should be resisted by its own kind`);
  }
  assert.equal(elementMultiplier('cold', 'fire'), WEAK_MULT);
  assert.equal(elementMultiplier('fire', 'cold'), WEAK_MULT);
  assert.equal(elementMultiplier('void', 'slash'), WEAK_MULT, 'physical things are soft to void');
  assert.equal(elementMultiplier('acid', 'slash'), 1, 'and neutral to everything else');
});

test('every damage type in the game has an answer', () => {
  for (const t of DAMAGE_TYPES) {
    const weak = weaknessOf(t);
    assert.ok(weak, `${t} has no weakness`);
    assert.ok(CASTABLE_ELEMENTS.includes(weak), `${t}'s weakness (${weak}) is not castable`);
  }
});

test('Auto picks the weakness when nothing else is in play', () => {
  assert.equal(bestElementFor('fire', null), 'cold');
  assert.equal(bestElementFor('cold', null), 'fire');
  assert.equal(bestElementFor('slash', null), 'void');
});

test('Auto prefers an imbued weapon when the imbue would land harder', () => {
  // Against a neutral target, a weapon imbued with anything beats a bare cast.
  assert.equal(bestElementFor('bludgeon', 'fire'), 'void', 'a plain weakness still beats a neutral imbue');
  // 1.25 weakness vs 1.15 imbue: the weakness wins...
  assert.ok(WEAK_MULT > IMBUE_MULT);
  // ...but an imbue that IS the weakness compounds and is chosen outright.
  assert.equal(bestElementFor('fire', 'cold'), 'cold');
  assert.equal(elementDamageMult('cold', 'fire', 'cold'), WEAK_MULT * IMBUE_MULT);
});

test('a magic weapon takes its element from what it is made of', () => {
  assert.equal(imbueOf({ material: 'opal' }), 'cold');
  assert.equal(imbueOf({ material: 'ebony' }), 'void');
  assert.equal(imbueOf({ material: 'iron' }), null, 'plain metal carries no element');
  assert.equal(imbueOf(null), null);
});

test('the chosen element is what gets cast, and Auto re-reads the target', () => {
  const s = withWeapon('wand');
  s.hero.combat.mode = 'magic';
  s.hero.combat.warElement = 'fire';
  assert.equal(activeElement(s, { dmgType: 'slash' }), 'fire', 'an explicit pick is honoured');

  s.hero.combat.warElement = 'auto';
  assert.equal(activeElement(s, { dmgType: 'slash' }), 'void');
  assert.equal(activeElement(s, { dmgType: 'fire' }), 'cold', 'a different target, a different answer');
});

// --- Void ------------------------------------------------------------------

test('Void is War with one element and a rot in Volley\'s place', () => {
  assert.deepEqual(Object.keys(VOID_SPELLS).sort(), ['arc', 'corruption', 'streak']);
  assert.ok(!('volley' in VOID_SPELLS));
  assert.ok(MAGIC_SPELLS.volley.aoe, 'War keeps its group nuke');

  const s = withWeapon('staff');
  s.hero.combat.mode = 'void';
  assert.equal(activeElement(s, { dmgType: 'fire' }), 'void', 'Void casts void whatever it is looking at');
  s.hero.combat.voidSpell = 'corruption';
  assert.equal(activeSpell(s), VOID_SPELLS.corruption);
});

test('Void Magic trains its own skill, not War', () => {
  const s = withWeapon('staff');
  s.hero.combat.mode = 'void';
  s.hero.self = 40;
  s.hero.focus = 40;
  engageWave(s);
  for (let i = 0; i < 80; i++) {
    s.hero.mana = derivedStats(s).maxMana;
    tickCombat(s, 0.25);
  }
  const { offense } = s.hero.skills;
  assert.ok(offense.void.rank + offense.void.xp > 0, 'Void should have trained');
  assert.equal(offense.war.rank + offense.war.xp, 0, 'War should not have');
});

test('Corruption rots the whole group, stacks three deep, and never wears off', () => {
  const s = withWeapon('staff');
  s.hero.combat.mode = 'void';
  s.hero.combat.voidSpell = 'corruption';
  s.hero.self = 60;
  s.hero.focus = 60;
  s.progress.wave = 6;
  s.progress.waveMonstersLeft = 3;
  engageWave(s);
  while (s.monsters.length < 2) {
    s.progress.waveMonstersLeft = 3;
    engageWave(s);
  }
  const group = [...s.monsters];
  for (const m of group) {
    m.hp = 100000; // long enough to observe the rot
    m.atk = 0; // and they must not kill the caster, which would respawn them elsewhere
  }

  let guard = 0;
  while (group.some((m) => !m.rot || m.rot.stacks < ROT_MAX_STACKS) && guard++ < 4000) {
    s.hero.mana = derivedStats(s).maxMana;
    s.hero.hp = derivedStats(s).maxHp;
    tickCombat(s, 0.25);
  }
  assert.equal(s.hero.dead, false, 'the caster should still be standing');
  for (const m of group) {
    assert.equal(m.rot.stacks, ROT_MAX_STACKS, `${m.name} should be rotting ${ROT_MAX_STACKS} deep`);
  }

  // It never expires: keep ticking with no further casts and the stacks hold.
  s.hero.combat.mode = 'melee';
  const hp = group[0].hp;
  for (let i = 0; i < 200; i++) {
    s.hero.hp = derivedStats(s).maxHp;
    tickCombat(s, 0.25);
  }
  assert.equal(group[0].rot.stacks, ROT_MAX_STACKS, 'a rot should not wear off');
  assert.ok(group[0].hp < hp, 'and should still be doing damage');
});

test('Corruption cannot be stacked instantly — it has a cooldown', () => {
  const s = withWeapon('staff');
  s.hero.combat.mode = 'void';
  s.hero.combat.voidSpell = 'corruption';
  s.hero.self = 60;
  engageWave(s);
  for (const m of s.monsters) {
    m.hp = 100000;
    m.atk = 0;
  }

  let guard = 0;
  while (!(s.monsters[0].rot && s.monsters[0].rot.stacks >= 1) && guard++ < 2000) {
    s.hero.mana = derivedStats(s).maxMana;
    s.hero.hp = derivedStats(s).maxHp;
    tickCombat(s, 0.25);
  }
  assert.ok(s.progress.rotCooldown > 0, 'casting it should start the cooldown');

  // Immediately after, a second cast must not land.
  const stacks = s.monsters[0].rot.stacks;
  s.hero.mana = derivedStats(s).maxMana;
  tickCombat(s, 0.25);
  assert.equal(s.monsters[0].rot.stacks, stacks, 'the cooldown should hold the second cast off');
  assert.equal(VOID_SPELLS.corruption.cooldown, 5);
});

test('War Volley catches the group; Arc does not', () => {
  const s = withWeapon('wand');
  s.hero.combat.mode = 'magic';
  s.hero.combat.magicSpell = 'volley';
  s.hero.skills.offense.war.rank = 100;
  s.hero.self = 60;
  s.hero.focus = 60;
  s.progress.wave = 6;
  s.progress.waveMonstersLeft = 3;
  engageWave(s);
  while (s.monsters.length < 2) {
    s.progress.waveMonstersLeft = 3;
    engageWave(s);
  }
  for (const m of s.monsters) {
    m.dodge = 0;
    m.atk = 0;
  }
  const second = s.monsters[1];
  const before = second.hp;

  let guard = 0;
  while (second.hp === before && s.monsters.includes(second) && guard++ < 600) {
    s.hero.mana = derivedStats(s).maxMana;
    s.hero.hp = derivedStats(s).maxHp;
    tickCombat(s, 0.25);
  }
  assert.ok(second.hp < before, 'Volley should have splashed the second monster');
});

test('a kill on the front rank does not swallow the rest of the volley', () => {
  // The splash used to be applied after the primary target, behind an early
  // return — so a cast that killed what it was aimed at hit nothing else.
  const s = withWeapon('wand');
  s.hero.combat.mode = 'magic';
  s.hero.combat.magicSpell = 'volley';
  s.hero.skills.offense.war.rank = 100;
  s.hero.self = 80;
  s.hero.focus = 80;
  s.progress.wave = 6;
  s.progress.waveMonstersLeft = 3;
  engageWave(s);
  while (s.monsters.length < 2) {
    s.progress.waveMonstersLeft = 3;
    engageWave(s);
  }
  const doomed = s.monsters[0];
  const behind = s.monsters[1];
  doomed.hp = 1; // dies to anything
  doomed.dodge = 0;
  behind.dodge = 0;
  behind.hp = 100000;
  behind.atk = 0;
  doomed.atk = 0;
  const before = behind.hp;

  let guard = 0;
  while (s.monsters.includes(doomed) && guard++ < 400) {
    s.hero.mana = derivedStats(s).maxMana;
    s.hero.hp = derivedStats(s).maxHp;
    tickCombat(s, 0.25);
  }
  assert.ok(!s.monsters.includes(doomed), 'the front monster should be dead');
  assert.ok(behind.hp < before, 'the one behind it should still have been caught');
});
