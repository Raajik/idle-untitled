// Shop actions: buying from an unlocked building's rotating stock, selling any
// item back, and the Physician's heal service. Not slot-restricted on the sell
// side — any shop will buy back anything — to keep the vendor logic simple.
//
// Which buildings exist, what they stock, and when that stock rotates all live in
// data/buildings.js + game/buildings.js; this module only moves items and pyreals.

import { getBuilding, buildingBonus, buildingIn } from '../data/buildings.js';
import { getConsumable } from '../data/consumables.js';
import { getMaterial } from '../data/materials.js';
import { grantConsumable } from './consumables.js';
import { isUnlocked } from './buildings.js';
import { itemScore } from './loot.js';
import { derivedStats } from './hero.js';
import { addLog } from './state.js';

const SELL_PRICE_MULT = 3; // pyreals per point of item score
const HEAL_COST_PER_MISSING_HP = 2;

export function buyPrice(item) {
  return Math.round(itemScore(item) * SELL_PRICE_MULT * 1.5); // buy costs more than sell pays
}

export function sellPrice(item) {
  return Math.round(itemScore(item) * SELL_PRICE_MULT);
}

export function buyItem(state, buildingId, stockIndex) {
  const building = getBuilding(buildingId);
  if (!building || !isUnlocked(state, buildingId)) return false;
  const stock = state.buildings[buildingId].stock;
  if (!stock || !stock[stockIndex]) return false;
  const item = stock[stockIndex];
  const price = buyPrice(item);
  if (state.pyreals < price) return false;

  state.pyreals -= price;
  stock.splice(stockIndex, 1);
  state.inventory.push(item);
  addLog(state, `Bought ${item.name} from the ${building.name} for ${price} pyreals.`, 'good');
  return true;
}

export function sellItem(state, itemId) {
  const idx = state.inventory.findIndex((it) => it.id === itemId);
  if (idx === -1) return false;
  const item = state.inventory[idx];
  const price = sellPrice(item);
  state.inventory.splice(idx, 1);
  state.pyreals += price;
  addLog(state, `Sold ${item.name} for ${price} pyreals.`, 'dim');
  return true;
}

// Cost to heal to full, discounted by the Physician's own level (its perk).

// Consumables are bought by the packet: one purchase is however many charges the
// thing comes with, so a Healing Kit is fifty patch-ups rather than one.
export function buyConsumable(state, buildingId, consumableId) {
  const building = getBuilding(buildingId);
  if (!building || !isUnlocked(state, buildingId)) return false;
  const entry = state.buildings[buildingId];
  const offer = (entry.sells || []).find((o) => o.id === consumableId);
  if (!offer || state.pyreals < offer.price) return false;
  const def = getConsumable(consumableId);
  if (!def) return false;

  state.pyreals -= offer.price;
  grantConsumable(state, consumableId);
  if (def.unlocks === 'autoHealUnlocked') state.progress.autoHealUnlocked = true;
  addLog(state, `Bought a ${def.name} from the ${building.name} for ${offer.price} pyreals.`, 'good');
  return true;
}

// Buying raw material outright: slower than farming it, but it turns pyreals —
// which pile up — into the one thing you happen to be short of.
export function buyMaterial(state, buildingId, materialId) {
  const building = getBuilding(buildingId);
  if (!building || !isUnlocked(state, buildingId)) return false;
  const entry = state.buildings[buildingId];
  const offer = (entry.exchange || []).find((o) => o.materialId === materialId);
  if (!offer || state.pyreals < offer.price) return false;
  // Limited stock: you can top up what you're short of, not buy your way past
  // gathering entirely.
  if (offer.stock !== undefined && offer.stock <= 0) return false;
  if (offer.stock !== undefined) offer.stock -= 1;

  state.pyreals -= offer.price;
  state.materials[materialId] = (state.materials[materialId] || 0) + 1;
  const m = getMaterial(materialId);
  addLog(state, `Bought 1 ${m ? m.name : materialId} for ${offer.price} pyreals.`, 'dim');
  return true;
}

export function healCost(state) {
  const stats = derivedStats(state);
  const missing = Math.max(0, stats.maxHp - state.hero.hp);
  const discount = Math.max(0, 1 + buildingBonus(state, 'healCostPct') / 100);
  return Math.round(missing * HEAL_COST_PER_MISSING_HP * discount);
}

export function healService(state) {
  if (!isUnlocked(state, buildingIn(state.location.regionId, 'physician'))) return false;
  const stats = derivedStats(state);
  const cost = healCost(state);
  if (cost <= 0) return false;
  if (state.pyreals < cost) return false;
  state.pyreals -= cost;
  state.hero.hp = stats.maxHp;
  addLog(state, `The Physician tends your wounds for ${cost} pyreals. You feel whole again.`, 'good');
  return true;
}
