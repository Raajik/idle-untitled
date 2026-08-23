import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { DAMAGE_TYPES, POIS, REGIONS, getPoiById } from '../src/data/regions.js';
import { TUTORIAL_ROAD } from '../src/data/tutorial.js';
import {
  SPECIES,
  SPECIES_IDS,
  WEAKNESS_TIERS,
  speciesOf,
  isSpeciesKnown,
  weaknessesOf,
  weaknessBonusPct,
} from '../src/data/species.js';
import { WAR_DAMAGE_TYPES, MAX_RENDING_LEVEL, rendingName, RENDING_PER_LEVEL } from '../src/data/elements.js';
import { RENDING_GEMS, gemDamageType, gemForDamageType, gemsForWeapon, applyRending, rendingRefusal, canApplyRending } from '../src/game/rending.js';
import { RENDING_MATERIALS, materialKind, materialsOfKind, totalOfKind, heldOfKind } from '../src/data/materials.js';
import { rollChampionReward } from '../src/game/loot.js';
import { claimRegionLifestone, hasOpenQuest, lifestoneSiteIn, lifestoneGrowth, conditionOf, isGrown } from '../src/game/lifestone.js';
import { startTravelToRegion, arrive } from '../src/game/travel.js';
import { rollBellLevel } from '../src/game/tinkering.js';

function everyMonsterName() {
  const names = new Set();
  for (const p of POIS) {
    for (const m of p.monsters || []) names.add(m.name);
    if (p.boss) names.add(p.boss.name);
  }
  for (const m of TUTORIAL_ROAD.monsters) names.add(m.name);
  return [...names];
}

function withWeapon(baseType, extra = {}) {
  const s = createInitialState();
  s.equipment.weapon = { id: 1, slot: 'weapon', baseType, rarity: 'Common', power: 10, spells: [], name: `A ${baseType}`, ...extra };
  return s;
}

// --- The weakness table --------------------------------------------------

test('every creature in the game belongs to a species', () => {
  const unknown = everyMonsterName().filter((n) => !isSpeciesKnown(n));
  assert.deepEqual(unknown, [], `unclassified: ${unknown.join(', ')}`);
});

test('every species has exactly three weaknesses, all real damage types', () => {
  for (const id of SPECIES_IDS) {
    const w = SPECIES[id].weaknesses;
    assert.equal(w.length, WEAKNESS_TIERS.length, `${id} should have three`);
    assert.equal(new Set(w).size, 3, `${id} lists the same type twice`);
    for (const t of w) assert.ok(DAMAGE_TYPES.includes(t), `${id} names unknown type ${t}`);
    assert.ok(!w.includes('void'), `${id} lists void, which belongs to Void Magic alone`);
  }
});

test('no damage type is dead weight across the table', () => {
  // A type nobody is weak to is a type nobody carries. Every one of the seven
  // has to be somebody's primary and pull comparable total weight.
  const totals = {};
  const primaries = {};
  for (const t of WAR_DAMAGE_TYPES) {
    totals[t] = 0;
    primaries[t] = 0;
  }
  for (const id of SPECIES_IDS) {
    SPECIES[id].weaknesses.forEach((t, i) => {
      totals[t] += WEAKNESS_TIERS[i].bonusPct;
      if (i === 0) primaries[t] += 1;
    });
  }
  for (const t of WAR_DAMAGE_TYPES) {
    assert.ok(primaries[t] > 0, `nothing is primarily weak to ${t}`);
  }
  const values = WAR_DAMAGE_TYPES.map((t) => totals[t]);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  for (const t of WAR_DAMAGE_TYPES) {
    const ratio = totals[t] / mean;
    assert.ok(ratio > 0.6 && ratio < 1.6, `${t} carries ${ratio.toFixed(2)}x the average weight`);
  }
});

