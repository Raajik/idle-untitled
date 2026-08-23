// Loot: drop rolls, item generation, rarity rolls, inventory/equip helpers.

import {
  SLOTS,
  RARITIES,
  BASE_NAMES,
  poiItemPower,
  equipSlotsForKind,
  weaponClass,
  weaponDamageFor,
  armourValueFor,
  isSpellOnlySlot,
  itemDamage,
  itemArmour,
} from '../data/items.js';
import {
  getMaterial,
  materialsForSlot,
  SALVAGE_BASE_MIN,
  SALVAGE_BASE_MAX,
  SALVAGE_RARITY_BONUS,
  SALVAGE_GROWTH_PER_RANK,
} from '../data/materials.js';
import { getPoiById, regionIndex } from '../data/regions.js';
import { kindOf, sizeOf } from '../data/bestiary.js';
import { speciesOf, speciesLabel, weaknessesOf } from '../data/species.js';
import { WAR_DAMAGE_TYPES, MAX_RENDING_LEVEL } from '../data/elements.js';
import { gemForDamageType } from './rending.js';
import { monsterStatsForLevel } from '../data/monsterScaling.js';
import { rollSpell, spellLevelCeiling, rollSpellLevel } from '../data/spells.js';
import { pick, pickWeighted, chance, randInt } from '../engine/rng.js';
import { derivedStats } from './hero.js';
// waves.js imports rollChampionReward back from here. The cycle is safe because
// every use on both sides is inside a function, not at module-init time.
import { waveDifficulty, WAVES_PER_POI } from './waves.js';
import { trainSkill, trainAttribute, SALVAGE_ATTR_XP, SALVAGE_SKILL_XP } from './skills.js';

let nextItemId = 1;

// Gear is semi-rare: most kills come up empty.
export const DROP_CHANCE = 0.05;

// Who is actually carrying anything. A drudge has a camp, tools and a belt; a
// rat has a nest. Multiplies DROP_CHANCE, and it's the single biggest reason to
// pick one dungeon over another beyond the material it yields.
export const KIND_DROP_MULT = {
  humanoid: 1.8,
  undead: 1.4, // still wearing what they died in
  construct: 0.5, // things it was built around, not things it owned
  beast: 0.4,
  spirit: 0.3,
};

// What a creature of a given size could plausibly be carrying. Small things are
// capped at jewelry — a ring in a nest is believable, a breastplate is not.
export const SMALL_CREATURE_SLOTS = ['ring', 'bracelet', 'amulet'];

export function dropChanceFor(monsterName) {
  return DROP_CHANCE * (KIND_DROP_MULT[kindOf(monsterName)] ?? 1);
}

// The slots a given creature's corpse can yield, or null for "anything".
export function dropSlotsFor(monsterName) {
  return sizeOf(monsterName) === 'small' ? SMALL_CREATURE_SLOTS : null;
}

export function rollRarity(luckPct = 0) {
  // luck shifts weight from Common toward higher tiers
  const shift = luckPct / 100;
  const table = RARITIES.map((r, i) => ({
    ...r,
    weight: i === 0 ? r.weight * (1 - shift * 0.6) : r.weight * (1 + shift * 1.5),
  }));
  return pickWeighted(table);
}

