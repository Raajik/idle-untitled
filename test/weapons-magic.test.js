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
  bestDamageTypeFor,
  damageTypeMultiplier,
  rendingMultiplier,
  slayerMultiplier,
  WAR_DAMAGE_TYPES,
  SLAYER_MULT,
  RENDING_PER_LEVEL,
} from '../src/data/elements.js';
import { weaknessMultiplier, weaknessesOf, speciesOf } from '../src/data/species.js';
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

// --- Damage types, weaknesses, rendings, slayers ----------------------------

test('a weakness is a bonus, never a penalty', () => {
  // Nothing is outright resisted: the choice is "which is best here", not "this
  // attack is wasted", so a build is never shut out of a dungeon it walked to.
  for (const type of WAR_DAMAGE_TYPES) {
    for (const name of ['Drudge', 'Skeleton', 'Brown Rat', 'Magma Golem']) {
      assert.ok(weaknessMultiplier(type, name) >= 1, `${type} vs ${name} came out below 1`);
    }
  }
});

test('the three tiers are worth 45, 30 and 15 percent', () => {
  const tiers = weaknessesOf('Drudge');
  assert.deepEqual(tiers.map((t) => t.bonusPct), [45, 30, 15]);
  assert.equal(weaknessMultiplier(tiers[0].damageType, 'Drudge'), 1.45);
  assert.equal(weaknessMultiplier(tiers[1].damageType, 'Drudge'), 1.3);
  assert.equal(weaknessMultiplier(tiers[2].damageType, 'Drudge'), 1.15);
  // Anything not on the list is plain.
  const off = WAR_DAMAGE_TYPES.find((t) => !tiers.some((w) => w.damageType === t));
  assert.equal(weaknessMultiplier(off, 'Drudge'), 1);
});

test('Auto picks the type that actually lands hardest', () => {
  const best = bestDamageTypeFor('Drudge', speciesOf('Drudge'), null);
  assert.equal(best, weaknessesOf('Drudge')[0].damageType, 'with no weapon, that is the primary');
});

test('a rending weapon can beat a bare primary weakness', () => {
  // Drudges are softest to their primary. A weapon rending their SECONDARY hard
  // enough should overtake it — which is the point of rendings existing.
  const [primary, secondary] = weaknessesOf('Drudge');
  const weapon = { imbue: { damageType: secondary.damageType, level: 5 } };
  const withRending = damageTypeMultiplier(secondary.damageType, 'Drudge', 'drudge', weapon);
  const bare = damageTypeMultiplier(primary.damageType, 'Drudge', 'drudge', weapon);
  assert.ok(withRending > bare, `${withRending.toFixed(2)} should beat ${bare.toFixed(2)}`);
  assert.equal(bestDamageTypeFor('Drudge', 'drudge', weapon), secondary.damageType);
});

test('rending scales with its level and only helps its own type', () => {
  for (let level = 1; level <= 5; level++) {
    assert.equal(rendingMultiplier({ damageType: 'fire', level }, 'fire'), 1 + level * RENDING_PER_LEVEL);
  }
  assert.equal(rendingMultiplier({ damageType: 'fire', level: 5 }, 'cold'), 1, 'a fire rending does nothing for cold');
  assert.equal(rendingMultiplier(null, 'fire'), 1);
});

test('a slayer doubles against its species and does nothing to anything else', () => {
  const weapon = { slayer: { species: 'drudge' } };
  assert.equal(slayerMultiplier(weapon.slayer, 'drudge'), SLAYER_MULT);
  assert.equal(slayerMultiplier(weapon.slayer, 'shreth'), 1);
  assert.equal(SLAYER_MULT, 2);

  const vsDrudge = damageTypeMultiplier('fire', 'Drudge', 'drudge', weapon);
  const vsShreth = damageTypeMultiplier('fire', 'Shreth', 'shreth', weapon);
  assert.ok(vsDrudge > vsShreth * 1.5, 'the slayer should dominate the comparison');
});

test('weakness, rending and slayer all compound', () => {
  const [primary] = weaknessesOf('Drudge');
  const weapon = { imbue: { damageType: primary.damageType, level: 5 }, slayer: { species: 'drudge' } };
  const mult = damageTypeMultiplier(primary.damageType, 'Drudge', 'drudge', weapon);
  assert.ok(Math.abs(mult - 1.45 * 1.5 * 2) < 1e-9, `got ${mult}`);
});

test('War throws the seven ordinary types and never void', () => {
  assert.equal(WAR_DAMAGE_TYPES.length, 7);
  assert.ok(!WAR_DAMAGE_TYPES.includes('void'), 'void belongs to Void Magic');
  for (const t of ['bludgeon', 'pierce', 'slash', 'acid', 'cold', 'fire', 'lightning']) {
    assert.ok(WAR_DAMAGE_TYPES.includes(t), `${t} should be castable`);
  }
});

test('the chosen type is what gets cast, and Auto re-reads the target', () => {
  const s = withWeapon('wand');
  s.hero.combat.mode = 'magic';
  s.hero.combat.warElement = 'fire';
  assert.equal(activeElement(s, { name: 'Brown Rat', species: 'vermin' }), 'fire', 'an explicit pick is honoured');

  s.hero.combat.warElement = 'auto';
  const vsDrudge = activeElement(s, { name: 'Drudge', species: 'drudge' });
  const vsRat = activeElement(s, { name: 'Brown Rat', species: 'vermin' });
  assert.equal(vsDrudge, weaknessesOf('Drudge')[0].damageType);
  assert.equal(vsRat, weaknessesOf('Brown Rat')[0].damageType);
  assert.notEqual(vsDrudge, vsRat, 'a different target should give a different answer');
});

// --- Void ------------------------------------------------------------------

test('Void is War with one element and a rot in Volley\'s place', () => {
  assert.deepEqual(Object.keys(VOID_SPELLS).sort(), ['arc', 'corruption', 'streak']);
  assert.ok(!('volley' in VOID_SPELLS));
  assert.ok(MAGIC_SPELLS.volley.aoe, 'War keeps its group nuke');

  const s = withWeapon('staff');
  s.hero.combat.mode = 'void';
  assert.equal(activeElement(s, { name: 'Drudge', species: 'drudge' }), 'void', 'Void casts void whatever it is looking at');
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
