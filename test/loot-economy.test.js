import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { POIS, DAMAGE_TYPES } from '../src/data/regions.js';
import { TUTORIAL_ROAD } from '../src/data/tutorial.js';
import { classify, isClassified, KINDS, SIZES, kindOf, sizeOf } from '../src/data/bestiary.js';
import {
  generateItem,
  rollDrop,
  salvageItem,
  salvageAll,
  shouldAutoSalvage,
  dropChanceFor,
  dropSlotsFor,
  DROP_CHANCE,
  KIND_DROP_MULT,
  SMALL_CREATURE_SLOTS,
  AUTO_SALVAGE_OFF,
} from '../src/game/loot.js';
import { clearYield, gatherMultiplier, milestoneBonus, nextMilestone, GATHER_MILESTONES } from '../src/game/waves.js';
import { creatureArt, CREATURE_SHAPES } from '../src/ui/creatureArt.js';
import { RARITIES } from '../src/data/items.js';

function everyMonsterName() {
  const names = new Set();
  for (const p of POIS) {
    for (const m of p.monsters || []) names.add(m.name);
    if (p.boss) names.add(p.boss.name);
  }
  for (const m of TUTORIAL_ROAD.monsters) names.add(m.name);
  return [...names];
}

// --- Bestiary --------------------------------------------------------------

test('every creature in the game is classified, none by accident', () => {
  const unclassified = everyMonsterName().filter((n) => !isClassified(n));
  assert.deepEqual(unclassified, [], `these fell through to the default: ${unclassified.join(', ')}`);
});

test('classification only ever returns kinds and sizes that exist', () => {
  for (const name of everyMonsterName()) {
    const { kind, size } = classify(name);
    assert.ok(KINDS.includes(kind), `${name} has unknown kind ${kind}`);
    assert.ok(SIZES.includes(size), `${name} has unknown size ${size}`);
  }
});

test('the obvious cases land where a player would expect', () => {
  assert.equal(kindOf('Drudge Skulker'), 'humanoid');
  assert.equal(kindOf('Banderling Warlord'), 'humanoid');
  assert.equal(kindOf('Skeleton Lord'), 'undead');
  assert.equal(kindOf('Rockslide Golem'), 'construct');
  assert.equal(kindOf('Wailing Banshee'), 'spirit');
  assert.equal(kindOf('Brown Rat'), 'beast');

  assert.equal(sizeOf('Rabbit'), 'small');
  assert.equal(sizeOf('Grave Mite'), 'small');
  assert.equal(sizeOf('Magma Golem'), 'large');
  assert.equal(sizeOf('Drudge'), 'medium');
});

test('an unknown name is classified rather than crashing', () => {
  const { kind, size } = classify('Something Nobody Wrote Down');
  assert.ok(KINDS.includes(kind));
  assert.ok(SIZES.includes(size));
  assert.equal(classify(null).kind, 'beast');
});

// --- Who drops what --------------------------------------------------------

test('things that carry equipment drop it more often than things that do not', () => {
  assert.ok(dropChanceFor('Drudge') > dropChanceFor('Brown Rat'), 'a drudge has a belt; a rat has a nest');
  assert.ok(dropChanceFor('Skeleton') > dropChanceFor('Shreth'));
  assert.ok(dropChanceFor('Shallow Wisp') < DROP_CHANCE, 'a spirit has no pockets at all');
  assert.ok(KIND_DROP_MULT.humanoid > 1 && KIND_DROP_MULT.beast < 1);
});

test('a small creature is never carrying a breastplate', () => {
  assert.deepEqual(dropSlotsFor('Brown Rat'), SMALL_CREATURE_SLOTS);
  assert.equal(dropSlotsFor('Drudge'), null, 'a full-sized humanoid can drop anything');

  // And the generator honours it.
  for (let i = 0; i < 60; i++) {
    const item = generateItem(20, { slotPool: SMALL_CREATURE_SLOTS });
    assert.ok(SMALL_CREATURE_SLOTS.includes(item.slot), `a rat produced a ${item.slot}`);
  }
});

