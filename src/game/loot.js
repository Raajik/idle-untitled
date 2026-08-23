// Loot: drop rolls, item generation, rarity rolls, inventory/equip helpers.

import { SLOTS, RARITIES, BASE_NAMES, PREFIXES, poiItemPower } from '../data/items.js';
import {
  materialsForSlot,
  SALVAGE_BASE_MIN,
  SALVAGE_BASE_MAX,
  SALVAGE_RARITY_BONUS,
  SALVAGE_GROWTH_PER_RANK,
} from '../data/materials.js';
import { getPoiById, regionIndex } from '../data/regions.js';
import { monsterStatsForLevel } from '../data/monsterScaling.js';
import { rollSpell, spellLevelCeiling, rollSpellLevel } from '../data/spells.js';
import { pick, pickWeighted, chance, randInt } from '../engine/rng.js';
import { derivedStats } from './hero.js';
import { waveDifficulty } from './waves.js';
import { trainSkill, trainAttribute, SALVAGE_ATTR_XP, SALVAGE_SKILL_XP } from './skills.js';

let nextItemId = 1;

// Gear is semi-rare: most kills come up empty.
export const DROP_CHANCE = 0.05;

// Chance EACH available spell slot on an item actually holds a spell — this is
// what makes "having any spell at all" uncommon on early Common drops.
const SPELL_PRESENCE_CHANCE = { Common: 0.25, Uncommon: 0.45, Rare: 0.65, Epic: 0.85, Legendary: 1.0 };

export function rollRarity(luckPct = 0) {
  // luck shifts weight from Common toward higher tiers
  const shift = luckPct / 100;
  const table = RARITIES.map((r, i) => ({
    ...r,
    weight: i === 0 ? r.weight * (1 - shift * 0.6) : r.weight * (1 + shift * 1.5),
  }));
  return pickWeighted(table);
}

export function generateItem(powerLevel, { luckPct = 0, rarityBoost = 0, forceSlot = null, forceBaseType = null, depth = 0, regionIdx = 0, preferMaterial = null } = {}) {
  let rarity = rollRarity(luckPct);
  if (rarityBoost > 0) {
    // deeper waves: bump rarity up by rarityBoost tiers (capped at Legendary)
    const idx = Math.min(RARITIES.indexOf(rarity) + rarityBoost, RARITIES.length - 1);
    rarity = RARITIES[idx];
  }

  const slot = forceSlot || pick(SLOTS);
  const jitter = 0.9 + Math.random() * 0.2;
  const power = Math.max(1, Math.round(powerLevel * rarity.powerMult * jitter));

  const maxSpellSlots = rarity.affixes; // reuse the rarity table's existing slot-count numbers
  const presenceChance = SPELL_PRESENCE_CHANCE[rarity.name] ?? 0.5;
  const ceiling = spellLevelCeiling(depth, regionIdx);
  const spells = [];
  for (let i = 0; i < maxSpellSlots; i++) {
    if (Math.random() >= presenceChance) continue;
    const level = rollSpellLevel(ceiling);
    const spell = rollSpell(slot, level);
    if (spell) spells.push(spell);
  }

  const base = forceSlot === 'weapon' && forceBaseType
    ? BASE_NAMES.weapon.find((b) => b.toLowerCase() === forceBaseType) || pick(BASE_NAMES.weapon)
    : pick(BASE_NAMES[slot]);
  const prefix = pick(PREFIXES[rarity.name]);
  // Gear found in a dungeon is made of whatever that dungeon yields, so salvaging
  // it feeds the same pile the clear does — but only when the material can
  // actually belong to this slot, or Tinkering's category rules break (see
  // data/materials.js SLOT_MATERIAL_CATEGORY).
  const materialPool = materialsForSlot(slot);
  const material = preferMaterial && materialPool.some((m) => m.id === preferMaterial)
    ? preferMaterial
    : materialPool.length
    ? pick(materialPool).id
    : undefined;
  const item = {
    id: nextItemId++,
    slot,
    rarity: rarity.name,
    power,
    spells,
    name: `${prefix} ${base}`,
    baseType: slot === 'weapon' ? base.toLowerCase() : undefined,
    material,
  };
  return item;
}

// Rarity tiers gained from how deep into a POI's waves the kill happened.
function depthRarityBoost(depth) {
  if (depth >= 0.9) return 2;
  if (depth >= 0.5) return 1;
  return 0;
}

// Roll a drop for a kill; returns the item or null. Later waves drop both more
// powerful and rarer gear, so a full clear is worth more than farming wave 1.
export function rollDrop(state) {
  if (!chance(DROP_CHANCE)) return null;
  const luck = derivedStats(state).luckPct;
  const poi = getPoiById(state.location.poiId);
  const depth = waveDifficulty(state.progress.wave);
  const regionIdx = Math.max(0, regionIndex(state.location.regionId));
  const avgAtk = poi.monsters.reduce((s, m) => s + monsterStatsForLevel(m.level).atk, 0) / poi.monsters.length;
  const powerLevel = Math.round(poiItemPower(avgAtk) * (1 + depth));
  return generateItem(powerLevel, {
    luckPct: luck,
    rarityBoost: depthRarityBoost(depth),
    depth,
    regionIdx,
    preferMaterial: poi.gather ? poi.gather.material : null,
  });
}

// Rough item "score" for auto-equip and comparison.
export function itemScore(item) {
  if (!item) return 0;
  let score = item.power;
  for (const s of item.spells) score += s.value * 0.5;
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

// How much material breaking an item down returns: a base 1-2, plus a little for
// rarity, compounded by the Salvaging skill.
export function salvageYield(rarity, salvagingRank) {
  const base = randInt(SALVAGE_BASE_MIN, SALVAGE_BASE_MAX) + (SALVAGE_RARITY_BONUS[rarity] || 0);
  return Math.max(1, Math.round(base * Math.pow(SALVAGE_GROWTH_PER_RANK, salvagingRank)));
}

// Destroys an unequipped item for a quantity of the raw material it's made from.
// No workmanship/success roll — always succeeds, and always trains Salvaging.
// Returns { name, material, amount } on success (for the caller to log), or
// null if the item isn't in the inventory.
export function salvageItem(state, itemId) {
  const idx = state.inventory.findIndex((it) => it.id === itemId);
  if (idx === -1) return null;
  const item = state.inventory[idx];
  if (!item.material) return null;
  const amount = salvageYield(item.rarity, state.hero.skills.salvaging.rank);
  state.inventory.splice(idx, 1);
  state.materials[item.material] = (state.materials[item.material] || 0) + amount;
  trainAttribute(state, 'str', SALVAGE_ATTR_XP.str);
  trainAttribute(state, 'coord', SALVAGE_ATTR_XP.coord);
  trainAttribute(state, 'focus', SALVAGE_ATTR_XP.focus);
  trainSkill(state, state.hero.skills.salvaging, 'Salvaging', SALVAGE_SKILL_XP);
  return { name: item.name, material: item.material, amount };
}
