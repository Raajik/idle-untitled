// Applying a rending gem to a weapon.
//
// A gem is one damage type's worth of edge, and it only goes on a weapon that
// can actually deal that damage. You cannot put Emerald (acid) on a mace — a
// mace hits things, it doesn't dissolve them — so the rule is simply "the gem's
// type must be a type this weapon can deal":
//
//   a physical weapon deals exactly one type, so it takes exactly one gem
//   a casting device throws any of the elements, so it takes any elemental gem
//   Onyx (void) is Void Magic's, and goes on casting devices only
//
// A weapon holds one rending. A second gem of the SAME type deepens it a level
// (to MAX_RENDING_LEVEL); a gem of a different type is refused rather than
// silently replacing work already paid for.

import { RENDING_MATERIALS, getMaterial } from '../data/materials.js';
import { MAX_RENDING_LEVEL, rendingName, damageLabel } from '../data/elements.js';
import { weaponClass } from '../data/items.js';
import { physicalDamageType } from './combat.js';
import { addLog } from './state.js';

// Which gem carries which damage type. The names are Asheron's Call's.
export const RENDING_GEMS = {
  'white-sapphire': 'bludgeon',
  'black-garnet': 'pierce',
  'imperial-topaz': 'slash',
  emerald: 'acid',
  aquamarine: 'cold',
  'red-garnet': 'fire',
  jet: 'lightning',
  onyx: 'void',
};

// Elements a casting device can be given. Physical rendings belong on physical
// weapons even though War Magic can cast those types — the gem goes in the
// weapon, and a wand has no edge to sharpen.
const CASTER_ELEMENTS = ['acid', 'cold', 'fire', 'lightning', 'void'];

export function gemDamageType(materialId) {
  return RENDING_GEMS[materialId] || null;
}

export function gemForDamageType(damageType) {
  return Object.keys(RENDING_GEMS).find((id) => RENDING_GEMS[id] === damageType) || null;
}

export function isRendingGem(materialId) {
  return materialId in RENDING_GEMS;
}

// Every gem this weapon could ever take, whether or not you hold one.
export function gemsForWeapon(weapon) {
  if (!weapon) return [];
  const cls = weaponClass(weapon.baseType);
  if (cls === 'magic') return RENDING_MATERIALS.filter((m) => CASTER_ELEMENTS.includes(RENDING_GEMS[m.id]));
  if (!cls) return [];
  return RENDING_MATERIALS.filter((m) => RENDING_GEMS[m.id] === weaponPhysicalType(weapon));
}

// The one type a physical weapon deals, ignoring any rending already on it —
// otherwise a rent weapon would report its rending as its natural type and only
// ever accept the gem it already has.
function weaponPhysicalType(weapon) {
  return physicalDamageType({ equipment: { weapon: { ...weapon, imbue: null } } });
}

// Why this gem can't go on this weapon, or null if it can.
export function rendingRefusal(state, materialId) {
  const weapon = state.equipment.weapon;
  const damageType = gemDamageType(materialId);
  if (!damageType) return 'That is not a rending gem.';
  if (!weapon) return 'You have no weapon to work it into.';
  if (!gemsForWeapon(weapon).some((m) => m.id === materialId)) {
    const cls = weaponClass(weapon.baseType);
    return cls === 'magic'
      ? `A casting device can't channel ${damageLabel(damageType)}.`
      : `A ${weapon.baseType} deals ${damageLabel(weaponPhysicalType(weapon))} damage — ${damageLabel(damageType)} has nothing to bite on.`;
  }
  if ((state.materials[materialId] || 0) < 1) return `You have no ${(getMaterial(materialId) || {}).name}.`;
  const existing = weapon.imbue;
  if (existing && existing.damageType !== damageType) {
    return `${weapon.name} already rends ${damageLabel(existing.damageType)}.`;
  }
  if (existing && existing.level >= MAX_RENDING_LEVEL) return `${weapon.name} rends as deeply as it can.`;
  return null;
}

export function canApplyRending(state, materialId) {
  return rendingRefusal(state, materialId) === null;
}

// Works one gem into the equipped weapon. Returns the new rending, or null with
// the reason logged — never consumes the gem on a refusal.
export function applyRending(state, materialId) {
  const refusal = rendingRefusal(state, materialId);
  if (refusal) {
    addLog(state, refusal, 'dim');
    return null;
  }
  const weapon = state.equipment.weapon;
  const damageType = gemDamageType(materialId);
  state.materials[materialId] -= 1;
  weapon.imbue = weapon.imbue
    ? { damageType, level: weapon.imbue.level + 1 }
    : { damageType, level: 1 };
  addLog(state, `You work the ${(getMaterial(materialId) || {}).name} into ${weapon.name}. ${rendingName(damageType, weapon.imbue.level)}.`, 'good');
  return weapon.imbue;
}
