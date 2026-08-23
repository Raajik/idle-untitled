import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { QUESTS, getQuest, questKey } from '../src/data/quests.js';
import {
  reputation,
  grantReputation,
  objectiveHave,
  objectiveText,
  objectiveMet,
  openQuestsFor,
  questForGiver,
  canCompleteQuest,
  completeQuest,
  recordKill,
} from '../src/game/quests.js';
import { rollBounties, bountyReady, claimBounty, poiServesBounty, bountiesAt, BOUNTIES_PER_BOARD } from '../src/game/bounties.js';
import { takeTour, tickBuildings, investToOpen, isUnlocked } from '../src/game/buildings.js';
import { getBuilding, investmentDiscount, meetsReputation, reputationRequired } from '../src/data/buildings.js';
import { charges } from '../src/game/consumables.js';
import { getPoiById, getRegion } from '../src/data/regions.js';
import { getConsumable } from '../src/data/consumables.js';
import { battleTab } from '../src/ui/tabs.js';
import { BUILDINGS } from '../src/data/buildings.js';
import { UNLOCKS } from '../src/ui/unlocks.js';

function inHoltburg() {
  const s = createInitialState();
  s.hero.name = 'Probe';
  s.onboarding.step = 'done';
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: null };
  openQuestsFor(s, 'holtburg');
  return s;
}

// --- Reputation ----------------------------------------------------------

test('reputation is per town, and starts at nothing', () => {
  const s = inHoltburg();
  assert.equal(reputation(s, 'holtburg'), 0);
  grantReputation(s, 'holtburg', 12);
  assert.equal(reputation(s, 'holtburg'), 12);
  assert.equal(reputation(s, 'glenden-wood'), 0, 'Holtburg vouching for you means nothing abroad');
});

test('reputation is what makes a town cheap, and it is never free', () => {
  const s = inHoltburg();
  assert.equal(investmentDiscount(s, 'holtburg'), 1);
  grantReputation(s, 'holtburg', 50);
  const discounted = investmentDiscount(s, 'holtburg');
  assert.ok(discounted < 1 && discounted > 0.4);
  grantReputation(s, 'holtburg', 100000);
  assert.ok(investmentDiscount(s, 'holtburg') >= 0.4, 'there is a floor');
});

// --- The larder quest ----------------------------------------------------

test('the store asks for meat, and says how far along you are', () => {
  const s = inHoltburg();
  const offered = questForGiver(s, 'holtburg', 'general-store');
  assert.ok(offered, 'the General Store should be asking for something');
  assert.equal(offered.def.id, 'store-larder');
  assert.equal(objectiveHave(s, offered.def.objective), 0);
  assert.equal(objectiveText(offered.def.objective), '25 Raw Meat');
  assert.equal(canCompleteQuest(s, offered.key), false);

  s.trophies['raw-meat'] = 24;
  assert.equal(canCompleteQuest(s, offered.key), false, 'twenty-four is not twenty-five');
  s.trophies['raw-meat'] = 25;
  assert.equal(canCompleteQuest(s, offered.key), true);
});

test('an objective counts what you already had', () => {
  // Progress isn't tracked as you go, so a hoard you built before anyone asked
  // still counts — which is the point of checking rather than tallying.
  const s = createInitialState();
  s.trophies['raw-meat'] = 40;
  openQuestsFor(s, 'holtburg');
  const offered = questForGiver(s, 'holtburg', 'general-store');
  assert.equal(canCompleteQuest(s, offered.key), true);
});

test('handing the larder in pays reputation, XP, Cooking and meals', () => {
  const s = inHoltburg();
  s.trophies['raw-meat'] = 30;
  const offered = questForGiver(s, 'holtburg', 'general-store');

  const paid = completeQuest(s, offered.key, 'holtburg');
  assert.ok(paid, 'it should have gone through');
  assert.equal(s.trophies['raw-meat'], 5, 'it takes exactly what it asked for');
  assert.ok(reputation(s, 'holtburg') > 0);
  assert.ok(s.progress.totalXpEarned > 0);
  assert.ok(s.hero.skills.cooking, 'Cooking should be taught');
  assert.equal(charges(s, 'simple-meal'), 10);
  assert.ok(s.progress.storeFoodUnlocked, 'and the larder opens');

  assert.equal(canCompleteQuest(s, offered.key), false, 'and it is done');
  assert.equal(questForGiver(s, 'holtburg', 'general-store'), null);
});

test('a simple meal is plain white food that says what it does', () => {
  const meal = getConsumable('simple-meal');
  assert.equal(meal.rarity, 'Common');
  assert.deepEqual(meal.buff.effect, { hpRegenFlat: 1 });
  assert.match(meal.desc, /\+1 Health regeneration/);
});

test('the tour pays like any other job', () => {
  const s = inHoltburg();
  const before = reputation(s, 'holtburg');
  takeTour(s, 'holtburg:town-hall');
  assert.ok(reputation(s, 'holtburg') > before, 'sitting through it is the hand-in');
  assert.ok(isUnlocked(s, 'holtburg:general-store'));
});

