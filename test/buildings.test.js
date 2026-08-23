import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { REGIONS } from '../src/data/regions.js';
import {
  BUILDINGS,
  buildingBonus,
  getBuilding,
  unlockCost,
  upgradeCost,
  rotationSeconds,
  investmentDiscount,
  MAX_BUILDING_LEVEL,
} from '../src/data/buildings.js';
import {
  tickBuildings,
  investToOpen,
  investInBuilding,
  takeTour,
  isUnlocked,
  rotationRemaining,
} from '../src/game/buildings.js';
import { derivedStats } from '../src/game/hero.js';
import { totalOfKind, RENDING_MATERIALS } from '../src/data/materials.js';

// The Town Hall is the only thing standing when you arrive; its tour is what
// opens the General Store.
function townWithStore() {
  const s = createInitialState();
  takeTour(s, 'holtburg:town-hall');
  tickBuildings(s);
  return s;
}

test('only the Town Hall is open when you arrive in Holtburg', () => {
  const s = createInitialState();
  const open = BUILDINGS.filter((b) => b.regionId === 'holtburg' && isUnlocked(s, b.id)).map((b) => b.id);
  assert.deepEqual(open, ['holtburg:town-hall']);
});

test('every town past the first is already trading when you get there', () => {
  // Holtburg is the one you build from nothing, because it's where the game
  // teaches you what investing is. Walking far enough is meant to be an
  // alternative to that ladder, not a second copy of it.
  const s = createInitialState();
  for (const region of REGIONS.filter((r) => r.id !== 'holtburg')) {
    const shops = BUILDINGS.filter((b) => b.regionId === region.id);
    assert.ok(shops.length > 1, `${region.name} has no town`);
    for (const shop of shops) {
      assert.ok(isUnlocked(s, shop.id), `${shop.name} in ${region.name} should already be open`);
    }
  }
});

test('a town you have never walked to buffs you not at all', () => {
  // Those towns start built, so without a check on where you've actually been, a
  // brand-new hero would begin holding every perk in the game.
  const s = createInitialState();
  assert.equal(buildingBonus(s, 'atkPct'), 0, 'Glenden Wood’s smith is not your smith yet');

  s.progress.unlockedRegions = ['glenden-wood'];
  assert.ok(buildingBonus(s, 'atkPct') > 0, 'reaching the region should hand you its town');
});

test('a second town does not multiply the perk of the first', () => {
  // Opening a Weaponsmith in every region shouldn't stack the ATK buff four
  // times over — a perk is worth whatever your best town gives.
  const s = createInitialState();
  s.progress.unlockedRegions = REGIONS.map((r) => r.id);
  for (const b of BUILDINGS.filter((x) => x.type === 'weaponsmith')) s.buildings[b.id].level = 5;
  const many = buildingBonus(s, 'atkPct');

  const one = createInitialState();
  one.progress.unlockedRegions = ['holtburg'];
  one.buildings['holtburg:weaponsmith'].level = 5;
  assert.equal(many, buildingBonus(one, 'atkPct'), 'four smiths is still one buff');

  s.buildings['glenden-wood:weaponsmith'].level = 8;
  assert.ok(buildingBonus(s, 'atkPct') > many, 'the best town is the one that counts');
});

test('the tour opens the General Store, and only ever happens once', () => {
  const s = createInitialState();
  assert.equal(isUnlocked(s, 'holtburg:general-store'), false);

  assert.equal(takeTour(s, 'holtburg:town-hall'), true);
  assert.ok(s.progress.tookTownTour);
  assert.ok(isUnlocked(s, 'holtburg:general-store'), 'the tour should open the Store');
  assert.ok(s.buildings['holtburg:general-store'].stock.length > 0, 'and stock it');

  assert.equal(takeTour(s, 'holtburg:town-hall'), false, 'a second tour changes nothing');
});

test('the tour costs nothing, because the town is selling itself', () => {
  const s = createInitialState();
  s.pyreals = 0;
  assert.equal(takeTour(s, 'holtburg:town-hall'), true);
});