export function generateItem(powerLevel, { luckPct = 0, rarityBoost = 0, forceSlot = null, forceBaseType = null, depth = 0, regionIdx = 0, preferMaterial = null, slotPool = null } = {}) {
  let rarity = rollRarity(luckPct);
  if (rarityBoost > 0) {
    // deeper waves: bump rarity up by rarityBoost tiers (capped at Legendary)
    const idx = Math.min(RARITIES.indexOf(rarity) + rarityBoost, RARITIES.length - 1);
    rarity = RARITIES[idx];
  }

  const slot = forceSlot || pick(slotPool && slotPool.length ? slotPool : SLOTS);
  const jitter = 0.9 + Math.random() * 0.2;
  const power = Math.max(1, Math.round(powerLevel * rarity.powerMult * jitter));

  // Rarity decides the count outright — no per-slot presence roll on top, so an
  // Uncommon always has at least one spell and a Legendary always has at least
  // four. How GOOD they are is the level, which depth and region still gate.
  const [minSpells, maxSpells] = rarity.spells;
  // Clothing and jewelry have no innate stats — they're worth exactly what's
  // written on them — so they roll toward the top of their rarity's band rather
  // than the middle. A Rare ring with two spells and nothing else was a
  // disappointment in a way a Rare breastplate never was.
  const wanted = isSpellOnlySlot(slot) ? Math.max(minSpells, maxSpells - (Math.random() < 0.35 ? 1 : 0)) : randInt(minSpells, maxSpells);
  const ceiling = spellLevelCeiling(depth, regionIdx);
  const spells = [];
  const taken = new Set();
  for (let i = 0; i < wanted * 4 && spells.length < wanted; i++) {
    const spell = rollSpell(slot, rollSpellLevel(ceiling));
    // One of each kind per item: two Strength spells on one ring reads as a bug
    // even when it isn't, and stacking the same affix is what Tinkering is for.
    if (!spell || taken.has(spell.id + JSON.stringify(spell.meta || {}))) continue;
    taken.add(spell.id + JSON.stringify(spell.meta || {}));
    spells.push(spell);
  }

  const base = forceSlot === 'weapon' && forceBaseType
    ? BASE_NAMES.weapon.find((b) => b.toLowerCase() === forceBaseType) || pick(BASE_NAMES.weapon)
    : pick(BASE_NAMES[slot]);
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
  // Named for what it's made of — "Opal Amulet", "Iron Sword". Rarity is already
  // carried by the item's color and its [Rare amulet] tag, so a second adjective
  // in the name only buried the thing that tells you what it salvages into.
  const materialName = material ? (getMaterial(material) || {}).name : null;
  const item = {
    id: nextItemId++,
    slot,
    rarity: rarity.name,
    power, // kept as the generator's internal scale; nothing user-facing reads it
    spells,
    name: materialName ? `${materialName} ${base}` : base,
    baseType: slot === 'weapon' ? base.toLowerCase() : undefined,
    material,
  };
  // The stat this kind of gear is actually about (see data/items.js).
  if (slot === 'weapon') item.damage = weaponDamageFor(power);
  else if (!isSpellOnlySlot(slot)) item.armour = armourValueFor(slot, power);
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
export function rollDrop(state, monsterName = null) {
  if (!chance(dropChanceFor(monsterName))) return null;
  const luck = derivedStats(state).luckPct;
  const poi = getPoiById(state.location.poiId);
  const depth = waveDifficulty(state.progress.wave);
  const regionIdx = Math.max(0, regionIndex(state.location.regionId));
  const avgAtk = poi.monsters.reduce((s, m) => s + monsterStatsForLevel(m.level).atk, 0) / poi.monsters.length;
  const powerLevel = Math.round(poiItemPower(avgAtk) * (1 + depth));
  const allowed = dropSlotsFor(monsterName);
  return generateItem(powerLevel, {
    luckPct: luck,
    rarityBoost: depthRarityBoost(depth),
    depth,
    regionIdx,
    preferMaterial: poi.gather ? poi.gather.material : null,
    slotPool: allowed,
  });
}

// --- Champion rewards ---
//
// Rending gems and Slayer weapons are what finishing a place is FOR. Farming
// wave one forever should never produce either, so both hang off the full clear
// — the deepest thing you did — rather than off any old kill.
//
// NOTE: these are meant to be boss drops. Bosses aren't spawned yet (their data
// sits unused in data/regions.js, waiting to become POIs of their own), so the
// full clear stands in for the boss it will eventually contain. When boss POIs
// land, this is the function they should call.

export const RENDING_GEM_CHANCE = 0.06; // per full clear
export const SLAYER_CHANCE = 0.02;

// Deeper regions hand out deeper gems.
function rendingLevelFor(regionIdx) {
  const ceiling = Math.max(1, Math.min(MAX_RENDING_LEVEL, 1 + regionIdx));
  return randInt(1, ceiling);
}

// Rolls what a full clear yields beyond its materials. Returns a list of
// { kind, ... } for the caller to log, which is empty most of the time.
export function rollChampionReward(state, poi) {
  const rewards = [];
  const regionIdx = Math.max(0, regionIndex(poi.regionId || state.location.regionId));
  const luck = derivedStats(state).luckPct;
  const luckMult = 1 + luck / 200; // luck helps here too, but only half as much

  if (chance(RENDING_GEM_CHANCE * luckMult)) {
    // The gem is whatever this place's inhabitants are softest to, so a dungeon
    // is a lead on the gem you'd want to fight it with.
    const wanted = pick((poi.monsters || []).map((m) => weaknessesOf(m.name)[0]).filter(Boolean));
    const damageType = wanted ? wanted.damageType : pick(WAR_DAMAGE_TYPES);
    const materialId = gemForDamageType(damageType);
    if (materialId) {
      const qty = 1;
      state.materials[materialId] = (state.materials[materialId] || 0) + qty;
      rewards.push({ kind: 'gem', materialId, damageType, qty });
    }
  }

  if (chance(SLAYER_CHANCE * luckMult)) {
    const target = pick((poi.monsters || []).map((m) => speciesOf(m.name)));
    const depth = waveDifficulty(WAVES_PER_POI);
    const avgAtk = (poi.monsters || []).reduce((sum, m) => sum + monsterStatsForLevel(m.level).atk, 0) / Math.max(1, (poi.monsters || []).length);
    const item = generateItem(Math.round(poiItemPower(avgAtk) * (1 + depth)), {
      luckPct: luck,
      rarityBoost: 2,
      depth,
      regionIdx,
      forceSlot: 'weapon',
    });
    item.slayer = { species: target };
    item.name = `${item.name} of ${speciesLabel(target)} Slaying`;
    // A slayer weapon that also rends is the top of the loot table, so it can
    // happen — rarely, and only in the deeper regions.
    if (regionIdx > 0 && chance(0.25)) {
      const cls = weaponClass(item.baseType);
      const pool = cls === 'magic' ? ['acid', 'cold', 'fire', 'lightning'] : null;
      const damageType = pool ? pick(pool) : null;
      if (damageType) item.imbue = { damageType, level: rendingLevelFor(regionIdx) };
    }
    state.inventory.push(item);
    rewards.push({ kind: 'slayer', item });
  }

  return rewards;
}

// Trophies a monster leaves behind. Each entry rolls independently, so a rat can
// hand over an ordinary tail and a pristine one from the same corpse. Returns
// the ids granted, for the caller to log.
export function rollTrophies(state, monsterDef) {
  const granted = [];
  for (const drop of monsterDef.drops || []) {
    if (drop.chance < 1 && !chance(drop.chance)) continue;
    const qty = drop.qty || 1;
    state.trophies[drop.id] = (state.trophies[drop.id] || 0) + qty;
    granted.push({ id: drop.id, qty });
  }
  return granted;
}

// Rough item "score" for auto-equip and comparison.
// Rough "is this better" number for auto-equip and the comparison arrows. Reads
// the stats a piece actually has rather than the generator's internal scale, so
// a spell-only ring is judged on its spells and a weapon on its damage.
export function itemScore(item) {
  if (!item) return 0;
  let score = 0;
  const damage = itemDamage(item);
  if (damage) score += (damage.min + damage.max) / 2;
  score += itemArmour(item) * 1.5;
  for (const s of item.spells || []) score += s.value * 0.5;
  // A spell-only piece is worth exactly its spells, and an empty one really is
  // worth nothing — but it should still be worth SOMETHING to a shop.
  return Math.max(score, item.power ? 1 : 0);
}

// Where an item of this kind should go: an empty instance if there is one,
// otherwise whichever is currently holding the worst thing — so a second ring
// fills your other hand instead of replacing the first.
export function bestSlotFor(state, kind) {
  const slots = equipSlotsForKind(kind).filter((slot) => slot in state.equipment);
  if (!slots.length) return null;
  const empty = slots.find((slot) => !state.equipment[slot]);
  if (empty) return empty;
  return slots.reduce((worst, slot) =>
    itemScore(state.equipment[slot]) < itemScore(state.equipment[worst]) ? slot : worst
  );
}

export function equipItem(state, itemId) {
  const idx = state.inventory.findIndex((it) => it.id === itemId);
  if (idx === -1) return false;
  const item = state.inventory[idx];
  const slot = bestSlotFor(state, item.slot);
  if (!slot) return false;
  const current = state.equipment[slot];
  state.inventory.splice(idx, 1);
  state.equipment[slot] = item;
  if (current) state.inventory.push(current);
  return true;
}

export function maybeAutoEquip(state, item) {
  if (!state.settings.autoEquip) return false;
  const slot = bestSlotFor(state, item.slot);
  if (!slot) return false;
  const current = state.equipment[slot];
  if (itemScore(item) > itemScore(current)) {
    state.equipment[slot] = item;
    if (current) state.inventory.push(current);
    return true;
  }
  return false;
}

// How much material breaking an item down returns: a base 1-2, plus a little for
// rarity, compounded by the Salvaging skill.
//
// The remainder is settled by a coin flip rather than rounded off. Rounding each
// item on its own quietly erased the first nine ranks of the skill entirely — a
// Common is 1 or 2 material, and round(1 x 1.03^5) is still 1, so early ranks
// bought nothing at all. Carrying the fraction through as a chance means every
// rank is worth something from the first one, and a bagful still comes out to
// the exact average.
export function salvageYield(rarity, salvagingRank) {
  const exact = expectedSalvageYield(rarity, salvagingRank, randInt(SALVAGE_BASE_MIN, SALVAGE_BASE_MAX));
  const whole = Math.floor(exact);
  return Math.max(1, whole + (Math.random() < exact - whole ? 1 : 0));
}

// The average a salvage of this rarity returns at this rank — what the UI should
// quote, since a single roll of salvageYield is only a sample of it.
export function expectedSalvageYield(rarity, salvagingRank, base = (SALVAGE_BASE_MIN + SALVAGE_BASE_MAX) / 2) {
  return (base + (SALVAGE_RARITY_BONUS[rarity] || 0)) * Math.pow(SALVAGE_GROWTH_PER_RANK, salvagingRank);
}

// --- Bulk and automatic salvaging ---

// Breaking down a bagful is one click, but it is emphatically not one salvage:
// each item is processed in turn, so Salvaging ranks up DURING the batch and the
// later items in the same bag come out richer than the earlier ones. That's the
// reason to hoard a backpack and dump it in one go rather than salvaging as you
// walk, and it's why this doesn't just multiply one yield by a count.
//
// `filter` picks which items to take; the default is everything.
// Returns a summary for the caller to log, or null if nothing matched.
export function salvageAll(state, filter = () => true) {
  const doomed = state.inventory.filter(filter);
  if (!doomed.length) return null;

  const startRank = state.hero.skills.salvaging.rank;
  const materials = {};
  let count = 0;
  for (const item of doomed) {
    const result = salvageItem(state, item.id);
    if (!result) continue; // no material to give back (shouldn't happen, but don't count it)
    materials[result.material] = (materials[result.material] || 0) + result.amount;
    count += 1;
  }
  if (!count) return null;
  return { count, materials, ranksGained: state.hero.skills.salvaging.rank - startRank };
}

// Rarities at or below the chosen setting get broken down the moment they drop.
// 'off' is the default: nothing is destroyed without being asked.
export const AUTO_SALVAGE_OFF = 'off';

export function autoSalvageRank(state) {
  const setting = state.settings.autoSalvage;
  if (!setting || setting === AUTO_SALVAGE_OFF) return -1;
  return RARITIES.findIndex((r) => r.name === setting);
}

// Whether a freshly-dropped item should be broken down on the spot. Only ever
// consulted for something that was NOT auto-equipped — auto-salvage must never
// be able to destroy an upgrade.
export function shouldAutoSalvage(state, item) {
  const threshold = autoSalvageRank(state);
  if (threshold < 0 || !item || !item.material) return false;
  const rank = RARITIES.findIndex((r) => r.name === item.rarity);
  return rank >= 0 && rank <= threshold;
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