test('the tiers are worth what they say', () => {
  assert.deepEqual(WEAKNESS_TIERS.map((t) => t.bonusPct), [45, 30, 15]);
  const drudge = weaknessesOf('Drudge');
  assert.equal(weaknessBonusPct(drudge[0].damageType, 'Drudge'), 45);
  assert.equal(weaknessBonusPct(drudge[2].damageType, 'Drudge'), 15);
});

test('a name that means nothing still resolves rather than crashing', () => {
  assert.ok(SPECIES[speciesOf('Something Unwritten')], 'the fallback should be a real species');
  assert.equal(weaknessBonusPct('fire', null), 0);
});

// --- Rending gems --------------------------------------------------------

test('there is exactly one gem per damage type, void included', () => {
  const types = Object.values(RENDING_GEMS);
  assert.equal(new Set(types).size, types.length, 'two gems share a damage type');
  for (const t of DAMAGE_TYPES) {
    assert.ok(gemForDamageType(t), `${t} has no gem`);
  }
  assert.equal(RENDING_MATERIALS.length, DAMAGE_TYPES.length);
});

test('the gems are the Asheron\'s Call ones, mapped as asked', () => {
  assert.equal(gemDamageType('white-sapphire'), 'bludgeon');
  assert.equal(gemDamageType('black-garnet'), 'pierce');
  assert.equal(gemDamageType('imperial-topaz'), 'slash');
  assert.equal(gemDamageType('emerald'), 'acid');
  assert.equal(gemDamageType('aquamarine'), 'cold');
  assert.equal(gemDamageType('red-garnet'), 'fire');
  assert.equal(gemDamageType('jet'), 'lightning');
  assert.equal(gemDamageType('onyx'), 'void');
});

test('a gem only goes on a weapon that deals its damage', () => {
  const mace = withWeapon('mace');
  mace.materials['emerald'] = 5;
  mace.materials['white-sapphire'] = 5;
  assert.ok(rendingRefusal(mace, 'emerald'), 'no acid rending on a mace');
  assert.equal(rendingRefusal(mace, 'white-sapphire'), null, 'a mace takes bludgeon');

  const sword = withWeapon('sword');
  sword.materials['imperial-topaz'] = 1;
  sword.materials['white-sapphire'] = 1;
  assert.equal(rendingRefusal(sword, 'imperial-topaz'), null, 'a sword slashes');
  assert.ok(rendingRefusal(sword, 'white-sapphire'), 'a sword does not bludgeon');

  const bow = withWeapon('bow');
  bow.materials['black-garnet'] = 1;
  assert.equal(rendingRefusal(bow, 'black-garnet'), null, 'arrows pierce');
});

test('a casting device takes the elements, and only the elements', () => {
  const wand = withWeapon('wand');
  for (const gem of RENDING_MATERIALS) wand.materials[gem.id] = 5;
  const allowed = gemsForWeapon(wand.equipment.weapon).map((m) => gemDamageType(m.id)).sort();
  assert.deepEqual(allowed, ['acid', 'cold', 'fire', 'lightning', 'void'].sort());
  assert.ok(rendingRefusal(wand, 'white-sapphire'), 'a wand has no edge to sharpen');
  assert.equal(rendingRefusal(wand, 'onyx'), null, 'void is a caster element');
});

test('working a gem in consumes it and names the rending', () => {
  const s = withWeapon('mace');
  s.materials['white-sapphire'] = 3;
  const result = applyRending(s, 'white-sapphire');
  assert.deepEqual(result, { damageType: 'bludgeon', level: 1 });
  assert.equal(s.materials['white-sapphire'], 2, 'one gem spent');
  assert.equal(rendingName('bludgeon', 1), 'Bludgeon Rending I');
});

