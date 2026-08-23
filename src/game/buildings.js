// Building actions: unlocking, upgrading, and rotating shop stock. The data and
// the cost/perk math live in data/buildings.js; this module owns the parts that
// need the loot generator and the game state.
//
// Stock rotates on wall-clock time (`rotatesAt`, a Date.now() timestamp) rather
// than on ticks, so a shop you left an hour ago has restocked when you come back
// — including across a reload, with no offline simulation needed.

import {
  BUILDINGS,
  buildingIn,
  getBuilding,
  meetsReputation,
  reputationRequired,
  rotationSeconds,
  unlockCost,
  upgradeCost,
  canAfford,
  payCost,
  perkText,
  MAX_BUILDING_LEVEL,
} from '../data/buildings.js';
import { generateItem } from './loot.js';
import { WEAPON_CLASSES } from '../data/items.js';
import { MATERIALS } from '../data/materials.js';
import { getConsumable } from '../data/consumables.js';
import { pick, randInt } from '../engine/rng.js';
import { addLog } from './state.js';
import { rollBounties } from './bounties.js';
import { questKey, getQuest } from '../data/quests.js';
import { grantReputation, openQuestsFor, questForGiver } from './quests.js';

// What the clerk actually says, and the reason the whole town works this way:
// nothing here gets handed to you, it gets invested in.
const TOUR_LINE =
  'The clerk walks you round the ledger. Every trade in Holtburg is somebody\'s business, he says, and a business only grows when somebody puts money into it. "That includes you, now."';



// Shop gear tracks the hero's level so a town stays worth visiting, with a small
// extra bump per building level.
function stockPower(state, level) {
  return Math.max(4, Math.round((4 + state.hero.level * 1.4) * (1 + (level - 1) * 0.08)));
}

function rollForSlot(state, level, slot, weaponFilter, luckPct = 0) {
  const power = stockPower(state, level);
  if (slot === 'weapon' && weaponFilter) {
    const wanted = WEAPON_CLASSES[weaponFilter] || WEAPON_CLASSES.melee;
    return generateItem(power, { forceSlot: 'weapon', forceBaseType: pick(wanted), luckPct });
  }
  return generateItem(power, { forceSlot: slot, luckPct });
}

// A fresh catalog for one building: a random count within its min/max, each item
// rolled from a random one of the slots it deals in.
export function rollBuildingStock(state, building, level) {
  const spec = building.stock;
  if (!spec) return [];
  // A generalist's shelves grow with investment where a specialist's don't —
  // that steeper cost buys quantity and quality, not just a faster caravan.
  const grown = (level - 1) * (spec.perLevel || 0);
  const luckPct = (level - 1) * (spec.luckPerLevel || 0);
  // Either a flat pool (a specialist deals in one thing) or a few per category
  // (a generalist carries a little of each rather than a pile of anything).
  const groups = spec.categories || [{ slots: spec.slots, min: spec.min, max: spec.max, weaponFilter: spec.weaponFilter }];
  const items = [];
  for (const group of groups) {
    const count = randInt(group.min + grown, group.max + grown);
    for (let i = 0; i < count; i++) {
      items.push(rollForSlot(state, level, pick(group.slots), group.weaponFilter ?? spec.weaponFilter, luckPct));
    }
  }
  return items;
}

// What the shop will sell a unit of each material for this rotation. Rates wander
// every restock, so something dear this hour may be cheap the next — a pyreal
// sink with a reason to check back, rather than a fixed price list.
const EXCHANGE_BASE_PRICE = 90;
const EXCHANGE_SWING = 0.55; // +/- this share of the base

// How many KINDS of material are on the counter, and how much of each. A general
// store has what came in on the last cart, not the contents of the earth.
const EXCHANGE_KINDS_BASE = 3;
const EXCHANGE_QTY_MIN = 2;
const EXCHANGE_QTY_MAX = 10;

