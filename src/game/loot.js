// Loot: drop rolls, item generation, rarity rolls, inventory/equip helpers.

import { SLOTS, RARITIES, AFFIXES, BASE_NAMES, PREFIXES, poiItemPower } from '../data/items.js';
import { getPoiById } from '../data/regions.js';
import { monsterStatsForLevel } from '../data/monsterScaling.js';
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

export function generateItem(powerLevel, { luckPct = 0, rarityBoost = 0 } = {}) {
  let rarity = rollRarity(luckPct);
  if (rarityBoost > 0) {
    // bosses: bump rarity up by rarityBoost tiers (capped at Legendary)
    const idx = Math.min(RARITIES.indexOf(rarity) + rarityBoost, RARITIES.length - 1);
    rarity = RARITIES[idx];
  }

  const slot = pick(SLOTS);
  const jitter = 0.9 + Math.random() * 0.2;
  const power = Math.max(1, Math.round(powerLevel * rarity.powerMult * jitter));

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
  };
  for (const a of item.affixes) {
    const def = AFFIXES.find((d) => d.id === a.id);
    a.label = def.label(a.value);
  }
  return item;
}

// Rarity tiers gained from depth alone, on top of any boss bonus.
function depthRarityBoost(depth) {
  if (depth >= 2.5) return 2;
  if (depth >= 1.5) return 1;
  return 0;
}

// Roll a drop for a kill; returns the item or null. Bosses always drop.
export function rollDrop(state, isBoss) {
  const luck = derivedStats(state).luckPct;
  const poi = getPoiById(state.location.poiId);
  const depth = state.progress.poiDepth || 0;
  const avgAtk = poi.monsters.reduce((s, m) => s + monsterStatsForLevel(m.level).atk, 0) / poi.monsters.length;
  const powerLevel = Math.round(poiItemPower(avgAtk) * (1 + depth));
  const rarityBoost = depthRarityBoost(depth) + (isBoss ? 1 : 0);
  if (isBoss) return generateItem(powerLevel, { luckPct: luck, rarityBoost });
  if (!chance(DROP_CHANCE)) return null;
  return generateItem(powerLevel, { luckPct: luck, rarityBoost });
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