test('the General Store cannot be bought open, only toured into', () => {
  const s = createInitialState();
  s.pyreals = 10_000_000;
  assert.equal(unlockCost(getBuilding('holtburg:general-store'), s), null, 'it has no price');
  assert.equal(investToOpen(s, 'holtburg:general-store'), false);
  assert.equal(isUnlocked(s, 'holtburg:general-store'), false);
});

test('the General Store keeps a shelf, not a warehouse', () => {
  // A couple of each kind rather than a big pile drawn from every slot at once,
  // which is what made it read as having one of everything.
  const s = townWithStore();
  const spec = getBuilding('holtburg:general-store').stock;
  const entry = s.buildings['holtburg:general-store'];
  const min = spec.categories.reduce((n, c) => n + c.min, 0);
  const max = spec.categories.reduce((n, c) => n + c.max, 0);
  assert.ok(entry.stock.length >= min && entry.stock.length <= max, `stocked ${entry.stock.length}, wanted ${min}-${max}`);
  assert.ok(entry.stock.length <= 9, 'a fresh general store should be small');
  assert.ok(rotationRemaining(s, 'holtburg:general-store') > 0);

  // Every category it deals in shows up.
  const weapons = entry.stock.filter((it) => it.slot === 'weapon').length;
  assert.ok(weapons >= 2 && weapons <= 3, `${weapons} weapons on the shelf`);

  entry.level = MAX_BUILDING_LEVEL;
  entry.rotatesAt = 0;
  tickBuildings(s);
  assert.ok(
    s.buildings['holtburg:general-store'].stock.length > max,
    'a fully grown generalist should carry more than a fresh one could'
  );
});

test('materials are a limited counter, not an infinite tap', () => {
  const s = townWithStore();
  const entry = s.buildings['holtburg:general-store'];
  assert.ok(entry.exchange.length <= 4, `${entry.exchange.length} kinds on a fresh counter`);
  for (const offer of entry.exchange) {
    assert.ok(offer.stock >= 2 && offer.stock <= 10, `${offer.materialId} had ${offer.stock} in stock`);
  }
  // And never a rending gem, which is boss loot with exactly one use.
  for (const offer of entry.exchange) {
    assert.ok(!RENDING_MATERIALS.some((m) => m.id === offer.materialId), `${offer.materialId} should not be for sale`);
  }
});

test('the General Store deals in consumables and raw materials; specialists do not', () => {
  const s = townWithStore();
  const store = s.buildings['holtburg:general-store'];
  // Its shelf is a roll, so any single rotation may come up empty — what must
  // hold is that it deals in these things at all, and prices whatever it has.
  assert.ok(getBuilding('holtburg:general-store').sells.length > 0, 'it should deal in consumables');
  for (const offer of store.sells) assert.ok(offer.price > 0, `${offer.id} was priced at ${offer.price}`);
  assert.ok(store.exchange.length > 0, 'and quote a price on raw goods');
  for (const offer of store.exchange) assert.ok(offer.price > 0);

  s.pyreals = 10_000_000;
  s.materials['iron'] = 1000;
  investToOpen(s, 'holtburg:weaponsmith');
  assert.equal(s.buildings['holtburg:weaponsmith'].sells.length, 0);
  assert.equal(s.buildings['holtburg:weaponsmith'].exchange.length, 0);
});

test('exchange rates move every time the shelves turn over', () => {
  const s = townWithStore();
  const first = s.buildings['holtburg:general-store'].exchange.map((o) => o.price);
  s.buildings['holtburg:general-store'].rotatesAt = 0;
  tickBuildings(s);
  const second = s.buildings['holtburg:general-store'].exchange.map((o) => o.price);
  assert.notDeepEqual(first, second, 'rates should not be a fixed price list');
});