function rollExchangeRates(level) {
  const invested = 1 - Math.min(0.4, (level - 1) * 0.04); // investing narrows the markup
  const kinds = EXCHANGE_KINDS_BASE + (level - 1);
  // Never rending gems: those are boss loot with one use, and a shop that sold
  // them would undo the reason to finish a dungeon.
  const sellable = MATERIALS.filter((m) => m.category !== 'rending');
  const shuffled = [...sellable].sort(() => Math.random() - 0.5).slice(0, kinds);
  return shuffled.map((m) => ({
    materialId: m.id,
    price: Math.max(5, Math.round(EXCHANGE_BASE_PRICE * (1 + (Math.random() * 2 - 1) * EXCHANGE_SWING) * invested)),
    // Limited stock, which is the point: you can't simply buy your way past
    // gathering, only top up what you're short of.
    stock: randInt(EXCHANGE_QTY_MIN, EXCHANGE_QTY_MAX + (level - 1) * 2),
  }));
}

// Which consumables made it onto the shelf this rotation. Anything below a
// chance of 1 is a thing you check back for, which is what makes the reliable
// stockist worth opening.
function rollShelf(def) {
  return (def.sells || [])
    .filter((offer) => (offer.chance ?? 1) >= 1 || Math.random() < offer.chance)
    .map((offer) => ({ id: offer.id, price: getConsumable(offer.id).price }));
}

function restock(state, def, entry, now, { quiet = false } = {}) {
  const firstRoll = !entry.rotatesAt;
  entry.stock = rollBuildingStock(state, def, entry.level);
  entry.sells = rollShelf(def);
  entry.exchange = def.exchange ? rollExchangeRates(entry.level) : [];
  entry.bounties = def.bounties ? rollBounties(state, def.regionId) : [];
  entry.rotatesAt = now + rotationSeconds(entry.level) * 1000;
  if (!firstRoll && !quiet) addLog(state, `The ${def.name} has restocked.`, 'dim');
}

// Seconds until this building's next restock (0 if it carries nothing that
// turns over). Counts `sells` as well as `stock`, so a shop whose only rotating
// shelf is its potions can still tell you when to come back.
export function rotationRemaining(state, buildingId, now = Date.now()) {
  const def = getBuilding(buildingId);
  const entry = state.buildings[buildingId];
  if (!def || (!def.stock && !def.sells && !def.bounties) || !entry || entry.level === 0) return 0;
  return Math.max(0, (entry.rotatesAt - now) / 1000);
}

// Called every combat tick: rerolls the stock of any unlocked shop whose timer
// has run out. Cheap enough to run unconditionally — it's a handful of timestamp
// comparisons unless something actually rotated.
export function tickBuildings(state, now = Date.now()) {
  for (const def of BUILDINGS) {
    if (!def.stock && !def.sells && !def.exchange && !def.bounties) continue;
    const entry = state.buildings[def.id];
    if (!entry || entry.level === 0) continue;
    if (now >= (entry.rotatesAt || 0)) restock(state, def, entry, now);
  }
}

// The tour is a job like any other: it has a marker on the Town Hall until you
// go and do it, and doing it is what opens the General Store. Registering it as
// a quest rather than as a button buried in a building panel means the "go here
// first" marker is the one consistent way the game points at anything.
export const TOUR_QUEST = 'Ask how the town works';

export function openTownQuests(state, regionId) {
  openQuestsFor(state, regionId);
  const hallId = buildingIn(regionId, 'town-hall');
  const def = getBuilding(hallId);
  if (!def || def.service !== 'tour') return;
  if (state.progress.tookTownTour) {
    state.progress.quests[hallId] = 'done';
    state.progress.quests[questKey('town-tour', regionId)] = 'done';
    return;
  }
  if (!state.progress.quests[hallId]) state.progress.quests[hallId] = 'active';
}