// --- Gating --------------------------------------------------------------

test('a full purse does not open every door', () => {
  const s = inHoltburg();
  s.pyreals = 10_000_000;
  for (const id of ['iron', 'copper', 'oak', 'linen', 'granite', 'gromnie-hide', 'opal', 'silver', 'gold']) {
    s.materials[id] = 9999;
  }
  const archmage = getBuilding('holtburg:archmage');
  assert.ok(reputationRequired(archmage) > 0);
  assert.equal(investToOpen(s, 'holtburg:archmage'), false);

  grantReputation(s, 'holtburg', reputationRequired(archmage));
  assert.ok(meetsReputation(s, archmage));
  assert.equal(investToOpen(s, 'holtburg:archmage'), true);
});

// --- The bounty board ----------------------------------------------------

test('a board posts jobs the region can actually serve', () => {
  const s = inHoltburg();
  const region = getRegion('holtburg');
  for (let i = 0; i < 40; i++) {
    for (const bounty of rollBounties(s, 'holtburg')) {
      assert.ok(bounty.objective.count > 0, 'a bounty should ask for something');
      assert.ok(bounty.reputation > 0 && bounty.xp > 0 && bounty.pyreals > 0, 'and pay for it');
      // Everything it asks for is somewhere in this region.
      const somewhere = region.pois.some((poi) => poiServesBounty(poi, bounty));
      assert.ok(somewhere, `nothing in Holtburg serves "${bounty.title}"`);
    }
  }
});

test('a board carries a few jobs, and rerolls with the shelves', () => {
  const s = inHoltburg();
  tickBuildings(s);
  const board = s.buildings['holtburg:bounty-board'];
  assert.equal(board.bounties.length, BOUNTIES_PER_BOARD);
  const first = board.bounties.map((b) => b.id);
  board.rotatesAt = 0;
  tickBuildings(s);
  assert.notDeepEqual(s.buildings['holtburg:bounty-board'].bounties.map((b) => b.id), first);
});

test('a kill bounty counts kills, and claiming it spends them', () => {
  const s = inHoltburg();
  tickBuildings(s);
  const board = s.buildings['holtburg:bounty-board'];
  const bounty = { id: 9001, objective: { kind: 'kill', id: 'drudge', count: 3 }, title: 'Cull the Drudge', reputation: 5, xp: 10, pyreals: 20 };
  board.bounties[0] = bounty;

  assert.equal(bountyReady(s, bounty), false);
  for (let i = 0; i < 3; i++) recordKill(s, 'drudge');
  assert.equal(bountyReady(s, bounty), true);

  const rep = reputation(s, 'holtburg');
  assert.ok(claimBounty(s, 'holtburg:bounty-board', 9001));
  assert.equal(s.progress.kills.drudge, 0, 'the kills are spent');
  assert.ok(reputation(s, 'holtburg') > rep);
  assert.equal(s.buildings['holtburg:bounty-board'].bounties.length, BOUNTIES_PER_BOARD, 'and a fresh job replaces it');
});

test('a bounty you cannot fill claims nothing', () => {
  const s = inHoltburg();
  tickBuildings(s);
  const board = s.buildings['holtburg:bounty-board'];
  board.bounties[0] = { id: 9002, objective: { kind: 'material', id: 'iron', count: 50 }, title: 'Wanted: Iron', reputation: 5, xp: 10, pyreals: 20 };
  assert.equal(claimBounty(s, 'holtburg:bounty-board', 9002), null);
  assert.equal(reputation(s, 'holtburg'), 0);
});

test('a location card knows which bounties it serves', () => {
  const s = inHoltburg();
  const hideout = getPoiById('drudge-hideout'); // drudges, and yields Mahogany
  s.buildings['holtburg:bounty-board'].bounties = [
    { id: 1, objective: { kind: 'kill', id: 'drudge', count: 5 }, title: 'Cull the Drudge', reputation: 5, xp: 1, pyreals: 1 },
    { id: 2, objective: { kind: 'material', id: 'mahogany', count: 5 }, title: 'Wanted: Mahogany', reputation: 5, xp: 1, pyreals: 1 },
    { id: 3, objective: { kind: 'kill', id: 'olthoi', count: 5 }, title: 'Cull the Olthoi', reputation: 5, xp: 1, pyreals: 1 },
  ];
  const served = bountiesAt(s, hideout).map((b) => b.id).sort();
  assert.deepEqual(served, [1, 2], 'drudges and mahogany, but no olthoi live here');

  // A POI read straight off region.pois carries no regionId of its own, so the
  // region has to be passed in or the lookup silently matches nothing.
  const raw = getRegion('holtburg').pois.find((p) => p.id === 'drudge-hideout');
  assert.equal(raw.regionId, undefined, 'this is the shape the UI actually renders');
  assert.deepEqual(bountiesAt(s, raw), [], 'without a region it can find nothing');
  assert.deepEqual(bountiesAt(s, raw, 'holtburg').map((b) => b.id).sort(), [1, 2]);
});

