// Building actions: unlocking, upgrading, and rotating shop stock. The data and
// the cost/perk math live in data/buildings.js; this module owns the parts that
// need the loot generator and the game state.
//
// Stock rotates on wall-clock time (`rotatesAt`, a Date.now() timestamp) rather
// than on ticks, so a shop you left an hour ago has restocked when you come back
// — including across a reload, with no offline simulation needed.

import {
  BUILDINGS,
  getBuilding,
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
import { pick, randInt } from '../engine/rng.js';
import { addLog } from './state.js';



// Shop gear tracks the hero's level so a town stays worth visiting, with a small
// extra bump per building level.
function stockPower(state, level) {
  return Math.max(4, Math.round((4 + state.hero.level * 1.4) * (1 + (level - 1) * 0.08)));
}

function rollForSlot(state, level, slot, weaponFilter) {
  const power = stockPower(state, level);
  if (slot === 'weapon' && weaponFilter) {
    const wanted = WEAPON_CLASSES[weaponFilter] || WEAPON_CLASSES.melee;
    return generateItem(power, { forceSlot: 'weapon', forceBaseType: pick(wanted) });
  }
  return generateItem(power, { forceSlot: slot });
}

// A fresh catalog for one building: a random count within its min/max, each item
// rolled from a random one of the slots it deals in.
export function rollBuildingStock(state, building, level) {
  const spec = building.stock;
  if (!spec) return [];
  const count = randInt(spec.min, spec.max);
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push(rollForSlot(state, level, pick(spec.slots), spec.weaponFilter));
  }
  return items;
}

function restock(state, def, entry, now, { quiet = false } = {}) {
  const firstRoll = !entry.rotatesAt;
  entry.stock = rollBuildingStock(state, def, entry.level);
  entry.rotatesAt = now + rotationSeconds(entry.level) * 1000;
  if (!firstRoll && !quiet) addLog(state, `The ${def.name} has restocked.`, 'dim');
}

// Seconds until this building's next restock (0 if it doesn't carry stock).
export function rotationRemaining(state, buildingId, now = Date.now()) {
  const def = getBuilding(buildingId);
  const entry = state.buildings[buildingId];
  if (!def || !def.stock || !entry || entry.level === 0) return 0;
  return Math.max(0, (entry.rotatesAt - now) / 1000);
}

// Called every combat tick: rerolls the stock of any unlocked shop whose timer
// has run out. Cheap enough to run unconditionally — it's a handful of timestamp
// comparisons unless something actually rotated.
export function tickBuildings(state, now = Date.now()) {
  for (const def of BUILDINGS) {
    if (!def.stock) continue;
    const entry = state.buildings[def.id];
    if (!entry || entry.level === 0) continue;
    if (now >= (entry.rotatesAt || 0)) restock(state, def, entry, now);
  }
}

export function isUnlocked(state, buildingId) {
  const entry = state.buildings[buildingId];
  return !!entry && entry.level > 0;
}

export function unlockBuilding(state, buildingId, now = Date.now()) {
  const def = getBuilding(buildingId);
  const entry = def && state.buildings[buildingId];
  if (!entry || entry.level > 0) return false;
  const cost = unlockCost(def);
  if (!canAfford(state, cost)) return false;

  payCost(state, cost);
  entry.level = 1;
  entry.rotatesAt = 0;
  if (def.stock) restock(state, def, entry, now, { quiet: true });
  const perk = perkText(def, 1);
  addLog(state, `The ${def.name} opens its doors to you${perk ? ` — ${perk}` : ''}.`, 'good');
  return true;
}

export function upgradeBuilding(state, buildingId, now = Date.now()) {
  const def = getBuilding(buildingId);
  const entry = def && state.buildings[buildingId];
  if (!entry || entry.level === 0 || entry.level >= MAX_BUILDING_LEVEL) return false;
  const cost = upgradeCost(def, entry.level);
  if (!canAfford(state, cost)) return false;

  payCost(state, cost);
  entry.level += 1;
  // A fresh catalog on the spot, so the shorter rotation is felt immediately.
  if (def.stock) restock(state, def, entry, now, { quiet: true });
  const perk = perkText(def, entry.level);
  addLog(state, `${def.name} upgraded to level ${entry.level}${perk ? ` — now ${perk}` : ''}.`, 'good');
  return true;
}