// Whether this building is currently asking for something.
export function buildingHasQuest(state, buildingId) {
  if (state.progress.quests[buildingId] === 'active') return true;
  return !!buildingQuest(state, buildingId);
}

// The quest this building is offering, if any.
export function buildingQuest(state, buildingId) {
  const def = getBuilding(buildingId);
  if (!def) return null;
  return questForGiver(state, def.regionId, def.type);
}

export function buildingQuestText(state, buildingId) {
  const quest = buildingQuest(state, buildingId);
  if (quest) return quest.def.title;
  return state.progress.quests[buildingId] === 'active' ? TOUR_QUEST : null;
}

export function isUnlocked(state, buildingId) {
  const entry = state.buildings[buildingId];
  return !!entry && entry.level > 0;
}

// Opens a business with no money changing hands — the Town Hall's tour does
// this for the General Store.
export function openBuilding(state, buildingId, now = Date.now()) {
  const def = getBuilding(buildingId);
  const entry = def && state.buildings[buildingId];
  if (!entry || entry.level > 0) return false;
  entry.level = 1;
  entry.rotatesAt = 0;
  restock(state, def, entry, now, { quiet: true });
  return true;
}

// The Town Hall's tour: sit through it once and the General Store will deal with
// you. Nothing to pay — the town is selling itself, not the other way round.
export function takeTour(state, buildingId, now = Date.now()) {
  const def = getBuilding(buildingId);
  if (!def || def.service !== 'tour') return false;
  if (!isUnlocked(state, buildingId)) return false;
  if (state.progress.tookTownTour) return false;

  state.progress.tookTownTour = true;
  state.progress.quests[buildingId] = 'done';
  addLog(state, TOUR_LINE, 'good');
  // Sitting through it is itself the hand-in, so it pays like any other job.
  const tourKey = questKey('town-tour', def.regionId);
  if (state.progress.quests[tourKey] !== 'done') {
    state.progress.quests[tourKey] = 'done';
    grantReputation(state, def.regionId, (getQuest('town-tour').rewards || {}).reputation || 0);
  }
  if (def.unlocksOnService && openBuilding(state, def.unlocksOnService, now)) {
    addLog(state, `The ${getBuilding(def.unlocksOnService).name} opens its doors to you.`, 'good');
  }
  return true;
}

export function investToOpen(state, buildingId, now = Date.now()) {
  const def = getBuilding(buildingId);
  const entry = def && state.buildings[buildingId];
  if (!entry || entry.level > 0) return false;
  const cost = unlockCost(def, state);
  if (!cost || !canAfford(state, cost)) return false;
  // Some doors don't open for money. An Archmage doesn't set up shop for a
  // stranger with a full purse (see data/buildings.js needsReputation).
  if (!meetsReputation(state, def)) {
    addLog(state, `The ${def.name} won't deal with you yet — ${reputationRequired(def)} reputation in ${def.regionId} would change that.`, 'dim');
    return false;
  }

  payCost(state, cost);
  openBuilding(state, buildingId, now);
  const perk = perkText(def, 1);
  addLog(state, `You put up the money and the ${def.name} opens its doors${perk ? ` — ${perk}` : ''}.`, 'good');
  return true;
}

export function investInBuilding(state, buildingId, now = Date.now()) {
  const def = getBuilding(buildingId);
  const entry = def && state.buildings[buildingId];
  if (!entry || entry.level === 0 || entry.level >= MAX_BUILDING_LEVEL) return false;
  const cost = upgradeCost(def, entry.level, state);
  if (!canAfford(state, cost)) return false;

  payCost(state, cost);
  entry.level += 1;
  // A fresh catalog on the spot, so the investment is felt immediately.
  restock(state, def, entry, now, { quiet: true });
  const perk = perkText(def, entry.level);
  addLog(state, `Your investment takes — the ${def.name} is a level ${entry.level} business now${perk ? `, ${perk}` : ''}.`, 'good');
  return true;
}