test('every written quest names a giver that exists', () => {
  for (const q of QUESTS) {
    assert.ok(q.giver, `${q.id} has no giver`);
    assert.ok(getBuilding(`holtburg:${q.giver}`), `${q.id} is given by nothing that exists`);
    assert.ok(q.title && q.desc, `${q.id} should say what it is`);
    assert.ok((q.rewards || {}).reputation > 0, `${q.id} should pay reputation`);
    assert.equal(getQuest(q.id), q);
    assert.equal(questKey(q.id, 'holtburg'), q.perRegion ? `holtburg:${q.id}` : q.id);
  }
});

// --- What the panels actually draw -----------------------------------------

test('every building panel renders without throwing', () => {
  // An undefined import inside one of these throws at render time and takes the
  // whole Battle tab with it — and nothing else in the suite opens a shop, so it
  // went unnoticed until someone clicked a building in a browser.
  const s = inHoltburg();
  s.pyreals = 10_000_000;
  for (const id of ['iron', 'copper', 'oak', 'linen', 'granite', 'gromnie-hide', 'opal', 'silver', 'gold', 'moonstone', 'ebony']) {
    s.materials[id] = 9999;
  }
  grantReputation(s, 'holtburg', 200);
  takeTour(s, 'holtburg:town-hall');
  tickBuildings(s);
  for (const b of BUILDINGS.filter((x) => x.regionId === 'holtburg')) {
    investToOpen(s, b.id);
  }
  tickBuildings(s);

  for (const b of BUILDINGS.filter((x) => x.regionId === 'holtburg')) {
    s.ui.activeBuilding = b.id;
    for (const tab of ['weapons', 'armor', 'consumables', 'materials', 'sell']) {
      s.ui.activeShopTab = tab;
      let html = '';
      assert.doesNotThrow(() => {
        html = battleTab(s);
      }, `${b.name} / ${tab} threw while rendering`);
      assert.ok(html.includes('shop-panel'), `${b.name} / ${tab} drew no panel`);
    }
  }
});

test('a shop shelf shows real stats, not a power number', () => {
  const s = inHoltburg();
  takeTour(s, 'holtburg:town-hall');
  tickBuildings(s);
  s.ui.activeBuilding = 'holtburg:general-store';
  s.ui.activeShopTab = 'weapons';
  const html = battleTab(s);
  assert.match(html, /\d+–\d+ damage/, 'a weapon should quote its damage band');
  assert.ok(!/\d+ power/.test(html), '"power" should appear nowhere a player can read it');
  assert.ok(!/\[(Common|Uncommon|Rare|Epic|Legendary) /.test(html), 'the [Rare ring] tag is gone');
});

test('the store panel shows its quest, with live progress', () => {
  const s = inHoltburg();
  takeTour(s, 'holtburg:town-hall');
  tickBuildings(s);
  s.trophies['raw-meat'] = 17;
  s.ui.activeBuilding = 'holtburg:general-store';
  const html = battleTab(s);
  assert.ok(html.includes('quest-panel'), 'the larder should be posted');
  assert.ok(html.includes('Stock the larder'));
  assert.ok(html.includes('17 / 25'), 'against what you are carrying right now');
});

test('the board panel lists its postings', () => {
  const s = inHoltburg();
  tickBuildings(s);
  s.ui.activeBuilding = 'holtburg:bounty-board';
  const html = battleTab(s);
  assert.ok(html.includes('claim-bounty'), 'every posting should be claimable');
  const posted = (html.match(/data-action="claim-bounty"/g) || []).length;
  assert.equal(posted, BOUNTIES_PER_BOARD);
});

test('the Inventory tab opens on your first loot, whatever it was', () => {
  // It only checked for GEAR, so the rat tail you pick up on the road — the
  // first thing anyone loots — left the tab locked, as did a drop that
  // auto-salvage broke down before it reached the bag.
  const inventory = UNLOCKS.find((u) => u.id === 'inventory');
  assert.equal(inventory.when(createInitialState()), false, 'a fresh hero has looted nothing');

  const cases = {
    'a trophy': (s) => { s.trophies['rat-tail'] = 1; },
    'a material': (s) => { s.materials.iron = 2; },
    'a drop that was auto-salvaged': (s) => { s.progress.totalDrops = 1; },
    'something in the bag': (s) => { s.inventory.push({ slot: 'ring', spells: [] }); },
    'something equipped': (s) => { s.equipment.weapon = { slot: 'weapon', spells: [] }; },
  };
  for (const [what, setup] of Object.entries(cases)) {
    const s = createInitialState();
    setup(s);
    assert.equal(inventory.when(s), true, `${what} should open the Inventory tab`);
  }
});
