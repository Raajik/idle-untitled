import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/game/state.js';
import { getBuilding, rotationSeconds } from '../src/data/buildings.js';
import { getConsumable } from '../src/data/consumables.js';
import { tickBuildings, takeTour, investToOpen } from '../src/game/buildings.js';
import { buyConsumable } from '../src/game/shop.js';
import {
  grantConsumable,
  charges,
  useConsumable,
  toggleAutoDrink,
  isAutoDrink,
  canAutoDrink,
  tickAutoDrink,
  upkeepConsumables,
} from '../src/game/consumables.js';
import { hasBuff } from '../src/game/buffs.js';
import { derivedStats } from '../src/game/hero.js';
import { tickCombat } from '../src/game/combat.js';

const POTION = 'stamina-potion';

function townWithStore() {
  const s = createInitialState();
  takeTour(s, 'town-hall');
  tickBuildings(s);
  return s;
}

// Rotates a shop's shelf `n` times and counts how often each consumable showed.
function shelfCounts(state, buildingId, n) {
  const counts = {};
  const entry = state.buildings[buildingId];
  for (let i = 0; i < n; i++) {
    entry.rotatesAt = 0;
    tickBuildings(state);
    for (const offer of entry.sells) counts[offer.id] = (counts[offer.id] || 0) + 1;
  }
  return counts;
}

test('a stamina potion is plain white stock that lasts half an hour', () => {
  const def = getConsumable(POTION);
  assert.equal(def.rarity, 'Common', 'the basic potion should be white quality');
  assert.equal(def.buff.seconds, 30 * 60);
  assert.deepEqual(def.buff.effect, { staminaRegenFlat: 1 });
});

test('drinking one actually raises stamina regeneration', () => {
  const s = createInitialState();
  assert.equal(derivedStats(s).staminaRegenFlat, 0);

  grantConsumable(s, POTION, 1);
  assert.equal(useConsumable(s, POTION), true);
  assert.equal(derivedStats(s).staminaRegenFlat, 1, 'the tonic should be in the stat bag');
  assert.equal(charges(s, POTION), 0, 'and cost the charge');

  // And it has to reach the tick, not just the stat bag: the same ten seconds
  // should give back more stamina with the tonic up. Passive regen only runs at
  // a POI, so the hero has to actually be somewhere for this to mean anything.
  const drained = () => {
    const h = createInitialState();
    h.progress.unlockedRegions = ['holtburg'];
    h.location = { regionId: 'holtburg', poiId: 'drudge-hideout' };
    h.hero.stamina = 1;
    h.hero.hp = 1000; // nothing here is meant to kill it; keep the fight out of the measurement
    return h;
  };
  const plain = drained();
  for (let i = 0; i < 40; i++) tickCombat(plain, 0.25);
  const tonic = drained();
  grantConsumable(tonic, POTION, 1);
  useConsumable(tonic, POTION);
  for (let i = 0; i < 40; i++) tickCombat(tonic, 0.25);
  assert.ok(tonic.hero.stamina > plain.hero.stamina, `tonic ${tonic.hero.stamina} vs plain ${plain.hero.stamina}`);
});

test('the General Store stocks potions sometimes, not always', () => {
  const s = townWithStore();
  const counts = shelfCounts(s, 'general-store', 400);
  const seen = counts[POTION] || 0;
  assert.ok(seen > 40, `potions turned up only ${seen} times in 400 deliveries`);
  assert.ok(seen < 360, `potions turned up ${seen} times in 400 — that is "always", not "occasionally"`);
});

test('the Physician always has them, which is what opening it buys you', () => {
  const s = townWithStore();
  s.pyreals = 10_000_000;
  s.materials['linen'] = 1000;
  assert.equal(investToOpen(s, 'physician'), true);

  const counts = shelfCounts(s, 'physician', 40);
  assert.equal(counts[POTION], 40, 'the healer should never be out of stock');
  assert.equal(counts['healing-kit'], 40);
});

test('you can buy one from either counter, and it lands in your pack', () => {
  const s = townWithStore();
  s.pyreals = 10_000_000;
  s.materials['linen'] = 1000;
  investToOpen(s, 'physician');

  const before = charges(s, POTION);
  assert.equal(buyConsumable(s, 'physician', POTION), true);
  assert.equal(charges(s, POTION), before + getConsumable(POTION).startingCharges);

  // And the Store sells the same thing when it happens to have it in.
  const store = s.buildings['general-store'];
  store.sells = [{ id: POTION, price: getConsumable(POTION).price }];
  assert.equal(buyConsumable(s, 'general-store', POTION), true);
});

test('a shop with nothing in stock refuses to sell what it does not have', () => {
  const s = townWithStore();
  s.pyreals = 10_000_000;
  s.buildings['general-store'].sells = [];
  assert.equal(buyConsumable(s, 'general-store', POTION), false);
});

test('investing shortens the wait for the next potion delivery', () => {
  const s = townWithStore();
  s.pyreals = 10_000_000;
  s.materials['linen'] = 1000;
  investToOpen(s, 'physician');
  assert.ok(rotationSeconds(s.buildings['physician'].level + 3) < rotationSeconds(1));
  assert.ok(getBuilding('physician').sells.length > 0);
});

test('auto-upkeep keeps a tonic running, one charge at a time', () => {
  const s = createInitialState();
  grantConsumable(s, POTION, 3);
  assert.equal(canAutoDrink(POTION), true);
  assert.equal(toggleAutoDrink(s, POTION), true);
  assert.ok(isAutoDrink(s, POTION));

  tickAutoDrink(s);
  assert.ok(hasBuff(s, 'stamina-tonic'), 'it should drink one straight away');
  assert.equal(charges(s, POTION), 2);

  // While it's running, upkeep must not touch the pack — that is the whole
  // difference from spell auto-cast, which refreshes early.
  for (let i = 0; i < 50; i++) tickAutoDrink(s);
  assert.equal(charges(s, POTION), 2, 'a running tonic should not be topped up');

  s.buffs = [];
  tickAutoDrink(s);
  assert.equal(charges(s, POTION), 1, 'once it lapses, upkeep drinks again');
});

test('auto-upkeep runs dry quietly and stays visible when it does', () => {
  const s = createInitialState();
  grantConsumable(s, POTION, 1);
  toggleAutoDrink(s, POTION);
  tickAutoDrink(s);
  s.buffs = [];
  tickAutoDrink(s);
  assert.equal(charges(s, POTION), 0);
  assert.equal(hasBuff(s, 'stamina-tonic'), false, 'nothing left to drink');

  const listed = upkeepConsumables(s).map((c) => c.id);
  assert.ok(listed.includes(POTION), 'an empty auto-upkeep should still be listed, so it can be switched off');

  assert.equal(toggleAutoDrink(s, POTION), true);
  assert.equal(isAutoDrink(s, POTION), false);
});

test('a dead hero does not drink', () => {
  const s = createInitialState();
  grantConsumable(s, POTION, 1);
  toggleAutoDrink(s, POTION);
  s.hero.dead = true;
  tickAutoDrink(s);
  assert.equal(charges(s, POTION), 1);
});

test('the Healing Kit is not something you can put on drink-upkeep', () => {
  const s = createInitialState();
  assert.equal(canAutoDrink('healing-kit'), false, 'it has its own toggle and is not drunk');
  assert.equal(toggleAutoDrink(s, 'healing-kit'), false);
  assert.equal(isAutoDrink(s, 'healing-kit'), false);
});

test('an empty pack lists nothing to keep up', () => {
  const s = createInitialState();
  assert.deepEqual(upkeepConsumables(s), []);
});
