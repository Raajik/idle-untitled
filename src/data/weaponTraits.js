// What a weapon *type* does that the others don't.
//
// Stances (data/combatStances.js) are the choice you make each fight; traits are
// the choice you made when you picked up the weapon. Every trait is deliberately
// small — one legible sentence, in the same register as Tinkering's "+1 max
// damage" — so a weapon type is a flavour of the same fight rather than a
// different game. Nothing here is a percentage you have to hold in your head:
// each type does exactly one thing.
//
// Fields (all optional, all default to no effect):
//   hitPct        added to the hit chance roll, in points
//   critDmgMult   multiplies the crit multiplier (1.5 = crits hit half again as hard)
//   defIgnorePct  percent of the target's DEF the blow simply doesn't meet
//   dmgMult       flat multiplier on the damage roll
//   speedMult     multiplies the attack interval (below 1 is faster)
//   staminaMult   multiplies the stamina an attack costs
//   alwaysBleed   applies the Devastating stance's Bleed on every stance
//   pierce        how many EXTRA engaged monsters the attack carries through to
//   pierceMult    damage each pierced target takes, as a share of the main hit

export const MELEE_TRAITS = {
  // The generalist's edge: nothing spectacular, lands more often than the rest.
  sword: { hitPct: 6, text: 'Precise — +6% chance to hit.' },
  // Heavy, top-weighted, and vicious when it lands right.
  axe: { critDmgMult: 1.5, text: 'Rending — critical hits do half again as much.' },
  // Doesn't cut armor, goes through it.
  mace: { defIgnorePct: 30, text: "Crushing — ignores 30% of the target's defence." },
  // A thrust opens a hole that keeps bleeding, whatever stance you're in.
  spear: { alwaysBleed: true, text: 'Impaling — every hit bleeds, not just the heaviest swing.' },
  // Fists and the small punching weapons: quick and cheap, but you are hitting
  // things with your hands.
  unarmed: {
    speedMult: 0.75,
    staminaMult: 0.7,
    dmgMult: 0.85,
    text: 'Flurry — 25% faster and cheaper to throw, 15% less damage.',
  },
};

export const RANGED_TRAITS = {
  // Draws and looses in one motion.
  bow: { speedMult: 0.8, dmgMult: 0.9, text: 'Rapid — 20% faster to loose, 10% less damage.' },
  // Slow to crank, and the bolt does not stop at the first thing it meets.
  crossbow: {
    speedMult: 1.25,
    dmgMult: 1.35,
    pierce: 1,
    pierceMult: 0.5,
    text: 'Punching — 25% slower, 35% harder, and the bolt carries through one more.',
  },
};

// Punching weapons train Unarmed: holding a katar is closer to fighting bare
// than it is to swinging a sword, which is what the skill is about.
export const UNARMED_WEAPONS = ['katar', 'cestus', 'nekode'];

export function meleeTrait(baseType) {
  if (!baseType) return MELEE_TRAITS.unarmed; // bare fists
  if (UNARMED_WEAPONS.includes(baseType)) return MELEE_TRAITS.unarmed;
  return MELEE_TRAITS[baseType] || {};
}

export function rangedTrait(baseType) {
  return RANGED_TRAITS[baseType] || {};
}

// The trait governing whatever the hero is swinging, for the mode they're in.
// Magic devices have no traits of their own — the element they cast is the
// choice that matters there (see data/elements.js).
export function traitFor(mode, baseType) {
  if (mode === 'archery') return rangedTrait(baseType);
  if (mode === 'melee') return meleeTrait(baseType);
  return {};
}
