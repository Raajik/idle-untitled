// Tinkering: consumes materials to add or boost a spell on an equipped item.
// No workmanship/success roll — a material either fits the item's slot or it
// doesn't, and applying it always works. Consolidates AC's four tinkering
// skills (Weapon/Armor/Magic Item Tinkering, Alchemy) into one skill. Higher
// Tinkering rank raises the level ceiling of what it can imbue.

import { getMaterial, SLOT_MATERIAL_CATEGORY } from '../data/materials.js';
import { rollSpell, MAX_SPELL_LEVEL } from '../data/spells.js';
import { trainSkill } from './skills.js';
import { addLog } from './state.js';

export const TINKER_COST = 3; // units of material consumed per application
const TINKER_XP = 20;
const MAX_SPELLS_PER_ITEM = 4;

// The highest spell level Tinkering can imbue at a given rank — climbs toward
// MAX_SPELL_LEVEL as the skill approaches rank 100.
function tinkerLevelCeiling(rank) {
  return Math.max(1, Math.min(MAX_SPELL_LEVEL, 1 + Math.floor(rank / 13)));
}

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
  const tinkering = state.hero.skills.tinkering;

  state.materials[materialId] -= TINKER_COST;

  const ceiling = tinkerLevelCeiling(tinkering.rank);
  const rolled = rollSpell(slot, ceiling);
  const existing = rolled && item.spells.find((s) => s.id === rolled.id);
  let resultLabel;

  if (existing) {
    existing.level = Math.min(MAX_SPELL_LEVEL, existing.level + 1);
    const bumped = rollSpell(slot, existing.level);
    if (bumped) {
      existing.value = Math.max(existing.value, bumped.value);
      existing.label = bumped.label;
    }
    resultLabel = existing.label;
  } else if (rolled && item.spells.length < MAX_SPELLS_PER_ITEM) {
    item.spells.push(rolled);
    resultLabel = rolled.label;
  } else if (rolled) {
    // Item's full — boost a random existing spell instead of losing the material's effort.
    const target = item.spells[Math.floor(Math.random() * item.spells.length)];
    target.level = Math.min(MAX_SPELL_LEVEL, target.level + 1);
    resultLabel = target.label;
  } else {
    return false; // slot doesn't roll any spells at all (shouldn't happen given canTinker's check)
  }

  trainSkill(state, tinkering, 'Tinkering', TINKER_XP);
  addLog(state, `You work ${material.name} into ${item.name}: ${resultLabel}.`, 'good');
  return true;
}