test('a second gem of the same type deepens it, to a ceiling', () => {
  const s = withWeapon('mace');
  s.materials['white-sapphire'] = 20;
  for (let i = 1; i <= MAX_RENDING_LEVEL; i++) {
    assert.ok(applyRending(s, 'white-sapphire'), `application ${i} should land`);
    assert.equal(s.equipment.weapon.imbue.level, i);
  }
  assert.equal(applyRending(s, 'white-sapphire'), null, 'it rends as deeply as it can');
  assert.equal(s.materials['white-sapphire'], 20 - MAX_RENDING_LEVEL, 'a refusal costs nothing');
});

test('a refusal never eats the gem', () => {
  const s = withWeapon('mace');
  s.materials['emerald'] = 2;
  assert.equal(applyRending(s, 'emerald'), null);
  assert.equal(s.materials['emerald'], 2);

  const bare = createInitialState();
  bare.materials['white-sapphire'] = 1;
  assert.equal(applyRending(bare, 'white-sapphire'), null, 'no weapon, no rending');
  assert.equal(bare.materials['white-sapphire'], 1);
});

test('a weapon holds one rending, and will not be talked out of it', () => {
  const s = withWeapon('wand');
  s.materials['red-garnet'] = 3;
  s.materials['aquamarine'] = 3;
  applyRending(s, 'red-garnet');
  assert.equal(canApplyRending(s, 'aquamarine'), false, 'it already rends fire');
  assert.equal(s.equipment.weapon.imbue.damageType, 'fire');
  assert.equal(s.materials['aquamarine'], 3);
});

test('rending gems are never spent on a shopfront', () => {
  // They're boss loot with exactly one use; building investment must not be able
  // to eat them just because they are technically gems.
  const s = createInitialState();
  for (const gem of RENDING_MATERIALS) s.materials[gem.id] = 100;
  assert.equal(totalOfKind(s, 'gem'), 0, 'a purse full of rending gems buys no buildings');
  for (const gem of RENDING_MATERIALS) {
    assert.ok(!materialsOfKind(materialKind(gem.id)).some((m) => m.id === gem.id), `${gem.name} is spendable`);
  }
});

// --- Champion rewards ----------------------------------------------------

test('a full clear is what yields gems and slayers, and only rarely', () => {
  const s = createInitialState();
  s.location = { regionId: 'holtburg', poiId: 'drudge-hideout' };
  const poi = getPoiById('drudge-hideout');
  let gems = 0;
  let slayers = 0;
  const runs = 4000;
  for (let i = 0; i < runs; i++) {
    for (const r of rollChampionReward(s, poi)) {
      if (r.kind === 'gem') gems += 1;
      else slayers += 1;
    }
  }
  assert.ok(gems > 0 && gems < runs * 0.25, `${gems} gems in ${runs} clears`);
  assert.ok(slayers > 0 && slayers < gems, `${slayers} slayers should be rarer than ${gems} gems`);
});

test('the gem a place yields is one its own inhabitants are soft to', () => {
  // A dungeon is a lead on the gem you'd want to fight it with.
  const s = createInitialState();
  s.location = { regionId: 'holtburg', poiId: 'drudge-hideout' };
  const poi = getPoiById('drudge-hideout');
  const wanted = new Set(poi.monsters.map((m) => weaknessesOf(m.name)[0].damageType));
  for (let i = 0; i < 3000; i++) {
    for (const r of rollChampionReward(s, poi)) {
      if (r.kind === 'gem') assert.ok(wanted.has(r.damageType), `${r.damageType} is nothing here is weak to`);
    }
  }
});

test('a slayer weapon names what it slays', () => {
  const s = createInitialState();
  s.location = { regionId: 'holtburg', poiId: 'drudge-hideout' };
  const poi = getPoiById('drudge-hideout');
  let found = null;
  for (let i = 0; i < 6000 && !found; i++) {
    found = rollChampionReward(s, poi).find((r) => r.kind === 'slayer');
  }
  assert.ok(found, 'a slayer should turn up eventually');
  assert.equal(found.item.slot, 'weapon');
  assert.ok(found.item.slayer.species, 'it should name a species');
  assert.match(found.item.name, /Slaying$/);
});

