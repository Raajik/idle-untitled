// Consumables: the things Alcott presses on you before you leave, and whatever
// you brew or buy later. Unlike gear they don't occupy a slot — they sit in
// `state.consumables` as an id -> charges count and are spent by using them.
//
// Two shapes so far:
//   - `passive: 'autoHeal'` — the kit isn't drunk, it's *used up* by the
//     auto-healing it enables (see game/consumables.js). Owning one with charges
//     left is what makes the toggle available at all.
//   - `buff` — drink it and carry a timed effect (see game/buffs.js). The effect
//     keys are getBonuses() keys from game/hero.js.
//
// `unlocks` names a progress flag the first use sets, which is how a single
// potion opens a whole system up.

export const CONSUMABLES = [
  {
    id: 'healing-kit',
    name: 'Healing Kit',
    rarity: 'Common',
    startingCharges: 50,
    passive: 'autoHeal',
    unlocks: 'autoHealUnlocked',
    desc: 'Bandages, a needle, and a paste that smells worse than the wound. Lets you patch yourself up mid-fight, at the cost of the breath you were using to swing.',
  },
  {
    id: 'stamina-potion',
    name: 'Stamina Potion',
    rarity: 'Common',
    startingCharges: 1,
    unlocks: 'alchemyUnlocked',
    buff: {
      id: 'stamina-tonic',
      name: 'Stamina Tonic',
      seconds: 30 * 60,
      effect: { staminaRegenFlat: 1 },
    },
    desc: 'Bitter, green, and faintly fizzing. Drinking one teaches you more about alchemy than any book would.',
  },
];

export function getConsumable(id) {
  return CONSUMABLES.find((c) => c.id === id) || null;
}

// What a fresh character carries. Alcott hands these over as the intro closes
// (see game/onboarding.js) rather than them being in the starting state, so the
// gift is something that visibly happens.
export const ALCOTT_GIFTS = ['healing-kit', 'stamina-potion'];
