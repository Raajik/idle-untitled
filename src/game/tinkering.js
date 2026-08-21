// Tinkering: consumes materials to add or boost an affix on an equipped item.
// No workmanship/success roll — a material either fits the item's slot or it
// doesn't, and applying it always works. Consolidates AC's four tinkering
// skills (Weapon/Armor/Magic Item Tinkering, Alchemy) into one skill.

import { getMaterial, SLOT_MATERIAL_CATEGORY } from '../data/materials.js';
import { AFFIXES } from '../data/items.js';
import { pick, randInt } from '../engine/rng.js';
import { trainSkill } from './skills.js';
import { addLog } from './state.js';

export const TINKER_COST = 3; // units of material consumed per application
const TINKER_XP = 20;

// Which equipped item(s) a given material can be applied to, right now.
export function canTinker(state, slot, materialId) {
  const material = getMaterial(materialId);
  if (!material) return false;
  if (SLOT_MATERIAL_CATEGORY[slot] !== material.category) return false;
  if (!state.equipment[slot]) return false;
  return (state.materials[materialId] || 0) >= TINKER_COST;
}

export function applyTinkering(state, slot, materialId) {
  if (!canTinker(state, slot, materialId)) return false;
  const item = state.equipment[slot];
  const material = getMaterial(materialId);

  state.materials[materialId] -= TINKER_COST;

  const affixDef = pick(AFFIXES);
  const existing = item.affixes.find((a) => a.id === affixDef.id);
  const bump = randInt(affixDef.min, affixDef.max);
  if (existing) {
    existing.value += bump;
    existing.label = affixDef.label(existing.value);
  } else {
    item.affixes.push({ id: affixDef.id, value: bump, label: affixDef.label(bump) });
  }

  trainSkill(state, state.hero.skills.tinkering, 'Tinkering', TINKER_XP);
  addLog(state, `You work ${material.name} into ${item.name}: ${existing ? existing.label : item.affixes[item.affixes.length - 1].label}.`, 'good');
  return true;
}
