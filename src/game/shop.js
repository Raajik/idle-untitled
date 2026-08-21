// Shop actions: buying from a shop's fixed stock, selling any item back, and
// the Physician's heal service. Not slot-restricted on the sell side — any
// shop can buy back any item — to keep the vendor logic simple for now.

import { getShop } from '../data/shops.js';
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

export function buyItem(state, shopId, stockIndex) {
  const shop = getShop(shopId);
  if (!shop) return false;
  const stock = state.shops[shopId];
  if (!stock || !stock[stockIndex]) return false;
  const item = stock[stockIndex];
  const price = buyPrice(item);
  if (state.pyreals < price) return false;

  state.pyreals -= price;
  stock.splice(stockIndex, 1);
  state.inventory.push(item);
  addLog(state, `Bought ${item.name} from the ${shop.name} for ${price} pyreals.`, 'good');
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

export function healCost(state) {
  const stats = derivedStats(state);
  const missing = Math.max(0, stats.maxHp - state.hero.hp);
  return Math.round(missing * HEAL_COST_PER_MISSING_HP);
}

export function healService(state) {
  const stats = derivedStats(state);
  const cost = healCost(state);
  if (cost <= 0) return false;
  if (state.pyreals < cost) return false;
  state.pyreals -= cost;
  state.hero.hp = stats.maxHp;
  addLog(state, `The Physician tends your wounds for ${cost} pyreals. You feel whole again.`, 'good');
  return true;
}