test('rolling a drop off a rat only ever yields jewelry', () => {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: 'rat-nest' };
  let found = 0;
  for (let i = 0; i < 4000 && found < 25; i++) {
    const drop = rollDrop(s, 'Brown Rat');
    if (!drop) continue;
    found += 1;
    assert.ok(SMALL_CREATURE_SLOTS.includes(drop.slot), `a rat dropped a ${drop.slot}`);
  }
  assert.ok(found > 0, 'rats should drop something eventually');
});

test('a humanoid in the same dungeon can drop anything at all', () => {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: 'drudge-hideout' };
  const slots = new Set();
  for (let i = 0; i < 6000; i++) {
    const drop = rollDrop(s, 'Drudge');
    if (drop) slots.add(drop.slot);
  }
  assert.ok(slots.size > SMALL_CREATURE_SLOTS.length, `only saw ${[...slots].join(', ')}`);
});

// --- Salvaging -------------------------------------------------------------

test('salvaging a bagful ranks you up partway through it', () => {
  const s = createInitialState();
  for (let i = 0; i < 40; i++) s.inventory.push(generateItem(20));
  const before = s.hero.skills.salvaging.rank;

  const summary = salvageAll(s);
  assert.ok(summary, 'something should have been broken down');
  assert.equal(summary.count, 40);
  assert.equal(s.inventory.length, 0, 'the bag should be empty');
  assert.ok(s.hero.skills.salvaging.rank > before, 'the batch should have trained Salvaging');
  assert.equal(summary.ranksGained, s.hero.skills.salvaging.rank - before);
  assert.ok(Object.values(summary.materials).reduce((a, b) => a + b, 0) > 0);
});

test('the last of a pile is worth more than the first, because you learned', () => {
  // This is the whole reason mass-salvage processes one at a time rather than
  // multiplying a single yield by a count.
  const haulOf = (batchSize) => {
    const s = createInitialState();
    for (let i = 0; i < batchSize; i++) {
      s.inventory.push(generateItem(20, { forceSlot: 'ring' }));
    }
    const summary = salvageAll(s);
    return { total: Object.values(summary.materials).reduce((a, b) => a + b, 0), rank: s.hero.skills.salvaging.rank };
  };

  // Averaged, because each individual yield has a random component.
  let smallPer = 0;
  let bigPer = 0;
  const runs = 30;
  for (let i = 0; i < runs; i++) {
    smallPer += haulOf(5).total / 5;
    bigPer += haulOf(120).total / 120;
  }
  assert.ok(bigPer / runs > smallPer / runs, `120 at a time averaged ${(bigPer / runs).toFixed(2)} vs ${(smallPer / runs).toFixed(2)} for 5`);
});

test('salvage-all obeys a filter, and reports nothing when nothing matches', () => {
  const s = createInitialState();
  for (let i = 0; i < 10; i++) s.inventory.push(generateItem(20, { forceSlot: 'ring' }));
  for (let i = 0; i < 4; i++) s.inventory.push(generateItem(20, { forceSlot: 'chest' }));

  const summary = salvageAll(s, (it) => it.slot === 'ring');
  assert.equal(summary.count, 10);
  assert.equal(s.inventory.length, 4, 'the chest pieces should have been left alone');
  assert.ok(s.inventory.every((it) => it.slot === 'chest'));

  assert.equal(salvageAll(s, (it) => it.slot === 'weapon'), null, 'no match means no summary');
  assert.equal(s.inventory.length, 4, 'and nothing destroyed');
});

