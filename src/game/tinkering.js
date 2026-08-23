// Tinkering: consumes materials to add or boost a property on an equipped item.
// No workmanship/success roll — a material either fits the item or it doesn't,
// and applying it always works. Consolidates AC's four tinkering skills
// (Weapon/Armor/Magic Item Tinkering, Alchemy) into one skill. Higher Tinkering
// rank raises the level ceiling of what it can imbue.
//
// Weapons follow the recipe table in data/tinkering.js: a material teaches one
// specific property to the class of weapon it suits, so working a blade is a
// choice about what you want it to do. Armor and jewelry have no weapon class to
// key off, so they keep the older behavior of rolling a random applicable spell.

import { getMaterial, SLOT_MATERIAL_CATEGORY } from '../data/materials.js';
import { weaponClass } from '../data/items.js';
import { recipeFor } from '../data/tinkering.js';
import { rollSpell, rollSpellById, MAX_SPELL_LEVEL } from '../data/spells.js';
import { trainSkill, trainAttribute, TINKER_ATTR_XP } from './skills.js';
import { addLog } from './state.js';

// Working the same property in again costs more each time, steeply. The first
// few passes on a weapon are cheap enough to feel free; by the fourth or fifth
// you're weighing another point of Accuracy against a building upgrade out of
// the same pile of material. That trade-off is the point.
export const TINKER_BASE_COST = 3;
const TINKER_COST_GROWTH = 1.7;

// Cost of taking a property from `level` to `level + 1` (level 0 = adding it).
export function tinkerCostAtLevel(level) {
  return Math.ceil(TINKER_BASE_COST * Math.pow(TINKER_COST_GROWTH, Math.max(0, level)));
}
const TINKER_XP = 20;
// Room for every property a weapon class can be taught — magic and melee each
// have five recipes, and a cap below that would mean spending a material on a
// full item and getting something other than what it said on the tin.
export const MAX_SPELLS_PER_ITEM = 5;

// The highest spell level Tinkering can imbue at a given rank — climbs toward
// MAX_SPELL_LEVEL as the skill approaches rank 100.
function tinkerLevelCeiling(rank) {
  // Pitched so a maxed Tinkering skill can just reach MAX_SPELL_LEVEL.
  return Math.max(1, Math.min(MAX_SPELL_LEVEL, 1 + Math.floor(rank / 11)));
}

// What a material would teach the item in this slot, or null if it has nothing
// to offer it. Weapons consult the recipe table; everything else falls back to
// "does this material's category belong on this slot at all".
export function tinkerEffectFor(state, slot, materialId) {
  const item = state.equipment[slot];
  const material = getMaterial(materialId);
  if (!item || !material) return null;
  if (slot === 'weapon') return recipeFor(weaponClass(item.baseType), materialId);
  return SLOT_MATERIAL_CATEGORY[slot] === material.category ? 'any' : null;
}

// What the next application of this material to this slot will cost. For a
// weapon that's exact — the recipe names the property, so we know its current
// level. For armor and jewelry, which still roll randomly, the item's deepest
// existing property stands in, so the curve behaves the same way.
export function tinkerCostFor(state, slot, materialId) {
  const effect = tinkerEffectFor(state, slot, materialId);
  if (!effect) return null;
  const item = state.equipment[slot];
  const level =
    effect === 'any'
      ? item.spells.reduce((max, sp) => Math.max(max, sp.level), 0)
      : (item.spells.find((sp) => sp.id === effect) || { level: 0 }).level;
  return tinkerCostAtLevel(level);
}

// Which equipped item(s) a given material can be applied to, right now.
export function canTinker(state, slot, materialId) {
  const effect = tinkerEffectFor(state, slot, materialId);
  if (!effect) return false;
  if ((state.materials[materialId] || 0) < tinkerCostFor(state, slot, materialId)) return false;
  // A full item can still be deepened, but only in a property it already has.
  const item = state.equipment[slot];
  if (item.spells.length < MAX_SPELLS_PER_ITEM) return true;
  return effect === 'any' || item.spells.some((sp) => sp.id === effect);
}

export function applyTinkering(state, slot, materialId) {
  if (!canTinker(state, slot, materialId)) return false;
  const item = state.equipment[slot];
  const material = getMaterial(materialId);
  const tinkering = state.hero.skills.tinkering;

  const cost = tinkerCostFor(state, slot, materialId);
  const ceiling = tinkerLevelCeiling(tinkering.rank);
  const effect = tinkerEffectFor(state, slot, materialId);
  // A weapon gets exactly the property its material teaches; anything else takes
  // pot luck from the spells its slot can carry.
  const rolled = effect === 'any' ? rollSpell(slot, ceiling) : rollSpellById(effect, ceiling);
  if (!rolled) return false;

  const existing = item.spells.find((sp) => sp.id === rolled.id);
  // Nothing is consumed unless the work actually lands the property asked for —
  // no quietly spending a material to buff something else.
  if (!existing && item.spells.length >= MAX_SPELLS_PER_ITEM) return false;

  state.materials[materialId] -= cost;
  let resultLabel;
  if (existing) {
    existing.level = Math.min(MAX_SPELL_LEVEL, existing.level + 1);
    const bumped = rollSpellById(existing.id, existing.level);
    if (bumped) {
      existing.value = Math.max(existing.value, bumped.value);
      existing.label = bumped.label;
    }
    resultLabel = existing.label;
  } else {
    item.spells.push(rolled);
    resultLabel = rolled.label;
  }

  trainSkill(state, tinkering, 'Tinkering', TINKER_XP);
  trainAttribute(state, 'coord', TINKER_ATTR_XP.coord);
  trainAttribute(state, 'focus', TINKER_ATTR_XP.focus);
  addLog(state, `You work ${cost} ${material.name} into ${item.name}: ${resultLabel}.`, 'good');
  return true;
}