test('stock turns over once its clock runs out, and not before', () => {
  const s = createInitialState();
  const t0 = 1_000_000;
  takeTour(s, 'holtburg:town-hall', t0); // stamp the first delivery against the same clock
  tickBuildings(s, t0);
  const first = s.buildings['holtburg:general-store'].stock;

  tickBuildings(s, t0 + rotationSeconds(1) * 1000 - 1);
  assert.equal(s.buildings['holtburg:general-store'].stock, first);

  tickBuildings(s, t0 + rotationSeconds(1) * 1000);
  assert.notEqual(s.buildings['holtburg:general-store'].stock, first);
});

test('investing shortens the wait for the next delivery', () => {
  assert.ok(rotationSeconds(2) < rotationSeconds(1));
  assert.ok(rotationSeconds(MAX_BUILDING_LEVEL) < rotationSeconds(2));
});

test('opening a business costs pyreals and materials, and refuses when short', () => {
  const s = createInitialState();
  const cost = unlockCost(getBuilding('holtburg:weaponsmith'), s);

  assert.equal(investToOpen(s, 'holtburg:weaponsmith'), false); // broke

  s.pyreals = cost.pyreals;
  assert.equal(investToOpen(s, 'holtburg:weaponsmith'), false); // pyreals but no metal

  // A cost names a kind, not a material: any metal will do, and a mixed pile
  // spends the most plentiful first.
  assert.equal(cost.materialKind, 'metal');
  s.materials['copper'] = cost.materials - 1;
  s.materials['silver'] = 1;
  assert.equal(investToOpen(s, 'holtburg:weaponsmith'), true);
  assert.equal(s.pyreals, 0);
  assert.equal(totalOfKind(s, 'metal'), 0, 'the whole cost should have come out of the pile');
  assert.ok(s.buildings['holtburg:weaponsmith'].stock.length > 0);
});

test('the Town Hall makes every investment in town cheaper, including its own', () => {
  const plain = createInitialState();
  plain.progress.unlockedRegions = ['holtburg'];
  const grown = createInitialState();
  grown.progress.unlockedRegions = ['holtburg'];
  grown.buildings['holtburg:town-hall'].level = MAX_BUILDING_LEVEL;

  // The Hall is open from the start, so even a fresh town gets its level-1 cut;
  // what matters is that investing in it widens the discount.
  assert.ok(investmentDiscount(grown) < investmentDiscount(plain));
  assert.ok(investmentDiscount(plain) <= 1);

  const smith = getBuilding('holtburg:weaponsmith');
  assert.ok(unlockCost(smith, grown).pyreals < unlockCost(smith, plain).pyreals);
  assert.ok(upgradeCost(smith, 3, grown).pyreals < upgradeCost(smith, 3, plain).pyreals);
});

test('a business perk applies to the hero, and grows as you invest', () => {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.hero.str = 100; // a percentage perk needs enough base ATK to show past rounding
  const base = derivedStats(s).atk;

  s.buildings['holtburg:weaponsmith'].level = 1;
  const atLevel1 = derivedStats(s).atk;
  assert.ok(atLevel1 > base, 'the Weaponsmith should add ATK');

  s.buildings['holtburg:weaponsmith'].level = 5;
  assert.ok(derivedStats(s).atk > atLevel1);
});

test('investment stops at the top', () => {
  const s = createInitialState();
  s.buildings['holtburg:town-hall'].level = MAX_BUILDING_LEVEL;
  s.pyreals = 10_000_000;
  s.materials['copper'] = 10_000;
  assert.equal(upgradeCost(getBuilding('holtburg:town-hall'), MAX_BUILDING_LEVEL, s), null);
  assert.equal(investInBuilding(s, 'holtburg:town-hall'), false);
});

test('investing spends the cost and grows the business', () => {
  const s = createInitialState();
  const cost = upgradeCost(getBuilding('holtburg:town-hall'), 1, s);
  s.pyreals = cost.pyreals;
  s.materials['copper'] = cost.materials;
  assert.equal(investInBuilding(s, 'holtburg:town-hall'), true);
  assert.equal(s.buildings['holtburg:town-hall'].level, 2);
  assert.equal(s.pyreals, 0);
});