test('auto-salvage is off by default and only takes what it is told to', () => {
  const s = createInitialState();
  assert.equal(s.settings.autoSalvage, AUTO_SALVAGE_OFF);
  const common = { rarity: 'Common', material: 'iron' };
  const legendary = { rarity: 'Legendary', material: 'iron' };
  assert.equal(shouldAutoSalvage(s, common), false, 'off means off');

  s.settings.autoSalvage = 'Common';
  assert.equal(shouldAutoSalvage(s, common), true);
  assert.equal(shouldAutoSalvage(s, { rarity: 'Uncommon', material: 'iron' }), false);
  assert.equal(shouldAutoSalvage(s, legendary), false, 'it must never eat the good stuff');

  s.settings.autoSalvage = 'Rare';
  for (const r of ['Common', 'Uncommon', 'Rare']) {
    assert.equal(shouldAutoSalvage(s, { rarity: r, material: 'iron' }), true, `${r} should be taken`);
  }
  for (const r of ['Epic', 'Legendary']) {
    assert.equal(shouldAutoSalvage(s, { rarity: r, material: 'iron' }), false, `${r} should be kept`);
  }
});

test('auto-salvage never touches something with no material to give back', () => {
  const s = createInitialState();
  s.settings.autoSalvage = RARITIES[RARITIES.length - 1].name; // everything
  assert.equal(shouldAutoSalvage(s, { rarity: 'Common', material: null }), false);
});

// --- Gathering scaling -----------------------------------------------------

test('a gathering rank is always worth something, and milestones are worth more', () => {
  assert.equal(gatherMultiplier(0), 1);
  let last = 1;
  for (let rank = 1; rank <= 100; rank++) {
    const now = gatherMultiplier(rank);
    assert.ok(now > last, `rank ${rank} should beat rank ${rank - 1}`);
    last = now;
  }
});

test('each milestone lands as a visible step, not a rounding difference', () => {
  for (const m of GATHER_MILESTONES) {
    const before = gatherMultiplier(m.rank - 1);
    const after = gatherMultiplier(m.rank);
    const step = after - before;
    assert.ok(step > 0.1, `the ${m.rank} milestone only moved the haul by ${step.toFixed(3)}`);
    assert.ok(m.text, `the ${m.rank} milestone should say something`);
  }
  assert.equal(milestoneBonus(0), 0);
  assert.ok(milestoneBonus(100) > milestoneBonus(50));
});

test('the curve tops out generous but not absurd', () => {
  const top = gatherMultiplier(100);
  assert.ok(top > 3, `mastery only reached ${top.toFixed(2)}x`);
  assert.ok(top < 8, `mastery reached ${top.toFixed(2)}x, which is a different economy`);
});

test('nextMilestone points at the one you are working toward', () => {
  assert.equal(nextMilestone(0).rank, GATHER_MILESTONES[0].rank);
  assert.equal(nextMilestone(GATHER_MILESTONES[0].rank).rank, GATHER_MILESTONES[1].rank);
  assert.equal(nextMilestone(100), null, 'there is nothing after the last one');
});

test('a clear pays out more once the skill that governs it is trained', () => {
  const s = createInitialState();
  const base = clearYield(s, 'mining');
  s.hero.skills.gathering.mining.rank = 50;
  const trained = clearYield(s, 'mining');
  assert.ok(trained > base, `${trained} should beat ${base}`);
  // And it's the POI's own skill that matters, not gathering in general.
  assert.equal(clearYield(s, 'fishing'), base, 'an untrained skill hauls the base amount');
});

// --- Creature art ----------------------------------------------------------

test('every kind has a silhouette, and every creature resolves to one', () => {
  for (const kind of KINDS) {
    assert.ok(CREATURE_SHAPES[kind], `${kind} has no shape`);
  }
  for (const name of everyMonsterName()) {
    const svg = creatureArt(name);
    assert.match(svg, /^<svg /, `${name} produced no art`);
    assert.ok(svg.includes('viewBox="0 0 32 32"'));
  }
});

test('a rat is drawn smaller than a golem', () => {
  const rat = creatureArt('Brown Rat');
  const golem = creatureArt('Magma Golem');
  assert.match(rat, /scale\(0\.72\)/);
  assert.match(golem, /scale\(1\.22\)/);
  assert.ok(!creatureArt('Drudge').includes('scale('), 'a medium creature needs no transform');
});

test('creature art is decorative, and says so to a screen reader', () => {
  assert.ok(creatureArt('Drudge').includes('aria-hidden="true"'));
});
