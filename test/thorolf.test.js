import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState } from '../src/game/state.js';
import {
  openQuestsFor,
  questForGiver,
  canCompleteQuest,
  completeQuest,
  setQuestChoice,
  questChoice,
  objectiveHave,
} from '../src/game/quests.js';
import { takeTour, buildingQuest } from '../src/game/buildings.js';
import { buildingIn } from '../src/data/buildings.js';
import { THOROLF_WEAPONS, THOROLF_TAG, THOROLF_WEAPON_RARITY } from '../src/data/quests.js';
import { skillForWeapon } from '../src/data/items.js';
import { salvageItem, salvageAll, isQuestItem } from '../src/game/loot.js';
import { sellItem } from '../src/game/shop.js';

function inHoltburg() {
  const s = createInitialState();
  s.onboarding.step = 'done';
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: null };
  openQuestsFor(s, 'holtburg');
  return s;
}

const HOLTBURG_HALL = buildingIn('holtburg', 'town-hall');

// Walks the chain to the point where Thorolf is offering the rack.
function upToThorolf() {
  const s = inHoltburg();
  takeTour(s, HOLTBURG_HALL);
  return s;
}

test('Thorolf stays behind the tour, then offers the rack', () => {
  const s = inHoltburg();
  // The Town Hall's own tour marker comes first; Thorolf is not yet on offer.
  assert.equal(s.progress.quests['thorolf-armory'], undefined);

  takeTour(s, HOLTBURG_HALL);
  // Taking the tour opens him on the spot, without leaving and coming back.
  assert.equal(s.progress.quests['thorolf-armory'], 'active');
  assert.equal(questForGiver(s, 'holtburg', 'town-hall').def.id, 'thorolf-armory');
});

test('he is a Holtburg man — no other town hall offers his rack', () => {
  const s = inHoltburg();
  takeTour(s, HOLTBURG_HALL);
  openQuestsFor(s, 'glenden-wood');
  // Glenden Wood still runs its own tour; what it must not have is Thorolf.
  assert.notEqual(questForGiver(s, 'glenden-wood', 'town-hall').def.id, 'thorolf-armory');
});

test('the rack is one weapon per offensive skill, all rolled alike', () => {
  const s = upToThorolf();
  completeQuest(s, 'thorolf-armory', 'holtburg');

  // Auto-equip puts one straight on your back; the rest wait in the pack.
  const lent = s.inventory.filter((it) => it.questTag === THOROLF_TAG)
    .concat(s.equipment.weapon && s.equipment.weapon.questTag === THOROLF_TAG ? [s.equipment.weapon] : []);
  assert.equal(lent.length, THOROLF_WEAPONS.length);

  // Every one trains a different skill — that's the whole point of the set.
  const skills = new Set(lent.map((it) => skillForWeapon(it.baseType)));
  assert.equal(skills.size, THOROLF_WEAPONS.length, 'each weapon should teach a different skill');

  // Identical rolls, so the comparison is between weapons and not between drops.
  for (const it of lent) {
    assert.equal(it.rarity, THOROLF_WEAPON_RARITY);
    assert.equal(it.spells.length, 0);
  }
});

test('lent gear cannot be sold, salvaged, or swept up by Salvage-all', () => {
  const s = upToThorolf();
  completeQuest(s, 'thorolf-armory', 'holtburg');
  // One of the eight is on your back (auto-equip); the rest are loose.
  const lent = s.inventory.find((it) => it.questTag === THOROLF_TAG);
  assert.ok(isQuestItem(lent));

  assert.equal(salvageItem(s, lent.id), null);
  assert.equal(sellItem(s, lent.id), false);
  assert.equal(salvageAll(s), null, 'a pack of nothing but lent gear has nothing to break down');
  const remaining = s.inventory.filter((it) => it.questTag === THOROLF_TAG).length
    + ((s.equipment.weapon && s.equipment.weapon.questTag === THOROLF_TAG) ? 1 : 0);
  assert.equal(remaining, THOROLF_WEAPONS.length);
});

