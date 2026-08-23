// Damage types as a thing you choose, and the two item properties that reward
// choosing well.
//
// A War mage picks any of the seven ordinary types per cast. Void is not among
// them: it belongs to Void Magic, and to whatever rare weapon happens to deal it
// — that exclusivity is the point of the school. What a given type is worth
// against a given creature comes from data/species.js, not from a wheel here:
// there is no universal "cold beats fire", only "this thing is soft to cold".
//
//   Rending — an imbue. A weapon that rends a damage type adds a flat bonus to
//             everything it does of that type, scaling with the rending's level.
//   Slayer  — double damage against one species, and nothing at all against the
//             rest. The most swingy property in the game, and the rarest.
//
// Both are boss loot (see game/loot.js rollChampionReward), so they're the
// reason to finish a place rather than farm its first wave.

import { DAMAGE_TYPES } from './regions.js';
import { SPECIES_IDS, speciesLabel, weaknessMultiplier } from './species.js';

// Everything a War Magic caster can throw. Void is deliberately absent.
export const WAR_DAMAGE_TYPES = DAMAGE_TYPES.filter((t) => t !== 'void');
export const VOID_DAMAGE_TYPE = 'void';

// One glyph per damage type, drawn as a square tile in the UI so the picker
// reads as a row of runes rather than seven words.
export const DAMAGE_GLYPHS = {
  bludgeon: '⬤',
  pierce: '▲',
  slash: '⁄',
  acid: '☣',
  cold: '❄',
  fire: '🔥',
  lightning: '⚡',
  void: '◈',
};

export function damageLabel(type) {
  return type ? type[0].toUpperCase() + type.slice(1) : '';
}

export function damageGlyph(type) {
  return DAMAGE_GLYPHS[type] || '?';
}

// --- Rending (imbues) ---

export const MAX_RENDING_LEVEL = 5;
// Per level, as a share of the damage dealt. Level 5 is +50%, which is on the
// order of a species primary weakness — a rending weapon is a second weakness
// you carry with you rather than one you have to go and find.
export const RENDING_PER_LEVEL = 0.1;

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

export function rendingName(damageType, level) {
  const numeral = ROMAN[Math.max(1, Math.min(MAX_RENDING_LEVEL, level))];
  return `${damageLabel(damageType)} Rending ${numeral}`;
}

// The multiplier a weapon's rending contributes, for damage of its own type.
export function rendingMultiplier(imbue, damageType) {
  if (!imbue || imbue.damageType !== damageType) return 1;
  return 1 + Math.max(0, imbue.level) * RENDING_PER_LEVEL;
}

// --- Slayer ---

export const SLAYER_MULT = 2;

export function slayerName(species) {
  return `${speciesLabel(species)} Slayer`;
}

export function slayerMultiplier(slayer, monsterSpecies) {
  return slayer && slayer.species === monsterSpecies ? SLAYER_MULT : 1;
}

// --- Putting it together ---

// Everything that scales one attack of one damage type against one creature:
// the creature's own weakness, the weapon's rending, and its slayer. Multiplied
// rather than added, so a slayer weapon rending the right type into a soft
// species is the spike the whole system is built around.
export function damageTypeMultiplier(damageType, monsterName, monsterSpecies, weapon) {
  const imbue = weapon ? weapon.imbue : null;
  const slayer = weapon ? weapon.slayer : null;
  return (
    weaknessMultiplier(damageType, monsterName) *
    rendingMultiplier(imbue, damageType) *
    slayerMultiplier(slayer, monsterSpecies)
  );
}

// The type that hits this creature hardest with the weapon in hand — what Auto
// casts. Ties break toward the weapon's own rending so the answer is stable
// rather than flickering between two equal types from one cast to the next.
export function bestDamageTypeFor(monsterName, monsterSpecies, weapon, allowed = WAR_DAMAGE_TYPES) {
  let best = allowed[0];
  let bestMult = -Infinity;
  const rendered = weapon && weapon.imbue ? weapon.imbue.damageType : null;
  for (const type of allowed) {
    const mult = damageTypeMultiplier(type, monsterName, monsterSpecies, weapon);
    const beats = mult > bestMult + 1e-9;
    const ties = Math.abs(mult - bestMult) <= 1e-9;
    if (beats || (ties && type === rendered)) {
      best = type;
      bestMult = mult;
    }
  }
  return best;
}

// How the current pick reads next to the attack bar: "Fire · +45% · rending".
export function damageTypeNote(damageType, monsterName, weapon) {
  const parts = [];
  const weak = Math.round((weaknessMultiplier(damageType, monsterName) - 1) * 100);
  if (weak > 0) parts.push(`+${weak}%`);
  const imbue = weapon ? weapon.imbue : null;
  if (imbue && imbue.damageType === damageType) parts.push(`rending +${Math.round(imbue.level * RENDING_PER_LEVEL * 100)}%`);
  return parts.join(' · ');
}

export { SPECIES_IDS };
