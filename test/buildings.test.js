import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import {
  BUILDINGS,
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

// The Town Hall is the only thing standing when you arrive; its tour is what
// opens the General Store.
function townWithStore() {
  const s = createInitialState();
  takeTour(s, 'town-hall');
  tickBuildings(s);
  return s;
}

test('only the Town Hall is open when you arrive', () => {
  const s = createInitialState();
  const open = BUILDINGS.filter((b) => isUnlocked(s, b.id)).map((b) => b.id);
  assert.deepEqual(open, ['town-hall']);
});

test('the tour opens the General Store, and only ever happens once', () => {
  const s = createInitialState();
  assert.equal(isUnlocked(s, 'general-store'), false);

  assert.equal(takeTour(s, 'town-hall'), true);
  assert.ok(s.progress.tookTownTour);
  assert.ok(isUnlocked(s, 'general-store'), 'the tour should open the Store');
  assert.ok(s.buildings['general-store'].stock.length > 0, 'and stock it');

  assert.equal(takeTour(s, 'town-hall'), false, 'a second tour changes nothing');
});

test('the tour costs nothing, because the town is selling itself', () => {
  const s = createInitialState();
  s.pyreals = 0;
  assert.equal(takeTour(s, 'town-hall'), true);
});

test('the General Store cannot be bought open, only toured into', () => {
  const s = createInitialState();
  s.pyreals = 10_000_000;
  assert.equal(unlockCost(getBuilding('general-store'), s), null, 'it has no price');
  assert.equal(investToOpen(s, 'general-store'), false);
  assert.equal(isUnlocked(s, 'general-store'), false);
});

test('the General Store stocks a little of everything, and more as you invest', () => {
  const s = townWithStore();
  const spec = getBuilding('general-store').stock;
  const atLevel1 = s.buildings['general-store'].stock.length;
  assert.ok(atLevel1 >= spec.min && atLevel1 <= spec.max, `stocked ${atLevel1}`);
  assert.ok(rotationRemaining(s, 'general-store') > 0);

  s.buildings['general-store'].level = MAX_BUILDING_LEVEL;
  s.buildings['general-store'].rotatesAt = 0;
  tickBuildings(s);
  assert.ok(
    s.buildings['general-store'].stock.length > spec.max,
    'a fully grown generalist should carry more than a fresh one could'
  );
});

test('the General Store deals in consumables and raw materials; specialists do not', () => {
  const s = townWithStore();
  const store = s.buildings['general-store'];
  // Its shelf is a roll, so any single rotation may come up empty — what must
  // hold is that it deals in these things at all, and prices whatever it has.
  assert.ok(getBuilding('general-store').sells.length > 0, 'it should deal in consumables');
  for (const offer of store.sells) assert.ok(offer.price > 0, `${offer.id} was priced at ${offer.price}`);
  assert.ok(store.exchange.length > 0, 'and quote a price on raw goods');
  for (const offer of store.exchange) assert.ok(offer.price > 0);

  s.pyreals = 10_000_000;
  s.materials['iron'] = 1000;
  investToOpen(s, 'weaponsmith');
  assert.equal(s.buildings['weaponsmith'].sells.length, 0);
  assert.equal(s.buildings['weaponsmith'].exchange.length, 0);
});

test('exchange rates move every time the shelves turn over', () => {
  const s = townWithStore();
  const first = s.buildings['general-store'].exchange.map((o) => o.price);
  s.buildings['general-store'].rotatesAt = 0;
  tickBuildings(s);
  const second = s.buildings['general-store'].exchange.map((o) => o.price);
  assert.notDeepEqual(first, second, 'rates should not be a fixed price list');
});

test('stock turns over once its clock runs out, and not before', () => {
  const s = createInitialState();
  const t0 = 1_000_000;
  takeTour(s, 'town-hall', t0); // stamp the first delivery against the same clock
  tickBuildings(s, t0);
  const first = s.buildings['general-store'].stock;

  tickBuildings(s, t0 + rotationSeconds(1) * 1000 - 1);
  assert.equal(s.buildings['general-store'].stock, first);

  tickBuildings(s, t0 + rotationSeconds(1) * 1000);
  assert.notEqual(s.buildings['general-store'].stock, first);
});

test('investing shortens the wait for the next delivery', () => {
  assert.ok(rotationSeconds(2) < rotationSeconds(1));
  assert.ok(rotationSeconds(MAX_BUILDING_LEVEL) < rotationSeconds(2));
});

test('opening a business costs pyreals and materials, and refuses when short', () => {
  const s = createInitialState();
  const cost = unlockCost(getBuilding('weaponsmith'), s);

  assert.equal(investToOpen(s, 'weaponsmith'), false); // broke

  s.pyreals = cost.pyreals;
  assert.equal(investToOpen(s, 'weaponsmith'), false); // pyreals but no iron

  s.materials[cost.materialId] = cost.materials;
  assert.equal(investToOpen(s, 'weaponsmith'), true);
  assert.equal(s.pyreals, 0);
  assert.equal(s.materials[cost.materialId], 0);
  assert.ok(s.buildings['weaponsmith'].stock.length > 0);
});

test('the Town Hall makes every investment in town cheaper, including its own', () => {
  const plain = createInitialState();
  const grown = createInitialState();
  grown.buildings['town-hall'].level = MAX_BUILDING_LEVEL;

  // The Hall is open from the start, so even a fresh town gets its level-1 cut;
  // what matters is that investing in it widens the discount.
  assert.ok(investmentDiscount(grown) < investmentDiscount(plain));
  assert.ok(investmentDiscount(plain) <= 1);

  const smith = getBuilding('weaponsmith');
  assert.ok(unlockCost(smith, grown).pyreals < unlockCost(smith, plain).pyreals);
  assert.ok(upgradeCost(smith, 3, grown).pyreals < upgradeCost(smith, 3, plain).pyreals);
});

test('a business perk applies to the hero, and grows as you invest', () => {
  const s = createInitialState();
  s.hero.str = 100; // a percentage perk needs enough base ATK to show past rounding
  const base = derivedStats(s).atk;

  s.buildings['weaponsmith'].level = 1;
  const atLevel1 = derivedStats(s).atk;
  assert.ok(atLevel1 > base, 'the Weaponsmith should add ATK');

  s.buildings['weaponsmith'].level = 5;
  assert.ok(derivedStats(s).atk > atLevel1);
});

test('investment stops at the top', () => {
  const s = createInitialState();
  s.buildings['town-hall'].level = MAX_BUILDING_LEVEL;
  s.pyreals = 10_000_000;
  s.materials['copper'] = 10_000;
  assert.equal(upgradeCost(getBuilding('town-hall'), MAX_BUILDING_LEVEL, s), null);
  assert.equal(investInBuilding(s, 'town-hall'), false);
});

test('investing spends the cost and grows the business', () => {
  const s = createInitialState();
  const cost = upgradeCost(getBuilding('town-hall'), 1, s);
  s.pyreals = cost.pyreals;
  s.materials[cost.materialId] = cost.materials;
  assert.equal(investInBuilding(s, 'town-hall'), true);
  assert.equal(s.buildings['town-hall'].level, 2);
  assert.equal(s.pyreals, 0);
});