// --- Lifestones and the quest marker -------------------------------------

test('every region keeps a Lifestone, in some state of repair', () => {
  for (const region of REGIONS) {
    const site = lifestoneSiteIn(region.id);
    assert.ok(site, `${region.name} has no Lifestone`);
    assert.ok(conditionOf(site).label, `${site.name} has no condition`);
  }
});

test('how intact a stone starts is what its condition says', () => {
  const s = createInitialState();
  for (const region of REGIONS) {
    const site = lifestoneSiteIn(region.id);
    assert.equal(lifestoneGrowth(s, site.id), conditionOf(site).start, `${site.name} started wrong`);
  }
  // Holtburg's is unfinished rather than broken, so it starts at nothing.
  assert.equal(lifestoneGrowth(s, 'budding-lifestone'), 0);
  // A cracked one is most of the way there already.
  assert.ok(lifestoneGrowth(s, 'glenden-lifestone') > 0);
});

test('reaching a region binds you to its stone and opens the job', () => {
  const s = createInitialState();
  const site = lifestoneSiteIn('holtburg');
  assert.equal(hasOpenQuest(s, site.id), false);

  claimRegionLifestone(s, 'holtburg');
  assert.deepEqual(s.progress.boundLifestone, { regionId: 'holtburg', poiId: site.id });
  assert.equal(hasOpenQuest(s, site.id), true, 'the marker should be showing');
});

test('arriving in a region claims its stone without being asked', () => {
  const s = createInitialState();
  s.hero.name = 'Probe';
  s.onboarding.step = 'done';
  startTravelToRegion(s, 'glenden-wood');
  arrive(s);
  const site = lifestoneSiteIn('glenden-wood');
  assert.equal(s.progress.boundLifestone.poiId, site.id, 'you should wake beside it, not a region away');
  assert.equal(hasOpenQuest(s, site.id), true);
});

test('a restored stone stops asking', () => {
  const s = createInitialState();
  const site = lifestoneSiteIn('holtburg');
  claimRegionLifestone(s, 'holtburg');
  s.progress.lifestoneGrowth[site.id] = 100;
  s.progress.quests[site.id] = 'done';
  assert.equal(hasOpenQuest(s, site.id), false);
  assert.ok(isGrown(s, site.id));
});

// --- Mitigation rolls ----------------------------------------------------

test('a mitigation roll favours the middle and makes the ends worth telling', () => {
  const counts = {};
  const runs = 60000;
  for (let i = 0; i < runs; i++) {
    const v = rollBellLevel(1, 10);
    assert.ok(v >= 1 && v <= 10, `rolled ${v}`);
    counts[v] = (counts[v] || 0) + 1;
  }
  const share = (v) => (counts[v] || 0) / runs;
  const middle = share(5) + share(6);
  const tails = share(1) + share(2) + share(9) + share(10);
  assert.ok(middle > 0.35, `the middle only came up ${(middle * 100).toFixed(0)}% of the time`);
  assert.ok(tails < middle / 2, `the tails came up ${(tails * 100).toFixed(0)}%, which isn't rare`);
  assert.ok(share(1) > 0 && share(10) > 0, 'both ends should still be reachable');
});

// --- Building costs by kind ----------------------------------------------

test('an excess of one metal is as good as another', () => {
  const s = createInitialState();
  s.materials['copper'] = 40;
  assert.equal(totalOfKind(s, 'metal'), 40);
  assert.equal(totalOfKind(s, 'wood'), 0);
  s.materials['oak'] = 3;
  assert.equal(totalOfKind(s, 'wood'), 3);
  // Spending order is most-plentiful-first, so the pile you'd never tinker with
  // goes before the one you might.
  s.materials['iron'] = 5;
  assert.equal(heldOfKind(s, 'metal')[0].id, 'copper');
});