test('the return quest opens only once the rack has been handed over', () => {
  const s = upToThorolf();
  assert.equal(s.progress.quests['thorolf-return'], undefined);
  completeQuest(s, 'thorolf-armory', 'holtburg');
  assert.equal(s.progress.quests['thorolf-return'], 'active');
  assert.equal(buildingQuest(s, HOLTBURG_HALL).def.id, 'thorolf-return');
});

test('a reward you have not picked yet blocks the hand-in', () => {
  const s = upToThorolf();
  completeQuest(s, 'thorolf-armory', 'holtburg');
  // Objective is already satisfied — it's the unmade choice that holds it up.
  assert.ok(objectiveHave(s, { kind: 'questItem', id: THOROLF_TAG }) >= 7);
  assert.equal(questChoice(s, 'thorolf-return'), null);
  assert.equal(canCompleteQuest(s, 'thorolf-return'), false);

  assert.equal(setQuestChoice(s, 'thorolf-return', 'not-a-gem'), false, 'only listed options count');
  assert.ok(setQuestChoice(s, 'thorolf-return', 'red-garnet'));
  assert.equal(canCompleteQuest(s, 'thorolf-return'), true);
});

test('handing back the rack keeps whatever you equipped and pays the chosen gem', () => {
  const s = upToThorolf();
  completeQuest(s, 'thorolf-armory', 'holtburg');

  // Equipping one is how you say which one you're keeping. Auto-equip may
  // already have put one on; swap it for the spear either way.
  const keeper = s.inventory.find((it) => it.baseType === 'spear')
    || (() => { throw new Error('spear not in the pack'); })();
  s.inventory = s.inventory.filter((it) => it.id !== keeper.id);
  const worn = s.equipment.weapon;
  s.equipment.weapon = keeper;
  if (worn && !s.inventory.some((it) => it.id === worn.id)) s.inventory.push(worn);

  setQuestChoice(s, 'thorolf-return', 'aquamarine');
  assert.ok(completeQuest(s, 'thorolf-return', 'holtburg'));

  assert.equal(s.materials.aquamarine, 1);
  assert.equal(s.equipment.weapon.baseType, 'spear', 'the equipped keeper is untouched');
  assert.equal(s.inventory.filter((it) => it.questTag === THOROLF_TAG).length, 0);
});

test('keeping none hands all eight back rather than leaving a stray', () => {
  const s = upToThorolf();
  completeQuest(s, 'thorolf-armory', 'holtburg');
  setQuestChoice(s, 'thorolf-return', 'onyx');
  completeQuest(s, 'thorolf-return', 'holtburg');
  assert.equal(s.inventory.filter((it) => it.questTag === THOROLF_TAG).length, 0);
});

test('weapons you found yourself are not his to take back', () => {
  const s = upToThorolf();
  completeQuest(s, 'thorolf-armory', 'holtburg');

  // A looted weapon sits in the same pack and must survive the hand-in.
  const looted = { id: 9001, name: 'Found Sword', slot: 'weapon', baseType: 'sword', rarity: 'Common', spells: [], material: 'iron' };
  s.inventory.push(looted);

  setQuestChoice(s, 'thorolf-return', 'jet');
  completeQuest(s, 'thorolf-return', 'holtburg');
  assert.ok(s.inventory.some((it) => it.id === 9001), 'your own sword stays yours');
});

test('receiving the rack leaves you armed, not bare-handed', () => {
  const s = upToThorolf();
  // A brand-new character owns nothing; the rack is the first weapon they see.
  assert.equal(s.equipment.weapon, null);
  assert.equal(s.settings.autoEquip, true);
  completeQuest(s, 'thorolf-armory', 'holtburg');

  assert.ok(s.equipment.weapon, 'Thorolf would not watch you punch a drudge');
  assert.equal(s.equipment.weapon.questTag, THOROLF_TAG);
  // The keeper stays his until the hand-in: seven loose, one worn.
  assert.equal(s.inventory.filter((it) => it.questTag === THOROLF_TAG).length, THOROLF_WEAPONS.length - 1);
});
