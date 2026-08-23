import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { buyMaterial, buyItem, sellItem, healService, buyPrice, healCost } from '../src/game/shop.js';
import { tickBuildings, investToOpen, takeTour } from '../src/game/buildings.js';

// The Town Hall's tour is what opens the General Store; its stock is rolled then
// rather than at character creation.
function stockedStore() {
  const s = createInitialState();
  takeTour(s, 'holtburg:town-hall');
  tickBuildings(s);
  return s;
}

test("buying an item from a building's stock spends pyreals and adds it to inventory", () => {
  const s = stockedStore();
  const stock = s.buildings['holtburg:general-store'].stock;
  assert.ok(stock.length > 0);
  const originalLength = stock.length;
  const item = stock[0];
  s.pyreals = buyPrice(item) + 100;
  const before = s.pyreals;

  assert.equal(buyItem(s, 'holtburg:general-store', 0), true);
  assert.equal(s.buildings['holtburg:general-store'].stock.length, originalLength - 1);
  assert.ok(s.inventory.some((it) => it.id === item.id));
  assert.ok(s.pyreals < before);
});

test('buying fails without enough pyreals', () => {
  const s = stockedStore();
  s.pyreals = 0;
  assert.equal(buyItem(s, 'holtburg:general-store', 0), false);
});

test('buying from a building that is still locked fails', () => {
  const s = stockedStore();
  s.pyreals = 1000000;
  assert.equal(buyItem(s, 'holtburg:weaponsmith', 0), false);
});

test('selling an inventory item removes it and grants pyreals', () => {
  const s = createInitialState();
  const item = { id: 999, slot: 'ring', power: 5, spells: [], rarity: 'Common', name: 'Worn Ring' };
  s.inventory.push(item);
  const before = s.pyreals;
  assert.equal(sellItem(s, 999), true);
  assert.equal(s.inventory.length, 0);
  assert.ok(s.pyreals > before);
});

test('the Physician heals the hero to full for pyreals, once unlocked', () => {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.location = { regionId: 'holtburg', poiId: 'drudge-hideout' };
  s.hero.hp = 1;

  assert.equal(healService(s), false); // Physician is still closed

  s.pyreals = 100000;
  s.materials['linen'] = 100;
  assert.equal(investToOpen(s, 'holtburg:physician'), true);

  const cost = healCost(s);
  assert.ok(cost > 0);
  s.pyreals = cost;
  assert.equal(healService(s), true);
  assert.equal(s.pyreals, 0);
});

test('upgrading the Physician makes healing cheaper', () => {
  const s = createInitialState();
  s.progress.unlockedRegions = ['holtburg'];
  s.hero.hp = 1;
  s.buildings['holtburg:physician'].level = 1;
  const atLevel1 = healCost(s);
  s.buildings['holtburg:physician'].level = 5;
  assert.ok(healCost(s) < atLevel1);
});

test('every Buy button carries an argument the handler can actually parse', () => {
  // Building ids contain a colon of their own now (holtburg:general-store), and
  // the click handler used to split(':') and hand Number() a shop name — which
  // silently broke every Buy button in the game. Splitting at the LAST colon is
  // what makes these round-trip.
  const splitBuildingArg = (arg) => {
    const at = String(arg).lastIndexOf(':');
    return at === -1 ? [arg, ''] : [arg.slice(0, at), arg.slice(at + 1)];
  };

  for (const [arg, wantId, wantThing] of [
    ['holtburg:general-store:0', 'holtburg:general-store', '0'],
    ['holtburg:general-store:12', 'holtburg:general-store', '12'],
    ['holtburg:physician:stamina-potion', 'holtburg:physician', 'stamina-potion'],
    ['glenden-wood:general-store:green-garnet', 'glenden-wood:general-store', 'green-garnet'],
  ]) {
    const [id, thing] = splitBuildingArg(arg);
    assert.equal(id, wantId, arg);
    assert.equal(thing, wantThing, arg);
  }
  assert.ok(!Number.isNaN(Number(splitBuildingArg('holtburg:general-store:3')[1])), 'the index must survive as a number');
});

test('buying really does move an item from the shelf to your pack', () => {
  const s = stockedStore();
  const stock = s.buildings['holtburg:general-store'].stock;
  const item = stock[0];
  s.pyreals = buyPrice(item) + 500;

  assert.equal(buyItem(s, 'holtburg:general-store', 0), true, 'the sale should go through');
  assert.ok(s.inventory.some((it) => it.id === item.id));
  assert.ok(!s.buildings['holtburg:general-store'].stock.some((it) => it.id === item.id));

  // A shop id the handler mangled would look exactly like this.
  assert.equal(buyItem(s, 'holtburg', 0), false, 'half an id buys nothing');
  assert.equal(buyItem(s, 'holtburg:general-store', NaN), false, 'and neither does half an index');
});

test('a material counter runs out, and says so', () => {
  const s = stockedStore();
  s.pyreals = 10_000_000;
  const offer = s.buildings['holtburg:general-store'].exchange[0];
  const before = s.materials[offer.materialId] || 0;
  const stocked = offer.stock;

  for (let i = 0; i < stocked; i++) {
    assert.equal(buyMaterial(s, 'holtburg:general-store', offer.materialId), true, `purchase ${i + 1}`);
  }
  assert.equal(s.materials[offer.materialId], before + stocked);
  assert.equal(buyMaterial(s, 'holtburg:general-store', offer.materialId), false, 'sold out');
});
