// Self-buff spells — the Life Magic side of casting, as opposed to the War Magic
// attack spells in data/combatStances.js. Alcott teaches the first three before
// you leave, which is what makes Life Magic worth having a skill for.
//
// `effect` keys are getBonuses() keys from game/hero.js. Casting one applies a
// timed buff (see game/buffs.js) and trains Life Magic.

export const BUFF_SPELLS = [
  {
    id: 'regeneration',
    name: 'Regeneration',
    manaCost: 8,
    seconds: 30 * 60,
    effect: { hpRegenFlat: 1 },
    desc: 'Knits flesh a little faster than it tears.',
  },
  {
    id: 'rejuvenation',
    name: 'Rejuvenation',
    manaCost: 8,
    seconds: 30 * 60,
    effect: { staminaRegenFlat: 1 },
    desc: 'Your wind comes back quicker than it should.',
  },
  {
    id: 'renewal',
    name: 'Renewal',
    manaCost: 8,
    seconds: 30 * 60,
    effect: { manaRegenFlat: 1 },
    desc: 'The well refills itself while you work.',
  },
];

export function getBuffSpell(id) {
  return BUFF_SPELLS.find((s) => s.id === id) || null;
}

// What Alcott teaches on the way out the door.
export const ALCOTT_TAUGHT_SPELLS = BUFF_SPELLS.map((s) => s.id);
