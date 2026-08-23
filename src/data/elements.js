// What a spell is made of, and what that's worth against the thing in front of
// you.
//
// A War Magic caster picks their element; a Void caster has exactly one. The
// wheel below is the whole rule: hit something with what it's weak to and you do
// more, hit it with its own element and you do less. That's enough to make the
// choice matter every fight without a table anyone has to memorise — the UI
// reads the answer out per target, and Auto just picks it for you.

import { MAGIC_DAMAGE_TYPES } from './regions.js';

export const CASTABLE_ELEMENTS = MAGIC_DAMAGE_TYPES; // acid, cold, fire, lightning, void

export const WEAK_MULT = 1.25;
export const RESIST_MULT = 0.75;
// An imbued weapon casts its own element better than a bare one does.
export const IMBUE_MULT = 1.15;

// What each kind of monster is soft to. Paired opposites where there's an
// obvious one; everything physical is soft to Void, which is the element that
// answers things a sword already handles poorly.
const WEAKNESS = {
  fire: 'cold',
  cold: 'fire',
  acid: 'lightning',
  lightning: 'acid',
  void: 'fire',
  bludgeon: 'void',
  pierce: 'void',
  slash: 'void',
};

// A monster resists its own element — a fire elemental is not impressed by fire.
export function elementMultiplier(element, monsterDmgType) {
  if (!element || !monsterDmgType) return 1;
  if (element === monsterDmgType) return RESIST_MULT;
  if (WEAKNESS[monsterDmgType] === element) return WEAK_MULT;
  return 1;
}

export function weaknessOf(monsterDmgType) {
  return WEAKNESS[monsterDmgType] || null;
}

// What a weapon is imbued with, if anything. Magic devices take their element
// from the stone or wood they're made of — an Opal Wand throws cold whether or
// not you asked it to, and casting cold through it is the smoothest thing it
// does.
const MATERIAL_IMBUE = {
  'green-garnet': 'acid',
  opal: 'cold',
  moonstone: 'lightning',
  ebony: 'void',
  gold: 'fire',
};

export function imbueOf(item) {
  if (!item || !item.material) return null;
  return MATERIAL_IMBUE[item.material] || null;
}

// Everything that decides how hard one element lands on one target: the wheel,
// plus the bonus for casting through a weapon made for it.
export function elementDamageMult(element, monsterDmgType, imbue) {
  return elementMultiplier(element, monsterDmgType) * (imbue && imbue === element ? IMBUE_MULT : 1);
}

// Auto: whatever hits this target hardest right now. That's usually its
// weakness, but a weapon imbued with something else can beat a bare weakness
// cast, which is the whole reason the choice isn't just "always the weakness".
// Ties go to the imbue, then to the wheel, so the answer is stable rather than
// flickering between two equal elements from one cast to the next.
export function bestElementFor(monsterDmgType, imbue, allowed = CASTABLE_ELEMENTS) {
  let best = allowed[0];
  let bestMult = -Infinity;
  for (const element of allowed) {
    const mult = elementDamageMult(element, monsterDmgType, imbue);
    const beats = mult > bestMult + 1e-9;
    const ties = Math.abs(mult - bestMult) <= 1e-9;
    if (beats || (ties && element === imbue)) {
      best = element;
      bestMult = mult;
    }
  }
  return best;
}

export function elementLabel(element) {
  return element ? element[0].toUpperCase() + element.slice(1) : '';
}

// How the current pick reads on the attack bar: "Fire · weak" / "Cold · resisted".
export function elementNote(element, monsterDmgType, imbue) {
  const mult = elementMultiplier(element, monsterDmgType);
  const parts = [];
  if (mult > 1) parts.push('weak');
  else if (mult < 1) parts.push('resisted');
  if (imbue && imbue === element) parts.push('imbued');
  return parts.join(' · ');
}
