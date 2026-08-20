// Loot: drop rolls, item generation, rarity rolls, inventory/equip helpers.

import { SLOTS, RARITIES, AFFIXES, BASE_NAMES, PREFIXES, zoneItemPower } from '../data/items.js';
import { pick, pickWeighted, randInt, chance } from '../engine/rng.js';
import { derivedStats } from './hero.js';

let nextItemId = 1;

export const DROP_CHANCE = 0.15;

export function rollRarity(luckPct = 0) {
  // luck shifts weight from Common toward higher tiers
  const shift = luckPct / 100;
  const table = RARITIES.map((r, i) => ({
    ...r,
    weight: i === 0 ? r.weight * (1 - shift * 0.6) : r.weight * (1 + shift * 1.5),
  }));
  return pickWeighted(table);
}

export function generateItem(zoneIndex, { luckPct = 0, rarityBoost = 0 } = {}) {
  let rarity = rollRarity(luckPct);
  if (rarityBoost > 0) {
    // bosses: bump rarity up by rarityBoost tiers (capped at Legendary)
    const idx = Math.min(RARITIES.indexOf(rarity) + rarityBoost, RARITIES.length - 1);
    rarity = RARITIES[idx];
  }

  const slot = pick(SLOTS);
  const jitter = 0.9 + Math.random() * 0.2;
  const power = Math.max(1, Math.round(zoneItemPower(zoneIndex) * rarity.powerMult * jitter));

  const affixes = [];
  const pool = [...AFFIXES];
  for (let i = 0; i < rarity.affixes; i++) {
    if (pool.length === 0) break;
    const idx = randInt(0, pool.length - 1);
    const affixDef = pool.splice(idx, 1)[0];
    affixes.push({ id: affixDef.id, value: randInt(affixDef.min, affixDef.max), label: '' });
  }

  const base = pick(BASE_NAMES[slot]);
  const prefix = pick(PREFIXES[rarity.name]);
  const item = {
    id: nextItemId++,
    slot,
    rarity: rarity.name,
    power,
    affixes,
    name: `${prefix} ${base}`,
    zone: zoneIndex,
  };
  for (const a of item.affixes) {
    const def = AFFIXES.find((d) => d.id === a.id);
    a.label = def.label(a.value);
  }
  return item;
}

// Roll a drop for a kill; returns the item or null. Bosses always drop.
export function rollDrop(state, isBoss) {
  const luck = derivedStats(state).luckPct;
  if (isBoss) return generateItem(state.progress.zone, { luckPct: luck, rarityBoost: 1 });
  if (!chance(DROP_CHANCE)) return null;
  return generateItem(state.progress.zone, { luckPct: luck });
}

// Rough item "score" for auto-equip and comparison.
export function itemScore(item) {
  if (!item) return 0;
  let score = item.power;
  for (const a of item.affixes) score += a.value * 0.5;
  return score;
}

export function equipItem(state, itemId) {
  const idx = state.inventory.findIndex((it) => it.id === itemId);
  if (idx === -1) return false;
  const item = state.inventory[idx];
  const current = state.equipment[item.slot];
  state.inventory.splice(idx, 1);
  state.equipment[item.slot] = item;
  if (current) state.inventory.push(current);
  return true;
}

export function maybeAutoEquip(state, item) {
  if (!state.settings.autoEquip) return false;
  const current = state.equipment[item.slot];
  if (itemScore(item) > itemScore(current)) {
    state.equipment[item.slot] = item;
    if (current) state.inventory.push(current);
    return true;
  }
  return false;
}
