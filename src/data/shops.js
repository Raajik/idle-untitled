// Holtburg's shops — the "Nearby" panel next to the POI list. Each shop's
// stock is rolled once, at character creation, and stays fixed for the run
// (no regenerating catalog every render). Physician has no stock; it only
// offers the heal-to-full service (see game/shop.js).

import { generateItem } from '../game/loot.js';
import { pick } from '../engine/rng.js';

export const SHOPS = [
  { id: 'weaponsmith', regionId: 'holtburg', name: 'Weaponsmith', slots: ['weapon'], weaponFilter: 'melee' },
  { id: 'bowyer', regionId: 'holtburg', name: 'Bowyer', slots: ['weapon'], weaponFilter: 'ranged' },
  { id: 'armorsmith', regionId: 'holtburg', name: 'Armorsmith', slots: ['armor', 'shield'] },
  { id: 'tailor', regionId: 'holtburg', name: 'Tailor', slots: ['armor'] },
  { id: 'archmage', regionId: 'holtburg', name: 'Archmage', slots: ['amulet'] },
  { id: 'jeweler', regionId: 'holtburg', name: 'Jeweler', slots: ['ring'] },
  { id: 'general-store', regionId: 'holtburg', name: 'General Store', slots: ['weapon', 'armor', 'amulet', 'ring'] },
  { id: 'physician', regionId: 'holtburg', name: 'Physician', slots: [] },
];

const MELEE_BASE_TYPES = ['sword', 'axe', 'mace', 'spear'];
const RANGED_BASE_TYPES = ['bow', 'crossbow'];

const SHOP_STOCK_POWER = 6;
const SHOP_STOCK_PER_SLOT = 2;

function rollForSlot(slot, weaponFilter) {
  if (slot === 'weapon' && weaponFilter) {
    const wanted = weaponFilter === 'ranged' ? RANGED_BASE_TYPES : MELEE_BASE_TYPES;
    return generateItem(SHOP_STOCK_POWER, { forceSlot: 'weapon', forceBaseType: pick(wanted) });
  }
  return generateItem(SHOP_STOCK_POWER, { forceSlot: slot });
}

// Rolls every shop's fixed stock. Called once at character creation (and again
// on rebirth) — not on every render.
export function rollShopStock() {
  const stock = {};
  for (const shop of SHOPS) {
    stock[shop.id] = [];
    for (const slot of shop.slots) {
      for (let i = 0; i < SHOP_STOCK_PER_SLOT; i++) {
        stock[shop.id].push(rollForSlot(slot, shop.weaponFilter));
      }
    }
  }
  return stock;
}

export function getShop(shopId) {
  return SHOPS.find((s) => s.id === shopId) || null;
}
